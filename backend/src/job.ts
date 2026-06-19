import { config } from "./config";
import { Question, toQuestion, structuralIssues } from "./types";
import { mapWithConcurrency, splitPdf } from "./pdf";
import { generateForChunk } from "./generate";
import { verifyAndFlag } from "./verify";
import {
  deletePdf,
  downloadPdf,
  incrementChunksDone,
  saveQuestions,
  setChunkTotal,
  setDeckStatus,
} from "./store";

/**
 * Generate a deck's questions from its uploaded PDF and persist them. Runs
 * either inside the Cloud Tasks worker (production) or in-process (local dev,
 * USE_CLOUD_TASKS=false). Throws on transient failure so the caller can decide
 * whether to retry.
 */
export async function runGeneration(deckId: string): Promise<void> {
  const pdf = await downloadPdf(deckId);
  const chunks = await splitPdf(pdf, config.pagesPerChunk);
  await setChunkTotal(deckId, chunks.length);

  const perChunk = await mapWithConcurrency(chunks, config.genConcurrency, async (chunk) => {
    const questions = await generateForChunk(chunk);
    await incrementChunksDone(deckId); // live progress for the UI
    return questions;
  });

  // Drop structurally broken questions (no correct option, <2 options, etc.)
  // before they reach the study UI.
  const questions: Question[] = [];
  let nextId = 1;
  let dropped = 0;
  for (const list of perChunk) {
    for (const gen of list) {
      if (structuralIssues(gen).length > 0) {
        dropped++;
        continue;
      }
      questions.push(toQuestion(gen, nextId++));
    }
  }
  if (dropped > 0) console.warn(`deck ${deckId}: dropped ${dropped} malformed question(s)`);

  if (questions.length === 0) {
    await setDeckStatus(deckId, "failed", {
      error: "No testable content found in the document.",
    });
  } else {
    // Optional second pass: grade each answer key and flag disagreements.
    if (config.verifyAnswers) {
      const { checked, flagged } = await verifyAndFlag(questions);
      console.log(`deck ${deckId}: graded ${checked} answer(s), flagged ${flagged} for review`);
    }
    await saveQuestions(deckId, questions);
  }
  await deletePdf(deckId).catch(() => undefined);
}
