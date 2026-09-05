"use client";

/** Waiting indicator. Learn mode is supposed to be slower (§2) — say so honestly. */
export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-stone-400" role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-stone-300 border-t-stone-600" />
      {label && <span className="text-[13.5px]">{label}</span>}
    </div>
  );
}
