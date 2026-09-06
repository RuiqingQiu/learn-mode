"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two surfaces, and the only place you switch between them.
 *
 * They are named for whose agenda you are following. **Ask** is yours — you bring
 * the question, and the composer decides how hard it makes you work for the
 * answer. **Courses** is somebody else's — an educator wrote the curriculum, the
 * checkpoints and the coaching, and the app keeps track of where you got to.
 *
 * "Ask" rather than "Learn" on purpose: `Learn` is one of the three composer
 * modes, and a nav item sharing that name made it read as though clicking it was
 * how you turned the mode on.
 */
const SURFACES = [
  { href: "/", label: "Ask", match: (p: string) => p === "/" },
  { href: "/learn", label: "Courses", match: (p: string) => p.startsWith("/learn") || p.startsWith("/author") },
];

/** Height is 49px; the surfaces below size themselves against it. */
export default function TopBar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-20 flex items-center gap-5 border-b border-stone-200 bg-stone-50/90 px-5 py-3 backdrop-blur">
      <span className="text-[14px] font-medium tracking-[-0.01em] text-stone-900">Learn Mode</span>

      <nav className="flex items-center gap-1">
        {SURFACES.map((s) => {
          const active = s.match(pathname);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-[13px] transition ${
                active
                  ? "bg-stone-200/70 font-medium text-stone-900"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      {pathname.startsWith("/learn") || pathname.startsWith("/author") ? (
        <Link
          href="/author/courses/new"
          className="ml-auto text-[13px] text-stone-500 transition hover:text-stone-900"
        >
          Publish a course
        </Link>
      ) : null}
    </header>
  );
}
