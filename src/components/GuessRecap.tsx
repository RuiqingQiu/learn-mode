"use client";

import { useState } from "react";
import CodeBlock from "./CodeBlock";
import InlineMarkdown from "./InlineMarkdown";
import type { Confidence, PredictPrompt } from "@/lib/types";

const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "low", med: "medium", high: "high" };

/**
 * The one-line "You guessed:" summary, expandable back to the full prediction —
 * the question, every option, which one you took, and which one was right.
 *
 * Deliberately no ✓/✗ and no red/green: §4.3 rules out rendering a verdict. The
 * labels are neutral so this reads as a record of what you committed to, not a
 * grade.
 */
export default function GuessRecap({
  prompt,
  choiceId,
  freeText,
  confidence,
  correctOption,
}: {
  prompt: PredictPrompt | null;
  choiceId: string | null;
  freeText: string | null;
  confidence: Confidence | null;
  correctOption: string | null;
}) {
  const [open, setOpen] = useState(false);
  const chosen = prompt?.options?.find((o) => o.id === choiceId);
  const summary = chosen?.label ?? freeText ?? "";
  if (!summary) return null;

  return (
    <div className="text-[13px] text-stone-500">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-start gap-1.5 text-left transition hover:text-stone-700"
      >
        <span
          className={`mt-[3px] inline-block shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
        <span>
          You guessed: <span className="text-stone-700 group-hover:text-stone-900">{summary}</span>
          {confidence && ` · ${CONFIDENCE_LABEL[confidence]} confidence`}
        </span>
      </button>

      {open && (
        <div className="animate-fade-up mt-3 ml-4 space-y-3 border-l border-stone-200 pl-4">
          {prompt && (
            <p className="text-[14px] leading-[1.6] text-stone-600">
              <InlineMarkdown>{prompt.prompt_text}</InlineMarkdown>
            </p>
          )}

          {prompt?.options?.length ? (
            <div className="space-y-1.5">
              {prompt.options.map((o) => {
                const yours = o.id === choiceId;
                const right = o.id === correctOption;
                return (
                  <div
                    key={o.id}
                    className={`rounded-lg border p-2.5 ${
                      right ? "border-stone-400 bg-white" : "border-stone-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={`text-[13.5px] ${right ? "text-stone-900" : "text-stone-500"}`}>
                        <InlineMarkdown>{o.label}</InlineMarkdown>
                      </span>
                      <span className="mt-[1px] flex shrink-0 gap-1.5">
                        {yours && (
                          <span className="rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-stone-600 uppercase">
                            yours
                          </span>
                        )}
                        {right && (
                          <span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white uppercase">
                            answer
                          </span>
                        )}
                      </span>
                    </div>
                    {o.code && (
                      <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2">
                        <CodeBlock code={o.code} language="tsx" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            freeText && (
              <p className="rounded-lg border border-stone-200 p-2.5 text-[13.5px] whitespace-pre-wrap text-stone-600">
                {freeText}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
