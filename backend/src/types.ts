import { z } from "zod";

// ---------------------------------------------------------------------------
// Frontend-facing shapes. These mirror the existing app's src/types.ts so a
// deck's questions drop straight into the study UI with no transform.
// ---------------------------------------------------------------------------

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  id: number;
  category: string;
  text: string;
  options: QuestionOption[];
  answerCount: number;
  correctAnswer: string[];
  optionExplanations: Record<string, string>;
  // Set by the answer-grading pass (VERIFY_ANSWERS) when an independent grader
  // disagrees with the generated answer key. The key is left untouched; the UI
  // surfaces these so a human can double-check.
  needsReview?: boolean;
  reviewNote?: string;
}

export type DeckStatus = "processing" | "ready" | "failed";
export type DeckVisibility = "private" | "shared";

export interface DeckMeta {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  name: string;
  sourceFilename: string;
  pageCount: number;
  status: DeckStatus;
  visibility: DeckVisibility;
  questionCount: number;
  chunksDone: number;
  chunksTotal: number;
  createdAt: string; // ISO 8601
  error?: string;
}

/** A deck plus its questions (questions are stored separately for light lists). */
export interface Deck extends DeckMeta {
  questions: Question[];
}

// --- Study progress (server-side, per user per deck) -----------------------

export type AnswerStatus = "unanswered" | "correct" | "wrong";

export interface QuestionProgress {
  selected: string[];
  status: AnswerStatus;
}

export interface DeckProgress {
  deckId: string;
  uid: string;
  answers: Record<string, QuestionProgress>; // keyed by question id (as string)
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Generation schema. The model returns each option with an inline `correct`
// flag and `explanation`; we fold those into the frontend `Question` shape
// (correctAnswer[] + optionExplanations map) at merge time. Modelling the
// explanations inline avoids an open-ended Record<> in the JSON schema, which
// structured outputs cannot express.
// ---------------------------------------------------------------------------

export const GenOptionSchema = z.object({
  key: z.string().describe("Option letter, e.g. A, B, C, D"),
  text: z.string().describe("The option text"),
  correct: z.boolean().describe("Whether this option is a correct answer"),
  explanation: z
    .string()
    .describe("One paragraph explaining why this option is correct or incorrect"),
});

export const GenQuestionSchema = z.object({
  category: z.string().describe("Short topic/category label for the question"),
  text: z.string().describe("The full question stem"),
  options: z.array(GenOptionSchema).describe("Answer choices, 3-5 of them"),
});

export const ChunkResultSchema = z.object({
  questions: z.array(GenQuestionSchema),
});

export type GenQuestion = z.infer<typeof GenQuestionSchema>;

/** Cheap, deterministic checks that catch malformed questions before they reach
 *  the study UI (e.g. a question with no correct option is unanswerable). Returns
 *  a list of human-readable issues; an empty list means the question is usable. */
export function structuralIssues(gen: GenQuestion): string[] {
  const issues: string[] = [];
  if (!gen.text?.trim()) issues.push("empty question text");
  if (gen.options.length < 2) issues.push("fewer than 2 options");
  const keys = gen.options.map((o) => o.key);
  if (new Set(keys).size !== keys.length) issues.push("duplicate option keys");
  if (!gen.options.some((o) => o.correct)) issues.push("no correct option marked");
  if (gen.options.some((o) => !o.text?.trim())) issues.push("empty option text");
  return issues;
}

/** Fold a model-generated question into the frontend `Question` shape. */
export function toQuestion(gen: GenQuestion, id: number): Question {
  const correctAnswer = gen.options.filter((o) => o.correct).map((o) => o.key);
  const optionExplanations: Record<string, string> = {};
  for (const o of gen.options) optionExplanations[o.key] = o.explanation;
  return {
    id,
    category: gen.category,
    text: gen.text,
    options: gen.options.map(({ key, text }) => ({ key, text })),
    answerCount: correctAnswer.length,
    correctAnswer,
    optionExplanations,
  };
}
