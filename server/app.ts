import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { isLevel, isTopic } from '../shared/curriculum';
import type { AppState, LearnChatDetail, RunResult, SessionDetail, SessionMode } from '../shared/types';
import { describeError, type Claude } from './claude';
import { buildHistory, chatTurn, feedback, openingMessage, walkthrough, workspaceContext, type Emit } from './coach';
import type { SessionRow, Store } from './db';
import { generateProblem, publicProblem, runSettings, testsFor } from './problems';
import { learnHistory, learnTitle, learnTurn } from './learn';
import { quizQuestions, scoreQuiz } from './quiz';
import { runTests } from './runner';
import { studyVocabulary, transcribe, vocabulary, whisperAvailable } from './voice';

function publicRun(run: RunResult): RunResult {
  return {
    ...run,
    results: run.results.map((r) =>
      r.hidden ? { name: r.name, hidden: true, passed: r.passed, timedOut: r.timedOut, error: r.error, ms: r.ms } : r,
    ),
  };
}

function sse(c: Context, work: (emit: Emit) => Promise<void>) {
  return streamSSE(c, async (stream) => {
    const emit: Emit = (event, data) => stream.writeSSE({ event, data: JSON.stringify(data) });
    try {
      await work(emit);
    } catch (error) {
      console.error(error);
      await emit('error', { message: describeError(error) });
    }
  });
}

