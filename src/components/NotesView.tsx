"use client";

import Link from "next/link";
import { useState } from "react";
import Markdown from "./Markdown";
import type { CourseSessionRecord, WeakArea } from "@/lib/types";

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The `weak-areas.md` and session-note files the practice skill used to write by
 * hand, as rendered views over what the app already stores. Export keeps them
 * portable back out to files — the app owning the bookkeeping should not mean
 * the bookkeeping is trapped in it.
 */
function toMarkdown(
  courseTitle: string,
  topicNames: Record<string, string>,
  weakAreas: (WeakArea & { topicId: string })[],
  sessions: CourseSessionRecord[],
): string {
  const out: string[] = [`# ${courseTitle} — Notes`, ""];

  out.push("## Weak Areas", "");
  if (!weakAreas.length) out.push("_Nothing recorded yet._", "");
  for (const w of weakAreas) {
    out.push(
      `- \`${w.tag}\` — ${topicNames[w.topicId] ?? w.topicId}, seen ${w.seenCount}×, last ${date(w.lastSeenAt)}${w.imported ? " _(imported)_" : ""}`,
    );
  }
  out.push("");

  for (const s of sessions) {
    if (!s.summary) continue;
    out.push(
      `## ${topicNames[s.topic_id] ?? s.topic_id} — Session Notes (${date(s.started_at)})`,
      "",
      `**Score:** ${s.summary.score}`,
      "",
      "### What I Got Right",
      ...s.summary.strengths.map((x) => `- ${x}`),
      "",
      "### Corrections & New Knowledge",
      ...s.summary.gaps.map((x) => `- ${x}`),
      "",
      "### Mental Models to Internalize",
      ...s.summary.takeaways.map((x) => `- ${x}`),
      "",
      "### Recommended Deep-Dive",
      s.summary.deepDive || "_none_",
      "",
      "### Questions Asked",
      ...s.evaluations.map((e) => `- **${e.rating}** — ${e.question}${e.note ? `\n  - ${e.note}` : ""}`),
      "",
    );
  }
  return out.join("\n");
}

export default function NotesView({
  courseId,
  courseTitle,
  topicNames,
  weakAreas,
  sessions,
}: {
  courseId: string;
  courseTitle: string;
  topicNames: Record<string, string>;
  weakAreas: (WeakArea & { topicId: string })[];
  sessions: CourseSessionRecord[];
}) {
  const [copied, setCopied] = useState(false);

  const download = () => {
    const md = toMarkdown(courseTitle, topicNames, weakAreas, sessions);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseId}-notes.md`;
    a.click();
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-baseline gap-4">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-stone-900">Notes</h1>
        <Link
          href={`/learn/${courseId}`}
          className="text-[13px] text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
        >
          {courseTitle}
        </Link>
        <button
          type="button"
          onClick={download}
          className="ml-auto rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[13px] text-stone-700 transition hover:border-stone-400"
        >
          {copied ? "Exported" : "Export as markdown"}
        </button>
      </div>

      <section className="mb-10">
        <div className="mb-3 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
          weak areas — most recurrent first
        </div>
        {!weakAreas.length ? (
          <p className="text-[14px] text-stone-500">Nothing recorded yet.</p>
        ) : (
          <div className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {weakAreas.map((w) => (
              <div key={`${w.topicId}:${w.tag}`} className="flex items-baseline gap-3 px-4 py-2.5">
                <code className="font-mono text-[12.5px] text-stone-800">{w.tag}</code>
                <span className="text-[12.5px] text-stone-500">
                  {topicNames[w.topicId] ?? w.topicId}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-stone-400">
                  {/* Imported rows predate the authored taxonomy. Saying so keeps
                      the aggregation honest about where the number came from. */}
                  {w.imported ? "imported · " : ""}
                  {w.seenCount}×
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
          session notes
        </div>
        {!sessions.length && <p className="text-[14px] text-stone-500">No finished sessions yet.</p>}
        {sessions.map((s) => (
          <article
            key={s.id}
            className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-[15px] font-medium text-stone-900">
                {topicNames[s.topic_id] ?? s.topic_id}
              </h2>
              <span className="font-mono text-[11px] text-stone-400">{date(s.started_at)}</span>
              <span className="ml-auto text-[14px] font-medium text-stone-900">
                {s.summary?.score}
              </span>
            </div>
            <div className="space-y-3 text-[13.5px] leading-[1.7] text-stone-700">
              {(
                [
                  ["what held up", s.summary?.strengths],
                  ["where it got thin", s.summary?.gaps],
                  ["worth remembering", s.summary?.takeaways],
                ] as const
              ).map(([label, items]) =>
                items?.length ? (
                  <div key={label}>
                    <div className="mb-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
                      {label}
                    </div>
                    <Markdown>{items.map((x) => `- ${x}`).join("\n")}</Markdown>
                  </div>
                ) : null,
              )}
              {s.summary?.deepDive && (
                <div>
                  <div className="mb-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
                    go read
                  </div>
                  <Markdown>{s.summary.deepDive}</Markdown>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
