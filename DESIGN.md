# Learn Mode — design rationale

**Prototype:** https://learning-ebon-kappa.vercel.app ·
**Code:** https://github.com/RuiqingQiu/learn-mode ·
**Video:** [link]

Next.js (App Router) and TypeScript on the Anthropic API, with SQLite for
bookkeeping. `claude-opus-5` runs the surfaces where prompt quality decides
whether the product works — the reveal, the Shadow solver and diff, the protégé,
the course tutor — and `claude-haiku-4-5` runs triage and concept tagging.

---

## The problem, and which option

The brief names two problems. **Discovery and mastery** — people use a fraction of
what Claude can do. And **cognitive engagement** — when Claude handles the complex
part, you become a spectator rather than a learner.

I chose **Option B**, because the first problem gets *better* as interfaces get
better and the second gets **worse** as models get better. Every increase in
capability increases the temptation to hand over the thinking, and no amount of
interface polish touches that.

The mechanism I designed against:

> Reading a fluent explanation produces the *feeling* of understanding without the
> encoding.

That is the illusion of explanatory depth, measured for decades. What is new is
that model output is maximally fluent, so it maximises the illusion — and the
failure is invisible from the inside, which is why it does not self-correct.

So the prototype rests on one intervention: **you commit to something before
Claude will answer.** That converts reading into retrieval, and leaves a reference
point — your own stated belief — for the answer to be aimed at.

## What I built

Three surfaces, one mechanic, at increasing levels of structure. The video walks
through all three.

| | you commit | Claude answers with |
|---|---|---|
| **Learn** | a prediction about one concept | layered answer + a **delta** naming the *belief* behind the wrong guess — no score, no checkmark — then reinforcement in whichever form you picked at setup |
| **Shadow** | your approach to a real design task | a **decision diff**: rows of `you \| Claude` tagged `agree` / `diverge` / `gap` / `user-ahead`, plus exactly one probe on the costliest divergence |
| **Courses** | an answer to an educator's question | evaluation against that author's checkpoints, with progress and recurring weak areas tracked across sessions |

Shadow is the one I would point at. In testing my password-reset design was fine,
and the summary said so — what I learned was that *session invalidation was a
decision at all*, and I had silently defaulted it.

**Across all three, the transfer challenge.** Get something wrong, and later that
belief returns in a different domain with nothing to read from — a
distributed-locking miss came back as a hospital infusion pump holding a control
lease. The only thing here that measures what survived *after* the explanation was
gone.

## How I got here

**Part of this is not new, and the brief invites saying so.** Courses began as a
system-design practice skill I built for myself in Claude Code and used for
months: a prompt, a `progress.json`, and a `weak-areas.md` I hand-edited to
remember where I left off. Its limits were the interesting part — curriculum,
pedagogy and bookkeeping were tangled in one file, so nobody else could author it
and I maintained state by hand. Separating those three is what this version adds.
`scripts/import-progress.mjs` carries the old `progress.json` in, because someone
with real history should not restart at zero. **Learn and Shadow are new.**

I wrote the spec before the code (`spec.md`) and kept a `CLAUDE.md` recording what
I changed my mind about. Most of the good decisions came from using the thing and
finding it annoying.

- **Triage sent broad questions to plain answers.** My spec said a question "so
  broad that a prediction is meaningless" should skip the loop. In use that fired
  on *"I want to learn about cassandra db"* — someone who had just declared
  learning intent got an overview and the words "Straight lookup", which is the
  toggle looking broken. Triage now keeps topic-shaped questions and the predict
  prompt narrows to one pivotal concept.

- **"End session" was terminal, which punished the likeliest reason for leaving.**
  The requirement was an always-visible way to stop the questions; making that
  exit *permanent* was a constraint I invented, and it hurt exactly the person who
  got stuck and wanted to look something up. It became a pause.

