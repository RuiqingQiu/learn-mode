import { db, newId, now } from "./db";
import type {
  AnswerRecord,
  Density,
  Preferences,
  QuizKind,
  QuizQuestion,
  Reinforcement,
  Confidence,
  ExchangeRecord,
  ExchangeState,
  Mode,
  PredictPrompt,
  PredictionRecord,
  PredictionType,
  TeachTurnRecord,
  ThreadSummary,
  TriageResult,
} from "./types";
import { DEFAULT_PREFERENCES } from "./types";

// ── preferences (§2: single local user, so one row) ────────────────────────

const PREF_ID = "singleton";

export function getPreferences(): Preferences | null {
  const row = db()
    .prepare("SELECT reinforcement, density FROM preferences WHERE id = ?")
    .get(PREF_ID) as { reinforcement: Reinforcement; density: Density } | undefined;
  return row ?? null;
}

/** Null until the setup screen has been completed — that is how onboarding is gated. */
export function getPreferencesOrDefault(): Preferences {
  return getPreferences() ?? DEFAULT_PREFERENCES;
}

export function savePreferences(p: Preferences): void {
  db()
    .prepare(
      `INSERT INTO preferences (id, reinforcement, density, updated_at)
       VALUES (@id, @reinforcement, @density, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         reinforcement = excluded.reinforcement,
         density = excluded.density,
         updated_at = excluded.updated_at`,
    )
    .run({ ...p, id: PREF_ID, updated_at: now() });
}

/** Back to the first-run state, so the setup screen prompts again. */
export function clearPreferences(): void {
  db().prepare("DELETE FROM preferences WHERE id = ?").run(PREF_ID);
}

// ── quiz ────────────────────────────────────────────────────────────────────

export function saveQuizQuestions(
  exchangeId: string,
  kind: QuizKind,
  questions: string[],
): QuizQuestion[] {
  const conn = db();
  conn.prepare("DELETE FROM quiz_questions WHERE exchange_id = ?").run(exchangeId);
  const insert = conn.prepare(
    `INSERT INTO quiz_questions (id, exchange_id, idx, kind, question) VALUES (?, ?, ?, ?, ?)`,
  );
  conn.transaction(() => {
    questions.forEach((q, idx) => insert.run(newId(), exchangeId, idx, kind, q));
  })();
  return getQuiz(exchangeId);
}

export function getQuiz(exchangeId: string): QuizQuestion[] {
  const rows = db()
    .prepare("SELECT * FROM quiz_questions WHERE exchange_id = ? ORDER BY idx")
    .all(exchangeId) as (Omit<QuizQuestion, "was_correct"> & { was_correct: number | null })[];
  return rows.map((r) => ({ ...r, was_correct: r.was_correct === null ? null : !!r.was_correct }));
}

export function saveQuizAnswer(
  questionId: string,
  answer: string,
  feedback: string,
  wasCorrect: boolean | null,
): void {
  db()
    .prepare("UPDATE quiz_questions SET user_answer = ?, feedback = ?, was_correct = ? WHERE id = ?")
    .run(answer, feedback, wasCorrect === null ? null : wasCorrect ? 1 : 0, questionId);
}

// ── threads ─────────────────────────────────────────────────────────────────

export function createThread(title = "New thread"): ThreadSummary {
  const row = { id: newId(), title, created_at: now() };
  db().prepare("INSERT INTO threads (id, title, created_at) VALUES (@id, @title, @created_at)").run(row);
  return { ...row, is_example: false };
}

export function listThreads(): ThreadSummary[] {
  const rows = db()
    .prepare("SELECT id, title, created_at, is_example FROM threads")
    .all() as (Omit<ThreadSummary, "is_example"> & { is_example: number })[];
  const all = rows.map((r) => ({ ...r, is_example: !!r.is_example }));
  // Your own threads newest-first; the examples last, in the order they were
  // written, because they read as a sequence.
  return [
    ...all.filter((t) => !t.is_example).sort((a, b) => b.created_at - a.created_at),
    ...all.filter((t) => t.is_example).sort((a, b) => a.created_at - b.created_at),
  ];
}

export function getThread(id: string): ThreadSummary | null {
  const r = db()
    .prepare("SELECT id, title, created_at, is_example FROM threads WHERE id = ?")
    .get(id) as (Omit<ThreadSummary, "is_example"> & { is_example: number }) | undefined;
  return r ? { ...r, is_example: !!r.is_example } : null;
}

export function deleteThread(id: string): void {
  db().prepare("DELETE FROM threads WHERE id = ?").run(id);
}

/** First question in a thread becomes its title. */
export function titleThreadFromFirstQuestion(threadId: string, question: string): void {
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM exchanges WHERE thread_id = ?").get(threadId) as { n: number };
  if (n !== 1) return;
  const title = question.trim().replace(/\s+/g, " ").slice(0, 70);
  db().prepare("UPDATE threads SET title = ? WHERE id = ?").run(title || "New thread", threadId);
}

