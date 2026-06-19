import raw from './questions.json';
import type { Question } from '../types';

export const questions: Question[] = raw as Question[];

export const categories: string[] = Array.from(
  new Set(questions.map((q) => q.category)),
);
