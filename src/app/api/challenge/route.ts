import { buildQuiz, gradeQuizAnswer } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The delayed transfer challenge — a belief you got wrong earlier, re-tested in a
 * different domain with nothing on screen to read from.
 *
 * This is the only place in the product that measures whether anything survived
 * after the explanation was gone. Everything else measures what happens while it
 * is still in front of you.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as
    | { action: "peek"; excludeExchangeId?: string }
    | { action: "answer"; id: string; answer: string };

  try {
    if (body.action === "answer") {
      const challenge = repo.getChallenge(body.id);
      if (!challenge) return NextResponse.json({ error: "No such challenge" }, { status: 404 });

      // Skipping is never scored — was_correct stays NULL, same as everywhere else.
      if (!body.answer.trim()) {
        repo.saveChallengeAnswer(body.id, "", "", null);
        return NextResponse.json({ correct: null, feedback: "" });
      }

      const { correct, feedback } = await gradeQuizAnswer({
        question: challenge.question,
        answer: challenge.reference,
        userAnswer: body.answer,
      });
      repo.saveChallengeAnswer(body.id, body.answer, feedback, correct);
      return NextResponse.json({ correct, feedback });
    }

    // An already-generated challenge that was never answered comes back as-is,
    // so reloading the page does not burn another call or change the question.
    const open = repo.openChallenge();
    if (open) return NextResponse.json({ challenge: open });

    const src = repo.pendingChallengeSource(body.excludeExchangeId);
    if (!src) return NextResponse.json({ challenge: null });

    const [question] = await buildQuiz({
      kind: "transfer",
      question: src.sourceQuestion,
      answer: src.correction,
      predictionMiss: src.believed,
      pastMiss: {
        question: src.sourceQuestion,
        believed: src.believed,
        correction: src.correction,
      },
    });
    if (!question) return NextResponse.json({ challenge: null });

    return NextResponse.json({ challenge: repo.createChallenge(src, question) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
