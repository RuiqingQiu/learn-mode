import Link from "next/link";
import { notFound } from "next/navigation";
import * as repo from "@/lib/repo";
import NotesView from "@/components/NotesView";

export const dynamic = "force-dynamic";

export default async function NotesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const course = repo.getCourse(courseId);
  if (!course) notFound();

  const enrollment = repo.getEnrollment(courseId);
  if (!enrollment) {
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

  const { weakAreas, sessions } = repo.notesFor(enrollment.id);
  const topicNames = Object.fromEntries(course.topics.map((t) => [t.id, t.name]));

  return (
    <NotesView
      courseId={courseId}
      courseTitle={course.title}
      topicNames={topicNames}
      weakAreas={weakAreas}
      sessions={sessions}
    />
  );
}
