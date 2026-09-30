import { NextResponse } from "next/server";
import { allSimplifiedTracks } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** GET /api/tracks —— 全部简化轨迹（首页地图异步加载，PRD §87） */
export function GET() {
  return NextResponse.json(allSimplifiedTracks());
}
