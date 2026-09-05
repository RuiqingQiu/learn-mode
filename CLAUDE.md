# Learn Mode

A chat app with an explicit **Learn** toggle. When on, the assistant makes you
commit a guess before it answers. `spec.md` is the source of truth — read it
before changing behaviour.

## Run it

```bash
npm run dev          # needs ANTHROPIC_API_KEY, or `ant auth login`
npm run typecheck
```

SQLite lives at `./data/learn.db` and is created on first request.

## Three rules that override convenience

### 1. Every screen has an escape hatch, and the copy never guilts the user

Friction without a way out gets abandoned inside a week (§1). `Just answer it` on
the prediction card, `End session` on the protégé panel, `⌘↵` to send in Answer
mode regardless of the toggle. Skipping is a first-class path: the reveal omits
the delta entirely rather than commenting on the skip, and `was_correct` stays
`NULL` rather than being scored as a miss.

If you add a phase, it ships with its exit.

### 2. The layered-XML contract (§4.3)

`prompts/reveal.md` emits exactly these tags, and `src/lib/xml-stream.ts` parses
them incrementally so the client can render mid-stream:

```xml
<verdict>correct | partial | wrong</verdict>
<correct-option>id of the right option, or empty</correct-option>
<gist>One sentence.</gist>
<delta>
  <held-up>…</held-up>
  <off>…</off>
</delta>
<core>The mechanism. 3–5 sentences.</core>
<full>Edge cases, examples, caveats. Markdown.</full>
```

- `verdict` and `correct-option` are **not** in the spec's contract and are
  **never rendered inline** — the reveal route strips them from the section
  stream and sends them as one `meta` event. `correct-option` is what lets the
  guess recap mark the right answer, and it only works because `streamReveal`
  puts the full `<options>` list in the request. Drop that block and the model
  has no ids to name.
- `verdict` is It exists
  so the model commits to the correct/wrong branch before writing the delta, and
  it becomes `Prediction.was_correct` (§10.5 calibration data). `partial` counts
  as not-correct; a skipped prediction stores `NULL` regardless of what the model
  says.
- **`full` is the bulk of the tokens and arrives last.** Two consequences the UI
  has to honour: the `Show full answer` button says *still writing* (with a
  spinner, and another inside the panel if it is open) rather than looking like a
  finished thing that is quietly still growing; and `Explain it back` unlocks the
  moment `full` *starts*, not when it ends — roughly 13 seconds earlier in
  practice, which is otherwise dead time.

  That means teaching can begin while the reveal is still streaming, so two
  things guard against the finishing stream undoing it: `repo.finishRevealing()`
  only sets `done` `WHERE state = 'revealing'`, and the client only promotes
  `revealing → revealed`. The reveal route also persists the answer as soon as
  `full` appears (`saveProgress`), because `/api/teach` needs a stored answer to
  work from. `revealStreaming` is a separate flag from `status` for exactly this
  reason — one field cannot say "reveal is streaming" and "we are teaching" at
  once.
- All four visible layers come from **one** call. Do not split them across
  requests — the layers will contradict each other on edge cases (§5).
- The parser tolerates tags split across chunk boundaries and passes bare `<`
  through as text, because `full` is markdown full of angle brackets. There are
  round-trip tests worth keeping if you touch it.

### 3. `prompts/*.md` are edited by hand

They are the actual product; the UI is a wrapper (§5). They are read fresh from
disk on every request, so editing one takes effect without a restart — that
iteration loop is the point.

**Do not refactor them into TypeScript**, do not template them, do not generate
them. Variable content goes in the user message, assembled in `src/lib/phases.ts`.

After changing `reveal.md`, run both fixtures in `prompts/fixtures/delta-tone.md`
and read the output. Tone drift is invisible from the diff.

### 4. State updates target `LiveExchange.key`, never `.id`

A client exchange has two identifiers. `key` is generated on the client, assigned
once, and never reassigned — it is the React key and the only thing `patch()`
matches on. `id` is the server's exchange id, which does not exist yet when the
exchange first renders and arrives on the first SSE event.

They used to be one field that got renamed in place, and that shipped a bug worth
remembering: the rename was written as

```ts
setExchanges((prev) => prev.map((e) => (e.id === id ? { ...e, id: real } : e)));
id = real;   // ← runs before React invokes the updater
```

React invokes state updaters lazily, so the closure read `id` *after* the
reassignment, compared the new id against itself, matched nothing, and silently
left the exchange under its temporary id. Every later `patch()` then targeted an
id that was not in state, so **nothing in the UI ever updated** — plain answers,
prediction cards, reveals, all of it — until a refresh reloaded from SQLite.

