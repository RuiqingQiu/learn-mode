import { sse } from "@/lib/sse";
import { runTutorTurn } from "@/lib/tutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One turn of a guided session. `text` omitted opens the session — the model
 * asks the first question with nothing to evaluate yet.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  return sse(async (send) => {
    await runTutorTurn(send, id, text?.trim() || null);
  });
}
