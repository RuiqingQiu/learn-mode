"use client";

import Link from "next/link";
import { api } from "@/lib/client";
import { useLoader } from "@/lib/use-loader";
import TopicList from "./TopicList";
import { PageError, PageLoading } from "./PageState";

export default function CourseOverview({ courseId }: { courseId: string }) {
  const { data, error } = useLoader(() => api.getCourse(courseId), [courseId]);
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;

  const { course, enrollment, progress } = data;
  const byTopic = new Map(progress.map((p) => [p.topic_id, p]));
  const statusOf = (id: string) => byTopic.get(id)?.status ?? "not_started";

  const total = course.topics.length;
  const count = (s: string) => course.topics.filter((t) => statusOf(t.id) === s).length;

  // Resume the topic in flight; failing that, the first untouched one whose
  // prerequisites are done. Prereqs are advisory — see the banner in TopicList.
  const resume =
    course.topics.find((t) => statusOf(t.id) === "in_progress") ??
    course.topics.find(
      (t) =>
        statusOf(t.id) === "not_started" && t.prereqs.every((p) => statusOf(p) === "completed"),
    ) ??
    course.topics.find((t) => statusOf(t.id) === "needs_review") ??
    course.topics[0];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-medium tracking-[-0.01em] text-stone-900">{course.title}</h1>
      <p className="mt-1 text-[14px] leading-[1.6] text-stone-500">{course.description}</p>

      <div className="mt-6 mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12.5px] text-stone-600">
        <span>✅ Completed: {count("completed")}/{total}</span>
        <span>🔄 In Progress: {count("in_progress")}/{total}</span>
        <span>🔁 Needs Review: {count("needs_review")}/{total}</span>
        <span>⬜ Not Started: {count("not_started")}/{total}</span>
        {enrollment && (
          <Link
            href={`/learn/${courseId}/notes`}
            className="ml-auto font-sans text-[13px] text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
          >
            Notes
          </Link>
        )}
      </div>

      <TopicList
        courseId={courseId}
        topics={course.topics}
        progress={progress}
        resumeTopicId={resume?.id ?? null}
      />
    </div>
  );
}
