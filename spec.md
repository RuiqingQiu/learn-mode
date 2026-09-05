# Learn Mode — Prototype Spec

A chat interface with an explicit **Learn** toggle. When on, the assistant stops
being an answer vending machine and runs a three-phase loop designed to make the
information stick.

---

## 1. The problem this is solving

Reading a fluent explanation produces the *feeling* of understanding without the
encoding. LLM output is maximally fluent, so it maximizes that illusion. The
person closes the tab believing they learned something and asks the same question
three weeks later.

Every intervention below works by reintroducing effort at a specific moment. The
hard part is not the pedagogy — it is knowing *when* the person wants it. Someone
closing a ticket at 6pm does not want Socratic treatment. That is what the toggle
solves: the user declares intent instead of us inferring it.

**Design principle that overrides everything else:** friction without an escape
hatch gets abandoned inside a week. Every screen has a one-click "just answer it"
and the copy never guilts the user for taking it.

---

## 2. Non-goals for v0

- No accounts, no auth. Single local user.
- No spaced repetition scheduler. (Data model leaves room — see §6.)
- No mobile layout.
- No streaming-perfect UX. Correct beats smooth for the prototype.
- Not trying to beat plain chat on speed. Learn mode is *supposed* to be slower.

**Assumed audience: novice on the topic in question.** Every scaffolding decision
below is tuned for someone who does not yet have a working model. This is a real
assumption, not a placeholder — scaffolding that helps a novice measurably
degrades an expert's performance, so a v0 that feels great to a beginner may feel
insulting to someone strong in the area. Do not try to detect expertise in v0.
See §10.5 for how this gets solved later.

---

## 3. Core flow

```
                    ┌──────────────┐
   user sends msg → │    TRIAGE    │ (cheap model, ~300ms)
   with Learn ON    └──────┬───────┘
                           │
              lookup ──────┴────── learnable
                 │                     │
                 ▼                     ▼
           ┌──────────┐         ┌─────────────┐
           │  ANSWER  │         │  PREDICTING │ ← user commits a guess
           │ (normal) │         └──────┬──────┘   or "I don't know" / skip
           └──────────┘                │
                                       ▼
                                ┌─────────────┐
                                │  REVEALING  │ ← layered answer + delta
                                └──────┬──────┘
                                       │  [Explain it back] (optional)
                                       ▼
                                ┌─────────────┐
                                │  TEACHING   │ ← protégé mode, 3–4 turns
                                └──────┬──────┘
                                       ▼
                                     IDLE
```

State lives on the **exchange** (one user question and everything that follows
it), not the thread. A thread can contain a mix of learn and normal exchanges.

**Where does one exchange end and the next begin?** This is the load-bearing
question, and the answer is: *the user declares it, the system never infers it.*
The toggle state at send time is the entire boundary mechanism — see §4.0.

Explicitly rejected: classifying each incoming message as follow-up vs. fresh.
The two errors are not symmetric. Quizzing someone mid-clarification is annoying
but visible and recoverable — they hit skip. Silently treating a fresh learn
question as a follow-up hands them a plain answer when they explicitly asked for
the loop, with no explanation; from the outside the toggle simply looks broken.
Classifiers are least reliable precisely at the ambiguous boundary where this
matters, so do not build one. Thread history still feeds the model as context —
it just does not decide exchange boundaries.

---

## 4. Phase specs

### 4.0 The toggle

- Segmented control in the composer, left of the send button: `Answer | Learn`.
- Defaults to `Answer`.
- **The toggle at send time is the exchange boundary.** Learn on → this message
  opens a new learn exchange. Learn off → plain answer, whether it is a follow-up
  or an unrelated new question. Nothing else decides.
- **Auto-resets to `Answer` when a reveal completes.** Your next message is plain
  unless you turn it back on. This is what makes follow-ups cheap without any
  inference: clarifying questions are the common case immediately after an answer,
  so that is the default, and one click buys you the loop again.
- The auto-flip must be **visible** — animate it, do not silently change state
  while the user is mid-thought. A toggle that changes under you without
  announcing itself is worse than one that guesses wrong.
