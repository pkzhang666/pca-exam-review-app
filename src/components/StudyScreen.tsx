import { useEffect, useMemo, useState } from 'react';
import { SidePanel } from './SidePanel';
import { QuestionView } from './QuestionView';
import { useDeckProgress } from '../hooks/useDeckProgress';
import * as api from '../api';
import type { Deck, FilterOption, Question } from '../types';

const NO_QUESTIONS: Question[] = [];

interface StudyScreenProps {
  deckId: string;
  onBack: () => void;
}

export function StudyScreen({ deckId, onBack }: StudyScreenProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDeck(null);
    setError(null);
    api
      .getDeck(deckId)
      .then((d) => {
        if (!cancelled) setDeck(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load deck');
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const questions = deck?.questions ?? NO_QUESTIONS;
  const { progress, getProgress, toggleOption, submitAnswer, resetProgress } = useDeckProgress(
    deckId,
    questions,
  );

  const [filter, setFilter] = useState<FilterOption>('all');
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedId(questions[0]?.id ?? null);
  }, [questions]);

  const counts = useMemo(() => {
    const result: Record<FilterOption, number> = {
      all: questions.length,
      unanswered: 0,
      correct: 0,
      wrong: 0,
    };
    for (const q of questions) {
      const status = progress[q.id]?.status ?? 'unanswered';
      result[status] += 1;
    }
    return result;
  }, [progress, questions]);

  const effectiveFilter = reviewMode ? 'wrong' : filter;

  const filteredQuestions = useMemo(() => {
    if (effectiveFilter === 'all') return questions;
    return questions.filter(
      (q) => (progress[q.id]?.status ?? 'unanswered') === effectiveFilter,
    );
  }, [progress, effectiveFilter, questions]);

  const selectFromList = (list: Question[], current: number | null) => {
    if (current !== null && list.some((q) => q.id === current)) return current;
    return list.length > 0 ? list[0].id : null;
  };

  const handleFilterChange = (next: FilterOption) => {
    setFilter(next);
    setReviewMode(false);
    const list =
      next === 'all'
        ? questions
        : questions.filter((q) => (progress[q.id]?.status ?? 'unanswered') === next);
    setSelectedId((current) => selectFromList(list, current));
  };

  const handleToggleReviewMode = () => {
    if (reviewMode) {
      setReviewMode(false);
      setFilter('all');
      setSelectedId((current) => selectFromList(questions, current));
    } else {
      setReviewMode(true);
      setFilter('wrong');
      const wrongList = questions.filter((q) => progress[q.id]?.status === 'wrong');
      setSelectedId((current) => selectFromList(wrongList, current));
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all saved progress for this deck? This cannot be undone.')) {
      resetProgress();
      setFilter('all');
      setReviewMode(false);
      setSelectedId(questions[0]?.id ?? null);
    }
  };

  if (error) {
    return (
      <div className="centered-screen">
        <p className="error-text">Couldn’t load this deck: {error}</p>
        <button type="button" className="primary-button" onClick={onBack}>
          Back to decks
        </button>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="centered-screen">
        <p>Loading deck…</p>
      </div>
    );
  }

  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;

  const currentIndex = filteredQuestions.findIndex((q) => q.id === selectedId);
  const hasNext = currentIndex >= 0 && currentIndex < filteredQuestions.length - 1;
  const handleNext = () => {
    if (hasNext) setSelectedId(filteredQuestions[currentIndex + 1].id);
  };

  return (
    <div className="app">
      <SidePanel
        questions={filteredQuestions}
        totalCount={questions.length}
        counts={counts}
        progress={progress}
        filter={filter}
        reviewMode={reviewMode}
        selectedId={selectedId}
        deckName={deck.name}
        onBack={onBack}
        onSelect={setSelectedId}
        onFilterChange={handleFilterChange}
        onToggleReviewMode={handleToggleReviewMode}
        onReset={handleReset}
      />
      <QuestionView
        question={selectedQuestion}
        progress={getProgress(selectedQuestion?.id ?? -1)}
        reviewMode={reviewMode}
        total={questions.length}
        hasNext={hasNext}
        onToggleOption={toggleOption}
        onSubmit={submitAnswer}
        onNext={handleNext}
      />
    </div>
  );
}
