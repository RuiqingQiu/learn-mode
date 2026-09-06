# Spoken script — 7:25

Read this aloud. `demo/README.md` is the run book (what to click, what can go
wrong); `demo/inputs.md` is the paste buffer. This file is only the words.

Structure: **motivation → three features → close.** The motivation section answers
the brief's *"which option did you choose and why"* on camera, so the written doc
doesn't have to carry it alone.

~940 spoken words, ~6:20 of speech plus ~65s of generation waits. Stage directions in brackets are not spoken. Anything in
**bold** is worth landing cleanly — slow down for it.

---

## 0:00 — Motivation

> [Screen: the app on **Ask**, empty thread. Don't click anything yet.]
>
> The brief names two problems. **Discovery and mastery** — people use a fraction
> of what Claude can do. And **cognitive engagement** — when Claude handles the
> complex part, you become a spectator instead of someone who's learning.
>
> I picked the second one. Option B.
>
> Here's why. The first gets *better* as interfaces get better — discoverability
> yields to good design. The second gets **worse** as models get better. Every
> increase in capability increases the temptation to hand over the thinking, and
> no amount of interface polish touches that.
>
> And there's a specific mechanism underneath it. **Reading a fluent explanation
> produces the feeling of understanding without the encoding.** Model output is
> maximally fluent, so it maximises that illusion. You close the tab believing you
> learned something, and you ask the same question three weeks later.
>
> So everything in this prototype works one way: **you commit to something before
> Claude will answer.** Three versions of that, for three different kinds of work.

## 0:55 — Feature 1: Learn — a single concept, reinforced your way

> [CLICK sidebar → the seeded `defer` example. Already complete, no waiting.]
>
> The smallest version. I asked whether a `defer` inside a for loop runs at the
> end of each iteration or the end of the function. Instead of answering, it made
> me pick.
>
> [EXPAND `You guessed:`]
>
> I picked wrong. And this is the part that matters.
>
> [POINT at the delta. Pause.]
>
> No score. No percentage, no checkmark, no red. **It names the belief that
> produced the wrong answer** — that braces create a defer boundary — and then
> shows where that belief would bite in real code. That's the difference between
> being marked and being taught.
>
> Then it reinforces it — and **how it reinforces it is my choice, not the app's.**
> I picked "explain it back", so I got a junior engineer asking questions until my
> explanation held up.
>
> [SCROLL to the protégé transcript.]
>
> The alternatives are a quiz from memory with the answer hidden, or one transfer
> question. That's a setting, not something we infer about you.
>
> That loop works. But it works on one concept with one right answer, and using it
> for a week is how I found the limit. **Real work isn't one concept.**

## 2:10 — Feature 2: Shadow — a real task, compared against Claude's

> [CLICK **+**. Composer → **Shadow**. Paste the task. Send.]
>
> So: Shadow. Same principle, applied to a task with a dozen coupled decisions
> instead of one fact. I've asked it to design a password reset flow.
>
> [The `working on it separately…` spinner appears. Start pasting your approach.]
>
> Claude is solving this right now, in parallel with me, and I can't see it. Two
> things about that. It generates **before** it sees my design — and that's not
> politeness, it's anti-anchoring. A model shown your approach first anchors on
> your framing, agrees with itself, and the comparison collapses into flattery.
>
> And it isn't just blurred in CSS — open devtools and the solution isn't in the
> page at all. It's redacted server-side until I commit, with a test asserting
> that, because otherwise the blur is theatre.
>
> [Confidence: medium. CLICK `Commit approach`. WAIT for the diff to stream in.]
>
> And instead of prose, I get this. **You're comparing mental models, not
> paragraphs.**
>
> My flow was fine — it says so at the top. But look at the rows marked `gap`.
> Session invalidation. Expiry. Rate limiting. **I didn't get those wrong. I never
> knew they were decisions.** That's what a chat answer doesn't give you.
>
> [SCROLL to the probe.]
>
> Then exactly one probe. Not fifteen nitpicks — a code review teaches nothing,
> because there's nothing left to hold in your head afterwards.
>
> [READ the phished-session scenario. CLICK `Let me reason`. Paste. Submit.]
>
> That's genuinely what I believed. It's wrong.
>
> [WAIT ~5s.]
>
> And again — it names the belief, not the mistake.

## 4:35 — What actually survived

> [CLICK **+**. Do not touch the composer. WAIT ~15s.]
>
> Everything so far measures what happens while the answer is on screen. This
> measures what survived after it was gone.
>
> [The card appears.]
>
> A few minutes ago I got that wrong. Here it is again — different domain, no
> hints, nothing on screen to read off.
>
> [READ it. Answer in your own words. Submit.]
>
> **"Transfer demonstrated — you applied it in a new domain, unassisted."**
>
> That's the only claim here I'd stand behind as evidence of learning. And it only
> ever draws on misses I actually made — the worked examples that ship with the app
> contain wrong predictions and are deliberately excluded, because telling you that
> you missed something you never attempted poisons the one line that has to be true.

## 5:20 — Feature 3: Courses — somebody else's curriculum

> [Top bar → **Courses**. Leave the index up for a beat.]
>
> Both of those were my agenda — my question, my task. This is somebody else's.
>
> Three courses, three subjects, three levels, three authors. **None of these were
> written by me.**
>
> [CLICK `Python — Names, Objects, Surprises` → `Names and Objects` → `Start`.]
>
> Five topics with prerequisites, and each topic has its own checkpoints.
>
> [The snippet appears. Read it aloud — give the viewer three seconds.]
>
> Same mechanic, third form: commit before you get an answer.
>
> [Submit. POINT at the checkpoint rail as it ticks.]
>
> And this is the feedback loop — **checkpoints tick live while the response is
> still being written**, and every recurring mistake gets tagged against a fixed
> vocabulary the author defined, so it accumulates across sessions instead of
> becoming five different phrasings of one gap.
>
> The thing worth saying here is the format, not the interface. **A course is one
> hand-authored file.** Frontmatter for what the app needs to reason about —
> topics, prerequisites, checkpoints, that vocabulary. Then a markdown body that's
> pure coaching prose, which reaches the model as *data*, never as instructions.
>
> **The educator owns the curriculum and the pedagogy. The app owns the
> bookkeeping.** This Python course coaches a patient teacher who never hands out
> the answer. The staff-level system design course coaches an unimpressed
> interviewer. Same engine underneath. That's also the scaling answer — adding a
> subject is writing a file, not shipping code.

## 7:00 — Close

> Three features, one idea, at three levels of structure: a concept you asked
> about, a task you're doing, and a curriculum somebody else wrote.
>
> On measuring it — the uncomfortable part. **If this works, usage goes down.**
> Engagement metrics will make a working version look like a failing one, which is
> probably why so little of this ships anywhere. The metric I'd use is the one you
> watched at four thirty-five.
>
> **Optimise for capability retained after Claude leaves — not task quality while
> Claude is present.**

---

## Cut list, in order

1. The reinforcement-options aside at 1:50 — keep the choice, drop the list of the
   other two.
2. The protégé transcript at 1:45.
3. The devtools aside at 3:10 — keep it if the reviewers are technical.
4. "prerequisites" at 6:00 — the checkpoints are the point, the prereqs aren't.

**Never cut:** the "why Option B" argument at 0:20, the Shadow parallel-work wait,
the `gap` rows, or the transfer moment at 4:35.