- **Resets to `Answer` on session boundary** too: new thread, or app reload. Never
  persist across sessions. The failure this prevents: opening the app in a hurry
  three days later and getting quizzed on an urgent lookup.
- Keyboard: `⌘L` toggles. `⌘↵` sends in Answer mode regardless of toggle state
  (the power-user escape hatch).
- Visual state must be obvious *before* sending. The worst outcome is a user
  expecting an answer and getting a quiz.

### 4.1 TRIAGE

Not every question in learn mode deserves the ceremony. "What's the flag to make
`rsync` preserve symlinks?" has no productive prediction — there is nothing to
reason toward. Forcing a guess there is pure friction and it is exactly the thing
that will make users turn the feature off.

Cheap classifier call. Route to plain answer if the question is:

- pure recall / syntax lookup with no derivable structure
- a request to *do* something (write this, refactor that) rather than understand it
- so broad that a prediction is meaningless ("explain distributed systems")

Otherwise → PREDICTING. When triage routes to plain answer, say so in one short
line so the user does not think the toggle is broken: *"Straight lookup — here's
the answer."*

Use the cheapest model available for this (`claude-haiku-4-5-20251001`). It is a
binary classification and it sits on the critical path.

### 4.2 PREDICTING

The assistant returns a prediction prompt instead of an answer. Even a wrong guess
improves retention of the correct answer afterward — the failed prediction primes
the encoding. This phase is doing most of the work in the whole product.

**UI:**

```
┌────────────────────────────────────────────────┐
│  Before I answer — what's your current guess?   │
│                                                 │
│  Does a `defer` inside a for loop run at the   │
│  end of each iteration, or at the end of the   │
│  function?                                      │
│                                                 │
│  [ text input                              ]   │
│                                                 │
│  Confidence:  ○ low  ○ medium  ○ high          │
│                                                 │
│  [ Submit ]   [ No idea — give me a hint ]     │
│                                            ...  │
│                                    [Just answer]│
└────────────────────────────────────────────────┘
```

**Prediction question types.** The model picks one:

| Type | When |
|---|---|
| `open` | The answer is derivable from things the user likely knows |
| `choice` (3 options, near-misses) | Answer is not derivable, but discriminating between plausible options teaches the concept boundary |
| `code_choice` (3–4 generated snippets) | Anything where the answer is code — see below |
| `which_breaks` | Debugging / behavior questions |

Near-miss distractors matter. Three options where two are obviously wrong teaches
nothing.

**`code_choice`.** For code questions, typing a guess into a text box is too much
friction for too little signal — people will skip it. Instead the model generates
3–4 short snippets and the user picks one. Rendered as syntax-highlighted blocks,
click to select.

The variants must differ in **exactly one meaningful way**, and that difference
must be the concept being taught. Four snippets that vary in style, naming, or
line count teach nothing; four that vary only in where the lock is acquired teach
the whole lesson in one glance. Instruct the model explicitly: state the single
axis of variation before generating, then generate along it.

Keep snippets under ~10 lines. If the concept cannot be shown in 10 lines, it is
too big for one prediction — fall back to `open`.

**"No idea" handling.** This is a valid state and must not dead-end. Return a hint
that narrows the space, then re-prompt once. If they bail again, go straight to
REVEALING with no penalty framing. A blank box and no way forward is how you lose
the user permanently.

**Confidence capture.** Store it. Not shown to the user in v0 beyond the input —
it feeds the calibration view in v2, which is the most interesting long-term
artifact this thing produces.

### 4.3 REVEALING

The answer arrives in **layers**, plus a delta against what the user predicted.

Model emits XML-delimited sections so the client can parse mid-stream:

```xml
<gist>One sentence. The answer, no elaboration.</gist>

<delta>
  <held-up>What in their prediction was correct — be specific, name the
  actual reasoning that worked, not "close!"</held-up>
  <off>What was wrong and, more importantly, the *belief* that produced
  the wrong answer.</off>
</delta>

<core>The mechanism. 3–5 sentences. Why the gist is true.</core>

<full>Everything: edge cases, examples, caveats. Markdown.</full>
```

**Rendering:**

