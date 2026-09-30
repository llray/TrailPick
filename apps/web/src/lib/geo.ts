/**
 * 地理计算库：测距 / 轨迹插值与简化 / 海拔分析 / 难度与时长模型
 * PRD §11 难度模型 · §17 海拔图 · §88 Douglas-Peucker · §86 GIS 测试重点
 */
import type { TrackPoint, ElevationPoint, DifficultyDetail } from "./types";

const R = 6371008.8; // 地球平均半径（米）
const rad = (d: number) => (d * Math.PI) / 180;

/** 两点球面距离（米） */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 轨迹累计长度（公里） */
export function pathLengthKm(points: TrackPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineM(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return sum / 1000;
}

/** 字符串哈希 → 32 位种子（保证同一 slug 每次生成相同轨迹） */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 确定性伪随机数 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom 样条插值 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

interface CtrlPoint {
  lat: number;
  lng: number;
  ele: number;
}

/**
 * 用 Catmull-Rom 样条把控制点连成平滑轨迹，按 stepM 间距采样。
 * 控制点数量少（6-12），插值后得到密集轨迹，再叠加确定性分形噪声模拟真实蜿蜒。
 */
export function densify(controls: CtrlPoint[], stepM = 60): TrackPoint[] {
  if (controls.length < 2) return [];
  const pts: TrackPoint[] = [];
  const n = controls.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(n - 1, i + 2)];
    const segLen = haversineM(p1.lat, p1.lng, p2.lat, p2.lng);
    const steps = Math.max(1, Math.round(segLen / stepM));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push([
        catmullRom(p0.lng, p1.lng, p2.lng, p3.lng, t),
        catmullRom(p0.lat, p1.lat, p2.lat, p3.lat, t),
        catmullRom(p0.ele, p1.ele, p2.ele, p3.ele, t),
      ]);
    }
  }
  const last = controls[n - 1];
  pts.push([last.lng, last.lat, last.ele]);
  return pts;
}

/** 平滑值噪声（多层叠加，输出 [-1,1]），确定性 */
function valueNoise1D(seed: number): (x: number) => number {
  const rand = mulberry32(seed);
  const table = Array.from({ length: 512 }, () => rand() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f); // smoothstep
    const a = table[((i % 512) + 512) % 512];
    const b = table[(((i + 1) % 512) + 512) % 512];
    return a * (1 - u) + b * u;
  };
}

/**
 * 给平滑轨迹叠加确定性分形噪声，模拟真实步道的蜿蜒与海拔起伏。
 * ampM：水平噪声幅度（米）；ampEle：海拔噪声幅度（米）
 */
export function addFractalNoise(
  track: TrackPoint[],
  seed: number,
  ampM = 70,
  ampEle = 6
): TrackPoint[] {
  const n1 = valueNoise1D(seed);
  const n2 = valueNoise1D(seed ^ 0x9e3779b9);
  const n3 = valueNoise1D(seed ^ 0x85ebca6b);
  // 先算累计距离用于噪声相位
  const cum: number[] = [0];
  for (let i = 1; i < track.length; i++) {
    cum.push(cum[i - 1] + haversineM(track[i - 1][1], track[i - 1][0], track[i][1], track[i][0]));
  }
  const total = cum[cum.length - 1] || 1;
  const latScale = 1 / 111320;
  return track.map((p, i) => {
    const phase = (cum[i] / total) * 220; // 全程噪声相位
    const w1 = n1(phase) * 0.6 + n2(phase * 2.7) * 0.3 + n3(phase * 5.9) * 0.1;
    const w2 = n2(phase * 1.3 + 40) * 0.7 + n3(phase * 3.1 + 80) * 0.3;
    // 垂直于前进方向偏移
    const prev = track[Math.max(0, i - 1)];
    const next = track[Math.min(track.length - 1, i + 1)];
    const dLng = next[0] - prev[0];
    const dLat = next[1] - prev[1];
    const len = Math.hypot(dLng, dLat) || 1;
    const off = w1 * ampM;
    const px = -dLat / len; // 垂直向量
    const py = dLng / len;
    const eleNoise = w2 * ampEle;
    return [
      p[0] + (px * off * latScale) / Math.max(0.2, Math.cos(rad(p[1]))),
      p[1] + py * off * latScale,
      Math.max(0, p[2] + eleNoise),
    ];
  });
}