export function createApp({ store, claude }: { store: Store; claude: Claude }) {
  const app = new Hono().basePath('/api');

  const detail = (s: SessionRow): SessionDetail => ({
    id: s.id,
    title: s.title,
    topic: s.topic,
    difficulty: s.difficulty,
    status: s.status,
    updatedAt: s.updatedAt,
    mode: s.mode,
    reviewOf: s.reviewOf,
    trace: s.trace,
    problem: publicProblem(s.problem, s.revealed, s.mode),
    code: s.code,
    messages: store.messages(s.id).map(({ context: _context, ...m }) => m),
    hintsUsed: s.hints.length,
    submissions: s.submissions,
    lastRun: s.lastRun && publicRun(s.lastRun),
    referenceSolution: s.status === 'in_progress' ? undefined : s.problem.referenceSolution,
  });

  const load = (c: Context) => {
    const session = store.getSession(c.req.param('id') ?? '');
    if (!session) throw new NotFound();
    return session;
  };

  app.onError((error, c) => {
    if (error instanceof NotFound) return c.json({ error: error.message || 'Session not found' }, 404);
    if (error instanceof BadRequest) return c.json({ error: error.message }, 400);
    console.error(error);
    return c.json({ error: describeError(error) }, 500);
  });

  app.get('/state', (c) =>
    c.json<AppState>({
      quizTaken: store.getSetting('quizTaken') === 'true',
      progress: store.progress(),
      sessions: store.listSessions(),
      learnChats: store.listLearnChats(),
      suggestion: store.suggestion(),
      reviews: store.reviews(),
    }),
  );

  app.get('/quiz', (c) => c.json(quizQuestions()));

  app.get('/voice', async (c) => c.json({ whisper: await whisperAvailable() }));

  app.post('/quiz', async (c) => {
    const { answers } = await c.req.json<{ answers: Record<string, string | null> }>();
    const result = scoreQuiz(answers ?? {});
    for (const t of result.perTopic) store.setLevel(t.topic, t.level);
    store.setSetting('quizTaken', 'true');
    return c.json(result);
  });

  app.post('/quiz/skip', (c) => {
    store.setSetting('quizTaken', 'true');
    return c.json({ ok: true });
  });

  app.post('/sessions', async (c) => {
    const { topic, difficulty, mode = 'guided', reviewOf } = await c.req.json<{
      topic: unknown; difficulty: unknown; mode?: SessionMode; reviewOf?: string;
    }>();
    if (!isTopic(topic) || !isLevel(difficulty)) throw new BadRequest('Pick a topic and difficulty.');
    if (mode !== 'guided' && mode !== 'independent') throw new BadRequest('Pick guided learning or independent practice.');
    const review = reviewOf === undefined ? undefined : store.reviews().find((r) => r.sourceId === reviewOf);
    if (reviewOf !== undefined && (!review || review.topic !== topic || review.difficulty !== difficulty || mode !== 'independent')) {
      throw new BadRequest('Choose an independent review from the review list.');
    }
    if (review && review.dueAt > Date.now()) throw new BadRequest('This review is scheduled for later. You can start a new problem now.');
    const previous = review ? store.getSession(review.sourceId) : undefined;
    return sse(c, async (emit) => {
      const existing = review && store.listSessions().find((s) => s.reviewOf === review.sourceId && s.status === 'in_progress');
      if (existing) {
        await emit('done', { session: detail(store.getSession(existing.id)!) });
        return;
      }
      const problem = await generateProblem(claude, {
        topic,
        difficulty,
        avoidTitles: store.recentTitles(topic),
        mode,
        transferFrom: previous?.problem,
        onStatus: (text) => void emit('status', { text }),
      });
      const session = store.createSession(randomUUID(), problem, mode, review?.sourceId);
      store.addMessage(session.id, { role: 'assistant', kind: 'chat', content: openingMessage(problem.title, mode) });
      await emit('done', { session: detail(session) });
    });
  });

  app.get('/sessions/:id', (c) => c.json(detail(load(c))));

  app.post('/sessions/:id/guided', (c) => {
    const session = load(c);
    if (session.status !== 'in_progress') throw new BadRequest('This session is already finished.');
    store.updateSession(session.id, { mode: 'guided', revealed: session.problem.constraints });
    return c.json(detail(store.getSession(session.id)!));
  });

  app.patch('/sessions/:id', async (c) => {
    const session = load(c);
    const { title, code } = await c.req.json<{ title?: string; code?: string }>();
    if (typeof title === 'string' && title.trim()) store.updateSession(session.id, { title: title.trim() });
    if (typeof code === 'string') store.updateSession(session.id, { code }, false);
    return c.json({ ok: true });
  });

  app.delete('/sessions/:id', (c) => {
    store.deleteSession(load(c).id);
    return c.json({ ok: true });
  });

  app.post('/sessions/:id/chat', async (c) => {
    const session = load(c);
    const { content, code } = await c.req.json<{ content: string; code: string }>();
    if (!content?.trim()) throw new BadRequest('Write a message first.');
    if (typeof code === 'string') store.updateSession(session.id, { code }, false);
    const current = store.getSession(session.id)!;
    const context = workspaceContext(current, current.code);
    const history = [
      ...buildHistory(store.messages(session.id)),
      { role: 'user' as const, content: `${content.trim()}\n\n${context}` },
    ];
    return sse(c, async (emit) => {
      const outcome = await chatTurn(claude, current, mergeTail(history), emit);
      store.addMessage(session.id, { role: 'user', kind: 'chat', content: content.trim(), context });
      store.addMessage(session.id, { role: 'assistant', kind: 'chat', content: outcome.reply });
      store.updateSession(session.id, { revealed: outcome.revealed, hints: outcome.hints, trace: outcome.trace ?? undefined });
      await emit('done', { session: detail(store.getSession(session.id)!) });
    });
  });

  const transcribeRoute = async (c: Context, prompt: string) => {
    if (!(await whisperAvailable())) return c.json({ error: 'Whisper is not installed on this machine.' }, 503);
    const audio = new Uint8Array(await c.req.arrayBuffer());
    if (!audio.length) throw new BadRequest('No audio was sent.');
    if (audio.length > 20 * 1024 * 1024) throw new BadRequest('That recording is too long.');
    return c.json({ text: await transcribe(audio, prompt) });
  };

  app.post('/sessions/:id/transcribe', (c) => transcribeRoute(c, vocabulary(load(c).problem)));

  app.post('/sessions/:id/run', async (c) => {
    const session = load(c);
    const { code } = await c.req.json<{ code: string }>();
    const run = await runTests({ ...runSettings(session.problem, code), tests: testsFor(session.problem, 'visible') });
    store.updateSession(session.id, { code, lastRun: run });
    return c.json(run);
  });

  app.post('/sessions/:id/submit', async (c) => {
    const session = load(c);
    if (session.status !== 'in_progress') throw new BadRequest('This session is already finished. Start a fresh problem to practise again.');
    const { code } = await c.req.json<{ code: string }>();
    const run = await runTests({ ...runSettings(session.problem, code), tests: testsFor(session.problem, 'all') });
    const allPassed = !run.compileError && run.passed === run.total;
    const submissions = session.submissions + 1;

    const independentPassed = session.mode === 'independent' && submissions === 1 && session.hints.length === 0 && allPassed;
    if (!session.progressApplied && independentPassed) store.shiftLevel(session.topic, 1);
    store.updateSession(session.id, {
      code,
      lastRun: run,
      submissions,
      progressApplied: true,
      status: allPassed ? 'solved' : session.status,
    });
    store.addMessage(session.id, {
      role: 'user',
      kind: 'event',
      content: run.compileError
        ? `Submission ${submissions}: the code didn't compile`
        : `Submission ${submissions}: ${run.passed} of ${run.total} tests passed, including hidden tests`,
    });
    if (allPassed) store.scheduleReview(store.getSession(session.id)!, independentPassed);
    return c.json(detail(store.getSession(session.id)!));
  });

  app.post('/sessions/:id/feedback', (c) => {
    const session = load(c);
    if (!session.lastRun || !session.submissions) throw new BadRequest('Submit first to get feedback.');
    return sse(c, async (emit) => {
      const text = await feedback(claude, session, store.messages(session.id), session.code, session.lastRun!, emit);
      store.addMessage(session.id, { role: 'assistant', kind: 'feedback', content: text });
      await emit('done', { session: detail(store.getSession(session.id)!) });
    });
  });

  app.post('/sessions/:id/give-up', async (c) => {
    const session = load(c);
    if (session.status !== 'in_progress') throw new BadRequest('This session is already finished.');
    const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
    store.updateSession(session.id, {
      code: typeof code === 'string' ? code : session.code,
      status: 'gave_up',
      progressApplied: true,
      mode: 'guided',
      revealed: session.problem.constraints,
    });
    store.addMessage(session.id, { role: 'user', kind: 'event', content: 'Studied the model solution' });
    store.scheduleReview(store.getSession(session.id)!, false);
    return c.json(detail(store.getSession(session.id)!));
  });

  app.post('/sessions/:id/walkthrough', (c) => {
    const session = load(c);
    if (session.status !== 'gave_up') throw new BadRequest('Give up first to see the walkthrough.');
    return sse(c, async (emit) => {
      const text = await walkthrough(claude, session, store.messages(session.id), session.code, emit);
      store.addMessage(session.id, { role: 'assistant', kind: 'walkthrough', content: text });
      await emit('done', { session: detail(store.getSession(session.id)!) });
    });
  });

  const learnReply = async (c: Context, existing?: LearnChatDetail) => {
    const { content } = await c.req.json<{ content?: string }>().catch(() => ({ content: undefined }));
    const question = typeof content === 'string' ? content.trim() : '';
    if (!question) throw new BadRequest('Write a message first.');
    const id = existing?.id ?? randomUUID();
    return sse(c, async (emit) => {
      const reply = await learnTurn(
        claude,
        { progress: store.progress(), sessions: store.listSessions() },
        learnHistory(existing?.messages ?? [], question),
        emit,
      );
      store.addLearnExchange(id, learnTitle(question), question, reply);
      await emit('done', { chat: store.getLearnChat(id) });
    });
  };

  const loadLearnChat = (c: Context) => {
    const chat = store.getLearnChat(c.req.param('id') ?? '');
    if (!chat) throw new NotFound('Chat not found');
    return chat;
  };

  app.post('/learn', (c) => learnReply(c));

  app.post('/learn/transcribe', (c) => transcribeRoute(c, studyVocabulary()));

  app.get('/learn/:id', (c) => c.json<LearnChatDetail>(loadLearnChat(c)));

  app.post('/learn/:id', (c) => learnReply(c, loadLearnChat(c)));

  app.patch('/learn/:id', async (c) => {
    const chat = loadLearnChat(c);
    const { title } = await c.req.json<{ title?: string }>();
    if (typeof title === 'string' && title.trim()) store.renameLearnChat(chat.id, title.trim());
    return c.json({ ok: true });
  });

  app.delete('/learn/:id', (c) => {
    store.deleteLearnChat(loadLearnChat(c).id);
    return c.json({ ok: true });
  });

  return app;
}

/** Joins a trailing pair of user turns, which happens when an event precedes the new message. */
function mergeTail<T extends { role: string; content: unknown }>(history: T[]): T[] {
  const out = [...history];
  const last = out.at(-1);
  const prev = out.at(-2);
  if (last && prev && last.role === prev.role && typeof last.content === 'string' && typeof prev.content === 'string') {
    out.splice(-2, 2, { ...prev, content: `${prev.content}\n\n${last.content}` });
  }
  return out;
}

class NotFound extends Error {}
class BadRequest extends Error {}
