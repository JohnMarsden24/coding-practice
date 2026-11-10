import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

const HOLD_TO_TALK_MS = 250;

/** Space stays an ordinary key in the code editor and form fields. The message box and buttons get hold to talk. */
function keepsSpace(el: Element | null, composer: HTMLTextAreaElement | null): boolean {
  if (!el || el === composer) return false;
  if (el.closest('.monaco-editor')) return true;
  const tag = el.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** Does what a tapped Space would have done, since the keydown was held back to see whether it was a hold. */
function tapSpace(el: Element | null, composer: HTMLTextAreaElement | null) {
  if (el === composer) document.execCommand('insertText', false, ' ');
  else if (el instanceof HTMLButtonElement) el.click();
}

export function Chat({
  transcribePath,
  messages,
  pending,
  streaming,
  draft,
  setDraft,
  busy,
  onSend,
  hintsUsed,
  prompt = 'Talk it through…',
  intro,
}: {
  /** Where Whisper recordings are sent, so they're transcribed with the right vocabulary. */
  transcribePath: string;
  messages: ChatMessage[];
  pending: string | null;
  streaming: Streaming | null;
  draft: string;
  setDraft: (text: string) => void;
  busy: boolean;
  onSend: (text: string) => void;
  hintsUsed?: number;
  prompt?: string;
  /** Shown in place of the conversation until the first message. */
  intro?: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const base = useRef('');
  const spaceHeld = useRef<{ timer: ReturnType<typeof setTimeout>; talking: boolean } | null>(null);
  const [review, setReview] = useState(() => localStorage.getItem('voiceReview') === 'true');

  useEffect(() => localStorage.setItem('voiceReview', String(review)), [review]);

  const combine = (spoken: string) => [base.current, spoken].filter(Boolean).join(base.current.endsWith(' ') ? '' : ' ');

  const speech = useVoice({
    transcribePath,
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
    const down = (e: KeyboardEvent) => {
      const held = spaceHeld.current;
      if (e.code !== 'Space') {
        // Another key before Space comes up means Space was a quick tap while typing.
        if (held && !held.talking) {
          clearTimeout(held.timer);
          spaceHeld.current = null;
          tapSpace(document.activeElement, textarea.current);
        }
        return;
      }
      if (held) {
        e.preventDefault();
        return;
      }
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!speech.supported || busy || speech.state !== 'idle' || keepsSpace(document.activeElement, textarea.current)) return;
      e.preventDefault();
      const entry = {
        talking: false,
        timer: setTimeout(() => {
          entry.talking = true;
          startTalking();
        }, HOLD_TO_TALK_MS),
      };
      spaceHeld.current = entry;
    };
    const up = (e: KeyboardEvent) => {
      const held = spaceHeld.current;
      if (e.code !== 'Space' || !held) return;
      e.preventDefault();
      clearTimeout(held.timer);
      spaceHeld.current = null;
      if (held.talking) speech.stop();
      else tapSpace(document.activeElement, textarea.current);
    };
    const cancel = () => {
      const held = spaceHeld.current;
      if (!held) return;
      clearTimeout(held.timer);
      spaceHeld.current = null;
      if (held.talking) speech.stop();
    };
    // Capture phase, so a held-back space is typed before React handles the next key, such as Enter.
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', cancel);
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
          {!messages.length && !pending && intro}
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
                    ? `${prompt} (hold Space to speak)`
                    : prompt
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
          {hintsUsed !== undefined && (
            <span>
              {hintsUsed} {hintsUsed === 1 ? 'teaching step' : 'teaching steps'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
