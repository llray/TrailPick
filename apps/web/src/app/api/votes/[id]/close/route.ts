import { NextRequest, NextResponse } from "next/server";
import { closeVote } from "@/lib/votes";

export const dynamic = "force-dynamic";

/** POST /api/votes/[id]/close —— 创建者关闭投票 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { by?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const res = closeVote(params.id, body.by ?? "");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
