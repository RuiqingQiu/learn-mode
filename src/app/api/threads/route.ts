import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ threads: repo.listThreads() });
}

export async function POST() {
  return NextResponse.json({ thread: repo.createThread() });
}
