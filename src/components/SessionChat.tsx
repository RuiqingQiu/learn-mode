"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readSSE } from "@/lib/client";
import { parseSections } from "@/lib/xml-stream";
import CheckpointRail from "./CheckpointRail";
import InlineMarkdown from "./InlineMarkdown";
import Markdown from "./Markdown";
import Spinner from "./Spinner";
import type { CourseTopicRecord, CourseTurn, TutorSectionName } from "@/lib/types";

type Sections = Partial<Record<TutorSectionName, string>>;

type Turn =
  | { role: "user"; key: string; text: string }
  | { role: "assistant"; key: string; sections: Sections; streaming: boolean };

const newKey = () => crypto.randomUUID();

/** Stored assistant turns are the raw tagged output, so a reload replays them. */
function fromTranscript(transcript: CourseTurn[]): Turn[] {
  return transcript.map((t) =>
    t.role === "user"
      ? { role: "user" as const, key: newKey(), text: t.content }
      : {
          role: "assistant" as const,
          key: newKey(),
          sections: parseSections(t.content) as Sections,
          streaming: false,
        },
  );
}

const hasWrapup = (s: Sections) => !!(s.wrapup_score || s.wrapup_strengths || s.wrapup_gaps);

/** Button presses, not things the learner typed. They must not look like chat. */
const COMMANDS: Record<string, string> = {
  hint: "you asked for a hint",
  skip: "you skipped this one",
  status: "you asked where you are",
  done: "you ended the session",
};

const norm = (s?: string) => (s ?? "").trim().replace(/\s+/g, " ");

/**
 * A hint turn re-asks the same question verbatim (prompts/tutor.md), so the same
 * card lands on screen twice. Fold the pair into one: the earlier copy drops its
 * question, and the hint renders *under the question it is about* — the shape
 * PredictionCard and ShadowCard already use.
 *
 * Done here rather than in the prompt on purpose. The re-ask is what keeps the
 * model's transcript ending on the question it is still waiting for an answer to,
 * and that is worth more than the duplicate costs.
 */
type Row = { turn: Turn; showQuestion: boolean; hint?: string };

function layout(turns: Turn[]): Row[] {
  const rows: Row[] = turns.map((turn) => ({ turn, showQuestion: true }));
  let prevIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i].turn;
    if (t.role !== "assistant") continue;
    const q = norm(t.sections.tutor_question);
    if (q && prevIdx >= 0) {
      const prev = rows[prevIdx].turn;
      const prevQ = prev.role === "assistant" ? norm(prev.sections.tutor_question) : "";
      // While the re-ask is still streaming it is only a prefix of the original.
      const same = prevQ !== "" && (prevQ === q || (t.streaming && q.length > 20 && prevQ.startsWith(q)));
      if (same) {
        rows[prevIdx].showQuestion = false;
        rows[i].hint = t.sections.tutor_feedback;
      }
    }
    prevIdx = i;
  }
  return rows;
}

