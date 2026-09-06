"use client";

import { useState } from "react";

import InlineMarkdown from "./InlineMarkdown";
import Markdown from "./Markdown";
import Spinner from "./Spinner";
import type { LiveExchange } from "@/lib/client";
import type { Confidence, ShadowAxis } from "@/lib/types";

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: "low", label: "low" },
  { value: "med", label: "medium" },
  { value: "high", label: "high" },
];

/**
 * `axis | yours | claude | tag`, one row per line. Parsed out of a streamed text
 * section rather than requested as structured output, so rows appear as they
 * arrive — a design task takes long enough that watching the diff assemble beats
 * watching a spinner.
 */
export function parseAxes(raw: string): ShadowAxis[] {
  const out: ShadowAxis[] = [];
  for (const line of raw.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !cells[0]) continue;
    const tag = cells[3].toLowerCase();
    out.push({
      axis: cells[0],
      yours: cells[1] || "—",
      claude: cells[2] || "—",
      tag: tag === "agree" || tag === "gap" || tag === "user-ahead" ? tag : "diverge",
    });
  }
  return out;
}

/** No red/green and no ✓/✗ anywhere — a record of two designs, not a grade. */
const TAG_STYLE: Record<ShadowAxis["tag"], string> = {
  agree: "bg-stone-100 text-stone-400",
  diverge: "bg-stone-200/70 text-stone-600",
  gap: "bg-stone-800 text-white",
  "user-ahead": "bg-stone-800 text-white",
};

const ROW = "grid grid-cols-[1.1fr_1.4fr_1.4fr_5.5rem] gap-x-4";

