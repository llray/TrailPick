/**
 * 路线数据生成器（Phase 0 数据原型，PRD §92）
 * 控制点 → Catmull-Rom 插值 → 分形噪声 → 重采样 → 自动计算
 * 距离/爬升/时长/海拔剖面/简化轨迹/难度 → data/routes.json
 */
import fs from "node:fs";
import path from "node:path";
import {
  densify,
  addFractalNoise,
  resample,
  analyzeTrack,
  bboxOf,
  hashSeed,
  mulberry32,
  computeDifficulty,
} from "../apps/web/src/lib/geo";
import { SEED_LUOHU } from "./seed-luohu";
import { SEED_YANTIAN } from "./seed-yantian";
import { SEED_DAPENG } from "./seed-dapeng";
import { SEED_EAST } from "./seed-east";
import { SEED_BAOAN } from "./seed-baoan";
import { SEED_CITY } from "./seed-city";
import type { SeedRoute } from "./seed-types";
import type { Route, POI } from "../apps/web/src/lib/types";

const ALL_SEEDS = [...SEED_LUOHU, ...SEED_YANTIAN, ...SEED_DAPENG, ...SEED_EAST, ...SEED_BAOAN, ...SEED_CITY];

const CITY = "shenzhen";
const NOW = new Date().toISOString();
const DISTRICTS_BY_ZONE: Record<string, string[]> = {
  东部: ["盐田", "龙岗", "坪山", "大鹏"],
  西部: ["宝安", "龙华", "南山", "光明"],
  市中心: ["福田", "罗湖", "南山"],
  大鹏半岛: ["大鹏"],
};

