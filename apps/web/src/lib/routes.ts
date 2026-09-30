/**
 * 路线数据访问 + 结构化筛选 (PRD §9-15, §45)
 */
import fs from "node:fs";
import type { Route, RouteCardData } from "./types";
import { cached, readJson, writeJson, dataFile } from "./store";

export interface SearchParams {
  q?: string;
  city?: string;
  distanceMin?: number;
  distanceMax?: number;
  durationMax?: number;
  durationMin?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  elevationMax?: number;
  elevationMin?: number;
  districts?: string[];
  tags?: string[];
  transport?: string[];
  statuses?: string[];
  sort?: "recommend" | "distance_asc" | "distance_desc" | "difficulty_asc" | "difficulty_desc" | "rating" | "duration_asc";
  includeUnpublished?: boolean;
}

/** 加载全部路线（缓存，文件变更自动失效） */
export function loadRoutes(): Route[] {
  return cached("routes", () => {
    const p = dataFile("routes.json");
    const routes = JSON.parse(fs.readFileSync(p, "utf8")) as Route[];
    // 叠加运行时统计（views 等保存在 stats.json，避免重写大文件）
    const stats = readJson<Record<string, Partial<Route["stats"]>>>("stats.json", {});
    for (const r of routes) {
      const s = stats[r.id];
      if (s) r.stats = { ...r.stats, ...s };
    }
    return routes;
  });
}

export function reloadRoutes(): void {
  cached("routes", () => loadRoutesUncached());
}

function loadRoutesUncached(): Route[] {
  const p = dataFile("routes.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as Route[];
}

function cardOf(r: Route): RouteCardData {
  const { track: _t, track_simplified: _s, elevation_profile: _e, ...card } = r;
  void _t;
  void _s;
  void _e;
  return card;
}

/** 热度分 (PRD §56): views + favorites×3 + vote_selected×4 + completed×5 */
export function popularityScore(r: RouteCardData | Route): number {
  return (
    r.stats.views +
    r.stats.favorites * 3 +
    r.stats.vote_selected * 4 +
    r.stats.completed * 5
  );
}

function matchTags(route: Route, tags: string[]): boolean {
  return tags.every((t) => route.tags.includes(t) || route.tags.some((rt) => rt.includes(t) || t.includes(rt)));
}

export function applyFilters(routes: Route[], p: SearchParams): Route[] {
  let out = routes;
  if (!p.includeUnpublished) {
    out = out.filter((r) => (r.review_status ?? "PUBLISHED") === "PUBLISHED");
  }
  if (p.city) out = out.filter((r) => r.city === p.city);
  if (p.q) {
    const q = p.q.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.name_cn.toLowerCase().includes(q) ||
        (r.name_en ?? "").toLowerCase().includes(q) ||
        (r.destination ?? "").includes(q) ||
        r.district.includes(q) ||
        r.tags.some((t) => t.includes(q))
    );
  }
  if (p.distanceMin != null) out = out.filter((r) => r.distance_km >= p.distanceMin!);
  if (p.distanceMax != null) out = out.filter((r) => r.distance_km <= p.distanceMax!);
  if (p.durationMin != null) out = out.filter((r) => r.estimated_duration_min >= p.durationMin!);
  if (p.durationMax != null) out = out.filter((r) => r.estimated_duration_min <= p.durationMax!);
  if (p.difficultyMin != null) out = out.filter((r) => r.difficulty >= p.difficultyMin!);
  if (p.difficultyMax != null) out = out.filter((r) => r.difficulty <= p.difficultyMax!);
  if (p.elevationMin != null) out = out.filter((r) => r.elevation_gain_m >= p.elevationMin!);
  if (p.elevationMax != null) out = out.filter((r) => r.elevation_gain_m <= p.elevationMax!);
  if (p.districts?.length) {
    out = out.filter((r) => p.districts!.includes(r.district) || r.districts.some((d) => p.districts!.includes(d)));
  }
  if (p.tags?.length) out = out.filter((r) => matchTags(r, p.tags!));
  if (p.transport?.length) {
    out = out.filter((r) => p.transport!.some((t) => r.transport.access.includes(t as never)));
  }
  if (p.statuses?.length) out = out.filter((r) => p.statuses!.includes(r.status));
  return out;
}

