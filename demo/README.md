# Demo run book

Everything needed to record the walkthrough.

| file | what it is |
|---|---|
| `README.md` | this — the run book: what to click, timings, what can go wrong |
| [`script.md`](script.md) | the words. Read it aloud; motivation → three features → close |
| [`inputs.md`](inputs.md) | paste buffer. Keep it open in a second window so you are not scrolling through prose while recording |

## The arc

Three beats, each one giving up a little more of your own agenda:

| | Surface | Whose agenda | What it teaches |
|---|---|---|---|
| 1 | **Ask** · Learn | yours — one question | what is *true* |
| 2 | **Ask** · Shadow | yours — one task | what *decisions* you were making without noticing |
| 3 | **Courses** | an educator's | a curriculum someone else thought was worth learning |

The transfer challenge sits across all three. It is the only thing in the product
that measures what survived after the explanation was gone, so it is the line
worth landing.

## Reset before recording

```bash
pkill -f "next dev"; rm -f data/learn.db*; npm run dev
```

A fresh database seeds seven worked examples and all three courses. Wait ~15s.

**Rehearse the narration against your existing threads, then reset and record in
one take.** You cannot dry-run the transfer challenge: `predictions.challenged_at`
is stamped at generation, so a belief is only ever re-tested once. Rehearsing it
burns it.

## Budget

~7:40 against the 8:00 cap. Three live generation waits:

| | ~ |
|---|---|
| Shadow: Claude solving | 20s |
| Shadow: the decision diff | 20s |
| Transfer challenge | 15s |
| Course: first question | 25s |

Speed these up in the edit rather than cutting them — the Shadow wait especially
is the thesis on screen, since you are meant to be typing through it.

---

## Beat 1 — Learn · one concept · 0:30–1:40

**No waiting.** Open the seeded `defer` example from the sidebar; it is real
captured output, already complete.

1. Sidebar → *"Does a defer inside a for loop…"*
2. Expand `You guessed:` — a wrong pick, recorded without a grade.
3. Land on the **delta**. The line to say: it names the *belief* that produced the
   wrong answer — *"braces create a defer boundary"* — not the error. No score, no
   ✓/✗.
4. Scroll to the protégé transcript. One sentence: teaching forces gaps open in a
   way re-reading never does.

Close the beat with the limit: *that works on one concept with one right answer.
Real work isn't one concept.*

## Beat 2 — Shadow · one task · 1:40–4:30

Composer → **Shadow**. Paste the task from `inputs.md`.

While Claude solves (~20s), paste your approach and talk over it:

- It generates **before** it sees your design — not fairness, anti-anchoring. A
  model shown your approach first agrees with itself.
- Not hidden in CSS. Open devtools; the solution is redacted server-side until you
  commit. There is a smoke assertion on exactly this.

Commit at **medium** confidence. When the diff streams in:

- **You are comparing mental models, not prose.**
- Your flow was fine — the summary says so.
- The `gap` rows are the point: you did not get session invalidation *wrong*, you
  never knew it was a decision.
- Exactly **one** probe. Fifteen nitpicks is a code review and teaches nothing.

Read the phished-session scenario aloud. Click `Let me reason`, paste the wrong
answer from `inputs.md`, and say *that is what I actually believed*.

## Beat 2.5 — the transfer challenge · 4:30–5:20

Click **+** for a new thread. Wait ~15s. **Do not touch the composer** — the card
only renders in an empty thread.

> Everything so far measures what happens while the answer is on screen. This
> measures what survived after it was gone.

Different domain, no hints, nothing to read off. Answer it correctly →
**"Transfer demonstrated — you applied it in a new domain, unassisted."**

Worth saying: it only ever draws on misses you actually made. The seeded examples
contain wrong predictions and are filtered out, because claiming you missed
something you never attempted poisons the one line that has to be true.

## Beat 3 — Courses · someone else's curriculum · 5:20–7:10

Top bar → **Courses**.

1. **The index page — leave it up for a beat.** Three courses, three subjects,
   three levels, three authors. It makes the "written by other people" point
   visually before you say a word:

   | Course | Subject | Level | Author |
   |---|---|---|---|
   | Python — Names, Objects, Surprises | python | beginner | nadia |
   | Reading Query Plans | databases | intermediate | marta |
   | System Design (Staff+) | software-engineering | advanced | raymond |

2. **Open `Python — Names, Objects, Surprises`.** Five topics, prereq chains
   (*"usually comes after Names and Objects — you can start anyway"*), per-topic
   checkpoints. Progress is per topic, not a completion bar.
3. **Start `Names and Objects`.** ~25s. You get a five-line snippet and *"what
   does this print, and why"* — the audience can play along.
4. **Answer it** (`inputs.md`). Watch the **checkpoint rail tick live** while the
   feedback is still writing — the moment worth catching on camera.
5. **Click `Hint`** on the next question. Same escape hatch as everywhere else,
   and the hint attaches under the question rather than re-asking it.

**Use the Python course for the video.** A snippet reads in five seconds on a
screen share; an EXPLAIN plan does not. `Reading Query Plans` is the better one to
*mention* — same format, harder subject, different pedagogy — if someone asks
whether this only works for toy content.

The thing to say here is the format, not the UI:

> A course is one hand-authored file. YAML frontmatter for what the app needs to
> reason about — topics, prereqs, checkpoints, and a fixed weak-area vocabulary —
> and a markdown body that is pure coaching prose. **The educator owns the
> curriculum and the pedagogy; the app owns the bookkeeping.** Nothing in the body
> is configuration, and the body reaches the model as data rather than as
> instructions — `prompts/tutor.md` says so in as many words.

The pedagogy differs per course, and that is the author's call rather than a
setting: `system-design-staff` coaches an unimpressed staff interviewer,
`python-foundations` coaches a patient teacher who never hands out the answer.
Same engine, same bookkeeping.

That is also the scaling answer: adding a subject is writing a file, not shipping
code.

## Close · 7:10–7:40

> Claude stops being the answer machine and becomes the colleague who solved it at
> the next desk — and then the curriculum someone else thought was worth teaching.
>
> If this works, usage goes down. You ask about session invalidation less over
> time, and engagement metrics will make a working version look like a failing one.
> The metric I would use is the one you watched at 4:30.
>
> Optimise for capability retained after Claude leaves, not task quality while
> Claude is present.

---

## Risks

**Don't reset between beat 2 and 2.5.** The challenge reads a real miss out of
SQLite.

**The challenge needs an empty thread.** Type anything and it disappears.

**Don't promise `user-ahead`.** That diff row has never fired in testing — the
prompt correctly refuses to invent a compliment. If it shows up, take the bonus.

**If the diff comes back with more than 6 rows**, don't draw attention to the
count. It drifted to 7 once.

**Cut first if over:** the protégé transcript (beat 1, step 4) and the hint
demonstration (beat 3, step 5). Never cut the Shadow parallel-work wait or the
transfer moment.