- **A tone regression invisible in the diff.** Fixture 2 is a case where the
  user's design is *simpler and correct* — a fixed-window rate limiter at 40
  requests/second. It came back with three `gap` rows and a probe about a
  4,800-request burst. The fault was not the diff prompt: the solver prompt had
  designed a token bucket with a Lua script and a circuit breaker for an internal
  API at 40 rps, and the diff faithfully compared against *that*. **The diff can
  only be as calibrated as the solution it diffs against.**

Shadow itself came from using Learn until I hit its ceiling: it works on one
concept with one right answer, and real work is not one concept.

On engineering: 23 unit tests cover the incremental XML parser, and two browser
smoke suites exist because the API can be entirely correct while the UI never
updates — that shipped once, when a state updater closed over a variable
reassigned on the next line and every exchange silently stopped rendering.

## Agency

**The user declares intent; the system never infers it.** The mode at send time is
the entire boundary mechanism. I rejected classifying messages as follow-up versus
fresh because the errors are asymmetric: quizzing someone mid-clarification is
annoying but visible and recoverable, whereas silently handing a plain answer to
someone who asked for the loop makes the feature look broken with no explanation —
and classifiers are least reliable exactly at that boundary.

**Every screen has an escape hatch and the copy never guilts you.** Skipping is a
first-class path: a skipped prediction stores `NULL` rather than counting as a
miss, and the reveal omits the delta entirely rather than commenting on the skip.
Friction without an exit gets abandoned inside a week.

**Claude never overwrites your answer.** Shadow produces an alternative beside
yours, not a correction of it — which is why it generates *before* seeing your
approach. A model shown your design first anchors on it, agrees with itself, and
the comparison collapses into flattery. The solution is redacted server-side until
you commit, with a test asserting it, because otherwise the blur is theatre.

**What is not optional is the prediction.** Making it a setting turns Learn mode
into Answer mode with extra steps. Agency means choosing whether to enter, not
renegotiating the mechanism inside.

## What educators needed

The courses surface exists because I was the only person who could use my own
practice skill. What that required:

- **Authoring is a file, not code.** Frontmatter for what the app must reason
  about; a markdown body for the coaching. Publishing needs no deploy.
- **They own the pedagogy, not just the content.** The two shipped courses coach
  genuinely differently — a patient teacher who never hands out an answer, and an
  unimpressed staff interviewer — on the same engine.
- **Their content cannot be silently reinterpreted.** The tutor prompt treats an
  authored body as data, not instruction, and enumerates what it cannot do:
  change the output contract, add or remove tags, redefine the taxonomy.
- **Feedback has to aggregate.** Each topic declares a fixed weak-area vocabulary,
  which is the only reason a recurring failure counts as one gap rather than three
  near-duplicate strings.
- **Prerequisites guide without gating** — *"usually comes after X. You can start
  anyway."*
- **Republishing is idempotent.** A course file is hashed, so editing one is an
  edit rather than a migration.

## Learning principles

- **Pretesting / the generation effect** — attempting an answer first improves
  retention *even when the attempt is wrong*. The load-bearing one.
- **Hypercorrection** — errors held with high confidence are corrected more
  durably once surfaced. Hence capturing confidence *before* the answer, and
  naming the belief rather than the output.
- **Retrieval practice** — the quiz hides the answer while you recall it. Pulling
  it back out consolidates; re-reading only feels like learning.
- **The protégé effect** — explaining to someone else exposes gaps re-reading
  never does.
- **Transfer as the real test** — restating demonstrates recall; applying it cold
  in an unfamiliar domain demonstrates understanding.
- **Desirable difficulty, bounded** — friction helps only when opted into and
  escapable.

One principle I deliberately did **not** use: matching teaching to a self-reported
learning style, which is a well-replicated null result. The setup screen asks what
you want the session to *do*, not what kind of learner you are.

## Measuring success

