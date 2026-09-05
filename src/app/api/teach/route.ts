import { TEACH_TURN_CAP, streamProtege } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { sse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §4.4 protégé mode. Hard cap of 4 junior turns (idx 0–3); the exit summary is
 * stored as the turn at idx === TEACH_TURN_CAP.
 */
export async function POST(req: Request) {
  const { exchangeId, userMsg } = (await req.json()) as { exchangeId: string; userMsg?: string };

  return sse(async (send) => {
    const exchange = repo.getExchangeRow(exchangeId);
    const answer = repo.getAnswer(exchangeId);
    if (!exchange || !answer) {
      send({ type: "error", message: "No revealed answer to explain back" });
      return;
    }

    let turns = repo.getTeachTurns(exchangeId).filter((t) => t.idx < TEACH_TURN_CAP);
    if (userMsg?.trim() && turns.length) {
      repo.setTeachUserMsg(exchangeId, turns.length - 1, userMsg.trim());
      turns = repo.getTeachTurns(exchangeId).filter((t) => t.idx < TEACH_TURN_CAP);
    }

    // Only answered turns go into the transcript. A junior question with no reply
    // yet would leave the conversation ending on an assistant turn, which the API
    // rejects as a prefill — so re-entering regenerates that question instead.
    const answered = turns.filter((t) => t.user_msg !== null);
    const closing = answered.length >= TEACH_TURN_CAP;
    const idx = closing ? TEACH_TURN_CAP : answered.length;
    if (repo.getTeachTurns(exchangeId).some((t) => t.idx >= TEACH_TURN_CAP)) {
      send({ type: "error", message: "This session has already ended" });
      return;
    }

    repo.setExchangeState(exchangeId, closing ? "done" : "teaching");

    const answerText = [answer.gist, answer.core, answer.full].filter(Boolean).join("\n\n");
    // No abort signal: if the browser goes away mid-turn we still finish and
    // persist, so a refresh does not silently lose the junior's question.
    const stream = streamProtege({
      question: exchange.question,
      answer: answerText,
      turns: answered,
      closing,
    });

    let text = "";
    stream.on("text", (delta) => {
      text += delta;
      send({ type: "text", delta });
    });
    await stream.finalMessage();

    repo.replaceTeachTurn(exchangeId, idx, text.trim());
    send({ type: "done", idx, ended: closing });
  });
}
