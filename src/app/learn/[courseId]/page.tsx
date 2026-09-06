import CourseOverview from "@/components/CourseOverview";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CourseOverview courseId={courseId} />;
}
