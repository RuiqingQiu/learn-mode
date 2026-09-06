import Database from "better-sqlite3";
import { EXAMPLE_THREADS } from "./examples";
import { courseHash, validateCourse } from "./course";
import fs from "node:fs";
import path from "node:path";

// Single local user, single file. §2: no accounts, no auth.
//
// On Vercel the filesystem is read-only apart from /tmp, and /tmp is neither
// shared between concurrent lambdas nor preserved between cold starts. Pointing
// there keeps the app *working* — a warm instance behaves normally — but the
// data is genuinely ephemeral: threads, predictions and the §10.5 calibration
// rows all vanish when the instance recycles. That tradeoff was chosen
// deliberately; see the Deploying section of README.md for what to move to.
const DB_PATH =
  process.env.LEARN_DB_PATH ?? (process.env.VERCEL ? "/tmp/learn.db" : "./data/learn.db");


const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exchanges (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('answer','learn','shadow')),
  question      TEXT NOT NULL,
  triage_result TEXT CHECK (triage_result IN ('lookup','learnable')),
  state         TEXT NOT NULL CHECK (state IN ('predicting','revealing','teaching','shadowing','diffing','done')),
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exchanges_thread ON exchanges(thread_id, created_at);

CREATE TABLE IF NOT EXISTS predictions (
  id          TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('open','choice','code_choice','which_breaks')),
  prompt_text TEXT NOT NULL,
  options     TEXT,            -- JSON: [{ id, label, code? }]
  text        TEXT,            -- free text, or the selected option id
  confidence  TEXT CHECK (confidence IN ('low','med','high')),
  skipped     INTEGER NOT NULL DEFAULT 0,
  hinted      INTEGER NOT NULL DEFAULT 0,
  was_correct INTEGER          -- model's judgment; feeds calibration (§10.5)
);
CREATE INDEX IF NOT EXISTS idx_predictions_exchange ON predictions(exchange_id);

-- For a plain (mode='answer' or triage='lookup') response, gist/core are NULL and
-- the whole markdown answer lives in "full". For a learn reveal, all four are set.
CREATE TABLE IF NOT EXISTS answers (
  id             TEXT PRIMARY KEY,
  exchange_id    TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  gist           TEXT,
  core           TEXT,
  full           TEXT,
  delta_held_up  TEXT,
  delta_off      TEXT
);
CREATE INDEX IF NOT EXISTS idx_answers_exchange ON answers(exchange_id);

CREATE TABLE IF NOT EXISTS teach_turns (
  id          TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  junior_msg  TEXT NOT NULL,
  user_msg    TEXT
);
CREATE INDEX IF NOT EXISTS idx_teach_exchange ON teach_turns(exchange_id, idx);

-- Single local user (§2), so this is a singleton row keyed 'singleton'.
-- Deliberately about what the user wants the session to *do*, not about what
-- kind of learner they are — self-reported learning styles do not predict
-- outcomes, and §10.5 already argues against upfront self-report.
CREATE TABLE IF NOT EXISTS preferences (
  id            TEXT PRIMARY KEY,
  reinforcement TEXT NOT NULL CHECK (reinforcement IN ('teach_back','quiz','transfer_probe')),
  density       TEXT NOT NULL CHECK (density IN ('prose','balanced','visual')),
  updated_at    INTEGER NOT NULL
);

-- Retrieval practice after a reveal. 'transfer' is the same machinery with one
-- question on a different substrate; 'recall' is 2-3 questions from memory.
CREATE TABLE IF NOT EXISTS quiz_questions (
  id          TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('recall','transfer')),
  question    TEXT NOT NULL,
  user_answer TEXT,
  feedback    TEXT,
  was_correct INTEGER
);
CREATE INDEX IF NOT EXISTS idx_quiz_exchange ON quiz_questions(exchange_id, idx);

