/** 把种子导出为 JSON，供 Python 批处理脚本（OSM 轨迹重建）使用 */
import fs from "node:fs";
import path from "node:path";
import { SEED_LUOHU } from "./seed-luohu";
import { SEED_YANTIAN } from "./seed-yantian";
import { SEED_DAPENG } from "./seed-dapeng";
import { SEED_EAST } from "./seed-east";
import { SEED_BAOAN } from "./seed-baoan";
import { SEED_CITY } from "./seed-city";

const all = [...SEED_LUOHU, ...SEED_YANTIAN, ...SEED_DAPENG, ...SEED_EAST, ...SEED_BAOAN, ...SEED_CITY];
const out = all.map((s) => ({
  slug: s.slug,
  name: s.name_cn,
  destination: s.destination ?? "",
  district: s.district,
  type: s.type,
  terrain: s.terrain,
  extraPois: (s.extraPois ?? []).map((p) => ({ name: p.name, kind: p.kind, lat: p.lat, lng: p.lng })),
  ctrl: s.ctrl ?? [],
}));
const dir = path.join(process.cwd(), "scripts", "osm-tracks");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "seeds.json"), JSON.stringify(out, null, 1));
console.log("exported", out.length, "seeds");
