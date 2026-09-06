#!/usr/bin/env node
// Carries a pre-app progress.json into the course bookkeeping, so somebody with
// real history does not restart at zero.
//
//   npm run import:progress -- ./progress.json system-design-staff
//
// Needs `npm run dev` running. Idempotent: re-running overwrites the same rows.

const [file, courseId = "system-design-staff"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

if (!file) {
  console.error("usage: import-progress.mjs <progress.json> [courseId]");
  process.exit(1);
}

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${path} failed (${res.status})`);
  return data;
};

const progress = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));

const { enrollment } = await post("/api/enrollments", { courseId });
const result = await post(`/api/enrollments/${enrollment.id}/import`, progress);

console.log(`imported ${result.imported} topics into ${courseId}`);
if (result.skipped.length) {
  console.log(`skipped ${result.skipped.length} not in the course: ${result.skipped.join(", ")}`);
}
console.log(`\nopen ${BASE}/learn/${courseId}`);
