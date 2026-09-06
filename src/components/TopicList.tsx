"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import Spinner from "./Spinner";
import type { CourseTopicRecord, TopicProgressRecord, TopicStatus } from "@/lib/types";

const ICON: Record<TopicStatus, string> = {
  completed: "✅",
  in_progress: "🔄",
  needs_review: "🔁",
  not_started: "⬜",
};

export default function TopicList({
  courseId,
  topics,
  progress,
  resumeTopicId,
}: {
  courseId: string;
  topics: CourseTopicRecord[];
  progress: TopicProgressRecord[];
  resumeTopicId: string | null;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byTopic = new Map(progress.map((p) => [p.topic_id, p]));
  const statusOf = (id: string) => byTopic.get(id)?.status ?? "not_started";

  async function start(topicId: string) {
    setStarting(topicId);
    setError(null);
    try {
      const { session } = await api.startCourseSession(courseId, topicId);
      router.push(`/learn/${courseId}/session/${session.id}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting(null);
    }
  }

  return (
    <div>
      {resumeTopicId && (
        <button
          type="button"
          onClick={() => start(resumeTopicId)}
          disabled={!!starting}
          className="mb-6 rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {starting === resumeTopicId ? (
            <Spinner />
          ) : (
            `Resume — ${topics.find((t) => t.id === resumeTopicId)?.name}`
          )}
        </button>
      )}

      {error && <p className="mb-4 text-[13px] text-red-800">{error}</p>}

      <div className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {topics.map((t) => {
          const p = byTopic.get(t.id);
          // Advisory, never a block: interrupting somebody to tell them they may
          // not learn a thing yet is the fastest way to make this feel hostile.
          // Nothing to warn about on a topic you have already finished.
          const unmet =
            statusOf(t.id) === "completed"
              ? []
              : t.prereqs.filter((id) => statusOf(id) !== "completed");
          return (
            <div key={t.id} className="flex items-start gap-3 p-4">
              <span aria-hidden className="mt-0.5 text-[13px]">
                {ICON[statusOf(t.id)]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-medium text-stone-900">{t.name}</div>
                <p className="mt-0.5 text-[13px] leading-[1.6] text-stone-500">{t.summary}</p>
                <div className="mt-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
                  {statusOf(t.id).replace("_", " ")}
                  {p?.score != null && ` · scored ${p.score}`}
                  {p?.attempts ? ` · ${p.attempts} attempt${p.attempts === 1 ? "" : "s"}` : ""}
                  {p?.checkpoints_met.length
                    ? ` · ${p.checkpoints_met.length}/${t.checkpoints.length} checkpoints`
                    : ""}
                </div>
                {unmet.length > 0 && (
                  <p className="mt-1.5 text-[12.5px] leading-[1.6] text-stone-500">
                    Usually comes after{" "}
                    {unmet.map((id) => topics.find((x) => x.id === id)?.name ?? id).join(", ")}. You can
                    start anyway.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => start(t.id)}
                disabled={!!starting}
                className="shrink-0 text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-900 disabled:opacity-40"
              >
                {starting === t.id ? <Spinner /> : statusOf(t.id) === "not_started" ? "Start" : "Again"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
