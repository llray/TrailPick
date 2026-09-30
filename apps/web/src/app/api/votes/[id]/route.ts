import { NextResponse } from "next/server";
import { getVote, resultsOf, isClosed } from "@/lib/votes";
import { getRoutesLite } from "@/lib/vote-helpers";

export const dynamic = "force-dynamic";

/** GET /api/votes/[id] —— 投票房轮询 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const room = getVote(params.id);
  if (!room) return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  const results = resultsOf(room);
  return NextResponse.json({
    room: {
      id: room.id,
      title: room.title,
      multipleChoice: room.multipleChoice,
      showLive: room.showLive,
      deadline: room.deadline,
      closedAt: room.closedAt,
      createdBy: room.createdBy,
      createdAt: room.createdAt,
      decision: room.decision,
    },
    closed: isClosed(room),
    results,
    routes: await getRoutesLite(room.routeIds),
  });
}
