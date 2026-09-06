import { db, newId, now } from "./db";
import type {
  AnswerRecord,
  Challenge,
  ChallengeSource,
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
  ShadowRecord,
  TeachTurnRecord,
  ThreadSummary,
  TriageResult,
  AnswerEvaluationRecord,
  AnswerRating,
  CourseRecord,
  CourseSessionRecord,
  CourseTopicRecord,
  CourseTurn,
  EnrollmentRecord,
  SessionSummary,
  TopicProgressRecord,
  TopicStatus,
  WeakArea,
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
  return { ...row, is_example: false, example_note: null };
}

export function listThreads(): ThreadSummary[] {
  const rows = db()
    .prepare("SELECT id, title, created_at, is_example, example_note FROM threads")
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
    .prepare("SELECT id, title, created_at, is_example, example_note FROM threads WHERE id = ?")
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

// ── skill shadow ────────────────────────────────────────────────────────────

/**
 * Claude's parallel solution, written before the user commits. Upsert, because
 * /api/ask may legitimately run twice for one exchange if the client retries.
 */
export function saveShadowSolution(exchangeId: string, solution: string): void {
  db()
    .prepare(
      `INSERT INTO shadow_solutions (exchange_id, solution) VALUES (?, ?)
       ON CONFLICT(exchange_id) DO UPDATE SET solution = excluded.solution`,
    )
    .run(exchangeId, solution);
}

export function saveShadowDiff(
  exchangeId: string,
  d: { summary: string; axes: string; strong_point: string; probe_scenario: string; probe_question: string },
): void {
  db()
    .prepare(
      `UPDATE shadow_solutions
       SET summary = ?, axes = ?, strong_point = ?, probe_scenario = ?, probe_question = ?
       WHERE exchange_id = ?`,
    )
    .run(d.summary, d.axes, d.strong_point, d.probe_scenario, d.probe_question, exchangeId);
}

export function saveShadowProbeAnswer(exchangeId: string, answer: string, feedback: string): void {
  db()
    .prepare("UPDATE shadow_solutions SET probe_answer = ?, probe_feedback = ? WHERE exchange_id = ?")
    .run(answer, feedback, exchangeId);
}

export function getShadow(exchangeId: string): ShadowRecord | null {
  const row =
    (db()
      .prepare(
        `SELECT solution, summary, axes, strong_point, probe_scenario, probe_question,
                probe_answer, probe_feedback
         FROM shadow_solutions WHERE exchange_id = ?`,
      )
      .get(exchangeId) as Omit<ShadowRecord, "ready">) ?? null;
  return row ? { ...row, ready: !!row.solution } : null;
}

/**
 * Claude's solution must not reach the browser before the user has committed —
 * otherwise the blurred panel is a CSS effect anyone can defeat in devtools
 * rather than a real boundary. `ready` survives so the UI can still say whether
 * Claude has finished.
 */
function redactShadow(shadow: ShadowRecord | null, prediction: PredictionRecord | null): ShadowRecord | null {
  if (!shadow) return null;
  const earned = !!prediction && (prediction.text !== null || prediction.skipped);
  return earned ? shadow : { ...shadow, solution: null };
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

// ── delayed transfer challenge ──────────────────────────────────────────────

/**
 * The oldest miss that has never been re-tested.
 *
 * `t.is_example = 0` is the honesty clause: the seeded worked examples contain a
 * wrong prediction, and telling someone "earlier you missed this" about a miss
 * they did not make would poison the one line in the product that has to be true.
 */
export function pendingChallengeSource(excludeExchangeId?: string): ChallengeSource | null {
  const row = db()
    .prepare(
      `SELECT p.id            AS predictionId,
              e.id            AS sourceExchangeId,
              e.question      AS sourceQuestion,
              p.text          AS believed,
              COALESCE(a.delta_off, sh.probe_scenario, '') AS correction,
              e.created_at    AS createdAt
       FROM predictions p
       JOIN exchanges e ON e.id = p.exchange_id
       JOIN threads   t ON t.id = e.thread_id
       LEFT JOIN answers          a  ON a.exchange_id  = e.id
       LEFT JOIN shadow_solutions sh ON sh.exchange_id = e.id
       WHERE p.was_correct = 0
         AND p.skipped = 0
         AND p.challenged_at IS NULL
         AND p.text IS NOT NULL
         AND t.is_example = 0
         AND e.id != ?
       ORDER BY e.created_at ASC
       LIMIT 1`,
    )
    .get(excludeExchangeId ?? "") as ChallengeSource | undefined;
  return row ?? null;
}

/** Stamped at generation time, so a belief is re-tested at most once. */
export function createChallenge(src: ChallengeSource, question: string): Challenge {
  const id = newId();
  const created = now();
  const conn = db();
  conn.transaction(() => {
    conn
      .prepare(
        `INSERT INTO challenges (id, prediction_id, source_exchange_id, question, reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, src.predictionId, src.sourceExchangeId, question, src.correction, created);
    conn.prepare("UPDATE predictions SET challenged_at = ? WHERE id = ?").run(created, src.predictionId);
  })();
  return {
    id,
    question,
    sourceQuestion: src.sourceQuestion,
    believed: src.believed,
    createdAt: created,
    user_answer: null,
    feedback: null,
    was_correct: null,
  };
}

/** The one waiting to be answered, if any. */
export function openChallenge(): Challenge | null {
  const row = db()
    .prepare(
      `SELECT c.id, c.question, c.created_at AS createdAt, c.user_answer, c.feedback, c.was_correct,
              e.question AS sourceQuestion, p.text AS believed
       FROM challenges c
       JOIN predictions p ON p.id = c.prediction_id
       JOIN exchanges   e ON e.id = c.source_exchange_id
       WHERE c.user_answer IS NULL
       ORDER BY c.created_at DESC
       LIMIT 1`,
    )
    .get() as (Omit<Challenge, "was_correct"> & { was_correct: number | null }) | undefined;
  return row ? { ...row, was_correct: row.was_correct === null ? null : !!row.was_correct } : null;
}

export function getChallenge(id: string): { id: string; question: string; reference: string } | null {
  return (
    (db().prepare("SELECT id, question, reference FROM challenges WHERE id = ?").get(id) as {
      id: string;
      question: string;
      reference: string;
    }) ?? null
  );
}

export function saveChallengeAnswer(
  id: string,
  answer: string,
  feedback: string,
  wasCorrect: boolean | null,
): void {
  db()
    .prepare("UPDATE challenges SET user_answer = ?, feedback = ?, was_correct = ? WHERE id = ?")
    .run(answer, feedback, wasCorrect === null ? null : wasCorrect ? 1 : 0, id);
}

// ── reads for the client ────────────────────────────────────────────────────

export function listExchanges(threadId: string): ExchangeRecord[] {
  const rows = db()
    .prepare("SELECT * FROM exchanges WHERE thread_id = ? ORDER BY created_at, rowid")
    .all(threadId) as ExchangeRow[];
  return rows.map((r) => {
    const prediction = getPrediction(r.id);
    return {
      ...r,
      prediction,
      answer: getAnswer(r.id),
      teach_turns: getTeachTurns(r.id),
      quiz: getQuiz(r.id),
      shadow: redactShadow(getShadow(r.id), prediction),
    };
  });
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

// ── courses (shareable.md §4) ───────────────────────────────────────────────
//
// The app owns the bookkeeping so nobody hand-edits a progress file to know
// where they left off. Everything the model writes lands here, from the route,
// as the tutor stream is parsed — the client never writes progress.

const STATUSES: TopicStatus[] = ["not_started", "in_progress", "completed", "needs_review"];
const RATINGS: AnswerRating[] = ["strong", "partial", "weak", "skipped"];

/** The status/rating columns carry no CHECK constraint (see db.ts). Enforced here. */
const asStatus = (v: string): TopicStatus =>
  (STATUSES as string[]).includes(v) ? (v as TopicStatus) : "not_started";
const asRating = (v: string): AnswerRating =>
  (RATINGS as string[]).includes(v) ? (v as AnswerRating) : "partial";

interface CourseRow {
  id: string;
  title: string;
  subject: string;
  level: string;
  author: string | null;
  description: string;
  config: string;
  topics: string;
  body: string;
  version: number;
  published_at: number;
}

const toCourse = (r: CourseRow): CourseRecord => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  level: r.level,
  author: r.author,
  description: r.description,
  config: JSON.parse(r.config),
  topics: JSON.parse(r.topics),
  body: r.body,
  version: r.version,
  published_at: r.published_at,
});

const COURSE_COLS = `id, title, subject, level, author, description, config, topics, body, version, published_at`;

export function listCourses(filter?: { subject?: string; level?: string }): CourseRecord[] {
  const where: string[] = [];
  const args: string[] = [];
  if (filter?.subject) {
    where.push("subject = ?");
    args.push(filter.subject);
  }
  if (filter?.level) {
    where.push("level = ?");
    args.push(filter.level);
  }
  const rows = db()
    .prepare(
      `SELECT ${COURSE_COLS} FROM courses
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY subject, title`,
    )
    .all(...args) as CourseRow[];
  return rows.map(toCourse);
}

export function getCourse(id: string): CourseRecord | null {
  const row = db().prepare(`SELECT ${COURSE_COLS} FROM courses WHERE id = ?`).get(id) as
    | CourseRow
    | undefined;
  return row ? toCourse(row) : null;
}

/** Publishing from the author page. The boot-time seeder has its own upsert in db.ts. */
export function upsertCourse(
  c: { id: string; title: string; subject: string; level: string; author?: string; description: string },
  config: unknown,
  topics: unknown,
  body: string,
  sourceHash: string,
): CourseRecord {
  db()
    .prepare(
      `INSERT INTO courses (id, title, subject, level, author, description, config, topics, body,
                            version, source_hash, published_at)
       VALUES (@id, @title, @subject, @level, @author, @description, @config, @topics, @body,
               1, @source_hash, @published_at)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, subject = excluded.subject, level = excluded.level,
         author = excluded.author, description = excluded.description,
         config = excluded.config, topics = excluded.topics, body = excluded.body,
         version = courses.version + 1,
         source_hash = excluded.source_hash, published_at = excluded.published_at`,
    )
    .run({
      id: c.id,
      title: c.title,
      subject: c.subject,
      level: c.level,
      author: c.author ?? null,
      description: c.description,
      config: JSON.stringify(config),
      topics: JSON.stringify(topics),
      body,
      source_hash: sourceHash,
      published_at: now(),
    });
  return getCourse(c.id)!;
}

export function getEnrollmentById(id: string): EnrollmentRecord | null {
  const row = db()
    .prepare(`SELECT id, course_id, started_at, last_session_at FROM enrollments WHERE id = ?`)
    .get(id) as EnrollmentRecord | undefined;
  return row ?? null;
}

export function getEnrollment(courseId: string): EnrollmentRecord | null {
  const row = db()
    .prepare(`SELECT id, course_id, started_at, last_session_at FROM enrollments WHERE course_id = ?`)
    .get(courseId) as EnrollmentRecord | undefined;
  return row ?? null;
}

/** Idempotent — one enrollment per course, because there is one local user (§2). */
export function enroll(courseId: string): EnrollmentRecord {
  const existing = getEnrollment(courseId);
  if (existing) return existing;
  const id = newId();
  db()
    .prepare(`INSERT INTO enrollments (id, course_id, started_at) VALUES (?, ?, ?)`)
    .run(id, courseId, now());
  return getEnrollment(courseId)!;
}

interface ProgressRow {
  topic_id: string;
  status: string;
  score: number | null;
  attempts: number;
  checkpoints_met: string;
  weak_areas: string;
  updated_at: number;
}

const toProgress = (r: ProgressRow): TopicProgressRecord => ({
  topic_id: r.topic_id,
  status: asStatus(r.status),
  score: r.score,
  attempts: r.attempts,
  checkpoints_met: JSON.parse(r.checkpoints_met),
  weak_areas: JSON.parse(r.weak_areas),
  updated_at: r.updated_at,
});

const PROGRESS_COLS = `topic_id, status, score, attempts, checkpoints_met, weak_areas, updated_at`;

export function topicProgress(enrollmentId: string): TopicProgressRecord[] {
  const rows = db()
    .prepare(`SELECT ${PROGRESS_COLS} FROM topic_progress WHERE enrollment_id = ?`)
    .all(enrollmentId) as ProgressRow[];
  return rows.map(toProgress);
}

export function progressForTopic(enrollmentId: string, topicId: string): TopicProgressRecord | null {
  const row = db()
    .prepare(`SELECT ${PROGRESS_COLS} FROM topic_progress WHERE enrollment_id = ? AND topic_id = ?`)
    .get(enrollmentId, topicId) as ProgressRow | undefined;
  return row ? toProgress(row) : null;
}

/** Creates the row on first touch. Every progress write goes through this. */
function ensureProgress(enrollmentId: string, topicId: string): TopicProgressRecord {
  db()
    .prepare(
      `INSERT OR IGNORE INTO topic_progress (id, enrollment_id, topic_id, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(newId(), enrollmentId, topicId, now());
  return progressForTopic(enrollmentId, topicId)!;
}

export function markCheckpoints(enrollmentId: string, topicId: string, indices: number[]): number[] {
  const current = ensureProgress(enrollmentId, topicId);
  const merged = [...new Set([...current.checkpoints_met, ...indices])].sort((a, b) => a - b);
  db()
    .prepare(
      `UPDATE topic_progress SET checkpoints_met = ?, updated_at = ?
       WHERE enrollment_id = ? AND topic_id = ?`,
    )
    .run(JSON.stringify(merged), now(), enrollmentId, topicId);
  return merged;
}

/**
 * Increments the count for each tag. Callers pass only tags that survived the
 * authored-taxonomy filter — the model does not get to widen the vocabulary,
 * because free-text tags are what stopped the old progress.json from adding up.
 */
export function bumpWeakAreas(
  enrollmentId: string,
  topicId: string,
  tags: string[],
  note?: string | null,
): WeakArea[] {
  if (!tags.length) return ensureProgress(enrollmentId, topicId).weak_areas;
  const current = ensureProgress(enrollmentId, topicId);
  const at = now();
  const byTag = new Map(current.weak_areas.map((w) => [w.tag, { ...w }]));
  for (const tag of tags) {
    const existing = byTag.get(tag);
    if (existing) {
      existing.seenCount += 1;
      existing.lastSeenAt = at;
      if (note) existing.note = note;
    } else {
      byTag.set(tag, { tag, note: note ?? null, seenCount: 1, lastSeenAt: at });
    }
  }
  const merged = [...byTag.values()].sort((a, b) => b.seenCount - a.seenCount || a.tag.localeCompare(b.tag));
  db()
    .prepare(
      `UPDATE topic_progress SET weak_areas = ?, updated_at = ?
       WHERE enrollment_id = ? AND topic_id = ?`,
    )
    .run(JSON.stringify(merged), at, enrollmentId, topicId);
  return merged;
}

export function setTopicInProgress(enrollmentId: string, topicId: string): void {
  ensureProgress(enrollmentId, topicId);
  // Never demote a finished topic back to in_progress on a re-attempt read.
  db()
    .prepare(
      `UPDATE topic_progress SET status = 'in_progress', updated_at = ?
       WHERE enrollment_id = ? AND topic_id = ? AND status = 'not_started'`,
    )
    .run(now(), enrollmentId, topicId);
}

// ── course sessions ────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  enrollment_id: string;
  topic_id: string;
  started_at: number;
  ended_at: number | null;
  transcript: string;
  summary: string | null;
  course_id: string;
}

function toSession(r: SessionRow): CourseSessionRecord {
  return {
    id: r.id,
    enrollment_id: r.enrollment_id,
    course_id: r.course_id,
    topic_id: r.topic_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    transcript: JSON.parse(r.transcript),
    summary: r.summary ? JSON.parse(r.summary) : null,
    evaluations: getEvaluations(r.id),
  };
}

const SESSION_SQL = `SELECT s.id, s.enrollment_id, s.topic_id, s.started_at, s.ended_at,
                            s.transcript, s.summary, e.course_id
                     FROM course_sessions s JOIN enrollments e ON e.id = s.enrollment_id`;

export function startSession(enrollmentId: string, topicId: string): CourseSessionRecord {
  const id = newId();
  const at = now();
  db().transaction(() => {
    db()
      .prepare(`INSERT INTO course_sessions (id, enrollment_id, topic_id, started_at) VALUES (?, ?, ?, ?)`)
      .run(id, enrollmentId, topicId, at);
    db().prepare(`UPDATE enrollments SET last_session_at = ? WHERE id = ?`).run(at, enrollmentId);
  })();
  setTopicInProgress(enrollmentId, topicId);
  return getCourseSession(id)!;
}

export function getCourseSession(id: string): CourseSessionRecord | null {
  const row = db().prepare(`${SESSION_SQL} WHERE s.id = ?`).get(id) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

/** The one still open for a topic, so `Leave for now` can be resumed. */
export function openSessionFor(enrollmentId: string, topicId: string): CourseSessionRecord | null {
  const row = db()
    .prepare(
      `${SESSION_SQL} WHERE s.enrollment_id = ? AND s.topic_id = ? AND s.ended_at IS NULL
       ORDER BY s.started_at DESC LIMIT 1`,
    )
    .get(enrollmentId, topicId) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function listCourseSessions(enrollmentId: string): CourseSessionRecord[] {
  const rows = db()
    .prepare(`${SESSION_SQL} WHERE s.enrollment_id = ? ORDER BY s.started_at DESC`)
    .all(enrollmentId) as SessionRow[];
  return rows.map(toSession);
}

/** The last finished session on a topic, for the `<last-session>` context block. */
export function lastSummaryFor(enrollmentId: string, topicId: string): SessionSummary | null {
  const row = db()
    .prepare(
      `SELECT summary FROM course_sessions
       WHERE enrollment_id = ? AND topic_id = ? AND summary IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(enrollmentId, topicId) as { summary: string } | undefined;
  return row ? JSON.parse(row.summary) : null;
}

export function appendTranscript(sessionId: string, turns: CourseTurn[]): void {
  if (!turns.length) return;
  const row = db()
    .prepare(`SELECT transcript FROM course_sessions WHERE id = ?`)
    .get(sessionId) as { transcript: string } | undefined;
  if (!row) return;
  const next = [...(JSON.parse(row.transcript) as CourseTurn[]), ...turns];
  db().prepare(`UPDATE course_sessions SET transcript = ? WHERE id = ?`).run(JSON.stringify(next), sessionId);
}

export function getEvaluations(sessionId: string): AnswerEvaluationRecord[] {
  const rows = db()
    .prepare(
      `SELECT id, question_index, question, rating, gaps, note FROM answer_evaluations
       WHERE session_id = ? ORDER BY question_index`,
    )
    .all(sessionId) as {
    id: string;
    question_index: number;
    question: string;
    rating: string;
    gaps: string;
    note: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    question_index: r.question_index,
    question: r.question,
    rating: asRating(r.rating),
    gaps: JSON.parse(r.gaps),
    note: r.note,
  }));
}

/** Upsert on (session, questionIndex) so a re-run of a turn corrects rather than duplicates. */
export function recordEvaluation(
  sessionId: string,
  e: { questionIndex: number; question: string; rating: AnswerRating; gaps: string[]; note: string | null },
): void {
  db()
    .prepare(
      `INSERT INTO answer_evaluations (id, session_id, question_index, question, rating, gaps, note)
       VALUES (@id, @session_id, @question_index, @question, @rating, @gaps, @note)
       ON CONFLICT(session_id, question_index) DO UPDATE SET
         question = excluded.question, rating = excluded.rating,
         gaps = excluded.gaps, note = excluded.note`,
    )
    .run({
      id: newId(),
      session_id: sessionId,
      question_index: e.questionIndex,
      question: e.question,
      rating: e.rating,
      gaps: JSON.stringify(e.gaps),
      note: e.note,
    });
}

/**
 * The wrap-up. §9's open question 2 is answered here: the model's self-reported
 * score is trusted, but every per-answer rating is already persisted, so a
 * recomputed score can be added later without a migration. `fallbackScore` is
 * derived from the rating histogram and used only when the model did not emit
 * a usable one.
 */
export function finishTopic(
  sessionId: string,
  summary: SessionSummary,
  cfg: { mastery_scale: number; review_threshold: number },
): void {
  const session = getCourseSession(sessionId);
  if (!session) return;
  const score = Math.max(1, Math.min(cfg.mastery_scale, Math.round(summary.score)));
  const status: TopicStatus = score <= cfg.review_threshold ? "needs_review" : "completed";
  const at = now();

  ensureProgress(session.enrollment_id, session.topic_id);
  db().transaction(() => {
    db()
      .prepare(`UPDATE course_sessions SET summary = ?, ended_at = ? WHERE id = ?`)
      .run(JSON.stringify({ ...summary, score }), at, sessionId);
    db()
      .prepare(
        `UPDATE topic_progress SET status = ?, score = ?, attempts = attempts + 1, updated_at = ?
         WHERE enrollment_id = ? AND topic_id = ?`,
      )
      .run(status, score, at, session.enrollment_id, session.topic_id);
  })();
}

/** Rating histogram → a score on the course's scale, when the model gave none. */
export function derivedScore(sessionId: string, masteryScale: number): number {
  const evals = getEvaluations(sessionId).filter((e) => e.rating !== "skipped");
  if (!evals.length) return 1;
  const weight = { strong: 1, partial: 0.5, weak: 0 } as const;
  const mean =
    evals.reduce((sum, e) => sum + weight[e.rating as "strong" | "partial" | "weak"], 0) / evals.length;
  return Math.max(1, Math.round(mean * masteryScale));
}

/**
 * Everything the tutor call needs, assembled server-side. Modelled on
 * teachContext() above, which does the same job for the protégé transcript.
 */
export function tutorContext(sessionId: string): {
  session: CourseSessionRecord;
  course: CourseRecord;
  topic: CourseTopicRecord;
  progress: TopicProgressRecord | null;
  prereqs: { topic: CourseTopicRecord; progress: TopicProgressRecord | null }[];
  lastSummary: SessionSummary | null;
} | null {
  const session = getCourseSession(sessionId);
  if (!session) return null;
  const course = getCourse(session.course_id);
  if (!course) return null;
  const topic = course.topics.find((t) => t.id === session.topic_id);
  if (!topic) return null;

  const byId = new Map(course.topics.map((t) => [t.id, t]));
  return {
    session,
    course,
    topic,
    progress: progressForTopic(session.enrollment_id, session.topic_id),
    prereqs: topic.prereqs
      .map((id) => byId.get(id))
      .filter((t): t is CourseTopicRecord => !!t)
      .map((t) => ({ topic: t, progress: progressForTopic(session.enrollment_id, t.id) })),
    lastSummary: lastSummaryFor(session.enrollment_id, session.topic_id),
  };
}

/** §6's notes view: weak areas aggregated across topics, plus every session summary. */
export function notesFor(enrollmentId: string): {
  weakAreas: (WeakArea & { topicId: string })[];
  sessions: CourseSessionRecord[];
} {
  const weakAreas = topicProgress(enrollmentId)
    .flatMap((p) => p.weak_areas.map((w) => ({ ...w, topicId: p.topic_id })))
    .sort((a, b) => b.seenCount - a.seenCount || b.lastSeenAt - a.lastSeenAt);
  return { weakAreas, sessions: listCourseSessions(enrollmentId).filter((s) => s.summary) };
}

/**
 * Carries a pre-app progress.json across. Imported tags are stored verbatim even
 * when they fall outside the authored taxonomy: this is a record of what
 * happened, not a new evaluation, and rewriting it would be a lie about history.
 * They are flagged so the notes view can say where they came from.
 */
export function importProgress(
  enrollmentId: string,
  data: {
    topics: Record<
      string,
      { status?: string; score?: number | null; attempts?: number; weak_areas?: string[] }
    >;
    last_session?: string;
  },
  knownTopicIds: string[],
): { imported: number; skipped: string[] } {
  const known = new Set(knownTopicIds);
  const lastSeenAt = data.last_session ? Date.parse(data.last_session) || now() : now();
  const skipped: string[] = [];
  let imported = 0;

  const stmt = db().prepare(
    `INSERT INTO topic_progress (id, enrollment_id, topic_id, status, score, attempts,
                                 checkpoints_met, weak_areas, updated_at)
     VALUES (@id, @enrollment_id, @topic_id, @status, @score, @attempts, '[]', @weak_areas, @updated_at)
     ON CONFLICT(enrollment_id, topic_id) DO UPDATE SET
       status = excluded.status, score = excluded.score, attempts = excluded.attempts,
       -- Authoritative about the topic's history, checkpoints included: keeping
       -- the old ones would leave a row claiming "not started" and "3/3
       -- demonstrated" at once.
       checkpoints_met = excluded.checkpoints_met,
       weak_areas = excluded.weak_areas, updated_at = excluded.updated_at`,
  );

  db().transaction(() => {
    for (const [topicId, t] of Object.entries(data.topics ?? {})) {
      if (!known.has(topicId)) {
        skipped.push(topicId);
        continue;
      }
      const weak: WeakArea[] = (t.weak_areas ?? []).map((tag) => ({
        tag,
        note: null,
        seenCount: 1,
        lastSeenAt,
        imported: true,
      }));
      stmt.run({
        id: newId(),
        enrollment_id: enrollmentId,
        topic_id: topicId,
        // The pre-app file used hyphens; the app uses underscores.
        status: asStatus((t.status ?? "not_started").replace(/-/g, "_")),
        score: t.score ?? null,
        attempts: t.attempts ?? 0,
        weak_areas: JSON.stringify(weak),
        updated_at: lastSeenAt,
      });
      imported += 1;
    }
  })();

  return { imported, skipped };
}
