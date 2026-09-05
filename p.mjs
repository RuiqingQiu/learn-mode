import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1150, height: 950 } });
let f = 0; const check = (ok, l) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}`); if (!ok) f++; };
page.on("pageerror", e => { console.log("  [pageerror]", e.message); f++; });

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
check((await page.getByText("Before we start").count()) > 0, "first run shows the setup screen");
check((await page.locator("textarea").count()) === 0, "chat is gated until it's answered");
check((await page.getByText("always commit a guess").count()) > 0, "says the prediction isn't configurable");
await page.screenshot({ path: "/tmp/p-onboard.png" });

// Pick quiz + visual.
await page.getByRole("button", { name: /Quiz me afterwards/ }).click();
await page.getByRole("button", { name: /Mostly tables and diagrams/ }).click();
await page.getByRole("button", { name: "Start", exact: true }).click();
await page.waitForTimeout(1200);
check((await page.locator("textarea").count()) > 0, "Start drops you into the chat");

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
check((await page.getByText("Before we start").count()) === 0, "setup does not reappear on reload");

// Run a learn exchange and confirm the quiz auto-launches.
await page.getByRole("button", { name: "learn", exact: true }).click();
await page.locator("textarea").first().fill("Does a defer inside a for loop run at the end of each iteration, or at the end of the function?");
await page.keyboard.press("Enter");
await page.getByText("what's your current guess", { exact: false }).waitFor({ timeout: 120000 });
const o = page.locator("main button.w-full");
if (await o.count()) await o.first().click();
await page.getByRole("button", { name: "Submit", exact: true }).click();

await page.getByText("FROM MEMORY").waitFor({ timeout: 200000 });
check(true, "quiz auto-launched after the reveal");
check((await page.getByText("Answer hidden while you recall it").count()) === 0,
      "answer stays readable while the questions are being written");

const panel = page.locator("div.rounded-xl").filter({ hasText: "FROM MEMORY" });
await panel.locator("textarea").waitFor({ timeout: 200000 });
check((await page.getByText("Answer hidden while you recall it").count()) > 0,
      "answer hides once there is a question to answer");
check((await page.getByRole("button", { name: /Show it anyway/ }).count()) > 0, "with a one-click way to see it");
check((await page.getByRole("button", { name: /Explain it back/ }).count()) === 0, "teach-back did not also fire");
await page.screenshot({ path: "/tmp/p-quiz.png", fullPage: true });
console.log("  Q1:", (await panel.locator("p.text-\\[15\\.5px\\]").first().innerText()).slice(0, 130));

// Answer all three and confirm the answer comes back.
for (let i = 0; i < 3; i++) {
  const box = panel.locator("textarea");
  if (!(await box.count())) break;
  await box.fill(i === 1 ? "I don't know" : "they all run when the enclosing function returns, LIFO");
  await panel.getByRole("button", { name: "Answer", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !document.body.innerText.includes("checking"), null, { timeout: 120000 });
}
check((await panel.innerText()).includes("That's all of them"), "quiz completes after the last question");
check((await page.getByText("Answer hidden while you recall it").count()) === 0,
      "the answer really does come back when the quiz is done");
check((await page.getByRole("button", { name: /Show full answer/ }).count()) > 0, "full answer available again");
await page.screenshot({ path: "/tmp/p-done.png", fullPage: true });
console.log(f ? `${f} FAILURE(S)` : "all checks passed");
await b.close(); process.exit(f ? 1 : 0);
