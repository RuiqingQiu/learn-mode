import fs from "node:fs";
import path from "node:path";

export type PromptName = "answer" | "triage" | "predict" | "reveal" | "protege" | "quiz" | "concepts" | "shadow-solve" | "shadow-diff" | "tutor";

/**
 * Prompts live in /prompts/*.md and are edited by hand (§5) — they are the actual
 * product. Read fresh on every request so editing a prompt takes effect without a
 * restart; that iteration loop is the point.
 */
export function loadPrompt(name: PromptName): string {
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  return fs.readFileSync(file, "utf8");
}
