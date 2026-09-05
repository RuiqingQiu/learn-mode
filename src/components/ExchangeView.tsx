"use client";

import GuessRecap from "./GuessRecap";
import Markdown from "./Markdown";
import PredictionCard from "./PredictionCard";
import QuizCard from "./QuizCard";
import RevealCard from "./RevealCard";
import Spinner from "./Spinner";
import TeachPanel from "./TeachPanel";
import type { LiveExchange } from "@/lib/client";
import { useState } from "react";
import type { Confidence, QuizKind } from "@/lib/types";

export default function ExchangeView({
  ex,
  busy,
  onSubmitPrediction,
  onHint,
  onSkip,
  onExplainBack,
  onTeachReply,
  onPauseTeaching,
  onResumeTeaching,
  onAskMainChat,
  onClearTeaching,
  renderTeach,
  quizKind,
  onQuizAnswer,
  onQuizDismiss,
}: {
  ex: LiveExchange;
  busy: boolean;
  onSubmitPrediction: (text: string, confidence: Confidence | null) => void;
  onHint: () => void;
  onSkip: () => void;
  onExplainBack: () => void;
  onTeachReply: (text: string) => void;
  onPauseTeaching: () => void;
  onResumeTeaching: (needsNewTurn: boolean) => void;
  onAskMainChat: () => void;
  onClearTeaching: () => void;
  /** False while this session is floated to the end of the thread instead. */
  renderTeach: boolean;
  quizKind: QuizKind;
  onQuizAnswer: (questionId: string, text: string) => void;
  onQuizDismiss: () => void;
}) {
  const [peeked, setPeeked] = useState(false);

  // Retrieval only works if the answer is not sitting there to be read off — but
  // only once there is actually something to answer. Hiding it while the questions
  // are still being written just leaves the user staring at a spinner, and hiding
  // it after the last one is answered contradicts what the card says.
  const quizzing = (ex.quiz.length > 0 || ex.quizPending) && !ex.quizDismissed;
  const quizDone = ex.quiz.length > 0 && ex.quiz.every((q) => q.user_answer !== null);
  const answerHidden = quizzing && ex.quiz.length > 0 && !quizDone && !peeked;

  const showTeach =
    renderTeach && (ex.teach.turns.length > 0 || ex.teach.pending || ex.status === "teaching");

  return (
    <div id={`ex-${ex.id}`} className="space-y-4 border-b border-stone-200 py-8 last:border-b-0">
      <div className="flex items-start gap-3">
        <p className="text-[17px] leading-[1.5] font-medium tracking-[-0.01em] whitespace-pre-wrap text-stone-900">
          {ex.question}
        </p>
        {ex.mode === "learn" && (
          <span className="mt-1 shrink-0 rounded bg-stone-200/70 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-stone-600 uppercase">
            learn
          </span>
        )}
      </div>

      {/* §4.1 — say why there is no prediction, or the toggle just looks broken. */}
      {ex.mode === "learn" && ex.triage === "lookup" && (
        <p className="text-[13px] text-stone-500">Straight lookup — here&apos;s the answer.</p>
      )}

      {ex.context_exchange_id && (
        <p className="text-[12.5px] text-stone-400">Sent with your explain-back transcript.</p>
      )}

      {ex.status === "answering" && !ex.answerText && (
        <Spinner
          label={ex.mode === "learn" ? "working out a question for you" : "thinking"}
        />
      )}

      {ex.answerText && (
        <div className={ex.status === "answering" ? "caret-blink" : ""}>
          <Markdown>{ex.answerText}</Markdown>
        </div>
      )}

      {ex.status === "predicting" && ex.prompt && (
        <PredictionCard
          prompt={ex.prompt}
          hint={ex.hint}
          hintPending={ex.hintPending}
          busy={busy}
          onSubmit={onSubmitPrediction}
          onHint={onHint}
          onSkip={onSkip}
        />
      )}

      {ex.submitted && !ex.submitted.skipped && (
        <GuessRecap
          prompt={ex.prompt}
          choiceId={ex.prompt?.options?.length ? ex.submitted.text : null}
          freeText={ex.prompt?.options?.length ? null : ex.submitted.text}
          confidence={ex.submitted.confidence}
          correctOption={ex.correctOption}
        />
      )}

      {ex.revealStreaming && !ex.sections.gist && <Spinner label="writing the answer" />}

      {answerHidden && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-stone-300 px-3.5 py-2.5">
          <span className="text-[13.5px] text-stone-500">
            Answer hidden while you recall it.
          </span>
          <button
            type="button"
            onClick={() => setPeeked(true)}
            className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
          >
            Show it anyway
          </button>
        </div>
      )}

      {!answerHidden && (ex.sections.gist || ex.revealStreaming) && (
        <RevealCard
          sections={ex.sections}
          streaming={ex.revealStreaming}
          showDelta={!ex.submitted?.skipped}
          canExplainBack={
            // Available as soon as `full` starts arriving — that is the point the
            // server has persisted the answer, and gist/delta/core are complete.
            // Waiting for the whole stream is dead time on the longest section.
            !!ex.sections.full &&
            ex.teach.turns.length === 0 &&
            !ex.teach.pending &&
            (ex.status === "revealed" || ex.status === "revealing")
          }
          onExplainBack={onExplainBack}
        />
      )}

      {quizzing && (
        <QuizCard
          kind={quizKind}
          questions={ex.quiz}
          pending={ex.quizPending}
          onAnswer={onQuizAnswer}
          onDismiss={onQuizDismiss}
        />
      )}

      {showTeach && (
        <TeachPanel
          turns={ex.teach.turns}
          streaming={ex.teach.streaming}
          pending={ex.teach.pending}
          closed={ex.teach.closed}
          paused={ex.teach.paused}
          summary={ex.teach.summary}
          onSend={onTeachReply}
          askingMainChat={ex.teach.askingMainChat}
          onPause={onPauseTeaching}
          onAskMainChat={onAskMainChat}
          onClear={onClearTeaching}
          onResume={() =>
            // If you paused after replying, resuming needs a fresh junior turn.
            onResumeTeaching(ex.teach.turns[ex.teach.turns.length - 1]?.user !== null)
          }
        />
      )}

      {ex.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800">
          {ex.error}
        </p>
      )}
    </div>
  );
}
