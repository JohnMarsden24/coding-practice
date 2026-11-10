import { useCallback, useEffect, useState } from 'react';
import type { AppState } from '../../shared/types';
import { api } from './api';
import { LearnView } from './components/LearnView';
import { NewProblem } from './components/NewProblem';
import { Progress } from './components/Progress';
import { Quiz } from './components/Quiz';
import { SessionView } from './components/SessionView';
import { Sidebar } from './components/Sidebar';
import { navigate, useRoute } from './useRoute';

export function App() {
  const route = useRoute();
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false');

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => localStorage.setItem('sidebarOpen', String(sidebarOpen)), [sidebarOpen]);

  if (!state) {
    return <div className="splash">{loadError ? `Couldn't reach the app server: ${loadError}` : 'Loading…'}</div>;
  }

  let main;
  if (route.name === 'session') {
    main = <SessionView key={route.id} id={route.id} onChange={refresh} />;
  } else if (route.name === 'learn') {
    main = <LearnView id={route.id} state={state} onChange={refresh} />;
  } else if (route.name === 'progress') {
    main = <Progress state={state} />;
  } else if (route.name === 'quiz' || !state.quizTaken) {
    main = (
      <Quiz
        firstTime={!state.quizTaken}
        onFinish={async () => {
          await refresh();
          navigate('/new');
        }}
      />
    );
  } else {
    main = (
      <NewProblem
        state={state}
        onCreated={async (id) => {
          await refresh();
          navigate(`/session/${id}`);
        }}
      />
    );
  }

  return (
    <div className={`app ${sidebarOpen ? '' : 'sidebar-closed'}`}>
      <Sidebar
        state={state}
        route={route}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onChange={refresh}
      />
      <main className="app-main">{main}</main>
    </div>
  );
}
