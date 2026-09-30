/**
 * 核心逻辑测试（PRD §86 测试重点）
 * GIS: GPX 解析/距离/海拔/坐标/简化   Vote: 重复票/多用户/过期/防刷/平局
 * Random: 过滤/关闭排除/空结果/平局只抽最高票
 */
import assert from "node:assert";
import { haversineM, pathLengthKm, douglasPeucker, computeDifficulty, analyzeTrack, mulberry32 } from "../apps/web/src/lib/geo";
import { wgs84ToGcj02, gcj02ToWgs84 } from "../apps/web/src/lib/coordinate";
import { parseGpx, trackToGpx } from "../apps/web/src/lib/gpx";
import { searchRoutes, loadRoutes, getRouteBySlug, applyFilters } from "../apps/web/src/lib/routes";
import { pickRandomRoute } from "../apps/web/src/lib/random";
import {
  createVote,
  castVote,
  rollDice,
  resultsOf,
  getVote,
  closeVote,
  isExpired,
  type VoteRoom,
} from "../apps/web/src/lib/votes";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    fails.push(name + " → " + (e instanceof Error ? e.message : e));
    console.log("  ✗", name, "→", e instanceof Error ? e.message : e);
  }
}

console.log("\n== GIS 基础 ==");
test("haversine: 深圳市民中心→深圳北 约 9.5km", () => {
  const d = haversineM(22.546, 114.054, 22.610, 114.029);
  assert.ok(d > 7000 && d < 11500, "actual " + d.toFixed(0));
});
test("pathLength: 返回累计公里数", () => {
  const km = pathLengthKm([
    [114.0, 22.5, 10],
    [114.01, 22.5, 10],
    [114.02, 22.5, 10],
  ]);
  assert.ok(km > 1.8 && km < 2.2, "actual " + km.toFixed(2));
});
test("Douglas-Peucker: 共线点被移除、拐点保留", () => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 1000; i++) {
    // 1000 个共线点，中段放一个尖峰拐点
    const spike = i === 500 ? 0.02 : 0;
    pts.push([114 + i * 0.0001, 22.5 + i * 0.0001 + spike, 100]);
  }
  const out = douglasPeucker(pts);
  assert.ok(out.length >= 3 && out.length < 10, "kept " + out.length);
  assert.strictEqual(out[0][0], pts[0][0]);
  assert.strictEqual(out[out.length - 1][0], pts[pts.length - 1][0]);
});
test("坐标转换 WGS84↔GCJ02 往返误差 < 2m", () => {
  const glng = 114.054;
  const glat = 22.546;
  const [gLat, gLng] = wgs84ToGcj02(glat, glng);
  assert.notEqual(gLat, glat, "应有偏移");
  const [backLat, backLng] = gcj02ToWgs84(gLat, gLng);
  const err = haversineM(glat, glng, backLat, backLng);
  assert.ok(err < 2, "误差 " + err.toFixed(2) + "m");
});
test("GPX 解析: trkpt/ele/time", () => {
  const gpx = trackToGpx("test", "d", [
    [114.0, 22.5, 10],
    [114.01, 22.5, 20],
  ]);
  const parsed = parseGpx(gpx);
  assert.strictEqual(parsed.points.length, 2);
  assert.strictEqual(parsed.points[0].ele, 10);
});
test("GPX 解析: 空轨迹报错", () => {
  assert.throws(() => parseGpx("<gpx></gpx>"));
});
test("难度模型: 平路绿道=1 级, 高强度山线≥4 级", () => {
  const easy = computeDifficulty({ distanceKm: 5, gainM: 50, surface: 0, technical: 0, exit: 0 });
  const hard = computeDifficulty({ distanceKm: 18, gainM: 1400, surface: 3, technical: 2, exit: 2 });
  assert.strictEqual(easy.level, 1);
  assert.ok(hard.level >= 4, "hard=" + hard.level);
});
test("海拔分析: 爬升/剖面/时长", () => {
  const track: [number, number, number][] = [];
  for (let i = 0; i <= 100; i++) {
    // 100 点，每点 6m 爬升、约 65m 平距（12% 坡）
    track.push([114 + i * 0.0006, 22.5 + i * 0.0002, 600 * (i / 100)]);
  }
  const a = analyzeTrack(track);
  assert.ok(a.gainM > 400, "gain=" + a.gainM);
  assert.ok(a.profile.length > 10);
  assert.ok(a.durationMin > 60, "dur=" + a.durationMin);
});

