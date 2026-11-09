import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transform } from 'esbuild';
import type { RunResult, TestCase, TestResult } from '../shared/types';

export interface RunRequest {
  code: string;
  functionName: string;
  prelude?: string;
  adapter?: string;
  tests: (TestCase & { name: string; hidden: boolean })[];
  compare: 'exact' | 'unordered';
  timeoutMs?: number;
}

const RESULT_MARK = '__CODING_PRACTICE_RESULT__';

async function compile(source: string, label: string): Promise<string> {
  if (!source.trim()) return '';
  try {
    const out = await transform(source, { loader: 'ts', target: 'es2023' });
    return out.code;
  } catch (error) {
    const messages = (error as { errors?: { text: string; location?: { line: number; column: number } }[] }).errors;
    if (!messages?.length) throw error;
    const detail = messages
      .map((m) => (m.location ? `Line ${m.location.line}:${m.location.column}: ${m.text}` : m.text))
      .join('\n');
    throw new CompileError(label === 'your code' ? detail : `${label}: ${detail}`);
  }
}

class CompileError extends Error {}

function harness(functionName: string, hasAdapter: boolean): string {
  return `
const __write = process.stdout.write.bind(process.stdout);
const __logs = [];
const __fmt = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
console.log = console.info = console.warn = console.error = console.debug = (...args) => {
  if (__logs.length < 50) __logs.push(args.map(__fmt).join(' ').slice(0, 500));
};
const __fn = typeof ${functionName} === 'function' ? ${functionName} : undefined;
const __adapt = ${hasAdapter ? 'adapt' : '(fn, args) => fn(...args)'};
let __stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { __stdin += d; });
process.stdin.on('end', async () => {
  const tests = JSON.parse(__stdin);
  for (let i = 0; i < tests.length; i++) {
    __logs.length = 0;
    const t = tests[i];
    let line;
    try {
      if (!__fn) throw new Error('No function called ${functionName} was found. Keep the name from the starter code.');
      const args = t.generator ? (new Function('return (' + t.generator + ')'))() : structuredClone(t.input);
      const start = performance.now();
      let actual = __adapt(__fn, args);
      if (actual instanceof Promise) actual = await actual;
      const ms = performance.now() - start;
      actual = actual === undefined ? null : JSON.parse(JSON.stringify(actual));
      line = { i, ok: true, actual, ms, logs: [...__logs] };
    } catch (e) {
      line = { i, ok: false, error: e instanceof Error ? e.name + ': ' + e.message : String(e), logs: [...__logs] };
    }
    __write('${RESULT_MARK}' + JSON.stringify(line) + '\\n');
  }
  process.exit(0);
});
`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) < 1e-6;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return (
    ka.length === kb.length &&
    ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function matches(actual: unknown, expected: unknown, compare: 'exact' | 'unordered'): boolean {
  if (compare === 'unordered' && Array.isArray(actual) && Array.isArray(expected)) {
    const a = actual.map(canonical).sort();
    const e = expected.map(canonical).sort();
    return a.length === e.length && a.every((v, i) => v === e[i]);
  }
  return deepEqual(actual, expected);
}

/** Runs the tests and reports each one. Tests with a generator and no expected value just report their output. */
export async function runTests(req: RunRequest): Promise<RunResult> {
  const results: TestResult[] = req.tests.map((t) => ({
    name: t.name,
    hidden: t.hidden,
    passed: false,
    input: t.input,
    expected: t.expected,
  }));

  let program: string;
  try {
    const [prelude, code, adapter] = await Promise.all([
      compile(req.prelude ?? '', 'Provided code'),
      compile(req.code, 'your code'),
      compile(req.adapter ?? '', 'Test adapter'),
    ]);
    program = [prelude, code, adapter, harness(req.functionName, Boolean(adapter.trim()))].join('\n;\n');
  } catch (error) {
    if (error instanceof CompileError) return { passed: 0, total: results.length, compileError: error.message, results };
    throw error;
  }

  const file = join(tmpdir(), `coding-practice-${randomUUID()}.mjs`);
  await writeFile(file, program);

  try {
    const { lines, stderr, timedOut } = await execute(file, req.tests, req.timeoutMs ?? 5000);
    for (const line of lines) {
      const r = results[line.i];
      r.logs = line.logs;
      if (line.ok) {
        r.actual = line.actual;
        r.ms = Math.round(line.ms * 10) / 10;
        r.passed = matches(line.actual, req.tests[line.i].expected, req.compare);
      } else {
        r.error = line.error;
      }
    }
    const reported = new Set(lines.map((l) => l.i));
    for (const [i, r] of results.entries()) {
      if (reported.has(i)) continue;
      if (timedOut) {
        r.timedOut = true;
        r.error = 'Too slow: the run hit the time limit before this test finished.';
      } else {
        r.error = cleanStderr(stderr) || 'The program stopped before this test ran.';
      }
    }
  } finally {
    await rm(file, { force: true });
  }

  return { passed: results.filter((r) => r.passed).length, total: results.length, results };
}

function cleanStderr(stderr: string): string {
  return stderr
    .split('\n')
    .filter((l) => !l.includes('coding-practice-') && !l.startsWith('    at ') && !l.startsWith('Node.js v'))
    .join('\n')
    .trim()
    .slice(0, 1000);
}

interface Line {
  i: number;
  ok: boolean;
  actual?: unknown;
  ms: number;
  error?: string;
  logs: string[];
}

function execute(file: string, tests: TestCase[], timeoutMs: number) {
  return new Promise<{ lines: Line[]; stderr: string; timedOut: boolean }>((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', '--stack-size=4000', file], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines: Line[] = [];
    let buffer = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const at = raw.indexOf(RESULT_MARK);
        if (at >= 0) lines.push(JSON.parse(raw.slice(at + RESULT_MARK.length)));
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 20000) stderr += chunk;
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ lines, stderr, timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(tests.map((t) => ({ input: t.input, generator: t.generator }))));
  });
}