// ── exchanges ───────────────────────────────────────────────────────────────

export function createExchange(input: {
  thread_id: string;
  mode: Mode;
  question: string;
  state: ExchangeState;
  triage_result?: TriageResult | null;
  context_exchange_id?: string | null;
}): string {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO exchanges (id, thread_id, mode, question, triage_result, state, created_at, context_exchange_id)
       VALUES (@id, @thread_id, @mode, @question, @triage_result, @state, @created_at, @context_exchange_id)`,
    )
    .run({
      ...input,
      id,
      triage_result: input.triage_result ?? null,
      context_exchange_id: input.context_exchange_id ?? null,
      created_at: now(),
    });
  titleThreadFromFirstQuestion(input.thread_id, input.question);
  return id;
}

export function setExchangeState(id: string, state: ExchangeState): void {
  db().prepare("UPDATE exchanges SET state = ? WHERE id = ?").run(state, id);
}

/**
 * Close out a reveal. Conditional because the user can start explaining back
 * while `full` is still streaming — that must not be reset to `done`.
 */
export function finishRevealing(id: string): void {
  db().prepare("UPDATE exchanges SET state = 'done' WHERE id = ? AND state = 'revealing'").run(id);
}

export function setTriageResult(id: string, result: TriageResult): void {
  db().prepare("UPDATE exchanges SET triage_result = ? WHERE id = ?").run(result, id);
}

interface ExchangeRow {
  id: string;
  thread_id: string;
  mode: Mode;
  question: string;
  triage_result: TriageResult | null;
  state: ExchangeState;
  created_at: number;
  context_exchange_id: string | null;
}

export function getExchangeRow(id: string): ExchangeRow | null {
  return (db().prepare("SELECT * FROM exchanges WHERE id = ?").get(id) as ExchangeRow) ?? null;
}

// ── predictions ─────────────────────────────────────────────────────────────

export function savePredictionPrompt(exchangeId: string, p: PredictPrompt): string {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO predictions (id, exchange_id, type, prompt_text, options)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, exchangeId, p.type, p.prompt_text, p.options ? JSON.stringify(p.options) : null);
  return id;
}

/** `hinted` is owned by markHinted() and deliberately not touched here. */
export function savePredictionResponse(
  predictionId: string,
  r: { text: string | null; confidence: Confidence | null; skipped: boolean },
): void {
  db()
    .prepare("UPDATE predictions SET text = ?, confidence = ?, skipped = ? WHERE id = ?")
    .run(r.text, r.confidence, r.skipped ? 1 : 0, predictionId);
}

export function markHinted(predictionId: string): void {
  db().prepare("UPDATE predictions SET hinted = 1 WHERE id = ?").run(predictionId);
}

/** Model's judgment of the prediction. Feeds the v2 calibration view (§10.5). */
export function setPredictionCorrect(
  predictionId: string,
  wasCorrect: boolean | null,
  correctOption: string | null = null,
): void {
  db()
    .prepare("UPDATE predictions SET was_correct = ?, correct_option = ? WHERE id = ?")
    .run(wasCorrect === null ? null : wasCorrect ? 1 : 0, correctOption, predictionId);
}

export function getPrediction(exchangeId: string): PredictionRecord | null {
  const row = db()
    .prepare("SELECT * FROM predictions WHERE exchange_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(exchangeId) as
    | (Omit<PredictionRecord, "options" | "skipped" | "hinted" | "was_correct"> & {
        options: string | null;
        skipped: number;
        hinted: number;
        was_correct: number | null;
        correct_option: string | null;
      })
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as PredictionType,
    prompt_text: row.prompt_text,
    options: row.options ? JSON.parse(row.options) : null,
    text: row.text,
    confidence: row.confidence,
    skipped: !!row.skipped,
    hinted: !!row.hinted,
    was_correct: row.was_correct === null ? null : !!row.was_correct,
    correct_option: row.correct_option,
  };
}

// ── answers ─────────────────────────────────────────────────────────────────

export function saveAnswer(exchangeId: string, a: AnswerRecord): void {
  db().prepare("DELETE FROM answers WHERE exchange_id = ?").run(exchangeId);
  db()
    .prepare(
      `INSERT INTO answers (id, exchange_id, gist, core, full, delta_held_up, delta_off)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), exchangeId, a.gist, a.core, a.full, a.delta_held_up, a.delta_off);
}

export function getAnswer(exchangeId: string): AnswerRecord | null {
  return (
    (db()
      .prepare("SELECT gist, core, full, delta_held_up, delta_off FROM answers WHERE exchange_id = ?")
      .get(exchangeId) as AnswerRecord) ?? null
  );
}

// ── teaching ────────────────────────────────────────────────────────────────

