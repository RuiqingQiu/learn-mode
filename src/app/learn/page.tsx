import Link from "next/link";
import * as repo from "@/lib/repo";
import ProgressRing from "@/components/ProgressRing";

export const dynamic = "force-dynamic";

export default function ExplorePage() {
  const courses = repo.listCourses();
  const bySubject = new Map<string, typeof courses>();
  for (const c of courses) {
    if (!bySubject.has(c.subject)) bySubject.set(c.subject, []);
    bySubject.get(c.subject)!.push(c);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-medium tracking-[-0.01em] text-stone-900">Courses</h1>
      <p className="mt-1 mb-8 text-[14px] leading-[1.6] text-stone-500">
        An educator writes the curriculum and the coaching. The app keeps track of where you got to.
      </p>

      {!courses.length && (
        <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] leading-[1.6] text-stone-700">
            No courses yet.{" "}
            <Link href="/author/courses/new" className="underline underline-offset-2">
              Publish one
            </Link>{" "}
            by pasting a <code className="font-mono text-[13px]">course.md</code>.
          </p>
        </div>
      )}

      {[...bySubject.entries()].map(([subject, list]) => {
        // Enrolled first — the thing you are part-way through is the thing you want.
        const sorted = [...list].sort(
          (a, b) => Number(!!repo.getEnrollment(b.id)) - Number(!!repo.getEnrollment(a.id)),
        );
        return (
          <section key={subject} className="mb-10">
            <div className="mb-3 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
              {subject.replace(/-/g, " ")}
            </div>
            <div className="space-y-3">
              {sorted.map((c) => {
                const enrollment = repo.getEnrollment(c.id);
                const progress = enrollment ? repo.topicProgress(enrollment.id) : [];
                const done = progress.filter((p) => p.status === "completed").length;
                return (
                  <Link
                    key={c.id}
                    href={`/learn/${c.id}`}
                    className="flex items-start gap-4 rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-stone-400"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium text-stone-900">{c.title}</div>
                      <p className="mt-1 text-[13.5px] leading-[1.6] text-stone-500">{c.description}</p>
                      <div className="mt-2 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
                        {c.level} · {c.topics.length} topics{c.author ? ` · ${c.author}` : ""}
                      </div>
                    </div>
                    {enrollment && <ProgressRing done={done} total={c.topics.length} />}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
