import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { crc32 } from 'node:zlib';
import type { AppState, LearnChatDetail } from '../shared/types';
import { createApp } from './app';
import { openStore } from './db';

/** One frame of AWS's binary event stream, the format Bedrock streams replies in. */
function frame(payload: unknown): Buffer {
  const headers = Buffer.concat(
    Object.entries({ ':event-type': 'chunk', ':message-type': 'event', ':content-type': 'application/json' }).map(([name, value]) => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(Buffer.byteLength(value));
      return Buffer.concat([Buffer.from([name.length]), Buffer.from(name), Buffer.from([7]), length, Buffer.from(value)]);
    }),
  );
  const body = Buffer.from(JSON.stringify({ bytes: Buffer.from(JSON.stringify(payload)).toString('base64') }));
  const prelude = Buffer.alloc(8);
  prelude.writeUInt32BE(16 + headers.length + body.length, 0);
  prelude.writeUInt32BE(headers.length, 4);
  const preludeCrc = Buffer.alloc(4);
  preludeCrc.writeUInt32BE(crc32(prelude));
  const message = Buffer.concat([prelude, preludeCrc, headers, body]);
  const messageCrc = Buffer.alloc(4);
  messageCrc.writeUInt32BE(crc32(message));
  return Buffer.concat([message, messageCrc]);
}

function bedrockReply(text: string): Response {
  const events = [
    {
      type: 'message_start',
      message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'test', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.split(/(?<= )/).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return new Response(Buffer.concat(events.map(frame)), { headers: { 'content-type': 'application/vnd.amazon.eventstream' } });
}

let replies: (() => Response)[];
let sent: { system: string; messages: { role: string; content: string }[] }[];
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  replies = [];
  sent = [];
  const claude = new AnthropicBedrock({
    skipAuth: true,
    awsRegion: 'eu-west-1',
    baseURL: 'http://bedrock.test',
    maxRetries: 0,
    fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return replies.shift()!();
    },
  });
  app = createApp({ store: openStore(':memory:'), claude });
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

/** Sends a message and reads the server-sent events back. */
async function ask(path: string, content: string) {
  const res = await app.request(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const events = (await res.text())
    .split('\n\n')
    .filter(Boolean)
    .map((raw) => ({
      event: raw.match(/^event: (.*)$/m)?.[1],
      data: JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? 'null'),
    }));
  const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  return { text, done: events.find((e) => e.event === 'done')?.data, error: events.find((e) => e.event === 'error')?.data };
}

test('asking a question starts a saved chat that keeps its history', async () => {
  replies.push(() => bedrockReply('A monotonic stack stays sorted as you push.'));
  const first = await ask('/learn', 'What is a monotonic stack and when would I reach for one in an interview?');
  assert.equal(first.text, 'A monotonic stack stays sorted as you push.');
  const chat: LearnChatDetail = first.done.chat;
  assert.equal(chat.title, 'What is a monotonic stack and when would I reach for one in…');
  assert.match(sent[0].system, /Arrays and hashing: easy/, 'Claude knows their levels');

  replies.push(() => bedrockReply('Next greater element is the classic one.'));
  const second = await ask(`/learn/${chat.id}`, 'Give me an example problem');
  assert.deepEqual(
    sent[1].messages.map((m) => m.content),
    ['What is a monotonic stack and when would I reach for one in an interview?', 'A monotonic stack stays sorted as you push.', 'Give me an example problem'],
  );
  assert.equal(second.done.chat.messages.length, 4);

  const { data: state } = await call<AppState>('GET', '/state');
  assert.deepEqual(state.learnChats.map((c) => c.title), [chat.title]);
  assert.equal(state.sessions.length, 0, 'learn chats are not practice sessions');
});

test('a failed reply leaves no chat behind', async () => {
  replies.push(() => new Response(JSON.stringify({ message: 'Bad request' }), { status: 400 }));
  const { error } = await ask('/learn', 'Explain tries');
  assert.ok(error, 'the client is told it failed');
  const { data: state } = await call<AppState>('GET', '/state');
  assert.equal(state.learnChats.length, 0);
});

test('learn chats can be renamed and deleted', async () => {
  replies.push(() => bedrockReply('Sure.'));
  const { done } = await ask('/learn', 'Explain heaps');
  const id = done.chat.id;

  await call('PATCH', `/learn/${id}`, { title: 'Heaps' });
  assert.equal((await call<LearnChatDetail>('GET', `/learn/${id}`)).data.title, 'Heaps');

  await call('DELETE', `/learn/${id}`);
  assert.equal((await call('GET', `/learn/${id}`)).status, 404);
});
