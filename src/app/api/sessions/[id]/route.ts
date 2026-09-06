import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = repo.tutorContext(id);
    if (!ctx) return NextResponse.json({ error: "No such session" }, { status: 404 });
    return NextResponse.json({
      session: ctx.session,
      topic: ctx.topic,
      course: { id: ctx.course.id, title: ctx.course.title, config: ctx.course.config },
      progress: ctx.progress,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
