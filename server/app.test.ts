import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { AppState, Problem, QuizQuestion, QuizResult, SessionDetail } from '../shared/types';
import { createApp } from './app';
import { createClaude } from './claude';
import { openStore, type Store } from './db';

const problem: Problem = {
  title: 'Count evens',
  topic: 'arrays-hashing',
  difficulty: 'medium',
  statement: 'Count the even numbers.',
  example: { input: '[1, 2, 4]', output: '2', explanation: '2 and 4 are even.' },
  functionName: 'countEvens',
  starterCode: 'function countEvens(nums: number[]): number {\n  // your code here\n}',
  prelude: '',
  adapter: '',
  constraints: ['nums can be empty'],
  compare: 'exact',
  visibleTests: [{ input: [[1, 2, 4]], expected: 2 }],
  hiddenTests: [{ input: [[]], expected: 0 }],
  referenceSolution: 'function countEvens(nums: number[]) { return nums.filter((n) => n % 2 === 0).length; }',
  approach: 'Filter and count.',
};

const correct = 'function countEvens(nums: number[]) { return nums.filter((n) => n % 2 === 0).length; }';
const wrong = 'function countEvens(nums: number[]) { return nums.length; }';

let store: Store;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = openStore(':memory:');
  app = createApp({ store, claude: createClaude() });
});

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

const level = async () => (await call<AppState>('GET', '/state')).progress.find((p) => p.topic === 'arrays-hashing')!.level;

test('the quiz puts topics with two right answers at medium and the rest at easy', async () => {
  const questions = await call<QuizQuestion[]>('GET', '/quiz');
  assert.equal(questions.length, 28);
  const unanswered = await call<QuizResult>('POST', '/quiz', { answers: {} });
  assert.ok(unanswered.perTopic.every((t) => t.level === 'easy'));

  const answers = Object.fromEntries(unanswered.answers.map((a) => [a.id, a.answer]));
  answers['dp-2'] = null as unknown as string;
  const result = await call<QuizResult>('POST', '/quiz', { answers });
  const state = await call<AppState>('GET', '/state');
  assert.equal(state.quizTaken, true);
  assert.equal(result.perTopic.find((t) => t.topic === 'dynamic-programming')!.level, 'easy');
  assert.equal(state.progress.filter((p) => p.level === 'medium').length, 13);
});

test('solving on the first submission with few hints moves the topic up', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem);
  const session = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(session.status, 'solved');
  assert.equal(session.referenceSolution, problem.referenceSolution);
  assert.equal(await level(), 'hard');
});

test('solving with more than two hints keeps the level', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem);
  store.updateSession(id, { hints: [1, 2, 3] });
  await call('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(await level(), 'medium');
});

test('only the first submission counts, and a failed one moves the topic down', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem);
  const failed = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: wrong });
  assert.equal(failed.status, 'in_progress');
  assert.equal(failed.lastRun?.passed, 1);
  assert.equal(failed.lastRun?.results[1].input, undefined, 'hidden test inputs stay hidden');
  assert.equal(await level(), 'easy');

  const fixed = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(fixed.status, 'solved');
  assert.equal(await level(), 'easy');
  assert.deepEqual(
    fixed.messages.filter((m) => m.kind === 'event').map((m) => m.content),
    ['Submission 1: 1 of 2 tests passed, including hidden tests', 'Submission 2: 2 of 2 tests passed, including hidden tests'],
  );
});

test('giving up before submitting moves the topic down and reveals the solution', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem);
  const session = await call<SessionDetail>('POST', `/sessions/${id}/give-up`, { code: wrong });
  assert.equal(session.status, 'gave_up');
  assert.equal(session.referenceSolution, problem.referenceSolution);
  assert.equal(await level(), 'easy');

  const res = await app.request(`/api/sessions/${id}/submit`, { method: 'POST', body: JSON.stringify({ code: correct }) });
  assert.equal(res.status, 400);
});

test('the suggestion is the weakest topic, preferring ones not practised yet', async () => {
  for (const t of (await call<AppState>('GET', '/state')).progress) store.setLevel(t.topic, 'medium');
  store.setLevel('trees', 'easy');
  store.setLevel('tries', 'easy');
  store.createSession('s1', { ...problem, topic: 'trees' });
  const { suggestion } = await call<AppState>('GET', '/state');
  assert.deepEqual(suggestion, { topic: 'tries', difficulty: 'easy' });
});
