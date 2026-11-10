# Teaching review of saved sessions

Reviewed on 10 November 2026. The app server was unavailable, so this review used the saved database in `data/coding-practice.db`, opened read only. It covers all five coding sessions (131 messages) and both Learn chats (60 messages). Three coding sessions passed, one contains only an opening message, and Draining Rain Barrel is unfinished.

These conversations predate the teaching changes made in this chat. They identify failure modes in the earlier tutor, rather than proving whether the new prompt fixes them. Suggested responses below are proposals, not observed outcomes.

## Main finding

The strongest recurring difficulty is understanding what a binary search's pointers and returned boundary mean. Correct code, successful traces and passing tests sometimes appeared before that understanding was secure.

There is also evidence of independent reasoning: in Undo and Redo, Jonny proposed the second stack himself and identified when it should be cleared (coding messages 8 and 10). In the complexity Learn chat, he identified the nested lookup cost and proposed a lookup structure to remove it (Learn message 3). The evidence does not support treating these sessions as a general inability to reason about code.

## Where prompt changes could have helped

### 1. Distinguish positions, values and the end boundary

In Counting Ride Tickets, Jonny described pointers as the heights 100 and 140 (messages 51 and 69), then mixed the returned index with the height stored there (104). In Shipping Fee Brackets, he explicitly said he had read the right pointer as the last index rather than the array length (94). This confusion recurred in the binary search Learn chat when the tutor changed to an exact match search with `high = length - 1` (43).

The tutor corrected individual traces, but did not first establish a durable picture of the range. A more useful prompt would require an indexed array, show `left`, `right`, `mid` and `array[mid]` separately, and label `right = length` as the end boundary rather than a readable element.

The new visual trace partly addresses this. The explicit distinction between a cell value, its index and the end boundary is still worth adding to the teaching prompt.

### 2. Explain the return value before pointer updates

The three binary search problems use a returned boundary differently:

| Problem | Boundary being found | What the caller needs |
|---|---|---|
| Counting Ride Tickets | First ride requirement greater than the visitor's height | The boundary index itself is the number of eligible rides |
| Shipping Fee Brackets | First bracket start greater than the package weight | The preceding index selects the fee; boundary 0 means free |
| Draining Rain Barrel | First reading at or below the threshold | The boundary index is an hour; boundary equal to length means add -1 |

In Ride Tickets, Jonny asked why an index could be added to the total (104). In Shipping, he asked why the result was null after indexing `fees` at the returned boundary (90–95). These are closely related questions about the meaning of the result.

A prompt could have the tutor identify the answer manually for one input, name whether it is a count, index, value or lookup position, and explain the none/all cases before discussing the search loop. For Ride Tickets: "There are three eligible rides. Index 3 marks where they end, so we add 3, not the height stored at index 3."

### 3. Keep one search convention explicit

The binary search Learn chat moved from exact match to boundary search (25–28), later recommended further practice, and then returned to exact match when Jonny asked about "equal search" (41–46). He asked why the high pointer started at 4 rather than 5 and used the boundary search pointer update in the exact match exercise. He then asked when to use each version (47).

A prompt should label the current task, range convention, stopping condition and returned meaning before each exercise. When changing a convention, explain the reason and change those rules together. Teach one convention until the learner can explain its decisions on a fresh example, then compare another.

The tutor also used the misleading explanation that a half open boundary search stops with "one candidate left" (Learn 34). In `[left, right)`, the interval of elements to inspect is empty when the pointers meet. The boundary has been determined; it can equal the array length. Keeping inspected elements separate from possible boundary positions matters here.

### 4. Validate questions and corrections before presenting them

Some confusion came from the tutor:

- It called the middle of `[1, 3, 7]` the only value meeting `>= 3`, although 7 also qualifies, then corrected itself (binary search Learn 28–30).
- It implied that calculating a midpoint after the pointers crossed at the high end would read outside the array. Jonny said the questions were unclear; the tutor then calculated the example and withdrew that claim (56–58).
- Jonny correctly said the left pointer would stay at 0, and the tutor offered a "correction" saying that the high pointer moves rather than low, which agreed with what he had said (37–38).
- In Shipping, Jonny asked whether the comparison could be less than or greater than. The answer discussed `<` versus `<=` instead. His next message inferred a universal rule about avoiding equality (coding 100–103).

The prompt should require the tutor to calculate its own example before asking a diagnostic question, check the learner's literal claim before correcting it, and clarify whether a comparison question concerns swapped operands, reversed direction or equality. These are separate ideas.

