/** Completed topics as a fraction. Stone only — this is a record, not a grade. */
export default function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;

  return (
    <div className="relative shrink-0" title={`${done} of ${total} completed`}>
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
        <circle cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-stone-200" />
        <circle
          cx="19"
          cy="19"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 19 19)"
          className="text-stone-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-stone-600">
        {done}
      </span>
      <span className="sr-only">
        {done} of {total} topics completed
      </span>
    </div>
  );
}
