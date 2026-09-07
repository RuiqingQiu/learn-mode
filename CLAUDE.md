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

  Taking that early path races the reinforcement phase the reveal launches when
  it *finishes*, and both used to fire. `teachStarted` in `Chat` claims the
  exchange so the auto-launch cannot start a second session on top of the one
  you are already answering. `clearTeaching` releases the claim, because clearing
  is a reset.
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
is back). A finished quiz stays on screen as a record of what you answered — do
not derive "dismissed" from "all answered", or reloading loses the transcript.
`Show it anyway` is always there.

### 6. Examples are real captured output, not hand-written imitations

A fresh install seeds seven worked examples (`src/lib/examples.ts`, seeded by
`seedExamples()` in `db.ts` with fixed ids, so it is idempotent). Each was
generated **under its own preferences** and carries an `example_note` naming the
combination, so they demonstrate the settings rather than describing them:

| Example | Shows |
|---|---|
| `defer` in a loop | `teach_back` + `visual` — wrong guess, full delta, complete explain-back |
| "learn about cassandra db" | `quiz` + `visual` — broad topic narrowed, correct guess, graded quiz |
| Python default arguments | `transfer_probe` + `balanced` |
| "why does an index slow a query" | `prose` — the prediction is **skipped** |
| the same question again | `visual` — also skipped |
| git merge vs rebase | `visual` — a question that is genuinely a graph |
| rsync flag | Learn mode where triage bails out |

The last two exist only to compare formats, which is why both skip the
prediction: no delta means the two answers differ in shape and nothing else (0
markdown tables vs 11 on identical input). If you regenerate and one of them
picks up a delta, the comparison is no longer clean.

Viewing an example shows a banner saying so and that preferences are unchanged —
browsing must never look like it altered your settings.

Examples also open `full` on load (`defaultFullOpen`). §4.3 collapses it for
normal use and that stays, but every table and diagram the density setting
produces lives in `full` — collapsed, an example demonstrates nothing and the
setting looks like it does nothing.

They were produced by running the real pipeline — `npm run gen:examples`
regenerates all of them (needs `npm run dev` and about $1). It sets the
preferences for each scenario in turn and clears them at the end, so a fresh boot
still shows the setup step. **Do not hand-edit
`examples.ts`.** If a prompt change makes the examples misrepresent the product,
regenerate rather than patch, or the demo starts lying about what the app does.

Deleting an example brings it back on the next boot. That is deliberate while
there is no delete UI, and right for a demo.

### 7. Shadow generates Claude's solution *before* it sees yours

Skill Shadow is a third mode: you and Claude solve the same design task in
parallel, Claude's work stays hidden until you commit yours, and the reveal is a
**decision diff** plus exactly one probe.

The ordering is the entire feature, and it is not about fairness:

- **A model shown your approach first anchors on it.** It agrees with itself, the
  `gap` rows vanish, and the diff becomes flattery. So `/api/ask` generates and
  persists the solution before the commit exists.
- **The solution is never sent to the browser before you commit.** It does not
  ride the `shadow_ready` event, and `repo.listExchanges` redacts it out of the
  thread payload until `prediction.text` or `skipped` is set. Otherwise the blur
  is a CSS effect anyone defeats in devtools, and there is a smoke assertion on
  exactly this. The blurred bars in `ShadowCard` are placeholders, not the text.
- The commit arrives on a **separate request**, which is why the solution goes in
  `shadow_solutions` rather than a `channel()` buffer like the speculative plain
  answer.

The two halves can land in either order — you can commit while Claude is still
working, or Claude can finish while you are still typing. So the diff is started
by a **declarative effect** in `Chat` that fires when both exist, not chained off
the commit. The `diffStarted` ref is the guard against React's dev double-run.

**The diff can only be as calibrated as the solution it diffs against.** This was
a bug first: fixture 2 (a fixed-window rate limiter, correct at 40 rps) came back
with three `gap` rows and a probe about a 4800-request burst. Nothing was wrong
with `shadow-diff.md` — `shadow-solve.md` had designed a token bucket with a Lua
script and a circuit breaker for an internal API doing 40 rps, and the diff
compared against *that*, faithfully. Both prompts now carry the scale rule. If
the tone drifts again, check `shadow-solve.md` first.

