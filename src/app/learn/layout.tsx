import { redirect } from "next/navigation";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  // The first-run setup gate lives inside Chat's early return, so /learn/* would
  // otherwise walk straight past it and run with default preferences.
  if (!repo.getPreferences()) redirect("/");

  return <main>{children}</main>;
}
