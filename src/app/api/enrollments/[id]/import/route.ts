import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Carries a pre-app progress.json across, so somebody with real history does not
 * restart at zero. Tags land verbatim and flagged as imported — they predate the
 * authored taxonomy, and rewriting them would be a lie about what happened.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      topics?: Record<string, { status?: string; score?: number | null; attempts?: number; weak_areas?: string[] }>;
      last_session?: string;
    };
    if (!body?.topics) return NextResponse.json({ error: "expected a { topics } object" }, { status: 400 });

    const enrollment = repo.getEnrollmentById(id);
    const course = enrollment ? repo.getCourse(enrollment.course_id) : null;
    if (!course) return NextResponse.json({ error: "No such enrollment" }, { status: 404 });

    const result = repo.importProgress(
      id,
      { topics: body.topics, last_session: body.last_session },
      course.topics.map((t) => t.id),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
