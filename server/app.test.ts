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

test('a first independent submission without hints moves the topic up', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem, 'independent');
  const session = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(session.status, 'solved');
  assert.equal(session.referenceSolution, problem.referenceSolution);
  assert.equal(await level(), 'hard');
  assert.equal((await call<AppState>('GET', '/state')).progress.find((p) => p.topic === problem.topic)!.independentSolved, 1);
});

test('guided solves keep the level and schedule an independent review', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem);
  store.updateSession(id, { hints: [1, 2, 3] });
  await call('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(await level(), 'medium');
  const state = await call<AppState>('GET', '/state');
  assert.equal(state.progress.find((p) => p.topic === problem.topic)!.independentSolved, 0);
  assert.equal(state.reviews[0].sourceId, id);
  assert.ok(Math.abs(state.reviews[0].dueAt - Date.now() - 2 * 86400000) < 1000);
});

test('a failed independent submission and retry keep the level', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem, 'independent');
  const failed = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: wrong });
  assert.equal(failed.status, 'in_progress');
  assert.equal(failed.lastRun?.passed, 1);
  assert.equal(failed.lastRun?.results[1].input, undefined, 'hidden test inputs stay hidden');
  assert.equal(await level(), 'medium');

  const fixed = await call<SessionDetail>('POST', `/sessions/${id}/submit`, { code: correct });
  assert.equal(fixed.status, 'solved');
  assert.equal(await level(), 'medium');
  assert.equal((await call<AppState>('GET', '/state')).progress.find((p) => p.topic === problem.topic)!.independentSolved, 0);
  assert.deepEqual(
    fixed.messages.filter((m) => m.kind === 'event').map((m) => m.content),
    ['Submission 1: 1 of 2 tests passed, including hidden tests', 'Submission 2: 2 of 2 tests passed, including hidden tests'],
  );
});

test('studying a solution keeps the level and schedules practice', async () => {
  store.setLevel('arrays-hashing', 'medium');
  const { id } = store.createSession('s1', problem, 'independent');
  const session = await call<SessionDetail>('POST', `/sessions/${id}/give-up`, { code: wrong });
  assert.equal(session.status, 'gave_up');
  assert.equal(session.referenceSolution, problem.referenceSolution);
  assert.equal(await level(), 'medium');
  assert.equal(session.mode, 'guided');
  assert.equal((await call<AppState>('GET', '/state')).reviews[0].sourceId, id);

  const res = await app.request(`/api/sessions/${id}/submit`, { method: 'POST', body: JSON.stringify({ code: correct }) });
  assert.equal(res.status, 400);
});

test('requirements are visible in guided learning and an independent attempt can switch to guided', async () => {
  store.createSession('guided', problem);
  store.createSession('independent', problem, 'independent');
  const guided = await call<SessionDetail>('GET', '/sessions/guided');
  const independent = await call<SessionDetail>('GET', '/sessions/independent');
  assert.deepEqual(guided.problem.revealedConstraints, problem.constraints);
  assert.deepEqual(independent.problem.revealedConstraints, []);
  assert.equal(guided.referenceSolution, undefined);
  const helped = await call<SessionDetail>('POST', '/sessions/independent/guided');
  assert.equal(helped.mode, 'guided');
  assert.deepEqual(helped.problem.revealedConstraints, problem.constraints);
  await call('POST', '/sessions/independent/submit', { code: correct });
  assert.equal(await level(), 'easy');
});

test('finished sessions cannot be resubmitted after revealing the answer', async () => {
  store.createSession('s1', problem, 'independent');
  await call('POST', '/sessions/s1/submit', { code: correct });
  const res = await app.request('/api/sessions/s1/submit', { method: 'POST', body: JSON.stringify({ code: wrong }) });
  assert.equal(res.status, 400);
  assert.equal(store.getSession('s1')!.status, 'solved');
});

test('successful reviews extend the interval and a guided completion resets it', () => {
  const first = store.createSession('first', problem);
  store.scheduleReview(first, false);
  const review = store.createSession('review', problem, 'independent', first.id);
  store.scheduleReview(review, true);
  assert.ok(Math.abs(store.reviews()[0].dueAt - Date.now() - 7 * 86400000) < 1000);
  const next = store.createSession('next', problem, 'independent', review.id);
  store.scheduleReview(next, true);
  assert.ok(Math.abs(store.reviews()[0].dueAt - Date.now() - 21 * 86400000) < 1000);
  store.scheduleReview(next, false);
  assert.ok(Math.abs(store.reviews()[0].dueAt - Date.now() - 2 * 86400000) < 1000);
  store.deleteSession(next.id);
  assert.deepEqual(store.reviews(), []);
});

test('a review cannot start before its scheduled time', async () => {
  const first = store.createSession('first', problem);
  store.scheduleReview(first, false);
  const res = await app.request('/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: problem.topic, difficulty: problem.difficulty, mode: 'independent', reviewOf: first.id }),
  });
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
