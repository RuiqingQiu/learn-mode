"use client";

import { api } from "@/lib/client";
import { useLoader } from "@/lib/use-loader";
import SessionChat from "./SessionChat";
import { PageError, PageLoading } from "./PageState";

export default function SessionLoader({
  courseId,
  sessionId,
}: {
  courseId: string;
  sessionId: string;
}) {
  const { data, error } = useLoader(() => api.getCourseSession(sessionId), [sessionId]);
  if (error) return <PageError message={error} backHref={`/learn/${courseId}`} />;
  if (!data) return <PageLoading />;
  if (data.course.id !== courseId)
    return <PageError message="That session belongs to another course" backHref={`/learn/${courseId}`} />;

  const { session, topic, course, progress } = data;
  return (
    <SessionChat
      courseId={courseId}
      sessionId={sessionId}
      topic={topic}
      transcript={session.transcript}
      ended={!!session.ended_at}
      checkpointsMet={progress?.checkpoints_met ?? []}
      answered={session.evaluations.length}
      maxQuestions={course.config.questions_per_topic[1]}
    />
  );
}
