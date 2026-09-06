import { sse } from "@/lib/sse";
import { runTutorTurn } from "@/lib/tutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `End session`. Writes the wrap-up and scores the topic, whatever the budget said. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return sse(async (send) => {
    await runTutorTurn(send, id, null, true);
  });
}
