export const TOPICS = [
  { id: 'arrays-hashing', name: 'Arrays and hashing' },
  { id: 'two-pointers', name: 'Two pointers' },
  { id: 'sliding-window', name: 'Sliding window' },
  { id: 'stacks', name: 'Stacks' },
  { id: 'binary-search', name: 'Binary search' },
  { id: 'linked-lists', name: 'Linked lists' },
  { id: 'trees', name: 'Trees' },
  { id: 'tries', name: 'Tries' },
  { id: 'heaps', name: 'Heaps' },
  { id: 'intervals', name: 'Intervals' },
  { id: 'graphs', name: 'Graphs (BFS/DFS)' },
  { id: 'backtracking', name: 'Backtracking' },
  { id: 'greedy', name: 'Greedy' },
  { id: 'dynamic-programming', name: 'Dynamic programming' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

export const LEVELS = ['easy', 'medium', 'hard'] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  easy: 'Starting point',
  medium: 'Build on it',
  hard: 'Challenge',
};

export function topicName(id: string): string {
  return TOPICS.find((t) => t.id === id)?.name ?? id;
}

export function isTopic(id: unknown): id is TopicId {
  return TOPICS.some((t) => t.id === id);
}

export function isLevel(level: unknown): level is Level {
  return LEVELS.includes(level as Level);
}