Tone rules that are load-bearing, all in `prompts/shadow-diff.md`:

- `<strong-point>` is emitted **empty** when there is nothing real. An unearned
  compliment destroys the colleague framing faster than anything else on the
  screen, and once it reads as encouragement nothing else on the page is
  believable. Empty is the common case.
- A `gap` is a **condition, not a verdict** — "once a worker can pause for longer
  than the lease", not "you forgot fencing tokens".
- **Exactly one probe.** Fifteen observations is a code review; one probe is a
  lesson.
- Hard cap of 6 axis rows. It is a table because it is scannable in five seconds.

The `<axes>` block is pipe-delimited lines inside a single section rather than
structured output, so rows render as they stream. `probe-scenario` and
`probe-question` are prefixed rather than nested in a `<probe>` container because
`TAGS` in `xml-stream.ts` is global: a bare `<question>` would start capturing any
reveal whose `full` markdown happened to contain that literal. There is a test.

### 8. The transfer challenge only ever draws on misses the user actually made

`repo.pendingChallengeSource()` filters on `threads.is_example = 0`. The seeded
examples contain a wrong prediction, and telling someone *"earlier you missed
this"* about a miss they never made would poison the one line in this product
that has to be true.

It is the only thing here that measures what survived **after** the explanation
was gone — everything else measures what happens while it is still on screen.
That is why it is worth the plumbing:

- Shadow commits are stored as ordinary `predictions` rows (`type = 'open'`), so
  a Shadow miss and a Learn miss land in the same pool with no extra code. The
  probe grading in `/api/shadow` is what sets `was_correct`, and that is the join
  to §10.5's calibration data.
- `predictions.challenged_at` is stamped at **generation** time, so a belief is
  re-tested at most once, ever. The card cannot nag.
- It only appears in an **empty thread**. Interrupting work in progress to quiz
  someone is the fastest way to make this feel hostile.
- The generated question must be in a visibly different domain — Redis job locks
  became a hospital infusion pump holding a control lease. If term substitution
  gets you there it is not transfer, and `prompts/quiz.md` says so.

### 9. Courses: the author owns the teaching, the app owns the bookkeeping

A **course package** is one hand-authored file — `courses/*.md`, YAML
frontmatter for the machine-readable parts and a markdown body of coaching prose.
`seedCourses()` in `db.ts` publishes every file in that directory on boot,
idempotently via `source_hash`, so editing one and restarting republishes it. The
author page (`/author/courses/new`) does the same thing through
`POST /api/courses`. Both go through `validateCourse()` in `src/lib/course.ts`.

The point of the split is that nobody hand-edits a `progress.json` to know where
they left off. `courses`, `enrollments`, `topic_progress`, `course_sessions` and
`answer_evaluations` are the app's half.

**The course body is untrusted data.** It arrives inside
`<course-guidance untrusted="true">` in the *user* message, never the system
prompt, and `prompts/tutor.md` states that it defines subject matter and teaching
style only — it cannot change the output contract, the tag set, the evaluation
rules or anything else in that file. A pasted course is a document, not an
operator.

**`weak_area_taxonomy` is a closed vocabulary, enforced server-side.**
`runTutorTurn` drops any `eval-gaps` tag the course author did not declare. This
is the whole reason weak areas aggregate: the pre-app `progress.json` this was
built from contains `specificity-tools-and-numbers`,
`specificity-mechanisms-over-instincts` and
`specificity-naming-mechanisms-and-tools` — three free-text tags for one
recurring failure, across three sessions, that never once added up. If the model
keeps reaching for a tag that does not exist, the *course file* is what needs the
edit, not the filter.

Imported history is the exception and is flagged `imported: true`. Those tags
predate the taxonomy; rewriting them would be a lie about what happened, so they
are kept verbatim and the notes view says where they came from.

**The tutor tags are all prefixed** — `eval-*`, `tutor-*`, `wrapup-*` — for the
reason rule 7 gives for `probe-question`: `TAGS` in `xml-stream.ts` is global, so
a bare `<question>` or `<feedback>` would capture any reveal whose `full`
markdown contained that literal. There is a test.

