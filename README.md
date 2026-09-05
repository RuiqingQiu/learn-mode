# Learn Mode

Chat with an explicit **Learn** toggle. Answer mode is a normal assistant. Learn
mode makes you commit a guess first, then answers in layers with a delta against
what you predicted, and optionally makes you explain it back to a confused junior.

Built from `spec.md`.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or run `ant auth login`
npm run dev
```

Open http://localhost:3000. SQLite is created at `./data/learn.db` on first use.

## Setup

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

**Examples** — a fresh install seeds six worked examples in the sidebar, each
labelled with the preference combination that produced it, so you can see what
the settings actually do before choosing:

- *Explain it back · mostly tables & diagrams* — a wrong guess, the delta, and a
  full four-turn explain-back with the exit summary
- *Quiz me afterwards · mostly tables & diagrams* — a broad topic narrowed to one
  concept, a correct guess, then a graded quiz
- *One transfer question · balanced*
- *Same question · mostly prose* and *· mostly tables & diagrams* — the identical
  question at both extremes, side by side
- *Triage bailed out* — Learn mode on a pure lookup

They're real captured output, not mock-ups. `npm run gen:examples` regenerates
them.

## The loop

```
send with Learn on
   └─ TRIAGE (haiku, in parallel with a speculative plain answer)
        ├─ lookup    → the plain answer, already streaming
        └─ learnable → PREDICTING → REVEALING → (Explain it back) → TEACHING
```

- **Toggle** — `⌘L`. Auto-resets to Answer after each reveal, visibly, so
  follow-ups are cheap. Never persisted across reloads.
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
npm test        # unit tests, no API calls
npm run smoke   # drives real Chrome against a running dev server (~$0.10 in API calls)
```

## Iterating

`prompts/*.md` are hand-edited and re-read on every request — change one and hit
send, no restart. After touching `reveal.md`, check the output against
`prompts/fixtures/delta-tone.md`.

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