console.log("\n== 路线数据与筛选 ==");
const routes = loadRoutes();
test("数据集 ≥ 50 条且元数据完整", () => {
  assert.ok(routes.length >= 50, "routes=" + routes.length);
  for (const r of routes) {
    assert.ok(r.track.length > 20, r.slug + " track");
    assert.ok(r.elevation_profile.length > 10, r.slug + " profile");
    assert.ok(r.difficulty >= 1 && r.difficulty <= 5, r.slug + " difficulty");
    assert.ok(r.distance_km > 0.5, r.slug + " distance");
    assert.ok(r.source_type, r.slug + " source");
    assert.ok(r.bbox[0] < r.bbox[2] && r.bbox[1] < r.bbox[3], r.slug + " bbox");
  }
});
test("覆盖深圳 10 个行政区", () => {
  const ds = new Set(routes.map((r) => r.district));
  for (const d of ["福田", "罗湖", "南山", "盐田", "宝安", "龙岗", "龙华", "坪山", "光明", "大鹏"]) {
    assert.ok(ds.has(d), "缺 " + d);
  }
});
test("距离筛选 10-15km", () => {
  const { routes: out } = searchRoutes({ city: "shenzhen", distanceMin: 10, distanceMax: 15 });
  assert.ok(out.length > 0);
  for (const r of out) assert.ok(r.distance_km >= 10 && r.distance_km <= 15);
});
test("难度+爬升组合筛选", () => {
  const { routes: out } = searchRoutes({ difficultyMin: 1, difficultyMax: 3, elevationMax: 400 });
  assert.ok(out.length > 0);
  for (const r of out) {
    assert.ok(r.difficulty <= 3 && r.elevation_gain_m <= 400);
  }
});
test("区域筛选: 大鹏", () => {
  const { routes: out } = searchRoutes({ districts: ["大鹏"] });
  assert.ok(out.length >= 5, "dapeng=" + out.length);
  for (const r of out) assert.ok(r.district === "大鹏" || r.districts.includes("大鹏"));
});
test("虚拟区域: 东部 = 盐田+龙岗+坪山+大鹏", () => {
  const east = ["盐田", "龙岗", "坪山", "大鹏"];
  const { routes: out } = searchRoutes({ districts: east });
  for (const r of out) {
    assert.ok(east.includes(r.district) || r.districts.some((d) => east.includes(d)));
  }
});
test("关键词搜索 梧桐山", () => {
  const { routes: out } = searchRoutes({ q: "梧桐山" });
  assert.ok(out.length >= 5);
});
test("slug 查询存在", () => {
  assert.ok(getRouteBySlug("wutong-classic"));
  assert.strictEqual(getRouteBySlug("not-exist-xyz"), null);
});
test("Random 不返回关闭路线", () => {
  const res = pickRandomRoute({ statuses: ["OPEN"] });
  assert.ok(res);
  assert.notStrictEqual(res!.picked.status, "CLOSED");
  assert.notStrictEqual(res!.picked.status, "PARTIALLY_CLOSED");
});
test("Random: 硬过滤后为空 → 返回 null", () => {
  const res = pickRandomRoute({ distanceMin: 999 });
  assert.strictEqual(res, null);
});
test("Random: 候选计数一致", () => {
  const res = pickRandomRoute({ distanceMin: 5, distanceMax: 15, difficultyMax: 3 });
  assert.ok(res && res.candidateCount > 0);
  const cands = applyFilters(routes, { distanceMin: 5, distanceMax: 15, difficultyMax: 3 });
  assert.strictEqual(res!.candidateCount, cands.length);
});
test("Random: excludeIds 生效", () => {
  const base = pickRandomRoute({ distanceMin: 3, difficultyMax: 3 });
  assert.ok(base);
  const res = pickRandomRoute({ distanceMin: 3, difficultyMax: 3, excludeIds: [base!.picked.id] });
  assert.ok(res);
  assert.notStrictEqual(res!.picked.id, base!.picked.id);
});

