import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'quiz' }
  | { name: 'progress' }
  | { name: 'learn'; id?: string }
  | { name: 'session'; id: string };

function parse(hash: string): Route {
  const [, first, second] = hash.replace(/^#/, '').split('/');
  if (first === 'session' && second) return { name: 'session', id: second };
  if (first === 'learn') return { name: 'learn', id: second || undefined };
  if (first === 'new' || first === 'quiz' || first === 'progress') return { name: first };
  return { name: 'home' };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
