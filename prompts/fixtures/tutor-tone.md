# Guided session tone fixtures

Two, for the same reason `delta-tone.md` and `shadow-diff.md` have two. Run both
through `tutor.md` after any change to it — or to a course body, which is prose
the model reads and can drift the tone just as easily — and read the output.

Same protocol: **drill on topics where you do not already know the answer.** You
cannot feel unfairly graded on a question you had already nailed.

The session has a failure mode the delta does not. It rates you, over and over,
and a rating you believe is unfair poisons every rating that was accurate. Both
fixtures below are versions of that.

Both are on `rate-limiting-throttling` in `courses/system-design-staff.md`, whose
taxonomy is:

```
algorithm-choice-at-scale · distributed-counter-placement
boundary-burst-in-fixed-windows · client-contract-and-retry-after
fail-open-vs-fail-closed · detection-and-observability
overengineering-for-the-load
```

---

## Fixture 1 — a correct answer at the stated scale

This is the one that will drift, and it is the same failure `shadow-diff.md`
fixture 2 exists for: the model finds fault to justify its own turn.

**Question asked:** an internal API, 30 callers, ~200 rps total across 4 nodes,
limit 100 requests/minute per calling service. Which algorithm, where does the
counter live, defend both at this load.

**Answer:**

> Fixed window per calling service, counter in a shared Redis with `INCR` plus
> `EXPIRE`. It lives in Redis rather than in-process because the four API nodes
> need one view of the count, otherwise each enforces 100 and the real limit is
> 400. At 200 rps that is a few hundred Redis ops a second, which is nothing. On
> limit, 429 with `Retry-After` set to the seconds left in the window.

### ✗ Avoid

> `<eval-rating>partial</eval-rating>`
>
> Good start! A fixed window allows a 2× burst at the boundary, so you'd really
> want a sliding window log or a token bucket here. You also didn't mention what
> happens if Redis goes down, or how you'd shard the counters as you grow.

Three things wrong with it, in order of damage: it rates a correct answer
`partial`; it prescribes a token bucket for an internal API at 200 rps, which is
the wrong design; and it marks down for failure behaviour and sharding that the
question did not ask about. Rule 3 exists for the third one specifically.

### ✓ Target — real captured output

```
<eval-rating>strong</eval-rating>
<eval-gaps></eval-gaps>
<eval-checkpoints>0, 1, 2</eval-checkpoints>
<eval-note>They see that per-node counters multiply the effective limit by the
node count, and they sized the Redis load against the actual traffic rather than
reaching for something heavier.</eval-note>
<tutor-feedback>Right call, and the specific thing that was strong is the
arithmetic: you justified shared Redis by naming the exact 4× enforcement error,
and justified *one* Redis instance by pricing the op rate instead of assuming you
needed a cluster. At 200 rps a fixed window is the correct answer, not the lazy
one.

Two things to carry forward:

| Detail | Why it matters here |
|---|---|
| `INCR` then `EXPIRE` is two round trips | If the process dies between them the key is immortal and that caller is banned forever. |
| Fixed windows allow 2× at the seam | At this scale that is usually fine — but only if you decided it was fine. |
</tutor-feedback>
<tutor-question>Redis goes down — a failover, 20 seconds of unavailability. What
does the API node do with each incoming request during those 20 seconds, and how
did you decide that?</tutor-question>
```

`strong`, empty gaps, and the extra depth offered as the *next layer* rather than
deducted. The acknowledgement names the arithmetic — a specific thing they did,
not "good start".

---

## Fixture 2 — right conclusion, wrong reasoning

**Question asked:** the follow-up above.

**Answer:**

> If Redis is down I would just let all the requests through. It is fine, rate
> limiting is not that important.

### ✗ Avoid

> `<eval-rating>strong</eval-rating>`
>
> Exactly — fail open is the standard choice here. Nice instinct!

Fail-open *is* right for this system, so the conclusion is correct. Rating it
`strong` teaches that "it's not that important" is a valid reason, and that
belief will produce a fail-open limiter in front of a paid external quota later.

Also avoid the opposite: `weak`, plus a lecture. They got the answer right.

### ✓ Target — real captured output

```
<eval-rating>partial</eval-rating>
<eval-gaps>distributed-counter-placement</eval-gaps>
<eval-note>They land on fail-open, which is defensible for this system, but treat
it as a throwaway rather than a decision tied to what the limiter is actually
protecting, and they skipped detection entirely.</eval-note>
<tutor-feedback>Fail-open is the right choice here. The reasoning isn't. "Rate
limiting is not that important" is not a property of rate limiting, it's a
property of *this* limiter: it exists to stop a buggy internal caller from
accidentally hammering you, not to stop an attacker or to protect a hard capacity
ceiling.</tutor-feedback>
```

`partial` is the contract for right-conclusion-wrong-reasoning, and the feedback
separates the two in its first two sentences instead of blurring them.

---

## Also check, on any run

- **A `skip` is not commented on.** `<eval-rating>skipped</eval-rating>`, empty
  gaps, the answer given plainly, next question. No "no problem!", no
  encouragement, no offer of an easier one.
- **`<eval-gaps>` only ever contains tags from the taxonomy above.** Anything
  else is dropped server-side, which means a real gap goes unrecorded — if the
  model keeps reaching for a tag that does not exist, the course's taxonomy is
  missing a dimension and the course file is what needs the edit.
- **Checkpoints are demonstrations, not topics touched.** If a checkpoint ticks
  on an answer that only alluded to it, the contract has slipped.
