import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runTests } from './runner';

const twoSumTests = [
  { name: 'Test 1', hidden: false, input: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { name: 'Hidden 1', hidden: true, input: [[3, 3], 6], expected: [0, 1] },
];

test('passes correct code and reports output and logs', async () => {
  const result = await runTests({
    functionName: 'twoSum',
    compare: 'unordered',
    tests: twoSumTests,
    code: `function twoSum(nums: number[], target: number): number[] {
      const seen = new Map<number, number>();
      for (let i = 0; i < nums.length; i++) {
        console.log('checking', nums[i]);
        const j = seen.get(target - nums[i]);
        if (j !== undefined) return [i, j];
        seen.set(nums[i], i);
      }
      return [];
    }`,
  });
  assert.equal(result.passed, 2);
  assert.deepEqual(result.results[0].actual, [1, 0]);
  assert.equal(result.results[0].logs?.[0], 'checking 2');
});

test('reports wrong answers and thrown errors per test', async () => {
  const result = await runTests({
    functionName: 'twoSum',
    compare: 'exact',
    tests: twoSumTests,
    code: `function twoSum(nums: number[], target: number) {
      if (nums.length === 2) throw new RangeError('too short');
      return [1, 2];
    }`,
  });
  assert.equal(result.passed, 0);
  assert.deepEqual(result.results[0].actual, [1, 2]);
  assert.equal(result.results[1].error, 'RangeError: too short');
});

test('returns a compile error with a line number', async () => {
  const result = await runTests({
    functionName: 'twoSum',
    compare: 'exact',
    tests: twoSumTests,
    code: `function twoSum(nums: number[] {\n  return [];\n}`,
  });
  assert.match(result.compileError ?? '', /^Line 1:/);
});

test('says when the function name is missing', async () => {
  const result = await runTests({ functionName: 'twoSum', compare: 'exact', tests: twoSumTests, code: 'function other() {}' });
  assert.match(result.results[0].error ?? '', /No function called twoSum/);
});

test('marks unfinished tests as too slow when the time limit hits', async () => {
  const result = await runTests({
    functionName: 'spin',
    compare: 'exact',
    timeoutMs: 1000,
    tests: [
      { name: 'Test 1', hidden: false, input: [false], expected: 1 },
      { name: 'Test 2', hidden: false, input: [true], expected: 1 },
    ],
    code: 'function spin(forever: boolean) { while (forever) {} return 1; }',
  });
  assert.equal(result.results[0].passed, true);
  assert.equal(result.results[1].timedOut, true);
});

test('builds large inputs from generators and converts arguments with an adapter', async () => {
  const result = await runTests({
    functionName: 'sumList',
    compare: 'exact',
    prelude: 'class ListNode { constructor(public val: number, public next: ListNode | null = null) {} }',
    adapter: `function adapt(fn: Function, args: any[]) {
      let head = null;
      for (const v of [...args[0]].reverse()) head = new ListNode(v, head);
      return fn(head);
    }`,
    tests: [{ name: 'Large', hidden: true, generator: '[Array.from({ length: 100000 }, () => 1)]', expected: 100000 }],
    code: 'function sumList(head: ListNode | null) { let s = 0; for (let n = head; n; n = n.next) s += n.val; return s; }',
  });
  assert.equal(result.passed, 1);
});
