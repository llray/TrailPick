#!/usr/bin/env python3
"""
等高线 GeoJSON 生成器：从本地 terrarium DEM 瓦片做 marching squares
- 每条路线一个文件（bbox + 1.2km 缓冲），懒加载
- 首要间隔 25m，每 100m 为计曲线（major）
- DP 简化 ~9m，坐标 5 位小数
"""
import json, math, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
TD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiles")
OUT = os.path.join(ROOT, "apps", "web", "public", "contours")
Z = 13
N = 2 ** Z

_tc = {}
def ele_at(lng, lat):
    fx = (lng + 180.0) / 360.0 * N
    fy = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * N
    x, y = int(fx), int(fy)
    if (x, y) in _tc:
        im = _tc[(x, y)]
    else:
        fp = os.path.join(TD, f"{Z}_{x}_{y}.png")
        if not os.path.exists(fp):
            return None
        im = Image.open(fp)
        _tc[(x, y)] = im
    px = im.getpixel((min(255, int((fx - x) * 256)), min(255, int((fy - y) * 256))))
    return px[0] * 256 + px[1] + px[2] / 256 - 32768

def meters_per_deg(lat):
    return 111320.0, 104000.0 * math.cos(math.radians(lat))

def marching_squares(grid, nrow, ncol, level):
    """返回 level 的折线段列表 [(r1,c1,r2,c2)...]，格点坐标"""
    segs = []
    def ip(a, b):
        d = grid[b] - grid[a]
        return 0.5 if d == 0 else max(0.0, min(1.0, (level - grid[a]) / d))
    for r in range(nrow - 1):
        for c in range(ncol - 1):
            tl = grid[r * ncol + c]
            tr = grid[r * ncol + c + 1]
            bl = grid[(r + 1) * ncol + c]
            br = grid[(r + 1) * ncol + c + 1]
            idx = (1 if tl >= level else 0) | (2 if tr >= level else 0) | (4 if br >= level else 0) | (8 if bl >= level else 0)
            if idx in (0, 15):
                continue
            top = (r, c + ip(r * ncol + c, r * ncol + c + 1), r, c + 1)
            bottom = (r + 1, c + ip((r + 1) * ncol + c, (r + 1) * ncol + c + 1), r + 1, c + 1)
            left = (r + ip(r * ncol + c, (r + 1) * ncol + c), c, r + 1, c)
            right = (r + ip(r * ncol + c + 1, (r + 1) * ncol + c + 1), c + 1, r + 1, c + 1)
            table = {
                1: (left, top), 2: (top, right), 3: (left, right), 4: (right, bottom),
                5: (left, top), 6: (top, bottom), 7: (left, bottom), 8: (bottom, left),
                9: (bottom, top), 10: (right, top), 11: (bottom, right), 12: (right, left),
                13: (right, top), 14: (bottom, left),
            }
            if idx in (5, 10):
                # 鞍点：两段（简化取常见组合）
                segs.append((left[0], left[1], top[0], top[1]))
                segs.append((right[0], right[1], bottom[0], bottom[1]))
                continue
            a, b2 = table[idx]
            segs.append((a[0], a[1], b2[0], b2[1]))
    return segs

def chain(segs):
    """把无向段串成折线"""
    if not segs:
        return []
    def key(p):
        return (round(p[0], 4), round(p[1], 4))
    adj = {}
    for a, b2, c, d in segs:
        adj.setdefault(key((a, b2)), []).append(key((c, d)))
        adj.setdefault(key((c, d)), []).append(key((a, b2)))
    used = set()
    lines = []
    allpts = {}
    for a, b2, c, d in segs:
        allpts[key((a, b2))] = (a, b2)
        allpts[key((c, d))] = (c, d)
    for start in list(allpts):
        k0 = key(allpts[start])
        if k0 in used:
            continue
        line = [k0]
        used.add(k0)
        # 向两端延伸
        for direction in (True, False):
            cur = line[0] if direction else line[-1]
            while True:
                nxts = [k for k in adj.get(cur, []) if k not in used]
                if not nxts:
                    break
                k = nxts[0]
                used.add(k)
                if direction:
                    line.append(k)
                else:
                    line.insert(0, k)
                cur = k
        if len(line) >= 3:
            lines.append(line)
    return lines

