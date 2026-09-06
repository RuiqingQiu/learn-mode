import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Idempotent: one enrollment per course, because there is one local user (§2). */
export async function POST(req: Request) {
  try {
    const { courseId } = (await req.json()) as { courseId?: string };
    if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });
    if (!repo.getCourse(courseId)) return NextResponse.json({ error: "No such course" }, { status: 404 });
    return NextResponse.json({ enrollment: repo.enroll(courseId) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
