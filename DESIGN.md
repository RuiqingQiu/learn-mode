# Learn Mode — design rationale

**Prototype:** https://learning-ebon-kappa.vercel.app ·
**Code:** https://github.com/RuiqingQiu/learn-mode ·
**Video:** [link]

Next.js (App Router) and TypeScript on the Anthropic API, with SQLite for
bookkeeping. `claude-opus-5` runs the surfaces where prompt quality decides
whether the product works — the reveal, the Shadow solver and diff, the protégé,
the course tutor — and `claude-haiku-4-5` runs triage and concept tagging.

---

## Motivation

I chose **Option B**, cognitive engagement.

Learning has never been easier to *start*. Any question, at any depth, in any
framing, answered in seconds — information seeking with AI is close to solved.
What has not got easier is everything after that: retaining what you read, being
able to use it a week later, noticing when you did not actually understand it.
Reading a fluent explanation produces the *feeling* of understanding, and that
feeling is the problem. It is the illusion of explanatory depth, measured for
decades; model output is maximally fluent, so it maximises the illusion, and the
failure is invisible from the inside, which is why it does not self-correct.

That is also why I think this is the harder of the brief's two problems.
Discovery gets *better* as interfaces improve. Engagement gets *worse* as models
improve: every increase in capability increases the temptation to hand over the
thinking, and no amount of interface polish touches that.

There are already features aimed at this. Claude's Learning style and ChatGPT's
study mode hold back the answer and ask guiding questions; flashcard and
spaced-repetition tools sit at the other end and drill what you already read.
They share an assumption worth questioning: that one feedback method suits
everyone, and that method is almost always *a quiz afterwards*. Quizzing is the
common case because it is easy to build and easy to score. Methods with as much
or more evidence behind them — committing a guess before you read, explaining
the idea to someone else, applying it cold in a different domain — are rare in
products, partly because they are harder to build and partly because they are
harder to make feel good.

So this project is an illustration: what does an assistant look like when *how
you are made to engage* is a first-class design choice, with several methods
side by side rather than one baked in? One mechanic holds it together — **you
commit to something before Claude answers** — which converts reading into
retrieval and leaves a reference point, your own stated belief, for the answer
to be aimed at. Around that, the prototype puts the less common methods next to
the common one: a quiz after, but also teaching it back to a confused junior,
and being re-tested on an old miss in an unfamiliar domain, so the difference
between them can be felt rather than argued.

## What I built

Three surfaces, one mechanic, at increasing levels of structure. The video walks
through all three.

| | you commit | Claude answers with |
|---|---|---|
| **Learn** | a prediction about one concept | layered answer + a **delta** naming the *belief* behind the wrong guess — no score, no checkmark — then reinforcement in whichever form you picked at setup |
| **Shadow** | your approach to a real design task | a **decision diff**: rows of `you \| Claude` tagged `agree` / `diverge` / `gap` / `user-ahead`, plus exactly one probe on the costliest divergence |
| **Courses** | an answer to an educator's question | evaluation against that author's checkpoints, with progress and recurring weak areas tracked across sessions |

Shadow is the one I would point at: in testing my password-reset design was fine
and the summary said so, and what I learned was that *session invalidation was a
decision at all*.

**Across all three, the transfer challenge.** Get something wrong and that belief
returns later in a different domain with nothing to read from — a
distributed-locking miss came back as an infusion pump holding a control lease.
The only thing here that measures what survived *after* the explanation was gone.

## How I got here

**I used Claude as a research partner before using it as a code generator.** I
worked through what specifically breaks about learning when a fluent answer is
always available, then which interventions have evidence behind them. I was the
first user, so the filter was blunt: would *I* use this daily.

**Learn came from how I learn.** I retain something far better when I have to
explain it to somebody afterwards than when I only read it. So the first thing I
built was the loop I already run informally — commit a guess, get the answer, then
have to defend it to a confused junior.

**Preferences came from noticing I am not everyone.** People I know would rather
be quizzed later, to find out whether it stuck. So reinforcement became a choice
at setup rather than my own habit imposed on everybody.

