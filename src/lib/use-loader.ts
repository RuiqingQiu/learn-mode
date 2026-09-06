"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fetch-on-mount for the `/learn` pages.
 *
 * Those pages used to call `repo` directly during the server render, which reads
 * the wrong database on Vercel: route handlers and page renders are separate
 * serverless functions with separate `/tmp`, and `src/lib/db.ts` puts SQLite
 * there. Nothing `POST /api/sessions` wrote was ever visible to the page that
 * rendered it, so the session page 404'd on every single load — deterministically,
 * not as the cold-start data loss the README describes. Reading through the API
 * keeps reads on the same side of that boundary as the writes.
 */
export function useLoader<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });

  // The caller passes a fresh closure every render; `deps` is what decides when
  // to refetch, so the closure itself must not.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    setState({ data: null, error: null });
    loadRef.current().then(
      (data) => live && setState({ data, error: null }),
      (err: Error) => live && setState({ data: null, error: err.message }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
