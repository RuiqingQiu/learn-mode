"use client";

import type {
  Challenge,
  Confidence,
  CourseRecord,
  CourseSessionRecord,
  CourseTopicRecord,
  EnrollmentRecord,
  TopicProgressRecord,
  WeakArea,
  Preferences,
  QuizKind,
  QuizQuestion,
  ExchangeRecord,
  Mode,
  PredictPrompt,
  SectionName,
  ShadowSectionName,
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

  commitShadow: (
    exchangeId: string,
    predictionId: string,
    approach: string,
    confidence: Confidence | null,
  ) =>
    post<{ solution: string | null }>("/api/shadow", {
      action: "commit",
      exchangeId,
      predictionId,
      approach,
      confidence,
    }),
  shadowSolution: (exchangeId: string) =>
    post<{ solution: string | null }>("/api/shadow", { action: "solution", exchangeId }),
  skipShadow: (exchangeId: string, predictionId: string) =>
    post<{ solution: string | null }>("/api/shadow", { action: "skip", exchangeId, predictionId }),
  shadowHint: (exchangeId: string, predictionId: string) =>
    post<{ hint: string }>("/api/shadow", { action: "hint", exchangeId, predictionId }),
  answerProbe: (exchangeId: string, predictionId: string, answer: string) =>
    post<{ correct: boolean; feedback: string }>("/api/shadow", {
      action: "probe",
      exchangeId,
      predictionId,
      answer,
    }),

  peekChallenge: (excludeExchangeId?: string) =>
    post<{ challenge: Challenge | null }>("/api/challenge", { action: "peek", excludeExchangeId }),
  answerChallenge: (id: string, answer: string) =>
    post<{ correct: boolean | null; feedback: string }>("/api/challenge", {
      action: "answer",
      id,
      answer,
    }),

  startQuiz: (exchangeId: string, kind: QuizKind) =>
    post<{ questions: QuizQuestion[] }>("/api/quiz", { action: "start", exchangeId, kind }),
  answerQuiz: (exchangeId: string, questionId: string, text: string) =>
    post<{ questions: QuizQuestion[] }>("/api/quiz", { action: "answer", exchangeId, questionId, text }),

  // ── courses ───────────────────────────────────────────────────────────────
  listCourses: () =>
    json<{ courses: (CourseRecord & { enrolled: boolean; completed: number })[] }>("/api/courses"),
  publishCourse: (source: string) =>
    post<{ course: CourseRecord; errors?: string[] }>("/api/courses", { source }),
  getCourse: (id: string) =>
    json<{
      course: CourseRecord;
      enrollment: EnrollmentRecord | null;
      progress: TopicProgressRecord[];
    }>(`/api/courses/${id}`),
  enroll: (courseId: string) => post<{ enrollment: EnrollmentRecord }>("/api/enrollments", { courseId }),
  startCourseSession: (courseId: string, topicId: string) =>
    post<{ session: CourseSessionRecord }>("/api/sessions", { courseId, topicId }),
  getCourseSession: (id: string) =>
    json<{
      session: CourseSessionRecord;
      topic: CourseTopicRecord;
      course: { id: string; title: string; config: CourseRecord["config"] };
      progress: TopicProgressRecord | null;
    }>(`/api/sessions/${id}`),
  courseNotes: (enrollmentId: string) =>
    json<{ weakAreas: (WeakArea & { topicId: string })[]; sessions: CourseSessionRecord[] }>(
      `/api/enrollments/${enrollmentId}/notes`,
    ),
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
  // Skill Shadow: Claude is solving privately / the decision diff is streaming.
  | "shadowing"
  | "diffing"
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
  /**
   * Skill Shadow. Nested rather than flattened onto the top level, following
   * `teach` — a phase with this many fields does not belong in the flat bag.
   */
  shadow: {
    /** Claude's parallel solution. Null until the user commits or skips: it is
     *  fetched from /api/shadow, never pushed down the /api/ask stream. */
    solution: string | null;
    /** /api/ask is still generating it. */
    solving: boolean;
    committed: boolean;
    /** Committed first; the diff starts when the solution lands. */
    awaitingSolution: boolean;
    /** Escape hatch taken — show the solution, no diff, no probe. */
    skipped: boolean;
    diffing: boolean;
    sections: Partial<Record<ShadowSectionName, string>>;
    probeAnswer: string | null;
    probeFeedback: string | null;
    probeCorrect: boolean | null;
    probePending: boolean;
    hint: string | null;
    hintPending: boolean;
  };
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
    shadow: {
      solution: null,
      solving: mode === "shadow",
      committed: false,
      awaitingSolution: false,
      skipped: false,
      diffing: false,
      sections: {},
      probeAnswer: null,
      probeFeedback: null,
      probeCorrect: null,
      probePending: false,
      hint: null,
      hintPending: false,
    },
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

  const committed = !!r.prediction && (r.prediction.text !== null || r.prediction.skipped);
  const hasDiff = !!r.shadow?.axes;

  const revealed = !!r.answer?.gist;
  let status: ExchangeStatus;
  if (r.mode === "shadow") {
    // A reload while the diff is mid-flight: the stream is gone, but the route
    // passes no abort signal, so it will still finish and persist server-side.
    if (r.state === "diffing" && !hasDiff) status = "diffing";
    else if (r.state === "shadowing") status = "shadowing";
    else status = "done";
  } else if (r.state === "predicting") status = r.prediction ? "predicting" : "done";
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
    shadow: {
      solution: r.shadow?.solution ?? null,
      solving: r.mode === "shadow" && !r.shadow?.ready,
      committed,
      awaitingSolution: committed && !r.shadow?.ready,
      skipped: !!r.prediction?.skipped,
      diffing: false,
      sections: {
        summary: r.shadow?.summary ?? undefined,
        axes: r.shadow?.axes ?? undefined,
        strong_point: r.shadow?.strong_point ?? undefined,
        probe_scenario: r.shadow?.probe_scenario ?? undefined,
        probe_question: r.shadow?.probe_question ?? undefined,
      },
      probeAnswer: r.shadow?.probe_answer ?? null,
      probeFeedback: r.shadow?.probe_feedback ?? null,
      probeCorrect: r.prediction?.was_correct ?? null,
      probePending: false,
      hint: null,
      hintPending: false,
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
