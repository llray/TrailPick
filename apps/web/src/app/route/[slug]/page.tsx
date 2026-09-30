import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRouteBySlug, similarRoutes } from "@/lib/routes";
import { RouteDetail } from "@/components/RouteDetail";
import { RouteCard } from "@/components/RouteCard";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = getRouteBySlug(params.slug);
  if (!route) return { title: "路线不存在" };
  return {
    title: `${route.name_cn} · 深圳${route.district}徒步路线`,
    description: `${route.name_cn}：${route.distance_km} 公里，累计爬升 ${route.elevation_gain_m} 米，难度 ${route.difficulty} 级，约 ${Math.round(((route.estimated_duration_min / 60) * 10) / 10)} 小时。${route.description.slice(0, 60)}`,
    openGraph: {
      title: `${route.name_cn} · TrailPick`,
      description: route.description.slice(0, 100),
    },
  };
}

export default function RouteDetailPage({ params }: Props) {
  const route = getRouteBySlug(params.slug);
  if (!route || route.review_status === "DRAFT") notFound();
  const similar = similarRoutes(route, 4);

  return (
    <div>
      <nav className="mb-4 text-[13px] text-[color:var(--ink-3)]">
        <Link href="/" className="hover:text-[color:var(--forest)]">
          发现
        </Link>
        {route.destination && (
          <>
            <span className="mx-1.5">/</span>
            <span>{route.destination}</span>
          </>
        )}
        <span className="mx-1.5">/</span>
        <span className="text-[color:var(--ink)]">{route.name_cn}</span>
      </nav>

      <RouteDetail route={route} />

      {similar.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[17px] font-bold">相似路线</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {similar.map((r, i) => (
              <RouteCard key={r.id} route={r} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
