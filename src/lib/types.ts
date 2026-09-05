// Shared vocabulary between the route handlers and the client. §6.

export type Mode = "answer" | "learn";

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
export type ExchangeState = "predicting" | "revealing" | "teaching" | "done";
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
}

export interface ThreadSummary {
  id: string;
  title: string;
  created_at: number;
}

// ── SSE payloads ────────────────────────────────────────────────────────────

/** Which layered section a reveal delta belongs to. */
export type SectionName = "gist" | "held_up" | "off" | "core" | "full";

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
