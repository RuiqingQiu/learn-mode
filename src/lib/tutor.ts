import { streamTutorTurn } from "./phases";
import * as repo from "./repo";
import { SectionStreamParser } from "./xml-stream";
import type { StreamSection } from "./xml-stream";
import type { AnswerRating, SessionSummary, TopicStatus } from "./types";

/**
 * One turn of a guided course session, driven the way /api/reveal drives a
 * reveal: parse the layered XML as it streams, persist each piece the moment it
 * is whole, and forward only the parts meant to be rendered.
 *
 * This is where shareable.md §5's three "tools" actually live. They are writes
 * triggered by sections completing rather than tool calls, which keeps the whole
 * turn in one streaming request — but the property that mattered is unchanged:
 * every progress write happens server-side and the client never makes one.
 */

type Send = (event: unknown) => void;

/** Never rendered inline. They carry the model's judgment of the answer. */
const META: StreamSection[] = ["eval_rating", "eval_gaps", "eval_checkpoints"];

const RATINGS: AnswerRating[] = ["strong", "partial", "weak", "skipped"];

const STATUS_ICON: Record<TopicStatus, string> = {
  completed: "✅",
  in_progress: "🔄",
  needs_review: "🔁",
  not_started: "⬜",
};

/** Prose or a markdown list, either way an array. §4 wants these as lists. */
const toList = (s: string | undefined): string[] =>
  (s ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

/**
 * `status` and `weak` are answered from the database, before any model call.
 * §5 lists them as commands the model recognizes; they are intercepted instead
 * because the model would invent the numbers, and a progress dashboard that is
 * confidently wrong is worse than no dashboard.
 */
export function renderStatus(sessionId: string): string | null {
  const ctx = repo.tutorContext(sessionId);
  if (!ctx) return null;

  const progress = new Map(
    repo.topicProgress(ctx.session.enrollment_id).map((p) => [p.topic_id, p]),
  );
  const total = ctx.course.topics.length;
  const count = (s: TopicStatus) =>
    ctx.course.topics.filter((t) => (progress.get(t.id)?.status ?? "not_started") === s).length;

  const here = progress.get(ctx.topic.id);
  const met = new Set(here?.checkpoints_met ?? []);

  return [
    `✅ Completed: ${count("completed")}/${total}   🔄 In Progress: ${count("in_progress")}/${total}   🔁 Needs Review: ${count("needs_review")}/${total}   ⬜ Not Started: ${count("not_started")}/${total}`,
    "",
    `**${ctx.topic.name}** — ${(here?.status ?? "not_started").replace(/_/g, " ")}${here?.score ? `, scored ${here.score}/${ctx.course.config.mastery_scale}` : ""}, ${here?.attempts ?? 0} attempt${here?.attempts === 1 ? "" : "s"}`,
    "",
    ...ctx.topic.checkpoints.map((c, i) => `- ${met.has(i) ? "✅" : "⬜"} ${c}`),
  ].join("\n");
}

export function renderWeak(sessionId: string): string | null {
  const ctx = repo.tutorContext(sessionId);
  if (!ctx) return null;

  const names = new Map(ctx.course.topics.map((t) => [t.id, t.name]));
  const { weakAreas } = repo.notesFor(ctx.session.enrollment_id);
  if (!weakAreas.length) return "Nothing recorded yet.";

  const lines = weakAreas
    .slice(0, 25)
    .map(
      (w) =>
        `- \`${w.tag}\` — ${names.get(w.topicId) ?? w.topicId}, seen ${w.seenCount}×${w.imported ? " (imported)" : ""}`,
    );
  return ["**Weak areas, most recurrent first**", "", ...lines].join("\n");
}

export interface TurnResult {
  asked: number;
  ended: boolean;
}

/**
 * @param userText  the learner's message, or null to open the session
 * @param forceClose  the `End session` button; the model writes the wrap-up
 */
export async function runTutorTurn(
  send: Send,
  sessionId: string,
  userText: string | null,
  forceClose = false,
): Promise<void> {
  const ctx = repo.tutorContext(sessionId);
  if (!ctx) {
    send({ type: "error", message: "No such session" });
    return;
  }
  if (ctx.session.ended_at) {
    send({ type: "error", message: "That session has already been wrapped up." });
    return;
  }

  const cmd = userText?.trim().toLowerCase() ?? "";

  // Answered from our own records — no model call, no tokens, always accurate.
  if (cmd === "status" || cmd === "weak") {
    const body = (cmd === "status" ? renderStatus(sessionId) : renderWeak(sessionId)) ?? "";
    send({ type: "section", name: "tutor_feedback", delta: body });
    repo.appendTranscript(sessionId, [
      { role: "user", content: userText! },
      { role: "assistant", content: `<tutor-feedback>\n${body}\n</tutor-feedback>` },
    ]);
    send({ type: "done", asked: repo.getEvaluations(sessionId).length, ended: false });
    return;
  }

  const evals = repo.getEvaluations(sessionId);
  const questionIndex = evals.length;
  const [, maxQuestions] = ctx.course.config.questions_per_topic;
  const isHint = cmd === "hint";
  const closing =
    forceClose || cmd === "done" || (!!userText && !isHint && questionIndex + 1 >= maxQuestions);

  const transcript = [...ctx.session.transcript];
  if (userText) transcript.push({ role: "user" as const, content: userText });

  // The question this answer is responding to, for the AnswerEvaluation row.
  const askedQuestion =
    [...ctx.session.transcript]
      .reverse()
      .map((t) => (t.role === "assistant" ? parseQuestion(t.content) : null))
      .find((q): q is string => !!q) ?? ctx.topic.name;

  const acc: Partial<Record<StreamSection, string>> = {};
  const parser = new SectionStreamParser();
  const forward = (deltas: { name: StreamSection; delta: string }[]) => {
    for (const d of deltas) {
      acc[d.name] = (acc[d.name] ?? "") + d.delta;
      if (!META.includes(d.name)) send({ type: "section", name: d.name, delta: d.delta });
    }
  };

  const trimAcc = (k: StreamSection) => acc[k]?.trim() || null;
  const splitTags = (k: StreamSection) =>
    (trimAcc(k) ?? "")
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

  // Only tags the course author actually declared. The model does not get to
  // widen the vocabulary — free-text tags are exactly what stopped the old
  // progress.json from ever adding up.
  const allowedGaps = () => {
    const allowed = new Set(ctx.topic.weak_area_taxonomy);
    return [...new Set(splitTags("eval_gaps").filter((t) => allowed.has(t)))];
  };

  // `mark_checkpoint`. Fired as soon as the tag closes rather than at the end of
  // the stream, so the rail ticks while the feedback is still being written.
  let checkpointsDone = false;
  const persistCheckpoints = () => {
    if (checkpointsDone) return;
    checkpointsDone = true;
    const valid = splitTags("eval_checkpoints")
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < ctx.topic.checkpoints.length);
    const met = valid.length
      ? repo.markCheckpoints(ctx.session.enrollment_id, ctx.topic.id, valid)
      : (repo.progressForTopic(ctx.session.enrollment_id, ctx.topic.id)?.checkpoints_met ?? []);

    const raw = trimAcc("eval_rating")?.toLowerCase() ?? "";
    const rating = RATINGS.find((r) => raw.startsWith(r)) ?? null;
    send({
      type: "meta",
      rating,
      gaps: allowedGaps(),
      checkpointsMet: met,
    });
  };

  // `record_evaluation`. The evaluation block is complete once the model has
  // moved on to the next question or to the wrap-up — same early-save trick the
  // reveal route uses when `full` starts arriving.
  let evalDone = false;
  const persistEvaluation = () => {
    if (evalDone) return;
    evalDone = true;
    const raw = trimAcc("eval_rating")?.toLowerCase();
    // A hint turn carries no judgment, and neither does the opening question.
    if (!raw || !userText || isHint) return;
    const rating = RATINGS.find((r) => raw.startsWith(r)) ?? "partial";
    const gaps = rating === "skipped" ? [] : allowedGaps();

    repo.recordEvaluation(sessionId, {
      questionIndex,
      question: askedQuestion,
      rating,
      gaps,
      note: trimAcc("eval_note"),
    });
    if (gaps.length) repo.bumpWeakAreas(ctx.session.enrollment_id, ctx.topic.id, gaps);
  };

  // No abort signal, deliberately: if the browser goes away mid-turn the answer
  // still gets evaluated and saved. Re-running a turn costs more than letting an
  // abandoned one finish.
  let raw = "";
  const stream = streamTutorTurn(
    { ...ctx, transcript, asked: questionIndex },
    { density: repo.getPreferencesOrDefault().density, closing },
  );

  stream.on("text", (delta) => {
    raw += delta;
    forward(parser.push(delta));
    if (acc.eval_note || acc.tutor_feedback) persistCheckpoints();
    if (acc.tutor_question || acc.wrapup_score || acc.wrapup_strengths) persistEvaluation();
  });
  await stream.finalMessage();
  forward(parser.flush());
  persistCheckpoints();
  persistEvaluation();

  repo.appendTranscript(sessionId, [
    ...(userText ? [{ role: "user" as const, content: userText }] : []),
    { role: "assistant" as const, content: raw.trim() },
  ]);

  // The budget is a range, so the model may decide to wrap up on its own once
  // it has passed the minimum. Persist on what it actually wrote, not on what we
  // predicted it would write — otherwise a self-initiated wrap-up streams to the
  // learner and is then silently thrown away, leaving the topic unscored.
  //
  // The other direction is §7's "forces finish_topic if the model didn't call
  // it": when we asked to close we write a summary regardless, falling back to
  // the rating histogram for a score the model failed to give us.
  const wroteWrapup = !!(
    trimAcc("wrapup_score") ||
    trimAcc("wrapup_strengths") ||
    trimAcc("wrapup_gaps") ||
    trimAcc("wrapup_takeaways")
  );
  let ended = false;
  if (closing || wroteWrapup) {
    const scale = ctx.course.config.mastery_scale;
    const claimed = Number.parseInt(trimAcc("wrapup_score") ?? "", 10);
    const summary: SessionSummary = {
      score: Number.isInteger(claimed) ? claimed : repo.derivedScore(sessionId, scale),
      strengths: toList(trimAcc("wrapup_strengths") ?? undefined),
      gaps: toList(trimAcc("wrapup_gaps") ?? undefined),
      takeaways: toList(trimAcc("wrapup_takeaways") ?? undefined),
      deepDive: trimAcc("wrapup_deep_dive") ?? "",
    };
    repo.finishTopic(sessionId, summary, ctx.course.config);
    ended = true;
  }

  send({ type: "done", asked: repo.getEvaluations(sessionId).length, ended });
}

/** Pulls the question back out of a stored assistant turn. */
function parseQuestion(assistantTurn: string): string | null {
  const m = /<tutor-question>([\s\S]*?)<\/tutor-question>/.exec(assistantTurn);
  return m ? m[1].trim() : null;
}

export { STATUS_ICON };
