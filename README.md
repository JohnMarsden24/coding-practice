# Coding practice

A local app for practising coding interview problems with Claude as a fellow engineer. Claude talks through your reasoning with you, gives hints one step at a time instead of answers, runs your TypeScript against real tests, and gives feedback when you submit.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173.

Claude is reached through the same Bedrock gateway settings Claude Code uses, read from your shell: `ANTHROPIC_BEDROCK_BASE_URL`, `AWS_REGION` and `CLAUDE_CODE_SKIP_BEDROCK_AUTH`. There's nothing to log in to. To change the models or the port, copy `.env.example` to `.env`.

Sessions live in `data/coding-practice.db` (SQLite). Delete it to start over.

## How a session works

1. The first time, a 28 question quiz sets your starting level per topic. You can skip it, and every topic starts at easy.
2. "New problem" suggests your weakest topic. Opus writes a fresh problem with visible tests, hidden edge case tests and large inputs, then checks them all against its own reference solution before you see the problem.
3. Claude (Sonnet) opens by asking you to restate the problem. It holds back details like input sizes until you ask, and adds each one to the notes on the problem panel.
4. Talk through your approach. When you're stuck, Claude climbs a hint ladder: a question, a pointer, the pattern by name, then pseudocode. It won't write the solution.
5. **Run** (⌘ Enter) runs the visible tests. **Submit** runs everything, including hidden and large inputs, and Opus gives feedback on what worked well and what to work on. You can fix your code and resubmit.
6. **Give up** shows the model solution with a walkthrough.

Your level for a topic goes up when you solve it on the first submission with two hints or fewer, and down when your first submission fails or you give up.

## Voice

Hold the mic button, or hold Space when you're not typing, and speak. Your words appear in the message box and send when you let go. Tick "Review voice messages before sending" to check them first. This uses the browser's built-in speech recognition, so it works in Chrome and Safari but not Firefox. Chrome sends the audio to Google for recognition.

## Other commands

- `npm test` runs the test runner and API tests.
- `npm run typecheck` checks types.
- `npm start` builds the UI and serves everything from http://localhost:3001.
