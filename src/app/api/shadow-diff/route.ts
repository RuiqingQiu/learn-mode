import { streamShadowDiff, tagConceptsInBackground } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { sse } from "@/lib/sse";
import { SectionStreamParser } from "@/lib/xml-stream";
import type { StreamSection } from "@/lib/xml-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The decision diff, streamed row by row as the XML arrives. */
export async function POST(req: Request) {
  const { exchangeId } = (await req.json()) as { exchangeId: string };

  return sse(async (send) => {
    const exchange = repo.getExchangeRow(exchangeId);
    const shadow = repo.getShadow(exchangeId);
    const prediction = repo.getPrediction(exchangeId);

    if (!exchange || !shadow?.solution) {
      // The client waits for `shadow_ready` before calling this, so reaching here
      // means the solution genuinely is not written yet.
      send({ type: "error", message: "Claude has not finished its solution yet." });
      return;
    }
    if (!prediction?.text || prediction.skipped) {
      send({ type: "error", message: "Nothing committed to compare against." });
      return;
    }

    repo.setExchangeState(exchangeId, "diffing");

    const acc: Partial<Record<StreamSection, string>> = {};
    const parser = new SectionStreamParser();
    const forward = (deltas: { name: StreamSection; delta: string }[]) => {
      for (const d of deltas) {
        acc[d.name] = (acc[d.name] ?? "") + d.delta;
        send({ type: "section", name: d.name, delta: d.delta });
      }
    };

    // No abort signal, same call as /api/reveal: letting an abandoned diff finish
    // and persist is cheaper than regenerating it.
    const stream = streamShadowDiff({
      question: exchange.question,
      solution: shadow.solution,
      approach: prediction.text,
      confidence: prediction.confidence,
    });
    stream.on("text", (delta) => forward(parser.push(delta)));
    await stream.finalMessage();
    forward(parser.flush());

    const trim = (k: StreamSection) => acc[k]?.trim() ?? "";
    repo.saveShadowDiff(exchangeId, {
      summary: trim("summary"),
      axes: trim("axes"),
      // Deliberately allowed to be empty — shadow-diff.md says an unearned
      // strong point is worse than none, so do not coerce it into a placeholder.
      strong_point: trim("strong_point"),
      probe_scenario: trim("probe_scenario"),
      probe_question: trim("probe_question"),
    });

    repo.setExchangeState(exchangeId, "done");
    tagConceptsInBackground(exchangeId, exchange.question, trim("summary") || null);
    send({ type: "done" });
  });
}
