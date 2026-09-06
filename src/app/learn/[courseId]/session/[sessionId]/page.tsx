import { notFound } from "next/navigation";
import * as repo from "@/lib/repo";
import SessionChat from "@/components/SessionChat";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ courseId: string; sessionId: string }>;
}) {
  const { courseId, sessionId } = await params;
  const ctx = repo.tutorContext(sessionId);
  if (!ctx || ctx.course.id !== courseId) notFound();

  return (
    <SessionChat
      courseId={courseId}
      sessionId={sessionId}
      topic={ctx.topic}
      transcript={ctx.session.transcript}
      ended={!!ctx.session.ended_at}
      checkpointsMet={ctx.progress?.checkpoints_met ?? []}
      answered={ctx.session.evaluations.length}
      maxQuestions={ctx.course.config.questions_per_topic[1]}
    />
  );
}
