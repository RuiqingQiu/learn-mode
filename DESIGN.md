# Learn Mode — design rationale

**Prototype:** [deployed link] · **Code:** this repo · **Video:** [link]

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

That is the illusion of explanatory depth, and it has been measured for decades.
What is new is that model output is maximally fluent, so it maximises the
illusion — and the failure is invisible from the inside, which is why it does not
self-correct.

So the prototype rests on one intervention: **you commit to something before
Claude will answer.** Committing converts reading into retrieval, and it leaves a
reference point — your own stated belief — that the answer can then be aimed at.

## What I built

Three surfaces, one mechanic, at increasing levels of structure.

**Learn — a single concept.** Predict first. The answer arrives in layers, and the
part that matters is the **delta**: no score, no percentage, no checkmark, but a
statement of the *belief* that produced the wrong answer. Then it reinforces it
however you chose at setup — explaining it back to a confused junior, a quiz from
memory with the answer hidden, or one transfer question.

**Shadow — a real task.** You and Claude solve the same design problem at once,
and Claude's solution is withheld until you commit yours. The reveal is not prose
but a **decision diff** — four to six rows of `you | Claude`, tagged `agree`,
`diverge`, `gap`, `user-ahead` — plus exactly one probe on the costliest
divergence. In testing my password-reset design was fine, and the summary said so.
What I learned was that *session invalidation was a decision at all*, and I had
silently defaulted it.

**Courses — someone else's curriculum.** One hand-authored file: frontmatter for
what the app must reason about (topics, prerequisites, checkpoints, a fixed
vocabulary for recurring mistakes) and a markdown body of coaching prose. The
educator owns curriculum and pedagogy; the app owns bookkeeping.

**Across all three, the transfer challenge.** Get something wrong, and later that
belief returns in a visibly different domain with nothing on screen to read from —
a distributed-locking miss came back as a hospital infusion pump holding a control
lease. It is the only thing here that measures what survived *after* the
explanation was gone.

## How I got here

I wrote the spec before the code (`spec.md`), and kept a `CLAUDE.md` recording
what I changed my mind about. Most of the good decisions came from using the thing
and finding it annoying.

- **Triage was sending broad questions to plain answers.** The spec said a
  question "so broad that a prediction is meaningless" should skip the loop. In
  use that fired on *"I want to learn about cassandra db"* — someone who had just
  declared learning intent got an overview and the line "Straight lookup", which
  is the toggle looking broken. Triage now keeps topic-shaped questions, and the
  predict prompt narrows to one pivotal concept.

- **"End session" was terminal, which punished the likeliest reason for leaving.**
  The requirement was an always-visible way to stop the questions; making that
  exit *permanent* was a constraint I invented, and it hurt exactly the person who
  got stuck and wanted to look something up. It became a pause.

- **A tone regression invisible in the diff.** I keep fixtures for the
  quality-critical prompts. Fixture 2 is a case where the user's design is
  *simpler and correct* — a fixed-window rate limiter at 40 requests/second. It
  came back with three `gap` rows and a probe about a 4,800-request burst. The
  fault was not the diff prompt: the solver prompt had designed a token bucket
  with a Lua script and a circuit breaker for an internal API at 40 rps, and the
  diff faithfully compared against *that*. **The diff can only be as calibrated as
  the solution it diffs against.**

Shadow itself came from using Learn until I hit its ceiling: it works on one
concept with one right answer, and real work is not one concept.

## Agency

**The user declares intent; the system never infers it.** The mode at send time is
the entire boundary mechanism. I explicitly rejected classifying each message as
follow-up versus fresh, because the errors are asymmetric: quizzing someone
mid-clarification is annoying but visible and recoverable, whereas silently
handing a plain answer to someone who asked for the loop makes the feature look
broken with no explanation — and classifiers are least reliable exactly at the
boundary where it matters.

**Every screen has an escape hatch and the copy never guilts you.** Skipping is a
first-class path: a skipped prediction stores `NULL` rather than counting as a
miss, and the reveal omits the delta entirely rather than commenting on the skip.
Friction without an exit gets abandoned inside a week.

**Claude never overwrites your answer.** Shadow produces an alternative next to
yours, not a correction of it — which is also why it generates *before* seeing
your approach. A model shown your design first anchors on your framing, agrees
with itself, and the comparison collapses into flattery. The solution is redacted
server-side until you commit, with a test asserting it, because otherwise the
blurred panel is theatre.

**What is not optional is the prediction.** Making it a setting turns Learn mode
into Answer mode with extra steps. Agency means choosing whether to enter, not
renegotiating the mechanism once inside.

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
output is a single XML contract. Adding a subject means writing a file — which is
the same reason an educator can publish a course without a deploy.

Cost is shaped deliberately: all four layers of a reveal come from **one** call
rather than three, triage runs on a cheap model on the critical path, and concept
tagging is fire-and-forget off it.

The compounding asset is the calibration data — more valuable per user over time,
free to collect, and eventually what lets the system suppress scaffolding where
someone is consistently right, solving expertise detection without a test.

What would have to change is conventional: this is single-user by construction
(SQLite, no auth, one enrollment per course), so multi-tenancy means identity,
ownership and a hosted database. The part usually hardest to retrofit is already
done — an authored course body reaches the model as **data, not instruction**, and
the tutor prompt enumerates what that data cannot do: change the output contract,
add or remove tags, or redefine the taxonomy.

## Adoption

Learn mode is **one toggle, a handful of prompt files, and a streaming contract**.
No new subsystem, no training, no separate product surface. A sister team could
ship the prediction loop alone — the smallest version carrying most of the value —
behind a flag on one surface, and measure the assistance curve before committing
further.

I would sequence it: prediction-before-answer first, as the cheapest and most
testable; the delta second, since it is the quality-critical surface and needs
prompt iteration against fixtures; Shadow third, for the parallel-generation
plumbing. Courses belongs with an education or partnerships team, since the real
work there is recruiting authors, not building software.

The argument I would make internally is the metric one: this is a feature whose
success looks like reduced engagement, so it has to be sponsored with that
understood in advance or a dashboard will kill it.

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
