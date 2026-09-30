#!/usr/bin/env python3
"""修正错位种子：宽域 DEM 搜索真实山峰，平移整条 ctrl 链"""
import math, json

src = open("scripts/osm-build/batch_build.py").read()
head = src[: src.index("# ---- 区域分组 ----")]
ns = {"__name__": "bb", "__file__": "scripts/osm-build/batch_build.py"}
exec(compile(head, "bb_head", "exec"), ns)
ele_at = ns["ele_at"]

def grid_max(lat0, lng0, radius_m, step_m):
    n2 = int(radius_m / step_m)
    best = (0, 0.0, 0.0)
    for i in range(-n2, n2 + 1):
        for j in range(-n2, n2 + 1):
            la = lat0 + i * step_m / 111320
            ln = lng0 + j * step_m / 104000
            e = ele_at(ln, la)
            if e is not None and e > best[0]:
                best = (e, round(la, 5), round(ln, 5))
    return best

seeds = json.load(open("scripts/osm-tracks/seeds.json"))
fixed = 0
for s in seeds:
    if s["slug"] == "yangtai-loop":
        continue
    ctrl = s.get("ctrl") or []
    if not ctrl:
        continue
    h = max(ctrl, key=lambda p: p[2])
    local = grid_max(h[0], h[1], 3000, 150)
    if local[0] >= h[2] - 150:
        continue
    found = None
    for tol in (120, 250, 400):
        n2 = int(15000 / 250)
        bestc = None
        for i in range(-n2, n2 + 1):
            for j in range(-n2, n2 + 1):
                la = h[0] + i * 250 / 111320
                ln = h[1] + j * 250 / 104000
                e = ele_at(ln, la)
                if e and e >= 250:
                    d = abs(e - h[2])
                    if bestc is None or d < bestc[0]:
                        bestc = (d, e, round(la, 5), round(ln, 5))
        if bestc and bestc[0] <= tol:
            found = bestc
            break
    if not found:
        print(f"? {s['slug']}: 宽域未找到匹配山峰（ctrl {h[2]:.0f}m）——保留原位")
        continue
    dLat = found[2] - h[0]
    dLng = found[3] - h[1]
    s["ctrl"] = [[round(p[0] + dLat, 5), round(p[1] + dLng, 5), p[2]] for p in ctrl]
    fixed += 1
    print(f"FIX {s['slug']}: 移动({dLat:+.3f},{dLng:+.3f}) DEM匹配 {found[1]:.0f}m@({found[2]},{found[3]}) 目标{h[2]:.0f}m")

json.dump(seeds, open("scripts/osm-tracks/seeds.json", "w"), ensure_ascii=False, indent=1)
print(f"共修正 {fixed} 条")