console.log("\n== 投票系统 ==");
function freshRoom(): VoteRoom {
  return createVote({
    title: "测试周六去哪",
    routeIds: ["rt_001", "rt_002", "rt_003"],
    multipleChoice: false,
    showLive: true,
    deadlineMin: null,
    createdBy: "Ray",
  });
}
test("创建投票: 6 位 ID", () => {
  const room = freshRoom();
  assert.match(room.id, /^[A-Z2-9]{6}$/);
  assert.strictEqual(getVote(room.id)!.title, "测试周六去哪");
});
test("单选房间拒绝多选", () => {
  const room = freshRoom();
  const res = castVote(room.id, { voterName: "Tom", browserId: "b1", routeIds: ["rt_001", "rt_002"] });
  assert.strictEqual(res.ok, false);
  assert.strictEqual((res as { error: string }).error, "SINGLE_CHOICE_ONLY");
});
test("同一 browser 改票只计一票", () => {
  const room = freshRoom();
  castVote(room.id, { voterName: "Tom", browserId: "b1", routeIds: ["rt_001"] });
  castVote(room.id, { voterName: "Tom", browserId: "b1", routeIds: ["rt_002"] });
  const res = resultsOf(getVote(room.id)!);
  assert.strictEqual(res.totalBallots, 1);
  assert.strictEqual(res.counts.find((c) => c.routeId === "rt_002")!.count, 1);
});
test("多用户计票 + 平局检测", () => {
  const room = freshRoom();
  castVote(room.id, { voterName: "A", browserId: "ba", routeIds: ["rt_001"] });
  castVote(room.id, { voterName: "B", browserId: "bb", routeIds: ["rt_002"] });
  const res = resultsOf(getVote(room.id)!);
  assert.strictEqual(res.totalBallots, 2);
  assert.ok(res.isTie);
  assert.deepStrictEqual([...res.leaders].sort(), ["rt_001", "rt_002"]);
});
test("平局骰子只在最高票中抽取", () => {
  const room = freshRoom();
  castVote(room.id, { voterName: "A", browserId: "ba", routeIds: ["rt_001"] });
  castVote(room.id, { voterName: "B", browserId: "bb", routeIds: ["rt_001"] });
  castVote(room.id, { voterName: "C", browserId: "bc", routeIds: ["rt_002"] });
  castVote(room.id, { voterName: "D", browserId: "bd", routeIds: ["rt_002"] });
  castVote(room.id, { voterName: "E", browserId: "be", routeIds: ["rt_003"] });
  const res = rollDice(room.id, "Ray");
  assert.ok(res.ok);
  const picked = (res as { picked: string }).picked;
  assert.ok(["rt_001", "rt_002"].includes(picked), "picked=" + picked);
  assert.strictEqual(getVote(room.id)!.decision!.candidates.length, 2);
});
test("非平局时掷骰被拒绝", () => {
  const room = freshRoom();
  castVote(room.id, { voterName: "A", browserId: "ba", routeIds: ["rt_001"] });
  castVote(room.id, { voterName: "B", browserId: "bb", routeIds: ["rt_001"] });
  const res = rollDice(room.id, "Ray");
  assert.strictEqual(res.ok, false);
  assert.strictEqual((res as { error: string }).error, "NOT_TIE");
});
test("防刷: 同 IP 4 秒内连续投票被限流", () => {
  const room = freshRoom();
  const ip = "10." + Math.floor(Math.random() * 250) + ".1.1";
  const r1 = castVote(room.id, { voterName: "S1", browserId: "sp_a_" + ip, routeIds: ["rt_001"], ip });
  assert.ok(r1.ok);
  const r2 = castVote(room.id, { voterName: "S2", browserId: "sp_b_" + ip, routeIds: ["rt_002"], ip });
  assert.ok(r2.ok, "第二票在窗口阈值内允许");
  const r3 = castVote(room.id, { voterName: "S3", browserId: "sp_c_" + ip, routeIds: ["rt_003"], ip });
  assert.strictEqual(r3.ok, false);
  assert.strictEqual((r3 as { error: string }).error, "RATE_LIMITED");
});
test("非法选项被拒绝", () => {
  const room = freshRoom();
  const res = castVote(room.id, { voterName: "X", browserId: "bx1", routeIds: ["rt_999"] });
  assert.strictEqual(res.ok, false);
});
test("创建者关闭后拒绝新投票", () => {
  const room = freshRoom();
  closeVote(room.id, "Ray");
  const res = castVote(room.id, { voterName: "Late", browserId: "blate", routeIds: ["rt_001"] });
  assert.strictEqual(res.ok, false);
});
test("过期投票判定", () => {
  const expired: VoteRoom = {
    ...freshRoom(),
    deadline: new Date(Date.now() - 60000).toISOString(),
  };
  assert.ok(isExpired(expired));
});

console.log("\n========================================");
console.log("通过 " + passed + " · 失败 " + failed);
if (failed) {
  for (const f of fails) console.log("  ✗", f);
  process.exit(1);
} else {
  console.log("全部通过 ✓");
}
