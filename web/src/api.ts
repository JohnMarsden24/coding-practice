import type { AppState, LearnChatDetail, QuizQuestion, QuizResult, RunResult, SessionDetail, SessionMode } from '../../shared/types';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

type Handlers = Record<string, (data: any) => void>;

/** POSTs and reads the server-sent events in the response. An error event rejects. */
async function stream(path: string, body: unknown, handlers: Handlers): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trimStart();
      }
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (event === 'error') throw new Error(parsed.message);
      handlers[event]?.(parsed);
    }
  }
}

export const api = {
  state: () => request<AppState>('GET', '/state'),
  quiz: () => request<QuizQuestion[]>('GET', '/quiz'),
  submitQuiz: (answers: Record<string, string | null>) => request<QuizResult>('POST', '/quiz', { answers }),
  skipQuiz: () => request('POST', '/quiz/skip'),
  session: (id: string) => request<SessionDetail>('GET', `/sessions/${id}`),
  rename: (id: string, title: string) => request('PATCH', `/sessions/${id}`, { title }),
  saveCode: (id: string, code: string) => request('PATCH', `/sessions/${id}`, { code }),
  remove: (id: string) => request('DELETE', `/sessions/${id}`),
  run: (id: string, code: string) => request<RunResult>('POST', `/sessions/${id}/run`, { code }),
  submit: (id: string, code: string) => request<SessionDetail>('POST', `/sessions/${id}/submit`, { code }),
  giveUp: (id: string, code: string) => request<SessionDetail>('POST', `/sessions/${id}/give-up`, { code }),
  newSession: (topic: string, difficulty: string, handlers: Handlers, mode: SessionMode = 'guided', reviewOf?: string) =>
    stream('/sessions', { topic, difficulty, mode, reviewOf }, handlers),
  guided: (id: string) => request<SessionDetail>('POST', `/sessions/${id}/guided`),
  chat: (id: string, content: string, code: string, handlers: Handlers) => stream(`/sessions/${id}/chat`, { content, code }, handlers),
  feedback: (id: string, handlers: Handlers) => stream(`/sessions/${id}/feedback`, {}, handlers),
  walkthrough: (id: string, handlers: Handlers) => stream(`/sessions/${id}/walkthrough`, {}, handlers),
  learnChat: (id: string) => request<LearnChatDetail>('GET', `/learn/${id}`),
  renameLearnChat: (id: string, title: string) => request('PATCH', `/learn/${id}`, { title }),
  removeLearnChat: (id: string) => request('DELETE', `/learn/${id}`),
  /** Asks a question, starting a new chat when there's no id. */
  learn: (id: string | undefined, content: string, handlers: Handlers) => stream(id ? `/learn/${id}` : '/learn', { content }, handlers),
};
