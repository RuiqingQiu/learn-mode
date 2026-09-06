import { buildHint, gradeQuizAnswer } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";
import { NextResponse } from "next/server";
import type { Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Skill Shadow state transitions. Plain JSON, mirroring /api/exchange — only the
 * diff itself streams.
 *
 * `commit` and `skip` both record a prediction response, so a Shadow exchange
 * lands in the same calibration pool as a Learn one (§10.5) with no extra
 * plumbing, and its misses are eligible for a later transfer challenge.
 */
type Body =
  | { action: "commit"; exchangeId: string; predictionId: string; approach: string; confidence: Confidence | null }
  | { action: "solution"; exchangeId: string }
  | { action: "skip"; predictionId: string; exchangeId: string }
  | { action: "hint"; exchangeId: string; predictionId: string }
  | { action: "probe"; exchangeId: string; predictionId: string; answer: string };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  try {
    switch (body.action) {
      case "commit": {
        repo.savePredictionResponse(body.predictionId, {
          text: body.approach,
          confidence: body.confidence,
          skipped: false,
        });
        // The solution is handed over here rather than pushed down the /api/ask
        // stream, so it is never on the wire before the user has committed. The
        // blur is a real boundary, not a CSS one you can defeat with devtools.
        // Null when Claude has not finished — the client waits for shadow_ready.
        return NextResponse.json({ solution: repo.getShadow(body.exchangeId)?.solution ?? null });
      }

      /** Claude finished after the user had already committed. */
      case "solution": {
        return NextResponse.json({ solution: repo.getShadow(body.exchangeId)?.solution ?? null });
      }

      // §1: the escape hatch. No diff, no probe, no comment on having skipped —
      // was_correct stays NULL rather than being scored as a miss.
      case "skip": {
        repo.savePredictionResponse(body.predictionId, {
          text: null,
          confidence: null,
          skipped: true,
        });
        repo.setExchangeState(body.exchangeId, "done");
        return NextResponse.json({ solution: repo.getShadow(body.exchangeId)?.solution ?? null });
      }

      case "hint": {
        const shadow = repo.getShadow(body.exchangeId);
        if (!shadow?.probe_question) {
          return NextResponse.json({ error: "No probe to hint at" }, { status: 400 });
        }
        repo.markHinted(body.predictionId);
        const hint = await buildHint(shadow.probe_scenario ?? "", shadow.probe_question);
        return NextResponse.json({ hint });
      }

      case "probe": {
        const shadow = repo.getShadow(body.exchangeId);
        if (!shadow?.probe_question || !shadow.solution) {
          return NextResponse.json({ error: "No probe to answer" }, { status: 400 });
        }
        // Skipping the probe is a first-class path (§1): no grading, and
        // was_correct stays NULL rather than being recorded as a miss.
        if (!body.answer.trim()) {
          repo.saveShadowProbeAnswer(body.exchangeId, "", "");
          repo.setExchangeState(body.exchangeId, "done");
          return NextResponse.json({ correct: null, feedback: "" });
        }

        const { correct, feedback } = await gradeQuizAnswer({
          question: `${shadow.probe_scenario ?? ""}\n\n${shadow.probe_question}`,
          answer: shadow.solution,
          userAnswer: body.answer,
        });
        repo.saveShadowProbeAnswer(body.exchangeId, body.answer, feedback);
        // The join to everything else: this is what puts a Shadow exchange into
        // the calibration pool and makes a miss eligible for a later challenge.
        repo.setPredictionCorrect(body.predictionId, correct);
        repo.setExchangeState(body.exchangeId, "done");
        return NextResponse.json({ correct, feedback });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
