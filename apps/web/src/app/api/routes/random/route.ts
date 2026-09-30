import { NextRequest, NextResponse } from "next/server";
import { pickRandomRoute } from "@/lib/random";

export const dynamic = "force-dynamic";

interface RandomBody {
  city?: string;
  distance?: [number?, number?];
  difficulty?: [number?, number?];
  durationMin?: number;
  durationMax?: number;
  elevationMax?: number;
  districts?: string[];
  tags?: string[];
  transport?: string[];
  excludeIds?: string[];
  excludeClosed?: boolean;
}

/** POST /api/routes/random —— 加权随机 (PRD §46) */
export async function POST(req: NextRequest) {
  let body: RandomBody = {};
  try {
    body = await req.json();
  } catch {}
  const result = pickRandomRoute({
    city: body.city ?? "shenzhen",
    distanceMin: body.distance?.[0],
    distanceMax: body.distance?.[1],
    difficultyMin: body.difficulty?.[0],
    difficultyMax: body.difficulty?.[1],
    durationMin: body.durationMin,
    durationMax: body.durationMax,
    elevationMax: body.elevationMax,
    districts: body.districts,
    tags: body.tags,
    transport: body.transport,
    excludeIds: body.excludeIds,
    excludeClosed: body.excludeClosed,
  });
  if (!result) {
    return NextResponse.json({ error: "NO_CANDIDATE", message: "没有符合条件的路线，请放宽筛选" }, { status: 404 });
  }
  return NextResponse.json(result);
}
