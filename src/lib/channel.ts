/**
 * Minimal push channel. Lets the answer stream start before triage resolves and
 * be drained (or thrown away) once it does — the §7 latency mitigation.
 */
export function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  let failure: unknown = null;

  const nudge = () => {
    wake?.();
    wake = null;
  };

  return {
    push(v: T) {
      items.push(v);
      nudge();
    },
    close() {
      closed = true;
      nudge();
    },
    fail(err: unknown) {
      failure = err;
      closed = true;
      nudge();
    },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        while (items.length) yield items.shift()!;
        if (failure) throw failure;
        if (closed) return;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    },
  };
}