- `gist` — always visible, larger type.
- `delta` — always visible. Skipped entirely if the user skipped the prediction.
- `core` — visible by default, collapsible.
- `full` — collapsed behind `Show full answer ▸`. One click.

**Delta, not grade.** No score, no percentage, no ✅/❌. The value is in naming the
faulty belief, not in rendering a verdict. "You had the scoping right but assumed
`defer` was block-scoped — it's function-scoped, which is why…" is useful. "60%
correct!" is not.

**Follow-ups.** There is no follow-up detection. When a reveal completes the
toggle flips to `Answer` (§4.0), so the next message — clarifying question or
otherwise — gets a plain response. Running the prediction loop on every
clarifying question is exhausting and is the fastest way to make the mode feel
hostile, and this makes that the default without the system ever guessing what
kind of message it just received.

If a "follow-up" is substantial enough to deserve the loop, the user flips the
toggle back on and it opens a new learn exchange. That is the correct outcome:
a question worth predicting on is a question worth its own exchange.

**⚠️ The right-answer case.** If the prediction was essentially correct, do *not*
run the full ladder — you are wasting the time of the person who least needs it.
Confirm crisply, then offer a **transfer probe**: same concept, different
substrate. *"Right. Does that still hold if the loop body panics?"* This is the
single most likely place for the prototype to feel patronizing, so handle it
explicitly rather than letting the model improvise.

### 4.4 TEACHING (protégé mode)

Optional. Launched by an `Explain it back ▸` button under the revealed answer.

The assistant adopts a **confused junior** persona and asks the questions a junior
would actually ask. Teaching forces gaps into the open in a way that re-reading
never does.

**Rules baked into the prompt:**

- Play a real junior, not a Socratic examiner. Ask because you're confused, not
  to test.
- Never reveal the answer while in character.
- Ask about the thing the user's explanation *skipped*, not a random detail.
- Escalate: first question is basic, later questions probe the edge the user is
  hand-waving.
- **Hard cap: 4 turns.** Then break character.

**Exit summary** (out of character, short):

> *Where your explanation was solid:* …
> *Where it got thin:* …

Then back to IDLE. There must be an `End session` button visible at all times
during TEACHING — an AI that keeps asking questions is genuinely maddening if the
user is done.

---

## 5. Prompt sketches

Put these in `/prompts` as separate files so they can be iterated without touching
app code. They are the actual product; the UI is a wrapper.

**`triage.md`** — Classify into `LOOKUP` or `LEARNABLE`. Output one token.
Include 6–8 few-shot examples, weighted toward the ambiguous middle.

**`predict.md`** — Given the question, produce a prediction prompt. Must pick a
question type, must produce near-miss distractors for MC, must not leak the
answer. Constrain hard on length: two sentences maximum, or users will not read it.

**`reveal.md`** — Given question + user prediction + confidence, emit the XML
above. Explicit instruction on the delta: identify the *underlying belief* behind
a wrong prediction, not just the wrong output. Explicit branch for the
correct-prediction case.

**`protege.md`** — Persona, the four rules from §4.4, and the exit format.

**Consistency note:** the same underlying answer should drive `gist`, `core`, and
`full`. Generate them in one call, not three, or the layers will contradict each
other on edge cases.

### 5.1 Delta tone — rules and fixtures

The delta is the single most likely thing in this product to read as
condescending. Encode the tone as hard rules in `reveal.md` rather than hoping:

- No exclamation marks. No "great try", "nice thinking", "you're close".
- No praise sandwich. Say what held up because it *did*, not to soften what follows.
- Name the **belief**, not the wrong output. "You assumed X" beats "X is wrong".
- End on a consequence where one exists — where this belief would bite in real code.
- No reassurance that others get it wrong too. It reads as pity.

Keep these as fixtures in `/prompts/fixtures/` and eyeball them after every prompt
change. Two are enough to catch tone drift.

**Fixture 1 — wrong prediction.**

> **Q:** Does a `defer` inside a for loop run at the end of each iteration, or at
> the end of the function?
> **Prediction:** "End of each iteration — it's inside the loop block." *(medium)*

✗ Avoid:
> Not quite, but great instinct! Actually `defer` is function-scoped, not
> block-scoped. Don't worry — this one trips up a lot of people!

