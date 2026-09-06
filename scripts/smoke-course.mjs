/**
 * End-to-end smoke test for guided course sessions, in a real browser.
 * Makes real API calls (~$0.15) and takes a couple of minutes.
 *   npm run dev            # in another shell
 *   npm run smoke:course
 *
 * Same reason as scripts/smoke.mjs: the API can be entirely correct while the UI
 * never updates. The checkpoint rail is the specific thing here that only a
 * browser can catch — it is written by a `meta` event that arrives mid-stream.
 */
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const COURSE = process.env.SMOKE_COURSE ?? "system-design-staff";
// A topic the fixtures do not touch, so a repeat run does not read as history.
const TOPIC = process.env.SMOKE_TOPIC ?? "Idempotency and Deduplication";

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

// ── the setup gate applies to /learn too ────────────────────────────────────
log("onboarding gate");
await page.goto(`${BASE}/learn`, { waitUntil: "networkidle" });
if ((await page.getByText("Before we start").count()) > 0) {
  check(!page.url().includes("/learn"), "/learn redirects to setup on a first run");
  await page.getByRole("button", { name: /Make me explain it back/ }).click();
  await page.getByRole("button", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.goto(`${BASE}/learn`, { waitUntil: "networkidle" });
}

// ── reset just this topic, so a re-run still tests the live tick ────────────
// Reuses the progress-import endpoint rather than adding a test-only route.
log("resetting " + TOPIC);
{
  const { course, enrollment } = await (await fetch(`${BASE}/api/courses/${COURSE}`)).json();
  const topicId = course.topics.find((t) => t.name === TOPIC)?.id;

  // POST /api/sessions resumes an open session by design — that is what "Leave
  // for now" relies on. A previous run that crashed mid-session would otherwise
  // be resumed here, and the assertions below would read its state as this run's.
  if (topicId) {
    const { session } = await (
      await fetch(`${BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: COURSE, topicId }),
      })
    ).json();
    if (session.transcript.length) {
      log("  closing a session left open by an earlier run");
      await fetch(`${BASE}/api/sessions/${session.id}/end`, { method: "POST" });
    }
  }

  if (enrollment && topicId) {
    await fetch(`${BASE}/api/enrollments/${enrollment.id}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topics: { [topicId]: { status: "not-started", score: null, attempts: 0, weak_areas: [] } },
      }),
    });
  }
}

// ── explore ─────────────────────────────────────────────────────────────────
log("explore");
const card = page.getByRole("link", { name: /System Design/ });
check(await inViewport(card), "a course card is visible on /learn");

await card.first().click();
await page.waitForURL(`**/learn/${COURSE}`);

// ── course overview ─────────────────────────────────────────────────────────
log("course overview");
const dashboard = page.getByText(/✅ Completed: \d+\/\d+/);
check(await inViewport(dashboard), "the progress dashboard is visible");
check((await page.getByText("Rate Limiting and Throttling").count()) > 0, "topics are listed");

const row = page.locator("div").filter({ hasText: new RegExp(`^${TOPIC}`) });
check((await row.count()) > 0, `${TOPIC} is on the page`);

// ── start a session ─────────────────────────────────────────────────────────
log("starting a session (real model call, ~30s)");
await page
  .locator("div.flex.items-start", { hasText: TOPIC })
  .getByRole("button", { name: /^(Start|Again)$/ })
  .first()
  .click();
await page.waitForURL(`**/learn/${COURSE}/session/**`, { timeout: 20_000 });

const question = page.locator("div.rounded-xl", { hasText: "QUESTION" });
await question.first().waitFor({ timeout: 120_000 });
check(await inViewport(question), "the opening question is visible");

const rail = page.getByText(/checkpoints \d+\/\d+/);
check(await inViewport(rail), "the checkpoint rail is visible, not just present");
const before = await rail.first().innerText();