Never pass a mutable variable into a state updater closure. `patch(key, …)`
evaluates its argument eagerly, which is why everything routes through it.

### 5. Preferences configure everything except the prediction

`preferences` is a singleton row (§2: one local user). The setup screen gates the
app on first run — `getPreferences()` returning `null` is the onboarding flag —
and is reachable afterwards from the sidebar.

Two settings, and the framing of them is deliberate. They ask **what the user
wants the session to do**, not what kind of learner they are: matching teaching to
a self-reported learning style is a well-replicated null result, and §10.5 already
argues that passive measurement beats upfront self-report. Keep the copy on that
side of the line.

- `reinforcement` — `teach_back` | `quiz` | `transfer_probe`. Fires automatically
  when a reveal completes. The manual `Explain it back` button stays regardless,
  which is also the de-facto "none" option.
- `density` — `prose` | `balanced` | `visual`. Injected as `<format-preference>`
  into the reveal and plain-answer calls; the rules for each value live in
  `prompts/reveal.md` and `prompts/answer.md` so they stay hand-editable (§5). On
  an identical question this moves `full` from 0 markdown table rows at `prose` to
  9 at `visual` — if a prompt edit collapses that gap, the setting has stopped
  meaning anything.

**The prediction is not a setting.** §4.2 says it does most of the work and §9's
success metric depends on it; making it optional turns Learn mode into Answer mode
with extra steps. The setup screen says so explicitly.

`quiz` and `transfer_probe` share one implementation — a transfer probe is a
one-question quiz on a different substrate. While a quiz is live the answer is
hidden, because retrieval is the point and re-reading is what feels like learning
without being it. Two edges that were bugs first: do **not** hide it while the
questions are still generating (the user is left staring at a spinner), and do
**not** keep hiding it once every question is answered (the card says the answer
is back). `Show it anyway` is always there.

## Layout

```
prompts/            answer, triage, predict, reveal, protege, quiz, concepts (+ fixtures/)
src/lib/phases.ts   every model call — the only file that talks to the SDK
src/lib/xml-stream.ts   incremental parser for the layered contract
src/lib/repo.ts     all SQL
src/lib/db.ts       schema (§6)
src/app/api/        route handlers
src/components/     UI
```

## Testing

```bash
npm test     # unit: the incremental XML parser, no API calls
npm run smoke # end-to-end in real Chrome, makes real API calls (~$0.10)
```

`npm run smoke` needs `npm run dev` running in another shell. It exists because
the API can be entirely correct while the UI never updates — see rule 4. Anything
that only a browser can catch belongs in `scripts/smoke.mjs`.

**Assert visibility, not DOM presence.** `count() > 0` passed while the protégé
panel sat 1500px above the viewport, which is indistinguishable from gone. Use
the `inViewport()` helper for anything the user is supposed to be able to see.

## Models

`src/lib/anthropic.ts`. `claude-opus-5` for reveal, protégé, and plain answers;
`claude-haiku-4-5` for triage and concept tagging. Refusal fallbacks are on for
the Opus calls (`fallbacks: "default"`).

The spec says `claude-sonnet-5` for reveal — that was overridden deliberately,
because the delta is the quality-critical surface. Swapping back is a one-line
change.

## Deliberate deviations from the spec

- **`POST /api/ask` is the send path**, not `/api/triage` + `/api/predict`. §7's
  latency mitigation — fire triage and the answer in parallel, discard the answer
  if triage says LEARNABLE — is only reliable if the discard happens on one side
  of the wire. `/api/triage` and `/api/predict` still exist and work; they are
  there for iterating on prompts with curl.
- **Plain answers reuse the `answers` table**: `gist` and `core` are `NULL` and
  the markdown lives in `full`. `gist IS NULL` is how you tell a plain answer from
  a reveal.
- **The protégé exit summary is the teach turn at `idx === 4`** (`TEACH_TURN_CAP`).
  Turns 0–3 are the four in-character questions.
- **Being stuck mid-explanation has a first-class path.** `Stuck — ask the main
  chat` sends the *whole* explain-back transcript to the main line, not just the
  junior's last question: the user's own answers are where the gaps are, and a
  contradiction they talked themselves into is the thing worth addressing. The
  transcript is assembled server-side in `repo.teachContext()` and reaches the
  model via `contextExchangeId` on `POST /api/ask`; the exchange records it in
  `context_exchange_id` so the UI can say so. Protégé mode auto-resumes when the
  answer lands, and `Clear` discards the session entirely.

  **A live session floats to the end of the thread.** Left in place next to its
  own exchange it strands itself above everything you ask mid-session, which reads
  as having vanished. So while a session is open and is not already the last
  exchange, `Chat` renders its panel after the list (`floated`) and passes
  `renderTeach={false}` to the owning `ExchangeView`. Anything you ask lands above
  it — the order it happened in — and everything you can act on is at the bottom
  next to the composer. The panel keeps a link back to its own question; each
  exchange renders with `id="ex-<serverId>"` for that.

  **Auto-scroll follows the streaming exchange, not the absolute bottom.** Chasing
  the bottom yanks the user off a live answer, and once the panel is no longer
  last it also bounces them out of the reply box they are typing in.
