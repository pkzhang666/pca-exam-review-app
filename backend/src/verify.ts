import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config";
import { Question } from "./types";
import { mapWithConcurrency } from "./pdf";

// The grader independently re-derives each question's answer (it never sees the
// generated answer key, to avoid rubber-stamping it), then we compare in code.
const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.number().describe("The id of the question being graded"),
      correctKeys: z
        .array(z.string())
        .describe("Option letter(s) you independently determine are correct, e.g. ['B'] or ['A','C']"),
      confidence: z
        .enum(["high", "medium", "low"])
        .describe("Your confidence in this answer"),
      reasoning: z.string().describe("One sentence justifying the correct answer"),
    }),
  ),
});

type Verdict = z.infer<typeof VerdictSchema>["verdicts"][number];

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  return (client ??= new Anthropic({ apiKey: config.anthropicApiKey }));
}

function gradePrompt(batch: Question[]): string {
  const blocks = batch.map((q) => {
    const opts = q.options.map((o) => `  ${o.key}. ${o.text}`).join("\n");
    return `Question id ${q.id}${q.answerCount > 1 ? ` (choose ${q.answerCount})` : ""}:\n${q.text}\n${opts}`;
  });
  return [
    "You are an exam answer-key checker. For each multiple-choice question below,",
    "independently determine the correct option(s) from your own knowledge — do not",
    "assume any option is correct just because it is listed first or looks plausible.",
    "Return the correct option letter(s) for each question id, your confidence, and a",
    "one-sentence justification. If a question is ambiguous or you are unsure, say so",
    "and use 'low' confidence.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

async function gradeBatch(batch: Question[]): Promise<Verdict[]> {
  try {
    const res = await anthropic().messages.parse({
      model: config.verifyModel,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(VerdictSchema), effort: "high" },
      messages: [{ role: "user", content: gradePrompt(batch) }],
    });
    if (res.stop_reason === "refusal") {
      console.warn(`verify: grader refused a batch (${res.stop_details})`);
      return [];
    }
    return res.parsed_output?.verdicts ?? [];
  } catch (err) {
    // A grading failure must never sink a deck — leave the batch unverified.
    console.warn(`verify: grading batch failed, leaving unverified:`, err);
    return [];
  }
}

function sameAnswer(a: string[], b: Set<string>): boolean {
  return a.length === b.size && a.every((k) => b.has(k));
}

/**
 * Grade each question's answer key with an independent Claude pass and mark
 * (without changing) any whose key the grader disagrees with. Mutates the
 * questions in place. Returns counts for logging.
 */
export async function verifyAndFlag(
  questions: Question[],
): Promise<{ checked: number; flagged: number }> {
  if (!config.anthropicApiKey) {
    console.warn("VERIFY_ANSWERS is on but ANTHROPIC_API_KEY is unset — skipping verification");
    return { checked: 0, flagged: 0 };
  }

  const batches: Question[][] = [];
  for (let i = 0; i < questions.length; i += config.verifyBatchSize) {
    batches.push(questions.slice(i, i + config.verifyBatchSize));
  }

  const byId = new Map(questions.map((q) => [q.id, q]));
  const results = await mapWithConcurrency(batches, config.verifyConcurrency, gradeBatch);

  let checked = 0;
  let flagged = 0;
  for (const verdicts of results) {
    for (const v of verdicts) {
      const q = byId.get(v.id);
      if (!q) continue;
      checked++;
      // Only consider keys that are actually options on this question.
      const graderKeys = new Set(v.correctKeys.filter((k) => q.options.some((o) => o.key === k)));
      const agrees = sameAnswer(q.correctAnswer, graderKeys);
      // Don't flag on low confidence — too noisy to be useful.
      if (!agrees && graderKeys.size > 0 && v.confidence !== "low") {
        q.needsReview = true;
        q.reviewNote =
          `Independent grader chose ${[...graderKeys].sort().join(", ")} ` +
          `(answer key says ${[...q.correctAnswer].sort().join(", ")}; ` +
          `confidence: ${v.confidence}). ${v.reasoning}`;
        flagged++;
      }
    }
  }
  return { checked, flagged };
}
