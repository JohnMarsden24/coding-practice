import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RunResult, SessionDetail, TestResult } from '../../../shared/types';
import { CodeEditor } from './CodeEditor';
import { Icon } from './Icons';
import { TeachingTrace } from './TeachingTrace';

const show = (v: unknown) => JSON.stringify(v);

function Problem({ session }: { session: SessionDetail }) {
  const p = session.problem;
  return (
    <div className="problem">
      {p.learningGoal && <p className="learning-goal">{p.learningGoal}</p>}
      <div className="markdown">
        <Markdown remarkPlugins={[remarkGfm]}>{p.statement}</Markdown>
      </div>
      <div className="example">
        <div>
          <span className="field-label">Input</span> <code>{p.example.input}</code>
        </div>
        <div>
          <span className="field-label">Output</span> <code>{p.example.output}</code>
        </div>
        <div className="muted">{p.example.explanation}</div>
      </div>
      <div className="notes">
        <div className="field-label">{session.mode === 'guided' ? 'Requirements' : 'Notes from your questions'}</div>
        {p.revealedConstraints.length ? (
          <ul>
            {p.revealedConstraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Ask about input sizes, edge cases and anything else you'd clarify in an interview.</p>
        )}
      </div>
      {p.prelude.trim() && (
        <div className="notes">
          <div className="field-label">Provided code</div>
          <pre className="code-block">{p.prelude.trim()}</pre>
        </div>
      )}
      <p className="muted small">
        {p.visibleTests.length} visible tests run with Run. Submit also runs {p.hiddenTestCount} hidden tests.
      </p>
    </div>
  );
}

function Result({ r }: { r: TestResult }) {
  const [open, setOpen] = useState(!r.passed && !r.hidden);
  const detail = !r.hidden && (r.input !== undefined || r.error || r.logs?.length);
  return (
    <li className={`test ${r.passed ? 'pass' : 'fail'}`}>
      <button className="test-head" onClick={() => detail && setOpen(!open)}>
        <span className="test-icon">{r.passed ? '✓' : '✕'}</span>
        <span>{r.name}</span>
        <span className="muted small">
          {r.timedOut ? 'too slow' : r.error && r.hidden ? 'error' : r.ms !== undefined ? `${r.ms}ms` : ''}
        </span>
      </button>
      {open && detail && (
        <div className="test-detail">
          {r.input !== undefined && (
            <div>
              <span className="field-label">Input</span> <code>{r.input.map(show).join(', ')}</code>
            </div>
          )}
          {r.expected !== undefined && (
            <div>
              <span className="field-label">Expected</span> <code>{show(r.expected)}</code>
            </div>
          )}
          {r.error ? (
            <div className="error-text">{r.error}</div>
          ) : (
            <div>
              <span className="field-label">Got</span> <code>{show(r.actual)}</code>
            </div>
          )}
          {r.logs && r.logs.length > 0 && <pre className="logs">{r.logs.join('\n')}</pre>}
        </div>
      )}
      {open && r.hidden && r.error && !r.timedOut && <div className="test-detail error-text">{r.error}</div>}
    </li>
  );
}

function Results({ run }: { run: RunResult }) {
  return (
    <div className="results">
      <div className={`results-summary ${run.passed === run.total && !run.compileError ? 'pass' : 'fail'}`}>
        {run.compileError ? "Your code didn't compile" : `${run.passed} of ${run.total} passed`}
      </div>
      {run.compileError ? (
        <pre className="logs error-text">{run.compileError}</pre>
      ) : (
        <>
          <ul className="test-list">
            {run.results
              .filter((r) => !r.passed || r.logs?.length)
              .map((r) => (
                <Result key={r.name} r={r} />
              ))}
          </ul>
          {run.results.some((r) => r.passed && !r.logs?.length) && (
            <div className="passed-line">
              <span className="test-icon">✓</span>
              {run.results
                .filter((r) => r.passed && !r.logs?.length)
                .map((r) => r.name)
                .join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Workspace({
  session,
  code,
  setCode,
  busy,
  running,
  onRun,
  onSubmit,
  onGiveUp,
  onHelp,
}: {
  session: SessionDetail;
  code: string;
  setCode: (code: string) => void;
  busy: boolean;
  running: boolean;
  onRun: () => void;
  onSubmit: () => void;
  onGiveUp: () => void;
  onHelp: (workedExample: boolean) => void;
}) {
  const [problemOpen, setProblemOpen] = useState(true);
  const [showSolution, setShowSolution] = useState(false);
  const finished = session.status !== 'in_progress';
  useEffect(() => {
    if (session.status === 'gave_up') setShowSolution(true);
  }, [session.status]);

  return (
    <section className="workspace">
      <div className="panel-section problem-section">
        <button className="section-toggle" onClick={() => setProblemOpen(!problemOpen)}>
          <span className={`chevron ${problemOpen ? 'open' : ''}`}>
            <Icon name="chevron" size={14} />
          </span>
          Problem
        </button>
        {problemOpen && <Problem session={session} />}
        {!finished && (
          <div className="teaching-actions">
            <button className="button small" disabled={busy || running} onClick={() => onHelp(false)}>
              {session.mode === 'guided' ? 'Help me with one step' : 'Get teaching help'}
            </button>
            {session.mode === 'guided' && (
              <button className="button small" disabled={busy || running} onClick={() => onHelp(true)}>Show a worked example</button>
            )}
          </div>
        )}
        {session.trace && session.mode === 'guided' && <TeachingTrace key={JSON.stringify(session.trace)} trace={session.trace} />}
      </div>

      <div className="editor-toolbar">
        <div className="tabs">
          <button className={!showSolution ? 'active' : ''} onClick={() => setShowSolution(false)}>
            Your code
          </button>
          {session.referenceSolution && (
            <button className={showSolution ? 'active' : ''} onClick={() => setShowSolution(true)}>
              Model solution
            </button>
          )}
        </div>
        <span className="spacer" />
        <button className="button small" onClick={onRun} disabled={busy || running} title="Run visible tests (⌘ Enter)">
          <Icon name="play" size={14} /> Run
        </button>
        {!finished && (
          <button className="button small primary" onClick={onSubmit} disabled={busy || running}>
            <Icon name="check" size={14} /> {session.submissions ? 'Resubmit' : 'Submit'}
          </button>
        )}
        {!finished && (
          <button className="button small ghost" onClick={onGiveUp} disabled={busy || running}>
            <Icon name="flag" size={14} /> Study solution
          </button>
        )}
      </div>

      <div className="editor-area">
        <div className={showSolution ? 'hidden' : 'fill'}>
          <CodeEditor value={code} onChange={setCode} prelude={session.problem.prelude} onRun={onRun} />
        </div>
        {showSolution && session.referenceSolution && <pre className="solution">{session.referenceSolution}</pre>}
      </div>

      <div className="panel-section results-section">
        {running ? (
          <div className="status-line">
            <span className="spinner" /> Running tests…
          </div>
        ) : session.lastRun ? (
          <Results run={session.lastRun} />
        ) : (
          <div className="muted small">Run your code to see the visible test results here.</div>
        )}
      </div>
    </section>
  );
}
