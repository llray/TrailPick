import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/votes";

export const dynamic = "force-dynamic";

/** POST /api/votes/[id]/vote —— 投票/改票 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { voterName?: string; browserId?: string; routeIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const res = castVote(params.id, {
    voterName: body.voterName ?? "",
    browserId: body.browserId ?? "",
    routeIds: body.routeIds ?? [],
    ip,
  });
  if (!res.ok) {
    const status = res.error === "RATE_LIMITED" ? 429 : res.error === "ROOM_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, roomId: res.room.id });
}
