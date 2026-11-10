import { useEffect, useState } from 'react';
import { LEVEL_LABELS, LEVELS, TOPICS, topicName, type Level, type TopicId } from '../../../shared/curriculum';
import type { AppState, PracticeReview, SessionDetail, SessionMode } from '../../../shared/types';
import { api } from '../api';

export function NewProblem({ state, onCreated }: { state: AppState; onCreated: (id: string) => Promise<void> }) {
  const levelOf = (topic: TopicId) => state.progress.find((p) => p.topic === topic)?.level ?? 'easy';
  const [topic, setTopic] = useState<TopicId>(state.suggestion.topic);
  const [difficulty, setDifficulty] = useState<Level>(state.suggestion.difficulty);
  const [mode, setMode] = useState<SessionMode>('guided');
  const [now, setNow] = useState(Date.now);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSuggestion = topic === state.suggestion.topic && difficulty === state.suggestion.difficulty;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const start = async (review?: PracticeReview) => {
    setError(null);
    setStatus('Starting…');
    try {
      let created: SessionDetail | null = null;
      await api.newSession(review?.topic ?? topic, review?.difficulty ?? difficulty, {
        status: (d) => setStatus(d.text),
        done: (d) => (created = d.session),
      }, review ? 'independent' : mode, review?.sourceId);
      if (!created) throw new Error('The server finished without creating a session.');
      await onCreated((created as SessionDetail).id);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    }
  };

  return (
    <div className="page narrow new-problem">
      <h1>What are we practising?</h1>
      <p className="lead">
        Start with one idea, get concrete help when you need it, then try a fresh problem on your own.
      </p>
      <fieldset className="practice-modes" disabled={Boolean(status)}>
        <legend>How do you want to practise?</legend>
        <label>
          <input type="radio" name="mode" checked={mode === 'guided'} onChange={() => setMode('guided')} />
          <span>Guided learning<small>Examples, one step at a time, with help when you're stuck.</small></span>
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === 'independent'} onChange={() => setMode('independent')} />
          <span>Independent practice<small>Choose an approach yourself. Switch to teaching help whenever you need it.</small></span>
        </label>
      </fieldset>
      <p className="muted">Suggested topic: {topicName(state.suggestion.topic)}, based on your quiz and independent attempts.</p>
      <div className="pickers">
        <label>
          Topic
          <select
            value={topic}
            disabled={Boolean(status)}
            onChange={(e) => {
              const next = e.target.value as TopicId;
              setTopic(next);
              setDifficulty(levelOf(next));
            }}
          >
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({LEVEL_LABELS[levelOf(t.id)]})
              </option>
            ))}
          </select>
        </label>
        <label>
          Practice level
          <select value={difficulty} disabled={Boolean(status)} onChange={(e) => setDifficulty(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="button primary" onClick={() => start()} disabled={Boolean(status)}>
        {status ? 'Working…' : isSuggestion ? 'Start the suggested problem' : 'Start problem'}
      </button>
      {status && (
        <p className="status-line">
          <span className="spinner" /> {status} This usually takes about a minute.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {state.reviews.length > 0 && (
        <section className="practice-reviews">
          <h2>Revisit what you've learned</h2>
          <p className="muted">Try a different scenario without hints after a break. Reviews start after two days, then seven, then 21 after independent successes.</p>
          <ul className="review-list">
            {state.reviews.map((review) => (
              <li key={review.topic}>
                <p>{review.sourceTitle}</p>
                <div className="row">
                  <span className="muted small">{review.dueAt <= now ? 'Ready to revisit' : `Scheduled for ${new Date(review.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}</span>
                  {review.dueAt <= now && <button className="button small" disabled={Boolean(status)} onClick={() => start(review)}>
                    {state.sessions.some((s) => s.reviewOf === review.sourceId && s.status === 'in_progress') ? 'Resume review' : 'Start independent review'}
                  </button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
