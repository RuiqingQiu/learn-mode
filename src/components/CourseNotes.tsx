"use client";

import Link from "next/link";
import { api } from "@/lib/client";
import { useLoader } from "@/lib/use-loader";
import NotesView from "./NotesView";
import { PageError, PageLoading } from "./PageState";

/** The enrollment id is not in the URL, so the course comes first and the notes hang off it. */
async function load(courseId: string) {
  const { course, enrollment } = await api.getCourse(courseId);
  if (!enrollment) return { course, notes: null };
  return { course, notes: await api.courseNotes(enrollment.id) };
}

export default function CourseNotes({ courseId }: { courseId: string }) {
  const { data, error } = useLoader(() => load(courseId), [courseId]);
  if (error) return <PageError message={error} />;
  if (!data) return <PageLoading />;

  const { course, notes } = data;
  if (!notes) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-[14px] text-stone-500">
          Nothing yet.{" "}
          <Link href={`/learn/${courseId}`} className="underline underline-offset-2">
            Start a topic
          </Link>{" "}
          and the notes build themselves.
        </p>
      </div>
    );
  }

  return (
    <NotesView
      courseId={courseId}
      courseTitle={course.title}
      topicNames={Object.fromEntries(course.topics.map((t) => [t.id, t.name]))}
      weakAreas={notes.weakAreas}
      sessions={notes.sessions}
    />
  );
}
