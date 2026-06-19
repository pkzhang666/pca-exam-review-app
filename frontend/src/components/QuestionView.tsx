import type { Question, QuestionProgress } from '../types';
import { AnswerBreakdown } from './AnswerBreakdown';

interface QuestionViewProps {
  question: Question | null;
  progress: QuestionProgress;
  reviewMode: boolean;
  total?: number;
  hasNext?: boolean;
  onToggleOption: (questionId: number, optionKey: string) => void;
  onSubmit: (questionId: number) => void;
  onNext?: () => void;
}

export function QuestionView({
  question,
  progress,
  reviewMode,
  total,
  hasNext,
  onToggleOption,
  onSubmit,
  onNext,
}: QuestionViewProps) {
  if (!question) {
    return (
      <main className="question-view empty-state">
        <p>Select a question from the list to get started.</p>
      </main>
    );
  }

  const { selected, status } = progress;
  const isMultiSelect = question.answerCount > 1;
  const showBreakdown = reviewMode || status !== 'unanswered';
  const inputType = isMultiSelect ? 'checkbox' : 'radio';

  return (
    <main className="question-view">
      <div className="question-header">
        <span className="badge">{question.category}</span>
        <span className="question-number">
          Question {question.id}
          {total ? ` of ${total}` : ''}
        </span>
        {isMultiSelect && (
          <span className="badge badge-muted">Choose {question.answerCount}</span>
        )}
      </div>

      <h2 className="question-text">{question.text}</h2>

      <div className="options" role={isMultiSelect ? 'group' : 'radiogroup'}>
        {question.options.map((option) => {
          const isSelected = selected.includes(option.key);
          const isCorrectOption = question.correctAnswer.includes(option.key);

          let stateClass = '';
          if (showBreakdown) {
            if (isCorrectOption) stateClass = 'correct';
            else if (isSelected) stateClass = 'incorrect';
          } else if (isSelected) {
            stateClass = 'selected';
          }

          return (
            <label key={option.key} className={`option ${stateClass}`}>
              <input
                type={inputType}
                name={`question-${question.id}`}
                checked={isSelected}
                disabled={reviewMode}
                onChange={() => onToggleOption(question.id, option.key)}
              />
              <span className="option-key">{option.key}</span>
              <span className="option-text">{option.text}</span>
            </label>
          );
        })}
      </div>

      {!reviewMode && (
        <div className="question-actions">
          <button
            type="button"
            className="submit-button"
            disabled={selected.length === 0}
            onClick={() => onSubmit(question.id)}
          >
            Submit
          </button>
          {status !== 'unanswered' && (
            <span className={`status-pill ${status}`}>
              {status === 'correct' ? 'Marked correct' : 'Marked wrong'}
            </span>
          )}
        </div>
      )}

      {showBreakdown && <AnswerBreakdown question={question} progress={progress} />}

      {onNext && (
        <div className="question-nav">
          <button
            type="button"
            className="next-button"
            disabled={!hasNext}
            onClick={onNext}
          >
            Next question →
          </button>
        </div>
      )}
    </main>
  );
}