function sortRoutes(routes: Route[], sort: SearchParams["sort"]): Route[] {
  const arr = routes.slice();
  switch (sort) {
    case "distance_asc":
      return arr.sort((a, b) => a.distance_km - b.distance_km);
    case "distance_desc":
      return arr.sort((a, b) => b.distance_km - a.distance_km);
    case "duration_asc":
      return arr.sort((a, b) => a.estimated_duration_min - b.estimated_duration_min);
    case "difficulty_asc":
      return arr.sort((a, b) => a.difficulty - b.difficulty);
    case "difficulty_desc":
      return arr.sort((a, b) => b.difficulty - a.difficulty);
    case "rating":
      return arr.sort((a, b) => b.rating - a.rating);
    default: {
      // 推荐：综合评分 + 热度
      const maxPop = Math.max(...arr.map(popularityScore), 1);
      return arr.sort((a, b) => {
        const sa = a.rating * 20 + (popularityScore(a) / maxPop) * 10;
        const sb = b.rating * 20 + (popularityScore(b) / maxPop) * 10;
        return sb - sa;
      });
    }
  }
}

export function searchRoutes(p: SearchParams): { total: number; routes: RouteCardData[] } {
  const filtered = applyFilters(loadRoutes(), p);
  const sorted = sortRoutes(filtered, p.sort);
  return { total: sorted.length, routes: sorted.map(cardOf) };
}

export function getRouteBySlug(slug: string): Route | null {
  return loadRoutes().find((r) => r.slug === slug) ?? null;
}

export function getRouteById(id: string): Route | null {
  return loadRoutes().find((r) => r.id === id) ?? null;
}

/** 相似路线：同目的地 > 同区域 > 相近难度 */
export function similarRoutes(route: Route, limit = 4): RouteCardData[] {
  const scored = loadRoutes()
    .filter((r) => r.id !== route.id && (r.review_status ?? "PUBLISHED") === "PUBLISHED")
    .map((r) => {
      let s = 0;
      if (r.destination && r.destination === route.destination) s += 5;
      if (r.district === route.district) s += 3;
      else if (r.districts.some((d) => route.districts.includes(d))) s += 1.5;
      s += Math.max(0, 2 - Math.abs(r.difficulty - route.difficulty));
      s += r.rating;
      return { r, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map((x) => cardOf(x.r));
}

/** 运行时统计更新（views/favorites 等写入 stats.json） */
export function updateStats(routeId: string, patch: Partial<Route["stats"]>): void {
  const stats = readJson<Record<string, Partial<Route["stats"]>>>("stats.json", {});
  const cur = loadRoutes().find((r) => r.id === routeId)?.stats ?? {
    views: 0,
    favorites: 0,
    vote_selected: 0,
    completed: 0,
  };
  stats[routeId] = { ...cur, ...patch };
  writeJson("stats.json", stats);
  reloadRoutes();
}

/** Admin 修改路线状态 (PRD §58) */
export function updateRouteStatus(routeId: string, status: string, note?: string): boolean {
  const routes = loadRoutes();
  const r = routes.find((x) => x.id === routeId);
  if (!r) return false;
  r.status = status as Route["status"];
  r.status_note = note;
  r.updated_at = new Date().toISOString();
  persistRoutes(routes);
  return true;
}

/** Admin 发布用户上传路线 (PRD §59 审核流) */
export function publishRoute(routeId: string): boolean {
  const routes = loadRoutes();
  const r = routes.find((x) => x.id === routeId);
  if (!r) return false;
  r.review_status = "PUBLISHED";
  r.verified_at = new Date().toISOString();
  r.updated_at = new Date().toISOString();
  persistRoutes(routes);
  return true;
}

/** 追加用户上传路线 */
export function appendRoute(route: Route): void {
  const routes = loadRoutes();
  routes.push(route);
  persistRoutes(routes);
}

function persistRoutes(routes: Route[]): void {
  const p = dataFile("routes.json");
  fs.writeFileSync(p, JSON.stringify(routes));
  reloadRoutes();
}

export function toCard(r: Route): RouteCardData {
  return cardOf(r);
}

/** 全部简化轨迹（首页地图渲染用） */
export function allSimplifiedTracks(): Record<string, [number, number][]> {
  return Object.fromEntries(loadRoutes().map((r) => [r.id, r.track_simplified]));
}
