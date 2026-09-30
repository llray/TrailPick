#!/usr/bin/env python3
"""
TrailPick 批量轨迹重建：OSM 路网 Dijkstra + Open-Meteo 高程
- 按区域分组查询 Overpass（缓存）
- 控制点作为路径点串联；目的地名称匹配的 peak 节点替换最高点路径点
- LOOP 强制环回（重边惩罚），OUT_AND_BACK 折返，TRAVERSE 顺次串联
- 高程：Open-Meteo（缓存/限流），None 值邻域插值
- 质检失败 → 不写文件（保留原型轨迹），报告中标注
"""
import urllib.request, urllib.parse, json, math, heapq, time, os, sys, re

BASE = os.path.join(os.path.dirname(__file__), "..", "osm-tracks")
SEEDS = json.load(open(os.path.join(BASE, "seeds.json")))
WANT = sys.argv[1].split(",") if len(sys.argv) > 1 else None

def hv(a, b):
    R = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = math.radians(b[1]-a[1]), math.radians(b[0]-a[0])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def overpass(q, cache):
    if os.path.exists(cache):
        return json.load(open(cache))
    for host in ["overpass-api.de", "overpass.kumi.systems", "overpass.private.coffee"]:
        try:
            url = f"https://{host}/api/interpreter?" + urllib.parse.urlencode({"data": q})
            req = urllib.request.Request(url, headers={"User-Agent": "TrailPick-seed/0.1"})
            d = json.load(urllib.request.urlopen(req, timeout=150))
            json.dump(d, open(cache, "w"))
            time.sleep(3)
            return d
        except Exception as e:
            print(f"    [{host}] {str(e)[:70]}", flush=True)
            time.sleep(5)
    raise RuntimeError("overpass failed")

_TILE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiles")
_tile_cache = {}

def _tile(z, x, y):
    key = (z, x, y)
    if key in _tile_cache:
        return _tile_cache[key]
    fp = os.path.join(_TILE_DIR, f"{z}_{x}_{y}.png")
    if not os.path.exists(fp):
        os.makedirs(_TILE_DIR, exist_ok=True)
        import urllib.request as _u
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        last = None
        for _ in range(3):
            try:
                req = _u.Request(url, headers={"User-Agent": "TrailPick-seed/0.1"})
                data = _u.urlopen(req, timeout=40).read()
                open(fp, "wb").write(data)
                last = None
                break
            except Exception as e:
                last = e
                time.sleep(2)
        if last:
            raise RuntimeError(f"tile {z}/{x}/{y}: {last}")
    from PIL import Image
    im = Image.open(fp)
    _tile_cache[key] = im
    return im

def ele_at(lng, lat, z=13):
    n = 2 ** z
    fx = (lng + 180.0) / 360.0 * n
    fy = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    x, y = int(fx), int(fy)
    img = _tile(z, x, y)
    px = img.getpixel((min(255, int((fx - x) * 256)), min(255, int((fy - y) * 256))))
    return px[0] * 256 + px[1] + px[2] / 256 - 32768

def elev(points, slug):
    """本地 terrarium 瓦片高程（z13 ≈ 20m 分辨率）"""
    return [ele_at(p[0], p[1]) for p in points]

