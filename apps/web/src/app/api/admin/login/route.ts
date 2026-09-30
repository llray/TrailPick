import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** POST /api/admin/login —— MVP 简单口令登录 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = process.env.ADMIN_PASSWORD || "trailpick";
  if (body.password !== password) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }
  cookies().set("tp_admin", "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
