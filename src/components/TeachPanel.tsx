"use client";

import { useState } from "react";
import InlineMarkdown from "./InlineMarkdown";
import Spinner from "./Spinner";
import Markdown from "./Markdown";
import type { TeachTurn } from "@/lib/client";

export default function TeachPanel({
  turns,
  streaming,
  pending,
  closed,
  paused,
  summary,
  askingMainChat,
  onSend,
  onPause,
  onResume,
  onAskMainChat,
  onClear,
}: {
  turns: TeachTurn[];
  streaming: string;
  pending: boolean;
  /** Finished for good — the exit summary was written. */
  closed: boolean;
  /** Stepped out to ask something else. Resumable. */
  paused: boolean;
  summary: string | null;
  /** A main-chat answer is being fetched for this session. */
  askingMainChat: boolean;
  onSend: (text: string) => void;
  onPause: () => void;
  onResume: () => void;
  onAskMainChat: () => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");

  const awaitingReply =
    !closed && !paused && !pending && turns.length > 0 && turns[turns.length - 1].user === null;

  const send = () => {
    const body = text.trim();
    if (!body || !awaitingReply) return;
    setText("");
    onSend(body);
  };

  return (
    <div className="rounded-xl border border-stone-300 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
        <span className="text-[12px] font-medium tracking-wide text-stone-500 uppercase">
          Explaining it back
        </span>
        {/* §4.4 — visible at all times. An AI that keeps asking questions is maddening. */}
        {/* §4.4 wants an always-visible way out. Pausing is that exit — it stops
            the questions immediately — and unlike ending, you can come back. */}
        {!closed && !paused && (
          <button
            type="button"
            onClick={onPause}
            className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
          >
            Pause — ask something else
          </button>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="flex gap-3">
              <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-stone-500 uppercase">
                junior
              </span>
              <p className="text-[15px] leading-[1.7] text-stone-800">
                <InlineMarkdown>{t.junior}</InlineMarkdown>
              </p>
            </div>
            {t.user && (
              <p className="border-l-2 border-stone-200 pl-3 text-[15px] leading-[1.7] whitespace-pre-wrap text-stone-600">
                {t.user}
              </p>
            )}
          </div>
        ))}

        {streaming && (
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-stone-500 uppercase">
              junior
            </span>
            <p className="caret-blink text-[15px] leading-[1.7] text-stone-800">
              <InlineMarkdown>{streaming}</InlineMarkdown>
            </p>
          </div>
        )}

        {pending && !streaming && <Spinner label="the junior is thinking" />}

        {summary && (
          <div className="animate-fade-up border-t border-stone-200 pt-4">
            <Markdown>{summary}</Markdown>
          </div>
        )}

        {askingMainChat && <Spinner label="asking the main chat — answer is landing below" />}

        {paused && !askingMainChat && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResume}
              className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3.5 py-2 text-[14px] text-stone-700 transition hover:border-stone-500"
            >
              Resume explaining <span aria-hidden>▸</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
            >
              Clear
            </button>
          </div>
        )}

        {awaitingReply && (
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Explain it to them."
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              className="w-full resize-none rounded-lg border border-stone-300 p-3 text-[15px] leading-[1.6] text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={send}
                disabled={!text.trim()}
                className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reply
              </button>
              <span className="text-[12px] text-stone-400">⌘↵</span>
              {/* Stuck is a normal state. One click sends this whole transcript to
                  the main chat so the answer can target the gap it exposed. */}
              <button
                type="button"
                onClick={onAskMainChat}
                className="ml-auto text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
              >
                Stuck — ask the main chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
