/**
 * End-to-end UI smoke test in a real browser. Makes real API calls (~$0.20) and
 * takes a couple of minutes.
 *   npm run dev            # in another shell
 *   npm run smoke
 *
 * This exists because the API can be entirely correct while the UI never
 * updates — that bug shipped once already. Anything only a browser can catch
 * belongs here.
 */
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
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
page.on("pageerror", (e) => { console.log("  [pageerror]", e.message); failures++; });

const spinner = page.locator("[role=status]");
/**
 * The composer, by placeholder. Not `textarea.first()` — the empty state can also
 * hold a transfer-challenge card with its own box, and that one comes first in
 * the DOM.
 */
const composer = page.getByPlaceholder(
  /^(Ask anything|Ask something worth predicting|Give it a design)/,
);

const panel = page.locator("div.rounded-xl").filter({ hasText: "EXPLAINING IT BACK" });
const explainBack = page.getByRole("button", { name: /Explain it back/ });

await page.goto(BASE, { waitUntil: "networkidle" });

// The setup screen is now the first thing on a fresh install, and it gates the chat.
if ((await page.getByText("Before we start").count()) > 0) {
  check((await page.locator("textarea").count()) === 0, "setup screen gates the chat on first run");
  check((await page.getByText("always commit a guess").count()) > 0,
        "setup says the prediction is not configurable");
  await page.getByRole("button", { name: /Make me explain it back/ }).click();
  await page.getByRole("button", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(1000);
  check((await page.locator("textarea").count()) > 0, "Start drops you into the chat");
} else {
  // Already onboarded — force the settings the rest of this suite assumes.
  await page.getByRole("button", { name: /^Preferences/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Make me explain it back/ }).click();
  await page.getByRole("button", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(800);
}

// Remember what was here first, so this run can clean up after itself.
const preexisting = await page.evaluate(async () =>
  (await (await fetch("/api/threads")).json()).threads.map((t) => t.id),
);

await page.getByTitle("New thread").click();
await page.waitForTimeout(600);

// ── Answer mode streams without a refresh ─────────────────────────────────
log("answer mode");
await composer.fill("What's the flag to make rsync preserve symlinks?");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check((await spinner.count()) > 0, "spinner while waiting for the answer");
await page.waitForFunction(
  () => /--links|`-l`/.test(document.querySelector("main")?.innerText ?? ""),
  null, { timeout: 90000 },
).then(() => check(true, "plain answer streamed live"))
 .catch(() => check(false, "plain answer streamed live"));

// ── Learn mode: prediction card appears live ──────────────────────────────
log("learn mode");
await page.getByTitle("New thread").click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "learn", exact: true }).click();
await composer.fill(
  "Does a defer inside a for loop run at the end of each iteration, or at the end of the function?",
);
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
check(
  (await spinner.count()) > 0 && (await spinner.first().innerText()).includes("working out a question"),
  "labelled spinner while the prediction is built",
);

await page.getByText("what's your current guess", { exact: false })
  .waitFor({ state: "visible", timeout: 120000 })
  .then(() => check(true, "prediction card appeared without a refresh"))
  .catch(() => check(false, "prediction card appeared without a refresh"));
check((await spinner.count()) === 0, "spinner clears when the card arrives");
check((await page.locator('input[name="confidence"]').count()) === 3, "confidence radios rendered");

// ── Submit, and watch the reveal stream in ────────────────────────────────
log("submitting a guess");
const optionBtns = page.locator("main button.w-full");
const isChoice = (await optionBtns.count()) > 0;
if (isChoice) await optionBtns.first().click();
else await page.getByPlaceholder(/^Your guess/).fill("at the end of each iteration");
await page.locator('input[name="confidence"]').nth(1).check();
await page.getByRole("button", { name: "Submit", exact: true }).click();
await page.waitForTimeout(700);
check((await spinner.count()) > 0, "spinner while the reveal is written");

