"use client";

/**
 * 首页 Discover (PRD §8/§90)：搜索 + 筛选 + 地图 + 路线列表
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { RouteCardData } from "@/lib/types";
import { fetchJson } from "@/lib/client";
import { RouteCard } from "./RouteCard";
import { FilterSheet, type FilterState, EMPTY_FILTERS, activeFilterCount, filterToQuery } from "./FilterSheet";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--ink-3)]">
      地图加载中…
    </div>
  ),
});

const DISTRICTS = ["福田", "罗湖", "南山", "盐田", "宝安", "龙岗", "龙华", "坪山", "光明", "大鹏"];
const ZONES: Record<string, string[]> = {
  东部: ["盐田", "龙岗", "坪山", "大鹏"],
  西部: ["宝安", "龙华", "南山", "光明"],
  市中心: ["福田", "罗湖", "南山"],
  大鹏半岛: ["大鹏"],
};
const QUICK_TAGS = ["登顶", "亲子", "滨海", "穿越", "绿道", "日落", "溪谷", "官方径"];

export function Discover() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [queryInput, setQueryInput] = useState(q);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...EMPTY_FILTERS,
    ...(sp.get("districts") ? { districts: sp.get("districts")!.split(",") } : {}),
    ...(sp.get("tags") ? { tags: sp.get("tags")!.split(",") } : {}),
  }));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [routes, setRoutes] = useState<RouteCardData[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tracks, setTracks] = useState<Record<string, [number, number][]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sort, setSort] = useState("recommend");

  const query = useMemo(() => filterToQuery(filters, q, sort), [filters, q, sort]);

  useEffect(() => {
    let alive = true;
    setRoutes(null);
    fetchJson<{ total: number; routes: RouteCardData[] }>(`/api/routes?${query}`)
      .then((d) => {
        if (!alive) return;
        setRoutes(d.routes);
        setTotal(d.total);
      })
      .catch(() => alive && setRoutes([]));
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    if (view !== "map" || Object.keys(tracks).length) return;
    fetchJson<Record<string, [number, number][]>>("/api/tracks").then(setTracks).catch(() => {});
  }, [view, tracks]);

  const mapRoutes = useMemo(
    () =>
      (routes ?? [])
        .map((r) => ({ r, coords: tracks[r.id] }))
        .filter((x) => x.coords)
        .map((x) => ({
          id: x.r.id,
          name: x.r.name_cn,
          difficulty: x.r.difficulty,
          status: x.r.status,
          coords: x.coords,
        })),
    [routes, tracks]
  );

  const onSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setQ(queryInput.trim());
  };

  const goRandom = () => {
    const p = new URLSearchParams();
    const f = filters;
    if (f.distance) p.set("distance", f.distance.join(","));
    if (f.duration) p.set("duration", f.duration.join(","));
    if (f.difficulty) p.set("difficulty", f.difficulty.join(","));
    if (f.districts.length) p.set("districts", f.districts.join(","));
    router.push(`/random?${p.toString()}`);
  };

  const nActive = activeFilterCount(filters);

  return (
    <div>
      {/* Hero */}
      <section className="fade-up">
        <div className="flex flex-col gap-1">
          <div className="label">Shenzhen Trail Decision Platform · 深圳 {total || "50"} 条路线</div>
          <h1 className="font-display text-[34px] font-extrabold leading-[1.15] sm:text-[44px]">
            今天走哪条<span className="text-[color:var(--blaze)]">？</span>
          </h1>
          <p className="max-w-xl text-[14px] leading-relaxed text-[color:var(--ink-2)]">
            筛选 → 投票 → 骰子。一个人快速找路线，一群人快速做决定。
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button className="btn-primary" onClick={goRandom}>
            🎲 帮我选一条
          </button>
          <a className="btn-forest" href="#discover">
            🔍 找路线
          </a>
          <button className="btn-ghost" onClick={() => router.push("/vote/create")}>
            👥 发起路线投票
          </button>
        </div>
      </section>

      <div id="discover" className="mt-8 scroll-mt-20">
        {/* 搜索 + 筛选 */}
        <div className="flex items-center gap-2">
          <form onSubmit={onSearch} className="relative flex-1">
            <input
              className="input w-full pl-9"
              placeholder="搜索路线 / 地点 / 标签，如 梧桐山"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px]">🔍</span>
          </form>
          <button
            className={`chip ${nActive > 0 ? "chip-active" : ""} shrink-0 !px-4 !py-2.5`}
            onClick={() => setSheetOpen(true)}
          >
            ⚙️ 筛选{nActive > 0 ? ` · ${nActive}` : ""}
          </button>
        </div>

        {/* 快捷标签 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_TAGS.map((t) => (
            <button
              key={t}
              className={`chip ${filters.tags.includes(t) ? "chip-active" : ""}`}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
                }))
              }
            >
              #{t}
            </button>
          ))}
          {DISTRICTS.slice(0, 5).map((d) => (
            <button
              key={d}
              className={`chip ${filters.districts.includes(d) ? "chip-active" : ""}`}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  districts: f.districts.includes(d) ? f.districts.filter((x) => x !== d) : [...f.districts, d],
                }))
              }
            >
              {d}
            </button>
          ))}
          <button className="chip" onClick={() => setSheetOpen(true)}>
            更多…
          </button>
        </div>

        {/* 结果栏 */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-[14px] font-semibold">
            深圳 ·{" "}
            <span className="font-num text-[color:var(--forest)]">{routes ? total : "…"}</span> 条路线
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input !py-1.5 !px-2.5 text-[13px]"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recommend">综合推荐</option>
              <option value="distance_asc">距离 ↑</option>
              <option value="difficulty_asc">难度 ↑</option>
              <option value="difficulty_desc">难度 ↓</option>
              <option value="rating">评分优先</option>
            </select>
            <div className="flex overflow-hidden rounded-full border border-[color:var(--line-2)] text-[13px]">
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  className={`px-3.5 py-1.5 font-medium transition-colors ${view === v ? "bg-[color:var(--forest)] text-white" : "text-[color:var(--ink-2)]"}`}
                  onClick={() => setView(v)}
                >
                  {v === "list" ? "列表" : "地图"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 列表 + 地图 */}
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className={`${view === "map" ? "hidden lg:block" : ""} space-y-3`}>
            {routes === null && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card h-[120px] animate-pulse opacity-60" />
                ))}
              </div>
            )}
            {routes?.length === 0 && (
              <div className="card flex flex-col items-center gap-2 p-10 text-center">
                <span className="text-[32px]">🪧</span>
                <p className="font-semibold">没有符合的路线</p>
                <p className="text-[13px] text-[color:var(--ink-3)]">试试放宽筛选条件，或让骰子决定</p>
                <button className="btn-primary mt-2" onClick={goRandom}>
                  🎲 帮我选一条
                </button>
              </div>
            )}
            {routes?.map((r, i) => (
              <div
                key={r.id}
                onMouseEnter={() => setActiveId(r.id)}
                data-id={r.id}
                className={activeId === r.id ? "rounded-2xl ring-2 ring-[color:var(--blaze)] ring-offset-2 ring-offset-[color:var(--paper)]" : ""}
              >
                <RouteCard route={r} index={i} />
              </div>
            ))}
          </div>

          {/* 地图：移动端全宽显示，桌面端右侧粘性 */}
          <div
            className={`${view === "map" ? "block" : "hidden"} lg:block`}
          >
            <div className="card sticky top-20 h-[420px] overflow-hidden lg:h-[calc(100vh-9rem)]">
              {Object.keys(tracks).length === 0 && view === "map" ? (
                <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--ink-3)]">轨迹加载中…</div>
              ) : (
                <MapView
                  routes={mapRoutes}
                  activeId={activeId}
                  onRouteClick={(id) => {
                    setActiveId(id);
                    document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <FilterSheet
        open={sheetOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

export { DISTRICTS, ZONES };
