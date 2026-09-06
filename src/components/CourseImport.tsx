"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import Spinner from "./Spinner";
import type { CourseRecord } from "@/lib/types";

const TEMPLATE = `---
id: my-course
title: My Course
subject: software-engineering
level: intermediate
description: One sentence on what this drills.
session:
  questions_per_topic: [3, 5]
  mastery_scale: 5
  review_threshold: 2
topics:
  - id: first-topic
    name: First Topic
    summary: What this topic covers.
    prereqs: []
    checkpoints:
      - Can do the thing
    weak_area_taxonomy:
      - the-usual-gap
---

## Interviewer persona

Direct, rigorous, no hand-holding.

## Question style

- Not "what is X" — "how would you design X under these constraints".
`;

export default function CourseImport() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [published, setPublished] = useState<CourseRecord | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    setErrors([]);
    setPublished(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = (await res.json()) as { course?: CourseRecord; errors?: string[]; error?: string };
      if (data.errors?.length) setErrors(data.errors);
      else if (data.error) setErrors([data.error]);
      else if (data.course) setPublished(data.course);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setSource(await file.text());
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-medium tracking-[-0.01em] text-stone-900">Publish a course</h1>
      <p className="mt-1 mb-6 text-[14px] leading-[1.6] text-stone-500">
        One file: YAML frontmatter for the topics and checkpoints, markdown below it for how you want
        the sessions taught. Republishing the same <code className="font-mono text-[13px]">id</code>{" "}
        updates it and keeps everyone&rsquo;s progress.
      </p>

      <div className="mb-3 flex items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[13px] text-stone-700 transition hover:border-stone-400">
          Upload a file
          <input
            type="file"
            accept=".md,.markdown,text/markdown"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        <button
          type="button"
          onClick={() => setSource(TEMPLATE)}
          className="text-[13px] text-stone-400 underline underline-offset-2 transition hover:text-stone-700"
        >
          Start from a template
        </button>
      </div>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={22}
        spellCheck={false}
        placeholder="Paste your course.md here…"
        className="w-full rounded-xl border border-stone-300 bg-white p-4 font-mono text-[12.5px] leading-[1.6] text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={publish}
          disabled={busy || !source.trim()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? <Spinner /> : "Validate and publish"}
        </button>
        {published && (
          <button
            type="button"
            onClick={() => router.push(`/learn/${published.id}`)}
            className="text-[13px] text-stone-500 underline underline-offset-2 transition hover:text-stone-900"
          >
            Open it
          </button>
        )}
      </div>

      {/* Errors read as sentences and name the field, so a fix is one edit away. */}
      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 font-mono text-[10.5px] tracking-wide text-red-800 uppercase">
            not published — {errors.length} problem{errors.length === 1 ? "" : "s"}
          </div>
          <ul className="space-y-1 text-[13.5px] leading-[1.6] text-red-800">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {published && (
        <div className="mt-4 rounded-xl border border-stone-300 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="mb-2 font-mono text-[10.5px] tracking-wide text-stone-400 uppercase">
            published · version {published.version}
          </div>
          <div className="text-[15px] font-medium text-stone-900">{published.title}</div>
          <p className="mt-1 text-[13.5px] leading-[1.6] text-stone-500">{published.description}</p>
          <ul className="mt-3 space-y-1">
            {published.topics.map((t) => (
              <li key={t.id} className="text-[13px] leading-[1.6] text-stone-700">
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-stone-400">
                  · {t.checkpoints.length} checkpoints · {t.weak_area_taxonomy.length} tags
                  {t.prereqs.length ? ` · after ${t.prereqs.join(", ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