export default function SessionChat({
  courseId,
  sessionId,
  topic,
  transcript,
  ended: endedInitially,
  checkpointsMet,
  answered: answeredInitially,
  maxQuestions,
}: {
  courseId: string;
  sessionId: string;
  topic: CourseTopicRecord;
  transcript: CourseTurn[];
  ended: boolean;
  checkpointsMet: number[];
  answered: number;
  maxQuestions: number;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(() => fromTranscript(transcript));
  const [met, setMet] = useState<number[]>(checkpointsMet);
  const [answered, setAnswered] = useState(answeredInitially);
  const [ended, setEnded] = useState(endedInitially);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => layout(turns), [turns]);

  const opened = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  /**
   * Streams one turn. `patch` targets the assistant turn by its stable key, never
   * by index — same rule as Chat.tsx: never pass a value a later line reassigns
   * into a state updater, because React invokes the updater lazily.
   */
  const runTurn = useCallback(
    async (url: string, body: unknown) => {
      setBusy(true);
      setError(null);
      const key = newKey();
      setTurns((prev) => [...prev, { role: "assistant", key, sections: {}, streaming: true }]);

      const patch = (fn: (t: Turn & { role: "assistant" }) => Turn) =>
        setTurns((prev) =>
          prev.map((t) => (t.key === key && t.role === "assistant" ? fn(t) : t)),
        );

      try {
        await readSSE(url, body, (ev) => {
          if (ev.type === "section") {
            const name = ev.name as TutorSectionName;
            const delta = ev.delta as string;
            patch((t) => ({
              ...t,
              sections: { ...t.sections, [name]: (t.sections[name] ?? "") + delta },
            }));
          } else if (ev.type === "meta") {
            // Arrives while the feedback is still writing — the rail ticks live.
            setMet(ev.checkpointsMet as number[]);
          } else if (ev.type === "done") {
            setAnswered(ev.asked as number);
            if (ev.ended) setEnded(true);
          } else if (ev.type === "error") {
            setError(ev.message as string);
          }
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        patch((t) => ({ ...t, streaming: false }));
        setBusy(false);
      }
    },
    [],
  );

  // The opening question. The ref guards React's dev double-run, the same way
  // Chat.tsx guards the shadow diff.
  useEffect(() => {
    if (opened.current || turns.length || ended) return;
    opened.current = true;
    void runTurn(`/api/sessions/${sessionId}/messages`, {});
  }, [sessionId, turns.length, ended, runTurn]);

  useEffect(() => {
    tail.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const send = (text: string) => {
    const body = text.trim();
    if (!body || busy || ended) return;
    setTurns((prev) => [...prev, { role: "user", key: newKey(), text: body }]);
    setDraft("");
    void runTurn(`/api/sessions/${sessionId}/messages`, { text: body });
  };

  const endSession = () => {
    if (busy || ended) return;
    void runTurn(`/api/sessions/${sessionId}/end`, {});
  };

  return (
    <div className="flex min-h-[calc(100vh-49px)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-2xl space-y-8">
            {rows.map(({ turn: t, showQuestion, hint }) =>
              t.role === "user" ? (
                COMMANDS[t.text.trim().toLowerCase()] ? (
                  <p key={t.key} className="text-right text-[12.5px] text-stone-400">
                    — {COMMANDS[t.text.trim().toLowerCase()]}
                  </p>
                ) : (
                  <div key={t.key} className="flex justify-end">
                    <p className="max-w-[85%] rounded-xl bg-stone-100 px-4 py-2.5 text-[14.5px] leading-[1.6] whitespace-pre-wrap text-stone-800">
                      {t.text}
                    </p>
                  </div>
                )
              ) : (
                <TutorTurn
                  key={t.key}
                  sections={t.sections}
                  streaming={t.streaming}
                  showQuestion={showQuestion}
                  hint={hint}
                />
              ),
            )}

            {busy && !turns.some((t) => t.role === "assistant" && t.streaming) && (
              <Spinner label="thinking…" />
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13.5px] text-red-800">
                {error}
              </p>
            )}
            {ended && (
              <div className="flex gap-4 border-t border-stone-200 pt-5 text-[13px]">
                <button
                  type="button"
                  onClick={() => router.push(`/learn/${courseId}`)}
                  className="text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
                >
                  Back to the course
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/learn/${courseId}/notes`)}
                  className="text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
                >
                  Notes
                </button>
              </div>
            )}
            <div ref={tail} />
          </div>
        </div>

        {!ended && (
          <div className="sticky bottom-0 border-t border-stone-200 bg-stone-50/95 px-6 py-4 backdrop-blur">
            <div className="mx-auto max-w-2xl">
              <div className="rounded-xl border border-stone-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <textarea
                  ref={box}
                  rows={2}
                  value={draft}
                  disabled={busy}
                  placeholder="Your answer…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;
                    e.preventDefault();
                    send(draft);
                  }}
                  className="max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
                />
                <div className="flex items-center gap-3 px-3 pb-3">
                  {/* Every phase ships with its exit, and none of this copy guilts. */}
                  <button
                    type="button"
                    onClick={() => send("hint")}
                    disabled={busy}
                    className="rounded-lg px-2 py-1 text-[13px] text-stone-500 transition hover:text-stone-900 disabled:opacity-40"
                  >
                    Hint
                  </button>
                  <button
                    type="button"
                    onClick={() => send("skip")}
                    disabled={busy}
                    className="rounded-lg px-2 py-1 text-[13px] text-stone-500 transition hover:text-stone-900 disabled:opacity-40"
                  >
                    Skip this one
                  </button>
                  <button
                    type="button"
                    onClick={() => send("status")}
                    disabled={busy}
                    className="rounded-lg px-2 py-1 text-[13px] text-stone-500 transition hover:text-stone-900 disabled:opacity-40"
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => send(draft)}
                    disabled={busy || !draft.trim()}
                    className="ml-auto rounded-lg bg-stone-900 px-4 py-1.5 text-[13.5px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <Spinner /> : "Send"}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex gap-4 text-[12px] text-stone-400">
                <button
                  type="button"
                  onClick={endSession}
                  disabled={busy}
                  className="underline underline-offset-2 transition hover:text-stone-700 disabled:opacity-40"
                >
                  End session — score it and wrap up
                </button>
                {/* Not terminal. The most likely reason to leave is being stuck. */}
                <button
                  type="button"
                  onClick={() => router.push(`/learn/${courseId}`)}
                  className="underline underline-offset-2 transition hover:text-stone-700"
                >
                  Leave for now — this stays where it is
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <CheckpointRail
        topicName={topic.name}
        checkpoints={topic.checkpoints}
        met={met}
        answered={answered}
        maxQuestions={maxQuestions}
      />
    </div>
  );
}

function TutorTurn({
  sections: s,
  streaming,
  showQuestion,
  hint,
}: {
  sections: Sections;
  streaming: boolean;
  showQuestion: boolean;
  /** Set when this turn is a hint: its feedback belongs under the question. */
  hint?: string;
}) {
  const note = s.eval_note?.trim();
  // A hint turn carries no evaluation, so its feedback is not feedback — it goes
  // in the card with the question rather than in the transcript above it.
  const feedback = hint ? undefined : s.tutor_feedback?.trim();
  const question = showQuestion ? s.tutor_question?.trim() : undefined;
  const hintText = hint?.trim();

  return (
    <div className="space-y-4">
      {note && (
        <p className="border-l-2 border-stone-300 pl-3 text-[13.5px] leading-[1.6] text-stone-500">
          <InlineMarkdown>{note}</InlineMarkdown>
        </p>
      )}
      {feedback && (
        <div className="text-[14.5px] leading-[1.7] text-stone-700">
          <Markdown>{feedback}</Markdown>
        </div>
      )}
      {hasWrapup(s) && <Wrapup sections={s} />}
      {question && (
        <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-2 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
            question
          </div>
          <p
            className={`text-[15.5px] leading-[1.6] whitespace-pre-wrap text-stone-900 ${streaming ? "caret-blink" : ""}`}
          >
            <InlineMarkdown>{question}</InlineMarkdown>
          </p>
          {hintText && (
            <div className="animate-fade-up mt-4 border-l-2 border-stone-300 pl-3 text-[14px] leading-[1.7] text-stone-600">
              <InlineMarkdown>{hintText}</InlineMarkdown>
            </div>
          )}
        </div>
      )}
      {streaming && !note && !feedback && !question && !hintText && !hasWrapup(s) && (
        <Spinner label="thinking…" />
      )}
    </div>
  );
}

function Wrapup({ sections: s }: { sections: Sections }) {
  const Block = ({ label, body }: { label: string; body?: string }) =>
    body?.trim() ? (
      <div>
        <div className="mb-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
          {label}
        </div>
        <div className="text-[14px] leading-[1.7] text-stone-700">
          <Markdown>{body.trim()}</Markdown>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4 rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
          session score
        </span>
        <span className="text-[17px] font-medium text-stone-900">{s.wrapup_score?.trim()}</span>
      </div>
      <Block label="what held up" body={s.wrapup_strengths} />
      <Block label="where it got thin" body={s.wrapup_gaps} />
      <Block label="worth remembering" body={s.wrapup_takeaways} />
      <Block label="go read" body={s.wrapup_deep_dive} />
    </div>
  );
}
