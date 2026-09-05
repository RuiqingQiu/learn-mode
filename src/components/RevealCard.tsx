"use client";

import { useState } from "react";
import InlineMarkdown from "./InlineMarkdown";
import Markdown from "./Markdown";
import Spinner from "./Spinner";
import type { SectionName } from "@/lib/types";

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      ▸
    </span>
  );
}

export default function RevealCard({
  sections,
  streaming,
  showDelta,
  canExplainBack,
  onExplainBack,
}: {
  sections: Partial<Record<SectionName, string>>;
  streaming: boolean;
  /** §4.3 — the delta is skipped entirely when the user skipped the prediction. */
  showDelta: boolean;
  canExplainBack: boolean;
  onExplainBack: () => void;
}) {
  const [coreOpen, setCoreOpen] = useState(true);
  const [fullOpen, setFullOpen] = useState(false);

  const gist = sections.gist?.trim();
  const heldUp = sections.held_up?.trim();
  const off = sections.off?.trim();
  const core = sections.core?.trim();
  const full = sections.full?.trim();
  const hasDelta = showDelta && (heldUp || off);

  return (
    <div className="space-y-5">
      {gist && (
        <p
          className={`text-[19px] leading-[1.5] font-medium tracking-[-0.01em] text-stone-900 ${
            streaming && !heldUp && !core ? "caret-blink" : ""
          }`}
        >
          <InlineMarkdown>{gist}</InlineMarkdown>
        </p>
      )}

      {hasDelta && (
        <div className="animate-fade-up space-y-3 border-l-2 border-stone-300 pl-4">
          {heldUp && (
            <p className="text-[15px] leading-[1.7] text-stone-700">
              <span className="font-medium text-stone-900">Held up. </span>
              <InlineMarkdown>{heldUp}</InlineMarkdown>
            </p>
          )}
          {off && (
            <p className="text-[15px] leading-[1.7] text-stone-700">
              <span className="font-medium text-stone-900">Off. </span>
              <InlineMarkdown>{off}</InlineMarkdown>
            </p>
          )}
        </div>
      )}

      {core && (
        <div>
          <button
            type="button"
            onClick={() => setCoreOpen((v) => !v)}
            className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-stone-400 uppercase transition hover:text-stone-600"
          >
            <Chevron open={coreOpen} />
            Why
          </button>
          {coreOpen && (
            <p className="text-[15px] leading-[1.7] text-stone-700">
              <InlineMarkdown>{core}</InlineMarkdown>
            </p>
          )}
        </div>
      )}

      {full && (
        <div>
          <button
            type="button"
            onClick={() => setFullOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[14px] text-stone-500 transition hover:text-stone-800"
          >
            <Chevron open={fullOpen} />
            {fullOpen ? "Hide full answer" : "Show full answer"}
            {/* `full` is the bulk of the tokens and arrives last — say so, or the
                button looks like a finished thing that is quietly still growing. */}
            {streaming && <span className="text-stone-400">· still writing</span>}
            {streaming && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-stone-300 border-t-stone-500" />
            )}
          </button>
          {fullOpen && (
            <div className="animate-fade-up mt-3 rounded-lg border border-stone-200 bg-white p-4">
              <Markdown>{full}</Markdown>
              {streaming && (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  <Spinner label="still writing" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canExplainBack && (
        <button
          type="button"
          onClick={onExplainBack}
          className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3.5 py-2 text-[14px] text-stone-700 transition hover:border-stone-500 hover:bg-white"
        >
          Explain it back <span aria-hidden>▸</span>
        </button>
      )}
    </div>
  );
}
