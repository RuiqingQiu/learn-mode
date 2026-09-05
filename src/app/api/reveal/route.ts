import { streamReveal, tagConceptsInBackground } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { sse } from "@/lib/sse";
import { SectionStreamParser } from "@/lib/xml-stream";
import type { StreamSection } from "@/lib/xml-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** §4.3 — layered answer, streamed section by section as the XML arrives. */
export async function POST(req: Request) {
  const { exchangeId } = (await req.json()) as { exchangeId: string };

  return sse(async (send) => {
    const exchange = repo.getExchangeRow(exchangeId);
    if (!exchange) {
      send({ type: "error", message: "No such exchange" });
      return;
    }

    const prediction = repo.getPrediction(exchangeId);
    const history = repo.threadHistory(exchange.thread_id, exchangeId);
    repo.setExchangeState(exchangeId, "revealing");

    // Never rendered inline; they carry the model's judgment of the prediction.
    const META: StreamSection[] = ["verdict", "correct_option"];
    const acc: Partial<Record<StreamSection, string>> = {};
    const parser = new SectionStreamParser();
    const forward = (deltas: { name: StreamSection; delta: string }[]) => {
      for (const d of deltas) {
        acc[d.name] = (acc[d.name] ?? "") + d.delta;
        if (!META.includes(d.name)) send({ type: "section", name: d.name, delta: d.delta });
      }
    };

    // No abort signal: a reveal is the most expensive thing to lose, and
    // re-running it costs more than letting an abandoned one finish and save.
    const trimAcc = (k: StreamSection) => acc[k]?.trim() || null;
    // `full` arriving means gist/delta/core are complete — the answer is already
    // usable, so persist it now and let the user start explaining it back.
    let savedEarly = false;
    const saveProgress = () => {
      if (savedEarly || !acc.full) return;
      savedEarly = true;
      repo.saveAnswer(exchangeId, {
        gist: trimAcc("gist"),
        core: trimAcc("core"),
        full: trimAcc("full"),
        delta_held_up: trimAcc("held_up"),
        delta_off: trimAcc("off"),
      });
    };

    const stream = streamReveal(
      exchange.question,
      prediction,
      history,
      repo.getPreferencesOrDefault().density,
    );
    stream.on("text", (delta) => {
      forward(parser.push(delta));
      saveProgress();
    });
    await stream.finalMessage();
    forward(parser.flush());

    repo.saveAnswer(exchangeId, {
      gist: trimAcc("gist"),
      core: trimAcc("core"),
      full: trimAcc("full"),
      delta_held_up: trimAcc("held_up"),
      delta_off: trimAcc("off"),
    });

    const claimed = trimAcc("correct_option");
    const correctOptionId = prediction?.options?.some((o) => o.id === claimed) ? claimed : null;

    if (prediction) {
      // Skipped predictions carry no judgment. `partial` counts as not-correct.
      const verdict = trimAcc("verdict")?.toLowerCase();
      repo.setPredictionCorrect(
        prediction.id,
        prediction.skipped || !verdict ? null : verdict.startsWith("correct"),
        correctOptionId,
      );
    }

    send({ type: "meta", correctOption: correctOptionId });
    repo.finishRevealing(exchangeId);
    tagConceptsInBackground(exchangeId, exchange.question, trimAcc("gist"));
    send({ type: "done" });
  });
}
