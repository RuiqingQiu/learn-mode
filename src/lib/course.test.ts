import assert from "node:assert/strict";
import { test } from "node:test";
import { prereqCycles, splitFrontmatter, validateCourse } from "./course.ts";

const BODY = "## Interviewer persona\n\nDirect.";

const frontmatter = (topics: string) => `---
id: test-course
title: Test Course
subject: software-engineering
level: advanced
description: A course.
session:
  questions_per_topic: [3, 5]
  mastery_scale: 5
  review_threshold: 2
topics:
${topics}
---

${BODY}
`;

const ONE_TOPIC = `  - id: caching
    name: Caching
    summary: Cache things.
    prereqs: []
    checkpoints:
      - Can pick a write policy
    weak_area_taxonomy:
      - invalidation`;

test("parses a well-formed course", () => {
  const r = validateCourse(frontmatter(ONE_TOPIC));
  assert.ok(r.ok);
  assert.equal(r.course.frontmatter.id, "test-course");
  assert.equal(r.course.frontmatter.topics.length, 1);
  assert.equal(r.course.frontmatter.topics[0].weak_area_taxonomy[0], "invalidation");
  // The body is prose the model reads; the fence must not leak into it.
  assert.equal(r.course.body, BODY);
});

test("rejects a file with no frontmatter", () => {
  const r = validateCourse("# Just markdown\n");
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors[0], /frontmatter/i);
});

test("rejects a prereq that names a topic not in the course", () => {
  const r = validateCourse(
    frontmatter(`  - id: caching
    name: Caching
    summary: Cache things.
    prereqs: [does-not-exist]
    checkpoints:
      - Can pick a write policy
    weak_area_taxonomy:
      - invalidation`),
  );
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors[0], /does-not-exist/);
});

test("rejects duplicate topic ids", () => {
  const r = validateCourse(frontmatter(`${ONE_TOPIC}\n${ONE_TOPIC}`));
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors.join(" "), /duplicate/);
});

test("rejects a topic with an empty taxonomy — free-text gaps never aggregate", () => {
  const r = validateCourse(
    frontmatter(`  - id: caching
    name: Caching
    summary: Cache things.
    prereqs: []
    checkpoints:
      - Can pick a write policy
    weak_area_taxonomy: []`),
  );
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors.join(" "), /weak_area_taxonomy/);
});

test("rejects a review_threshold that would mark every topic for review", () => {
  const r = validateCourse(frontmatter(ONE_TOPIC).replace("review_threshold: 2", "review_threshold: 5"));
  assert.equal(r.ok, false);
  assert.match((r as { errors: string[] }).errors.join(" "), /review_threshold/);
});

test("rejects unknown frontmatter keys rather than silently dropping them", () => {
  const r = validateCourse(frontmatter(ONE_TOPIC).replace("level: advanced", "level: advanced\nlevle: typo"));
  assert.equal(r.ok, false);
});

test("errors read as sentences and name the field", () => {
  const r = validateCourse(frontmatter(ONE_TOPIC).replace("mastery_scale: 5", "mastery_scale: nope"));
  assert.equal(r.ok, false);
  const [first] = (r as { errors: string[] }).errors;
  assert.match(first, /^session\.mastery_scale: /);
});

test("splitFrontmatter tolerates CRLF and a BOM", () => {
  const { head, body } = splitFrontmatter("﻿---\r\nid: x\r\n---\r\nhello\r\n");
  assert.equal(head, "id: x");
  assert.equal(body, "hello");
});

test("prereqCycles finds a cycle", () => {
  const topics = [
    { id: "a", name: "A", summary: "", prereqs: ["b"], checkpoints: ["x"], weak_area_taxonomy: ["y"] },
    { id: "b", name: "B", summary: "", prereqs: ["a"], checkpoints: ["x"], weak_area_taxonomy: ["y"] },
  ];
  assert.ok(prereqCycles(topics).length > 0);
  assert.equal(prereqCycles([topics[0], { ...topics[1], prereqs: [] }]).length, 0);
});

test("the shipped course parses", async () => {
  const fs = await import("node:fs");
  const r = validateCourse(fs.readFileSync("courses/system-design-staff.md", "utf8"));
  assert.ok(r.ok, r.ok ? "" : (r as { errors: string[] }).errors.join("\n"));
  assert.equal(r.course.frontmatter.topics.length, 28);
  assert.equal(prereqCycles(r.course.frontmatter.topics).length, 0);
  // A taxonomy that cannot express a topic's own checkpoints is a broken vocabulary.
  for (const t of r.course.frontmatter.topics) {
    assert.ok(t.checkpoints.length >= 1, `${t.id} has no checkpoints`);
    assert.ok(t.weak_area_taxonomy.length >= 4, `${t.id} taxonomy is too thin`);
  }
});
