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

/**
 * Each scenario is generated under its own preferences, so the seeded examples
 * actually demonstrate the settings rather than describing them. `pick` chooses
 * which option to commit to — the point of most of these is a *wrong* guess,
 * because that is when the delta has something to say. `freeText` is the fallback
 * when the model chooses an open prediction instead of options, and `skip` is for
 * the pair that exists only to compare formats: skipping means no delta, so the
 * two answers differ in shape and nothing else.
 */
const SCENARIOS = [
  {
    note: "Explain it back · mostly tables & diagrams",
    prefs: { reinforcement: "teach_back", density: "visual" },
    question:
      "Does a defer inside a for loop run at the end of each iteration, or at the end of the function?",
    pick: /iteration/i,
    confidence: "med",
    teach: [
      "They run at the end of the function, not per iteration. The loop body isn't a function so it doesn't trigger them.",
      "Because defer attaches to the function's call frame. A for loop doesn't create a frame, only a function call does.",
      "You'd move the body into its own function — or an immediately-invoked closure — so each iteration has a frame to attach to.",
      "It evaluates the arguments at the moment the defer statement runs, so each one captures its own file handle. Only the timing is wrong.",
    ],
  },
  {
    note: "Quiz me afterwards · mostly tables & diagrams",
    prefs: { reinforcement: "quiz", density: "visual" },
    question: "I want to learn about cassandra db",
    pick: /reject|refus|allow filtering|error/i,
    confidence: "high",
    quiz: {
      kind: "recall",
      answers: [
        "Because the partition key is hashed to pick the node, so without it there's no way to know which node holds the row.",
        "I don't know",
        "You make a second table keyed by the column you want to query, and write to both.",
      ],
    },
  },
  {
    note: "One transfer question · balanced",
    prefs: { reinforcement: "transfer_probe", density: "balanced" },
    question: "Is a Python default argument evaluated once, or once per call?",
    pick: /per call|each call|every call/i,
    freeText: "Once per call — the default expression gets re-evaluated every time you call the function.",
    confidence: "high",
    quiz: {
      kind: "transfer",
      answers: [
        "It would share the same list across calls, so appending in one call shows up in the next.",
      ],
    },
  },
  {
    note: "Same question · mostly prose",
    prefs: { reinforcement: "teach_back", density: "prose" },
    question: "Why does adding an index sometimes make a query slower?",
    skip: true,
  },
  {
    note: "Same question · mostly tables & diagrams",
    prefs: { reinforcement: "teach_back", density: "visual" },
    question: "Why does adding an index sometimes make a query slower?",
    skip: true,
  },
  {
    // Commit history is a graph, so this is where ASCII diagrams earn their place
    // rather than a table being dressed up as one.
    note: "A question that is genuinely a diagram · mostly tables & diagrams",
    prefs: { reinforcement: "teach_back", density: "visual" },
    question: "What is the difference between git merge and git rebase, in terms of what the commit graph ends up looking like?",
    freeText: "Merge keeps both branches and adds a commit joining them; rebase moves my commits on top of the other branch so it looks linear.",
    confidence: "med",
  },
  {
    note: "Triage bailed out — nothing here to predict",
    prefs: { reinforcement: "teach_back", density: "balanced" },
    question: "What's the flag to make rsync preserve symlinks?",
    expectLookup: true,
  },
];

async function build() {
  const made = [];

  for (const sc of SCENARIOS) {
    log(`${sc.note}  —  ${sc.question.slice(0, 48)}`);
    await post("/api/preferences", sc.prefs);

    const { thread } = await (await post("/api/threads", {})).json();
    const { exchangeId, predictionId, prompt, triage } = await ask(thread.id, sc.question, "learn");

    if (sc.expectLookup) {
      if (triage !== "lookup") console.warn("   ! triage returned", triage, "— this example will not show the lookup path");
      made.push({ id: thread.id, note: sc.note });
      continue;
    }
    if (!predictionId) throw new Error(`no prediction for: ${sc.question}`);

    if (sc.skip) {
      await post("/api/exchange", { action: "skip_prediction", predictionId });
    } else {
      const chosen = prompt.options?.length
        ? ((sc.pick && prompt.options.find((o) => sc.pick.test(o.label))?.id) ?? prompt.options[0].id)
        : sc.freeText;
      if (!chosen) throw new Error(`no answer to commit for: ${sc.question}`);
      await post("/api/exchange", {
        action: "submit_prediction", predictionId, text: chosen, confidence: sc.confidence ?? "med",
      });
    }
    await reveal(exchangeId);

    if (sc.teach) {
      await post("/api/exchange", { action: "start_teaching", exchangeId });
      await sse("/api/teach", { exchangeId }, () => {});
      for (const userMsg of sc.teach) await sse("/api/teach", { exchangeId, userMsg }, () => {});
    }

    if (sc.quiz) {
      const { questions } = await (
        await post("/api/quiz", { action: "start", exchangeId, kind: sc.quiz.kind })
      ).json();
      for (const [i, q] of (questions ?? []).entries()) {
        await post("/api/quiz", {
          action: "answer", exchangeId, questionId: q.id, text: sc.quiz.answers[i] ?? "not sure",
        });
      }
    }

    made.push({ id: thread.id, note: sc.note });
  }

  // Leave the scratch DB without preferences, so a fresh boot shows the setup step.
  await fetch(B + "/api/preferences", { method: "DELETE" });
  return made;
}

const made = await build();

// Dump exactly what the pipeline produced.
const db = new Database(process.env.LEARN_DB_PATH ?? "./data/learn.db", { readonly: true });
const pick = (sql, ...a) => db.prepare(sql).all(...a);
const payload = made.map(({ id: tid, note }) => {
  const thread = db.prepare("SELECT id, title, created_at FROM threads WHERE id = ?").get(tid);
  const exchanges = pick("SELECT * FROM exchanges WHERE thread_id = ? ORDER BY created_at", tid).map((e) => ({
    exchange: e,
    predictions: pick("SELECT * FROM predictions WHERE exchange_id = ?", e.id),
    answers: pick("SELECT * FROM answers WHERE exchange_id = ?", e.id),
    teach_turns: pick("SELECT * FROM teach_turns WHERE exchange_id = ? ORDER BY idx", e.id),
    quiz: pick("SELECT * FROM quiz_questions WHERE exchange_id = ? ORDER BY idx", e.id),
  }));
  return { thread, note, exchanges };
});

const out = `// GENERATED by scripts/generate-examples.mjs — do not edit by hand.
//
// Real output from the real pipeline, captured once and seeded on first run so
// the app is not an empty box. Regenerate with \`npm run gen:examples\` if a
// prompt change makes these misrepresent what the product actually does.

export interface SeedThread {
  thread: { id: string; title: string; created_at: number };
  /** Which preference combination this example demonstrates. */
  note: string;
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