✓ Target:
> **Held up:** You read it as block-scoped, which is the right instinct for
> almost everything else in the language — `:=`, shadowing, and variable lifetime
> all work that way.
> **Off:** `defer` registers against the *function*, not the enclosing block. The
> belief to update is "braces create a defer boundary". They don't — which is why
> deferring `file.Close()` inside a loop over 10,000 files holds all 10,000
> handles open until the function returns.

**Fixture 2 — correct prediction.**

> **Q:** If I mutate a slice inside a function, does the caller see the change?
> **Prediction:** "Yes — the slice header holds a pointer to the backing array."
> *(high)*

✓ Target:
> Right, and for the right reason. Transfer probe: does the caller still see it
> if the function calls `append` and the slice is already at capacity?

Note what fixture 2 does *not* do: no recap, no "as you correctly noted", no
re-explanation of the thing they just demonstrated they know.

---

## 6. Data model

SQLite via `better-sqlite3`. Enough structure to make v2 features possible without
a migration, which is the only reason to bother with a real DB in a prototype.

```ts
Thread   { id, title, created_at }

Exchange {
  id, thread_id, mode: 'answer' | 'learn',
  question: string,
  triage_result: 'lookup' | 'learnable',
  state: 'predicting' | 'revealing' | 'teaching' | 'done',
  created_at
}

Prediction {
  id, exchange_id,
  type: 'open'|'choice'|'code_choice'|'which_breaks',
  prompt_text: string,
  options: json | null,         // [{ id, label, code? }] for choice types
  text: string | null,          // free text, or selected option id
  confidence: 'low'|'med'|'high' | null,
  skipped: boolean,
  hinted: boolean,              // did they use "no idea"
  was_correct: boolean | null   // model's judgment, for calibration
}

Answer   { id, exchange_id, gist, core, full, delta_held_up, delta_off }

TeachTurn{ id, exchange_id, idx, junior_msg, user_msg }

Concept  { id, label, slug }          // e.g. "go-defer-scoping"
ExchangeConcept { exchange_id, concept_id }
```

`Concept` is the cheap thing to add now and expensive to retrofit. Tag each
exchange with 1–3 concept labels (one extra Haiku call, off the critical path,
fire-and-forget). It unlocks:

- **recurrence detection** — third time you ask about the same concept, that is
  the moment to suggest Learn mode unprompted
- **spaced retrieval** — resurface the question days later
- **the independence curve** — see §9

---

## 7. Stack

Matching what you already run, so there is no setup tax:

- **Next.js (App Router)** + TypeScript
- **Tailwind** — do not spend time on a component library for this
- **`@anthropic-ai/sdk`**, streaming via route handlers
- **better-sqlite3**, file at `./data/learn.db`
- Models: `claude-sonnet-5` for reveal/protégé, `claude-haiku-4-5-20251001` for
  triage and concept tagging. Verify current strings at
  https://docs.claude.com/en/docs/about-claude/models

**Routes:**

```
POST /api/triage      → { result }
POST /api/predict     → { prompt, type, options? }
POST /api/reveal      → SSE stream of XML sections
POST /api/teach       → SSE stream, junior turn
POST /api/exchange    → persist state transitions
```

**Latency budget.** Learn mode adds two round trips before the user sees anything
substantive. Mitigate: fire triage and the normal answer *in parallel*, discard
the answer if triage says LEARNABLE. Costs a few cents, saves a second on every
lookup — and lookups are where added latency is least forgivable.

---

## 8. Build order

Each milestone is independently demoable. Do not build ahead.

1. **Plain chat.** Streaming, threads, persistence. No learn mode. Baseline you
   can compare against.
2. **Toggle + PREDICTING + REVEALING (layers only, no delta).** This alone is
   most of the value. Use it for a week before building more.
3. **Delta + `code_choice`.** Including the correct-prediction branch. This is the
   phase most likely to feel wrong on first pass — budget prompt iterations, and
   check output against the §5.1 fixtures each time.
4. **Triage.** Until now, learn mode runs on everything, which will annoy you into
   understanding what triage actually needs to catch.
5. **Protégé mode.**

Concept tagging can land any time after 2. It writes to the DB and nothing reads
it yet.

