import { useState } from 'react';
import { topicName } from '../../../shared/curriculum';
import type { AppState, SessionStatus } from '../../../shared/types';
import { api } from '../api';
import { navigate, type Route } from '../useRoute';
import { Icon } from './Icons';

const STATUS_LABEL = { in_progress: 'In progress', solved: 'Solved', gave_up: 'Studied solution' } as const;

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
        <button className="icon-button" onClick={() => navigate('/learn')} title="Learn">
          <Icon name="book" />
        </button>
      </aside>
    );
  }

  const activeId = route.name === 'session' || route.name === 'learn' ? route.id : undefined;
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
        <button className={`nav-item ${route.name === 'learn' && !route.id ? 'active' : ''}`} onClick={() => navigate('/learn')}>
          <Icon name="book" /> Learn
        </button>
        <button className={`nav-item ${route.name === 'progress' ? 'active' : ''}`} onClick={() => navigate('/progress')}>
          <Icon name="chart" /> Progress
        </button>
      </nav>
      <div className="session-lists">
        {state.learnChats.length > 0 && (
          <>
            <div className="sidebar-section">Learn</div>
            <ul className="session-list">
              {state.learnChats.map((c) => (
                <ListItem
                  key={c.id}
                  title={c.title}
                  active={c.id === activeId}
                  onOpen={() => navigate(`/learn/${c.id}`)}
                  onRename={(title) => api.renameLearnChat(c.id, title)}
                  onRemove={async () => {
                    await api.removeLearnChat(c.id);
                    if (c.id === activeId) navigate('/learn');
                  }}
                  onChange={onChange}
                />
              ))}
            </ul>
          </>
        )}
        <div className="sidebar-section">Sessions</div>
        <ul className="session-list">
          {state.sessions.length === 0 && <li className="empty">No sessions yet</li>}
          {state.sessions.map((s) => (
            <ListItem
              key={s.id}
              title={s.title}
              meta={s.mode === 'guided' ? `${topicName(s.topic)} · Guided learning` : 'Independent practice'}
              status={s.status}
              active={s.id === activeId}
              onOpen={() => navigate(`/session/${s.id}`)}
              onRename={(title) => api.rename(s.id, title)}
              onRemove={async () => {
                await api.remove(s.id);
                if (s.id === activeId) navigate('/new');
              }}
              onChange={onChange}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function ListItem({
  title: savedTitle,
  meta,
  status,
  active,
  onOpen,
  onRename,
  onRemove,
  onChange,
}: {
  title: string;
  meta?: string;
  status?: SessionStatus;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => Promise<unknown>;
  onRemove: () => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(savedTitle);

  const saveTitle = async () => {
    setRenaming(false);
    if (title.trim() && title.trim() !== savedTitle) {
      await onRename(title.trim());
      await onChange();
    } else {
      setTitle(savedTitle);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${savedTitle}"? This can't be undone.`)) return;
    await onRemove();
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
              setTitle(savedTitle);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button className="session-link" onClick={onOpen}>
          {status && <span className={`status-dot ${status}`} title={STATUS_LABEL[status]} />}
          <span className="session-text">
            <span className="session-title">{savedTitle}</span>
            {meta && <span className="session-meta">{meta}</span>}
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
