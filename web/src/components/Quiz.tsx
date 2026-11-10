import { useEffect, useState } from 'react';
import { LEVEL_LABELS, topicName } from '../../../shared/curriculum';
import type { QuizQuestion, QuizResult } from '../../../shared/types';
import { api } from '../api';

export function Quiz({ firstTime, onFinish }: { firstTime: boolean; onFinish: () => Promise<void> }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [index, setIndex] = useState(-1);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.quiz().then(setQuestions, (e: Error) => setError(e.message));
  }, []);

  const answer = async (value: string | null) => {
    if (!questions) return;
    const next = { ...answers, [questions[index].id]: value };
    setAnswers(next);
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    try {
      setResult(await api.submitQuiz(next));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) return <div className="page"><p className="error-text">{error}</p></div>;
  if (!questions) return <div className="page">Loading…</div>;

  if (result) {
    const wrong = result.answers.filter((a) => !a.correct);
    return (
      <div className="page">
        <h1>Your starting levels</h1>
        <p className="lead">
          Topics where you got both questions right start at "Build on it". Everything else starts at "Starting point".
          Independent submissions can move your level up; getting help keeps it the same.
        </p>
        <ul className="level-grid">
          {result.perTopic.map((t) => (
            <li key={t.topic}>
              <span>{topicName(t.topic)}</span>
              <span className="muted">{t.correct}/2</span>
              <span className={`pill ${t.level}`}>{LEVEL_LABELS[t.level]}</span>
            </li>
          ))}
        </ul>
        {wrong.length > 0 && (
          <>
            <h2>Worth a look</h2>
            <ul className="review-list">
              {wrong.map((a) => {
                const q = questions.find((q) => q.id === a.id)!;
                return (
                  <li key={a.id}>
                    <p className="review-question">{q.question}</p>
                    <p>
                      <strong>{a.answer}</strong>
                    </p>
                    <p className="muted">{a.explanation}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button className="button primary" onClick={onFinish}>
          Start practising
        </button>
      </div>
    );
  }

  if (index === -1) {
    return (
      <div className="page narrow">
        <h1>{firstTime ? 'Welcome' : 'Retake the quiz'}</h1>
        <p className="lead">
          A quick quiz to find your starting level: {questions.length} questions, two for each of the{' '}
          {questions.length / 2} topics. Pick "I don't know" rather than guessing, so the problems start at the right level.
        </p>
        <div className="row">
          <button className="button primary" onClick={() => setIndex(0)}>
            Start the quiz
          </button>
          {firstTime && (
            <button
              className="button ghost"
              onClick={async () => {
                await api.skipQuiz();
                await onFinish();
              }}
            >
              Skip, and start with the basics
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = questions[index];
  return (
    <div className="page narrow">
      <div className="quiz-progress">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="muted">{topicName(q.topic)}</span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <h2 className="quiz-question">{q.question}</h2>
      <div className="options">
        {q.options.map((o) => (
          <button key={o} className={`option ${answers[q.id] === o ? 'chosen' : ''}`} onClick={() => answer(o)}>
            {o}
          </button>
        ))}
        <button className="option dont-know" onClick={() => answer(null)}>
          I don't know
        </button>
      </div>
      {index > 0 && (
        <button className="button ghost" onClick={() => setIndex(index - 1)}>
          Back
        </button>
      )}
    </div>
  );
}
