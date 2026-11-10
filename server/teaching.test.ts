import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { Problem, SessionDetail, TeachingTrace } from '../shared/types';
import { createApp } from './app';
import { openStore, type Store } from './db';
import { bedrockReply } from './testBedrock';

export const exampleProblem: Problem = {
  title: 'Find the first low reading', topic: 'binary-search', difficulty: 'easy',
  statement: 'Readings are sorted from highest to lowest. Return the index of the first reading at or below a threshold, or -1 when none qualifies.',
  example: { input: '[90, 80, 40, 30, 20], 75', output: '2', explanation: '40 is the first qualifying reading.' },
  functionName: 'firstLowReading', starterCode: 'function firstLowReading(readings: number[], threshold: number): number {\n  // your code here\n}',
  prelude: '', adapter: '', constraints: ['Readings are sorted in descending order.', 'Readings can repeat or be empty. Return -1 when none qualifies.'],
  visibleTests: [{ input: [[90, 80, 40, 30, 20], 75], expected: 2 }, { input: [[80, 80, 20], 80], expected: 0 }, { input: [[90], 75], expected: -1 }],
  hiddenTests: [{ input: [[] ,75], expected: -1 }], compare: 'exact',
  referenceSolution: 'function firstLowReading(readings: number[], threshold: number): number { let left = 0, right = readings.length; while (left < right) { const mid = Math.floor((left + right) / 2); if (readings[mid] <= threshold) right = mid; else left = mid + 1; } return left === readings.length ? -1 : left; }',
  approach: 'Find the first match using binary search, retaining qualifying values as possible answers and searching earlier positions.',
  learningGoal: 'Understand why a matching reading is a possible answer while earlier readings still need checking.',
};

export const exampleTrace: TeachingTrace = {
  title: 'First reading at or below 75', values: ['90', '80', '40', '30', '20'],
  steps: [
    { focus: 2, active: [0, 1, 2, 3, 4], candidate: null, explanation: 'The middle reading is 40. It qualifies, so index 2 is a possible answer.', prediction: 'Could an earlier reading qualify too? Which positions should we check next?' },
    { focus: 0, active: [0, 1], candidate: 2, explanation: 'Keep index 2 as a possible answer and inspect earlier positions. Later readings cannot be first because index 2 already qualifies.', prediction: '90 is above 75. What can we set aside?' },
    { focus: 1, active: [1], candidate: 2, explanation: '90 does not qualify, so only index 1 remains to check before the saved answer.', prediction: '80 is also above 75. Which index is the first match?' },
    { focus: null, active: [], candidate: 2, explanation: 'Neither earlier reading qualifies. The saved answer, index 2, is the first match.', prediction: 'With a threshold of 85, would index 2 still be first? Why?' },
  ],
};

let store: Store;
let app: ReturnType<typeof createApp>;
let replies: (() => Response)[];
let sent: { system: string; tools: { name: string }[]; messages: { role: string; content: unknown }[] }[];

beforeEach(() => {
  replies = [];
  sent = [];
  store = openStore(':memory:');
  const claude = new AnthropicBedrock({ skipAuth: true, awsRegion: 'eu-west-1', baseURL: 'http://bedrock.test', maxRetries: 0,
    fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      const reply = replies.shift();
      assert.ok(reply, 'each model request has a network response fixture');
      return reply();
    },
  });
  app = createApp({ store, claude });
});

afterEach(() => { store.close(); mock.timers.reset(); });

async function post(path: string, body: unknown) {
  const response = await app.request(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const events = (await response.text()).split('\n\n').filter(Boolean).map((raw) => ({
    event: raw.match(/^event: (.*)$/m)?.[1], data: JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? '{}'),
  }));
  return events;
}

test('worked examples stream a validated trace and persist it across reopening', async () => {
  store.createSession('s1', exampleProblem);
  replies.push(() => bedrockReply('40 qualifies, but an earlier value might qualify too.', [
    { name: 'record_hint', input: { rung: 4 } }, { name: 'show_trace', input: exampleTrace },
  ]), () => bedrockReply('Try predicting the next decision before revealing it.'));
  const events = await post('/sessions/s1/chat', { content: 'Show a worked example', code: exampleProblem.starterCode });
  assert.deepEqual(events.find((e) => e.event === 'trace')?.data.trace, exampleTrace);
  const done: SessionDetail = events.find((e) => e.event === 'done')!.data.session;
  assert.equal(done.hintsUsed, 1);
  assert.deepEqual(done.trace, exampleTrace);
  const reopened = await (await app.request('/api/sessions/s1')).json() as SessionDetail;
  assert.deepEqual(reopened.trace, exampleTrace);
  assert.ok(reopened.messages.at(-1)?.content.includes('Try predicting'));
  assert.deepEqual(reopened.problem.revealedConstraints, exampleProblem.constraints);
});

test('invalid cell indices are rejected without saving or streaming a broken illustration', async () => {
  store.createSession('s1', exampleProblem);
  replies.push(() => bedrockReply('', [{ name: 'show_trace', input: { ...exampleTrace, steps: [{ ...exampleTrace.steps[0], focus: 99 }] } }]),
    () => bedrockReply('Let us use a smaller example.'));
  const events = await post('/sessions/s1/chat', { content: 'Show an example', code: exampleProblem.starterCode });
  assert.equal(events.some((e) => e.event === 'trace'), false);
  assert.equal(events.find((e) => e.event === 'done')?.data.session.trace, null);
  assert.match(JSON.stringify(sent[1].messages), /Each index must identify a cell/);
});

