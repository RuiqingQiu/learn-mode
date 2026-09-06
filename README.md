# Learn Mode

Chat with three modes, plus a course library. **Answer** is a normal assistant. **Learn** makes you
commit a guess first, then answers in layers with a delta against what you
predicted, and optionally makes you explain it back to a confused junior.
**Shadow** hands the same design task to you and to Claude at once, hides
Claude's work until you commit yours, and then shows the two as a decision diff.

**Courses** are the other half: an educator publishes a curriculum and how they
want it taught, and the app runs the session and keeps the score.

Built from `spec.md` and `shareable.md`.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`
npm run dev
```

Open http://localhost:3000. SQLite is created at `./data/learn.db` on first use.

## First run

On first run you pick two things — what should happen after the answer
(explain it back / quiz / one transfer question), and how much of the answer
should be tables and diagrams rather than paragraphs. Both are changeable later
from **Preferences** in the sidebar.

They're framed as *what do you want this to do*, not *what kind of learner are
you* — matching teaching to a self-reported learning style doesn't hold up, but
"quiz me at the end" is a real preference about whether you'll keep using the
thing.

Committing a guess isn't configurable. It's the part carrying the weight.

**Reset** — the Preferences screen has a *Reset — show this as a first run*
control, which clears your settings and brings the setup screen back. Useful for
demoing.

**Examples** — a fresh install seeds seven worked examples in the sidebar, each
labelled with the preference combination that produced it, so you can see what
the settings actually do before choosing:

- *Explain it back · mostly tables & diagrams* — a wrong guess, the delta, and a
  full four-turn explain-back with the exit summary
- *Quiz me afterwards · mostly tables & diagrams* — a broad topic narrowed to one
  concept, a correct guess, then a graded quiz
- *One transfer question · balanced*
- *Same question · mostly prose* and *· mostly tables & diagrams* — the identical
  question at both extremes, side by side
- *A question that is genuinely a diagram* — git merge vs rebase, where the answer
  is commit graphs rather than paragraphs
- *Triage bailed out* — Learn mode on a pure lookup

They're real captured output, not mock-ups. `npm run gen:examples` regenerates
them.

## Courses

A course is one file — `courses/*.md`, YAML frontmatter for the topics,
checkpoints and weak-area vocabulary, markdown below it for the persona, question
style and evaluation rules. It is published on boot, or pasted into
**Publish a course**. `courses/system-design-staff.md` ships with it: 28 topics
of staff-level system design.

Open **Courses** in the sidebar. Pick a topic, and Claude drills you on it — one
question at a time, rated and corrected as you go, checkpoints ticking off in the
rail as you demonstrate them. `Hint`, `Skip this one`, `End session` and
`Leave for now` are always there, and `Status` answers from the database rather
than from the model, so the numbers are real.

At the end you get a score, what held up, where it got thin, and one thing to go
read. It all lands in **Notes**, aggregated by weak area and exportable as
markdown.

The bookkeeping is the point. It used to be a `progress.json` you edited by hand.

```bash
npm run import:progress -- ./progress.json system-design-staff
```

brings an existing one across — statuses, scores, attempts and weak areas. Those
tags are kept exactly as they were and shown as *imported*, because they predate
the course's vocabulary and rewriting them would misreport your own history.

**Weak areas only aggregate because the vocabulary is closed.** The course author
declares `weak_area_taxonomy` per topic and anything else the model reaches for
is dropped. The imported data shows why: three sessions produced
`specificity-tools-and-numbers`, `specificity-mechanisms-over-instincts` and
`specificity-naming-mechanisms-and-tools` for what is one recurring gap, and it
never added up to anything.

## The loop

```
send with Learn on
   └─ TRIAGE (haiku, in parallel with a speculative plain answer)
        ├─ lookup    → the plain answer, already streaming
        └─ learnable → PREDICTING → REVEALING → (Explain it back) → TEACHING

send with Shadow on
   └─ Claude solves it privately, in parallel with you   ─┐
      you commit your approach                            ├─→ DECISION DIFF → one probe
                                                          ─┘
later, in a new thread
   └─ a miss from an earlier session, re-asked in a different domain, cold
```

