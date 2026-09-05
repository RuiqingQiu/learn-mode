import { NextResponse } from "next/server";
import { buildHint } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";
import type { Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { action: "submit_prediction"; predictionId: string; text: string; confidence: Confidence | null }
  | { action: "skip_prediction"; predictionId: string }
  | { action: "hint"; exchangeId: string; predictionId: string }
  | { action: "start_teaching"; exchangeId: string }
  | { action: "end"; exchangeId: string }
  | { action: "clear_teaching"; exchangeId: string };

/** §7's `POST /api/exchange` — persist state transitions. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    switch (body.action) {
      case "submit_prediction": {
        repo.savePredictionResponse(body.predictionId, {
          text: body.text,
          confidence: body.confidence,
          skipped: false,
        });
        return NextResponse.json({ ok: true });
      }

      case "skip_prediction": {
        // §4.2 / §1: the escape hatch. No penalty framing anywhere downstream.
        repo.savePredictionResponse(body.predictionId, { text: null, confidence: null, skipped: true });
        return NextResponse.json({ ok: true });
      }

      case "hint": {
        const exchange = repo.getExchangeRow(body.exchangeId);
        const prediction = repo.getPrediction(body.exchangeId);
        if (!exchange || !prediction) return NextResponse.json({ error: "Not found" }, { status: 404 });
        repo.markHinted(prediction.id);
        const hint = await buildHint(exchange.question, prediction.prompt_text, req.signal);
        return NextResponse.json({ hint });
      }

      case "start_teaching": {
        repo.setExchangeState(body.exchangeId, "teaching");
        return NextResponse.json({ ok: true });
      }

      case "clear_teaching": {
        // Discard the session outright. The exchange goes back to offering
        // "Explain it back" — clearing is not a punishment, it is a reset.
        repo.clearTeachTurns(body.exchangeId);
        repo.setExchangeState(body.exchangeId, "done");
        return NextResponse.json({ ok: true });
      }

      case "end": {
        repo.setExchangeState(body.exchangeId, "done");
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