/** Regenerating a dangling junior turn (see the teach route) replaces it. */
export function replaceTeachTurn(exchangeId: string, idx: number, juniorMsg: string): void {
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM teach_turns WHERE exchange_id = ? AND idx = ?").run(exchangeId, idx);
    conn
      .prepare("INSERT INTO teach_turns (id, exchange_id, idx, junior_msg, user_msg) VALUES (?, ?, ?, ?, NULL)")
      .run(newId(), exchangeId, idx, juniorMsg);
  })();
}

export function setTeachUserMsg(exchangeId: string, idx: number, userMsg: string): void {
  db().prepare("UPDATE teach_turns SET user_msg = ? WHERE exchange_id = ? AND idx = ?").run(userMsg, exchangeId, idx);
}

export function clearTeachTurns(exchangeId: string): void {
  db().prepare("DELETE FROM teach_turns WHERE exchange_id = ?").run(exchangeId);
}

/**
 * The explain-back transcript, packaged for the main chat. The point is not the
 * junior's last question — it is that the user's own answers show where their
 * model is inconsistent, and that is what needs addressing.
 */
export function teachContext(exchangeId: string): string | null {
  const ex = getExchangeRow(exchangeId);
  const answer = getAnswer(exchangeId);
  const turns = getTeachTurns(exchangeId);
  if (!ex || !turns.length) return null;

  const transcript = turns
    .flatMap((t) => [`junior: ${t.junior_msg}`, t.user_msg ? `me: ${t.user_msg}` : null])
    .filter(Boolean)
    .join("\n\n");

  return [
    "<explain-back-transcript>",
    `Topic: ${ex.question}`,
    answer?.gist ? `The answer I was given: ${answer.gist}` : "",
    "",
    transcript,
    "</explain-back-transcript>",
    "",
    "I was explaining this back to a junior and got stuck. Read the transcript — my own",
    "answers are where the gaps are. Address them directly, including any contradiction I",
    "talked myself into, and answer the junior's last question. I need to be able to",
    "explain this in my own words when I go back, so give me the mechanism, not a summary.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function getTeachTurns(exchangeId: string): TeachTurnRecord[] {
  return db()
    .prepare("SELECT idx, junior_msg, user_msg FROM teach_turns WHERE exchange_id = ? ORDER BY idx")
    .all(exchangeId) as TeachTurnRecord[];
}

// ── concepts (§6 — written now, read by nothing yet) ────────────────────────

const slugify = (label: string) =>
  label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function tagExchangeConcepts(exchangeId: string, labels: string[]): void {
  const conn = db();
  const insertConcept = conn.prepare("INSERT OR IGNORE INTO concepts (id, label, slug) VALUES (?, ?, ?)");
  const findConcept = conn.prepare("SELECT id FROM concepts WHERE slug = ?");
  const link = conn.prepare("INSERT OR IGNORE INTO exchange_concepts (exchange_id, concept_id) VALUES (?, ?)");
  conn.transaction((items: string[]) => {
    for (const label of items) {
      const slug = slugify(label);
      if (!slug) continue;
      insertConcept.run(newId(), label.trim(), slug);
      const row = findConcept.get(slug) as { id: string } | undefined;
      if (row) link.run(exchangeId, row.id);
    }
  })(labels);
}

/** Times this concept has come up before — the §6 recurrence signal. */
export function conceptCounts(exchangeId: string): { label: string; count: number }[] {
  return db()
    .prepare(
      `SELECT c.label AS label, (SELECT COUNT(*) FROM exchange_concepts ec2 WHERE ec2.concept_id = c.id) AS count
       FROM exchange_concepts ec JOIN concepts c ON c.id = ec.concept_id
       WHERE ec.exchange_id = ?`,
    )
    .all(exchangeId) as { label: string; count: number }[];
}

// ── reads for the client ────────────────────────────────────────────────────

export function listExchanges(threadId: string): ExchangeRecord[] {
  const rows = db()
    .prepare("SELECT * FROM exchanges WHERE thread_id = ? ORDER BY created_at, rowid")
    .all(threadId) as ExchangeRow[];
  return rows.map((r) => ({
    ...r,
    prediction: getPrediction(r.id),
    answer: getAnswer(r.id),
    teach_turns: getTeachTurns(r.id),
    quiz: getQuiz(r.id),
  }));
}

/**
 * Prior turns in the thread, as plain chat context (§3: history feeds the model,
 * it just does not decide exchange boundaries). Excludes the exchange in flight.
 */
export function threadHistory(threadId: string, excludeExchangeId?: string): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const ex of listExchanges(threadId)) {
    if (ex.id === excludeExchangeId) continue;
    out.push({ role: "user", content: ex.question });
    const a = ex.answer;
    if (!a) continue;
    const assistant = a.gist ? [a.gist, a.core].filter(Boolean).join("\n\n") : (a.full ?? "");
    if (assistant.trim()) out.push({ role: "assistant", content: assistant });
  }
  return out;
}
