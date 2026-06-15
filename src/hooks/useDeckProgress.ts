import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import type { ProgressMap, Question, QuestionProgress } from '../types';

const EMPTY_PROGRESS: QuestionProgress = { selected: [], status: 'unanswered' };

/**
 * Per-deck study progress, persisted server-side. Loads from the API on mount
 * and saves (debounced) on change. Crucially, it also flushes any pending save
 * when the deck unmounts — otherwise an answer made just before navigating back
 * would be lost when the debounce timer is cancelled.
 */
export function useDeckProgress(deckId: string, questions: Question[]) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loaded, setLoaded] = useState(false);

  // Refs let the unmount cleanup read the latest values without re-subscribing.
  const progressRef = useRef<ProgressMap>(progress);
  const loadedRef = useRef(false);
  progressRef.current = progress;

  // Load this deck's progress.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    loadedRef.current = false;
    api
      .getProgress(deckId)
      .then((data) => {
        if (!cancelled) setProgress(data);
      })
      .catch(() => {
        if (!cancelled) setProgress({});
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
          loadedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Debounced save on every change.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      api.putProgress(deckId, progressRef.current).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [progress, loaded, deckId]);

  // Flush on unmount (e.g. navigating back to the deck list) so the most recent
  // change isn't dropped with the debounce timer.
  useEffect(() => {
    return () => {
      if (loadedRef.current) {
        api.putProgress(deckId, progressRef.current).catch(() => {});
      }
    };
  }, [deckId]);

  const getProgress = useCallback(
    (id: number): QuestionProgress => progress[id] ?? EMPTY_PROGRESS,
    [progress],
  );

  const toggleOption = useCallback(
    (questionId: number, optionKey: string) => {
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

        return { ...prev, [questionId]: { selected, status: 'unanswered' } };
      });
    },
    [questions],
  );

  const submitAnswer = useCallback(
    (questionId: number) => {
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
    },
    [questions],
  );

  const resetProgress = useCallback(() => setProgress({}), []);

  return { progress, getProgress, toggleOption, submitAnswer, resetProgress, loaded };
}
