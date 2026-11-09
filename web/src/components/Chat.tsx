import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, MessageKind } from '../../../shared/types';
import { useVoice } from '../useVoice';
import { Icon } from './Icons';

export interface Streaming {
  kind: MessageKind;
  text: string;
}

const LABELS: Partial<Record<MessageKind, string>> = { feedback: 'Feedback', walkthrough: 'Walkthrough' };

function Message({ role, kind, content, streaming }: { role: 'user' | 'assistant'; kind: MessageKind; content: string; streaming?: boolean }) {
  if (kind === 'event') return <div className="event-pill">{content}</div>;
  if (role === 'user') return <div className="user-bubble">{content}</div>;
  const label = LABELS[kind];
  return (
    <div className={`assistant-message ${label ? 'card' : ''} ${streaming ? 'streaming' : ''}`}>
      {label && <div className="card-label">{label}</div>}
      {content ? <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown> : <span className="thinking">Thinking…</span>}
    </div>
  );
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest('.monaco-editor')) return true;
  const tag = el.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function Chat({
  sessionId,
  messages,
  pending,
  streaming,
  draft,
  setDraft,
  busy,
  onSend,
  hintsUsed,
}: {
  sessionId: string;
  messages: ChatMessage[];
  pending: string | null;
  streaming: Streaming | null;
  draft: string;
  setDraft: (text: string) => void;
  busy: boolean;
  onSend: (text: string) => void;
  hintsUsed: number;
}) {
  const list = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const base = useRef('');
  const [review, setReview] = useState(() => localStorage.getItem('voiceReview') === 'true');

  useEffect(() => localStorage.setItem('voiceReview', String(review)), [review]);

  const combine = (spoken: string) => [base.current, spoken].filter(Boolean).join(base.current.endsWith(' ') ? '' : ' ');

  const speech = useVoice({
    sessionId,
    onText: (spoken) => setDraft(combine(spoken)),
    onDone: (spoken) => {
      const text = combine(spoken).trim();
      if (!spoken.trim()) return;
      if (review || busy) {
        setDraft(text);
        textarea.current?.focus();
      } else {
        onSend(text);
      }
    },
  });

  const startTalking = () => {
    if (busy || speech.state !== 'idle') return;
    base.current = draft;
    speech.start();
  };

  useEffect(() => {
    if (!speech.supported) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditable(document.activeElement)) return;
      e.preventDefault();
      startTalking();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && speech.state === 'listening') {
        e.preventDefault();
        speech.stop();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  useLayoutEffect(() => {
    const el = list.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending, streaming]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const send = () => {
    if (!draft.trim() || busy) return;
    onSend(draft.trim());
  };

  return (
    <section className="chat">
      <div
        className="message-list"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="message-column">
          {messages.map((m) => (
            <Message key={m.id} role={m.role} kind={m.kind} content={m.content} />
          ))}
          {pending && <Message role="user" kind="chat" content={pending} />}
          {streaming && <Message role="assistant" kind={streaming.kind} content={streaming.text} streaming />}
        </div>
      </div>
      <div className="composer-wrap">
        <div className={`composer ${speech.state === 'listening' ? 'listening' : ''}`}>
          <textarea
            ref={textarea}
            rows={1}
            value={draft}
            placeholder={
              speech.state === 'listening'
                ? 'Listening…'
                : speech.state === 'transcribing'
                  ? 'Transcribing…'
                  : speech.supported
                    ? 'Talk it through… (hold Space to speak)'
                    : 'Talk it through…'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape') textarea.current?.blur();
            }}
          />
          <div className="composer-actions">
            <button
              className={`icon-button mic ${speech.state === 'listening' ? 'on' : ''}`}
              disabled={!speech.supported || busy || speech.state === 'transcribing'}
              title={speech.supported ? 'Hold to talk' : 'Voice input needs Whisper installed, or Chrome or Safari'}
              onPointerDown={(e) => {
                e.preventDefault();
                startTalking();
              }}
              onPointerUp={() => speech.stop()}
              onPointerLeave={() => speech.state === 'listening' && speech.stop()}
            >
              {speech.state === 'transcribing' ? <span className="spinner" /> : <Icon name="mic" size={18} />}
            </button>
            <button className="icon-button send" disabled={!draft.trim() || busy} onClick={send} title="Send (Enter)">
              <Icon name="send" size={18} />
            </button>
          </div>
        </div>
        <div className="composer-footer">
          {speech.supported ? (
            <>
              <label className="toggle">
                <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
                Review voice messages before sending
              </label>
              <span title={speech.engine === 'whisper' ? 'Transcribed on this Mac by Whisper' : "Transcribed by the browser's speech recognition"}>
                {speech.engine === 'whisper' ? 'Whisper' : 'Browser voice'}
              </span>
            </>
          ) : (
            <span>Voice input needs Whisper installed, or Chrome or Safari</span>
          )}
          {speech.error && <span className="error-text">{speech.error}</span>}
          <span className="spacer" />
          <span>
            {hintsUsed} {hintsUsed === 1 ? 'hint' : 'hints'} used
          </span>
        </div>
      </div>
    </section>
  );
}
