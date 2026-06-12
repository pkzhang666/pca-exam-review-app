import { useCallback, useEffect, useState } from 'react';
import { questions } from '../data/questions';
import type { ProgressMap, QuestionProgress } from '../types';

const STORAGE_KEY = 'pca-exam-review-progress-v1';

const EMPTY_PROGRESS: QuestionProgress = { selected: [], status: 'unanswered' };

function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProgressMap;
  } catch {
    return {};
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressMap>(loadProgress);
  const [hydrated, setHydrated] = useState(false);

  // On mount, prefer progress.json (saved in the project folder) over
  // localStorage so progress travels with the project across machines.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/progress')
      .then((res) => (res.ok ? (res.json() as Promise<ProgressMap>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProgress(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    if (!hydrated) return;
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    }).catch(() => {});
  }, [progress, hydrated]);

  const getProgress = useCallback(
    (id: number): QuestionProgress => progress[id] ?? EMPTY_PROGRESS,
    [progress],
  );

  const toggleOption = useCallback((questionId: number, optionKey: string) => {
    setProgress((prev) => {
      const question = questions.find((q) => q.id === questionId);
      if (!question) return prev;
      const current = prev[questionId] ?? EMPTY_PROGRESS;

      let selected: string[];
      if (question.answerCount === 1) {
        selected = current.selected.includes(optionKey) ? [] : [optionKey];
      } else if (current.selected.includes(optionKey)) {
        selected = current.selected.filter((k) => k !== optionKey);
      } else {
        selected = [...current.selected, optionKey];
      }

      return {
        ...prev,
        [questionId]: { selected, status: 'unanswered' },
      };
    });
  }, []);

  const submitAnswer = useCallback((questionId: number) => {
    setProgress((prev) => {
      const question = questions.find((q) => q.id === questionId);
      if (!question) return prev;
      const current = prev[questionId] ?? EMPTY_PROGRESS;
      if (current.selected.length === 0) return prev;

      const isCorrect =
        current.selected.length === question.correctAnswer.length &&
        current.selected.every((k) => question.correctAnswer.includes(k));

      return {
        ...prev,
        [questionId]: { ...current, status: isCorrect ? 'correct' : 'wrong' },
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setProgress({});
  }, []);

  return { progress, getProgress, toggleOption, submitAnswer, resetProgress };
}