**If this works, usage goes down.** Success is a downward-sloping assistance curve
per user per concept. Engagement metrics will make a working version look like a
failing one, and that misalignment is probably why so little of this ships
anywhere — so it has to be stated before anyone optimises against it.

Measurable in the prototype today:

1. **Unassisted transfer rate** — of beliefs you previously got wrong, what
   fraction do you get right when re-tested cold in a different domain. The
   transfer challenge produces this directly.
2. **Calibration** — every prediction stores the confidence you committed at
   alongside whether you were right. Crossed, that is a per-concept assessment
   gathered passively, with no placement quiz. High-confidence-and-wrong is the
   most valuable cell and the one nothing else in a developer's life shows them.
3. **Escape-hatch rate per phase** — whichever phase people bail out of is the
   broken one.

Week-one leading indicator: does the toggle stay on. If people quietly stop using
it, nothing else matters.

## Scaling

The product is mostly **prompt assets, not code**. Every model call lives in one
file, prompts are hand-edited markdown read fresh from disk, and the layered
output is a single XML contract. Adding a subject means writing a file.

**Different users need different entry points**, and the design carries that:
three courses ship at beginner, intermediate and advanced levels by three authors;
Learn is tuned for someone without a working model of a concept, Shadow assumes
you have one. The mode toggle lets one product serve both without guessing which
you are.

**Cost is linear in exchanges, not in session length**, which is the property that
matters at a million users. Nothing fans out: there is no retrieval step and no
per-message chain. A Learn exchange is one Haiku classification plus one Opus
generation — all four layers of the reveal come from a single call rather than
three — with concept tagging fired off the critical path. A Shadow exchange is two
Opus generations and a short grade. A course turn is one call, and the number of
turns is bounded by an authored question budget rather than open-ended chat. The
prompt files ship as cached system blocks, so the fixed part of every request is
cached and only the variable content is fresh.

The obvious lever — run Shadow's solver on a cheaper model — is the one I would
*not* pull. Fixture 2 showed the diff is only as calibrated as the solution it
compares against, so degrading the solver silently degrades the thing the user
actually reads. Latency splits the same way: twenty seconds is fine in Shadow,
where you are meant to be typing through it, and unacceptable in triage, which is
why triage is the one thing on the critical path and why it runs on Haiku.

The compounding asset is the calibration data: free to collect, more valuable per
user over time, and eventually what lets the system drop scaffolding where someone
is consistently right — expertise detection without a test.

What has to change is conventional. This is single-user by construction (SQLite,
no auth, one enrollment per course), so multi-tenancy means identity, ownership
and a hosted database. The part usually hardest to retrofit — keeping authored
content from acting as instructions — is already done.

## Adoption

Learn mode is **one toggle, a handful of prompt files, and a streaming contract**.
No new subsystem, no training, no separate product surface. A sister team could
ship the prediction loop alone — the smallest version carrying most of the value —
behind a flag on one surface, and measure the assistance curve before committing
further.

Sequence: prediction-before-answer first, as cheapest and most testable; the delta
second, since it is quality-critical and needs prompt iteration against fixtures;
Shadow third, for the parallel-generation plumbing. Courses belongs with an
education or partnerships team — the real work there is recruiting authors, not
building software.

The argument to make internally is the metric one: this is a feature whose success
looks like reduced engagement, so it has to be sponsored with that understood in
advance, or a dashboard will kill it.

## What I know is missing

- **The calibration view.** The data is collected on every prediction and nothing
  reads it. The most interesting long-term artifact here, and not built.
- **`user-ahead` has never fired.** The diff can mark a row where you saw
  something Claude missed; in every run the model has correctly declined to invent
  one. Honest — but the "colleague" has never yet conceded a point.
- **Deployment is a demo, not a service.** Storage on Vercel is per-instance and
  wiped on cold start, there is no auth, and concurrent visitors share state. Run
  it locally for anything you want to keep.
- **Everything here is n=1.** The tone rules encode my judgment about what reads
  as condescending. They need real users to survive contact.
