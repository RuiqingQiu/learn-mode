import crypto from "node:crypto";
import YAML from "yaml";
import { z } from "zod";

/**
 * A course package is one hand-authored file: YAML frontmatter for the parts the
 * app needs to reason about (topics, checkpoints, the weak-area vocabulary) and a
 * markdown body that is prose the model reads.
 *
 * The split is the whole point of the format. An educator owns the curriculum and
 * the pedagogy; the app owns the bookkeeping. Nothing in the body is app config,
 * and nothing in the frontmatter is written to the model as instructions.
 */

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kebab = (what: string) =>
  z.string().regex(KEBAB, `${what} must be kebab-case (lower-case words joined by hyphens)`);

const SessionConfigSchema = z.strictObject({
  questions_per_topic: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  mastery_scale: z.number().int().min(2).max(10),
  /** score <= this ⇒ the topic comes back as needs_review. */
  review_threshold: z.number().int().min(0),
});

const TopicSchema = z.strictObject({
  id: kebab("topic id"),
  name: z.string().min(1),
  summary: z.string().min(1),
  prereqs: z.array(kebab("prereq")).default([]),
  checkpoints: z.array(z.string().min(1)).min(1, "a topic needs at least one checkpoint"),
  // A fixed vocabulary is what lets weak areas aggregate across sessions. Free
  // text turns into three tags for one recurring failure and never adds up.
  weak_area_taxonomy: z
    .array(kebab("weak-area tag"))
    .min(1, "a topic needs at least one weak_area_taxonomy tag"),
});

export const CourseFrontmatterSchema = z.strictObject({
  id: kebab("course id"),
  title: z.string().min(1),
  subject: kebab("subject"),
  level: z.string().min(1),
  author: z.string().min(1).optional(),
  description: z.string().min(1),
  session: SessionConfigSchema,
  topics: z.array(TopicSchema).min(1, "a course needs at least one topic"),
});

export type CourseFrontmatter = z.infer<typeof CourseFrontmatterSchema>;
export type CourseTopic = z.infer<typeof TopicSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface ParsedCourse {
  frontmatter: CourseFrontmatter;
  /** Markdown coaching prose. Untrusted — see prompts/tutor.md. */
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Splits the leading `---` fence off. Throws with a readable message. */
export function splitFrontmatter(md: string): { head: string; body: string } {
  const src = md.replace(/^﻿/, "");
  const m = FENCE.exec(src);
  if (!m) throw new Error("No YAML frontmatter found — the file must start with a `---` line.");
  return { head: m[1], body: src.slice(m[0].length).trim() };
}

export type ValidationResult =
  | { ok: true; course: ParsedCourse }
  | { ok: false; errors: string[] };

/**
 * Parse + validate in one step. Errors are rendered verbatim by the author page,
 * so they have to read like sentences rather than like a stack trace.
 */
export function validateCourse(md: string): ValidationResult {
  let head: string;
  let body: string;
  try {
    ({ head, body } = splitFrontmatter(md));
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }

  let raw: unknown;
  try {
    raw = YAML.parse(head);
  } catch (err) {
    return { ok: false, errors: [`The frontmatter is not valid YAML: ${(err as Error).message}`] };
  }

  const parsed = CourseFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => {
        const where = i.path.length ? i.path.join(".") : "frontmatter";
        return `${where}: ${i.message}`;
      }),
    };
  }

  // Cross-field checks zod cannot express on its own.
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of parsed.data.topics) {
    if (ids.has(t.id)) errors.push(`topics: duplicate topic id "${t.id}"`);
    ids.add(t.id);
  }
  for (const t of parsed.data.topics) {
    for (const p of t.prereqs) {
      if (!ids.has(p)) errors.push(`topics.${t.id}.prereqs: "${p}" is not a topic in this course`);
    }
    if (t.prereqs.includes(t.id)) errors.push(`topics.${t.id}.prereqs: a topic cannot require itself`);
  }
  const [lo, hi] = parsed.data.session.questions_per_topic;
  if (lo > hi) errors.push("session.questions_per_topic: the minimum is larger than the maximum");
  if (parsed.data.session.review_threshold >= parsed.data.session.mastery_scale)
    errors.push("session.review_threshold: must be below mastery_scale, or every topic needs review");
  if (!body) errors.push("The markdown body is empty — that body is the coaching prose the model reads.");

  if (errors.length) return { ok: false, errors };
  return { ok: true, course: { frontmatter: parsed.data, body } };
}

/** Content address for a course file, so re-seeding is a no-op when nothing changed. */
export const courseHash = (md: string) => crypto.createHash("sha256").update(md).digest("hex");

/** Cycle-free ordering check used by the seed loader; returns the offending ids. */
export function prereqCycles(topics: CourseTopic[]): string[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const state = new Map<string, 0 | 1 | 2>();
  const bad: string[] = [];
  const visit = (id: string) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      bad.push(id);
      return;
    }
    state.set(id, 1);
    for (const p of byId.get(id)?.prereqs ?? []) visit(p);
    state.set(id, 2);
  };
  for (const t of topics) visit(t.id);
  return bad;
}
