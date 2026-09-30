/**
 * 随机路线算法 (PRD §25-27)
 * 候选 → 硬筛选 → 安全过滤(排除关闭) → 排除最近走过 → 加权 → 加权随机
 * 权重：match 45% + rating 20% + popularity 15% + freshness 20%
 * （第一版无用户画像，user preference 权重并入 match/freshness）
 */
import { applyFilters, loadRoutes, popularityScore, toCard, type SearchParams } from "./routes";
import type { Route, RouteCardData, RandomResult } from "./types";

export interface RandomOptions extends SearchParams {
  /** 排除的路线 id（最近走过/已完成） */
  excludeIds?: string[];
  /** 是否排除关闭路线（默认 true，安全过滤） */
  excludeClosed?: boolean;
}

/** 归一化：值在区间中心的得 1，向两端衰减 */
function centrality(v: number, min?: number, max?: number): number {
  if (min == null && max == null) return 1;
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  if (v >= lo && v <= hi) {
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    if (!isFinite(half) || half <= 0) return 1;
    return 0.72 + 0.28 * (1 - Math.abs(v - mid) / half);
  }
  // 超出区间的候选已被硬过滤剔除，不会到达这里
  return 0.3;
}

function scoreRoutes(candidates: Route[], opts: RandomOptions) {
  const maxPop = Math.max(...candidates.map((c) => popularityScore(c)), 1);
  const maxViews = Math.max(...candidates.map((c) => c.stats.views), 1);
  return candidates.map((r) => {
    const match =
      centrality(r.distance_km, opts.distanceMin, opts.distanceMax) * 0.4 +
      centrality(r.estimated_duration_min / 60, opts.durationMin != null ? opts.durationMin / 60 : undefined, opts.durationMax != null ? opts.durationMax / 60 : undefined) * 0.25 +
      centrality(r.difficulty, opts.difficultyMin, opts.difficultyMax) * 0.25 +
      centrality(r.elevation_gain_m, undefined, opts.elevationMax) * 0.1;
    const rating = r.rating / 5;
    const popularity = Math.log1p(popularityScore(r)) / Math.log1p(maxPop);
    const freshness = 1 - Math.log1p(r.stats.views) / Math.log1p(maxViews);
    const total = match * 0.45 + rating * 0.2 + popularity * 0.15 + freshness * 0.2;
    return { r, match, rating, popularity, freshness, total };
  });
}

/** 加权随机抽样（ roulette wheel ） */
function weightedPick<T extends { total: number }>(items: T[]): T {
  const totalW = items.reduce((s, i) => s + i.total, 0);
  let roll = Math.random() * totalW;
  for (const item of items) {
    roll -= item.total;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function pickRandomRoute(opts: RandomOptions): RandomResult | null {
  let candidates = applyFilters(loadAll(), opts);
  // 安全过滤：排除关闭路线 (PRD §93 Random 不返回 Closed Route)
  if (opts.excludeClosed !== false) {
    candidates = candidates.filter((r) => r.status !== "CLOSED");
  }
  // 排除最近走过
  if (opts.excludeIds?.length) {
    const excl = new Set(opts.excludeIds);
    candidates = candidates.filter((r) => !excl.has(r.id));
  }
  if (candidates.length === 0) return null;

  const scored = scoreRoutes(candidates, opts);
  const picked = weightedPick(scored);
  const top = scored
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((s) => ({ slug: s.r.slug, name: s.r.name_cn, score: +s.total.toFixed(3) }));

  return {
    picked: toCard(picked.r),
    scores: {
      match: +picked.match.toFixed(3),
      rating: +picked.rating.toFixed(3),
      popularity: +picked.popularity.toFixed(3),
      freshness: +picked.freshness.toFixed(3),
      total: +picked.total.toFixed(3),
    },
    candidateCount: candidates.length,
    topCandidates: top,
  };
}

/** 骰子动画候选：得分最高的前 N 条 */
export function rollCandidates(opts: RandomOptions, n = 8): RouteCardData[] {
  let candidates = applyFilters(loadAll(), opts).filter((r) => r.status !== "CLOSED");
  if (opts.excludeIds?.length) {
    const excl = new Set(opts.excludeIds);
    candidates = candidates.filter((r) => !excl.has(r.id));
  }
  return scoreRoutes(candidates, opts)
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
    .map((s) => toCard(s.r));
}

function loadAll(): Route[] {
  return loadRoutes();
}
