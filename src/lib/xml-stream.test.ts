import assert from "node:assert/strict";
import { test } from "node:test";
import { SectionStreamParser, parseSections } from "./xml-stream.ts";
import type { StreamSection } from "./xml-stream.ts";

const SAMPLE = [
  "<verdict>partial</verdict>",
  "<gist>\nDefer is function-scoped.</gist>",
  "<delta><held-up>You read it as block-scoped.</held-up><off>Braces are not a boundary.</off></delta>",
  "<core>Each call frame owns a defer stack.</core>",
  "<full>A <div> tag, `if a < b`, and List<int>.\n\n- one\n- two</full>",
].join("\n");

const collect = (xml: string, chunk: number) => {
  const parser = new SectionStreamParser();
  const acc: Partial<Record<StreamSection, string>> = {};
  const take = (deltas: { name: StreamSection; delta: string }[]) => {
    for (const d of deltas) acc[d.name] = (acc[d.name] ?? "") + d.delta;
  };
  for (let i = 0; i < xml.length; i += chunk) take(parser.push(xml.slice(i, i + chunk)));
  take(parser.flush());
  return acc;
};

test("parses every section regardless of chunk boundaries", () => {
  for (const chunk of [1, 2, 7, 64, 10_000]) {
    const acc = collect(SAMPLE, chunk);
    assert.equal(acc.verdict, "partial", `chunk=${chunk}`);
    assert.equal(acc.gist, "Defer is function-scoped.", `chunk=${chunk}`);
    assert.equal(acc.held_up, "You read it as block-scoped.", `chunk=${chunk}`);
    assert.equal(acc.off, "Braces are not a boundary.", `chunk=${chunk}`);
    assert.equal(acc.core, "Each call frame owns a defer stack.", `chunk=${chunk}`);
  }
});

test("passes angle brackets in markdown through untouched", () => {
  const full = collect(SAMPLE, 3).full;
  assert.equal(full, "A <div> tag, `if a < b`, and List<int>.\n\n- one\n- two");
});

test("drops text outside any section", () => {
  const acc = parseSections("junk\n<gist>kept</gist>\ntrailing junk");
  assert.deepEqual(acc, { gist: "kept" });
});

test("an unterminated final section still flushes", () => {
  const acc = parseSections("<gist>done</gist><core>cut off mid-sen");
  assert.equal(acc.core, "cut off mid-sen");
});

test("empty delta yields no held-up or off", () => {
  const acc = parseSections("<verdict>wrong</verdict><gist>g</gist><delta></delta><core>c</core>");
  assert.equal(acc.held_up, undefined);
  assert.equal(acc.off, undefined);
  assert.equal(acc.core, "c");
});

// ── Skill Shadow: the decision diff streams through the same parser ──────────

const SHADOW = [
  "<summary>Both poll a jobs table.</summary>",
  "<axes>",
  "job claim | poll + Redis SETNX | SELECT … FOR UPDATE SKIP LOCKED | diverge",
  "lease safety | TTL only | fenced write | gap",
  "</axes>",
  "<strong-point></strong-point>",
  "<probe-scenario>Worker A pauses 30s; the 20s lease expires.</probe-scenario>",
  "<probe-question>What stops the second write?</probe-question>",
].join("\n");

test("parses the shadow diff contract", () => {
  const acc = parseSections(SHADOW);
  assert.equal(acc.summary, "Both poll a jobs table.");
  assert.equal(acc.probe_question, "What stops the second write?");
  assert.match(acc.probe_scenario!, /^Worker A pauses/);
  // An unearned strong point is worse than none, so empty has to survive as empty.
  assert.equal(acc.strong_point, undefined);
});

test("axes rows survive being split across chunk boundaries", () => {
  for (const size of [1, 3, 7, 40]) {
    const rows = collect(SHADOW, size).axes!.trim().split("\n");
    assert.equal(rows.length, 2, `chunk size ${size}`);
    assert.equal(rows[1], "lease safety | TTL only | fenced write | gap");
  }
});

