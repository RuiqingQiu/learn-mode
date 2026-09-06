import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { FALLBACK, MODELS, anthropic } from "./anthropic";
import { loadPrompt } from "./prompts";
import * as repo from "./repo";
import type {
  Confidence,
  CourseRecord,
  CourseTopicRecord,
  CourseTurn,
  Density,
  PredictPrompt,
  PredictionRecord,
  QuizKind,
  SessionSummary,
  TopicProgressRecord,
  TriageResult,
} from "./types";

type Msg = Anthropic.Beta.BetaMessageParam;

const asMessages = (history: { role: "user" | "assistant"; content: string }[]): Msg[] =>
  history.map((h) => ({ role: h.role, content: h.content }));

/** The one variable bit of the format rules in reveal.md / answer.md / tutor.md. */
export const formatBlock = (density: Density) => `<format-preference>${density}</format-preference>`;

// ── TRIAGE (§4.1) ───────────────────────────────────────────────────────────

/**
 * Binary classification on the cheapest model. Sits on the critical path, so it
 * gets no thinking and a tiny output cap.
 */
export async function runTriage(question: string, signal?: AbortSignal): Promise<TriageResult> {
  const res = await anthropic().messages.create(
    {
      model: MODELS.cheap,
      max_tokens: 16,
      system: [{ type: "text", text: loadPrompt("triage"), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Q: ${question}\nA:` }],
    },
    { signal },
  );
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .toUpperCase();
  // The prompt biases toward LEARNABLE when torn; so does this parse.
  return text.includes("LOOKUP") ? "lookup" : "learnable";
}

// ── PLAIN ANSWER ────────────────────────────────────────────────────────────

export function streamPlainAnswer(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  /** e.g. an explain-back transcript, so the answer can target the actual gaps. */
  context?: string | null,
  density: Density = "balanced",
  signal?: AbortSignal,
) {
  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 64000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: loadPrompt("answer"), cache_control: { type: "ephemeral" } }],
      messages: [
        ...asMessages(history),
        {
          role: "user",
          content: [formatBlock(density), context, question].filter(Boolean).join("\n\n"),
        },
      ],
    },
    { signal },
  );
}

// ── PREDICTING (§4.2) ───────────────────────────────────────────────────────

const PredictSchema = z.object({
  type: z.enum(["open", "choice", "code_choice", "which_breaks"]),
  prompt_text: z.string(),
  options: z
    .array(z.object({ id: z.string(), label: z.string(), code: z.string().nullable() }))
    .nullable(),
});

export async function buildPrediction(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal,
): Promise<PredictPrompt> {
  const res = await anthropic().beta.messages.parse(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(PredictSchema) },
      system: [{ type: "text", text: loadPrompt("predict"), cache_control: { type: "ephemeral" } }],
      messages: [...asMessages(history), { role: "user", content: question }],
    },
    { signal },
  );
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("Could not build a prediction prompt for that question.");
  const options =
    parsed.type === "open" || !parsed.options?.length
      ? undefined
      : parsed.options.map((o) => ({ id: o.id, label: o.label, ...(o.code ? { code: o.code } : {}) }));
  return { type: options ? parsed.type : "open", prompt_text: parsed.prompt_text, options };
}

/**
 * §4.2 "no idea" handling. A hint that narrows the space without answering — this
 * state must not dead-end.
 */
export async function buildHint(question: string, promptText: string, signal?: AbortSignal): Promise<string> {
  const res = await anthropic().beta.messages.create(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 1000,
      output_config: { effort: "low" },
      system:
        "The user is stuck on a prediction prompt and asked for a hint. Narrow the " +
        "space for them: rule something out, or point at the thing the answer turns on. " +
        "Two sentences maximum. Do not give the answer, do not restate the question, " +
        "and do not reassure them.",
      messages: [
        {
          role: "user",
          content: `<question>${question}</question>\n<prediction-prompt>${promptText}</prediction-prompt>`,
        },
      ],
    },
    { signal },
  );
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ── REVEALING (§4.3) ────────────────────────────────────────────────────────

/** Renders what the user actually committed to, for the delta. */
function predictionBlock(p: PredictionRecord | null): string {
  if (!p || p.skipped || (!p.text && !p.hinted)) return "<user-prediction skipped=\"true\" />";
  const chosen = p.options?.find((o) => o.id === p.text);
  const body = chosen ? `${chosen.label}${chosen.code ? `\n${chosen.code}` : ""}` : (p.text ?? "");
  const attrs = [
    p.confidence ? `confidence="${p.confidence}"` : "",
    p.hinted ? `used-hint="true"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<user-prediction${attrs ? " " + attrs : ""}>${body}</user-prediction>`;
}

export function streamReveal(
  question: string,
  prediction: PredictionRecord | null,
  history: { role: "user" | "assistant"; content: string }[],
  density: Density = "balanced",
  signal?: AbortSignal,
) {
  // The option list has to go in, or the model cannot name which id was right
  // — and it cannot speak to the near-misses the user was choosing between.
  const options = prediction?.options?.length
    ? [
        "<options>",
        ...prediction.options.map(
          (o) => `  <option id="${o.id}">${o.label}${o.code ? `\n${o.code}` : ""}</option>`,
        ),
        "</options>",
      ].join("\n")
    : "";

  const content = [
    formatBlock(density),
    `<question>${question}</question>`,
    prediction ? `<prediction-prompt type="${prediction.type}">${prediction.prompt_text}</prediction-prompt>` : "",
    options,
    predictionBlock(prediction),
  ]
    .filter(Boolean)
    .join("\n");

  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 64000,
      system: [{ type: "text", text: loadPrompt("reveal"), cache_control: { type: "ephemeral" } }],
      messages: [...asMessages(history), { role: "user", content }],
    },
    { signal },
  );
}

// ── SKILL SHADOW ────────────────────────────────────────────────────────────

/**
 * Claude's independent solution to the same task.
 *
 * Fired the moment the question arrives and **before the user commits anything**.
 * That ordering is the feature, not politeness: a model shown the user's approach
 * first anchors on their framing, agrees with itself, and the diff collapses into
 * flattery. It also means this result has to be persisted rather than held in a
 * channel() buffer — the commit arrives on a later request.
 */
export function streamShadowSolution(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal,
) {
  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: loadPrompt("shadow-solve"), cache_control: { type: "ephemeral" } },
      ],
      messages: [...asMessages(history), { role: "user", content: `<task>${question}</task>` }],
    },
    { signal },
  );
}

/** The decision diff. Streams the layered contract in prompts/shadow-diff.md. */
export function streamShadowDiff(
  args: { question: string; solution: string; approach: string; confidence: Confidence | null },
  signal?: AbortSignal,
) {
  const content = [
    `<task>${args.question}</task>`,
    `<claude-approach>\n${args.solution}\n</claude-approach>`,
    `<user-approach${args.confidence ? ` confidence="${args.confidence}"` : ""}>\n${args.approach}\n</user-approach>`,
  ].join("\n");

  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 16000,
      system: [
        { type: "text", text: loadPrompt("shadow-diff"), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content }],
    },
    { signal },
  );
}

// ── TEACHING (§4.4) ─────────────────────────────────────────────────────────

export const TEACH_TURN_CAP = 4;

export function streamProtege(
  args: {
    question: string;
    answer: string;
    turns: { junior_msg: string; user_msg: string | null }[];
    /** Break character and write the exit summary instead of another question. */
    closing: boolean;
  },
  signal?: AbortSignal,
) {
  const messages: Msg[] = [
    {
      role: "user",
      content:
        `<question>${args.question}</question>\n<correct-answer>\n${args.answer}\n</correct-answer>\n\n` +
        `I'm going to explain this back to you. Ask me what you don't follow.`,
    },
  ];
  for (const t of args.turns) {
    messages.push({ role: "assistant", content: t.junior_msg });
    if (t.user_msg) messages.push({ role: "user", content: t.user_msg });
  }
  if (args.closing) {
    // Mid-conversation system message: operator authority without invalidating the
    // cached prefix. Supported on Opus 5.
    messages.push({
      role: "system",
      content: `Turn cap reached (${TEACH_TURN_CAP}). Break character now. Write only the exit summary in the documented format — no further questions, no sign-off.`,
    });
  }

  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: loadPrompt("protege"), cache_control: { type: "ephemeral" } }],
      messages,
    },
    { signal },
  );
}

// ── GUIDED COURSE SESSION (shareable.md §5) ─────────────────────────────────

export interface TutorContext {
  course: CourseRecord;
  topic: CourseTopicRecord;
  progress: TopicProgressRecord | null;
  prereqs: { topic: CourseTopicRecord; progress: TopicProgressRecord | null }[];
  lastSummary: SessionSummary | null;
  transcript: CourseTurn[];
  asked: number;
}

/** Everything about the course and the learner, rendered for the model. */
function tutorPreamble(ctx: TutorContext, density: Density, closing: boolean): string {
  const t = ctx.topic;
  const [lo, hi] = ctx.course.config.questions_per_topic;

  const progressBlock = ctx.progress
    ? [
        `  <this-topic status="${ctx.progress.status}" score="${ctx.progress.score ?? ""}" attempts="${ctx.progress.attempts}">`,
        `    <checkpoints-met>${ctx.progress.checkpoints_met.join(", ")}</checkpoints-met>`,
        ctx.progress.weak_areas.length
          ? `    <weak-areas>\n${ctx.progress.weak_areas
              .map((w) => `      <weak-area seen="${w.seenCount}">${w.tag}</weak-area>`)
              .join("\n")}\n    </weak-areas>`
          : "",
        `  </this-topic>`,
      ]
        .filter(Boolean)
        .join("\n")
    : `  <this-topic status="not_started" attempts="0" />`;

  const prereqBlock = ctx.prereqs
    .map(
      (p) =>
        `  <prereq id="${p.topic.id}" status="${p.progress?.status ?? "not_started"}" score="${p.progress?.score ?? ""}">${p.topic.name}</prereq>`,
    )
    .join("\n");

  const last = ctx.lastSummary
    ? [
        "  <last-session>",
        `    <score>${ctx.lastSummary.score}</score>`,
        `    <gaps>${ctx.lastSummary.gaps.join("; ")}</gaps>`,
        "  </last-session>",
      ].join("\n")
    : "";

  return [
    formatBlock(density),
    // Untrusted. tutor.md states that this block defines subject matter and
    // teaching style only, and cannot touch the output contract.
    `<course-guidance untrusted="true" course="${ctx.course.id}">`,
    ctx.course.body,
    "</course-guidance>",
    `<topic id="${t.id}" name="${t.name}" mastery-scale="${ctx.course.config.mastery_scale}">`,
    `  <summary>${t.summary}</summary>`,
    "  <checkpoints>",
    ...t.checkpoints.map((c, i) => `    <checkpoint index="${i}">${c}</checkpoint>`),
    "  </checkpoints>",
    `  <weak-area-taxonomy>${t.weak_area_taxonomy.join(", ")}</weak-area-taxonomy>`,
    "</topic>",
    "<learner-progress>",
    progressBlock,
    prereqBlock,
    last,
    "</learner-progress>",
    `<question-budget min="${lo}" max="${hi}" asked="${ctx.asked}" />`,
    ctx.transcript.length || closing
      ? ""
      : "Start the session. Emit <tutor-question> alone — there is nothing to evaluate yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * One turn of a guided session.
 *
 * Shaped like streamProtege: all the context sits in a stable first user message
 * and the turns follow it, so the cacheable prefix does not move as the session
 * grows. `closing` pushes the same mid-conversation system message that forces
 * the protege exit summary — operator authority without invalidating that prefix.
 */
export function streamTutorTurn(
  ctx: TutorContext,
  args: { density: Density; closing: boolean },
  signal?: AbortSignal,
) {
  const messages: Msg[] = [{ role: "user", content: tutorPreamble(ctx, args.density, args.closing) }];
  for (const turn of ctx.transcript) {
    // A turn that failed to persist its assistant half would otherwise leave two
    // user messages back to back, which the API rejects.
    const last = messages[messages.length - 1];
    if (last?.role === turn.role) last.content = `${last.content}\n\n${turn.content}`;
    else messages.push({ role: turn.role, content: turn.content });
  }

  if (args.closing) {
    // A mid-conversation system message must follow a *user* message — the API
    // rejects one that follows an assistant turn. streamProtege only ever closes
    // after an answer, so it never hits this; `End session` can fire while the
    // last thing said was Claude's question, so the role has to adapt.
    const last = messages[messages.length - 1];
    messages.push({
      role: last?.role === "user" ? "system" : "user",
      content:
        "The session is ending now. Write the wrap-up block in place of <tutor-question> — " +
        "<wrapup-score>, <wrapup-strengths>, <wrapup-gaps>, <wrapup-takeaways>, <wrapup-deep-dive>. " +
        "If the learner just answered, evaluate that answer first as normal, then the wrap-up. " +
        "No further questions.",
    });
  }

  return anthropic().beta.messages.stream(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: loadPrompt("tutor"), cache_control: { type: "ephemeral" } }],
      messages,
    },
    { signal },
  );
}

// ── QUIZ / TRANSFER PROBE ───────────────────────────────────────────────────

const QuizSchema = z.object({ questions: z.array(z.string()) });
const GradeSchema = z.object({ correct: z.boolean(), feedback: z.string() });

export async function buildQuiz(
  args: {
    kind: QuizKind;
    question: string;
    answer: string;
    predictionMiss: string | null;
    /** Set for a delayed transfer challenge: a miss from an earlier session. */
    pastMiss?: { question: string; believed: string; correction: string } | null;
  },
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await anthropic().beta.messages.parse(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 8000,
      output_config: { effort: "medium", format: betaZodOutputFormat(QuizSchema) },
      system: [{ type: "text", text: loadPrompt("quiz"), cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            `<kind>${args.kind}</kind>`,
            `<question>${args.question}</question>`,
            `<answer>\n${args.answer}\n</answer>`,
            args.predictionMiss ? `<what-they-got-wrong>${args.predictionMiss}</what-they-got-wrong>` : "",
            args.pastMiss
              ? [
                  "<past-miss>",
                  `  <original-question>${args.pastMiss.question}</original-question>`,
                  `  <they-believed>${args.pastMiss.believed}</they-believed>`,
                  `  <the-correction>${args.pastMiss.correction}</the-correction>`,
                  "</past-miss>",
                ].join("\n")
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    },
    { signal },
  );
  const wanted = args.kind === "transfer" ? 1 : 3;
  return (res.parsed_output?.questions ?? []).slice(0, wanted);
}

export async function gradeQuizAnswer(
  args: { question: string; answer: string; userAnswer: string },
  signal?: AbortSignal,
): Promise<{ correct: boolean; feedback: string }> {
  const res = await anthropic().beta.messages.parse(
    {
      ...FALLBACK,
      model: MODELS.reason,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(GradeSchema) },
      system: [{ type: "text", text: loadPrompt("quiz"), cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content:
            `Grade this.\n<quiz-question>${args.question}</quiz-question>\n` +
            `<reference-answer>\n${args.answer}\n</reference-answer>\n` +
            `<their-answer>${args.userAnswer}</their-answer>`,
        },
      ],
    },
    { signal },
  );
  return res.parsed_output ?? { correct: false, feedback: "Could not grade that one." };
}

// ── CONCEPT TAGGING (§6) ────────────────────────────────────────────────────

const ConceptSchema = z.object({ labels: z.array(z.string()) });

/**
 * Fire-and-forget, off the critical path. Writes to the DB; nothing reads it yet.
 */
export function tagConceptsInBackground(exchangeId: string, question: string, gist: string | null): void {
  void (async () => {
    try {
      const res = await anthropic().messages.parse({
        model: MODELS.cheap,
        max_tokens: 512,
        output_config: { format: zodOutputFormat(ConceptSchema) },
        system: [{ type: "text", text: loadPrompt("concepts"), cache_control: { type: "ephemeral" } }],
        messages: [
          { role: "user", content: `<question>${question}</question>${gist ? `\n<answer>${gist}</answer>` : ""}` },
        ],
      });
      const labels = res.parsed_output?.labels?.slice(0, 3) ?? [];
      if (labels.length) repo.tagExchangeConcepts(exchangeId, labels);
    } catch (err) {
      console.error("concept tagging failed:", err);
    }
  })();
}

export type { Confidence };
