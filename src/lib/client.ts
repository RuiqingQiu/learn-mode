"use client";

import type {
  Confidence,
  Preferences,
  QuizKind,
  QuizQuestion,
  ExchangeRecord,
  Mode,
  PredictPrompt,
  SectionName,
  ThreadSummary,
  TriageResult,
} from "./types";

/** Reads a `text/event-stream` response and hands each JSON payload to `onEvent`. */
export async function readSSE(
  url: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)));
      }
    }
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const post = <T,>(url: string, body: unknown) =>
  json<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  listThreads: () => json<{ threads: ThreadSummary[] }>("/api/threads"),
  createThread: () => post<{ thread: ThreadSummary }>("/api/threads", {}),
  getThread: (id: string) =>
    json<{ thread: ThreadSummary; exchanges: ExchangeRecord[] }>(`/api/threads/${id}`),
  deleteThread: (id: string) => json<{ ok: true }>(`/api/threads/${id}`, { method: "DELETE" }),

  submitPrediction: (predictionId: string, text: string, confidence: Confidence | null) =>
    post<{ ok: true }>("/api/exchange", { action: "submit_prediction", predictionId, text, confidence }),
  skipPrediction: (predictionId: string) =>
    post<{ ok: true }>("/api/exchange", { action: "skip_prediction", predictionId }),
  hint: (exchangeId: string, predictionId: string) =>
    post<{ hint: string }>("/api/exchange", { action: "hint", exchangeId, predictionId }),
  startTeaching: (exchangeId: string) =>
    post<{ ok: true }>("/api/exchange", { action: "start_teaching", exchangeId }),
  endExchange: (exchangeId: string) => post<{ ok: true }>("/api/exchange", { action: "end", exchangeId }),
  clearTeaching: (exchangeId: string) =>
    post<{ ok: true }>("/api/exchange", { action: "clear_teaching", exchangeId }),

  getPreferences: () => json<{ preferences: Preferences | null }>("/api/preferences"),
  savePreferences: (p: Preferences) => post<{ preferences: Preferences }>("/api/preferences", p),
  resetPreferences: () => json<{ preferences: null }>("/api/preferences", { method: "DELETE" }),

  startQuiz: (exchangeId: string, kind: QuizKind) =>
    post<{ questions: QuizQuestion[] }>("/api/quiz", { action: "start", exchangeId, kind }),
  answerQuiz: (exchangeId: string, questionId: string, text: string) =>
    post<{ questions: QuizQuestion[] }>("/api/quiz", { action: "answer", exchangeId, questionId, text }),
};

// ── client-side view of an exchange ─────────────────────────────────────────

export interface TeachTurn {
  junior: string;
  user: string | null;
}

export type ExchangeStatus =
  | "answering"
  | "predicting"
  | "revealing"
  | "revealed"
  | "teaching"
  | "done"
  | "error";

export interface LiveExchange {
  /**
   * Stable client-side identity. Assigned once when the exchange is created and
   * never reassigned, so state updates can never miss it. `id` (the server id)
   * arrives later and must not be used to target state updates.
   */
  key: string;
  /** Server-assigned exchange id. Empty until the first SSE event arrives. */
  id: string;
  mode: Mode;
  question: string;
  triage: TriageResult | null;
  /** Set when this question carried another exchange's explain-back transcript. */
  context_exchange_id: string | null;
  status: ExchangeStatus;
  answerText: string;
  predictionId: string | null;
  prompt: PredictPrompt | null;
  submitted: { text: string; confidence: Confidence | null; skipped: boolean } | null;
  hint: string | null;
  hintPending: boolean;
  /** Which option was right, once the reveal has said so. */
  correctOption: string | null;
  quiz: QuizQuestion[];
  quizPending: boolean;
  /** Dismissed or finished — stop hiding the answer behind it. */
  quizDismissed: boolean;
  /** The layered answer is still being written. Independent of `status`, because
   *  you can start explaining back while `full` is still arriving. */
  revealStreaming: boolean;
  sections: Partial<Record<SectionName, string>>;
  teach: {
    turns: TeachTurn[];
    streaming: string;
    pending: boolean;
    /** Finished for good — the exit summary was written. */
    closed: boolean;
    /** Stepped out to ask something else; can be picked back up. */
    paused: boolean;
    /** A main-chat answer is in flight for this session. */
    askingMainChat: boolean;
    summary: string | null;
  };
  error: string | null;
}

export function blankExchange(key: string, question: string, mode: Mode): LiveExchange {
  return {
    key,
    id: "",
    mode,
    question,
    triage: null,
    context_exchange_id: null,
    status: "answering",
    answerText: "",
    predictionId: null,
    prompt: null,
    submitted: null,
    hint: null,
    hintPending: false,
    correctOption: null,
    quiz: [],
    quizPending: false,
    quizDismissed: false,
    revealStreaming: false,
    sections: {},
    teach: {
      turns: [],
      streaming: "",
      pending: false,
      closed: false,
      paused: false,
      askingMainChat: false,
      summary: null,
    },
    error: null,
  };
}

const TEACH_TURN_CAP = 4;

/** Server record → the shape the UI renders. */
export function fromRecord(r: ExchangeRecord): LiveExchange {
  const teachTurns = r.teach_turns
    .filter((t) => t.idx < TEACH_TURN_CAP)
    .map((t) => ({ junior: t.junior_msg, user: t.user_msg }));
  const summary = r.teach_turns.find((t) => t.idx >= TEACH_TURN_CAP)?.junior_msg ?? null;

  const revealed = !!r.answer?.gist;
  let status: ExchangeStatus;
  if (r.state === "predicting") status = r.prediction ? "predicting" : "done";
  else if (r.state === "teaching") status = "teaching";
  else if (revealed && teachTurns.length === 0) status = "revealed";
  else status = "done";

  return {
    key: r.id,
    id: r.id,
    mode: r.mode,
    question: r.question,
    triage: r.triage_result,
    context_exchange_id: r.context_exchange_id,
    status,
    answerText: r.answer?.gist ? "" : (r.answer?.full ?? ""),
    predictionId: r.prediction?.id ?? null,
    prompt: r.prediction
      ? {
          type: r.prediction.type,
          prompt_text: r.prediction.prompt_text,
          options: r.prediction.options ?? undefined,
        }
      : null,
    submitted:
      r.prediction && (r.prediction.text !== null || r.prediction.skipped)
        ? {
            text: r.prediction.text ?? "",
            confidence: r.prediction.confidence,
            skipped: r.prediction.skipped,
          }
        : null,
    hint: null,
    hintPending: false,
    correctOption: r.prediction?.correct_option ?? null,
    quiz: r.quiz,
    quizPending: false,
    quizDismissed: false,
    revealStreaming: false,
    sections: {
      gist: r.answer?.gist ?? undefined,
      core: r.answer?.core ?? undefined,
      full: r.answer?.full ?? undefined,
      held_up: r.answer?.delta_held_up ?? undefined,
      off: r.answer?.delta_off ?? undefined,
    },
    teach: {
      turns: teachTurns,
      streaming: "",
      pending: false,
      closed: !!summary,
      // Turns exist, no summary, and the exchange is no longer live: paused.
      paused: !summary && teachTurns.length > 0 && r.state !== "teaching",
      askingMainChat: false,
      summary,
    },
    error: null,
  };
}
