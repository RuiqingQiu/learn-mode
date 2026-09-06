import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const course = repo.getCourse(id);
    if (!course) return NextResponse.json({ error: "No such course" }, { status: 404 });

    const enrollment = repo.getEnrollment(id);
    return NextResponse.json({
      course,
      enrollment,
      progress: enrollment ? repo.topicProgress(enrollment.id) : [],
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
