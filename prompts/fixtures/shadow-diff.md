# Skill Shadow diff fixtures

Two, for the same reason `delta-tone.md` has two. Run both through
`shadow-diff.md` after any change to it and read the output.

The diff has a failure mode the delta does not: **the model will find fault to
justify its own existence.** Fixture 2 is the one that will drift. A user whose
design is genuinely correct at their scale, told it is a `gap`, learns the wrong
thing and stops trusting everything else on the page.

Same protocol as `delta-tone.md`: test on design questions where you do not
already know the right answer. You cannot feel patronised about a call you had
already made correctly.

---

## Fixture 1 — the user's design has a real hole

**Task:** Design the backend for a distributed job scheduler

**Committed approach** *(medium confidence)*:

> Workers poll a jobs table for rows where `run_at <= now`, and before running a
> job they acquire a Redis lock on the job id with SETNX and a 30 second TTL so
> only one worker runs it. Failed jobs are retried until they succeed. Cron
> schedules live in a schedules table.

### ✗ Avoid

> Great starting point! You've got the core ideas right. A few things to consider:
> you might want to add fencing tokens, bounded retries, idempotency keys, dead
> letter queues, per-queue concurrency limits, backfill policies, and observability.

Six findings is a code review. It teaches nothing, because there is nothing to
hold in your head afterwards.

### ✓ Target — real captured output

```
<summary>Both are polling a jobs table, but they split the claim across Postgres
and a Redis SETNX lock where I kept it in a single transactional UPDATE with SKIP
LOCKED, and they left retry bounds and lease-expiry safety open.</summary>
<axes>
job claim | poll + Redis SETNX | SELECT … FOR UPDATE SKIP LOCKED | diverge
claim durability | two stores, no cross-write guarantee | one transaction, one store | diverge
lease expiry safety | TTL only, no fenced completion | fenced write on owner + lease_until | gap
retry policy | retry until success | bounded attempts, backoff + jitter, dead state | diverge
idempotency | — | idem_key on effects | gap
recurring schedules | schedules table | schedules table + materializer with idem key | diverge
</axes>
<strong-point></strong-point>
<probe-scenario>Job 4711 is a 90-second report build. Worker A polls it at t=0,
takes the Redis lock with a 30s TTL, and starts. At t=30 the TTL expires with A
still running. At t=31 worker B polls, sees run_at <= now and state unchanged,
SETNX succeeds, and B starts the same report.</probe-scenario>
<probe-question>When two workers hold what each believes is a valid claim on job
4711, what in the write path stops the second completion from landing?</probe-question>
```

Note what this does **not** do: no praise, no "you're close", no numbered list of
everything missing, and `<strong-point>` is left empty rather than padded. Six
rows, one probe, and the probe is on the one row that costs the most.

---

## Fixture 2 — the user's design is simpler and correct

This is the drift fixture. **Most rows should be `agree` and `<summary>` should
say so plainly.**

**Task:** I need to rate-limit an internal API. About 40 requests/second across
three app servers.

**Committed approach** *(high confidence)*:

> A fixed-window counter in Redis: `INCR` a key like `rl:<user>:<minute>` with a
> 60-second expiry, reject when it goes over the limit. One shared Redis, all
> three app servers hit it.

### ✗ Avoid

> Fixed windows allow burst traffic at boundaries — a user can send 2× the limit
> across a window edge. You should use a sliding window log or a token bucket, and
> consider what happens when Redis is unavailable, and add local caching to reduce
> Redis round trips…

Every sentence there is true and every sentence is wrong to say. At 40 rps on an
internal API, the boundary burst is 2× a limit that was picked by feel, the Redis
round trip is sub-millisecond, and the sliding window log costs memory and code
to fix a problem this system does not have.

### ✓ Target — real captured output

```
<summary>Both put one shared counter in Redis keyed per client per window; theirs
stops at the fixed-window INCR, which is the correct size for 40 rps, while mine
adds a sliding window, a Redis-side clock, and an explicit failure stance.</summary>
<axes>
algorithm | fixed window INCR | sliding window ZSET in Lua | diverge
state location | one shared Redis, all 3 servers | one shared Redis, all 3 servers | agree
key identity | explicit user/client id | service identity, not IP | agree
Redis unavailable | — | fail open, 50ms timeout, alert | gap
429 response contract | reject | 429 with Retry-After | gap
</axes>
<strong-point></strong-point>
<probe-scenario>Redis fails over to a replica and is unreachable for 8 seconds.
During that window all three app servers are still receiving their share of the
40 rps, and every one of those requests hits the limiter call first. The limiter's
client library raises a connection error rather than returning a count.</probe-scenario>
<probe-question>For those 8 seconds, what status code does a well-behaved internal
caller get, and is that the behavior you would have picked if you had been asked
directly?</probe-question>
```

The load-bearing clause is in `<summary>`: *"which is the correct size for 40
rps, while mine adds…"*. The model names its own over-reach instead of scoring
the user against it. If that clause disappears on a re-run, the prompt has
drifted and fixture 2 has caught it.

The probe also moved off the fixed-window boundary and onto fail-open — a
decision the user genuinely did not make, and one that bites at any scale. A
probe about window-edge bursts at 40 rps would be technically true and useless.

### What this fixture caught, the first time it was run

The first pass produced three `gap` rows, only one `agree`, and a probe built on
a 4800-request burst. The cause was not in `shadow-diff.md` at all — it was
upstream: `shadow-solve.md` had designed a token bucket with a Lua script and a
circuit breaker for a 40 rps internal API, and the diff faithfully compared
against that. **The diff can only be as calibrated as the solution it diffs
against.** Both prompts now carry the scale rule; if this drifts again, check
`shadow-solve.md` first.
