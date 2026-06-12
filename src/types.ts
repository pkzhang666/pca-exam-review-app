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
