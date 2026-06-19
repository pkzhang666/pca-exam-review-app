import type { FilterOption, ProgressMap, Question } from '../types';

interface SidePanelProps {
  questions: Question[];
  totalCount: number;
  counts: Record<FilterOption, number>;
  progress: ProgressMap;
  filter: FilterOption;
  reviewMode: boolean;
  selectedId: number | null;
  deckName?: string;
  onBack?: () => void;
  onSelect: (id: number) => void;
  onFilterChange: (f: FilterOption) => void;
  onToggleReviewMode: () => void;
  onReset: () => void;
}

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'correct', label: 'Correct' },
  { key: 'wrong', label: 'Wrong' },
];

export function SidePanel({
  questions,
  totalCount,
  counts,
  progress,
  filter,
  reviewMode,
  selectedId,
  deckName,
  onBack,
  onSelect,
  onFilterChange,
  onToggleReviewMode,
  onReset,
}: SidePanelProps) {
  let lastCategory = '';

  return (
    <aside className="side-panel">
      <div className="side-panel-header">
        {onBack && (
          <button type="button" className="back-button" onClick={onBack}>
            ← All decks
          </button>
        )}
        <h1>{deckName ?? 'PCA Exam Review'}</h1>
        <p className="subtitle">
          {deckName ? 'Study deck' : 'Professional Cloud Architect practice questions'}
        </p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{totalCount}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat">
          <span className="stat-value">{counts.correct}</span>
          <span className="stat-label">Correct</span>
        </div>
        <div className="stat">
          <span className="stat-value">{counts.wrong}</span>
          <span className="stat-label">Wrong</span>
        </div>
        <div className="stat">
          <span className="stat-value">{counts.unanswered}</span>
          <span className="stat-label">Unanswered</span>
        </div>
      </div>

      <div className="filters">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`filter-button ${filter === key && !reviewMode ? 'active' : ''}`}
            onClick={() => onFilterChange(key)}
          >
            {label}
            <span className="filter-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`review-button ${reviewMode ? 'active' : ''}`}
        onClick={onToggleReviewMode}
      >
        {reviewMode ? 'Exit Review Mode' : 'Review Wrong Answers'}
      </button>

      <ul className="question-list">
        {questions.length === 0 && (
          <li className="empty-list-message">
            {reviewMode || filter === 'wrong'
              ? 'No wrong answers here yet.'
              : filter === 'correct'
                ? 'No correct answers yet.'
                : filter === 'unanswered'
                  ? 'Everything has been answered!'
                  : 'No questions to show.'}
          </li>
        )}
        {questions.map((q) => {
          const status = progress[q.id]?.status ?? 'unanswered';
          const showHeader = q.category !== lastCategory;
          lastCategory = q.category;
          return (
            <li key={q.id}>
              {showHeader && <div className="category-header">{q.category}</div>}
              <button
                type="button"
                className={`question-list-item ${selectedId === q.id ? 'active' : ''}`}
                onClick={() => onSelect(q.id)}
              >
                <span className={`status-dot ${status}`} aria-hidden="true" />
                <span className="question-list-id">Q{q.id}</span>
                <span className="question-list-text">{q.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="reset-button" onClick={onReset}>
        Reset Progress
      </button>
    </aside>
  );
}
