import { useEffect, useState } from 'react';
import { topicName } from '../../../shared/curriculum';
import type { AppState, LearnChatDetail } from '../../../shared/types';
import { api } from '../api';
import { navigate } from '../useRoute';
import { Chat, type Streaming } from './Chat';

export function LearnView({ id, state, onChange }: { id?: string; state: AppState; onChange: () => Promise<void> }) {
  const [chat, setChat] = useState<LearnChatDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!id) {
      setChat(null);
      return;
    }
    if (chat?.id === id) return;
    setChat(null);
    api.learnChat(id).then(setChat, (e: Error) => setError(e.message));
    // Only the route decides which chat to load. A chat that was just created is already in state.
  }, [id]);

  const send = async (text: string) => {
    setError(null);
    setDraft('');
    setPending(text);
    setStreaming({ kind: 'chat', text: '' });
    try {
      let saved: LearnChatDetail | null = null;
      await api.learn(chat?.id, text, {
        delta: (d) => setStreaming((s) => (s ? { ...s, text: s.text + d.text } : s)),
        done: (d) => {
          saved = d.chat;
          setChat(d.chat);
        },
      });
      if (saved && !chat) navigate(`/learn/${(saved as LearnChatDetail).id}`);
      await onChange();
    } catch (e) {
      setError((e as Error).message);
      setDraft(text);
    } finally {
      setPending(null);
      setStreaming(null);
    }
  };

  if (id && !chat) {
    return <div className="page">{error ? <p className="error-text">{error}</p> : 'Loading…'}</div>;
  }

  const weakest = topicName(state.suggestion.topic);
  const starters = [
    `Teach me ${weakest} from the basics, with an example`,
    "What's the difference between BFS and DFS, and when do I pick each?",
    'How do I work out the time complexity of my own code?',
    'What should I study next, based on my levels?',
  ];

  return (
    <div className="session">
      <header className="session-header">
        <div className="session-heading">
          <h1>{chat?.title ?? 'Learn'}</h1>
          <span className="session-meta">Ask anything about data structures, algorithms or interviews</span>
        </div>
      </header>
      {error && (
        <div className="banner" role="alert">
          {error}
          <button className="icon-button small" onClick={() => setError(null)} title="Dismiss">
            ✕
          </button>
        </div>
      )}
      <div className="session-body panel-closed">
        <Chat
          transcribePath="/learn/transcribe"
          messages={chat?.messages ?? []}
          pending={pending}
          streaming={streaming}
          draft={draft}
          setDraft={setDraft}
          busy={Boolean(pending || streaming)}
          onSend={send}
          prompt="Ask a question…"
          intro={
            <div className="learn-intro">
              <h2>What do you want to learn?</h2>
              <p className="lead">
                Claude explains ideas from the ground up, with examples, and knows your level for each topic. Try one of
                these or ask your own.
              </p>
              <div className="starters">
                {starters.map((s) => (
                  <button key={s} className="option" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