**One thing I built and threw away.** A harness that would infer your skill level
over time and taper the scaffolding — more hand-holding early, less as you
improved. I dropped it: I could not demonstrate the moment someone crosses from
needing help to not needing it, and without that it is a claim rather than a
behaviour. It also never answered the harder question of what slowing an expert
down is actually *for*. The signal it needed is still being collected — confidence
against correctness, per concept — and I would rather ship the data with an honest
gap than a threshold I cannot defend.

**Shadow came from Learn's ceiling, and one hard requirement.** Learn works on a
single concept with one right answer, and real work is not one concept. For design
problems I did not want Claude *reacting* to my answer — I wanted an independent
one of its own, put beside mine, with the gap between them named. That requirement
is why the solver runs before it can see your approach.

**Courses came from my own Claude Code setup.** I had been practising system
design against a prompt, a `progress.json` and a `weak-areas.md` I hand-edited to
remember where I left off. The loop was genuinely powerful: get a question, type
the answer out, have it validated, and end up with an artifact — scored strengths
and weaknesses, where later questions tie back to the weaknesses you keep
repeating. Its limit was that it was single-player: curriculum, pedagogy and
bookkeeping were tangled in one file, so nobody else could author it and I
maintained state by hand. Separating those three is what this version adds, plus
the UX for somebody else to publish one. `scripts/import-progress.mjs` carries the
old `progress.json` in, because someone with real history should not restart at
zero. **Learn and Shadow are new.**

I wrote a spec before the code (`spec.md`) and kept a `CLAUDE.md` recording what I
changed my mind about. Most of the good decisions came from using the thing and
finding it annoying:

- **Triage sent broad questions to plain answers.** My spec said a question "so
  broad that a prediction is meaningless" should skip the loop. In use that fired
  on *"I want to learn about cassandra db"* — someone who had just declared
  learning intent got an overview and the words "Straight lookup", which is the
  toggle looking broken. Triage now keeps topic-shaped questions and the predict
  prompt narrows to one pivotal concept.

- **A tone regression invisible in the diff.** Fixture 2 is a case where the
  user's design is *simpler and correct* — a fixed-window rate limiter at 40
  requests/second. It came back with three `gap` rows and a probe about a
  4,800-request burst. The fault was not the diff prompt: the solver prompt had
  designed a token bucket with a Lua script and a circuit breaker for an internal
  API at 40 rps, and the diff faithfully compared against *that*. **The diff can
  only be as calibrated as the solution it diffs against.**

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
yours, not a correction of it. A model shown your design first anchors on it and
agrees with itself, so the solution is redacted server-side until you commit —
with a test asserting it, because otherwise the blur is theatre.

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

The product is mostly **prompt assets, not code** — every model call lives in one
file, prompts are hand-edited markdown read fresh from disk, and the layered
output is a single XML contract. Adding a subject means writing a file.

**Different users need different entry points**, and the design carries that:
three courses ship at three levels by three authors; Learn suits someone without a
working model of a concept, Shadow assumes you have one. The mode toggle serves
both without guessing which you are.

**Cost is linear in exchanges, not session length** — nothing fans out, with no
retrieval step and no per-message chain. A Learn exchange is one Haiku
classification plus one Opus generation (all four layers of the reveal from a
single call, not three), with tagging fired off the critical path. Shadow is two
Opus generations and a short grade. A course turn is one call, bounded by an
authored question budget rather than open-ended chat. Prompt files ship as cached
system blocks, so only the variable content of each request is fresh.

The obvious lever — run Shadow's solver on a cheaper model — is the one I would
*not* pull: fixture 2 showed the diff is only as calibrated as the solution it
compares against, so degrading the solver silently degrades what the user reads.
Latency splits the same way. Twenty seconds is fine in Shadow, where you are meant
to be typing through it, and unacceptable in triage — which is why triage is the
one thing on the critical path and runs on Haiku.

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
- **Deployment is a demo, not a service.** Storage on Vercel is per-instance and
  wiped on cold start, there is no auth, and concurrent visitors share state. Run
  it locally for anything you want to keep.
- **Everything here is n=1.** The tone rules encode my judgment about what reads
  as condescending. They need real users to survive contact.
