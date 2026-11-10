import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LEVELS, TOPICS, type Level, type TopicId } from '../shared/curriculum';
import type { ChatMessage, LearnChatDetail, LearnChatSummary, MessageKind, PracticeReview, Problem, RunResult, SessionMode, SessionStatus, SessionSummary, TeachingTrace, TopicProgress } from '../shared/types';

export interface SessionRow extends SessionSummary {
  kind: 'coding';
  problem: Problem;
  code: string;
  revealed: string[];
  hints: number[];
  submissions: number;
  progressApplied: boolean;
  lastRun: RunResult | null;
  trace: TeachingTrace | null;
}

export interface StoredMessage extends ChatMessage {
  /** The workspace snapshot sent to Claude with a user message. */
  context: string | null;
}

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'coding',
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      status TEXT NOT NULL,
      problem TEXT NOT NULL,
      code TEXT NOT NULL,
      revealed TEXT NOT NULL DEFAULT '[]',
      hints TEXT NOT NULL DEFAULT '[]',
      submissions INTEGER NOT NULL DEFAULT 0,
      progress_applied INTEGER NOT NULL DEFAULT 0,
      last_run TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);
    CREATE TABLE IF NOT EXISTS topic_levels (
      topic TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learn_chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS learn_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL REFERENCES learn_chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS learn_messages_chat ON learn_messages(chat_id, id);
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((r) => r.name));
  if (!columns.has('mode')) db.exec("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'guided'");
  if (!columns.has('review_of')) db.exec('ALTER TABLE sessions ADD COLUMN review_of TEXT');
  if (!columns.has('trace')) db.exec('ALTER TABLE sessions ADD COLUMN trace TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS practice_reviews (
    topic TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    due_at INTEGER NOT NULL,
    interval_days INTEGER NOT NULL
  )`);

  const toSession = (r: Record<string, unknown>): SessionRow => ({
    id: r.id as string,
    kind: 'coding',
    title: r.title as string,
    topic: r.topic as TopicId,
    difficulty: r.difficulty as Level,
    status: r.status as SessionStatus,
    problem: JSON.parse(r.problem as string),
    code: r.code as string,
    revealed: JSON.parse(r.revealed as string),
    hints: JSON.parse(r.hints as string),
    submissions: r.submissions as number,
    progressApplied: Boolean(r.progress_applied),
    lastRun: r.last_run ? JSON.parse(r.last_run as string) : null,
    updatedAt: r.updated_at as number,
    mode: r.mode as SessionMode,
    reviewOf: (r.review_of as string | null) ?? null,
    trace: r.trace ? JSON.parse(r.trace as string) : null,
  });

  const toMessage = (r: Record<string, unknown>): StoredMessage => ({
    id: r.id as number,
    role: r.role as 'user' | 'assistant',
    kind: r.kind as MessageKind,
    content: r.content as string,
    context: (r.context as string | null) ?? null,
    createdAt: r.created_at as number,
  });

  return {
    close: () => db.close(),

    createSession(id: string, problem: Problem, mode: SessionMode = 'guided', reviewOf: string | null = null): SessionRow {
      const now = Date.now();
      db.prepare(
        `INSERT INTO sessions (id, title, topic, difficulty, status, problem, code, revealed, mode, review_of, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, problem.title, problem.topic, problem.difficulty, JSON.stringify(problem), problem.starterCode,
        JSON.stringify(mode === 'guided' ? problem.constraints : []), mode, reviewOf, now, now);
      return this.getSession(id)!;
    },

    getSession(id: string): SessionRow | undefined {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
      return row ? toSession(row) : undefined;
    },

    listSessions(): SessionSummary[] {
      return db
        .prepare('SELECT id, title, topic, difficulty, status, updated_at, mode, review_of FROM sessions ORDER BY updated_at DESC')
        .all()
        .map((r) => ({
          id: r.id as string,
          title: r.title as string,
          topic: r.topic as TopicId,
          difficulty: r.difficulty as Level,
          status: r.status as SessionStatus,
          updatedAt: r.updated_at as number,
          mode: r.mode as SessionMode,
          reviewOf: (r.review_of as string | null) ?? null,
        }));
    },

    recentTitles(topic: TopicId, limit = 20): string[] {
      return db
        .prepare('SELECT title FROM sessions WHERE topic = ? ORDER BY created_at DESC LIMIT ?')
        .all(topic, limit)
        .map((r) => r.title as string);
    },

    updateSession(
      id: string,
      changes: Partial<{
        title: string;
        status: SessionStatus;
        code: string;
        revealed: string[];
        hints: number[];
        submissions: number;
        progressApplied: boolean;
        lastRun: RunResult;
        mode: SessionMode;
        trace: TeachingTrace;
      }>,
      touch = true,
    ) {
      const columns: Record<string, unknown> = {
        title: changes.title,
        status: changes.status,
        code: changes.code,
        revealed: changes.revealed && JSON.stringify(changes.revealed),
        hints: changes.hints && JSON.stringify(changes.hints),
        submissions: changes.submissions,
        progress_applied: changes.progressApplied === undefined ? undefined : Number(changes.progressApplied),
        last_run: changes.lastRun && JSON.stringify(changes.lastRun),
        mode: changes.mode,
        trace: changes.trace && JSON.stringify(changes.trace),
      };
      const set = Object.entries(columns).filter(([, v]) => v !== undefined);
      if (touch) set.push(['updated_at', Date.now()]);
      if (!set.length) return;
      db.prepare(`UPDATE sessions SET ${set.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...(set.map(([, v]) => v) as (string | number)[]),
        id,
      );
    },

    deleteSession(id: string) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    },

    addMessage(sessionId: string, m: { role: 'user' | 'assistant'; kind: MessageKind; content: string; context?: string }) {
      db.prepare('INSERT INTO messages (session_id, role, kind, content, context, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        sessionId,
        m.role,
        m.kind,
        m.content,
        m.context ?? null,
        Date.now(),
      );
    },

    messages(sessionId: string): StoredMessage[] {
      return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(sessionId).map(toMessage);
    },

    levels(): Record<TopicId, Level> {
      const stored = new Map(
        db
          .prepare('SELECT topic, level FROM topic_levels')
          .all()
          .map((r) => [r.topic as string, r.level as Level]),
      );
      return Object.fromEntries(TOPICS.map((t) => [t.id, stored.get(t.id) ?? 'easy'])) as Record<TopicId, Level>;
    },

    setLevel(topic: TopicId, level: Level) {
      db.prepare(
        `INSERT INTO topic_levels (topic, level, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(topic) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`,
      ).run(topic, level, Date.now());
    },

    /** Moves a topic up or down one level, staying within easy and hard. */
    shiftLevel(topic: TopicId, by: 1 | -1) {
      const current = LEVELS.indexOf(this.levels()[topic]);
      const next = Math.min(LEVELS.length - 1, Math.max(0, current + by));
      this.setLevel(topic, LEVELS[next]);
    },

    progress(): TopicProgress[] {
      const levels = this.levels();
      const counts = new Map(
        db
          .prepare(
            `SELECT topic, COUNT(*) AS sessions, SUM(status = 'solved') AS solved,
             SUM(status = 'solved' AND mode = 'independent' AND hints = '[]' AND submissions = 1) AS independent
             FROM sessions GROUP BY topic`,
          )
          .all()
          .map((r) => [r.topic as string, r]),
      );
      return TOPICS.map((t) => ({
        topic: t.id,
        level: levels[t.id],
        sessions: Number(counts.get(t.id)?.sessions ?? 0),
        solved: Number(counts.get(t.id)?.solved ?? 0),
        independentSolved: Number(counts.get(t.id)?.independent ?? 0),
      }));
    },

    scheduleReview(session: SessionRow, independentPassed: boolean) {
      const previous = db.prepare('SELECT source_id, interval_days FROM practice_reviews WHERE topic = ?').get(session.topic);
      const interval = independentPassed && session.reviewOf === previous?.source_id
        ? Math.min(30, Number(previous.interval_days) === 2 ? 7 : Number(previous.interval_days) * 3)
        : 2;
      db.prepare(`INSERT INTO practice_reviews (topic, source_id, due_at, interval_days) VALUES (?, ?, ?, ?)
        ON CONFLICT(topic) DO UPDATE SET source_id = excluded.source_id, due_at = excluded.due_at, interval_days = excluded.interval_days`)
        .run(session.topic, session.id, Date.now() + interval * 86400000, interval);
    },

    reviews(): PracticeReview[] {
      return db.prepare(`SELECT r.topic, r.source_id, r.due_at, s.title, s.difficulty
        FROM practice_reviews r JOIN sessions s ON s.id = r.source_id ORDER BY r.due_at`).all().map((r) => ({
        topic: r.topic as TopicId,
        difficulty: r.difficulty as Level,
        sourceId: r.source_id as string,
        sourceTitle: r.title as string,
        dueAt: r.due_at as number,
      }));
    },

    /** The weakest topic, breaking ties by the one practised least recently. */
    suggestion(): { topic: TopicId; difficulty: Level } {
      const levels = this.levels();
      const last = new Map(
        db
          .prepare('SELECT topic, MAX(created_at) AS last FROM sessions GROUP BY topic')
          .all()
          .map((r) => [r.topic as string, r.last as number]),
      );
      const [best] = [...TOPICS].sort(
        (a, b) =>
          LEVELS.indexOf(levels[a.id]) - LEVELS.indexOf(levels[b.id]) || (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0),
      );
      return { topic: best.id, difficulty: levels[best.id] };
    },

    listLearnChats(): LearnChatSummary[] {
      return db
        .prepare('SELECT id, title, updated_at FROM learn_chats ORDER BY updated_at DESC')
        .all()
        .map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: r.updated_at as number }));
    },

    getLearnChat(id: string): LearnChatDetail | undefined {
      const row = db.prepare('SELECT id, title, updated_at FROM learn_chats WHERE id = ?').get(id);
      if (!row) return undefined;
      const messages = db
        .prepare('SELECT id, role, content, created_at FROM learn_messages WHERE chat_id = ? ORDER BY id')
        .all(id)
        .map((r) => ({
          id: r.id as number,
          role: r.role as 'user' | 'assistant',
          kind: 'chat' as const,
          content: r.content as string,
          createdAt: r.created_at as number,
        }));
      return { id: row.id as string, title: row.title as string, updatedAt: row.updated_at as number, messages };
    },

    /** Saves a question and its reply, creating the chat on its first exchange. */
    addLearnExchange(id: string, title: string, question: string, reply: string) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO learn_chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      ).run(id, title, now, now);
      const insert = db.prepare('INSERT INTO learn_messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)');
      insert.run(id, 'user', question, now);
      insert.run(id, 'assistant', reply, now);
    },

    renameLearnChat(id: string, title: string) {
      db.prepare('UPDATE learn_chats SET title = ? WHERE id = ?').run(title, id);
    },

    deleteLearnChat(id: string) {
      db.prepare('DELETE FROM learn_chats WHERE id = ?').run(id);
    },

    getSetting(key: string): string | undefined {
      return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value as string | undefined;
    },

    setSetting(key: string, value: string) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    },
  };
}