// Escape hatches are not optional — rule 1.
for (const name of ["Hint", "Skip this one", "Status"]) {
  check(await inViewport(page.getByRole("button", { name, exact: true })), `${name} is reachable`);
}
check(
  await inViewport(page.getByRole("button", { name: /End session/ })),
  "End session is reachable",
);
check(
  await inViewport(page.getByRole("button", { name: /Leave for now/ })),
  "Leave for now is reachable",
);

// ── status answers from the database, with no model call ────────────────────
log("status command");
const tStatus = Date.now();
await page.getByRole("button", { name: "Status", exact: true }).click();
await page.getByText(/🔄 In Progress: \d+\/\d+/).first().waitFor({ timeout: 15_000 });
const statusMs = Date.now() - tStatus;
check(statusMs < 5000, `status returned in ${statusMs}ms without a model call`);

// ── answer a question ───────────────────────────────────────────────────────
log("answering (real model call, ~40s)");
await page.getByPlaceholder("Your answer…").fill(
  "Derive the key from the client's own request identity — a caller-supplied Idempotency-Key " +
    "header, not a hash of the body, because a retry with a re-serialised body hashes differently. " +
    "Store it in the same database as the write, in a table with a unique constraint on the key, so " +
    "the insert and the effect commit together. Retention is a few days, long enough to cover the " +
    "longest client retry window. Two concurrent duplicates race on the unique constraint; the loser " +
    "gets a conflict and reads back the stored response.",
);
await page.getByRole("button", { name: "Send", exact: true }).click();

const feedbackTurn = page.locator("p.border-l-2");
await feedbackTurn.first().waitFor({ timeout: 180_000 });
check(await inViewport(feedbackTurn), "the evaluation note renders");

await page.waitForTimeout(2000);
const after = await rail.first().innerText();
check(after !== before, `a checkpoint ticked live (${before.trim()} -> ${after.trim()})`);

// The judgment tags must never be rendered inline.
const body = await page.locator("body").innerText();
check(!/eval-rating|eval-gaps|eval-checkpoints/.test(body), "judgment tags are not shown to the user");
check(!/<tutor-question>|<tutor-feedback>/.test(body), "raw tags do not leak into the transcript");

// ── end the session ─────────────────────────────────────────────────────────
log("ending the session (real model call, ~40s)");
await page.getByRole("button", { name: /End session/ }).click();
// Not the score: it streams first, so asserting on it races the rest of the
// wrap-up and the reload below would then outrun the transcript being persisted.
await page.getByRole("button", { name: /Back to the course/ }).waitFor({ timeout: 180_000 });
await page.getByText("SESSION SCORE").first().scrollIntoViewIfNeeded();
check(await inViewport(page.getByText("SESSION SCORE")), "the wrap-up is visible");
check((await page.getByText("WHERE IT GOT THIN").count()) > 0, "the wrap-up names the gaps");
check(
  (await page.getByPlaceholder("Your answer…").count()) === 0,
  "the composer is gone once the session is wrapped up",
);

// ── the wrap-up survives a reload, and reached the notes ────────────────────
log("persistence");
await page.reload({ waitUntil: "networkidle" });
await page.getByText("SESSION SCORE").first().scrollIntoViewIfNeeded();
check(await inViewport(page.getByText("SESSION SCORE")), "the wrap-up survives a reload");

await page.goto(`${BASE}/learn/${COURSE}/notes`, { waitUntil: "networkidle" });
check(await inViewport(page.getByText("WEAK AREAS", { exact: false })), "the notes page renders");
check((await page.getByText(TOPIC).count()) > 0, "the finished session shows up in the notes");
check(
  await inViewport(page.getByRole("button", { name: /Export as markdown/ })),
  "notes are exportable",
);

await page.goto(`${BASE}/learn/${COURSE}`, { waitUntil: "networkidle" });
const dash = await page.getByText(/✅ Completed: \d+\/\d+/).first().innerText();
log("dashboard now:", dash.trim());

console.log(failures ? `\n${failures} failure(s)` : "\nall good");
await browser.close();
process.exit(failures ? 1 : 0);
