import { NextRequest, NextResponse } from "next/server";
import { loadRoutes, updateRouteStatus, publishRoute, toCard, popularityScore } from "@/lib/routes";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function checkAdmin(req: NextRequest): boolean {
  const c = cookies().get("tp_admin")?.value;
  if (c === "1") return true;
  const header = req.headers.get("x-admin-password");
  return !!header && header === (process.env.ADMIN_PASSWORD || "trailpick");
}

/** GET /api/admin/routes —— 全量路线（含未发布） */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const routes = loadRoutes();
  return NextResponse.json({
    total: routes.length,
    routes: routes.map((r) => ({
      ...toCard(r),
      popularity: popularityScore(r),
    })),
  });
}

/** PATCH /api/admin/routes —— 改状态/发布 (PRD §58-59) */
export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await req.json();
  if (body.action === "publish") {
    const ok = publishRoute(body.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (body.action === "status") {
    const ok = updateRouteStatus(body.id, body.status, body.note);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
