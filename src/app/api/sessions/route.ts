import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumes the open session on this topic rather than stranding it (`Leave for now`). */
export async function POST(req: Request) {
  try {
    const { courseId, topicId } = (await req.json()) as { courseId?: string; topicId?: string };
    if (!courseId || !topicId)
      return NextResponse.json({ error: "courseId and topicId required" }, { status: 400 });

    const course = repo.getCourse(courseId);
    if (!course?.topics.some((t) => t.id === topicId))
      return NextResponse.json({ error: "No such topic in that course" }, { status: 404 });

    const enrollment = repo.enroll(courseId);
    const existing = repo.openSessionFor(enrollment.id, topicId);
    return NextResponse.json({ session: existing ?? repo.startSession(enrollment.id, topicId) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
