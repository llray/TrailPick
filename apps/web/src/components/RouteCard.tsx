"use client";

import Link from "next/link";
import type { RouteCardData } from "@/lib/types";
import { formatKm, formatDuration } from "@/lib/format";
import { StatusBadge, DifficultyBadge, TagChip } from "./badges";

export function RouteCard({ route, index = 0 }: { route: RouteCardData; index?: number }) {
  return (
    <Link
      href={`/route/${route.slug}`}
      className="card card-hover fade-up block overflow-hidden p-4"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[16px] font-bold leading-snug">{route.name_cn}</h3>
            <StatusBadge status={route.status} note={route.status_note} />
          </div>
          <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
            {route.destination ? `${route.destination} · ` : ""}
            {route.district} ·{" "}
            {route.route_type === "LOOP" ? "环线" : route.route_type === "TRAVERSE" ? "穿越" : "往返"}
            {route.name_en ? ` · ${route.name_en}` : ""}
          </p>
        </div>
        <DifficultyBadge level={route.difficulty} showLabel={false} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-num text-[13px] text-[color:var(--ink-2)]">
        <span>{formatKm(route.distance_km)}</span>
        <span>⏱ {formatDuration(route.estimated_duration_min)}</span>
        <span>↑ {route.elevation_gain_m}m</span>
        <span className="text-[color:var(--warn)]">★ {route.rating.toFixed(1)}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {route.tags.slice(0, 4).map((t) => (
          <TagChip key={t} tag={t} />
        ))}
      </div>
    </Link>
  );
}
