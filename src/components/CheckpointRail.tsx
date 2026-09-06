"use client";

/**
 * The checkpoints for this topic, ticking as they are demonstrated. Weight and
 * fill rather than colour — ShadowCard's rule holds here too: this is a record
 * of what you showed, not a grade.
 */
export default function CheckpointRail({
  topicName,
  checkpoints,
  met,
  answered,
  maxQuestions,
}: {
  topicName: string;
  checkpoints: string[];
  met: number[];
  answered: number;
  maxQuestions: number;
}) {
  const metSet = new Set(met);
  return (
    <aside className="w-64 shrink-0 border-l border-stone-200 px-5 py-6">
      <div className="mb-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">topic</div>
      <div className="mb-5 text-[14px] font-medium text-stone-900">{topicName}</div>

      <div className="mb-1 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
        question {Math.min(answered + 1, maxQuestions)} of {maxQuestions}
      </div>
      <div className="mb-6 flex gap-1">
        {Array.from({ length: maxQuestions }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < answered ? "bg-stone-700" : "bg-stone-200"}`}
          />
        ))}
      </div>

      <div className="mb-2 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
        checkpoints {metSet.size}/{checkpoints.length}
      </div>
      <ul className="space-y-2.5">
        {checkpoints.map((c, i) => (
          <li
            key={i}
            className={`flex gap-2 text-[12.5px] leading-[1.5] transition ${
              metSet.has(i) ? "font-medium text-stone-900" : "text-stone-400"
            }`}
          >
            <span aria-hidden className="mt-px shrink-0">
              {metSet.has(i) ? "✅" : "⬜"}
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
