import { NextResponse } from "next/server";
import { runTriage } from "@/lib/phases";
import { errorMessage } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §7's route list. The chat flow does not call this — /api/ask runs triage in
 * parallel with the answer so the discard is not racy — but it stays exposed for
 * iterating on triage.md against real questions.
 */
export async function POST(req: Request) {
  try {
    const { question } = (await req.json()) as { question?: string };
    if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });
    return NextResponse.json({ result: await runTriage(question, req.signal) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