test("reveal markdown containing a bare <question> is not captured as a probe", () => {
  // The TAGS map is global. Prefixed probe tags are what keep `full` safe.
  const acc = parseSections("<gist>g</gist><full>Ask a <question> in the form...</full>");
  assert.equal(acc.probe_question, undefined);
  assert.equal(acc.full, "Ask a <question> in the form...");
});

// ── the guided-session contract (prompts/tutor.md) ──────────────────────────

test("a tutor turn round-trips, split across chunk boundaries", () => {
  const xml =
    "<eval-rating>partial</eval-rating>\n" +
    "<eval-gaps>invalidation, stampede-handling</eval-gaps>\n" +
    "<eval-checkpoints>0, 2</eval-checkpoints>\n" +
    "<eval-note>They believe the TTL is the invalidation strategy.</eval-note>\n" +
    "<tutor-feedback>A TTL bounds staleness; it does not invalidate.</tutor-feedback>\n" +
    "<tutor-question>What happens at 12:00:00.1?</tutor-question>";

  // One byte at a time — every tag boundary lands mid-chunk somewhere.
  const p = new SectionStreamParser();
  const out: Partial<Record<StreamSection, string>> = {};
  for (const ch of xml) for (const d of p.push(ch)) out[d.name] = (out[d.name] ?? "") + d.delta;
  for (const d of p.flush()) out[d.name] = (out[d.name] ?? "") + d.delta;

  assert.equal(out.eval_rating?.trim(), "partial");
  assert.equal(out.eval_gaps?.trim(), "invalidation, stampede-handling");
  assert.equal(out.eval_checkpoints?.trim(), "0, 2");
  assert.equal(out.tutor_question?.trim(), "What happens at 12:00:00.1?");
  assert.deepEqual(parseSections(xml), {
    eval_rating: "partial",
    eval_gaps: "invalidation, stampede-handling",
    eval_checkpoints: "0, 2",
    eval_note: "They believe the TTL is the invalidation strategy.",
    tutor_feedback: "A TTL bounds staleness; it does not invalidate.",
    tutor_question: "What happens at 12:00:00.1?",
  });
});

test("tutor feedback passes markdown with angle brackets through as text", () => {
  const out = parseSections(
    "<tutor-feedback>Use `SET key 0 EX 60 NX`. If p99 < 5ms you are fine.\n" +
      "See <https://redis.io/> and the `a<b` case.</tutor-feedback>",
  );
  assert.match(out.tutor_feedback!, /p99 < 5ms/);
  assert.match(out.tutor_feedback!, /a<b/);
  assert.match(out.tutor_feedback!, /https:\/\/redis\.io/);
});

test("a wrap-up parses on its own, with no evaluation block", () => {
  const out = parseSections(
    "<wrapup-score>4</wrapup-score>\n<wrapup-strengths>The arithmetic.</wrapup-strengths>\n" +
      "<wrapup-gaps>Failure behaviour.</wrapup-gaps>\n<wrapup-takeaways>- One\n- Two</wrapup-takeaways>\n" +
      "<wrapup-deep-dive>Stripe's rate limiter post.</wrapup-deep-dive>",
  );
  assert.equal(out.wrapup_score, "4");
  assert.equal(out.wrapup_takeaways, "- One\n- Two");
  assert.equal(out.tutor_question, undefined);
});

test("the tutor tags are prefixed, so reveal markdown cannot hijack them", () => {
  // TAGS is global. An unprefixed <question> or <feedback> in a reveal's `full`
  // would start capturing — this is why every tutor tag carries a prefix.
  const out = parseSections(
    "<full>Some SGML docs use <question> and <feedback> and <score> literally.</full>",
  );
  assert.match(out.full!, /<question>/);
  assert.match(out.full!, /<feedback>/);
  assert.equal(out.tutor_question, undefined);
  assert.equal(out.tutor_feedback, undefined);
});
