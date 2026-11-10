import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TOPICS, topicName, type TopicId } from '../shared/curriculum';
import type { Problem } from '../shared/types';

const run = promisify(execFile);

const model = () => process.env.WHISPER_MODEL || 'data/models/ggml-large-v3-turbo-q5_0.bin';
const whisperBin = () => process.env.WHISPER_BIN || 'whisper-cli';

let available: Promise<boolean> | undefined;

/** Whisper needs whisper-cli, ffmpeg and the model file. Checked once per server start. */
export function whisperAvailable(): Promise<boolean> {
  available ??= (async () => {
    if (!existsSync(model())) return false;
    try {
      await run('which', [whisperBin()]);
      await run('which', ['ffmpeg']);
      return true;
    } catch {
      return false;
    }
  })();
  return available;
}

// Spoken forms, because Whisper drops "of n log n" after "O" unless the prompt shows it spoken. writeBigO converts them.
const COMMON_TERMS =
  'O of 1, O of log n, O of n, O of n log n, O of n squared, Big O, time complexity, space complexity, array, hash map, hash set, index, pointer, loop, recursion, edge case, brute force, TypeScript, return, null, undefined';

const TOPIC_TERMS: Record<TopicId, string> = {
  'arrays-hashing': 'frequency count, Map, Set, prefix sum',
  'two-pointers': 'left pointer, right pointer, sorted array, swap',
  'sliding-window': 'window, shrink the window, expand, left and right',
  stacks: 'push, pop, peek, monotonic stack, brackets',
  'binary-search': 'midpoint, low, high, lower bound, sorted',
  'linked-lists': 'ListNode, head, tail, next, dummy node, fast and slow pointers',
  trees: 'TreeNode, root, left child, right child, leaf, BFS, DFS, in-order, depth',
  tries: 'trie, prefix, TrieNode, children, end of word',
  heaps: 'min heap, max heap, priority queue, push, pop, top',
  intervals: 'start, end, overlap, merge, sort by start',
  graphs: 'node, edge, neighbours, adjacency list, BFS, DFS, visited, queue, grid',
  backtracking: 'choose, explore, undo, recursion, subsets, permutations',
  greedy: 'greedy choice, sort, earliest end',
  'dynamic-programming': 'DP table, memoisation, subproblem, base case, bottom up, top down',
};

/** Words Whisper should expect, written as preceding text. Whisper weights the end most, so code names go last. */
export function vocabulary(problem: Problem): string {
  const params = problem.starterCode.match(/\(([^)]*)\)/)?.[1] ?? '';
  const paramNames = params
    .split(',')
    .map((p) => p.split(':')[0].trim())
    .filter(Boolean)
    .join(', ');
  const statement = problem.statement.replace(/[*_`#]/g, '').slice(0, 400);
  return `${topicName(problem.topic)} interview problem: ${problem.title}. ${statement} Terms: ${COMMON_TERMS}, ${TOPIC_TERMS[problem.topic]}. In the code, I call ${problem.functionName}(${paramNames}), so ${problem.functionName} takes ${paramNames}.`;
}

/** Vocabulary for open questions about any topic, when there's no problem to draw names from. */
export function studyVocabulary(): string {
  return `Questions about data structures, algorithms and coding interviews. Topics: ${TOPICS.map((t) => t.name).join(', ')}. Terms: monotonic stack, trie, heap, BFS, DFS, memoisation, ${COMMON_TERMS}.`;
}

const BIG_O: [RegExp, string][] = [
  [/\bO of (?:N|n) (?:squared|to the power of two)\b/g, 'O(n²)'],
  [/\bO of (?:N|n) log (?:N|n)\b/g, 'O(n log n)'],
  [/\bO of (?:N|n) log (?:K|k)\b/g, 'O(n log k)'],
  [/\bO of log (?:N|n)\b/g, 'O(log n)'],
  [/\bO of (?:N|n) plus (?:M|m)\b/g, 'O(n + m)'],
  [/\bO of (?:N|n)\b/g, 'O(n)'],
  [/\bO of (?:1|one)\b/g, 'O(1)'],
];

/** Writes spoken complexity the way it's written, such as "O of N log N" as "O(n log n)". */
export function writeBigO(text: string): string {
  return BIG_O.reduce((t, [pattern, written]) => t.replace(pattern, written), text);
}

export async function transcribe(audio: Uint8Array, prompt: string): Promise<string> {
  const base = join(tmpdir(), `coding-practice-voice-${randomUUID()}`);
  const input = `${base}.audio`;
  const wav = `${base}.wav`;
  try {
    await writeFile(input, audio);
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    const { stdout } = await run(whisperBin(), ['-m', model(), '-f', wav, '-nt', '-np', '-l', 'en', '--prompt', prompt], {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
    return writeBigO(
      stdout
        .replace(/\[[^\]]*\]|\((?:silence|music|inaudible)\)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  } finally {
    await Promise.all([rm(input, { force: true }), rm(wav, { force: true })]);
  }
}
