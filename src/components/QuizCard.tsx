"use client";

import { useState } from "react";
import InlineMarkdown from "./InlineMarkdown";
import Spinner from "./Spinner";
import type { QuizKind, QuizQuestion } from "@/lib/types";

/**
 * Retrieval practice. The answer is hidden while this runs — pulling it back out
 * is the point, and re-reading it is what feels like learning without being it.
 * "Show me the answer" is always one click away (§1).
 */
export default function QuizCard({
  kind,
  questions,
  pending,
  onAnswer,
  onDismiss,
}: {
  kind: QuizKind;
  questions: QuizQuestion[];
  pending: boolean;
  onAnswer: (questionId: string, text: string) => void;
  onDismiss: () => void;
}) {
  const [text, setText] = useState("");

  const current = questions.find((q) => q.user_answer === null) ?? null;
  const answered = questions.filter((q) => q.user_answer !== null);
  const done = questions.length > 0 && !current;

  const submit = (body: string) => {
    if (!body.trim() || !current || pending) return;
    setText("");
    onAnswer(current.id, body.trim());
  };

  return (
    <div className="rounded-xl border border-stone-300 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
        <span className="text-[12px] font-medium tracking-wide text-stone-500 uppercase">
          {kind === "transfer" ? "Transfer probe" : "From memory"}
          {questions.length > 1 && (
            <span className="ml-2 font-mono text-[11px] tracking-normal text-stone-400 normal-case">
              {Math.min(answered.length + 1, questions.length)}/{questions.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
        >
          {done ? "Close" : "Skip this"}
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        {answered.map((q) => (
          <div key={q.id} className="space-y-1.5 border-l-2 border-stone-200 pl-3">
            <p className="text-[14px] leading-[1.6] text-stone-500">
              <InlineMarkdown>{q.question}</InlineMarkdown>
            </p>
            <p className="text-[14px] leading-[1.6] whitespace-pre-wrap text-stone-700">{q.user_answer}</p>
            {q.feedback && (
              <p className="text-[14px] leading-[1.65] text-stone-600">
                <InlineMarkdown>{q.feedback}</InlineMarkdown>
              </p>
            )}
          </div>
        ))}

        {current && (
          <div>
            <p className="text-[15.5px] leading-[1.6] text-stone-900">
              <InlineMarkdown>{current.question}</InlineMarkdown>
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              disabled={pending}
              placeholder="From memory — a sentence or two."
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(text);
              }}
              className="mt-3 w-full resize-none rounded-lg border border-stone-300 p-3 text-[15px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => submit(text)}
                disabled={!text.trim() || pending}
                className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Answer
              </button>
              <span className="text-[12px] text-stone-400">⌘↵</span>
              {/* Not knowing is a normal outcome, and it is still retrieval. */}
              <button
                type="button"
                onClick={() => submit("I don't know")}
                disabled={pending}
                className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700 disabled:opacity-50"
              >
                I don&apos;t know
              </button>
            </div>
          </div>
        )}

        {pending && <Spinner label={current ? "checking" : "writing the questions"} />}

        {done && (
          <p className="text-[13.5px] text-stone-500">
            That&apos;s all of them. The answer is back above.
          </p>
        )}
      </div>
    </div>
  );
}
