import CourseNotes from "@/components/CourseNotes";

export const dynamic = "force-dynamic";

export default async function NotesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CourseNotes courseId={courseId} />;
}
