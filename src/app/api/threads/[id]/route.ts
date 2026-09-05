import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = repo.getThread(id);
  if (!thread) return NextResponse.json({ error: "No such thread" }, { status: 404 });
  return NextResponse.json({ thread, exchanges: repo.listExchanges(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  repo.deleteThread(id);
  return NextResponse.json({ ok: true });
}