---

## 9. How to tell if it works

Uncomfortable, but worth stating in the spec so you do not accidentally optimize
against it:

**If this works, usage on a given concept goes down.** The success metric is a
downward-sloping assistance curve per user per concept — you ask about `defer`
less over time. Engagement metrics will make a working version look like a failing
one. That misalignment is probably why so little of this ships anywhere.

Prototype-scale proxies, on yourself:

- Do you keep the toggle on after week one, or quietly stop using it?
- Escape-hatch rate per phase — which phase are you bailing out of? That is the
  broken one.
- Two weeks later, cold: can you answer three questions you predicted wrong on?

---

## 10. Decisions and what's still open

### 10.1 + 10.3 Toggle stickiness and follow-up detection — **decided together**

These turned out to be one question, not two. The toggle at send time *is* the
exchange boundary: Learn on opens a learn exchange, Learn off gets a plain answer.
The toggle auto-flips back to `Answer` after each reveal, which makes clarifying
questions cheap without the system ever having to work out whether a message was
a follow-up. Specced in §3 and §4.0. Message-level classification is explicitly
rejected — reasoning in §3.

This weakens the earlier "sticky within a thread" call. Stickiness made sense
across *questions*; it makes less sense across a question and its clarifications,
which is where the exhaustion comes from.

**Inversion trigger.** If in practice you find yourself re-clicking the toggle on
almost every message, follow-ups are rarer than assumed and the default is wrong.
Invert it: keep the toggle sticky through the whole thread and add an explicit
"skip the prediction" button on the composer. Worth watching for in week one —
it is a two-line change if you are right.

### 10.2 Delta tone — **open, but testable now**

Still unresolved and it should be. Fixtures in §5.1 exist so you can judge tone
against concrete output instead of arguing about it in the abstract.

Test protocol that actually works: use questions you genuinely do not know the
answer to. Testing the delta on things you already know will mislead you badly —
you cannot feel condescended to about a fact you already had, so everything will
read as fine.

### 10.4 Code questions — **decided, in scope for v0**

`code_choice`: model generates 3–4 snippets varying along one axis, user picks.
Specced in §4.2. This turned out cheaper than expected — it is a variant of the
existing multiple-choice path, not a new subsystem — so it lands in milestone 3
rather than being deferred.

### 10.5 Expertise detection — **deferred, but the data starts now**

v0 assumes novice (§2). The eventual fix does **not** need a separate placement
quiz: `Prediction.confidence` + `Prediction.was_correct`, joined against
`ExchangeConcept`, *is* a per-concept knowledge assessment, gathered passively
while the user does the thing they wanted to do anyway. After ~10 predictions in a
concept area you know more about their command of it than any upfront quiz would
tell you, and you did not make anyone sit a test to get it.

Two ways to spend that signal, both v2:

- **Suppress the scaffolding** where they are consistently right with high
  confidence — drop straight to `gist` + transfer probe.
- **Surface miscalibration** — a view showing where confidence and correctness
  diverge. High confidence plus wrong is the most valuable cell in the matrix and
  the one nothing else in a developer's life ever shows them.

Worth noting an upfront quiz is not just costlier, it is worse: it measures a
declared topic at one moment, while the passive version measures the actual
concepts the person keeps colliding with. The one thing it cannot do is help the
very first session, which is precisely why v0 assumes novice.

### 10.6 Still genuinely unknown

- Whether people use the toggle at all once the novelty wears off, or whether
  recurrence-triggered suggestion (§6) has to carry it.
- Whether `code_choice` snippets can be generated reliably enough to vary along
  exactly one axis. This is a prompt-quality question and it may not survive
  contact with real questions.
- Whether protégé mode is charming or insufferable. No prior to work from.

---

## Appendix: starting Claude Code

Drop this file at the repo root and open with:

```
claude "read learn-mode-spec.md and scaffold milestone 1 only —
plain streaming chat with SQLite persistence. Stop before learn mode."
```

Worth writing a `CLAUDE.md` alongside it with: the escape-hatch principle from §1,
the layered-XML contract from §4.3, and a note that `/prompts/*.md` are edited by
hand and should not be refactored into code.