### 5. Use an observable check before advancing

Counting Ride Tickets passed all 13 tests at message 65. The later discussion still contained repeated confusion. At 115 the tutor said Jonny could handle every case; at 116 he replied, "I still don't understand the problem here. Can you explain it?" In the binary search Learn chat, the tutor recommended harder practice (38) before the uncertainty about exact match and boundary search was resolved (41–47).

A correct result is useful evidence, but does not settle why a pointer move is safe or what the return value means. The prompt could require one fresh decision and one explanation of the returned result before recommending harder work. When the result is right but the reasoning is inconsistent, acknowledge the correct result and work on that specific gap.

The new prompt's prediction questions and delayed independent reviews already address part of this. An explicit criterion for moving on would make the instruction sharper.

### 6. Demonstrate the reason for discarding a side

In Draining Rain Barrel, Jonny's trace and code disagreed about which pointer moved (157). The tutor identified the discrepancy but ended by asking whether a qualifying middle should stay in range or be thrown away (158). A short worked decision would give the question a firmer basis: "40 is at or below 75, so index 3 is a possible trigger hour. An earlier reading may qualify, so check earlier positions. A later reading cannot be the first because index 3 already qualifies."

This connects with the complexity Learn chat: Jonny knew that a smaller value could be discarded but did not initially explain why it could never match a later value in the other sorted array (11–14). The shared prerequisite is using sorted order to justify discarding possibilities.

The new prompt explicitly asks for this demonstration and for concrete help after repeated confusion. The transcripts support prioritising that change.

## Proposed additions to the guided tutor prompt

> Establish the result before the loop. Use one tiny input to find the answer manually. Name whether the function needs a count, index, value or lookup position, and explain what none and all qualifying cases mean.
>
> Label the current search convention. State what the pointers delimit, whether the right boundary is included, what ends the loop and what it returns. Keep that convention stable until the learner can explain it. When introducing another, explain why its rules differ.
>
> Separate indexes from values. In a trace, show left, right, mid and array[mid] independently. Label the array length as the end boundary. Explain which pointer values can be read as array indexes.
>
> Diagnose one gap at a time: interpreting the task, evaluating the comparison, justifying a pointer move, or interpreting the result. Demonstrate that step with real values, then ask for the corresponding decision on a fresh example.
>
> Check understanding before advancing. A passing test or correct answer supports correctness. Ask the learner to explain one pointer decision and the returned result in their own words before recommending harder work. Inconsistent reasoning calls for another small example.
>
> Verify each teaching example before asking about it. Calculate its trace and check the stated premise. Compare a correction with what the learner actually said. When a question could mean reversing operands, changing comparison direction or including equality, resolve that ambiguity first.

## Separate implementation issue

The tutor repeatedly admitted recording the same hint twice in Counting Ride Tickets (58, 60, 62). The stored list is `[1,1,2,2,3,3,4]`, and the feedback then says Jonny needed seven hints (66). Shipping has another admission of a duplicate hint (91). These counts are not reliable evidence of how much help was needed. Prompt wording can keep bookkeeping out of teaching feedback, but reliable counting needs idempotent recording in the application.

## Evidence locations

Source database: `/Users/gbJoRoMa/work/coding-practice/data/coding-practice.db`. Coding message references are primary keys in `messages`; Learn references are primary keys in `learn_messages`.

- Undo and Redo in a Word Editor: `a7790fcb-446f-4271-864c-5ddbd81ee2d8`, 12/12 tests passed.
- Counting Ride Tickets: `d1ccdaa9-c4ed-4690-97ef-d2ba5d209723`, 13/13 tests passed.
- Shipping Fee Brackets: `f32a1732-41bf-492d-9e43-cb43d0d15e8c`, 14/14 tests passed.
- Collapse Repeated Sensor Readings: `8026a35b-1235-4a2b-a2af-5c8c0571822e`, opening message only. There is no evidence of a struggle in this session.
- Draining Rain Barrel: `4a7ef2b6-c61f-40b6-8309-4295b7a90e69`, unfinished, latest visible run 0/3.
- Complexity Learn chat: `4e3fff1d-761a-48f4-80e3-e22153396270`.
- Binary search Learn chat: `db78509c-bc05-4b7d-9f9d-90461b92c8c3`.

Current prompts were compared in `server/coach.ts`, `server/learn.ts` and `server/plainLanguage.ts`. This review proposes further prompt changes; it does not edit those prompts or session data.