test('independent attempts expose requirements tools but withhold coaching tools and the intended approach', async () => {
  store.createSession('s1', exampleProblem, 'independent');
  replies.push(() => bedrockReply('The readings can repeat.', [{ name: 'reveal_constraint', input: { constraint: exampleProblem.constraints[1] } }]),
    () => bedrockReply('You can choose Get teaching help if you want an example.'));
  const events = await post('/sessions/s1/chat', { content: 'Can readings repeat?', code: exampleProblem.starterCode });
  assert.deepEqual(sent[0].tools.map((t) => t.name), ['reveal_constraint']);
  assert.ok(!sent[0].system.includes(exampleProblem.approach));
  assert.ok(!sent[0].system.includes('Topic: binary-search'));
  assert.equal(events.find((e) => e.event === 'done')?.data.session.hintsUsed, 0);
  assert.deepEqual(events.find((e) => e.event === 'done')?.data.session.problem.revealedConstraints, [exampleProblem.constraints[1]]);
});

test('problem generation creates a guided session with requirements and a focused learning goal', async () => {
  const generated = {
    ...exampleProblem,
    visibleTests: exampleProblem.visibleTests.map((t) => ({ inputJson: JSON.stringify(t.input), expectedJson: JSON.stringify(t.expected) })),
    hiddenTests: Array.from({ length: 6 }, () => ({ inputJson: '[[],75]', expectedJson: '-1' })),
    largeTests: [],
  };
  replies.push(() => bedrockReply(JSON.stringify(generated)));
  const events = await post('/sessions', { topic: exampleProblem.topic, difficulty: 'easy' });
  assert.equal(events.some((e) => e.event === 'error'), false);
  const session: SessionDetail = events.find((e) => e.event === 'done')!.data.session;
  assert.equal(session.mode, 'guided');
  assert.equal(session.problem.learningGoal, exampleProblem.learningGoal);
  assert.deepEqual(session.problem.revealedConstraints, exampleProblem.constraints);
  assert.equal(session.referenceSolution, undefined);
});

test('a due review generates a different independent problem and reopening reuses that attempt', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const first = store.createSession('first', exampleProblem);
  store.updateSession(first.id, { status: 'solved' });
  store.scheduleReview(first, false);
  mock.timers.tick(2 * 86400000);
  const generated = { ...exampleProblem, title: 'Find the first affordable ticket',
    visibleTests: exampleProblem.visibleTests.map((t) => ({ inputJson: JSON.stringify(t.input), expectedJson: JSON.stringify(t.expected) })),
    hiddenTests: Array.from({ length: 6 }, () => ({ inputJson: '[[],75]', expectedJson: '-1' })), largeTests: [],
  };
  replies.push(() => bedrockReply(JSON.stringify(generated)));
  const body = { topic: exampleProblem.topic, difficulty: 'easy', mode: 'independent', reviewOf: first.id };
  const events = await post('/sessions', body);
  const session: SessionDetail = events.find((e) => e.event === 'done')!.data.session;
  assert.equal(session.mode, 'independent');
  assert.equal(session.reviewOf, first.id);
  assert.equal(session.problem.learningGoal, undefined);
  assert.match(JSON.stringify(sent[0].messages), /different scenario/);
  const again = await post('/sessions', body);
  assert.equal(again.find((e) => e.event === 'done')?.data.session.id, session.id);
  assert.equal(sent.length, 1, 'resuming does not generate another problem');
});

test('opening an existing database preserves code, messages and levels while enabling guided learning', () => {
  const folder = mkdtempSync(join(tmpdir(), 'coding-practice-migration-'));
  const path = join(folder, 'practice.db');
  try {
    const sql = new DatabaseSync(path);
    sql.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'coding', title TEXT NOT NULL, topic TEXT NOT NULL,
      difficulty TEXT NOT NULL, status TEXT NOT NULL, problem TEXT NOT NULL, code TEXT NOT NULL,
      revealed TEXT NOT NULL DEFAULT '[]', hints TEXT NOT NULL DEFAULT '[]', submissions INTEGER NOT NULL DEFAULT 0,
      progress_applied INTEGER NOT NULL DEFAULT 0, last_run TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, context TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE topic_levels (topic TEXT PRIMARY KEY, level TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
    sql.prepare(`INSERT INTO sessions (id, title, topic, difficulty, status, problem, code, hints, created_at, updated_at)
      VALUES ('old', ?, ?, ?, 'in_progress', ?, ?, '[1,2]', 1, 1)`)
      .run(exampleProblem.title, exampleProblem.topic, exampleProblem.difficulty, JSON.stringify(exampleProblem), 'saved work');
    sql.prepare("INSERT INTO messages (session_id, role, kind, content, created_at) VALUES ('old', 'user', 'chat', 'My earlier reasoning', 1)").run();
    sql.prepare("INSERT INTO topic_levels (topic, level, updated_at) VALUES ('binary-search', 'medium', 1)").run();
    sql.close();
    const migrated = openStore(path);
    migrated.close();
    const reopened = openStore(path);
    try {
      const session = reopened.getSession('old')!;
      assert.equal(session.mode, 'guided');
      assert.equal(session.code, 'saved work');
      assert.deepEqual(session.hints, [1, 2]);
      assert.equal(reopened.messages('old')[0].content, 'My earlier reasoning');
      assert.equal(reopened.levels()['binary-search'], 'medium');
      assert.equal(session.trace, null);
    } finally { reopened.close(); }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
