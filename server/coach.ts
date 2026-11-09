import type Anthropic from '@anthropic-ai/sdk';
import type { RunResult } from '../shared/types';
import { models, type Claude } from './claude';
import type { SessionRow, StoredMessage } from './db';

export type Emit = (event: string, data: unknown) => Promise<void>;

export const OPENING_GREETING = "Hi, I'm ready for a problem.";

export function openingMessage(title: string): string {
  return `Here's your problem: **${title}**. Have a read of the statement on the right.\n\nBefore we get into solutions, can you tell me in your own words what it's asking? Ask me anything you'd want to clarify too, like input sizes or edge cases.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'reveal_constraint',
    description:
      'Call this whenever you tell the candidate one of the held-back constraints, so it is added to the notes on their problem panel. Write the constraint the way it would appear in a problem statement.',
    input_schema: {
      type: 'object',
      properties: { constraint: { type: 'string', description: 'The constraint, for example "1 ≤ nums.length ≤ 10⁵".' } },
      required: ['constraint'],
      additionalProperties: false,
    },
  },
  {
    name: 'record_hint',
    description: 'Call this every time you give a hint from the hint ladder, with the rung you gave.',
    input_schema: {
      type: 'object',
      properties: { rung: { type: 'integer', enum: [1, 2, 3, 4] } },
      required: ['rung'],
      additionalProperties: false,
    },
  },
];

function chatSystem(session: SessionRow): string {
  const p = session.problem;
  return `You're a senior software engineer pairing with a fellow engineer who is practising for coding interviews. They have six years of industry experience but no computer science degree, so they know how to build software and are filling gaps in data structures and algorithms. You're a peer helping them think, not an interviewer grading them.

How to talk
- Be warm, direct and brief: usually two to four sentences. Ask one question at a time.
- Messages may come from speech recognition, so read them generously ("oh of n" means O(n), "hash mat" means hash map).
- Use markdown sparingly. Inline code is fine. Don't write code blocks longer than a couple of lines.

How the session runs
1. Understand. You opened by asking them to restate the problem. Confirm or gently correct their understanding. Answer clarifying questions truthfully from the held-back constraints below, and call reveal_constraint for each one you tell them. Don't volunteer constraints they haven't asked about. If they move on without asking about something important, you may ask once whether there's anything else they'd want to know first.
2. Approach. Before they code, ask them to talk through their approach and its time and space complexity. If their code shows they've started without doing this, nudge them once to talk it through. Engage with their idea on its merits. If it works, say so, even if it isn't the intended approach. If it's correct but slow, ask questions that help them see why.
3. Code. Each of their messages ends with a <workspace> block holding their current code and latest test run. Don't comment on the code unless they ask, they've just run the tests, or they seem stuck.
4. Test and submit. Encourage them to trace an example or edge case by hand. Submitting is their call. After a submission you'll see the result, and feedback from a reviewer may follow in the conversation. Help them with follow-up questions.

Hints
Only give a hint when they ask for help or are clearly stuck, for example they say they don't know, they repeat the same failing idea, or their runs keep failing the same way. Climb this ladder one rung at a time, starting from the rung after the highest one already given (the workspace lists hints given so far):
1. A question back to them that points at what to look at ("what's slow about the current approach?").
2. A pointer towards the idea without naming it ("is there a structure that gives you constant time lookups?").
3. The pattern or technique by name, and why it fits.
4. A pseudocode skeleton of the approach in plain steps, not TypeScript.
Call record_hint with the rung number every time you give a hint. Explaining the problem, answering a clarifying question, and helping with TypeScript syntax or standard library calls are not hints.

Never write the solution or fix their code for them while the session is open, even if they ask. Offer the next rung instead, and mention that the Give up button shows a full solution with a walkthrough.

<problem>
Title: ${p.title}
Topic: ${p.topic}, ${p.difficulty}
Statement shown to them:
${p.statement}
Example: ${p.example.input} → ${p.example.output} (${p.example.explanation})
Starter code:
${p.starterCode}
${p.prelude ? `Provided code:\n${p.prelude}` : ''}
</problem>

<held_back_constraints>
${p.constraints.map((c) => `- ${c}`).join('\n')}
</held_back_constraints>

<intended_approach>
This is private context for giving good hints. Don't reveal it except through the hint ladder.
${p.approach}
</intended_approach>`;
}

function clip(value: unknown, max = 300): string {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function summariseRun(run: RunResult | null, detailHidden = false): string {
  if (!run) return 'No tests run yet.';
  if (run.compileError) return `Compile error:\n${run.compileError}`;
  const lines = [`${run.passed} of ${run.total} tests passed.`];
  for (const r of run.results) {
    if (r.passed) continue;
    const showInput = detailHidden || !r.hidden;
    const what = r.timedOut
      ? 'too slow (hit the time limit)'
      : r.error
        ? `threw ${r.error}`
        : showInput
          ? `expected ${clip(r.expected)} but got ${clip(r.actual)}`
          : 'wrong answer';
    lines.push(`- ${r.name} failed${showInput && r.input ? ` on input ${clip(r.input)}` : ''}: ${what}`);
  }
  return lines.join('\n');
}

export function workspaceContext(session: SessionRow, code: string): string {
  const hints = session.hints.length ? `rungs ${session.hints.join(', ')}` : 'none';
  const revealed = session.revealed.length ? session.revealed.map((c) => `- ${c}`).join('\n') : 'none yet';
  return `<workspace>
Hints given so far: ${hints}
Constraints revealed so far:
${revealed}
Submissions so far: ${session.submissions}
Their current code:
\`\`\`ts
${code}
\`\`\`
Latest run of the visible tests:
${summariseRun(session.lastRun)}
</workspace>`;
}

