import { useCallback, useEffect, useRef, useState } from 'react';
import { topicName } from '../../../shared/curriculum';
import type { SessionDetail } from '../../../shared/types';
import { api } from '../api';
import { Chat, type Streaming } from './Chat';
import { Icon } from './Icons';
import { Workspace } from './Workspace';

const STATUS = { in_progress: 'In progress', solved: 'Solved', gave_up: 'Studied solution' } as const;

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
      trace: (d) => {
        setPanelOpen(true);
        setSession((s) => (s ? { ...s, trace: d.trace } : s));
      },
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
    if (!confirm('Study the model solution and finish this attempt? Your topic level stays the same.')) return;
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

  const help = async (workedExample: boolean) => {
    if (!session || busy || running) return;
    setError(null);
    setPending('Getting teaching help…');
    try {
      if (session.mode === 'independent') {
        setSession(await api.guided(id));
        await onChange();
      }
      setPending(null);
      await send(workedExample
        ? 'Show me a small worked example with real values and a visual trace if useful. Demonstrate one decision and explain why it is valid, then let me try the next decision. I do not need the whole solution.'
        : 'I am stuck. Help me with the next small step. If we have already tried a question or hint, give me more concrete help rather than rephrasing it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
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
            {session.mode === 'guided' ? `Guided learning · ${topicName(session.topic)}` : 'Independent practice'} · <span className={`status-text ${session.status}`}>{STATUS[session.status]}</span>
          </span>
        </div>
        <button className="icon-button" onClick={() => setPanelOpen(!panelOpen)} title={panelOpen ? 'Hide the problem panel' : 'Show the problem panel'}>
          <Icon name="panel" />
        </button>
      </header>
      <div className="learning-strip">
        {session.status === 'in_progress'
          ? session.mode === 'guided' ? 'Understand one example → Try a step → Code it → Check a boundary case' : 'Choose your approach and try it without hints. Teaching help is available whenever you need it.'
          : session.mode === 'independent' && session.submissions === 1 && session.hintsUsed === 0
            ? 'Solved independently. A fresh review after a delay will check what you remember.'
            : 'Practice saved. A fresh independent review is scheduled in two days.'}
      </div>
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
          hintsUsed={session.mode === 'guided' ? session.hintsUsed : undefined}
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
            onHelp={help}
          />
        </div>
      </div>
    </div>
  );
}