class Graph:
    def __init__(self, ways):
        self.nodes, self.adj = {}, {}
        for w in ways:
            geom = w.get("geometry", [])
            hw = w.get("tags", {}).get("highway")
            pen = 2.5 if hw in ("service", "residential", "unclassified", "tertiary") else 1.0
            prev = None
            for pt in geom:
                nid = f"{pt['lat']:.6f}_{pt['lon']:.6f}"
                if nid not in self.nodes:
                    self.nodes[nid] = (pt["lat"], pt["lon"])
                    self.adj[nid] = []
                if prev:
                    d = hv(self.nodes[prev], self.nodes[nid]) * pen
                    self.adj[prev].append((nid, d))
                    self.adj[nid].append((prev, d))
                prev = nid
    def components(self, min_size=40):
        seen = set(); comps = []
        for start in self.nodes:
            if start in seen: continue
            comp = []; stack = [start]; seen.add(start)
            while stack:
                u = stack.pop(); comp.append(u)
                for v, _ in self.adj.get(u, []):
                    if v not in seen:
                        seen.add(v); stack.append(v)
            if len(comp) >= min_size: comps.append(comp)
        return comps
    def restrict(self, keep):
        self.nodes = {k: v for k, v in self.nodes.items() if k in keep}
        self.adj = {k: [(v, w) for v, w in self.adj.get(k, []) if v in keep]
                    for k in keep}
    def near(self, latlng):
        best, bd = None, 1e18
        for nid, p in self.nodes.items():
            d = (p[0]-latlng[0])**2 + (p[1]-latlng[1])**2
            if d < bd: bd, best = d, nid
        return best, math.sqrt(bd) * 111320
    def route(self, src, dst, pen=None):
        pen = pen or {}
        dist = {src: 0}; prev = {}; pq = [(0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, 1e18): continue
            if u == dst: break
            for v, w in self.adj.get(u, []):
                nd = d + w * pen.get((u, v), 1.0) * pen.get((v, u), 1.0)
                if nd < dist.get(v, 1e18):
                    dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
        if dst not in dist: return None
        path = [dst]
        while path[-1] != src: path.append(prev[path[-1]])
        return path[::-1]

def dp_simplify(pts, eps_deg):
    if len(pts) < 3: return pts[:]
    def pd(p, a, b):
        ax, ay = a; bx, by = b; px, py = p
        dxx, dyy = bx-ax, by-ay
        if dxx == dyy == 0: return math.hypot(px-ax, py-ay)
        t = max(0, min(1, ((px-ax)*dxx + (py-ay)*dyy)/(dxx*dxx+dyy*dyy)))
        return math.hypot(px-(ax+t*dxx), py-(ay+t*dyy))
    dmax, idx = 0, 0
    for i in range(1, len(pts)-1):
        d = pd(pts[i], pts[0], pts[-1])
        if d > dmax: dmax, idx = d, i
    if dmax > eps_deg:
        return dp_simplify(pts[:idx+1], eps_deg)[:-1] + dp_simplify(pts[idx:], eps_deg)
    return [pts[0], pts[-1]]

def dem_max(lnglat, slug, ele0=None):
    """先在 1.2km 内找局部顶；不达标签再 3km 粗细格搜索"""
    lat0, lng0 = lnglat[1], lnglat[0]
    if ele0:
        best = (0, 0.0, 0.0)
        for i in range(-10, 11):
            for j in range(-10, 11):
                la = lat0 + i * 120.0 / 111320
                ln = lng0 + j * 120.0 / 104000
                e = ele_at(ln, la)
                if e is not None and e > best[0]:
                    best = (e, la, ln)
        if best[0] >= ele0 - 150 and best[0] <= ele0 + 250:
            return (round(best[1], 5), round(best[2], 5), best[0])
    step, n = 300.0, 10
    latstep, lngstep = step / 111320, step / 104000
    pts = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            pts.append([lng0 + j * lngstep, lat0 + i * latstep])
    try:
        eles = elev(pts, "dem" + slug)
    except RuntimeError:
        return None
    best = max(zip(pts, eles), key=lambda t: t[1])
    flat, flng = 60.0 / 111320, 60.0 / 104000
    fpts = []
    for i in range(-3, 4):
        for j in range(-3, 4):
            fpts.append([best[0][0] + j * flng, best[0][1] + i * flat])
    try:
        feles = elev(fpts, "demf" + slug)
    except RuntimeError:
        feles = None
    if feles:
        fb = max(zip(fpts, feles), key=lambda t: t[1])
        if fb[1] > best[1]:
            best = fb
    if ele0 and best[1] > ele0 + 250:
        return None
    return (best[0][1], best[0][0], best[1])

# ---- 区域分组 ----
def area_of(seed):
    c = seed["ctrl"]
    lat = sum(p[0] for p in c)/len(c); lng = sum(p[1] for p in c)/len(c)
    return f"a{round(lat*20)}_{round(lng*20)}"

PROTO = {}
_proto_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'proto.json')
if os.path.exists(_proto_path):
    PROTO = json.load(open(_proto_path))
areas = {}
for s in SEEDS:
    if WANT and s["slug"] not in WANT: continue
    if not s.get("ctrl"): continue  # 已有真实轨迹（如 yangtai-loop）
    areas.setdefault(area_of(s), []).append(s)

