import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome" });
let f = 0; const check = (ok, l) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}`); if (!ok) f++; };

async function runWith(label, prefButton, expect, notExpect) {
  const page = await b.newPage({ viewport: { width: 1150, height: 950 } });
  page.on("pageerror", e => { console.log("  [pageerror]", e.message); f++; });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: prefButton }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(800);

  await page.getByTitle("New thread").click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "learn", exact: true }).click();
  await page.locator("textarea").first().fill("Is a Python default argument evaluated once, or once per call?");
  await page.keyboard.press("Enter");
  await page.getByText("what's your current guess", { exact: false }).waitFor({ timeout: 120000 });
  const o = page.locator("main button.w-full");
  if (await o.count()) await o.first().click();
  else await page.locator("main textarea").first().fill("once per call");
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  await page.getByText(expect).waitFor({ timeout: 220000 })
    .then(() => check(true, `${label}: ${expect} launched automatically`))
    .catch(() => check(false, `${label}: ${expect} launched automatically`));
  check((await page.getByText(notExpect).count()) === 0, `${label}: ${notExpect} did not also fire`);
  await page.screenshot({ path: `/tmp/r2-${label}.png`, fullPage: true });
  await page.close();
}

await runWith("probe", /One question, different situation/, "TRANSFER PROBE", "FROM MEMORY");
await runWith("teachback", /Make me explain it back/, "EXPLAINING IT BACK", "TRANSFER PROBE");

console.log(f ? `${f} FAILURE(S)` : "all checks passed");
await b.close(); process.exit(f ? 1 : 0);
