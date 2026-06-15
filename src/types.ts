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
