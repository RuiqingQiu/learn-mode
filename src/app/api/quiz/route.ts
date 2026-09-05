import { NextResponse } from "next/server";
import { buildQuiz, gradeQuizAnswer } from "@/lib/phases";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";
import type { QuizKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { action: "start"; exchangeId: string; kind: QuizKind }
  | { action: "answer"; exchangeId: string; questionId: string; text: string };

/** Retrieval practice after a reveal. `transfer` is the one-question variant. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const exchange = repo.getExchangeRow(body.exchangeId);
    const answer = repo.getAnswer(body.exchangeId);
    if (!exchange || !answer) return NextResponse.json({ error: "Nothing to quiz on" }, { status: 404 });

    const reference = [answer.gist, answer.core, answer.full].filter(Boolean).join("\n\n");

    if (body.action === "start") {
      const existing = repo.getQuiz(body.exchangeId);
      if (existing.length) return NextResponse.json({ questions: existing });

      const prediction = repo.getPrediction(body.exchangeId);
      // The belief their prediction got wrong is the thing most worth re-testing.
      const miss =
        prediction && prediction.was_correct === false && !prediction.skipped
          ? (answer.delta_off ?? prediction.text)
          : null;

      const questions = await buildQuiz(
        { kind: body.kind, question: exchange.question, answer: reference, predictionMiss: miss },
        req.signal,
      );
      if (!questions.length) return NextResponse.json({ error: "No questions came back" }, { status: 502 });
      return NextResponse.json({ questions: repo.saveQuizQuestions(body.exchangeId, body.kind, questions) });
    }

    const question = repo.getQuiz(body.exchangeId).find((q) => q.id === body.questionId);
    if (!question) return NextResponse.json({ error: "No such question" }, { status: 404 });

    const graded = await gradeQuizAnswer(
      { question: question.question, answer: reference, userAnswer: body.text },
      req.signal,
    );
    repo.saveQuizAnswer(question.id, body.text, graded.feedback, graded.correct);
    return NextResponse.json({ questions: repo.getQuiz(body.exchangeId) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
