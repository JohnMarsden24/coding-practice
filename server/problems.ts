import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { topicName, type Level, type TopicId } from '../shared/curriculum';
import type { Problem, PublicProblem, TestCase } from '../shared/types';
import { models, type Claude } from './claude';
import { runTests, type RunRequest } from './runner';

const Generated = z.object({
  title: z.string(),
  statement: z.string(),
  example: z.object({ input: z.string(), output: z.string(), explanation: z.string() }),
  functionName: z.string(),
  starterCode: z.string(),
  prelude: z.string(),
  adapter: z.string(),
  constraints: z.array(z.string()),
  compare: z.enum(['exact', 'unordered']),
  visibleTests: z.array(z.object({ inputJson: z.string(), expectedJson: z.string() })),
  hiddenTests: z.array(z.object({ inputJson: z.string(), expectedJson: z.string() })),
  largeTests: z.array(z.object({ generatorJs: z.string(), description: z.string() })),
  referenceSolution: z.string(),
  approach: z.string(),
});

type Generated = z.infer<typeof Generated>;

const SYSTEM = `You write original coding interview practice problems for an experienced software engineer who is preparing for interviews. Problems are solved in TypeScript, and a test harness checks them automatically.

Write problems that feel like a real interview question: a small, concrete scenario, clearly solvable in 30 to 45 minutes, that exercises the requested topic at the requested difficulty. Write your own problems rather than restating well known ones word for word.

The candidate practises clarifying requirements, so split the details:
- statement: two to five sentences of markdown describing the task. Leave out input sizes, value ranges, and edge case rules.
- constraints: the details held back until the candidate asks, one per item. Cover input size, value ranges, duplicates, negatives, empty input, ordering, ties, and what to return when there is no answer, whichever apply.
- example: one small example with input, output, and a one-sentence explanation.

Code and tests:
- functionName: a camelCase function name. starterCode: the full TypeScript signature with typed parameters and return type, and an empty body containing only "// your code here".
- Tests pass arguments as JSON. Each inputJson is a JSON array of the arguments in order, and expectedJson is the JSON return value.
- When the topic needs linked lists or trees, put the node class in prelude (for example "class ListNode { val: number; next: ListNode | null; constructor(val = 0, next: ListNode | null = null) { this.val = val; this.next = next; } }"). Then write adapter as a TypeScript function named adapt(fn: Function, args: any[]): any that converts the JSON arguments into nodes, calls fn, and converts the result back to JSON (arrays for lists, level-order arrays with null for trees). Otherwise leave prelude and adapter as empty strings.
- compare: "unordered" when any order of a top-level array result is correct, otherwise "exact".
- visibleTests: exactly 3 simple tests, the first matching the example.
- hiddenTests: 6 to 9 tests covering edge cases from the constraints. Work each expected value out carefully.
- largeTests: 1 or 2 tests whose generatorJs is a plain JavaScript expression that builds the argument array for an input at the maximum size in the constraints, for example "[Array.from({ length: 100000 }, (_, i) => (i * 7919) % 100003)]". Make the generator deterministic. Pick sizes where the intended solution finishes in well under a second and a brute force solution of a worse complexity class takes several seconds. Keep the return value small, such as a number, a boolean, or a short array. The harness computes expected values for these from your reference solution.
- referenceSolution: a correct, clean TypeScript solution using the same signature. The harness runs it against every test.
- approach: a short explanation of the intended approach, its time and space complexity, and the key insight, for the engineer who gives hints. Mention any other valid approaches.`;

export interface GenerateOptions {
  topic: TopicId;
  difficulty: Level;
  avoidTitles: string[];
  onStatus?: (text: string) => void;
}

