#!/usr/bin/env python3
"""最终种子校正：基于维基/Nominatim/DEM 的已验证锚点"""
import json

# 重新导出（恢复原始 ctrl）
import subprocess
subprocess.run(["pnpm", "exec", "tsx", "scripts/export-seeds.ts"], check=True)

seeds = json.load(open("scripts/osm-tracks/seeds.json"))

# 已验证的真山顶（DEM/维基/地标）
TRUTH = {
    # 梧桐山主峰（维基 22.5823,114.2146；DEM 922m@22.58176,114.21518）
    "wutong-classic": (22.58176, 114.21518),
    "wutong-taishanjian": (22.58176, 114.21518),
    "wutong-ancient": (22.58176, 114.21518),
    "wutong-xianhu": (22.58176, 114.21518),
    "wutong-haohanpo": (22.58176, 114.21518),
    "wutong-yantianao": (22.58176, 114.21518),
    # 小梧桐（Nominatim peak + DEM 682m）
    "wutong-small-loop": (22.5698, 114.1943),
    # 排牙山（DEM 707m）
    "paiyashan-ridge": (22.5331, 114.5449),
    # 阳台山（DEM 573m@22.6546,113.9557）
    "yangtai-summit": (22.6546, 113.9557),
    "fenghuangjing-yangtai": (22.6546, 113.9557),
}

for s in seeds:
    slug = s["slug"]
    if slug == "yangtai-loop":
        continue
    if slug in TRUTH:
        ctrl = s["ctrl"]
        h = max(ctrl, key=lambda p: p[2])
        dLat = TRUTH[slug][0] - h[0]
        dLng = TRUTH[slug][1] - h[1]
        s["ctrl"] = [[round(p[0] + dLat, 5), round(p[1] + dLng, 5), p[2]] for p in ctrl]
        print(f"SHIFT {slug}: ({dLat:+.4f},{dLng:+.4f})")

# 三水线：政府页面证实 三杆笔→火烧天/笔架山→田心山→金龟村→水祖坑
sanshui = [s for s in seeds if s["slug"] == "sanshui-line"][0]
sanshui["ctrl"] = [
    [22.6716, 114.4999, 539],
    [22.6707, 114.4773, 717],
    [22.6799, 114.4237, 692],
    [22.6590, 114.3986, 300],
    [22.6971, 114.4290, 60],
]
print("REWRITE sanshui-line ctrl（地标版）")

json.dump(seeds, open("scripts/osm-tracks/seeds.json", "w"), ensure_ascii=False, indent=1)
print("seeds.json 已更新")
