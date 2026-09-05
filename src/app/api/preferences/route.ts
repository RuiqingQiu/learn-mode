import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { errorMessage } from "@/lib/sse";
import type { Preferences } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `preferences: null` means the setup screen has not been completed yet. */
export async function GET() {
  return NextResponse.json({ preferences: repo.getPreferences() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Preferences;
    if (
      !["teach_back", "quiz", "transfer_probe"].includes(body.reinforcement) ||
      !["prose", "balanced", "visual"].includes(body.density)
    ) {
      return NextResponse.json({ error: "Unknown preference value" }, { status: 400 });
    }
    repo.savePreferences({ reinforcement: body.reinforcement, density: body.density });
    return NextResponse.json({ preferences: repo.getPreferences() });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