export async function generateProblem(claude: Claude, opts: GenerateOptions): Promise<Problem> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        `Write a ${opts.difficulty} problem on the topic "${topicName(opts.topic)}".`,
        opts.avoidTitles.length
          ? `The candidate has already practised these, so make it clearly different:\n${opts.avoidTitles.map((t) => `- ${t}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    opts.onStatus?.(attempt === 1 ? 'Writing your problem…' : `Fixing the tests (attempt ${attempt} of 3)…`);
    const stream = claude.messages.stream({
      model: models.deep,
      max_tokens: 32000,
      system: SYSTEM,
      output_config: { effort: 'high', format: zodOutputFormat(Generated) },
      messages,
    });
    const final = await stream.finalMessage();
    const text = final.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    if (final.stop_reason !== 'end_turn') throw new Error(`Problem generation stopped early (${final.stop_reason}).`);

    opts.onStatus?.('Checking the tests against a reference solution…');
    const parsed = Generated.safeParse(safeJson(text));
    const checked = parsed.success
      ? await check(parsed.data, opts)
      : { problems: [`The response did not match the schema: ${parsed.error.message}`] };
    if ('problem' in checked) return checked.problem;

    lastProblems = checked.problems;
    messages.push(
      { role: 'assistant', content: final.content },
      {
        role: 'user',
        content: `The harness found these problems:\n${checked.problems.map((p) => `- ${p}`).join('\n')}\n\nFix them and return the complete corrected problem. If an expected value is wrong, recompute it carefully. If the reference solution is wrong, fix the solution.`,
      },
    );
  }
  throw new Error(`Couldn't produce a problem whose tests check out. Last issues: ${lastProblems.slice(0, 3).join('; ')}`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function check(g: Generated, opts: GenerateOptions): Promise<{ problem: Problem } | { problems: string[] }> {
  const problems: string[] = [];
  const parseTest = (t: { inputJson: string; expectedJson: string }, label: string): TestCase | undefined => {
    const input = safeJson(t.inputJson);
    const expected = safeJson(t.expectedJson);
    if (!Array.isArray(input)) problems.push(`${label}: inputJson must be a JSON array of arguments, got ${t.inputJson}`);
    if (expected === undefined && t.expectedJson.trim() !== 'null') problems.push(`${label}: expectedJson is not valid JSON`);
    return Array.isArray(input) ? { input, expected: expected ?? null } : undefined;
  };

  const visible = g.visibleTests.map((t, i) => parseTest(t, `Visible test ${i + 1}`));
  const hidden = g.hiddenTests.map((t, i) => parseTest(t, `Hidden test ${i + 1}`));
  if (g.visibleTests.length !== 3) problems.push(`There must be exactly 3 visible tests, not ${g.visibleTests.length}.`);
  if (g.hiddenTests.length < 5) problems.push('Add more hidden edge case tests (at least 6).');
  if (!new RegExp(`\\b${g.functionName}\\b`).test(g.starterCode)) problems.push('starterCode must declare functionName.');
  if (problems.length) return { problems };

  const draft: Problem = {
    title: g.title,
    topic: opts.topic,
    difficulty: opts.difficulty,
    statement: g.statement,
    example: g.example,
    functionName: g.functionName,
    starterCode: g.starterCode,
    prelude: g.prelude,
    adapter: g.adapter,
    constraints: g.constraints,
    compare: g.compare,
    visibleTests: visible as TestCase[],
    hiddenTests: [...(hidden as TestCase[]), ...g.largeTests.map((t) => ({ generator: t.generatorJs, expected: null }))],
    referenceSolution: g.referenceSolution,
    approach: g.approach,
  };

  const tests = testsFor(draft, 'all');
  const result = await runTests({ ...runSettings(draft, g.referenceSolution), tests, timeoutMs: 10000 });
  if (result.compileError) return { problems: [`The reference solution doesn't compile: ${result.compileError}`] };

  const starter = await runTests({ ...runSettings(draft, g.starterCode), tests: testsFor(draft, 'visible') });
  if (starter.compileError) problems.push(`starterCode doesn't compile: ${starter.compileError}`);

  for (const [i, r] of result.results.entries()) {
    const test = tests[i];
    if (test.generator) {
      if (r.error) problems.push(`${r.name} (${test.generator}): the reference solution failed with ${r.error}`);
      else if ((r.ms ?? 0) > 1500) problems.push(`${r.name}: the reference solution took ${r.ms}ms. Use a smaller input.`);
      else if (JSON.stringify(r.actual).length > 20000) problems.push(`${r.name}: the return value is too large. Choose a problem or input where it is small.`);
      else test.expected = r.actual;
    } else if (!r.passed) {
      problems.push(
        `${r.name} with input ${JSON.stringify(test.input)}: expected ${JSON.stringify(test.expected)} but the reference solution ${r.error ? `threw ${r.error}` : `returned ${JSON.stringify(r.actual)}`}`,
      );
    }
  }
  if (problems.length) return { problems };

  const large = tests.filter((t) => t.generator);
  draft.hiddenTests = draft.hiddenTests.map((t) => (t.generator ? { ...t, expected: large.find((l) => l.generator === t.generator)!.expected } : t));
  return { problem: draft };
}

export function runSettings(problem: Problem, code: string): Omit<RunRequest, 'tests'> {
  return { code, functionName: problem.functionName, prelude: problem.prelude, adapter: problem.adapter, compare: problem.compare };
}

export function testsFor(problem: Problem, which: 'visible' | 'all'): RunRequest['tests'] {
  const visible = problem.visibleTests.map((t, i) => ({ ...t, name: `Test ${i + 1}`, hidden: false }));
  if (which === 'visible') return visible;
  let hiddenCount = 0;
  let largeCount = 0;
  const hidden = problem.hiddenTests.map((t) => ({
    ...t,
    name: t.generator ? `Large input ${++largeCount}` : `Hidden ${++hiddenCount}`,
    hidden: true,
  }));
  return [...visible, ...hidden];
}

export function publicProblem(problem: Problem, revealed: string[]): PublicProblem {
  return {
    title: problem.title,
    topic: problem.topic,
    difficulty: problem.difficulty,
    statement: problem.statement,
    example: problem.example,
    functionName: problem.functionName,
    prelude: problem.prelude,
    revealedConstraints: revealed,
    visibleTests: problem.visibleTests.map((t) => ({ input: t.input ?? [], expected: t.expected })),
    hiddenTestCount: problem.hiddenTests.length,
  };
}
