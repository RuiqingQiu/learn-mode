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