-- A past miss, resurfaced later in a different domain. One row per miss, ever:
-- predictions.challenged_at is stamped when this is created, so a belief is
-- never re-tested twice and the card cannot nag.
CREATE TABLE IF NOT EXISTS challenges (
  id                 TEXT PRIMARY KEY,
  prediction_id      TEXT NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  source_exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  question           TEXT NOT NULL,
  -- The correction they were given at the time. Grading needs a reference, and
  -- there is no answer on screen for this one to be graded against.
  reference          TEXT NOT NULL DEFAULT '',
  user_answer        TEXT,
  feedback           TEXT,
  was_correct        INTEGER,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_pending ON challenges(user_answer, created_at);

CREATE TABLE IF NOT EXISTS concepts (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

-- Shadow mode: Claude's independently-generated solution, plus the diff against
-- what the user committed. The solution is written by /api/ask and read back by
-- /api/shadow-diff on a *later* request, which is why it has to be persisted
-- rather than held in a channel() buffer like the speculative plain answer.
CREATE TABLE IF NOT EXISTS shadow_solutions (
  exchange_id    TEXT PRIMARY KEY REFERENCES exchanges(id) ON DELETE CASCADE,
  solution       TEXT NOT NULL,
  summary        TEXT,
  axes           TEXT,          -- the raw <axes> block, one "a | b | c | tag" line per row
  strong_point   TEXT,
  probe_scenario TEXT,
  probe_question TEXT,
  probe_answer   TEXT,
  probe_feedback TEXT
);

CREATE TABLE IF NOT EXISTS exchange_concepts (
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  concept_id  TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (exchange_id, concept_id)
);

-- ── Courses (shareable.md §4) ───────────────────────────────────────────────
--
-- Note the absence of CHECK constraints on topic_progress.status and
-- answer_evaluations.rating. SQLite cannot ALTER a CHECK, and this file already
-- carries the receipt for that: relaxExchangeChecks() below is a full table
-- rebuild written because Shadow added one 'mode' value. These two columns are
-- the ones most likely to gain values, so they are validated in TS at the repo
-- boundary instead.
--
-- There is also no userId anywhere: §2 is one local user with no auth, which is
-- why preferences is a singleton row. enrollments is unique per course.

CREATE TABLE IF NOT EXISTS courses (
  id           TEXT PRIMARY KEY,   -- the frontmatter id, e.g. 'system-design-staff'
  title        TEXT NOT NULL,
  subject      TEXT NOT NULL,
  level        TEXT NOT NULL,
  author       TEXT,
  description  TEXT NOT NULL,
  config       TEXT NOT NULL,      -- JSON: the session block from frontmatter
  topics       TEXT NOT NULL,      -- JSON: the topics array
  body         TEXT NOT NULL,      -- markdown coaching prose (untrusted)
  version      INTEGER NOT NULL DEFAULT 1,
  source_hash  TEXT NOT NULL,      -- sha256 of the file; re-seeding is a no-op when equal
  published_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  started_at      INTEGER NOT NULL,
  last_session_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);

CREATE TABLE IF NOT EXISTS topic_progress (
  id              TEXT PRIMARY KEY,
  enrollment_id   TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  topic_id        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'not_started',
  score           INTEGER,
  attempts        INTEGER NOT NULL DEFAULT 0,
  checkpoints_met TEXT NOT NULL DEFAULT '[]',   -- JSON: [checkpointIndex]
  weak_areas      TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ tag, note, seenCount, lastSeenAt }]
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_progress ON topic_progress(enrollment_id, topic_id);

-- Named course_sessions, not sessions: "session" already means an explain-back
-- session in this codebase and an unqualified name will be misread on every grep.
CREATE TABLE IF NOT EXISTS course_sessions (
  id            TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  topic_id      TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  transcript    TEXT NOT NULL DEFAULT '[]',  -- JSON: [{ role, content }]
  summary       TEXT                          -- JSON: { score, strengths, gaps, takeaways, deepDive }
);
CREATE INDEX IF NOT EXISTS idx_course_sessions ON course_sessions(enrollment_id, started_at);

CREATE TABLE IF NOT EXISTS answer_evaluations (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES course_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question       TEXT NOT NULL,
  rating         TEXT NOT NULL,
  gaps           TEXT NOT NULL DEFAULT '[]',   -- JSON: [taxonomy tag]
  note           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evals ON answer_evaluations(session_id, question_index);
`;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  migrate(conn);
  seedExamples(conn);
  seedCourses(conn);
  _db = conn;
  return conn;
}

/** Additive column adds. `CREATE TABLE IF NOT EXISTS` cannot do these. */
function migrate(conn: Database.Database) {
  const add = (table: string, column: string, decl: string) => {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  };
  // Which option was actually right, so the guess recap can show it.
  add("predictions", "correct_option", "TEXT");
  // Set when an exchange carried another exchange's explain-back transcript.
  add("exchanges", "context_exchange_id", "TEXT");
  // Worked examples seeded on first run so the app is not an empty box.
  add("threads", "is_example", "INTEGER NOT NULL DEFAULT 0");
  // Which preference combination a seeded example demonstrates.
  add("threads", "example_note", "TEXT");
  // Set when a miss has been spent on a delayed transfer challenge, so it is
  // only ever used once.
  add("predictions", "challenged_at", "INTEGER");

  relaxExchangeChecks(conn);
}

/**
 * Shadow mode adds a `mode` and two `state` values. Both columns carry CHECK
 * constraints, and `CREATE TABLE IF NOT EXISTS` will not update them on a
 * database that already exists — the widened SCHEMA above only applies to a
 * fresh file. Without this, an existing ./data/learn.db accepts every Shadow
 * write right up until the INSERT, then throws.
 *
 * SQLite cannot ALTER a CHECK, so this is the standard rebuild: new table, copy,
 * drop, rename. Guarded on the stored DDL so it runs at most once.
 */
function relaxExchangeChecks(conn: Database.Database) {
  const ddl = conn
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'exchanges'")
    .get() as { sql: string } | undefined;
  if (!ddl || ddl.sql.includes("'shadow'")) return;

  // foreign_keys must be OFF for this: predictions, answers, teach_turns and
  // exchange_concepts all reference exchanges(id) ON DELETE CASCADE, so dropping
  // the old table with enforcement on would cascade every child row into oblivion.
  // The pragma cannot be changed inside a transaction, hence the ordering.
  conn.pragma("foreign_keys = OFF");
  try {
    conn.transaction(() => {
      conn.exec(`
      CREATE TABLE exchanges_new (
        id                  TEXT PRIMARY KEY,
        thread_id           TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        mode                TEXT NOT NULL CHECK (mode IN ('answer','learn','shadow')),
        question            TEXT NOT NULL,
        triage_result       TEXT CHECK (triage_result IN ('lookup','learnable')),
        state               TEXT NOT NULL CHECK (state IN ('predicting','revealing','teaching','shadowing','diffing','done')),
        created_at          INTEGER NOT NULL,
        context_exchange_id TEXT
      );
      INSERT INTO exchanges_new
        SELECT id, thread_id, mode, question, triage_result, state, created_at, context_exchange_id
        FROM exchanges;
      DROP TABLE exchanges;
      ALTER TABLE exchanges_new RENAME TO exchanges;
      CREATE INDEX IF NOT EXISTS idx_exchanges_thread ON exchanges(thread_id, created_at);
    `);
    })();
  } finally {
    conn.pragma("foreign_keys = ON");
  }

  const orphans = conn.prepare("PRAGMA foreign_key_check").all();
  if (orphans.length) console.warn(`[db] ${orphans.length} orphaned rows after exchanges rebuild`);
}

/**
 * Worked examples, so a fresh install is not an empty box with a toggle in it.
 * They are real captured output (see scripts/generate-examples.mjs) inserted
 * with fixed ids, so this is idempotent. Deleting one brings it back on the next
 * boot — acceptable while there is no delete UI, and desirable for the demo.
 */
function seedExamples(conn: Database.Database) {
  const insert = (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    conn
      .prepare(
        `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`,
      )
      .run(row);
  };

  conn.transaction(() => {
    for (const seed of EXAMPLE_THREADS) {
      insert("threads", { ...seed.thread, is_example: 1, example_note: seed.note });
      for (const ex of seed.exchanges) {
        insert("exchanges", ex.exchange);
        for (const r of ex.predictions) insert("predictions", r);
        for (const r of ex.answers) insert("answers", r);
        for (const r of ex.teach_turns) insert("teach_turns", r);
        for (const r of ex.quiz) insert("quiz_questions", r);
      }
    }
  })();
}

/**
 * Publishes every courses/*.md on boot. Idempotent via source_hash, so editing a
 * course file and restarting republishes it and nothing is duplicated — the same
 * hand-edit-and-reload loop prompts/*.md get, for the same reason.
 *
 * A malformed file is logged and skipped rather than thrown: one bad course must
 * not take down the whole app on boot.
 */
function seedCourses(conn: Database.Database) {
  const dir = path.join(process.cwd(), "courses");
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return; // no courses/ directory is a valid state
  }

  const stmt = conn.prepare(
    `INSERT INTO courses (id, title, subject, level, author, description, config, topics, body,
                          version, source_hash, published_at)
     VALUES (@id, @title, @subject, @level, @author, @description, @config, @topics, @body,
             1, @source_hash, @published_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, subject = excluded.subject, level = excluded.level,
       author = excluded.author, description = excluded.description,
       config = excluded.config, topics = excluded.topics, body = excluded.body,
       version = courses.version + 1,
       source_hash = excluded.source_hash, published_at = excluded.published_at
     WHERE courses.source_hash != excluded.source_hash`,
  );

  for (const file of files) {
    const md = fs.readFileSync(path.join(dir, file), "utf8");
    const result = validateCourse(md);
    if (!result.ok) {
      console.warn(`[db] skipping courses/${file}:\n  ${result.errors.join("\n  ")}`);
      continue;
    }
    const { frontmatter: f, body } = result.course;
    stmt.run({
      id: f.id,
      title: f.title,
      subject: f.subject,
      level: f.level,
      author: f.author ?? null,
      description: f.description,
      config: JSON.stringify(f.session),
      topics: JSON.stringify(f.topics),
      body,
      source_hash: courseHash(md),
      published_at: Date.now(),
    });
  }
}

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
