import { NextRequest, NextResponse } from "next/server";
import { parseGpx, gpxToTrack } from "@/lib/gpx";
import { analyzeTrack, computeDifficulty, hashSeed } from "@/lib/geo";
import { appendRoute, getRouteBySlug } from "@/lib/routes";
import type { Route } from "@/lib/types";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload —— GPX 上传 (PRD §28-30, §74)
 * 默认 PRIVATE + PENDING_REVIEW，管理员审核后发布
 */
export async function POST(req: NextRequest) {
  let body: {
    gpx?: string;
    name?: string;
    description?: string;
    difficulty?: number;
    visibility?: string;
    uploaderName?: string;
    district?: string;
    tags?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.gpx) return NextResponse.json({ error: "GPX_REQUIRED" }, { status: 400 });

  let parsed;
  try {
    parsed = parseGpx(body.gpx);
  } catch (e) {
    return NextResponse.json({ error: "GPX_PARSE_FAILED", message: e instanceof Error ? e.message : "" }, { status: 400 });
  }
  if (parsed.points.length > 20000) {
    return NextResponse.json({ error: "GPX_TOO_LARGE" }, { status: 413 });
  }

  const track = gpxToTrack(parsed);
  const analysis = analyzeTrack(track, 1.15);
  const diff = computeDifficulty({
    distanceKm: analysis.distanceKm,
    gainM: analysis.gainM,
    surface: 2,
    technical: 1,
    exit: 1,
  });

  const visibility = ["PRIVATE", "UNLISTED", "PUBLIC"].includes(body.visibility ?? "")
    ? (body.visibility as Route["visibility"])
    : "PRIVATE";
  const slugBase = (body.name || parsed.name || "user-route")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user-route";
  let slug = slugBase;
  let n = 1;
  while (getRouteBySlug(slug)) slug = `${slugBase}-${++n}`;

  const route: Route = {
    id: "rt_u_" + crypto.randomBytes(4).toString("hex"),
    slug,
    name_cn: (body.name || parsed.name || "未命名路线").slice(0, 40),
    city: "shenzhen",
    district: body.district || "其他",
    districts: [body.district || "其他"],
    description: (body.description || "用户上传路线").slice(0, 500),
    distance_km: analysis.distanceKm,
    estimated_duration_min: analysis.durationMin,
    elevation_gain_m: analysis.gainM,
    elevation_loss_m: analysis.lossM,
    max_elevation_m: analysis.maxEle,
    min_elevation_m: analysis.minEle,
    difficulty: body.difficulty && body.difficulty >= 1 && body.difficulty <= 5 ? body.difficulty : diff.level,
    difficulty_detail: diff.detail,
    route_type: "LOOP",
    start: { lat: track[0][1], lng: track[0][0] },
    end: { lat: track[track.length - 1][1], lng: track[track.length - 1][0] },
    track: track.map(([lng, lat, ele]) => [+lng.toFixed(5), +lat.toFixed(5), +ele.toFixed(1)]),
    track_simplified: track.slice(0, 800).map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]),
    elevation_profile: analysis.profile,
    bbox: [0, 0, 0, 0].map((_, i) => [Infinity, Infinity, -Infinity, -Infinity][i] as never) as never,
    tags: body.tags?.slice(0, 6) ?? ["用户上传"],
    surface_types: ["未知"],
    status: "UNKNOWN",
    source_type: "USER_UPLOAD",
    source_name: "用户上传",
    source_license: `上传者 ${(body.uploaderName || "匿名").slice(0, 16)} 声明拥有数据权利`,
    review_status: "PENDING_REVIEW",
    visibility,
    uploader_name: (body.uploaderName || "匿名").slice(0, 16),
    transport: { access: [] },
    pois: [],
    safety: {
      emergency: "110 报警 / 120 急救",
      waterAvailable: false,
      mobileSignal: "fair",
      weatherRisk: "未勘测",
      nightHiking: false,
      wildlife: "未勘测",
      steepSections: analysis.steep.map((s) => ({ fromKm: s.fromKm, toKm: s.toKm, note: `坡度 ${s.grade}%` })),
    },
    rating: 0,
    stats: { views: 0, favorites: 0, vote_selected: 0, completed: 0 },
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  route.bbox = [
    Math.min(...track.map((p) => p[0])),
    Math.min(...track.map((p) => p[1])),
    Math.max(...track.map((p) => p[0])),
    Math.max(...track.map((p) => p[1])),
  ];
  void hashSeed;
  appendRoute(route);

  return NextResponse.json({
    ok: true,
    slug: route.slug,
    computed: {
      distance_km: route.distance_km,
      elevation_gain_m: route.elevation_gain_m,
      elevation_loss_m: route.elevation_loss_m,
      duration_min: route.estimated_duration_min,
      max_ele: route.max_elevation_m,
      points: parsed.points.length,
    },
    reviewStatus: route.review_status,
    visibility: route.visibility,
  });
}
