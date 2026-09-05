"use client";

import { useState } from "react";
import CodeBlock from "./CodeBlock";
import InlineMarkdown from "./InlineMarkdown";
import Spinner from "./Spinner";
import type { Confidence, PredictPrompt } from "@/lib/types";

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: "low", label: "low" },
  { value: "med", label: "medium" },
  { value: "high", label: "high" },
];

export default function PredictionCard({
  prompt,
  hint,
  hintPending,
  busy,
  onSubmit,
  onHint,
  onSkip,
}: {
  prompt: PredictPrompt;
  hint: string | null;
  hintPending: boolean;
  busy: boolean;
  onSubmit: (text: string, confidence: Confidence | null) => void;
  onHint: () => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  const isChoice = prompt.type !== "open" && !!prompt.options?.length;
  const value = isChoice ? choice : text.trim();
  const canSubmit = !!value && !busy;

  return (
    <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[13px] font-medium tracking-wide text-stone-500">
        Before I answer — what&apos;s your current guess?
      </p>

      <p className="mt-2 text-[16px] leading-[1.55] text-stone-900">
        <InlineMarkdown>{prompt.prompt_text}</InlineMarkdown>
      </p>

      {isChoice ? (
        <div className="mt-4 space-y-2">
          {prompt.options!.map((o) => {
            const selected = choice === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() => setChoice(o.id)}
                className={`block w-full rounded-lg border p-3 text-left transition ${
                  selected
                    ? "border-stone-800 bg-stone-50 ring-1 ring-stone-800"
                    : "border-stone-200 hover:border-stone-400"
                } disabled:opacity-60`}
              >
                <span className="text-[14px] text-stone-800">
                  <InlineMarkdown>{o.label}</InlineMarkdown>
                </span>
                {o.code && (
                  <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2.5">
                    <CodeBlock code={o.code} language="tsx" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Your guess — a sentence is plenty."
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) onSubmit(text.trim(), confidence);
          }}
          className="mt-4 w-full resize-none rounded-lg border border-stone-300 bg-white p-3 text-[15px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none disabled:opacity-60"
        />
      )}

      {hint && (
        <p className="animate-fade-up mt-4 border-l-2 border-stone-300 pl-3 text-[14px] leading-[1.6] text-stone-600">
          {hint}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[13px] text-stone-500">Confidence:</span>
        {CONFIDENCE.map((c) => (
          <label key={c.value} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-stone-700">
            <input
              type="radio"
              name="confidence"
              checked={confidence === c.value}
              onChange={() => setConfidence(c.value)}
              disabled={busy}
              className="accent-stone-800"
            />
            {c.label}
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(value!, confidence)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit
        </button>

        {/* §4.2 — "no idea" must not dead-end. One hint, then a clean exit. */}
        {hint ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="rounded-lg border border-stone-300 px-4 py-2 text-[14px] text-stone-700 transition hover:border-stone-500 disabled:opacity-50"
          >
            Still no idea — show me
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || hintPending}
            onClick={onHint}
            className="rounded-lg border border-stone-300 px-4 py-2 text-[14px] text-stone-700 transition hover:border-stone-500 disabled:opacity-50"
          >
            {hintPending ? <Spinner /> : "No idea — give me a hint"}
          </button>
        )}

        {/* §1 — the escape hatch, on every screen, never guilt-tripped. */}
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700 disabled:opacity-50"
        >
          Just answer it
        </button>
      </div>
    </div>
  );
}
