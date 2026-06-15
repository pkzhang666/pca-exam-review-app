import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config";
import { ChunkResultSchema, GenQuestion } from "./types";
import { PdfChunk } from "./pdf";

function prompt(chunk: PdfChunk): string {
  return [
    `The attached PDF contains pages ${chunk.startPage}-${chunk.endPage} of an exam-preparation document.`,
    "",
    "If these pages already contain exam questions (a question bank, practice test, or dump):",
    "- EXTRACT EVERY question that appears on these pages — reproduce the full question text and all answer options.",
    "- Mark the correct option(s). Use the answer indicated in the source if present; otherwise determine it.",
    "- Do NOT summarize, merge, skip, or cap the count. If the pages contain 30 questions, return 30.",
    "",
    "If instead these pages are prose study/reference material with no pre-written questions:",
    "- Create thorough multiple-choice questions covering the key concepts — as many as the material warrants.",
    "",
    "For every question, regardless of source:",
    "- Provide 3-5 options labelled A, B, C, D (and E if needed).",
    "- Set each option's `correct` flag. Usually exactly one is correct; use multiple only when the question calls for it.",
    "- Write a one-paragraph `explanation` for EVERY option (correct and incorrect) saying why it is right or wrong.",
    "- Give each question a short `category` label.",
    "- Skip pages with no testable content (covers, blank pages, tables of contents). If a chunk has none, return an empty `questions` array.",
  ].join("\n");
}

function mockQuestions(chunk: PdfChunk, n: number): GenQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    category: "Mock",
    text: `Sample question ${i + 1} for pages ${chunk.startPage}-${chunk.endPage}?`,
    options: [
      { key: "A", text: "Correct answer", correct: true, explanation: "Right because it's the mock answer." },
      { key: "B", text: "Wrong answer", correct: false, explanation: "Wrong in the mock data." },
      { key: "C", text: "Another wrong", correct: false, explanation: "Also wrong in the mock data." },
      { key: "D", text: "Yet another", correct: false, explanation: "Still wrong in the mock data." },
    ],
  }));
}

// --- Anthropic provider ----------------------------------------------------

let anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  return (anthropic ??= new Anthropic({ apiKey: config.anthropicApiKey }));
}

async function generateAnthropic(chunk: PdfChunk): Promise<GenQuestion[]> {
  const response = await anthropicClient().messages.parse({
    model: config.model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ChunkResultSchema), effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: chunk.base64 },
          },
          { type: "text", text: prompt(chunk) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    console.warn(`chunk ${chunk.index}: anthropic refused`, response.stop_details);
    return [];
  }
  return response.parsed_output?.questions ?? [];
}

// --- Gemini provider -------------------------------------------------------

let genai: GoogleGenAI | null = null;
function geminiClient(): GoogleGenAI {
  return (genai ??= new GoogleGenAI({ apiKey: config.geminiApiKey }));
}

// Google-schema equivalent of ChunkResultSchema (constrains the JSON output).
const geminiSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          text: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                text: { type: Type.STRING },
                correct: { type: Type.BOOLEAN },
                explanation: { type: Type.STRING },
              },
              required: ["key", "text", "correct", "explanation"],
            },
          },
        },
        required: ["category", "text", "options"],
      },
    },
  },
  required: ["questions"],
};

async function generateGemini(chunk: PdfChunk): Promise<GenQuestion[]> {
  const response = await geminiClient().models.generateContent({
    model: config.geminiModel,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: chunk.base64 } },
          { text: prompt(chunk) },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      // Disable "thinking" so the whole output budget goes to the JSON answer
      // (extraction needs no reasoning), and give it the model's max output.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 65536,
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  const text = response.text;
  if (!text || finishReason !== "STOP") {
    // Surface *why* a chunk produced nothing instead of silently dropping it.
    console.warn(
      `chunk ${chunk.index} (pp ${chunk.startPage}-${chunk.endPage}): gemini finishReason=${finishReason}, textLen=${text?.length ?? 0}, usage=${JSON.stringify(response.usageMetadata ?? {})}`,
    );
    if (!text) return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn(
      `chunk ${chunk.index}: gemini returned unparseable JSON (finishReason=${finishReason}): ${text.slice(0, 200)}`,
    );
    return [];
  }
  const result = ChunkResultSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(`chunk ${chunk.index}: gemini JSON failed schema validation`);
    return [];
  }
  return result.data.questions;
}

// --- dispatch --------------------------------------------------------------

/** Generate questions for one PDF chunk via the configured provider. Returns []
 *  on a soft failure so one bad chunk doesn't sink the whole deck. */
export async function generateForChunk(chunk: PdfChunk): Promise<GenQuestion[]> {
  if (config.mockGeneration) return mockQuestions(chunk, config.questionsPerChunk);
  if (config.provider === "gemini") return generateGemini(chunk);
  if (config.provider === "anthropic") return generateAnthropic(chunk);
  throw new Error("no LLM provider configured: set GEMINI_API_KEY or ANTHROPIC_API_KEY");
}
