"use client";

import { useEffect, useRef } from "react";
import Spinner from "./Spinner";
import type { Mode } from "@/lib/types";

export default function Composer({
  mode,
  setMode,
  onSend,
  busy,
  flipKey,
  flipNote,
  focusKey,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  onSend: (question: string, mode: Mode) => void;
  busy: boolean;
  /** Bumped when the toggle auto-flips, to re-trigger the animation. */
  flipKey: number;
  flipNote: boolean;
  /** Bumped to pull focus here — e.g. after pausing protégé mode. */
  focusKey: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // §4.0 — ⌘L toggles, from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setMode(mode === "learn" ? "answer" : "learn");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode]);

  useEffect(() => {
    if (focusKey > 0) ref.current?.focus();
  }, [focusKey]);

  const send = (forced?: Mode) => {
    const value = ref.current?.value.trim();
    if (!value || busy) return;
    ref.current!.value = "";
    ref.current!.style.height = "auto";
    onSend(value, forced ?? mode);
  };

  const learn = mode === "learn";

  return (
    <div className="border-t border-stone-200 bg-stone-50/90 px-6 py-4 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        {flipNote && (
          <p className="animate-fade-up mb-2 text-[12.5px] text-stone-500">
            Switched back to Answer — ⌘L to run the loop again.
          </p>
        )}

        <div
          className={`rounded-xl border bg-white transition-colors ${
            learn ? "border-stone-800 ring-1 ring-stone-800" : "border-stone-300"
          }`}
        >
          <textarea
            ref={ref}
            rows={1}
            disabled={busy}
            placeholder={learn ? "Ask something worth predicting on…" : "Ask anything…"}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              // §4.0 — ⌘↵ always sends in Answer mode, whatever the toggle says.
              send(e.metaKey || e.ctrlKey ? "answer" : undefined);
            }}
            className="max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:opacity-60"
          />

          <div className="flex items-center gap-3 px-3 pb-3">
            <div
              key={flipKey}
              className={`flex rounded-lg bg-stone-100 p-0.5 ${flipKey > 0 ? "animate-toggle-flip rounded-lg" : ""}`}
            >
              {(["answer", "learn"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-[7px] px-3 py-1 text-[13px] font-medium capitalize transition ${
                    mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <span className="text-[12px] text-stone-400">⌘L</span>

            <button
              type="button"
              onClick={() => send()}
              disabled={busy}
              className="ml-auto rounded-lg bg-stone-900 px-4 py-1.5 text-[13.5px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Spinner /> : "Send"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[12px] text-stone-400">
          {learn
            ? "Learn mode: you'll be asked to guess first. ⌘↵ sends a plain answer instead."
            : "Plain answers. ⌘L to switch on Learn mode."}
        </p>
      </div>
    </div>
  );
}
