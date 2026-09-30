#!/usr/bin/env python3
"""补丁 6：elev 缓存按坐标哈希键 + 锚点调试输出"""
import ast

p = "scripts/osm-build/batch_build.py"
s = open(p).read()

old = (
    "def elev(points, slug):\n"
    "    out = []\n"
    '    CACHE = os.path.join(BASE, f".elev_{slug}.json")\n'
    "    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}\n"
    "    batches = [points[i:i+100] for i in range(0, len(points), 100)]\n"
    "    for bi, batch in enumerate(batches):\n"
    '        key = f"b{bi}"\n'
)
new = (
    "def elev(points, slug):\n"
    "    import hashlib\n"
    "    out = []\n"
    '    CACHE = os.path.join(BASE, f".elev_{slug}.json")\n'
    "    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}\n"
    "    batches = [points[i:i+100] for i in range(0, len(points), 100)]\n"
    "    for bi, batch in enumerate(batches):\n"
    '        key = "b" + hashlib.md5(("\n".join(f"{p[0]:.5f},{p[1]:.5f}" for p in batch)).encode()).hexdigest()[:12]\n'
)
assert old in s, "elev key anchor"
s = s.replace(old, new, 1)

old2 = "            if anchor is None and s[\"destination\"] and wps[hidx][2] >= 250:\n"
new2 = "            if not anchor and s[\"destination\"] and wps[hidx][2] >= 250:\n"
assert old2 in s, "anchor cond"
s = s.replace(old2, new2, 1)

old3 = "            g.restrict(set(bestComp))\n            comps = [bestComp]\n"
new3 = ("            if anchor:\n"
        '                print(f"    anchor {anchor[0]:.4f},{anchor[1]:.4f} ele {anchor[2]:.0f}", flush=True)\n'
        "            g.restrict(set(bestComp))\n            comps = [bestComp]\n")
assert old3 in s, "anchor print"
s = s.replace(old3, new3, 1)

open(p, "w").write(s)
ast.parse(s)
print("patch6 + syntax OK")