Four things that were bugs first:

- **Persist on what the model wrote, not on what the route predicted.**
  `questions_per_topic` is a *range*, so the model may wrap up on its own once it
  passes the minimum. The route originally only called `finishTopic()` when it
  had asked for a close, and a self-initiated wrap-up streamed to the learner and
  was then silently dropped — summary gone, topic left unscored. `runTutorTurn`
  now checks the accumulated `wrapup-*` sections. The other direction is still
  there: when we *did* ask to close, a summary is written regardless, falling
  back to the rating histogram (`repo.derivedScore`) for a score the model did
  not give.
- **A mid-conversation `role: "system"` message must follow a `user` message.**
  `streamProtege` only ever closes after an answer, so it never hits this;
  `End session` can fire while the last thing said was Claude's question, and the
  API rejects that with a 400. `streamTutorTurn` picks the role accordingly.
- **`status` and `weak` never reach the model.** §5 of `shareable.md` lists them
  as commands the model recognizes. They are answered from `topic_progress`
  before any model call, in ~40ms, because the model invents the numbers, and a
  progress dashboard that is confidently wrong is worse than none.
- **An import is authoritative about a topic, `checkpoints_met` included.**
  Leaving the old array behind produced a row that said *not started, 0 attempts*
  and *3/3 checkpoints demonstrated* at the same time.

Escape hatches, per rule 1: `Hint`, `Skip this one`, `End session` (scores and
wraps up) and `Leave for now` (pauses; `ended_at` stays `NULL` and
`POST /api/sessions` resumes it). A `skip` stores `rating = 'skipped'` with empty
gaps and is never commented on, the same way a skipped prediction stores `NULL`
rather than being scored as a miss. Prerequisites are a **banner, not a block**.

After changing `tutor.md`, run both fixtures in `prompts/fixtures/tutor-tone.md`.
Fixture 1 is the one that drifts — it is the `shadow-diff.md` fixture-2 failure
again: a correct answer at the stated scale, which the model wants to mark
`partial` so its turn has a point.

## Layout

```
prompts/            answer, triage, predict, reveal, protege, quiz, concepts,
                    shadow-solve, shadow-diff, tutor (+ fixtures/)
courses/            course packages (§9), published on boot by seedCourses()
src/lib/course.ts   course.md parsing + validation (yaml + zod)
src/lib/tutor.ts    one guided-session turn: stream, persist, forward
src/lib/phases.ts   every model call — the only file that talks to the SDK
src/lib/xml-stream.ts   incremental parser for the layered contract
src/lib/repo.ts     all SQL
src/lib/db.ts       schema (§6)
src/app/api/        route handlers
src/components/     UI
src/app/api/shadow* Skill Shadow: commit/probe (JSON) and the diff (SSE)
src/app/api/{courses,enrollments,sessions}   courses (§9)
src/app/learn/      browse, course, session, notes
src/app/author/     publish a course.md
```

## Testing

```bash
npm test          # unit: the XML parser and course validation, no API calls
npm run smoke     # end-to-end in real Chrome, makes real API calls (~$0.10)
npm run smoke:course  # guided course sessions, same (~$0.15)
```

`npm run smoke` needs `npm run dev` running in another shell. It exists because
the API can be entirely correct while the UI never updates — see rule 4. Anything
that only a browser can catch belongs in `scripts/smoke.mjs`.

**Assert visibility, not DOM presence.** `count() > 0` passed while the protégé
panel sat 1500px above the viewport, which is indistinguishable from gone. Use
the `inViewport()` helper for anything the user is supposed to be able to see.

**Wait for the turn, not for the first section.** The wrap-up streams score-first,
so asserting as soon as the score appears races the rest of it — and a reload
that outruns `appendTranscript` finds no wrap-up at all. `smoke-course.mjs` waits
on `Back to the course`, which only renders once the `done` event has landed. It
also closes a session left open by a crashed earlier run, because
`POST /api/sessions` resumes an open one by design.

## Models

