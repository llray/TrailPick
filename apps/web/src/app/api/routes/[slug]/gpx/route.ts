import { getRouteBySlug } from "@/lib/routes";
import { trackToGpx } from "@/lib/gpx";

export const dynamic = "force-dynamic";

/** GET /api/routes/[slug]/gpx —— 导出 GPX */
export function GET(req: Request, { params }: { params: { slug: string } }) {
  const route = getRouteBySlug(params.slug);
  if (!route) return new Response("Not found", { status: 404 });
  const gpx = trackToGpx(route.name_cn, route.description, route.track);
  return new Response(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${route.slug}.gpx"`,
    },
  });
}
