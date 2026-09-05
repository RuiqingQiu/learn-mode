"use client";

import type { ReactNode } from "react";

/**
 * `gist`, the delta, and `core` are prose, not markdown blocks (§4.3) — but the
 * model writes inline code and emphasis in prose, and raw backticks on screen
 * look like a bug. This renders those three spans and nothing else.
 */
const TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export default function InlineMarkdown({ children }: { children: string }) {
  const parts: ReactNode[] = [];
  let i = 0;
  for (const piece of children.split(TOKEN)) {
    if (!piece) continue;
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      parts.push(
        <code
          key={i++}
          className="rounded bg-stone-200/70 px-[0.35em] py-[0.1em] font-mono text-[0.86em] text-stone-800"
        >
          {piece.slice(1, -1)}
        </code>,
      );
    } else if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      parts.push(
        <strong key={i++} className="font-semibold text-stone-900">
          {piece.slice(2, -2)}
        </strong>,
      );
    } else if (piece.startsWith("*") && piece.endsWith("*") && piece.length > 2) {
      parts.push(<em key={i++}>{piece.slice(1, -1)}</em>);
    } else {
      parts.push(piece);
    }
  }
  return <>{parts}</>;
}
