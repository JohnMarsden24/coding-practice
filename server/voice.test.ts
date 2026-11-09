import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Problem } from '../shared/types';
import { createApp } from './app';
import { createClaude } from './claude';
import { openStore } from './db';
import { whisperAvailable } from './voice';

const canSpeak = process.platform === 'darwin' && (await whisperAvailable());

const problem: Problem = {
  title: 'Merging crates on a loading dock',
  topic: 'stacks',
  difficulty: 'easy',
  statement: 'Crates with equal weights fuse when one lands on the other.',
  example: { input: '[2, 2]', output: '[4]', explanation: 'They fuse.' },
  functionName: 'mergeCrates',
  starterCode: 'function mergeCrates(weights: number[]): number[] {\n  // your code here\n}',
  prelude: '',
  adapter: '',
  constraints: [],
  compare: 'exact',
  visibleTests: [],
  hiddenTests: [],
  referenceSolution: '',
  approach: '',
};

test('transcribes speech using the problem vocabulary', { skip: !canSpeak && 'needs macOS say and whisper' }, async () => {
  const file = join(tmpdir(), `coding-practice-say-${process.pid}.aiff`);
  execFileSync('say', ['-o', file, 'So merge crates pushes each weight onto a stack, which is O of n.']);
  try {
    const store = openStore(':memory:');
    const { id } = store.createSession('s1', problem);
    const app = createApp({ store, claude: createClaude() });
    const res = await app.request(`/api/sessions/${id}/transcribe`, { method: 'POST', body: readFileSync(file) });
    assert.equal(res.status, 200);
    const { text } = (await res.json()) as { text: string };
    assert.match(text, /mergeCrates/);
    assert.match(text, /stack/i);
    assert.match(text, /O\(n\)/);
  } finally {
    rmSync(file, { force: true });
  }
});
