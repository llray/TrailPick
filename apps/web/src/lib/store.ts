/**
 * MVP 持久化层：JSON 文件存储（投票 / 统计 / 告警）
 * 数据层接口与 PRD §35 PostgreSQL+PostGIS 保持同构，后续可平迁到 Supabase。
 * PRD §36 数据表 → MVP 阶段对应：
 *   routes        → data/routes.json（种子生成，只读 + 运行时统计叠加）
 *   vote_rooms    → data/votes.json
 *   route_status  → routes.status 字段（admin 可改）
 */
import fs from "node:fs";
import path from "node:path";

/** 数据目录：兼容 Next 运行时(cwd=apps/web) 与仓库根目录脚本(cwd=repo) */
function resolveDataDir(): string {
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "apps/web/data"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const d = candidates[0];
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const DATA_DIR = resolveDataDir();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** 数据文件绝对路径（供 routes.ts 等直接读取大文件用） */
export function dataFile(name: string): string {
  ensureDir();
  return path.join(DATA_DIR, name);
}

export function readJson<T>(file: string, fallback: T): T {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** 原子写入（tmp + rename），防止并发写坏文件 */
export function writeJson(file: string, data: unknown): void {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  const tmp = p + ".tmp-" + process.pid + "-" + Math.random().toString(36).slice(2);
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

/** 全局缓存（dev 模式 HMR 不丢状态） */
const g = globalThis as unknown as { __trailpick_store?: Map<string, unknown> };
if (!g.__trailpick_store) g.__trailpick_store = new Map();

export function cached<T>(key: string, loader: () => T): T {
  const cache = g.__trailpick_store!;
  if (!cache.has(key)) cache.set(key, loader());
  return cache.get(key) as T;
}

export function invalidate(key: string): void {
  g.__trailpick_store!.delete(key);
}
