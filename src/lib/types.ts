// Shared vocabulary between the route handlers and the client. §6.

export type Mode = "answer" | "learn" | "shadow";

/** What the user wants to happen after the answer. Not a claim about cognition. */
export type Reinforcement = "teach_back" | "quiz" | "transfer_probe";
/** How much of the answer should be structure rather than paragraphs. */
export type Density = "prose" | "balanced" | "visual";

export interface Preferences {
  reinforcement: Reinforcement;
  density: Density;
}

export const DEFAULT_PREFERENCES: Preferences = {
  reinforcement: "teach_back",
  density: "balanced",
};

export type QuizKind = "recall" | "transfer";

export interface QuizQuestion {
  id: string;
  idx: number;
  kind: QuizKind;
  question: string;
  user_answer: string | null;
  feedback: string | null;
  was_correct: boolean | null;
}
export type TriageResult = "lookup" | "learnable";
export type ExchangeState =
  | "predicting"
  | "revealing"
  | "teaching"
  // Shadow mode (§Skill Shadow): Claude is solving privately / the diff is streaming.
  | "shadowing"
  | "diffing"
  | "done";
export type PredictionType = "open" | "choice" | "code_choice" | "which_breaks";
export type Confidence = "low" | "med" | "high";

export interface PredictOption {
  id: string;
  label: string;
  code?: string;
}

/** What /api/predict returns — the prompt the user sees before any answer. */
export interface PredictPrompt {
  type: PredictionType;
  prompt_text: string;
  options?: PredictOption[];
}

export interface PredictionRecord {
  id: string;
  type: PredictionType;
  prompt_text: string;
  options: PredictOption[] | null;
  text: string | null;
  confidence: Confidence | null;
  skipped: boolean;
  hinted: boolean;
  was_correct: boolean | null;
  /** Option id that was right, for `choice`-style predictions. */
  correct_option: string | null;
}

/** §4.3 layered answer. gist/core null ⇒ this was a plain answer, markdown in `full`. */
export interface AnswerRecord {
  gist: string | null;
  core: string | null;
  full: string | null;
  delta_held_up: string | null;
  delta_off: string | null;
}

export interface TeachTurnRecord {
  idx: number;
  junior_msg: string;
  user_msg: string | null;
}

/**
 * Skill Shadow. `solution` is written by /api/ask *before* the user commits — the
 * whole point is that Claude has not seen their approach. Everything else is
 * written by /api/shadow-diff afterwards.
 */
export interface ShadowRecord {
  /** Null when the reader has not earned it yet — see repo.listExchanges. */
  solution: string | null;
  /** Whether the solution exists at all, which survives redaction. */
  ready: boolean;
  summary: string | null;
  /** Raw <axes> block: one "axis | yours | claude | tag" line per row. */
  axes: string | null;
  strong_point: string | null;
  probe_scenario: string | null;
  probe_question: string | null;
  probe_answer: string | null;
  probe_feedback: string | null;
}

/** One row of the decision diff. `claude` is "—" when Claude did not address it. */
export interface ShadowAxis {
  axis: string;
  yours: string;
  claude: string;
  tag: "agree" | "diverge" | "gap" | "user-ahead";
}

export interface ExchangeRecord {
  id: string;
  thread_id: string;
  mode: Mode;
  question: string;
  triage_result: TriageResult | null;
  state: ExchangeState;
  created_at: number;
  /** Set when this question carried another exchange's explain-back transcript. */
  context_exchange_id: string | null;
  prediction: PredictionRecord | null;
  answer: AnswerRecord | null;
  teach_turns: TeachTurnRecord[];
  quiz: QuizQuestion[];
  shadow: ShadowRecord | null;
}

/** A miss worth re-testing, plus what it was about. */
export interface ChallengeSource {
  predictionId: string;
  sourceExchangeId: string;
  sourceQuestion: string;
  /** What they committed to at the time. */
  believed: string;
  /** The correction they were given — the delta, or the Shadow probe. */
  correction: string;
  createdAt: number;
}

export interface Challenge {
  id: string;
  question: string;
  sourceQuestion: string;
  believed: string;
  createdAt: number;
  user_answer: string | null;
  feedback: string | null;
  was_correct: boolean | null;
}