- **§4.4's "End session" is a Pause, not a stop.** The requirement is an
  always-visible way to make the questions stop; making that exit *terminal* was
  an extra constraint the spec never asked for, and it punished the most likely
  reason for leaving — you got stuck and want to go look something up in the main
  chat. Pausing stops the questions immediately, hands focus to the composer, and
  leaves a `Resume explaining ▸` button. Only the exit summary at the 4-turn cap
  is terminal.

  A paused session is `state = 'done'` with teach turns and no summary row; that
  is what `fromRecord` reads to set `teach.paused`. Re-entry regenerates the
  unanswered junior question rather than appending a new turn — the transcript is
  built from *answered* turns only, because a trailing junior question would leave
  the request ending on an assistant message, which the API rejects as a prefill.

  Three things this depends on, each of which was a bug first:
  - `runTeachTurn` does **not** set the global `busy` flag. Teaching must leave the
    composer usable, or pausing to go ask something cannot do the one thing it is
    for.
  - The `done` handler preserves `teach.paused`. A turn that finishes streaming
    after you paused must not un-pause you.
  - `/api/teach` and `/api/reveal` pass **no abort signal** to the model. If the
    browser goes away mid-generation the turn still completes and persists —
    re-running a reveal costs more than letting an abandoned one finish. The
    remaining window: pausing and refreshing *before* the turn lands shows
    `Explain it back ▸` again until it does.
- **`prompts/answer.md`** exists for the plain-answer path; §5 does not list it.
- **Breadth is no longer a triage reason to skip the loop.** §4.1's third rule
  routes "so broad that a prediction is meaningless" to a plain answer. In use
  that fired on *"I want to learn about cassandra db"* — a user who had just
  declared learning intent got an overview and the line "Straight lookup", which
  is §3's own description of the toggle looking broken. `triage.md` now returns
  LEARNABLE for topic-shaped questions, and `predict.md` narrows the topic to the
  one concept that most changes how someone thinks about it, naming why it starts
  there. §4.1's *intent* — never force a meaningless prediction — is preserved:
  you predict on the narrow concept, not the topic.

  `reveal.md` has a matching branch. `gist`, `delta`, and `core` stay on the
  narrow concept, because that is what was committed to; `full` is the only place
  that opens back out to the wider topic, and it ends on the next thing worth
  predicting on. If the prediction was skipped, `gist` answers the original broad
  question instead.

  Pure recall ("what's new in Postgres 17?") and do-this requests still route to
  LOOKUP. There is a regression check worth rerunning after any `triage.md` edit:
  `rsync` flag, refactor request, Postgres 17, center a div, and `docker run -p`
  must stay LOOKUP; "learn about cassandra", "explain distributed systems", and
  "teach me kubernetes" must stay LEARNABLE.

## Not yet built

§10.5's calibration view and §6's recurrence detection. The data for both is being
collected now — `Prediction.confidence` + `was_correct` joined against
`ExchangeConcept`. Concept tagging writes on every exchange and nothing reads it.

## Deployment

Vercel, as a demo with **no persistence and no auth** — both chosen knowingly.

- `src/lib/db.ts` points SQLite at `/tmp/learn.db` when `VERCEL` is set. This is
  damage control, not a fix: `/tmp` is per-instance and wiped on cold start, so
  a warm lambda behaves normally and everything vanishes when it recycles. The
  sidebar renders a notice (`EPHEMERAL_STORAGE` in `src/lib/env.ts`) so it does
  not read as a bug. Do not delete that notice without also fixing storage.
- `next.config.ts` has `outputFileTracingIncludes` for `./prompts/**` — nothing
  imports those files, so tracing would drop them and every model call would fail
  at runtime. If you add a prompt directory, add it there too.
- The e2e dependency is `playwright-core`, not `playwright`, so no browser
  download runs during the Vercel build. It drives your locally installed Chrome
  via `channel: "chrome"`.

## The metric trap (§9)

If this works, usage on a given concept goes **down**. Engagement metrics will
make a working version look like a failing one. Do not optimize against them.