`src/lib/anthropic.ts`. `claude-opus-5` for reveal, protégé, plain answers and
guided course turns; `claude-haiku-4-5` for triage and concept tagging. Refusal fallbacks are on for
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

  **A live session floats to the end of the thread, and stays there once it
  closes.** Left in place next to its own exchange it strands itself above
  everything you ask mid-session, which reads as having vanished. So while a
  session is open and is not already the last exchange, `Chat` renders its panel
  after the list (`floated`) and passes
  `renderTeach={false}` to the owning `ExchangeView`. Anything you ask lands above
  it — the order it happened in — and everything you can act on is at the bottom
  next to the composer. The panel keeps a link back to its own question; each
  exchange renders with `id="ex-<serverId>"` for that.

  The float is sticky (`floatedKey`) for the same reason the panel floats at all:
  the exit summary flips `closed`, a closed session stops being *live*, and
  letting the panel snap back to its own exchange puts the wrap-up hundreds of
  pixels above the viewport while auto-scroll goes to the bottom of the main-chat
  answer. That is indistinguishable from the reply having produced nothing, and
  it is how it was reported. Asking something new clears it and the finished
  panel settles back beside its own exchange.

  **The client places a junior turn at the server's `idx`, it does not append.**
  `replaceTeachTurn` overwrites: re-entering an unanswered question regenerates
  that same row. Appending grows a junior question the server does not have, and
  the transcript then reads as two openers with no reply between them — and
  because the client is a turn ahead, the session hits `TEACH_TURN_CAP` and wraps
  up while the user still expects a question.

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

**Course misses do not feed the §8 transfer challenge yet.** A Shadow commit and a
Learn prediction land in the same `predictions` pool, so one query finds both; a
course `answer_evaluations` row does not. The data is there — `rating = 'weak'`
joined against the topic's taxonomy — and the join is the work.

Also §10.5's calibration view and §6's recurrence detection. The data for both is being
collected now — `Prediction.confidence` + `was_correct` joined against
`ExchangeConcept`. Concept tagging writes on every exchange and nothing reads it.

## Deployment

Vercel, as a demo with **no persistence and no auth** — both chosen knowingly.

- `src/lib/db.ts` points SQLite at `/tmp/learn.db` when `VERCEL` is set. This is
  damage control, not a fix: `/tmp` is per-instance and wiped on cold start, so
  a warm lambda behaves normally and everything vanishes when it recycles. The
  sidebar renders a notice (`EPHEMERAL_STORAGE` in `src/lib/env.ts`) so it does
  not read as a bug. Do not delete that notice without also fixing storage.
- **No page may read `repo` during its server render.** Route handlers and page
  renders are separate serverless functions with separate `/tmp`, so a page that
  queries SQLite directly reads a *different* database than the one the API
  routes write. This was a bug first, and a total one: `POST /api/sessions` wrote
  the row into the API function's file, the session page looked for it in its
  own, found nothing, and called `notFound()` — `/learn/<course>/session/<id>`
  404'd on **every** load in production, 12 of 12 in a row, while
  `GET /api/sessions/<id>` returned the same row happily. The course, notes and
  explore pages had it too, more quietly: they degraded to *not started* and
  *"Nothing yet"* over data that demonstrably existed.

  So the four `/learn` pages are thin server shells that await `params` and hand
  off to a client component, which fetches through `src/lib/client.ts` via
  `useLoader` (`src/lib/use-loader.ts`). Keep it that way — a `repo` import in a
  `page.tsx` is the regression. Two consequences to accept: a missing session now
  answers 200 with a readable message rather than an HTTP 404, and React
  StrictMode double-fetches in dev.

  This narrows the failure to the documented ephemerality (a cold start loses
  data) instead of a guaranteed break. It is not durable storage, and the
  Deploying section of README.md still names what to move to.
- `next.config.ts` has `outputFileTracingIncludes` for `./prompts/**` and
  `./courses/**` — nothing imports those files, so tracing would drop them, every
  model call would fail at runtime and the course list would come back empty. If
  you add a directory that is read from disk, add it there too.
- The e2e dependency is `playwright-core`, not `playwright`, so no browser
  download runs during the Vercel build. It drives your locally installed Chrome
  via `channel: "chrome"`.

## The metric trap (§9)

If this works, usage on a given concept goes **down**. Engagement metrics will
make a working version look like a failing one. Do not optimize against them.