await page.waitForFunction(
  () => (document.querySelector("main")?.innerText ?? "").includes("Held up."),
  null, { timeout: 150000 },
).then(() => check(true, "delta streamed live"))
 .catch(() => check(false, "delta streamed live"));

// `full` is the bulk of the tokens and arrives last. It must say so, and it must
// not hold the user hostage — explaining back unlocks as soon as it starts.
const showFull = page.getByRole("button", { name: /Show full answer/ });
await showFull.waitFor({ timeout: 150000 });
check((await showFull.innerText()).includes("still writing"),
      "'Show full answer' flags that it is still being written");
check((await explainBack.count()) > 0,
      "'Explain it back' unlocks before the full answer finishes");
// Take that path, because it races the reinforcement phase the reveal launches
// when it finishes. Both used to fire, and the second regenerated the server's
// one row while the panel grew a second opening question with no reply between.
// Exact name: the sidebar's example note also reads "Explain it back".
await page.getByRole("button", { name: "Explain it back", exact: true }).click();

await page.waitForFunction(
  () => !(document.querySelector("main")?.innerText ?? "").includes("still writing"),
  null, { timeout: 180000 },
).then(() => check(true, "reveal completed and the indicator cleared"))
 .catch(() => check(false, "reveal completed and the indicator cleared"));
check((await showFull.count()) > 0, "full answer collapsed behind one click");

// ── The guess recap expands back to the full prediction ───────────────────
const recap = page.getByRole("button", { name: /You guessed:/ });
check((await recap.count()) > 0, "guess line is expandable");
await recap.click();
await page.waitForTimeout(400);
check((await page.locator("main span.uppercase").filter({ hasText: /^yours$/ }).count()) === 1,
      "recap marks your pick");
if (isChoice) {
  check((await page.locator("main span.uppercase").filter({ hasText: /^answer$/ }).count()) === 1,
        "recap marks the right answer");
}

// ── §4.0: the toggle auto-flips back to Answer, visibly ───────────────────
check((await page.getByRole("button", { name: "answer", exact: true }).getAttribute("aria-pressed")) === "true",
      "toggle auto-reset to Answer after the reveal");
check((await page.getByText("Switched back to Answer").count()) > 0, "the auto-flip announced itself");

// ── Protégé mode ──────────────────────────────────────────────────────────
log("protege (started mid-reveal, above)");
await page.waitForFunction(
  () => (document.querySelector("main")?.innerText ?? "").includes("JUNIOR"),
  null, { timeout: 120000 },
).then(() => check(true, "junior asked the first question"))
 .catch(() => check(false, "junior asked the first question"));

/** Junior questions on screen. Must never exceed the turns the server stored. */
const juniorTurns = () => page.locator("main span", { hasText: /^junior$/i }).count();
// The reveal finished a moment ago, so its auto-launch has had its chance: a
// second session would either be mid-generation (spinner) or already on screen.
await page.waitForTimeout(8000);
check((await juniorTurns()) === 1 && !(await panel.innerText()).includes("junior is thinking"),
      "one opening question — the auto-launch did not start a second session");

const pauseBtn = page.getByRole("button", { name: /Pause — ask something else/ });
const resumeBtn = page.getByRole("button", { name: /Resume explaining/ });
check((await pauseBtn.count()) > 0, "Pause always visible during teaching");

// Pausing *mid-generation* must stick — the finishing stream used to clobber it.
await pauseBtn.click();
await page.waitForTimeout(600);
check((await resumeBtn.count()) > 0, "pause mid-stream is not clobbered by the finishing turn");
check((await panel.locator("textarea").count()) === 0, "reply box hidden while paused");
check((await page.evaluate(() => document.activeElement?.tagName)) === "TEXTAREA",
      "composer usable and focused on pause (not disabled by the in-flight turn)");

await resumeBtn.click();
await panel.locator("textarea").waitFor({ timeout: 120000 })
  .then(() => check(true, "Resume brings the reply box back"))
  .catch(() => check(false, "Resume brings the reply box back"));

