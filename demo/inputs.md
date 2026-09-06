# Paste buffer

Keep this open in a second window while recording. Blocks are in the order you
need them.

---

## Beat 2 — Shadow

**Task** (paste into the composer with **Shadow** selected):

```
Design a password reset flow for a web app
```

**Your approach** (paste into the `YOU` box while Claude is still solving).
Deliberately a competent first draft, not a strawman — the demo only works if
your design is defensible:

```
When the user asks to reset, generate a random token, store it in a
password_resets table with their user id, and email them a link with the token.
When they click it, look up the token, let them set a new password, then delete
the row.
```

Confidence: **medium**.

**The probe answer** — click `Let me reason`, paste this. It is the natural wrong
belief, and it needs to be wrong to fuel the next beat:

```
It gets rejected — the password changed, so the old session isn't valid anymore.
```

Expect the feedback to name the belief rather than the error.

---

## Beat 2.5 — the transfer challenge

**The question is generated fresh, in a domain you have not seen**, so there is no
exact answer to paste. In testing the same fencing-token miss came back as a
hospital infusion pump holding a control lease, and as a cleaning robot claiming a
corridor.

Whatever the domain, the answer is the same shape — say this in your own words:

> The thing doing the write has to check ownership itself. Holding a valid-looking
> lease at the time you *started* proves nothing by the time you *commit*, so the
> write path has to reject anything carrying an older token than the newest one it
> has seen.

Read the scenario on screen first and use its nouns. If it is the infusion pump,
say *the pump* rejects the stale command — not *the server*.

---

## Beat 3 — Courses

Top bar → **Courses** → `Python — Names, Objects, Surprises` →
`Names and Objects` → `Start`.

**The snippet is generated fresh**, so read it off the screen. In testing the
first question was:

```python
a = [1, 2, 3]
b = a
b = [4, 5, 6]

print(a)
print(b)
```

Answer in this shape — the **why** is what is being assessed, not the output:

> `[1, 2, 3]` then `[4, 5, 6]`. `b = a` pointed `b` at the same list, but
> `b = [4, 5, 6]` rebinds the name `b` to a brand-new list rather than changing
> the one it was pointing at. `a` still points at the original, which nothing
> touched. If the second line had been `b.append(4)` instead, both would print
> the same list.

That last sentence is what earns the checkpoint: it distinguishes **rebinding a
name** from **mutating an object**, which is the whole topic.

### If you want the harder course instead

`Reading Query Plans` → `Reading an Execution Plan` produces a real EXPLAIN plan
(in testing: `rows=112` estimated against `rows=91204` actual). Answer by naming
**estimate versus actual** as the first thing you looked at, and saying **the fix
is the estimate, not the join**. Harder to read on a screen share — better
mentioned than demoed.

**Then click `Hint`** on the following question to show the escape hatch — the
hint attaches under the question rather than re-asking it.

---

## If a beat goes wrong on camera

**The diff finds nothing interesting.** Rare, but if the summary reads as pure
agreement, say so out loud and use it: a simpler design being correct at your
scale is the behaviour, not a failure. Fixture 2 in
`prompts/fixtures/shadow-diff.md` exists for exactly this case.

**No challenge card appears.** You either typed in the thread before it loaded, or
the probe was graded correct. Check:

```bash
sqlite3 data/learn.db \
  "select was_correct, challenged_at from predictions order by rowid desc limit 1"
```

`was_correct = 0` and `challenged_at` null means it is coming — click **+** again.

**The course session stalls.** The first question is one Opus call and no abort
signal is passed, so it will land. Do not refresh; wait.
