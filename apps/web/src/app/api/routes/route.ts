import { NextRequest, NextResponse } from "next/server";
import { searchRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** GET /api/routes —— 结构化搜索 (PRD §45) */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined);
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : undefined);

  const result = searchRoutes({
    q: sp.get("q") ?? undefined,
    city: sp.get("city") ?? undefined,
    distanceMin: num("distanceMin"),
    distanceMax: num("distanceMax"),
    durationMin: num("durationMin"),
    durationMax: num("durationMax"),
    difficultyMin: num("difficultyMin"),
    difficultyMax: num("difficultyMax"),
    elevationMin: num("elevationMin"),
    elevationMax: num("elevationMax"),
    districts: list("districts"),
    tags: list("tags"),
    transport: list("transport"),
    statuses: list("statuses"),
    sort: (sp.get("sort") as never) ?? undefined,
  });
  return NextResponse.json(result);
}