export interface ThreadSummary {
  id: string;
  title: string;
  created_at: number;
  /** Seeded worked example, not something the user asked. */
  is_example: boolean;
  /** For examples: which preference combination this one shows. */
  example_note: string | null;
}

// ── SSE payloads ────────────────────────────────────────────────────────────

/** Which layered section a reveal delta belongs to. */
export type SectionName = "gist" | "held_up" | "off" | "core" | "full";

/** Sections of the Skill Shadow decision diff. Streamed through the same parser. */
export type ShadowSectionName =
  | "summary"
  | "axes"
  | "strong_point"
  | "probe_scenario"
  | "probe_question";

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type RevealEvent =
  | { type: "section"; name: SectionName; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type TeachEvent =
  | { type: "text"; delta: string }
  | { type: "done"; idx: number; ended: boolean }
  | { type: "error"; message: string };

// ── Courses (shareable.md §4) ───────────────────────────────────────────────

/** Mirrors the `topics[]` entry in a course.md frontmatter. */
export interface CourseTopicRecord {
  id: string;
  name: string;
  summary: string;
  prereqs: string[];
  checkpoints: string[];
  weak_area_taxonomy: string[];
}

export interface CourseSessionConfig {
  questions_per_topic: [number, number];
  mastery_scale: number;
  /** score <= this ⇒ needs_review. */
  review_threshold: number;
}

export interface CourseRecord {
  id: string;
  title: string;
  subject: string;
  level: string;
  author: string | null;
  description: string;
  config: CourseSessionConfig;
  topics: CourseTopicRecord[];
  /** Markdown coaching prose. Untrusted data — see prompts/tutor.md. */
  body: string;
  version: number;
  published_at: number;
}

export type TopicStatus = "not_started" | "in_progress" | "completed" | "needs_review";

/**
 * A recurring failure, counted. `tag` comes from the topic's authored
 * weak_area_taxonomy — a fixed vocabulary is the only reason these aggregate
 * across sessions instead of becoming three near-duplicate strings for one gap.
 * `imported` marks rows carried over from a pre-app progress.json, whose tags
 * predate the taxonomy and are kept verbatim as a record of what happened.
 */
export interface WeakArea {
  tag: string;
  note: string | null;
  seenCount: number;
  lastSeenAt: number;
  imported?: boolean;
}

export interface TopicProgressRecord {
  topic_id: string;
  status: TopicStatus;
  score: number | null;
  attempts: number;
  checkpoints_met: number[];
  weak_areas: WeakArea[];
  updated_at: number;
}

export interface EnrollmentRecord {
  id: string;
  course_id: string;
  started_at: number;
  last_session_at: number | null;
}

export type AnswerRating = "strong" | "partial" | "weak" | "skipped";

export interface AnswerEvaluationRecord {
  id: string;
  question_index: number;
  question: string;
  rating: AnswerRating;
  gaps: string[];
  note: string | null;
}

export interface SessionSummary {
  score: number;
  strengths: string[];
  gaps: string[];
  takeaways: string[];
  deepDive: string;
}

export interface CourseTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CourseSessionRecord {
  id: string;
  enrollment_id: string;
  course_id: string;
  topic_id: string;
  started_at: number;
  ended_at: number | null;
  transcript: CourseTurn[];
  summary: SessionSummary | null;
  evaluations: AnswerEvaluationRecord[];
}

/**
 * Sections of a tutor turn. Every tag is prefixed because `TAGS` in
 * xml-stream.ts is global across every prompt in the app — a bare <question>
 * would start capturing any reveal whose `full` markdown contained that literal.
 */
export type TutorSectionName =
  | "eval_rating"
  | "eval_gaps"
  | "eval_checkpoints"
  | "eval_note"
  | "tutor_feedback"
  | "tutor_question"
  | "wrapup_score"
  | "wrapup_strengths"
  | "wrapup_gaps"
  | "wrapup_takeaways"
  | "wrapup_deep_dive";

export type TutorEvent =
  | { type: "section"; name: TutorSectionName; delta: string }
  | { type: "meta"; rating: AnswerRating | null; gaps: string[]; checkpointsMet: number[] }
  | { type: "done"; asked: number; ended: boolean }
  | { type: "error"; message: string };
