#!/usr/bin/env python3
"""QA 对比：新旧路线关键指标（原型 routes.json vs OSM 重建轨迹文件）"""
import json, math, os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "osm-tracks")
old = {r["slug"]: r for r in json.load(open("apps/web/data/routes.json"))}

def hv(a, b):
    R = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = math.radians(b[1] - a[1]), math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

print(f"{'slug':28s} {'旧km':>6s} {'新km':>6s} {'旧爬升':>7s} {'新爬升':>7s} {'新max':>6s} {'起点偏移km':>9s}")
rows = []
for fn in sorted(os.listdir(BASE)):
    if not fn.endswith(".json") or fn.startswith(".") or fn == "seeds.json":
        continue
    d = json.load(open(os.path.join(BASE, fn)))
    slug = fn[:-5]
    pts = d["points"]
    km = sum(hv(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) / 1000
    gain = sum(max(0, pts[i][2] - pts[i - 1][2]) for i in range(1, len(pts)))
    mx = max(p[2] for p in pts)
    o = old.get(slug)
    okm = f"{o['distance_km']:.1f}" if o else "-"
    ogain = f"{o['elevation_gain_m']}" if o else "-"
    shift = ""
    if o:
        s = o["start"]
        shift = f"{hv((s['lng'], s['lat']), (pts[0][0], pts[0][1])) / 1000:.2f}"
    rows.append((slug, okm, f"{km:.1f}", ogain, f"{gain:.0f}", f"{mx:.0f}", shift))
for r in rows:
    print(f"{r[0]:28s} {r[1]:>6s} {r[2]:>6s} {r[3]:>7s} {r[4]:>7s} {r[5]:>6s} {r[6]:>9s}")
print(f"共 {len(rows)} 条真实轨迹")
