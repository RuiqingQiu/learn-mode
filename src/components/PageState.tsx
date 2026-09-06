"use client";

import Link from "next/link";
import Spinner from "./Spinner";

/** Shared chrome for the `/learn` pages while their data is in flight. */
export function PageLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Spinner />
    </div>
  );
}

/**
 * The API said no. Its messages are already readable sentences ("No such
 * session"), so show one rather than a bare 404 — on the ephemeral demo a
 * missing row usually means the instance recycled, not that the URL is wrong.
 */
export function PageError({ message, backHref = "/learn" }: { message: string; backHref?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-[14px] leading-[1.6] text-stone-700">{message}.</p>
      <Link
        href={backHref}
        className="mt-3 inline-block text-[13.5px] text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
      >
        Back to courses
      </Link>
    </div>
  );
}
