import { useState } from 'react';
import { LEVELS, TOPICS, topicName, type Level, type TopicId } from '../../../shared/curriculum';
import type { AppState, SessionDetail } from '../../../shared/types';
import { api } from '../api';

export function NewProblem({ state, onCreated }: { state: AppState; onCreated: (id: string) => Promise<void> }) {
  const levelOf = (topic: TopicId) => state.progress.find((p) => p.topic === topic)?.level ?? 'easy';
  const [topic, setTopic] = useState<TopicId>(state.suggestion.topic);
  const [difficulty, setDifficulty] = useState<Level>(state.suggestion.difficulty);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSuggestion = topic === state.suggestion.topic && difficulty === state.suggestion.difficulty;

  const start = async () => {
    setError(null);
    setStatus('Starting…');
    try {
      let created: SessionDetail | null = null;
      await api.newSession(topic, difficulty, {
        status: (d) => setStatus(d.text),
        done: (d) => (created = d.session),
      });
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
        Suggested: <strong>{topicName(state.suggestion.topic)}</strong> at {state.suggestion.difficulty}, your weakest
        topic right now.
      </p>
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
                {t.name} ({levelOf(t.id)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select value={difficulty} disabled={Boolean(status)} onChange={(e) => setDifficulty(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="button primary" onClick={start} disabled={Boolean(status)}>
        {status ? 'Working…' : isSuggestion ? 'Start the suggested problem' : 'Start problem'}
      </button>
      {status && (
        <p className="status-line">
          <span className="spinner" /> {status} This usually takes about a minute.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
