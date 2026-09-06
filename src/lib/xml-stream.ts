import type { SectionName, ShadowSectionName, TutorSectionName } from "./types";

/**
 * `verdict` and `correct-option` are emitted first by reveal.md and are never
 * rendered inline — they are stored as Prediction.was_correct / correct_option.
 */
export type StreamSection =
  | SectionName
  | ShadowSectionName
  | TutorSectionName
  | "verdict"
  | "correct_option";

/** §4.3: the layered-XML contract. These tag names are the wire format. */
const TAGS: Record<string, StreamSection> = {
  verdict: "verdict",
  "correct-option": "correct_option",
  gist: "gist",
  "held-up": "held_up",
  off: "off",
  core: "core",
  full: "full",

  // Skill Shadow's decision diff (prompts/shadow-diff.md) streams through the
  // same parser. The probe tags are prefixed rather than nested in a <probe>
  // container because this map is global: a bare <question> would start
  // capturing any reveal whose `full` markdown happened to contain that literal.
  summary: "summary",
  axes: "axes",
  "strong-point": "strong_point",
  "probe-scenario": "probe_scenario",
  "probe-question": "probe_question",

  // A guided course turn (prompts/tutor.md). Every tag is prefixed for the same
  // reason the probe tags are: this map is global, so an unprefixed <question>
  // or <feedback> would hijack any other prompt whose markdown contained it.
  "eval-rating": "eval_rating",
  "eval-gaps": "eval_gaps",
  "eval-checkpoints": "eval_checkpoints",
  "eval-note": "eval_note",
  "tutor-feedback": "tutor_feedback",
  "tutor-question": "tutor_question",
  "wrapup-score": "wrapup_score",
  "wrapup-strengths": "wrapup_strengths",
  "wrapup-gaps": "wrapup_gaps",
  "wrapup-takeaways": "wrapup_takeaways",
  "wrapup-deep-dive": "wrapup_deep_dive",
};
const CONTAINERS = new Set(["delta"]);

const TAG_RE = /^<\/?([A-Za-z][A-Za-z0-9-]*)\s*>/;
const PARTIAL_TAG_RE = /^<\/?([A-Za-z][A-Za-z0-9-]*)?\s*$/;

export interface SectionDelta {
  name: StreamSection;
  delta: string;
}

/**
 * Incremental parser for the reveal stream. Tolerates tags split across chunk
 * boundaries, and passes anything that isn't one of our tags through as literal
 * text — `full` is markdown and will contain angle brackets.
 */
export class SectionStreamParser {
  private buf = "";
  private current: StreamSection | null = null;
  private started = new Set<StreamSection>();
  private out: SectionDelta[] = [];

  push(chunk: string): SectionDelta[] {
    this.buf += chunk;
    this.out = [];
    this.consume(false);
    return this.out;
  }

  /** Call once the upstream stream ends; emits anything left in the buffer. */
  flush(): SectionDelta[] {
    this.out = [];
    this.consume(true);
    return this.out;
  }

  private emit(text: string) {
    if (!this.current) return;
    // Swallow the newline that follows an opening tag.
    const body = this.started.has(this.current) ? text : text.replace(/^\s+/, "");
    if (!body) return;
    this.started.add(this.current);
    const last = this.out[this.out.length - 1];
    if (last && last.name === this.current) last.delta += body;
    else this.out.push({ name: this.current, delta: body });
  }

  private consume(final: boolean) {
    while (this.buf.length) {
      const lt = this.buf.indexOf("<");
      if (lt === -1) {
        this.emit(this.buf);
        this.buf = "";
        return;
      }
      if (lt > 0) {
        this.emit(this.buf.slice(0, lt));
        this.buf = this.buf.slice(lt);
      }

      const tag = TAG_RE.exec(this.buf);
      if (tag) {
        const isClose = tag[0][1] === "/";
        const name = tag[1].toLowerCase();
        if (name in TAGS) {
          if (isClose) {
            if (this.current === TAGS[name]) this.current = null;
          } else {
            this.current = TAGS[name];
          }
        } else if (!CONTAINERS.has(name)) {
          this.emit(tag[0]); // not ours — literal text
        }
        this.buf = this.buf.slice(tag[0].length);
        continue;
      }

      // Could still become a tag once more bytes arrive — hold.
      if (!final && PARTIAL_TAG_RE.test(this.buf)) return;

      // A bare "<" in prose or code. Emit it and move on.
      this.emit("<");
      this.buf = this.buf.slice(1);
    }
  }
}

/** Non-streaming counterpart, for parsing a complete response. */
export function parseSections(xml: string): Partial<Record<StreamSection, string>> {
  const p = new SectionStreamParser();
  const out: Partial<Record<StreamSection, string>> = {};
  for (const d of [...p.push(xml), ...p.flush()]) {
    out[d.name] = (out[d.name] ?? "") + d.delta;
  }
  for (const k of Object.keys(out) as StreamSection[]) out[k] = out[k]!.trim();
  return out;
}
