import type { Question, QuestionProgress } from '../types';

interface AnswerBreakdownProps {
  question: Question;
  progress: QuestionProgress;
}

export function AnswerBreakdown({ question, progress }: AnswerBreakdownProps) {
  const { selected, status } = progress;

  const formatList = (keys: string[]) =>
    keys.length === 0
      ? '(none)'
      : keys
          .slice()
          .sort()
          .map((k) => `${k}. ${question.options.find((o) => o.key === k)?.text ?? ''}`)
          .join('\n');

  return (
    <div className="breakdown">
      {status !== 'unanswered' && (
        <div className={`breakdown-banner ${status}`}>
          {status === 'correct' ? 'Correct!' : 'Incorrect'}
        </div>
      )}

      <div className="breakdown-summary">
        <div className="breakdown-summary-item">
          <h3>Your answer</h3>
          <pre>{formatList(selected)}</pre>
        </div>
        <div className="breakdown-summary-item">
          <h3>Correct answer</h3>
          <pre>{formatList(question.correctAnswer)}</pre>
        </div>
      </div>

      <div className="breakdown-options">
        <h3>Explanation</h3>
        {question.options.map((option) => {
          const isCorrect = question.correctAnswer.includes(option.key);
          const wasSelected = selected.includes(option.key);
          return (
            <div
              key={option.key}
              className={`breakdown-option ${isCorrect ? 'is-correct' : 'is-incorrect'}`}
            >
              <div className="breakdown-option-header">
                <span className="breakdown-option-icon" aria-hidden="true">
                  {isCorrect ? '✓' : '✗'}
                </span>
                <span className="breakdown-option-key">{option.key}.</span>
                <span className="breakdown-option-text">{option.text}</span>
                {wasSelected && <span className="breakdown-option-tag">Your choice</span>}
              </div>
              <p className="breakdown-option-explanation">
                {question.optionExplanations[option.key]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