/** 按间距（米）重采样轨迹 */
export function resample(track: TrackPoint[], stepM: number): TrackPoint[] {
  if (track.length === 0) return [];
  const out: TrackPoint[] = [track[0]];
  let acc = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const d = haversineM(a[1], a[0], b[1], b[0]);
    acc += d;
    if (acc >= stepM) {
      out.push(b);
      acc = 0;
    }
  }
  const last = track[track.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

/** Douglas-Peucker 轨迹简化 (PRD §88) */
export function douglasPeucker(points: TrackPoint[], epsilonDeg = 0.00008): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const sqEps = epsilonDeg * epsilonDeg;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxSq = 0;
    let idx = -1;
    const [x1, y1] = points[s];
    const [x2, y2] = points[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segSq = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      let t = segSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / segSq : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - px;
      const ey = y1 + t * dy - py;
      const sq = ex * ex + ey * ey;
      if (sq > maxSq) {
        maxSq = sq;
        idx = i;
      }
    }
    if (idx >= 0 && maxSq > sqEps) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export interface TrackAnalysis {
  distanceKm: number;
  gainM: number;
  lossM: number;
  maxEle: number;
  minEle: number;
  durationMin: number;
  profile: ElevationPoint[];
  steep: { fromKm: number; toKm: number; grade: number }[];
}

/**
 * 轨迹综合分析：距离 / 爬升 / 下降 / 极值海拔 / Naismith 时长 / 海拔剖面 / 陡坡段
 * 时长模型：Naismith 规则（5km/h + 每 600m 爬升 1h）× 地形系数 (PRD §11 路况因素)
 */
export function analyzeTrack(track: TrackPoint[], terrainFactor = 1.15): TrackAnalysis {
  let distM = 0;
  let gain = 0;
  let loss = 0;
  let maxEle = -Infinity;
  let minEle = Infinity;
  const smoothEle: number[] = [];
  const cum: number[] = [0];
  // 海拔滑动平均去噪
  for (let i = 0; i < track.length; i++) {
    const from = Math.max(0, i - 2);
    const to = Math.min(track.length - 1, i + 2);
    let s = 0;
    for (let j = from; j <= to; j++) s += track[j][2];
    smoothEle.push(s / (to - from + 1));
    maxEle = Math.max(maxEle, track[i][2]);
    minEle = Math.min(minEle, track[i][2]);
  }
  for (let i = 1; i < track.length; i++) {
    distM += haversineM(track[i - 1][1], track[i - 1][0], track[i][1], track[i][0]);
    cum.push(distM);
    const de = smoothEle[i] - smoothEle[i - 1];
    if (de > 2) gain += de;
    else if (de < -2) loss += -de;
  }
  const distanceKm = distM / 1000;
  const naismith = (distanceKm / 5) * 60 + (gain / 600) * 60;
  // 陡坡附加系数：平均坡度 >12% 的线路实际耗时显著高于标准 Naismith
  const avgGradePct = distanceKm > 0 ? gain / distanceKm : 0;
  const steepFactor = avgGradePct > 12 ? 1.15 : 1;
  const durationMin = Math.max(15, Math.round((naismith * terrainFactor * steepFactor) / 5) * 5);

  // 海拔剖面：约 140 个采样点
  const samples = Math.min(140, Math.max(30, Math.round(distanceKm * 8)));
  const profile: ElevationPoint[] = [];
  for (let s = 0; s <= samples; s++) {
    const targetD = (distM * s) / samples;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < targetD) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    profile.push({
      d: +(targetD / 1000).toFixed(2),
      e: +smoothEle[i].toFixed(1),
    });
  }

  // 陡坡段分析：连续 200m 窗口平均坡度 > 15%
  const steep: { fromKm: number; toKm: number; grade: number }[] = [];
  const winM = 200;
  let inSteep = false;
  let steepStart = 0;
  let steepMax = 0;
  for (let i = 1; i < cum.length; i++) {
    const dHere = cum[i];
    let j = i;
    while (j > 0 && dHere - cum[j - 1] < winM) j--;
    if (dHere - cum[j] >= winM * 0.6) {
      const grade = ((smoothEle[i] - smoothEle[j]) / (dHere - cum[j])) * 100;
      const isSteep = grade > 15;
      if (isSteep && !inSteep) {
        inSteep = true;
        steepStart = dHere;
        steepMax = grade;
      } else if (isSteep && inSteep) {
        steepMax = Math.max(steepMax, grade);
      } else if (!isSteep && inSteep) {
        inSteep = false;
        if (dHere - steepStart > 150) {
          steep.push({
            fromKm: +(steepStart / 1000).toFixed(1),
            toKm: +(dHere / 1000).toFixed(1),
            grade: Math.round(steepMax),
          });
        }
      }
    }
  }
  if (inSteep) {
    steep.push({
      fromKm: +(steepStart / 1000).toFixed(1),
      toKm: +(distM / 1000).toFixed(1),
      grade: Math.round(steepMax),
    });
  }

  return {
    distanceKm: +distanceKm.toFixed(2),
    gainM: Math.round(gain / 10) * 10,
    lossM: Math.round(loss / 10) * 10,
    maxEle: Math.round(maxEle),
    minEle: Math.round(minEle),
    durationMin,
    profile,
    steep,
  };
}