/** Rebuilds the conversation from stored messages, so every request extends the previous one unchanged. */
export function buildHistory(stored: StoredMessage[]): Anthropic.MessageParam[] {
  const turns: { role: 'user' | 'assistant'; parts: string[] }[] = [{ role: 'user', parts: [OPENING_GREETING] }];
  for (const m of stored) {
    const text =
      m.kind === 'event' ? `[${m.content}]` : m.context ? `${m.content}\n\n${m.context}` : m.content;
    const last = turns[turns.length - 1];
    if (last.role === m.role) last.parts.push(text);
    else turns.push({ role: m.role, parts: [text] });
  }
  return turns.map((t) => ({ role: t.role, content: t.parts.join('\n\n') }));
}

export interface ChatOutcome {
  reply: string;
  revealed: string[];
  hints: number[];
}

export async function chatTurn(
  claude: Claude,
  session: SessionRow,
  history: Anthropic.MessageParam[],
  emit: Emit,
): Promise<ChatOutcome> {
  const messages = [...history];
  const revealed = [...session.revealed];
  const hints = [...session.hints];
  let reply = '';

  for (let round = 0; round < 4; round++) {
    const stream = claude.messages.stream({
      model: models.chat,
      max_tokens: 4000,
      system: chatSystem(session),
      output_config: { effort: 'medium' },
      tools: TOOLS,
      messages,
    });
    let separated = reply === '';
    stream.on('text', (delta) => {
      if (!separated && delta.trim()) {
        separated = true;
        if (!/\s$/.test(reply)) {
          reply += '\n\n';
          void emit('delta', { text: '\n\n' });
        }
      }
      reply += delta;
      void emit('delta', { text: delta });
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      reply ||= "Sorry, I can't help with that one.";
      break;
    }
    if (final.stop_reason !== 'tool_use') break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as { constraint?: unknown; rung?: unknown };
      if (block.name === 'reveal_constraint' && typeof input.constraint === 'string' && input.constraint.trim()) {
        const constraint = input.constraint.trim();
        if (!revealed.includes(constraint)) {
          revealed.push(constraint);
          await emit('constraint', { constraint });
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Added to their notes.' });
      } else if (block.name === 'record_hint' && [1, 2, 3, 4].includes(input.rung as number)) {
        hints.push(input.rung as number);
        await emit('hint', { rung: input.rung, total: hints.length });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Recorded. Hints given: ${hints.length}.` });
      } else {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Invalid input.', is_error: true });
      }
    }
    messages.push({ role: 'assistant', content: final.content }, { role: 'user', content: results });
  }

  return { reply: reply.trim(), revealed, hints };
}

function transcript(stored: StoredMessage[]): string {
  return stored
    .map((m) =>
      m.kind === 'event'
        ? `[${m.content}]`
        : `${m.role === 'user' ? 'Candidate' : m.kind === 'feedback' ? 'Reviewer' : 'Engineer'}: ${m.content}`,
    )
    .join('\n\n');
}

function reviewContext(session: SessionRow, stored: StoredMessage[], code: string, run: RunResult): string {
  const p = session.problem;
  return `<problem>
${p.title} (${p.topic}, ${p.difficulty})
${p.statement}
Example: ${p.example.input} → ${p.example.output}
</problem>

<constraints>
${p.constraints.map((c) => `- ${c}`).join('\n')}
</constraints>
<constraints_they_uncovered>
${session.revealed.map((c) => `- ${c}`).join('\n') || 'none'}
</constraints_they_uncovered>

<intended_approach>
${p.approach}
</intended_approach>

<reference_solution>
${p.referenceSolution}
</reference_solution>

<conversation>
${transcript(stored)}
</conversation>

<their_code>
${code}
</their_code>

<test_results>
${summariseRun(run, true)}
</test_results>

Hints given: ${session.hints.length ? `${session.hints.length} (rungs ${session.hints.join(', ')})` : 'none'}.`;
}

async function streamText(claude: Claude, system: string, content: string, emit: Emit): Promise<string> {
  const stream = claude.messages.stream({
    model: models.deep,
    max_tokens: 16000,
    system,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content }],
  });
  stream.on('text', (delta) => void emit('delta', { text: delta }));
  const final = await stream.finalMessage();
  return final.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
}

export function feedback(claude: Claude, session: SessionRow, stored: StoredMessage[], code: string, run: RunResult, emit: Emit) {
  return streamText(
    claude,
    'You give feedback on a practice coding interview as a fellow senior engineer. Be honest, specific and encouraging, without empty praise. The candidate has six years of industry experience and no computer science degree.',
    `${reviewContext(session, stored, code, run)}

This is submission ${session.submissions}. Write feedback in markdown with exactly two sections, "### What worked well" and "### What to work on", with two to four short bullets each. Cover correctness (from the test results), the time and space complexity of their solution compared with the best possible, code clarity, and how well they talked through their reasoning in the conversation. Under What to work on, mention any important constraint they never asked about. If tests failed, say what kind of case failed and point towards the cause without writing the fix, because they may fix it and resubmit. Describe hidden tests by the kind of case they cover, never by their inputs or expected values. Don't include solution code.`,
    emit,
  );
}

export function walkthrough(claude: Claude, session: SessionRow, stored: StoredMessage[], code: string, emit: Emit) {
  return streamText(
    claude,
    'You explain a model solution to a practice coding interview problem as a fellow senior engineer. The candidate has six years of industry experience and no computer science degree.',
    `${reviewContext(session, stored, code, session.lastRun ?? { passed: 0, total: 0, results: [] })}

They've given up and the reference solution is now shown next to the chat. Walk them through it in markdown, in under 300 words: the key insight, how the solution works step by step, why it's correct, and its time and space complexity. Then say briefly how it relates to what they tried, so they can see where their thinking was heading. Refer to the code they can see rather than repeating it in full. Short snippets are fine.`,
    emit,
  );
}