export default function ShadowCard({
  ex,
  busy,
  onCommit,
  onSkip,
  onProbe,
  onHint,
}: {
  ex: LiveExchange;
  busy: boolean;
  onCommit: (approach: string, confidence: Confidence | null) => void;
  onSkip: () => void;
  onProbe: (answer: string) => void;
  onHint: () => void;
}) {
  const s = ex.shadow;
  const [approach, setApproach] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [probe, setProbe] = useState("");
  const [reasoning, setReasoning] = useState(false);

  const axes = parseAxes(s.sections.axes ?? "");
  const strongPoint = s.sections.strong_point?.trim();
  const probeAnswered = s.probeAnswer !== null;
  // A skipped probe stores an empty answer and no feedback — render nothing
  // rather than an empty bordered block commenting on the skip by existing.
  const probeRecord = !!s.probeAnswer || !!s.probeFeedback;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* ── YOU ── */}
        <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">you</div>

          {s.committed || s.skipped ? (
            <p className="text-[14px] leading-[1.7] whitespace-pre-wrap text-stone-700">
              {s.skipped ? (
                <span className="text-stone-400">You went straight to Claude&rsquo;s approach.</span>
              ) : (
                ex.submitted?.text
              )}
            </p>
          ) : (
            <>
              <textarea
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                rows={7}
                autoFocus
                placeholder="How would you build it? Name the pieces and why."
                className="w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[14px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
              />
              <div className="mt-3 flex items-center gap-3 text-[13px] text-stone-500">
                <span>Confidence</span>
                {CONFIDENCE.map((c) => (
                  <label key={c.value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`shadow-confidence-${ex.key}`}
                      className="accent-stone-800"
                      checked={confidence === c.value}
                      onChange={() => setConfidence(c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── CLAUDE ── */}
        <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
            claude
          </div>

          {s.solution ? (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <Markdown>{s.solution}</Markdown>
            </div>
          ) : s.solving ? (
            <Spinner label="working on it separately…" />
          ) : (
            <div className="relative">
              {/* Placeholder bars, not the real text: the solution is not sent to
                  the browser until you commit, so there is nothing here to peek at. */}
              <div aria-hidden className="space-y-2 blur-[5px]">
                {[95, 78, 88, 60, 92, 71, 84].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-stone-200" style={{ width: `${w}%` }} />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="max-w-[16rem] text-center text-[13px] leading-[1.6] text-stone-500">
                  Claude has an approach.
                  <br />
                  Commit yours to compare.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {!s.committed && !s.skipped && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => onCommit(approach.trim(), confidence)}
            disabled={!approach.trim() || busy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            Commit approach
          </button>
          {/* §1: every screen has an exit, and the copy never guilts you for it. */}
          <button
            onClick={onSkip}
            disabled={busy}
            className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
          >
            Just show me Claude&rsquo;s approach
          </button>
        </div>
      )}

      {s.awaitingSolution && <Spinner label="locked in — waiting for Claude to finish" />}
      {s.diffing && axes.length === 0 && <Spinner label="comparing the two designs" />}

      {/* ── the diff ── */}
      {s.sections.summary && (
        <p className="animate-fade-up text-[15px] leading-[1.7] text-stone-700">
          <InlineMarkdown>{s.sections.summary}</InlineMarkdown>
        </p>
      )}

      {axes.length > 0 && (
        <div className="animate-fade-up overflow-hidden rounded-xl border border-stone-300 bg-white">
          <div
            className={`${ROW} border-b border-stone-200 px-4 py-2 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase`}
          >
            <span>decision</span>
            <span>you</span>
            <span>claude</span>
            <span />
          </div>
          {axes.map((a, i) => (
            <div
              key={i}
              className={`${ROW} items-baseline border-b border-stone-100 px-4 py-2.5 text-[13.5px] leading-[1.5] last:border-b-0`}
            >
              <span className="text-stone-500">
                <InlineMarkdown>{a.axis}</InlineMarkdown>
              </span>
              <span className={a.yours === "—" ? "text-stone-300" : "text-stone-800"}>
                <InlineMarkdown>{a.yours}</InlineMarkdown>
              </span>
              <span className={a.claude === "—" ? "text-stone-300" : "text-stone-800"}>
                <InlineMarkdown>{a.claude}</InlineMarkdown>
              </span>
              <span
                className={`justify-self-start rounded px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide whitespace-nowrap uppercase ${TAG_STYLE[a.tag]}`}
              >
                {a.tag}
              </span>
            </div>
          ))}
        </div>
      )}

      {strongPoint && (
        <div className="animate-fade-up border-l-2 border-stone-800 pl-4 text-[15px] leading-[1.7] text-stone-700">
          <span className="font-semibold text-stone-900">You got there first. </span>
          <InlineMarkdown>{strongPoint}</InlineMarkdown>
        </div>
      )}

      {/* ── the probe: exactly one, on the divergence that costs the most ── */}
      {s.sections.probe_scenario && (
        <div className="animate-fade-up rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-3 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
            interesting divergence
          </div>
          <p className="text-[14.5px] leading-[1.7] text-stone-700">
            <InlineMarkdown>{s.sections.probe_scenario}</InlineMarkdown>
          </p>
          {s.sections.probe_question && (
            <p className="mt-3 text-[15px] leading-[1.7] font-medium text-stone-900">
              <InlineMarkdown>{s.sections.probe_question}</InlineMarkdown>
            </p>
          )}

          {s.hint && (
            <div className="animate-fade-up mt-3 border-l-2 border-stone-300 pl-3 text-[14px] leading-[1.7] text-stone-600">
              <InlineMarkdown>{s.hint}</InlineMarkdown>
            </div>
          )}

          {probeAnswered ? (
            probeRecord && (
            <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
              {s.probeAnswer && (
                <>
                  <p className="text-[13px] text-stone-400">You said:</p>
                  <p className="text-[14px] leading-[1.7] whitespace-pre-wrap text-stone-600">
                    {s.probeAnswer}
                  </p>
                </>
              )}
              {s.probeFeedback && (
                <p className="animate-fade-up pt-1 text-[15px] leading-[1.7] text-stone-800">
                  <InlineMarkdown>{s.probeFeedback}</InlineMarkdown>
                </p>
              )}
            </div>
            )
          ) : s.sections.probe_question && !s.diffing ? (
            <div className="mt-4">
              {reasoning && (
                <textarea
                  value={probe}
                  onChange={(e) => setProbe(e.target.value)}
                  rows={3}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.metaKey && probe.trim()) onProbe(probe.trim());
                  }}
                  placeholder="Work it out…"
                  className="mb-3 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[14px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                />
              )}
              <div className="flex flex-wrap items-center gap-4">
                {reasoning ? (
                  <button
                    onClick={() => onProbe(probe.trim())}
                    disabled={!probe.trim() || s.probePending}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
                  >
                    Answer
                  </button>
                ) : (
                  <button
                    onClick={() => setReasoning(true)}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700"
                  >
                    Let me reason
                  </button>
                )}
                <button
                  onClick={onHint}
                  disabled={s.hintPending || !!s.hint}
                  className="rounded-lg border border-stone-300 px-3.5 py-2 text-[14px] text-stone-700 transition hover:border-stone-500 disabled:opacity-40"
                >
                  {s.hintPending ? <Spinner /> : "Give me a hint"}
                </button>
                {/* Skipping is a first-class path — stored as NULL, never as a miss. */}
                <button
                  onClick={() => onProbe("")}
                  className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
                >
                  Skip it
                </button>
              </div>
              {s.probePending && (
                <div className="mt-3">
                  <Spinner label="reading your answer" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