- **Modes** — `⌘L` cycles Answer → Learn → Shadow. Auto-resets to Answer after
  each reveal, visibly, so follow-ups are cheap. Never persisted across reloads.
- **Shadow** — Claude generates its solution *before* it can see yours, and the
  text is not sent to the browser until you commit. That ordering is not
  politeness: a model shown your design first anchors on it and the diff turns
  into agreement. `Just show me Claude's approach` skips the whole thing.
- **The diff is decisions, not prose** — 4–6 rows of `you | claude`, tagged
  `agree` / `diverge` / `gap` / `user-ahead`, then **one** probe on the single
  divergence that costs the most. Not fifteen nitpicks.
- **A miss comes back later.** Get the probe wrong and that belief resurfaces in
  a new thread, in a different domain, with nothing on screen to read from —
  Redis job locks came back as a hospital infusion pump holding a control lease.
  It is the only thing here that measures what stuck after Claude left.
- **`⌘↵`** — sends a plain answer regardless of the toggle.
- **Escape hatches** — `Just answer it`, `No idea — give me a hint`, and
  `Pause — ask something else` in protégé mode. Skipping is never penalised or
  commented on.
- **Getting stuck while explaining back** is fine: the junior narrows in character
  rather than revealing. `Stuck — ask the main chat` sends the whole explain-back
  transcript to the main line in one click — your own answers are where the gaps
  are. The answer lands in the thread and the session floats below it, so
  everything you can act on stays at the bottom next to the composer. `Pause`
  steps out without asking anything; `Clear` drops the session.
- **You don't wait on the full answer.** It's the longest section and streams
  last; the button says *still writing* while it does, and `Explain it back`
  unlocks as soon as it starts rather than when it finishes.
- **`You guessed:` expands.** Click it to see the original question, every option,
  which one you took, and which one was right.

## Testing

```bash
npm test             # unit tests, no API calls
npm run smoke        # Learn mode, real Chrome + real API calls (~$0.20)
npm run smoke:shadow # Shadow mode, same (~$0.15)
npm run smoke:course # a guided course session, same (~$0.15)
```

## Iterating

`prompts/*.md` are hand-edited and re-read on every request — change one and hit
send, no restart. `courses/*.md` are re-read on restart. After touching `reveal.md`, check the output against
`prompts/fixtures/delta-tone.md`; after touching `shadow-diff.md` **or**
`shadow-solve.md`, run both fixtures in `prompts/fixtures/shadow-diff.md`. The
second one exists because the model will find fault to justify its own existence,
and a user whose simpler design is correct is the case that catches it.

Routes are curl-able for prompt work:

```bash
curl -s localhost:3000/api/triage -H 'Content-Type: application/json' \
  -d '{"question":"Why does adding an index sometimes make a query slower?"}'

curl -s localhost:3000/api/predict -H 'Content-Type: application/json' \
  -d '{"question":"Why does adding an index sometimes make a query slower?"}'
```

See `CLAUDE.md` for architecture and the rules that are load-bearing.

## Deploying

Deployed on Vercel as a demo. **Data does not persist there** — this is a known,
accepted tradeoff, not a bug:

- Vercel's filesystem is read-only apart from `/tmp`, which is not shared between
  concurrent lambdas and is wiped on cold start. `src/lib/db.ts` points SQLite at
  `/tmp/learn.db` in that environment so the app *works* on a warm instance, but
  threads, predictions and the §10.5 calibration rows are throwaway.
- The sidebar says so, so it does not look broken.
- Run it locally (`npm run dev`) for anything you want to keep.

To make it persist, swap `better-sqlite3` for a hosted database. Turso (libSQL)
is the smallest change — same SQL dialect, so every query in `src/lib/repo.ts`
stays as-is; the work is that the driver is async, so the repo functions and
their call sites need `await`.

**There is no auth.** Anyone with the URL can use it and spend your Anthropic
credits. Set `ANTHROPIC_API_KEY` in the Vercel project's environment variables,
and keep an eye on usage — a single learn exchange is several Opus 5 calls.

```bash
gh auth login          # once
gh repo create learn-mode --private --source=. --push
npx vercel             # link and deploy, then add ANTHROPIC_API_KEY
```
