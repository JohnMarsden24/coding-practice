import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { RunResult, SessionMode, TeachingTrace } from '../shared/types';
import { models, type Claude } from './claude';
import type { SessionRow, StoredMessage } from './db';
import { LEARNER_BACKGROUND } from './learner';
import { PLAIN_LANGUAGE } from './plainLanguage';
import { Trace } from './teaching';

export type Emit = (event: string, data: unknown) => Promise<void>;

export const OPENING_GREETING = "Hi, I'm ready for a problem.";

export function openingMessage(title: string, mode: SessionMode = 'guided'): string {
  return mode === 'guided'
    ? `Let's work through **${title}** one idea at a time. The requirements are on the right. Start with the small example: what should the function return, and why? If you're unsure, I can demonstrate one step and let you try the next.`
    : `Here's a fresh problem: **${title}**. Try it on your own, choosing an approach and checking your code. You can ask me to clarify the requirements. Choose "Get teaching help" whenever you want a demonstration; that turns this into guided learning.`;
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
    description: 'Record teaching support: 1 = focused question, 2 = concrete pointer, 3 = named idea with explanation, 4 = worked example or code scaffold. Explicit requests can skip straight to the needed support.',
    input_schema: {
      type: 'object',
      properties: { rung: { type: 'integer', enum: [1, 2, 3, 4] } },
      required: ['rung'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_trace',
    description: 'Show a small worked example as cells and steps beside the chat. Use real values from a visible or made up example. active identifies cells still under consideration; focus is the cell being inspected; candidate is a saved possible answer. Explain why cells stay or leave at each step. Add one prediction question before the next step. This is a teaching illustration, not an execution trace of their code. Use for searches, pointers, windows, stacks or a queue when it helps.',
    input_schema: z.toJSONSchema(Trace, { unrepresentable: 'any' }) as Anthropic.Tool['input_schema'],
  },
];

function chatSystem(session: SessionRow): string {
  const p = session.problem;
  const teaching = session.mode === 'guided' ? `
Guided learning
- Teach one idea at a time. First work through a tiny normal case with real values. Then let them predict the next step. Once that is understood, turn it into code. After the basic behaviour works, add one boundary case at a time, such as repeats or no answer. Discuss time and space complexity last.
- All requirements are visible. Answer questions directly and volunteer any rule needed to understand the current step.
- Increase support when they remain stuck. Use a focused question, then a concrete pointer, then explain the idea by name, then a small worked example with a short TypeScript scaffold if needed. Use the highest recorded rung and conversation to move forward; repeated confusion calls for a demonstration, not another version of the same question. When asked for a worked example, go straight to it.
- Record support with record_hint. Explanations of words, requirements or TypeScript syntax are ordinary teaching, not hints. Support is recorded to distinguish coached work from independent work; needing it is normal.
- In a worked example, demonstrate one decision with actual values and explain why it is valid, then ask them to make the next decision on different values. For first-match searches, explain why a matching middle value is a possible answer and why earlier positions still need checking. Use show_trace to make remaining possibilities, the inspected value and any saved candidate visible. Call record_hint with rung 4 when showing a trace.
- If a demonstration still doesn't help, identify the missing prerequisite and use a smaller example. Give short code snippets or partial code when needed, then have them complete a meaningful step. A full solution is available through "Study solution".
- Their workspace contains their code and latest tests. When they are stuck or have run tests, connect the observed behaviour to the next small change to reason about. Accept any correct approach before discussing speed.
- After help, ask one prediction or explanation question that checks the reason for the decision, not just the answer. Passing tests with coaching shows practice, not independent mastery.
` : `
Independent practice
- Let them choose an approach and work without coaching. Answer requirements and syntax questions directly. Call reveal_constraint for any requirement you explain.
- Keep the algorithm, pattern, solution code, worked examples and visual traces private while this independent attempt is open. When they request teaching help, direct them to "Get teaching help", which changes the session to guided learning. Treat their request for help warmly.
- After a submission, describe what passed or failed and allow them to retry. Evidence from a first independent submission is stronger than a retry following feedback. A fresh review later checks transfer to a different scenario.
`;
  return `You're a senior software engineer pairing with a fellow engineer who is practising for coding interviews. ${LEARNER_BACKGROUND} You're a peer helping them think, not an interviewer grading them.

How to talk
- Be warm, direct and brief: usually two to four sentences. Ask one question at a time.
- Messages may come from speech recognition, so read them generously ("oh of n" means O(n), "hash mat" means hash map).
- Keep explanations focused, with small code blocks when they help teach the current step.

${PLAIN_LANGUAGE}

${teaching}

<problem>
Title: ${p.title}
${session.mode === 'guided' ? `Topic: ${p.topic}. Learning goal: ${p.learningGoal ?? 'Understand the core behaviour before extending it.'}` : 'Independent attempt: choose a technique without reminders.'}
Statement shown to them:
${p.statement}
Example: ${p.example.input} → ${p.example.output} (${p.example.explanation})
Starter code:
${p.starterCode}
${p.prelude ? `Provided code:\n${p.prelude}` : ''}
</problem>

<requirements>
${p.constraints.map((c) => `- ${c}`).join('\n')}
</requirements>

<intended_approach>
${session.mode === 'guided' ? p.approach : 'The learner chooses their own approach.'}
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
Session mode: ${session.mode}
${session.trace ? `Latest teaching illustration: ${JSON.stringify(session.trace)}` : ''}
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
  trace: TeachingTrace | null;
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
  let trace = session.trace;

  for (let round = 0; round < 4; round++) {
    const stream = claude.messages.stream({
      model: models.chat,
      max_tokens: 4000,
      system: chatSystem(session),
      output_config: { effort: 'medium' },
      tools: session.mode === 'guided' ? TOOLS : TOOLS.filter((t) => t.name === 'reveal_constraint'),
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
        if (session.mode !== 'guided') {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Switch to guided learning before giving support.', is_error: true });
          continue;
        }
        hints.push(input.rung as number);
        await emit('hint', { rung: input.rung, total: hints.length });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Recorded. Hints given: ${hints.length}.` });
      } else if (block.name === 'show_trace' && session.mode === 'guided') {
        const parsed = Trace.safeParse(block.input);
        if (parsed.success) {
          trace = parsed.data;
          await emit('trace', { trace });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: 'The illustration is shown beside the chat, one step at a time.' });
        } else {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: parsed.error.message, is_error: true });
        }
      } else {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Invalid input.', is_error: true });
      }
    }
    messages.push({ role: 'assistant', content: final.content }, { role: 'user', content: results });
  }

  return { reply: reply.trim(), revealed, hints, trace };
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
    `You give feedback on a practice coding interview as a fellow senior engineer. Be honest, specific and encouraging, without empty praise. About the candidate: ${LEARNER_BACKGROUND}\n\n${PLAIN_LANGUAGE}`,
    `${reviewContext(session, stored, code, run)}

This is submission ${session.submissions} in ${session.mode} mode. Write brief feedback with two sections, "### What you understood" and "### Next step". Ground claims in their explanations and test results. Pick one next thing to learn or check, rather than a list of weaknesses. For guided learning, focus on the core behaviour and one boundary case; discuss complexity only once correctness makes sense. Requirements were supplied, so asking for them is not a grading criterion. For independent practice, comment on correctness, clarity and complexity when useful. Say whether the result was coached, an independent first attempt, or a retry after feedback. Describe hidden tests by the kind of case they cover, never by their inputs or expected values. If tests failed, point towards the kind of mistake without writing the fix. If they passed, ask one short question about why the key decision is valid, and mention that a fresh independent problem after a delay is stronger evidence of learning. Keep solution code out of feedback.`,
    emit,
  );
}

export function walkthrough(claude: Claude, session: SessionRow, stored: StoredMessage[], code: string, emit: Emit) {
  return streamText(
    claude,
    `You explain a model solution to a practice coding interview problem as a fellow senior engineer. About the candidate: ${LEARNER_BACKGROUND}\n\n${PLAIN_LANGUAGE}`,
    `${reviewContext(session, stored, code, session.lastRun ?? { passed: 0, total: 0, results: [] })}

They chose to study the reference solution, which is shown next to the chat. Teach the core idea with one small worked example and actual values, in under 300 words. Explain why one important decision is correct, then ask them to predict a similar decision on different values. Relate it to what they tried. Leave complexity until the behaviour is understood, and suggest a fresh independent review later. Refer to the visible code rather than repeating it in full. Short snippets are fine.`,
    emit,
  );
}
