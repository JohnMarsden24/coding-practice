import type Anthropic from '@anthropic-ai/sdk';
import { topicName } from '../shared/curriculum';
import type { ChatMessage, SessionSummary, TopicProgress } from '../shared/types';
import { models, type Claude } from './claude';
import type { Emit } from './coach';
import { PLAIN_LANGUAGE } from './plainLanguage';

const STATUS = { in_progress: 'in progress', solved: 'solved', gave_up: 'gave up' } as const;

function learnSystem(progress: TopicProgress[], sessions: SessionSummary[]): string {
  const levels = progress.map((p) => `- ${topicName(p.topic)}: ${p.level} (${p.solved} of ${p.sessions} solved)`).join('\n');
  const recent = sessions
    .slice(0, 10)
    .map((s) => `- ${s.title} (${topicName(s.topic)}, ${s.difficulty}, ${STATUS[s.status]})`)
    .join('\n');
  return `You're a senior software engineer helping a fellow engineer learn data structures, algorithms and how to do well in coding interviews. They have six years of industry experience but no computer science degree, so they know how to build software and are filling gaps. This is open study time, not a practice problem, so teach freely: explain ideas fully, show TypeScript examples, and work through problems with them when they ask.

How to teach
- Start from what they already know as a working engineer, then build up. Link new ideas to everyday code, like caching, queues or rendering a tree of components.
- Explain with a small concrete example and real values first, then the general rule.
- Keep answers focused on what they asked. Offer to go deeper rather than covering everything at once.
- When it helps them check their understanding, end with one short question or a small exercise they can try in their head.
- If they'd learn best by practising, suggest a topic and level to pick on the New problem page.
- Messages may come from speech recognition, so read them generously ("oh of n" means O(n), "hash mat" means hash map).

${PLAIN_LANGUAGE}

<their_levels>
These come from their practice sessions. Use them to pitch explanations and to suggest what to study next.
${levels}
</their_levels>

<recent_problems>
${recent || 'none yet'}
</recent_problems>`;
}

export function learnHistory(messages: ChatMessage[], question: string): Anthropic.MessageParam[] {
  return [...messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: question }];
}

/** A title from the first question, cut at a word boundary. */
export function learnTitle(question: string, max = 60): string {
  const text = question.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export async function learnTurn(
  claude: Claude,
  context: { progress: TopicProgress[]; sessions: SessionSummary[] },
  messages: Anthropic.MessageParam[],
  emit: Emit,
): Promise<string> {
  const stream = claude.messages.stream({
    model: models.chat,
    max_tokens: 8000,
    system: learnSystem(context.progress, context.sessions),
    output_config: { effort: 'medium' },
    messages,
  });
  stream.on('text', (delta) => void emit('delta', { text: delta }));
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') return "Sorry, I can't help with that one.";
  const reply = final.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
  if (!reply) throw new Error('Claude sent an empty reply. Try asking again.');
  return reply;
}
