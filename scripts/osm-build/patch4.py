#!/usr/bin/env python3
"""补丁 4（重试）：peak 硬锚点筛选分量"""
import ast, json, math

# 先诊断 peak 匹配
d = json.load(open("scripts/osm-tracks/.area_a454_2284.json"))
peaks = [(e["lat"], e["lon"], e["tags"].get("name", ""), e["tags"].get("ele"))
         for e in d["elements"] if e["type"] == "node"]
seeds = json.load(open("scripts/osm-tracks/seeds.json"))
wc = [s for s in seeds if s["slug"] == "wutong-classic"][0]
hidx = max(range(len(wc["ctrl"])), key=lambda i: wc["ctrl"][i][2])
print("ctrl summit:", wc["ctrl"][hidx], "destination:", wc["destination"])
for pk in peaks:
    dd = math.hypot((pk[0]-wc["ctrl"][hidx][0])*111, (pk[1]-wc["ctrl"][hidx][1])*95)
    if dd < 8:
        print(f"  peak {pk[2]!r} ele={pk[3]} dist={dd:.2f}km")

p = "scripts/osm-build/batch_build.py"
s = open(p).read()
if "硬锚点" in s:
    print("already patched")
else:
    old = (
        "            # 目的地 peak 匹配：替换海拔最高的路径点\n"
        "            wps = [list(p) for p in ctrl]\n"
        "            if s[\"destination\"] and peaks:\n"
    )
    new = (
        "            # 目的地 peak 匹配：替换海拔最高的路径点（硬锚点）\n"
        "            wps = [list(p) for p in ctrl]\n"
        "            anchor = None\n"
        "            if s[\"destination\"] and peaks:\n"
    )
    assert old in s, "anchor1"
    s = s.replace(old, new, 1)
    old2 = "                    wps[hidx] = [pk[0], pk[1], pk[3] or wps[hidx][2]]\n"
    new2 = ("                    wps[hidx] = [pk[0], pk[1], pk[3] or wps[hidx][2]]\n"
            "                    anchor = wps[hidx]\n")
    assert old2 in s, "anchor2"
    s = s.replace(old2, new2, 1)
    old3 = "            bestComp, bestScore = None, None\n            for comp in comps:\n                cset = set(comp)\n"
    new3 = ("            bestComp, bestScore = None, None\n"
            "            for comp in comps:\n"
            "                cset = set(comp)\n"
            "                if anchor:\n"
            "                    ad = min((g.nodes[n][0]-anchor[0])**2 + (g.nodes[n][1]-anchor[1])**2 for n in cset)\n"
            "                    if math.sqrt(ad) * 111320 > 800:\n"
            "                        continue\n")
    assert old3 in s, "anchor3"
    s = s.replace(old3, new3, 1)
    open(p, "w").write(s)
    ast.parse(s)
    print("patch4 applied + syntax OK")