export function bboxOf(track: TrackPoint[]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of track) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    +minLng.toFixed(5),
    +minLat.toFixed(5),
    +maxLng.toFixed(5),
    +maxLat.toFixed(5),
  ];
}

/**
 * 综合难度模型 (PRD §11):
 * Difficulty = 距离分 + 爬升分 + 坡度分 + 路面分 + 技术分 + 下撤难度
 * 各分项 0-5，加权合成后四舍五入到 1-5 级
 */
export interface DifficultyInput {
  distanceKm: number;
  gainM: number;
  /** 路面 0=铺装/绿道 1=好步道/台阶 2=土路野径 3=陡峭碎石/岩石 */
  surface: number;
  /** 技术性 0-3（暴露/攀爬） */
  technical: number;
  /** 下撤难度 0-3（0=随处可下撤 3=长距离无下撤点） */
  exit: number;
}

function scaleScore(v: number, stops: [number, number][]): number {
  for (const [limit, score] of stops) {
    if (v < limit) return score;
  }
  return 5;
}

export function computeDifficulty(input: DifficultyInput): {
  level: number;
  detail: DifficultyDetail;
} {
  const distance = scaleScore(input.distanceKm, [
    [4, 0.5],
    [7, 1.5],
    [11, 2.5],
    [16, 3.5],
    [20, 4.4],
  ]);
  const climb = scaleScore(input.gainM, [
    [150, 0.5],
    [350, 1.5],
    [600, 2.5],
    [900, 3.5],
    [1300, 4.4],
  ]);
  const gradePerKm = input.distanceKm > 0 ? input.gainM / input.distanceKm : 0;
  const gradient = scaleScore(gradePerKm, [
    [8, 0.5],
    [22, 1.5],
    [40, 2.5],
    [60, 3.5],
    [85, 4.4],
  ]);
  const surface = input.surface * 1.6;
  const technical = input.technical * 1.6;
  const exit = input.exit * 1.2;
  const composite =
    distance * 0.24 +
    climb * 0.28 +
    gradient * 0.16 +
    surface * 0.1 +
    technical * 0.13 +
    exit * 0.09;
  const level = Math.min(5, Math.max(1, Math.round(composite)));
  return {
    level,
    detail: {
      distance,
      climb,
      gradient,
      surface,
      technical,
      exit,
      composite: +composite.toFixed(2),
    },
  };
}
