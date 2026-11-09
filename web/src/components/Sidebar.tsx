import { useState } from 'react';
import { topicName } from '../../../shared/curriculum';
import type { AppState, SessionSummary } from '../../../shared/types';
import { api } from '../api';
import { navigate, type Route } from '../useRoute';
import { Icon } from './Icons';

const STATUS_LABEL = { in_progress: 'In progress', solved: 'Solved', gave_up: 'Gave up' } as const;

export function Sidebar({
  state,
  route,
  open,
  onToggle,
  onChange,
}: {
  state: AppState;
  route: Route;
  open: boolean;
  onToggle: () => void;
  onChange: () => Promise<void>;
}) {
  if (!open) {
    return (
      <aside className="sidebar collapsed">
        <button className="icon-button" onClick={onToggle} title="Open sidebar">
          <Icon name="sidebar" />
        </button>
        <button className="icon-button" onClick={() => navigate('/new')} title="New problem">
          <Icon name="plus" />
        </button>
      </aside>
    );
  }

  const activeId = route.name === 'session' ? route.id : null;
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand">Coding practice</span>
        <button className="icon-button" onClick={onToggle} title="Close sidebar">
          <Icon name="sidebar" />
        </button>
      </div>
      <nav className="sidebar-nav">
        <button className={`nav-item primary ${route.name === 'new' || route.name === 'home' ? 'active' : ''}`} onClick={() => navigate('/new')}>
          <Icon name="plus" /> New problem
        </button>
        <button className={`nav-item ${route.name === 'progress' ? 'active' : ''}`} onClick={() => navigate('/progress')}>
          <Icon name="chart" /> Progress
        </button>
      </nav>
      <div className="sidebar-section">Sessions</div>
      <ul className="session-list">
        {state.sessions.length === 0 && <li className="empty">No sessions yet</li>}
        {state.sessions.map((s) => (
          <SessionItem key={s.id} session={s} active={s.id === activeId} onChange={onChange} />
        ))}
      </ul>
    </aside>
  );
}

function SessionItem({ session, active, onChange }: { session: SessionSummary; active: boolean; onChange: () => Promise<void> }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session.title);

  const saveTitle = async () => {
    setRenaming(false);
    if (title.trim() && title.trim() !== session.title) {
      await api.rename(session.id, title.trim());
      await onChange();
    } else {
      setTitle(session.title);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${session.title}"? This can't be undone.`)) return;
    await api.remove(session.id);
    if (active) navigate('/new');
    await onChange();
  };

  return (
    <li className={`session-item ${active ? 'active' : ''}`}>
      {renaming ? (
        <input
          className="rename-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveTitle();
            if (e.key === 'Escape') {
              setTitle(session.title);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button className="session-link" onClick={() => navigate(`/session/${session.id}`)}>
          <span className={`status-dot ${session.status}`} title={STATUS_LABEL[session.status]} />
          <span className="session-text">
            <span className="session-title">{session.title}</span>
            <span className="session-meta">
              {topicName(session.topic)} · {session.difficulty}
            </span>
          </span>
        </button>
      )}
      {!renaming && (
        <span className="session-actions">
          <button className="icon-button small" onClick={() => setRenaming(true)} title="Rename">
            <Icon name="pencil" size={14} />
          </button>
          <button className="icon-button small" onClick={remove} title="Delete">
            <Icon name="trash" size={14} />
          </button>
        </span>
      )}
    </li>
  );
}
