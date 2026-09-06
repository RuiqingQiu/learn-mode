"use client";

import { useState } from "react";

import InlineMarkdown from "./InlineMarkdown";
import Spinner from "./Spinner";
import type { Challenge } from "@/lib/types";

const ago = (ts: number) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "A moment ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

/**
 * A belief you got wrong earlier, re-tested in a different domain with nothing on
 * screen to read from. Everything else in this product measures what happens
 * while the explanation is still in front of you; this is the only thing that
 * measures what survived after it was gone.
 */
export default function ChallengeCard({
  challenge,
  pending,
  correct,
  feedback,
  onAnswer,
  onDismiss,
}: {
  challenge: Challenge;
  pending: boolean;
  correct: boolean | null;
  feedback: string | null;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
}) {
  const [text, setText] = useState("");
  const [showBelief, setShowBelief] = useState(false);
  const answered = feedback !== null;

  return (
    <div className="animate-fade-up rounded-xl border border-stone-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="border-b border-stone-200 px-4 py-2.5">
        <span className="font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
          from earlier
        </span>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-[13.5px] text-stone-500">
          {ago(challenge.createdAt)} you got something wrong about{" "}
          <span className="text-stone-700">{challenge.sourceQuestion}</span>
          {" — "}
          <button
            type="button"
            onClick={() => setShowBelief((v) => !v)}
            className="underline underline-offset-2 transition hover:text-stone-800"
          >
            {showBelief ? "hide what I said" : "remind me what I said"}
          </button>
        </p>

        {showBelief && (
          <p className="animate-fade-up border-l-2 border-stone-300 pl-3 text-[14px] leading-[1.7] whitespace-pre-wrap text-stone-500">
            {challenge.believed}
          </p>
        )}

        <p className="text-[16px] leading-[1.7] font-medium tracking-[-0.01em] text-stone-900">
          <InlineMarkdown>{challenge.question}</InlineMarkdown>
        </p>

        {answered ? (
          <div className="space-y-3 border-t border-stone-200 pt-4">
            {correct && (
              <p className="animate-fade-up text-[15px] leading-[1.7] font-medium text-stone-900">
                Transfer demonstrated — you applied it in a new domain, unassisted.
              </p>
            )}
            {feedback && (
              <p className="text-[15px] leading-[1.7] text-stone-700">
                <InlineMarkdown>{feedback}</InlineMarkdown>
              </p>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey && text.trim()) onAnswer(text.trim());
              }}
              placeholder="No hints on this one — what do you think?"
              className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[14px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onAnswer(text.trim())}
                disabled={!text.trim() || pending}
                className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
              >
                Answer
              </button>
              {/* Skipping is a first-class path and is never commented on. */}
              <button
                type="button"
                onClick={onDismiss}
                disabled={pending}
                className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
              >
                Not now
              </button>
            </div>
            {pending && <Spinner label="reading your answer" />}
          </>
        )}
      </div>
    </div>
  );
}
