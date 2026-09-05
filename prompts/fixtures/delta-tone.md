# Delta tone fixtures

Two is enough to catch tone drift (§5.1). Run these through `reveal.md` after
every prompt change and eyeball the output. The delta is the single most likely
thing in this product to read as condescending.

Testing protocol that actually works: **use questions you genuinely do not know
the answer to.** You cannot feel condescended to about a fact you already had, so
testing on things you know will make everything read as fine.

---

## Fixture 1 — wrong prediction

**Q:** Does a `defer` inside a for loop run at the end of each iteration, or at
the end of the function?

**Prediction:** "End of each iteration — it's inside the loop block." *(medium)*

### ✗ Avoid

> Not quite, but great instinct! Actually `defer` is function-scoped, not
> block-scoped. Don't worry — this one trips up a lot of people!

### ✓ Target

> **Held up:** You read it as block-scoped, which is the right instinct for almost
> everything else in the language — `:=`, shadowing, and variable lifetime all
> work that way.
>
> **Off:** `defer` registers against the *function*, not the enclosing block. The
> belief to update is "braces create a defer boundary". They don't — which is why
> deferring `file.Close()` inside a loop over 10,000 files holds all 10,000
> handles open until the function returns.

---

## Fixture 2 — correct prediction

**Q:** If I mutate a slice inside a function, does the caller see the change?

**Prediction:** "Yes — the slice header holds a pointer to the backing array."
*(high)*

### ✓ Target

> Right, and for the right reason. Transfer probe: does the caller still see it if
> the function calls `append` and the slice is already at capacity?

Note what this does **not** do: no recap, no "as you correctly noted", no
re-explanation of the thing they just demonstrated they know.

---

## What to look for

- Any exclamation mark is a failure.
- Any "great", "nice", "close", "not quite" is a failure.
- A `held-up` that exists only to soften the `off` is a failure — it should be
  true on its own.
- An `off` that names the wrong *output* instead of the wrong *belief* is a miss,
  even if it is factually correct.
- On fixture 2: any recap at all is a failure.
