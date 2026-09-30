import { NextRequest, NextResponse } from "next/server";
import { createVote, listVotes } from "@/lib/votes";

export const dynamic = "force-dynamic";

/** POST /api/votes —— 创建投票 (PRD §47) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const room = createVote({
      title: body.title,
      routeIds: body.routes ?? body.routeIds,
      multipleChoice: !!body.multipleChoice,
      showLive: body.showLive !== false,
      deadlineMin: body.deadlineMin ?? null,
      createdBy: body.createdBy,
    });
    return NextResponse.json({
      voteId: room.id,
      shareUrl: `/v/${room.id}`,
      room,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** GET /api/votes —— 列表（admin 用） */
export function GET() {
  return NextResponse.json(listVotes());
}
