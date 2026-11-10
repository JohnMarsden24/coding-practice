import type { Level, TopicId } from './curriculum';

export type SessionStatus = 'in_progress' | 'solved' | 'gave_up';

export interface TestCase {
  input?: unknown[];
  /** A JS expression that builds the argument list, for inputs too large to write out. */
  generator?: string;
  expected: unknown;
}

export interface Problem {
  title: string;
  topic: TopicId;
  difficulty: Level;
  statement: string;
  example: { input: string; output: string; explanation: string };
  functionName: string;
  starterCode: string;
  /** Code in scope for the candidate, such as a ListNode class. Shown with the problem. */
  prelude: string;
  /** Hidden code defining `adapt(fn, args)` to convert JSON args and results, such as arrays to linked lists. */
  adapter: string;
  /** Details held back until the candidate asks. */
  constraints: string[];
  visibleTests: TestCase[];
  hiddenTests: TestCase[];
  compare: 'exact' | 'unordered';
  referenceSolution: string;
  approach: string;
}

export interface PublicProblem {
  title: string;
  topic: TopicId;
  difficulty: Level;
  statement: string;
  example: Problem['example'];
  functionName: string;
  prelude: string;
  revealedConstraints: string[];
  visibleTests: { input: unknown[]; expected: unknown }[];
  hiddenTestCount: number;
}

export interface TestResult {
  name: string;
  hidden: boolean;
  passed: boolean;
  timedOut?: boolean;
  input?: unknown[];
  expected?: unknown;
  actual?: unknown;
  error?: string;
  logs?: string[];
  ms?: number;
}

export interface RunResult {
  passed: number;
  total: number;
  compileError?: string;
  results: TestResult[];
}

export type MessageKind = 'chat' | 'event' | 'feedback' | 'walkthrough';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  kind: MessageKind;
  content: string;
  createdAt: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  topic: TopicId;
  difficulty: Level;
  status: SessionStatus;
  updatedAt: number;
}

export interface SessionDetail extends SessionSummary {
  problem: PublicProblem;
  code: string;
  messages: ChatMessage[];
  hintsUsed: number;
  submissions: number;
  lastRun: RunResult | null;
  /** Only present once the session is solved or given up. */
  referenceSolution?: string;
}

export interface TopicProgress {
  topic: TopicId;
  level: Level;
  sessions: number;
  solved: number;
}

export interface AppState {
  quizTaken: boolean;
  progress: TopicProgress[];
  sessions: SessionSummary[];
  learnChats: LearnChatSummary[];
  suggestion: { topic: TopicId; difficulty: Level };
}

export interface QuizQuestion {
  id: string;
  topic: TopicId;
  question: string;
  options: string[];
}

export interface QuizResult {
  perTopic: { topic: TopicId; correct: number; level: Level }[];
  answers: { id: string; correct: boolean; answer: string; explanation: string }[];
}

export interface LearnChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface LearnChatDetail extends LearnChatSummary {
  messages: ChatMessage[];
}
