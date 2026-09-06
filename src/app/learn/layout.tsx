export const dynamic = "force-dynamic";

/**
 * No first-run gate here, deliberately.
 *
 * This used to `redirect("/")` when `getPreferences()` returned null, to stop
 * someone reaching a course without passing the setup screen. On Vercel that is
 * an infinite bounce: the SQLite file lives in `/tmp`, which is per-instance and
 * wiped on cold start, so any lambda that did not personally serve the onboarding
 * has no preferences row and sends Courses straight back to Ask.
 *
 * Nothing here needs the gate anyway — the one preference the tutor reads is
 * `density`, via `getPreferencesOrDefault()`. Running on defaults is a fine
 * outcome; bouncing the user is not.
 */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
