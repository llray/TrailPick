/**
 * 天气 + 动态预警 API（PRD §61）
 * GET /api/weather?slug=<route-slug>
 * 服务端 30 分钟缓存；上游 Open-Meteo 免费无 key
 */
import { NextResponse } from "next/server";
import { getWeatherCached } from "@/lib/weather";
import { dataFile } from "@/lib/store";
import fs from "node:fs";
import type { Route } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  let routes: Route[];
  try {
    routes = JSON.parse(fs.readFileSync(dataFile("routes.json"), "utf8")) as Route[];
  } catch {
    return NextResponse.json({ error: "data unavailable" }, { status: 503 });
  }
  const route = routes.find((r) => r.slug === slug);
  if (!route) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = await getWeatherCached(route);
  if (!data) {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502, headers: { "Cache-Control": "max-age=120" } });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=600" } });
}
