import { channel } from "@/lib/channel";
import { buildPrediction, runTriage, streamPlainAnswer, tagConceptsInBackground } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { isAbort, sse } from "@/lib/sse";
import type { Mode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The single entry point for sending a message.
 *
 * In Learn mode this fires triage and the plain answer *in parallel* and throws
 * the answer away if triage says LEARNABLE (§7). That discard has to happen on
 * one side of the wire to be reliable, which is why triage is not a separate
 * client round trip here.
 */
export async function POST(req: Request) {
  const { threadId, question, mode, contextExchangeId } = (await req.json()) as {
    threadId: string;
    question: string;
    mode: Mode;
    /** Carry another exchange's explain-back transcript into this answer. */
    contextExchangeId?: string | null;
  };

  return sse(async (send) => {
    if (!threadId || !question?.trim()) {
      send({ type: "error", message: "threadId and question are required" });
      return;
    }

    const context = contextExchangeId ? repo.teachContext(contextExchangeId) : null;
    const exchangeId = repo.createExchange({
      thread_id: threadId,
      mode,
      question,
      state: mode === "learn" ? "predicting" : "done",
      context_exchange_id: context ? contextExchangeId : null,
    });
    send({ type: "exchange", exchangeId });

    const history = repo.threadHistory(threadId, exchangeId);

    // Start the plain answer immediately, regardless of mode. In Learn mode it is
    // a bet that triage will say LOOKUP.
    const ac = new AbortController();
    req.signal.addEventListener("abort", () => ac.abort());
    const text = channel<string>();
    const answer = streamPlainAnswer(question, history, context, ac.signal);
    answer.on("text", (delta) => text.push(delta));
    answer.finalMessage().then(
      () => text.close(),
      (err) => text.fail(err),
    );

    const deliverAnswer = async () => {
      let full = "";
      for await (const delta of text.drain()) {
        full += delta;
        send({ type: "text", delta });
      }
      repo.saveAnswer(exchangeId, {
        gist: null,
        core: null,
        full,
        delta_held_up: null,
        delta_off: null,
      });
      repo.setExchangeState(exchangeId, "done");
      tagConceptsInBackground(exchangeId, question, null);
      send({ type: "done" });
    };

    if (mode === "answer") {
      await deliverAnswer();
      return;
    }

    const triage = await runTriage(question, req.signal);
    repo.setTriageResult(exchangeId, triage);
    send({ type: "triage", result: triage });

    if (triage === "lookup") {
      await deliverAnswer();
      return;
    }

    // LEARNABLE — throw the speculative answer away and ask for a guess instead.
    ac.abort();
    try {
      const prompt = await buildPrediction(question, history, req.signal);
      const predictionId = repo.savePredictionPrompt(exchangeId, prompt);
      send({ type: "predict", predictionId, prompt });
      send({ type: "done" });
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
  });
}