function buildRoute(seed: SeedRoute, index: number): Route {
  const seedHash = hashSeed(seed.slug);
  // 0. 控制点加密：每段插入 2 个垂直摆动中点，模拟真实步道蜿蜒（+25~40% 长度）
  const rand = mulberry32(seedHash);
  const augmented: [number, number, number][] = [];
  for (let i = 0; i < seed.ctrl.length - 1; i++) {
    const a = seed.ctrl[i];
    const b = seed.ctrl[i + 1];
    augmented.push(a);
    const dLat = b[0] - a[0];
    const dLng = b[1] - a[1];
    const segLenDeg = Math.hypot(dLat, dLng);
    if (segLenDeg > 1e-4) {
      for (const t of [0.34, 0.68]) {
        const side = rand() > 0.5 ? 1 : -1;
        const off = side * segLenDeg * (0.1 + rand() * 0.1);
        // 垂直方向偏移
        const lat = a[0] + dLat * t + (-dLng / segLenDeg) * off;
        const lng = a[1] + dLng * t + (dLat / segLenDeg) * off;
        const ele = a[2] + (b[2] - a[2]) * t + (rand() - 0.5) * 14;
        augmented.push([lat, lng, Math.max(0, ele)]);
      }
    }
  }
  augmented.push(seed.ctrl[seed.ctrl.length - 1]);
  // 1. 插值 + 噪声 + 采样
  let track = densify(
    augmented.map(([lat, lng, ele]) => ({ lat, lng, ele })),
    45
  );
  track = addFractalNoise(track, seedHash ^ 0x51ed270b, seed.type === "OUT_AND_BACK" ? 60 : 80, 7);
  track = resample(track, 80);
  // 2. 分析
  const analysis = analyzeTrack(track, seed.terrain);
  // 3. 难度
  const diff = computeDifficulty({
    distanceKm: analysis.distanceKm,
    gainM: analysis.gainM,
    surface: seed.surface,
    technical: seed.technical,
    exit: seed.exit,
  });
  const level = seed.difficultyOverride ?? diff.level;
  // 4. 轨迹出入（回环/往返的噪声可能让首尾不重合，拉齐）
  const first = track[0];
  track[track.length - 1] = [
    track[track.length - 1][0] * 0.4 + first[0] * 0.6,
    track[track.length - 1][1] * 0.4 + first[1] * 0.6,
    track[track.length - 1][2] * 0.4 + first[2] * 0.6,
  ];
  // 5. POI
  const pois: POI[] = [];
  pois.push({
    name: seed.startName ?? "起点",
    kind: "start",
    lat: first[1],
    lng: first[0],
  });
  const last = track[track.length - 1];
  if (seed.type === "TRAVERSE") {
    pois.push({ name: seed.endName ?? "终点", kind: "end", lat: last[1], lng: last[0] });
  }
  // 最高点 = 山峰
  let maxIdx = 0;
  for (let i = 1; i < track.length; i++) if (track[i][2] > track[maxIdx][2]) maxIdx = i;
  pois.push({
    name: seed.destination ? `${seed.destination}最高点` : "沿线最高点",
    kind: "summit",
    lat: track[maxIdx][1],
    lng: track[maxIdx][0],
    note: `${Math.round(track[maxIdx][2])}m`,
  });
  // 交通 POI
  if (seed.transport.nearestMetro) {
    pois.push({
      name: `${seed.transport.nearestMetro.name}站（${seed.transport.nearestMetro.line}）`,
      kind: "metro",
      lat: first[1] + 0.004,
      lng: first[0] - 0.004,
      note: `距起点 ${seed.transport.nearestMetro.distanceKm}km`,
    });
  }
  for (const p of seed.extraPois ?? []) pois.push(p);
  // 下撤点：陡坡段中点
  analysis.steep.slice(0, 2).forEach((s, i) => {
    pois.push({
      name: `下撤点 ${i + 1}`,
      kind: "exit",
      lat: seed.ctrl[Math.min(seed.ctrl.length - 1, 2 + i)][0],
      lng: seed.ctrl[Math.min(seed.ctrl.length - 1, 2 + i)][1],
      note: `K${s.fromKm} 附近坡度 ${s.grade}%`,
    });
  });

  const simplified = resample(track, 120).map(
    ([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)] as [number, number]
  );
  const fullTrack = track.map(
    ([lng, lat, ele]) =>
      [+lng.toFixed(5), +lat.toFixed(5), +ele.toFixed(1)] as [number, number, number]
  );

  const emergency = "110 报警 / 120 急救 / 0755-82779993 深圳公益救援";
  const route: Route = {
    id: `rt_${String(index + 1).padStart(3, "0")}`,
    slug: seed.slug,
    name_cn: seed.name_cn,
    name_en: seed.name_en,
    destination: seed.destination,
    city: CITY,
    district: seed.district,
    districts: seed.districts ?? [seed.district],
    description: seed.desc,
    distance_km: analysis.distanceKm,
    estimated_duration_min: analysis.durationMin,
    elevation_gain_m: analysis.gainM,
    elevation_loss_m: analysis.lossM,
    max_elevation_m: analysis.maxEle,
    min_elevation_m: analysis.minEle,
    difficulty: level,
    difficulty_detail: diff.detail,
    route_type: seed.type,
    start: { lat: +first[1].toFixed(5), lng: +first[0].toFixed(5) },
    end: { lat: +last[1].toFixed(5), lng: +last[0].toFixed(5) },
    track: fullTrack,
    track_simplified: simplified,
    elevation_profile: analysis.profile,
    bbox: bboxOf(track),
    tags: seed.tags,
    surface_types: seed.surfaceTypes,
    status: seed.status ?? "OPEN",
    status_note: seed.statusNote,
    source_type: seed.source,
    source_name: seed.sourceName,
    source_license: seed.source === "OFFICIAL" ? "公开资料整理" : "平台人工整理（原型示意轨迹）",
    verified_at: NOW,
    review_status: "PUBLISHED",
    visibility: "PUBLIC",
    transport: seed.transport,
    pois,
    safety: {
      emergency,
      waterAvailable: seed.safety.water,
      mobileSignal: seed.safety.signal,
      weatherRisk: seed.safety.weatherRisk,
      nightHiking: seed.safety.night,
      wildlife: seed.safety.wildlife,
      steepSections: analysis.steep.map((s) => ({
        fromKm: s.fromKm,
        toKm: s.toKm,
        note: `最大坡度约 ${s.grade}%`,
      })),
    },
    rating: seed.rating,
    stats: {
      views: seed.pop[0],
      favorites: seed.pop[1],
      vote_selected: seed.pop[2],
      completed: seed.pop[3],
    },
    version: 1,
    created_at: NOW,
    updated_at: NOW,
  };
  return route;
}

// 生成
const routes = ALL_SEEDS.map((s, i) => buildRoute(s, i));

// 校验
const slugs = new Set<string>();
const errors: string[] = [];
for (const r of routes) {
  if (slugs.has(r.slug)) errors.push(`重复 slug: ${r.slug}`);
  slugs.add(r.slug);
  if (r.distance_km < 0.5) errors.push(`${r.slug} 距离异常: ${r.distance_km}`);
  if (r.track.length < 10) errors.push(`${r.slug} 轨迹点过少`);
}
const districtCount: Record<string, number> = {};
for (const r of routes) districtCount[r.district] = (districtCount[r.district] ?? 0) + 1;

const outDir = path.join(process.cwd(), "apps", "web", "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "routes.json"), JSON.stringify(routes));

console.log(`✓ 生成 ${routes.length} 条路线 → apps/web/data/routes.json`);
console.log("  区属分布:", JSON.stringify(districtCount));
console.log(
  "  难度分布:",
  JSON.stringify(
    routes.reduce<Record<number, number>>((acc, r) => {
      acc[r.difficulty] = (acc[r.difficulty] ?? 0) + 1;
      return acc;
    }, {})
  )
);
const sizeMB = (fs.statSync(path.join(outDir, "routes.json")).size / 1024 / 1024).toFixed(2);
console.log(`  文件大小: ${sizeMB} MB`);
if (errors.length) {
  console.error("✗ 数据校验失败:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
