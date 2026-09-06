import { NextResponse } from "next/server";
import { courseHash, validateCourse } from "@/lib/course";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const courses = repo.listCourses({
      subject: url.searchParams.get("subject") ?? undefined,
      level: url.searchParams.get("level") ?? undefined,
    });
    // Enrollment state is what the explore page sorts on.
    return NextResponse.json({
      courses: courses.map((c) => ({ ...c, enrolled: !!repo.getEnrollment(c.id) })),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/** Publish a course.md. Validation failures come back as readable sentences. */
export async function POST(req: Request) {
  try {
    const { source } = (await req.json()) as { source?: string };
    if (!source?.trim()) return NextResponse.json({ error: "source required" }, { status: 400 });

    const result = validateCourse(source);
    if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

    const { frontmatter: f, body } = result.course;
    const course = repo.upsertCourse(
      {
        id: f.id,
        title: f.title,
        subject: f.subject,
        level: f.level,
        author: f.author,
        description: f.description,
      },
      f.session,
      f.topics,
      body,
      courseHash(source),
    );
    return NextResponse.json({ course });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
