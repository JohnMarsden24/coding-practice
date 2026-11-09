import type { Level, TopicId } from '../shared/curriculum';
import { TOPICS } from '../shared/curriculum';
import type { QuizQuestion, QuizResult } from '../shared/types';

interface Question {
  id: string;
  topic: TopicId;
  question: string;
  answer: string;
  wrong: [string, string, string];
  explanation: string;
}

const QUESTIONS: Question[] = [
  {
    id: 'arrays-1',
    topic: 'arrays-hashing',
    question: 'You need to check whether any value appears twice in an unsorted array of n numbers. Which approach has the best time complexity?',
    answer: 'Add each value to a hash set, checking whether it is already there first: O(n)',
    wrong: ['Compare every pair of values: O(n²)', 'Sort the array, then compare neighbours: O(n log n)', 'Binary search for each value in the array: O(n log n)'],
    explanation: 'A hash set answers "have I seen this value?" in about the same time however many values it holds. So one pass through the array is enough, and the work grows in step with the array: O(n). Sorting works too, but sorting alone costs a bit more, O(n log n).',
  },
  {
    id: 'arrays-2',
    topic: 'arrays-hashing',
    question: 'You want to group words that are anagrams of each other, like "listen" and "silent". What makes a good hash map key?',
    answer: 'The word with its letters sorted alphabetically',
    wrong: ['The length of the word', 'The first letter of the word', 'The word reversed'],
    explanation: 'Anagrams contain the same letters, so sorting them gives an identical key. Length and first letter collide with words that are not anagrams.',
  },
  {
    id: 'two-pointers-1',
    topic: 'two-pointers',
    question: 'In a sorted array, find two numbers that add up to a target using O(1) extra space. What is the classic approach?',
    answer: 'Start a pointer at each end. Move the left one right when the sum is too small, and the right one left when it is too big',
    wrong: ['Nested loops checking every pair', 'Store every number in a hash set and look up target minus each number', 'Recursively split the array in half'],
    explanation: 'Because the array is sorted, a sum that is too small can only be fixed with a bigger left number, and one that is too big only with a smaller right number. Each move rules out one number for good, so you finish in a single pass with no extra storage. The hash set also works, but it has to remember every number.',
  },
  {
    id: 'two-pointers-2',
    topic: 'two-pointers',
    question: 'You remove duplicates from a sorted array in place using two pointers. What do the two pointers do?',
    answer: 'One reads every element, the other marks where the next unique value should be written',
    wrong: ['Both start at the ends and move towards the middle', 'One moves twice as fast as the other to detect a cycle', 'Each one scans a different half of the array'],
    explanation: 'This is the read and write pointer pattern. The writer only advances when the reader finds a value different from the last one written.',
  },
  {
    id: 'sliding-window-1',
    topic: 'sliding-window',
    question: 'For "longest substring without repeating characters", why does a sliding window run in O(n) instead of O(n²)?',
    answer: 'Each character enters the window once and leaves it at most once',
    wrong: ['The string is sorted first', 'It binary searches on the length of the substring', 'It only checks substrings of one fixed length'],
    explanation: 'Both ends of the window only ever move forward, so each character is added once and removed at most once. The work grows in step with the length of the string instead of checking every possible substring.',
  },
  {
    id: 'sliding-window-2',
    topic: 'sliding-window',
    question: 'Which problem fits a fixed size sliding window best?',
    answer: 'The maximum sum of any 3 consecutive elements in an array',
    wrong: ['The shortest path between two cells in a grid', 'Checking whether a string is a palindrome', 'Finding the median of two sorted arrays'],
    explanation: 'Slide a window of 3 along the array, adding the element that enters and subtracting the one that leaves.',
  },
  {
    id: 'stacks-1',
    topic: 'stacks',
    question: 'Which structure is the best fit for checking whether brackets like "([]{})" are balanced?',
    answer: 'A stack',
    wrong: ['A queue', 'A heap', 'A hash set'],
    explanation: 'Push each opening bracket and pop when you see a closing one. The most recent unmatched opener must match, which is last in, first out.',
  },
  {
    id: 'stacks-2',
    topic: 'stacks',
    question: '"For each day, how many days until a warmer temperature?" The efficient solution keeps a stack of day indexes. What is true about that stack?',
    answer: 'The temperatures of the days on it are decreasing from bottom to top',
    wrong: ['It holds every index seen so far, in order', 'It only ever holds one index', 'The temperatures on it are sorted from lowest to highest from bottom to top'],
    explanation: 'Each day waits on the stack until a warmer day arrives. That warmer day pops every colder day off the top and answers them all at once, then waits on top itself. So the stack always runs from warmest at the bottom to coldest at the top. A stack kept in sorted order like this is called a monotonic stack. Each day goes on and comes off once, so it is one pass.',
  },
  {
    id: 'binary-search-1',
    topic: 'binary-search',
    question: 'Roughly how many comparisons does binary search need, at most, on a sorted array of 1,000,000 items?',
    answer: 'About 20',
    wrong: ['About 1,000', 'About 500,000', 'About 1,000,000'],
    explanation: 'Each comparison throws away half of what is left. Halving 1,000,000 about 20 times gets you down to a single item, because 2 multiplied by itself 20 times is just over a million.',
  },
  {
    id: 'binary-search-2',
    topic: 'binary-search',
    question: 'You want the smallest ship capacity that ships every package within D days. Why can binary search work here even though there is no array to search?',
    answer: 'If a capacity works, every larger capacity also works, so you can search over the range of capacities',
    wrong: ['Capacities are always powers of two', 'The packages are always given in sorted order', 'It cannot. You have to try every capacity'],
    explanation: 'Binary search needs a yes/no question that flips once as the value grows. Here it is "can this capacity ship everything in D days?"',
  },
  {
    id: 'linked-lists-1',
    topic: 'linked-lists',
    question: 'How do you detect a cycle in a linked list using O(1) extra memory?',
    answer: 'Move a slow pointer one step and a fast pointer two steps at a time. If they meet, there is a cycle',
    wrong: ['Store each visited node in a hash set', 'Reverse the list and compare it with the original', 'Count nodes and assume a cycle after 10,000'],
    explanation: 'If there is a loop, the fast pointer goes round it and catches the slow one from behind, like a faster runner lapping a slower one on a track. If there is no loop, the fast pointer just reaches the end. This is known as Floyd\'s cycle detection. The hash set works too, but it has to remember every node.',
  },
  {
    id: 'linked-lists-2',
    topic: 'linked-lists',
    question: 'What is the time complexity of inserting a new node right after a node you already have a reference to?',
    answer: 'O(1)',
    wrong: ['O(log n)', 'O(n)', 'O(n²)'],
    explanation: 'You only change two pointers: the existing node points to the new one, and the new one points to whatever came after. That takes the same time however long the list is. Finding the node in the first place is what is usually slow, because you have to walk the list.',
  },
  {
    id: 'trees-1',
    topic: 'trees',
    question: 'Which traversal of a binary search tree visits the values in sorted order?',
    answer: 'In-order (left, node, right)',
    wrong: ['Pre-order (node, left, right)', 'Post-order (left, right, node)', 'Level order (row by row)'],
    explanation: 'Everything in the left subtree is smaller and everything in the right is bigger, so left, node, right comes out sorted.',
  },
  {
    id: 'trees-2',
    topic: 'trees',
    question: 'You want to return the values of a binary tree level by level. Which structure drives the traversal?',
    answer: 'A queue',
    wrong: ['A stack', 'A min heap', 'A hash map'],
    explanation: 'A queue hands things back in the order they went in. Put the root in, and each time you take a node out, add its children to the back. Everything on one level comes out before anything on the next. This is called breadth-first search.',
  },
  {
    id: 'tries-1',
    topic: 'tries',
    question: 'What is a trie mainly good for?',
    answer: 'Prefix lookups, such as finding every word that starts with "ca"',
    wrong: ['Finding the shortest path between two nodes', 'Sorting a list of numbers', 'Detecting cycles in a graph'],
    explanation: 'Each path from the root spells a prefix, so all words sharing a prefix sit under the same node.',
  },
  {
    id: 'tries-2',
    topic: 'tries',
    question: 'A trie holds n words. How long does checking whether a word of length L exists take?',
    answer: 'O(L)',
    wrong: ['O(n)', 'O(n × L)', 'O(log n)'],
    explanation: 'You follow one child per character, so the cost depends on the word length, not on how many words are stored.',
  },
  {
    id: 'heaps-1',
    topic: 'heaps',
    question: 'Numbers arrive one at a time and you need to keep track of the k largest. Which approach is efficient?',
    answer: 'Keep a min heap of size k, removing the smallest whenever it grows past k',
    wrong: ['Sort every number seen so far each time a new one arrives', 'Keep a hash set of every number seen', 'Keep a stack and pop whenever a bigger number arrives'],
    explanation: 'A min heap always keeps its smallest item on top. If it holds the k largest numbers so far, the top is the smallest of those. Each new number only needs comparing with the top, and if it is bigger it replaces it. Keeping the heap in order after that is quick because the heap never holds more than k numbers.',
  },
  {
    id: 'heaps-2',
    topic: 'heaps',
    question: 'What is at the top of a min heap, and how long does removing it take?',
    answer: 'The smallest element, and removing it takes O(log n)',
    wrong: ['The smallest element, and removing it takes O(1)', 'The most recently added element, and removing it takes O(1)', 'The median element, and removing it takes O(log n)'],
    explanation: 'Looking at the top is instant. Removing it means moving the last item to the top and letting it sink, swapping with its smaller child each step, until the order is right again. The heap is a balanced tree, so the sinking takes only about log n steps: around 20 for a million items.',
  },
  {
    id: 'intervals-1',
    topic: 'intervals',
    question: 'To merge overlapping intervals like [1,3], [2,6], [8,10], what is the usual first step?',
    answer: 'Sort the intervals by their start',
    wrong: ['Sort the intervals by their length', 'Put the intervals in a hash map keyed by their end', 'Build a trie of the intervals'],
    explanation: 'Once sorted by start, any interval that overlaps the current merged one comes straight after it, so one pass merges everything.',
  },
  {
    id: 'intervals-2',
    topic: 'intervals',
    question: 'When do the closed intervals [a, b] and [c, d] overlap?',
    answer: 'When a ≤ d and c ≤ b',
    wrong: ['When a < c', 'Only when b equals c', 'When a + b > c + d'],
    explanation: 'They fail to overlap only when one ends before the other starts (b < c or d < a). Flip that and you get a ≤ d and c ≤ b.',
  },
  {
    id: 'graphs-1',
    topic: 'graphs',
    question: 'Which algorithm finds the shortest path, counted in edges, in an unweighted graph?',
    answer: 'Breadth-first search',
    wrong: ['Depth-first search', 'Topological sort', 'Nothing simpler than Dijkstra\'s algorithm will work'],
    explanation: 'Breadth-first search visits everything one edge away first, then everything two edges away, and so on. So the first time it reaches a node, it got there in the fewest possible edges. Dijkstra\'s algorithm also works, but you only need it when edges have different lengths.',
  },
  {
    id: 'graphs-2',
    topic: 'graphs',
    question: 'You count the islands in a grid of 1s (land) and 0s (water). What is the core idea?',
    answer: 'Scan every cell, and on each unvisited 1 start a DFS or BFS that marks the whole island as visited, counting each start',
    wrong: ['Count every 1 in the grid', 'Sort each row, then count the runs of 1s', 'Binary search each row for its first 1'],
    explanation: 'Each search spreads out from one piece of land and marks every connected piece of land as visited, so it covers exactly one island. Count how many searches you had to start and you have the number of islands.',
  },
  {
    id: 'backtracking-1',
    topic: 'backtracking',
    question: 'You generate every subset of [1, 2, 3] with backtracking. How many subsets are there, including the empty one?',
    answer: '8',
    wrong: ['3', '6', '9'],
    explanation: 'Each element is either in or out, so there are 2 × 2 × 2 = 8 subsets.',
  },
  {
    id: 'backtracking-2',
    topic: 'backtracking',
    question: 'What makes an algorithm backtracking rather than plain recursion?',
    answer: 'You make a choice, explore from it, then undo the choice before trying the next one',
    wrong: ['It always caches results it has already computed', 'It only works on trees', 'It always runs in polynomial time'],
    explanation: 'Choose, explore, then undo. For subsets: add 1, explore every subset that includes 1, then take 1 out again before trying without it. Undoing means you keep building on one list instead of copying it for every possibility.',
  },
  {
    id: 'greedy-1',
    topic: 'greedy',
    question: 'You want to attend as many non-overlapping meetings as possible. Which greedy rule gives the right answer?',
    answer: 'Always pick the meeting that ends earliest',
    wrong: ['Always pick the meeting that starts earliest', 'Always pick the shortest meeting', 'Always pick the meeting that overlaps the fewest others'],
    explanation: 'Finishing earliest leaves the most room for everything after it. The other rules all have counterexamples.',
  },
  {
    id: 'greedy-2',
    topic: 'greedy',
    question: 'When is a greedy algorithm safe to use?',
    answer: 'When you can show that the best local choice never rules out the best overall answer',
    wrong: ['Whenever the input is sorted', 'Whenever the problem asks for a maximum', 'Always. It is just a faster version of dynamic programming'],
    explanation: 'Greedy means always taking the option that looks best right now and never going back. It is fast, but only correct when that choice can never cost you later. Coins of 1, 3 and 4 are a classic failure: to make 6, greedy takes 4 + 1 + 1 (three coins), but 3 + 3 needs only two.',
  },
  {
    id: 'dp-1',
    topic: 'dynamic-programming',
    question: 'Naive recursive Fibonacci is O(2ⁿ). What turns it into O(n)?',
    answer: 'Caching each result so every fib(i) is only computed once',
    wrong: ['Replacing the recursion with a stack', 'Sorting the intermediate results', 'Using breadth-first search'],
    explanation: 'The naive version works out the same values again and again: fib(5) asks for fib(3) twice, and each of those repeats more work. Saving each answer the first time you work it out (called memoisation), or building the answers up from fib(0), means each one is worked out once.',
  },
  {
    id: 'dp-2',
    topic: 'dynamic-programming',
    question: 'You can climb 1 or 2 stairs at a time. Which formula counts the ways to reach stair n?',
    answer: 'ways(n) = ways(n − 1) + ways(n − 2)',
    wrong: ['ways(n) = 2 × ways(n − 1)', 'ways(n) = n²', 'ways(n) = ways(n − 1) + 1'],
    explanation: 'Your last move was either a single step from n − 1 or a double step from n − 2, so you add the ways of reaching each.',
  },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function quizQuestions(): QuizQuestion[] {
  return QUESTIONS.map((q) => ({
    id: q.id,
    topic: q.topic,
    question: q.question,
    options: shuffle([q.answer, ...q.wrong]),
  }));
}

/** Two right puts a topic at medium. Nobody starts at hard. */
export function scoreQuiz(answers: Record<string, string | null>): QuizResult {
  const marked = QUESTIONS.map((q) => ({
    id: q.id,
    topic: q.topic,
    correct: answers[q.id] === q.answer,
    answer: q.answer,
    explanation: q.explanation,
  }));
  const perTopic = TOPICS.map(({ id }) => {
    const correct = marked.filter((m) => m.topic === id && m.correct).length;
    const level: Level = correct >= 2 ? 'medium' : 'easy';
    return { topic: id, correct, level };
  });
  return { perTopic, answers: marked.map(({ topic: _topic, ...rest }) => rest) };
}
