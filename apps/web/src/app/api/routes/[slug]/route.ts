import { NextRequest, NextResponse } from "next/server";
import { getRouteBySlug, updateStats } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** GET /api/routes/[slug] —— 详情（含轨迹与海拔剖面） */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const route = getRouteBySlug(params.slug);
  if (!route) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (req.nextUrl.searchParams.get("view") === "1") {
    updateStats(route.id, { ...route.stats, views: route.stats.views + 1 });
  }
  return NextResponse.json(route);
}
