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
  // Per-option explanations, keyed by option key. Preferred rendering path.
  optionExplanations?: Record<string, string>;
  // Fallback single explanation, used only when optionExplanations is absent.
  explanation?: string;
  // True when the answer/explanation was corrected away from the source dump
  // (which had many wrong or self-contradicting answers).
  corrected?: boolean;
  // Set by the backend answer-grading pass when an independent grader disagreed
  // with this question's answer key. The key is unchanged; this just flags it.
  needsReview?: boolean;
  reviewNote?: string;
}

export type AnswerStatus = 'unanswered' | 'correct' | 'wrong';

export interface QuestionProgress {
  selected: string[];
  status: AnswerStatus;
}

export type ProgressMap = Record<number, QuestionProgress>;

export type FilterOption = 'all' | 'unanswered' | 'correct' | 'wrong';

// --- Decks (server-side) ---------------------------------------------------

export type DeckStatus = 'processing' | 'ready' | 'failed';
export type DeckVisibility = 'private' | 'shared';

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
  createdAt: string;
  error?: string;
}

export interface Deck extends DeckMeta {
  questions: Question[];
}
