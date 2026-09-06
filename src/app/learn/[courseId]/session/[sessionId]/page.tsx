import SessionLoader from "@/components/SessionLoader";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ courseId: string; sessionId: string }>;
}) {
  const { courseId, sessionId } = await params;
  return <SessionLoader courseId={courseId} sessionId={sessionId} />;
}