await pauseBtn.click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
check((await resumeBtn.count()) > 0, "paused session survives a refresh");
await resumeBtn.click();
await panel.locator("textarea").waitFor({ timeout: 120000 });

// ── Stuck → main chat with the transcript → auto-resume ───────────────────
log("stuck -> main chat");
const stuck = page.getByRole("button", { name: /Stuck — ask the main chat/ });
check((await stuck.count()) > 0, "'Stuck' button available while replying");

const questions = page.locator("main p.text-\\[17px\\]");
const before = await questions.count();
await stuck.click();
await page.waitForTimeout(1200);
check((await panel.innerText()).includes("asking the main chat"), "shows it is asking the main chat");

let grew = false;
for (let i = 0; i < 120 && !grew; i++) {
  grew = (await questions.count()) > before;
  if (!grew) await page.waitForTimeout(500);
}
check(grew, "a new main-line exchange appeared");
check((await page.locator("main").innerText()).includes("Sent with your explain-back transcript"),
      "the new exchange carries the transcript");

await page.waitForFunction(() => !document.body.innerText.includes("asking the main chat"),
                           null, { timeout: 180000 });
await page.waitForTimeout(1500);
check((await panel.locator("textarea").count()) > 0, "protégé auto-resumed after the answer");

// The live session floats to the end of the thread, below the answer it asked for.
check((await panel.count()) === 1, "exactly one explain-back panel on the page");
check(await inViewport(panel), "the live session is on screen, not stranded above");
const answerBox = await page.locator("main p", { hasText: "Sent with your explain-back transcript" })
  .first().boundingBox();
const panelBox = await panel.first().boundingBox();
check(!!answerBox && !!panelBox && panelBox.y > answerBox.y,
      "the main-chat answer sits above the session, in the order it happened");
check((await page.getByText("Explaining back:").count()) > 0, "floated panel names its question");

// Replying must not bounce the page away from the box being typed in — and it
// has to actually produce the next turn. A client/server disagreement about how
// many turns exist ends the session early, and the wrap-up then renders next to
// the original exchange, far above the composer: indistinguishable from nothing.
const turnsBefore = await juniorTurns();
await panel.locator("textarea").fill("they all run when the function returns");
await panel.getByRole("button", { name: "Reply", exact: true }).click();
await page.waitForTimeout(2500);
check(await inViewport(panel), "the panel stays in view while the junior replies");
await page
  .waitForFunction(
    (n) => document.querySelectorAll("main span").length >= 0 &&
      [...document.querySelectorAll("main span")].filter((e) => e.textContent.trim().toLowerCase() === "junior").length > n,
    turnsBefore, { timeout: 120000 },
  )
  .then(() => check(true, "the reply produced the junior's next turn"))
  .catch(() => check(false, "the reply produced the junior's next turn"));
check(await inViewport(panel), "the answer to that reply landed where the user is looking");

// ── Clear ─────────────────────────────────────────────────────────────────
await pauseBtn.click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Clear", exact: true }).click();
// Wait for the panel to go, rather than sleeping past a network round trip and a
// re-render — a fixed 700ms raced it.
await page
  .getByText("EXPLAINING IT BACK")
  .waitFor({ state: "detached", timeout: 10000 })
  .then(() => check(true, "Clear discards the session"))
  .catch(() => check(false, "Clear discards the session"));
check((await explainBack.count()) > 0, "after Clear you can start over");

const removed = await page.evaluate(async (keep) => {
  const { threads } = await (await fetch("/api/threads")).json();
  const mine = threads.filter((t) => !keep.includes(t.id));
  await Promise.all(mine.map((t) => fetch(`/api/threads/${t.id}`, { method: "DELETE" })));
  return mine.length;
}, preexisting);
log(`cleaned up ${removed} thread(s)`);

log(failures ? `${failures} FAILURE(S)` : "all checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
