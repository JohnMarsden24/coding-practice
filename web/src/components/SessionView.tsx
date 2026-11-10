import { useCallback, useEffect, useRef, useState } from 'react';
import { topicName } from '../../../shared/curriculum';
import type { SessionDetail } from '../../../shared/types';
import { api } from '../api';
import { Chat, type Streaming } from './Chat';
import { Icon } from './Icons';
import { Workspace } from './Workspace';

const STATUS = { in_progress: 'In progress', solved: 'Solved', gave_up: 'Gave up' } as const;

export function SessionView({ id, onChange }: { id: string; onChange: () => Promise<void> }) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    api.session(id).then(
      (s) => {
        setSession(s);
        setCode(s.code);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);

  const updateCode = useCallback(
    (next: string) => {
      setCode(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void api.saveCode(id, next), 800);
    },
    [id],
  );

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const busy = Boolean(pending || streaming);

  const streamInto = async (kind: Streaming['kind'], start: (handlers: Record<string, (d: any) => void>) => Promise<void>) => {
    setStreaming({ kind, text: '' });
    await start({
      delta: (d) => setStreaming((s) => (s ? { ...s, text: s.text + d.text } : s)),
      constraint: (d) =>
        setSession((s) =>
          s ? { ...s, problem: { ...s.problem, revealedConstraints: [...s.problem.revealedConstraints, d.constraint] } } : s,
        ),
      hint: (d) => setSession((s) => (s ? { ...s, hintsUsed: d.total } : s)),
      done: (d) => setSession(d.session),
    });
    setStreaming(null);
  };

  const send = async (text: string) => {
    setError(null);
    setDraft('');
    setPending(text);
    try {
      await streamInto('chat', (h) => api.chat(id, text, codeRef.current, h));
      await onChange();
    } catch (e) {
      setError((e as Error).message);
      setDraft(text);
      setSession(await api.session(id));
    } finally {
      setPending(null);
      setStreaming(null);
    }
  };

  const run = async () => {
    if (!session || running) return;
    setError(null);
    setRunning(true);
    try {
      const lastRun = await api.run(id, codeRef.current);
      setSession((s) => (s ? { ...s, lastRun } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const submit = async () => {
    setError(null);
    setRunning(true);
    try {
      setSession(await api.submit(id, codeRef.current));
      await onChange();
    } catch (e) {
      setError((e as Error).message);
      return;
    } finally {
      setRunning(false);
    }
    try {
      await streamInto('feedback', (h) => api.feedback(id, h));
    } catch (e) {
      setError(`Feedback failed: ${(e as Error).message}`);
    } finally {
      setStreaming(null);
    }
  };

  const giveUp = async () => {
    if (!confirm('Give up and see the model solution? This counts as not solving it.')) return;
    setError(null);
    try {
      setSession(await api.giveUp(id, codeRef.current));
      await onChange();
      await streamInto('walkthrough', (h) => api.walkthrough(id, h));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(null);
    }
  };

  if (!session) {
    return <div className="page">{error ? <p className="error-text">{error}</p> : 'Loading…'}</div>;
  }

  return (
    <div className="session">
      <header className="session-header">
        <div className="session-heading">
          <h1>{session.title}</h1>
          <span className="session-meta">
            {topicName(session.topic)} · {session.difficulty} · <span className={`status-text ${session.status}`}>{STATUS[session.status]}</span>
          </span>
        </div>
        <button className="icon-button" onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? 'Hide the problem panel' : 'Show the problem panel'}>
          <Icon name="panel" />
        </button>
      </header>
      {error && (
        <div className="banner" role="alert">
          {error}
          <button className="icon-button small" onClick={() => setError(null)} title="Dismiss">
            ✕
          </button>
        </div>
      )}
      <div className={`session-body ${panelOpen ? '' : 'panel-closed'}`}>
        <Chat
          transcribePath={`/sessions/${id}/transcribe`}
          messages={session.messages}
          pending={pending}
          streaming={streaming}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onSend={send}
          hintsUsed={session.hintsUsed}
        />
        <div className={panelOpen ? 'workspace-wrap' : 'hidden'}>
          <Workspace
            session={session}
            code={code}
            setCode={updateCode}
            busy={busy}
            running={running}
            onRun={run}
            onSubmit={submit}
            onGiveUp={giveUp}
          />
        </div>
      </div>
    </div>
  );
}
