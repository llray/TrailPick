import { NextRequest, NextResponse } from "next/server";
import { rollDice } from "@/lib/votes";

export const dynamic = "force-dynamic";

/** POST /api/votes/[id]/dice —— 平局骰子/强制决定 (PRD §27) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { by?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {}
  const res = rollDice(params.id, body.by ?? "", !!body.force);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, picked: res.picked, decision: res.room.decision });
}
