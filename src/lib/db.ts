import Database from "better-sqlite3";
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
  mode          TEXT NOT NULL CHECK (mode IN ('answer','learn')),
  question      TEXT NOT NULL,
  triage_result TEXT CHECK (triage_result IN ('lookup','learnable')),
  state         TEXT NOT NULL CHECK (state IN ('predicting','revealing','teaching','done')),
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

CREATE TABLE IF NOT EXISTS concepts (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exchange_concepts (
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  concept_id  TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (exchange_id, concept_id)
);
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
}

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
