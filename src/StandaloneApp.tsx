import { useMemo, useState } from 'react';
import './App.css';
import { SidePanel } from './components/SidePanel';
import { QuestionView } from './components/QuestionView';
import { questions } from './data/questions';
import { useProgress } from './hooks/useProgress';
import type { FilterOption } from './types';

/**
 * Self-contained, offline study experience for the Android (Capacitor) build.
 * Reads the bundled (corrected) questions.json and persists progress in
 * localStorage — no backend required. The deck/upload web app lives in App.tsx.
 */
export function StandaloneApp() {
  const { progress, getProgress, toggleOption, submitAnswer, resetProgress } = useProgress();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(questions[0]?.id ?? null);

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
  }, [progress]);

  const effectiveFilter = reviewMode ? 'wrong' : filter;

  const filteredQuestions = useMemo(() => {
    if (effectiveFilter === 'all') return questions;
    return questions.filter((q) => (progress[q.id]?.status ?? 'unanswered') === effectiveFilter);
  }, [progress, effectiveFilter]);

  const selectFromList = (list: typeof questions, current: number | null) => {
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
    if (window.confirm('Reset all saved progress? This cannot be undone.')) {
      resetProgress();
      setFilter('all');
      setReviewMode(false);
      setSelectedId(questions[0]?.id ?? null);
    }
  };

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