report = []
for aname, seeds in sorted(areas.items()):
    lats = [p[0] for s in seeds for p in s["ctrl"]]
    lngs = [p[1] for s in seeds for p in s["ctrl"]]
    pad = 0.02
    bbox = (min(lats)-pad, min(lngs)-pad, max(lats)+pad, max(lngs)+pad)
    print(f"== 区域 {aname}: {len(seeds)} 条 bbox={tuple(round(x,3) for x in bbox)}", flush=True)
    q = f'[out:json][timeout:150];(way["highway"~"^(path|track|steps|footway|service|pedestrian|unclassified|tertiary|residential)$"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});node["natural"="peak"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}););out geom;'
    d = None
    for rnd in range(3):
        try:
            d = overpass(q, os.path.join(BASE, f".area_{aname}.json"))
            break
        except RuntimeError as e:
            print(f"    area retry {rnd+1}: {e}", flush=True)
            time.sleep(30)
    if d is None:
        for s in seeds: report.append((s["slug"], "OVERPASS_FAIL", 0, 0, 0))
        continue
    peaks = [(e["lat"], e["lon"], e["tags"].get("name",""), float(e["tags"]["ele"]) if e["tags"].get("ele") else None)
             for e in d["elements"] if e["type"] == "node"]
    ways = [e for e in d["elements"] if e["type"] == "way"]
    g = Graph(ways)
    comps = g.components(40)
    print(f"    ways={len(ways)} peaks={len(peaks)} comps={len(comps)} sizes={[len(c) for c in sorted(comps, key=len, reverse=True)[:6]]}", flush=True)

    for s in seeds:
        slug = s["slug"]
        try:
            ctrl = s["ctrl"]
            if len(ctrl) < 2: raise RuntimeError("no ctrl")
            # 目的地 peak 匹配：替换海拔最高的路径点（硬锚点）
            # OSM peak 有 ele 且高程匹配 → 用之；否则 DEM 网格搜索真实山顶
            wps = [list(p) for p in ctrl]
            anchor = None
            hidx = max(range(len(wps)), key=lambda i: wps[i][2])
            if s["destination"] and peaks:
                cands = [pk for pk in peaks
                         if pk[3] and math.hypot((pk[0]-wps[hidx][0])*111, (pk[1]-wps[hidx][1])*95) < 6
                         and abs(pk[3] - wps[hidx][2]) < 350]
                if cands:
                    pk = min(cands, key=lambda p: math.hypot((p[0]-wps[hidx][0])*111, (p[1]-wps[hidx][1])*95))
                    wps[hidx] = [pk[0], pk[1], pk[3]]
                    anchor = wps[hidx]
            if not anchor and s["destination"] and wps[hidx][2] >= 250:
                    b = dem_max((wps[hidx][1], wps[hidx][0]), slug, wps[hidx][2])
                    if b and b[2] >= wps[hidx][2] - 150:
                        wps[hidx] = [b[0], b[1], b[2]]
                        anchor = wps[hidx]
            # 选覆盖最多路径点的连通分量（山径常独立于低街网）
            bestComp, bestScore = None, None
            for comp in comps:
                cset = set(comp)
                if anchor:
                    ad = min((g.nodes[n][0]-anchor[0])**2 + (g.nodes[n][1]-anchor[1])**2 for n in cset)
                    if math.sqrt(ad) * 111320 > 800:
                        continue
                tot = 0.0; inside = 0
                for wp in wps:
                    bd = min((g.nodes[n][0]-wp[0])**2 + (g.nodes[n][1]-wp[1])**2 for n in cset)
                    dmet = math.sqrt(bd) * 111320
                    if dmet <= 2500: inside += 1
                    tot += dmet
                score = (inside, -tot)
                if bestScore is None or score > bestScore:
                    bestScore, bestComp = score, comp
            if not bestComp: raise RuntimeError("no component covers waypoints")
            if anchor:
                print(f"    anchor {anchor[0]:.4f},{anchor[1]:.4f} ele {anchor[2]:.0f}", flush=True)
            g.restrict(set(bestComp))
            comps = [bestComp]
            ids = []
            for wp in wps:
                nid, dmet = g.near((wp[0], wp[1]))
                if dmet > 2500: raise RuntimeError(f"waypoint off network {dmet:.0f}m")
                ids.append(nid)
            if s["type"] == "OUT_AND_BACK":
                mid = max(range(len(ids)), key=lambda i: wps[i][2])
                path = []
                for li, (a, b) in enumerate(zip(ids[:mid+1], ids[1:mid+1])):
                    seg = g.route(a, b)
                    if not seg: raise RuntimeError(f"no route leg OTB {li}: {g.nodes.get(a)}->{g.nodes.get(b)}")
                    path += seg[1:] if path else seg
                full = path + path[-2::-1]
            else:
                path = []
                for li, (a, b) in enumerate(zip(ids, ids[1:])):
                    seg = g.route(a, b)
                    if not seg: raise RuntimeError(f"no route leg {li}: {g.nodes.get(a)}->{g.nodes.get(b)}")
                    path += seg[1:] if path else seg
                if s["type"] == "LOOP":
                    pen = {}
                    for i in range(len(path)-1): pen[(path[i], path[i+1])] = 8.0
                    back = g.route(ids[-1], ids[0], pen)
                    if back and len(set(back) & set(path)) / len(back) < 0.55:
                        path += back[1:]
                    else:
                        back = g.route(ids[-1], ids[0])
                        if not back: raise RuntimeError("no return leg")
                        path += back[1:]
                full = path
            track = [[g.nodes[p][1], g.nodes[p][0]] for p in full]
            track = dp_simplify(track, 0.00004)
            km = sum(hv(track[i], track[i+1]) for i in range(len(track)-1)) / 1000
            closed = hv(track[0], track[-1])
            if km < 0.8: raise RuntimeError(f"too short {km:.2f}km")
            if s["type"] == "LOOP" and closed > 150: raise RuntimeError(f"loop not closed {closed:.0f}m")
            # QA 闸门：与原型数据比较（原型长度经手工校对，作真值代理）
            proto = PROTO.get(slug)
            if proto:
                pkm = max(0.5, proto['km'])
                r_km = km / pkm
                if r_km > 2.2 or r_km < 0.5:
                    # 重试：只用 [起点, 锚点, 终点] 三个路径点
                    w3 = [ids[0], ids[hidx] if s.get('destination') else ids[len(ids)//2], ids[-1]]
                    w3 = list(dict.fromkeys(w3))
                    p2 = []
                    ok3 = True
                    for a, b2 in zip(w3, w3[1:]):
                        seg = g.route(a, b2)
                        if not seg:
                            ok3 = False
                            break
                        p2 += seg[1:] if p2 else seg
                    if ok3 and s['type'] == 'LOOP':
                        pen2 = {}
                        for i in range(len(p2) - 1):
                            pen2[(p2[i], p2[i + 1])] = 3.0
                        back2 = g.route(w3[-1], w3[0], pen2)
                        if back2 and len(set(back2) & set(p2)) / len(back2) < 0.55:
                            p2 += back2[1:]
                    if ok3:
                        t2 = [[g.nodes[q][1], g.nodes[q][0]] for q in p2]
                        t2 = dp_simplify(t2, 0.00004)
                        km2 = sum(hv(t2[i], t2[i + 1]) for i in range(len(t2) - 1)) / 1000
                        r2 = km2 / pkm
                        if 0.5 <= r2 <= 2.2 and (s['type'] != 'LOOP' or hv(t2[0], t2[-1]) <= 150):
                            track = t2
                            km = km2
                            closed = hv(t2[0], t2[-1])
                r_final = km / pkm
                if r_final > 2.2 or r_final < 0.5:
                    raise RuntimeError(f'QA gate: {km:.1f}km vs proto {pkm:.1f}km')
            eles = elev(track, slug)
            t3 = [[p[0], p[1], float(round(e, 1))] for p, e in zip(track, eles)]
            gain = sum(max(0, t3[i][2]-t3[i-1][2]) for i in range(1, len(t3)))
            if proto and proto['gain'] >= 150:
                r_gain = (gain + 1) / max(1.0, proto['gain'] + 1)
                if r_gain > 3.5:
                    raise RuntimeError(f'QA gain: {gain:.0f}m vs proto {proto['gain']}m')
            json.dump({"points": t3, "source": "OpenStreetMap",
                       "license": "© OpenStreetMap contributors (ODbL)"},
                      open(os.path.join(BASE, slug + ".json"), "w"), ensure_ascii=False)
            report.append((slug, "OK", round(km, 2), round(gain), round(max(eles))))
            print(f"    ✓ {slug}: {km:.2f}km +{gain:.0f}m max {max(eles):.0f}m", flush=True)
        except Exception as e:
            report.append((slug, "FAIL: " + str(e)[:60], 0, 0, 0))
            print(f"    ✗ {slug}: {str(e)[:70]}", flush=True)

print("\n===== 批处理报告 =====")
ok = sum(1 for r in report if r[1] == "OK")
for slug, st, km, gain, mx in report:
    print(f"{'✓' if st=='OK' else '✗'} {slug:26s} {st:20s} {km:7.2f}km +{gain}m max{mx}m")
print(f"成功 {ok}/{len(report)}")
