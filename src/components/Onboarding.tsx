"use client";

import { useState } from "react";
import type { Density, Preferences, Reinforcement } from "@/lib/types";

const REINFORCEMENT: { value: Reinforcement; label: string; blurb: string }[] = [
  {
    value: "teach_back",
    label: "Make me explain it back",
    blurb: "A junior engineer asks you questions until your explanation holds up. Four turns, then it tells you where it got thin.",
  },
  {
    value: "quiz",
    label: "Quiz me afterwards",
    blurb: "Three questions from memory with the answer hidden. Pulling it back out is what makes it stick — re-reading isn't.",
  },
  {
    value: "transfer_probe",
    label: "One question, different situation",
    blurb: "The same idea moved somewhere else, to see whether what you built survives the move. Quickest of the three.",
  },
];

const DENSITY: { value: Density; label: string; blurb: string }[] = [
  { value: "prose", label: "Mostly prose", blurb: "Explained in sentences. Tables only for real comparisons." },
  { value: "balanced", label: "Balanced", blurb: "Prose, with a table or diagram when the content has structure." },
  { value: "visual", label: "Mostly tables and diagrams", blurb: "Anything with a shape gets drawn. Prose connects them." },
];

export default function Onboarding({
  initial,
  editing,
  onSave,
  onCancel,
  onReset,
}: {
  initial: Preferences;
  editing: boolean;
  onSave: (p: Preferences) => void;
  onCancel?: () => void;
  /** Only while editing — drops back to the first-run state. */
  onReset?: () => void;
}) {
  const [reinforcement, setReinforcement] = useState<Reinforcement>(initial.reinforcement);
  const [density, setDensity] = useState<Density>(initial.density);
  const [saving, setSaving] = useState(false);

  const Card = <T extends string>({
    items,
    value,
    onPick,
  }: {
    items: { value: T; label: string; blurb: string }[];
    value: T;
    onPick: (v: T) => void;
  }) => (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onPick(it.value)}
          aria-pressed={value === it.value}
          className={`rounded-xl border p-4 text-left transition ${
            value === it.value
              ? "border-stone-800 bg-white ring-1 ring-stone-800"
              : "border-stone-200 bg-white/60 hover:border-stone-400"
          }`}
        >
          <span className="block text-[14.5px] font-medium text-stone-900">{it.label}</span>
          <span className="mt-1.5 block text-[13px] leading-[1.55] text-stone-500">{it.blurb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-stone-900">
          {editing ? "Preferences" : "Before we start"}
        </h1>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-stone-600">
          Two questions about what you want this to do. Not about what kind of learner you
          are — that turns out not to predict much. You can change both later.
        </p>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium tracking-wide text-stone-500 uppercase">
            After the answer
          </h2>
          <p className="mt-1 mb-3 text-[13.5px] text-stone-500">
            What should happen once you&apos;ve read it?
          </p>
          <Card items={REINFORCEMENT} value={reinforcement} onPick={setReinforcement} />
        </section>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium tracking-wide text-stone-500 uppercase">
            How answers look
          </h2>
          <p className="mt-1 mb-3 text-[13.5px] text-stone-500">
            How much should be structure rather than paragraphs?
          </p>
          <Card items={DENSITY} value={density} onPick={setDensity} />
        </section>

        {/* §4.2 — the prediction is doing most of the work, so it is not a setting. */}
        <p className="mt-8 border-l-2 border-stone-300 pl-3 text-[13.5px] leading-[1.6] text-stone-500">
          One thing isn&apos;t configurable: in Learn mode you always commit a guess before
          you see the answer. That&apos;s the part carrying the weight — a wrong guess still
          makes the real answer stick better than reading it cold. Use{" "}
          <span className="text-stone-700">Answer</span> mode when you just want the answer.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              onSave({ reinforcement, density });
            }}
            className="rounded-lg bg-stone-900 px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {editing ? "Save" : "Start"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[13.5px] text-stone-500 underline underline-offset-2 transition hover:text-stone-800"
            >
              Cancel
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
            >
              Reset — show this as a first run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