def dp(points, tol):
    """简化（格点坐标空间）"""
    if len(points) < 3:
        return points
    def pd(p, a, b2):
        ax, ay = a; bx, by = b2; px, py = p
        dxx, dyy = bx - ax, by - ay
        if dxx == dyy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dxx + (py - ay) * dyy) / (dxx * dxx + dyy * dyy)))
        return math.hypot(px - (ax + t * dxx), py - (ay + t * dyy))
    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = pd(points[i], points[0], points[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return dp(points[: idx + 1], tol)[:-1] + dp(points[idx:], tol)
    return [points[0], points[-1]]

def contours_for_bbox(lat0, lat1, lng0, lng1):
    mlat, _ = meters_per_deg((lat0 + lat1) / 2)
    latstep_m, lngstep_m = 20.0, 20.0  # ~1 px @ z13
    latstep = latstep_m / 111320.0
    lngstep = lngstep_m / meters_per_deg((lat0 + lat1) / 2)[1]
    nrow = max(8, int((lat1 - lat0) / latstep))
    ncol = max(8, int((lng1 - lng0) / lngstep))
    if nrow * ncol > 1_200_000:
        scale = math.sqrt(nrow * ncol / 1_200_000)
        latstep *= scale; lngstep *= scale
        nrow = int((lat1 - lat0) / latstep); ncol = int((lng1 - lng0) / lngstep)
    grid = [0.0] * (nrow * ncol)
    ok = 0
    for r in range(nrow):
        la = lat1 - r * latstep  # 顶行 = 北
        for c in range(ncol):
            ln = lng0 + c * lngstep
            e = ele_at(ln, la)
            if e is not None:
                grid[r * ncol + c] = e
                ok += 1
    if ok < nrow * ncol * 0.3:
        return None
    emin = min(grid); emax = max(grid)
    if emax - emin < 30:
        return {"minor": [], "major": [], "interval": 25}
    interval = 25
    minor_feats, major_feats = [], []
    lv = math.floor(emin / interval) * interval + interval
    while lv <= emax:
        segs = marching_squares(grid, nrow, ncol, lv)
        lines = chain(segs)
        for line in lines:
            pts = dp(line, 1.2)
            if len(pts) < 2:
                continue
            coords = []
            for (r, c) in pts:
                la = lat1 - r * latstep
                ln = lng0 + c * lngstep
                coords.append([round(ln, 5), round(la, 5)])
            feat = {"type": "Feature", "properties": {"ele": lv}, "geometry": {"type": "LineString", "coordinates": coords}}
            (major_feats if lv % 100 == 0 else minor_feats).append(feat)
        lv += interval
    return {"minor": minor_feats, "major": major_feats, "interval": interval}

def main():
    os.makedirs(OUT, exist_ok=True)
    routes = json.load(open(os.path.join(ROOT, "apps", "web", "data", "routes.json")))
    total = 0
    for rt in routes:
        slug = rt["slug"]
        out = os.path.join(OUT, slug + ".json")
        if os.path.exists(out):
            continue
        trk = rt["track"]
        if not trk:
            continue
        lats = [p[1] for p in trk]; lngs = [p[0] for p in trk]
        buf = 0.012
        res = contours_for_bbox(min(lats) - buf, max(lats) + buf, min(lngs) - buf, max(lngs) + buf)
        if res is None:
            print(f"- {slug}: 瓦片覆盖不足，跳过")
            continue
        json.dump(res, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
        sz = os.path.getsize(out) / 1024
        total += 1
        print(f"✓ {slug}: minor {len(res['minor'])} major {len(res['major'])} {sz:.0f}KB")
    print(f"生成 {total} 个等高线文件 → apps/web/public/contours/")

if __name__ == "__main__":
    main()
