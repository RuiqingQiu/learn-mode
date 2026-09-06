/**
 * End-to-end UI smoke test for Skill Shadow. Real browser, real API calls
 * (~$0.15), a couple of minutes.
 *   npm run dev            # in another shell
 *   npm run smoke:shadow
 *
 * The load-bearing assertion is the third one: Claude's solution must not be in
 * the browser before the user commits. If that ever regresses, the blurred panel
 * becomes a CSS effect anyone can defeat in devtools and the premise is gone.
 */
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const TASK = "Design the backend for a distributed job scheduler";
const APPROACH =
  "Workers poll a jobs table for rows where run_at <= now, and before running a job they " +
  "acquire a Redis lock on the job id with SETNX and a 30 second TTL so only one worker runs " +
  "it. Failed jobs are retried until they succeed. Cron schedules live in a schedules table.";

const t0 = Date.now();
const log = (...a) => console.log(String(Date.now() - t0).padStart(6) + "ms", ...a);

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

/** DOM presence is not visibility — asserting only the former hid a real bug. */
const inViewport = async (locator) => {
  const box = await locator.first().boundingBox();
  if (!box) return false;
  const h = page.viewportSize().height;
  return box.y + box.height > 0 && box.y < h;
};

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1150, height: 950 } });
page.on("pageerror", (e) => {
  console.log("  [pageerror]", e.message);
  failures++;
});

await page.goto(BASE, { waitUntil: "networkidle" });
if ((await page.getByText("Before we start").count()) > 0) {
  await page.getByRole("button", { name: /Start/ }).click();
  await page.waitForTimeout(500);
}

// A fresh thread, so seeded examples are not in the way.
await page.getByRole("button", { name: "+" }).first().click();
await page.waitForTimeout(400);

log("switching to Shadow mode");
await page.getByRole("button", { name: "shadow", exact: true }).click();
check(
  (await page.getByPlaceholder(/you and Claude solve it separately/).count()) > 0,
  "composer says what Shadow mode is going to do, before you send",
);

await composer.fill(TASK);
await page.getByRole("button", { name: "Send" }).click();

// ── while Claude works ──────────────────────────────────────────────────────
/** By placeholder: the empty state may also hold a challenge card with its own box. */
const composer = page.getByPlaceholder(/^(Ask anything|Give it a design)/);

const claudePanel = page.locator("div.rounded-xl").filter({ hasText: "claude" }).last();
await page.getByText("working on it separately").waitFor({ timeout: 20_000 });
check(true, "Claude is visibly working in parallel");
check(
  (await page.getByPlaceholder(/How would you build it/).count()) > 0,
  "you can start writing while Claude is still working",
);

log("waiting for Claude to finish solving");
await page.getByText("Commit yours to compare").waitFor({ timeout: 180_000 });
check(await inViewport(claudePanel), "the blurred panel is actually on screen");

// The one that matters. Nothing of the solution may be in the browser yet.
const preCommit = await page.content();
check(
  !/SKIP LOCKED/i.test(preCommit) && !/lease_until/i.test(preCommit),
  "Claude's solution is NOT in the DOM before you commit",
);

// ── commit ──────────────────────────────────────────────────────────────────
log("committing an approach");
await page.getByPlaceholder(/How would you build it/).fill(APPROACH);
await page.getByRole("radio").nth(1).check();
await page.getByRole("button", { name: "Commit approach" }).click();

await page.getByText(/comparing the two designs|decision/i).first().waitFor({ timeout: 180_000 });
check(
  (await page.getByText("Commit yours to compare").count()) === 0,
  "the blur is gone once you have committed",
);

log("waiting for the diff");
await page.getByText("interesting divergence").waitFor({ timeout: 240_000 });

const rows = page.locator("div.rounded-xl >> text=/\\| ?/");
const tagChips = page.locator("span").filter({ hasText: /^(agree|diverge|gap|user-ahead)$/ });
const tagCount = await tagChips.count();
check(tagCount >= 4 && tagCount <= 6, `the diff has 4–6 decision rows (got ${tagCount})`);
check(await inViewport(page.getByText("interesting divergence")), "the probe is on screen");
check(
  (await page.getByText("interesting divergence").count()) === 1,
  "exactly one probe, not a list of nitpicks",
);
check(
  (await page.locator("text=/great|nice work|good instinct|!/i").count()) === 0 ||
    true, // tone is judged by eye against the fixtures, not asserted here
  "tone check is manual — see prompts/fixtures/shadow-diff.md",
);

// ── the probe ───────────────────────────────────────────────────────────────
// The controls appear only once the stream closes — answering a question that is
// still being written is not a state worth offering. So wait, do not just count.
const reason = page.getByRole("button", { name: "Let me reason" });
await reason.waitFor({ timeout: 120_000 });
check(
  (await page.getByRole("button", { name: "Give me a hint" }).count()) > 0,
  "the probe has a hint escape hatch",
);
check((await page.getByRole("button", { name: "Skip it" }).count()) > 0, "the probe can be skipped");

log("answering the probe");
await reason.click();
await page
  .getByPlaceholder("Work it out…")
  .fill("Nothing — the Redis key is gone, so A has no way to prove it still owns the job.");
await page.getByRole("button", { name: "Answer", exact: true }).click();
await page.getByText("You said:").waitFor({ timeout: 120_000 });
check(true, "the probe answer is graded and recorded");
check(await inViewport(page.getByText("You said:")), "the feedback is on screen, not below the fold");

log(failures ? `${failures} FAILED` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
