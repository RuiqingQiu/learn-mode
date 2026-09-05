/**
 * Regenerates src/lib/examples.ts by running the real pipeline once and dumping
 * what it produced. The seeded examples are genuine output, not hand-written
 * imitations — if a prompt changes enough that the examples misrepresent the
 * product, rerun this.
 *
 *   npm run dev            # in another shell, with a scratch DB
 *   npm run gen:examples
 *
 * Costs roughly $0.50 in API calls and takes a couple of minutes.
 */
import Database from "better-sqlite3";
import fs from "node:fs";

const B = process.env.SMOKE_URL ?? "http://localhost:3000";
const post = (p, b) =>
  fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

async function sse(path, body, onEv) {
  const res = await post(path, body);
  const r = res.body.getReader();
  const d = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    buf += d.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const l of frame.split("\n")) if (l.startsWith("data: ")) onEv(JSON.parse(l.slice(6)));
    }
  }
}

const log = (...a) => console.log("  ", ...a);

async function ask(threadId, question, mode) {
  let exchangeId, predictionId, prompt, triage;
  await sse("/api/ask", { threadId, question, mode }, (e) => {
    if (e.type === "exchange") exchangeId = e.exchangeId;
    if (e.type === "triage") triage = e.result;
    if (e.type === "predict") ({ predictionId, prompt } = e);
    if (e.type === "error") throw new Error(e.message);
  });
  return { exchangeId, predictionId, prompt, triage };
}

const reveal = (exchangeId) => sse("/api/reveal", { exchangeId }, () => {});

async function build() {
  const ids = [];

  // 1 — a wrong prediction, the full delta, then the whole protégé arc.
  {
    log("example 1: defer in a loop (wrong guess -> delta -> explain it back)");
    const { thread } = await (await post("/api/threads", {})).json();
    ids.push(thread.id);
    const q = "Does a defer inside a for loop run at the end of each iteration, or at the end of the function?";
    const { exchangeId, predictionId, prompt } = await ask(thread.id, q, "learn");
    // Take the option that matches the common wrong belief, so the delta has work to do.
    const wrong =
      prompt.options?.find((o) => /iteration/i.test(o.label))?.id ?? prompt.options?.[0]?.id ?? "";
    await post("/api/exchange", {
      action: "submit_prediction", predictionId, text: wrong, confidence: "med",
    });
    await reveal(exchangeId);
    await post("/api/exchange", { action: "start_teaching", exchangeId });

    const replies = [
      "They run at the end of the function, not per iteration. The loop body isn't a function so it doesn't trigger them.",
      "Because defer attaches to the function's call frame. A for loop doesn't create a frame, only a function call does.",
      "You'd move the body into its own function — or an immediately-invoked closure — so each iteration has a frame to attach to.",
      "It evaluates the arguments at the moment the defer statement runs, so each one captures its own file handle. Only the timing is wrong.",
    ];
    await sse("/api/teach", { exchangeId }, () => {});
    for (const userMsg of replies) await sse("/api/teach", { exchangeId, userMsg }, () => {});
  }

  // 2 — a broad topic narrowed to one concept, a correct guess, then a quiz.
  {
    log("example 2: broad topic narrowed, correct guess -> quiz");
    const { thread } = await (await post("/api/threads", {})).json();
    ids.push(thread.id);
    const { exchangeId, predictionId, prompt } = await ask(
      thread.id, "I want to learn about cassandra db", "learn",
    );
    const right =
      prompt.options?.find((o) => /reject|refus|allow filtering|error/i.test(o.label))?.id ??
      prompt.options?.[0]?.id ?? "";
    await post("/api/exchange", {
      action: "submit_prediction", predictionId, text: right, confidence: "high",
    });
    await reveal(exchangeId);

    const { questions } = await (await post("/api/quiz", { action: "start", exchangeId, kind: "recall" })).json();
    const answers = [
      "Because the partition key is hashed to pick the node, so without it there's no way to know which node holds the row.",
      "I don't know",
      "You make a second table keyed by the column you want to query, and write to both.",
    ];
    for (const [i, q] of (questions ?? []).entries()) {
      await post("/api/quiz", { action: "answer", exchangeId, questionId: q.id, text: answers[i] ?? "not sure" });
    }
  }

  // 3 — Learn mode on, but triage says this one has nothing to predict.
  {
    log("example 3: learn mode on a pure lookup -> straight answer");
    const { thread } = await (await post("/api/threads", {})).json();
    ids.push(thread.id);
    const { triage } = await ask(thread.id, "What's the flag to make rsync preserve symlinks?", "learn");
    if (triage !== "lookup") console.warn("   ! triage returned", triage, "— example 3 will not show the lookup path");
  }

  return ids;
}

const threadIds = await build();

// Dump exactly what the pipeline produced.
const db = new Database(process.env.LEARN_DB_PATH ?? "./data/learn.db", { readonly: true });
const pick = (sql, ...a) => db.prepare(sql).all(...a);
const payload = threadIds.map((tid) => {
  const thread = db.prepare("SELECT id, title, created_at FROM threads WHERE id = ?").get(tid);
  const exchanges = pick("SELECT * FROM exchanges WHERE thread_id = ? ORDER BY created_at", tid).map((e) => ({
    exchange: e,
    predictions: pick("SELECT * FROM predictions WHERE exchange_id = ?", e.id),
    answers: pick("SELECT * FROM answers WHERE exchange_id = ?", e.id),
    teach_turns: pick("SELECT * FROM teach_turns WHERE exchange_id = ? ORDER BY idx", e.id),
    quiz: pick("SELECT * FROM quiz_questions WHERE exchange_id = ? ORDER BY idx", e.id),
  }));
  return { thread, exchanges };
});

const out = `// GENERATED by scripts/generate-examples.mjs — do not edit by hand.
//
// Real output from the real pipeline, captured once and seeded on first run so
// the app is not an empty box. Regenerate with \`npm run gen:examples\` if a
// prompt change makes these misrepresent what the product actually does.

export interface SeedThread {
  thread: { id: string; title: string; created_at: number };
  exchanges: {
    exchange: Record<string, unknown>;
    predictions: Record<string, unknown>[];
    answers: Record<string, unknown>[];
    teach_turns: Record<string, unknown>[];
    quiz: Record<string, unknown>[];
  }[];
}

export const EXAMPLE_THREADS: SeedThread[] = ${JSON.stringify(payload, null, 2)};
`;
fs.writeFileSync("src/lib/examples.ts", out);
console.log(`\nwrote src/lib/examples.ts — ${payload.length} threads, ${out.length} bytes`);
