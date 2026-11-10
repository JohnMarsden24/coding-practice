# Coding practice

A local app for learning coding interview problems with Claude as a fellow engineer. Work through one idea at a time with concrete examples, then try a fresh problem independently. Your TypeScript runs against real tests, and your practice is saved locally.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173.

Claude is reached through the same Bedrock gateway settings Claude Code uses, read from your shell: `ANTHROPIC_BEDROCK_BASE_URL`, `AWS_REGION` and `CLAUDE_CODE_SKIP_BEDROCK_AUTH`. There's nothing to log in to. To change the models or the port, or to tell Claude about your background with `LEARNER_BACKGROUND`, copy `.env.example` to `.env`.

Sessions live in `data/coding-practice.db` (SQLite). Delete it to start over.

## How a session works

1. The first time, a 28 question quiz sets your starting level per topic. You can skip it and start with the basics.
2. "New problem" suggests your weakest topic. Opus writes a fresh problem with visible tests, hidden edge case tests and large inputs, then checks them all against its own reference solution before you see the problem.
3. Guided learning is the default. The requirements are visible from the start. Begin with a small example, predict one decision, turn it into code, then check boundary cases. Discuss complexity once the behaviour makes sense.
4. When you're stuck, Claude increases support from a question to a concrete pointer, an explanation, then a worked example or partial code. **Show a worked example** asks for a demonstration straight away. Claude can show a visual trace with the inspected value, remaining possibilities and saved answer. Predict the next step before revealing it. These are teaching illustrations, not execution traces of your code.
5. **Run** (⌘ Enter) runs the visible tests. **Submit** runs everything, including hidden and large inputs. Feedback focuses on what your reasoning and tests show, with one next step to learn. You can fix your code and resubmit until you solve it.
6. **Study solution** finishes the attempt and shows the model solution with a walkthrough. Your level stays the same.

Choose **Independent practice** to work without algorithm reminders or coaching. You can clarify requirements and syntax, or use **Get teaching help** to switch the attempt to guided learning. A first independent submission that passes without hints moves your topic up one level. Guided solves, retries and studying solutions keep it unchanged. This is a practice signal, not proof of mastery.

After finishing an attempt, an independent review appears on New problem, scheduled two days later. It uses a different scenario and asks you to choose the approach yourself. Successful independent reviews extend the next gap to seven days, then 21, up to 30. Finishing a guided attempt or a retry resets it to two days. Reviews are offered in the app; they do not send notifications. Existing sessions open in guided mode, preserving code, messages and current topic levels.

## Learn

**Learn** in the sidebar is an open chat for studying, with no problem attached. Ask Claude (Sonnet) anything about data structures, algorithms or interviews and it teaches from the ground up, with TypeScript examples. It knows your level for each topic and your recent problems, so it can pitch explanations and suggest what to practise next. Each chat is saved and listed in the sidebar, where you can rename or delete it. Learn chats don't change your topic levels.

## Voice

Hold the mic button, or hold Space, and speak. A quick tap of Space still types a space, and in the code editor Space always types. Rough words appear as you talk, and when you let go the message sends. Tick "Review voice messages before sending" to check it first.

The text you send comes from [Whisper](https://github.com/ggml-org/whisper.cpp) on your Mac. When you let go, the recording is transcribed locally in about a second, using the problem's function and parameter names and the topic's terms as hints, so `mergeCrates` and "O(n log n)" come out right. The rough words you see while talking come from the browser's speech recognition, which in Chrome sends audio to Google. One-off setup:

```sh
brew install whisper-cpp ffmpeg
mkdir -p data/models
curl -L -o data/models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

Without Whisper, the browser's transcript is what gets sent. That only works in Chrome and Safari. The footer under the message box says which one is in use.

## Other commands

- `npm test` runs the test runner and API tests.
- `npm run typecheck` checks types.
- `npm start` builds the UI and serves everything from http://localhost:3001.
