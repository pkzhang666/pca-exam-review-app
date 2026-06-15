import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDeck, getDeckMeta, saveQuestions } from "./store";
import type { DeckMeta, Question } from "./types";

// The original 277-question PCA deck, seeded as a read-only deck shared with all
// users. Resolves from either the compiled (dist/) or tsx (src/) location.
export const BUILTIN_DECK_ID = "pca-builtin";
const QUESTIONS_PATH = resolve(__dirname, "../../src/data/questions.json");

/** Write (or overwrite) the built-in deck. Idempotent. Returns the count. */
export async function seedBuiltinDeck(): Promise<number> {
  if (!existsSync(QUESTIONS_PATH)) {
    throw new Error(`questions file not found at ${QUESTIONS_PATH}`);
  }
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8")) as Question[];

  const meta: DeckMeta = {
    id: BUILTIN_DECK_ID,
    ownerUid: "system",
    ownerEmail: "built-in",
    name: "PCA Exam Review (built-in)",
    sourceFilename: "pca-questions.json",
    pageCount: 0,
    status: "ready",
    visibility: "shared",
    questionCount: questions.length,
    chunksDone: 0,
    chunksTotal: 0,
    createdAt: new Date().toISOString(),
  };

  await createDeck(meta);
  await saveQuestions(BUILTIN_DECK_ID, questions);
  return questions.length;
}

/**
 * Ensure the built-in deck exists, seeding it if missing. Called at startup
 * against the local emulator (whose data is ephemeral) so a restart restores
 * it. No-ops quietly if the questions file isn't present (e.g. prod image).
 */
export async function ensureBuiltinDeck(): Promise<void> {
  try {
    const existing = await getDeckMeta(BUILTIN_DECK_ID);
    if (existing && existing.status === "ready" && existing.questionCount > 0) return;
    const count = await seedBuiltinDeck();
    console.log(`seeded built-in PCA deck (${count} questions)`);
  } catch (err) {
    console.warn(
      `skipped built-in deck seed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
