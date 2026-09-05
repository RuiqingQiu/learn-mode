import { NextResponse } from "next/server";
import { buildPrediction } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §7's route list. /api/ask builds the prediction inline; this stays exposed for
 * iterating on predict.md. Pass `threadId` to include thread context.
 */
export async function POST(req: Request) {
  try {
    const { question, threadId } = (await req.json()) as { question?: string; threadId?: string };
    if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });
    const history = threadId ? repo.threadHistory(threadId) : [];
    return NextResponse.json(await buildPrediction(question, history, req.signal));
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
