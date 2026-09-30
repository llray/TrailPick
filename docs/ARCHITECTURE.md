# TrailPick 架构决策记录（MVP V0.1）

对应 PRD《深圳徒步路线选择平台.md》。本文记录实现与 PRD 推荐栈的差异、核心算法与数据流。

---

## 1. 技术选型差异与迁移路径

### 1.1 地图：Leaflet（MVP）→ 高德 JS API（生产）

- **现状**：Leaflet 1.9 + CARTO Voyager 栅格瓦片。数据统一 WGS84，Leaflet/OSM 系瓦片同为 WGS84，**直接渲染无偏移**。
- **迁移**：`src/lib/coordinate.ts` 已实现标准 WGS84↔GCJ02 算法（含往返校验测试）。接入高德时：
  1. `MapView.tsx` 换用 AMap Loader，轨迹先过 `trackWgs84ToGcj02()`；
  2. 图层/POI 渲染逻辑不变；
  3. 注意高德商用授权与配额（PRD §41）。

### 1.2 存储：JSON 文件（MVP）→ Supabase/PostgreSQL+PostGIS（V1）

- **现状**：
  - `data/routes.json` —— 种子生成的 50 条路线（脚本 `pnpm seed` 产物，运行时可被 admin 修改）；
  - `data/votes.json` —— 投票房（原子写：tmp+rename）；
  - `data/stats.json` —— 浏览/收藏/完成计数（避免重写大 routes 文件）。
- **接口同构**：`routes.ts / votes.ts / random.ts` 是唯一数据访问层，页面与 API 不直接碰文件。迁移 = 把这三个模块的读写换成 Supabase 客户端，表结构按 PRD §35：
  - `routes`（jsonb track/profile → PostGIS geometry LineString）
  - `vote_rooms / ballots`（现 ballots 内嵌于 room，量大时拆表）
  - `route_status_history`（admin 状态变更留痕，MVP 未建）
- **Realtime**：投票箱为 4s 轮询（`VoteRoom.tsx` 内注释标明），迁移 Supabase Realtime 时仅替换 `load()` 数据源。

### 1.3 认证：Guest（MVP）→ 微信/手机号（V1）

投票参与 = 昵称 + `browserId`（localStorage），同设备可改票（幂等），同名不同设备允许（代投场景）。防刷 = 内存速率限制（同 browser 4s 内 2 次、同 IP 4s 内 2 次）。登录后可将 ballout 绑定 user_id（PRD §59）。

---

## 2. 核心算法

### 2.1 轨迹生成（Phase 0 数据原型，PRD §92）

```
控制点(6-16个, 手工标定海拔)
  → 段间插入摆动中点(+10~20% 长度, mulberry32 确定性)
  → Catmull-Rom 样条 45m 采样
  → 分形值噪声(水平 60-80m / 海拔 ±7m, slug 哈希做种子 → 可复现)
  → 80m 重采样 = 存储轨迹
```

### 2.2 元数据全自动计算（`geo.ts`）

| 字段 | 算法 |
| --- | --- |
| distance_km | Haversine 累计 |
| gain/loss | 滑动平均去噪后，|Δ|>2m 计入 |
| duration | **Naismith**（5km/h + 600m/h）× 地形系数(1.0 绿道~1.35 野径) × 陡坡系数(均值>12% 时 ×1.15)，5min 取整 |
| 海拔剖面 | 沿程二分查找 ~140 采样点 |
| 陡坡段 | 200m 滑窗坡度 >15% 连续段 |
| 简化轨迹 | Douglas-Peucker ε≈9m（PRD §88） |
| 难度 | 六因子加权：距离 .24 / 爬升 .28 / 坡度 .16 / 路面 .10 / 技术 .13 / 下撤 .09，各因子 0-5 分段线性，综合四舍五入 1-5；经典线允许 admin 校准（`difficultyOverride`） |

### 2.3 加权随机（PRD §25-27）

```
候选 = 硬筛选(距离/时长/难度/爬升/区域/标签/交通)
     − CLOSED 路线(安全过滤, PARTIALLY_CLOSED 保留但卡片警示)
     − excludeIds(本地“最近走过”)
得分 = match .45(距离.4/时长.25/难度.25/爬升.1 中心度)
     + rating .20 + popularity .15(log 归一) + freshness .20(反浏览量)
抽取 = roulette wheel 加权随机
```

平局骰子（投票房）独立实现：**只在并列最高票中等概率抽取**，提前掷骰仅创建者可用且在全部候选中抽取。

### 2.4 首屏性能（PRD §87-88）

- 列表 API `GET /api/routes` 返回卡片数据（**无几何**）；
- 地图轨迹异步二次加载 `GET /api/tracks`（全部简化轨迹 ~200KB）；
- 详情页服务端渲染，完整轨迹仅在该路由下发；
- 路线卡瀑布式 stagger 入场，卡片 hover 时地图高亮对应轨迹。

---

## 3. 数据模型（`src/lib/types.ts`）

与 PRD §34 字段一一对应；MVP 增量字段：

- `source_name / source_license`：溯源展示（§31 数据来源透明）；
- `review_status / visibility / uploader_name`：上传审核流（§74）；
- `difficulty_detail`：难度六分项（可解释性）。

状态机（§20）：`OPEN → CAUTION → PARTIALLY_CLOSED → CLOSED → UNKNOWN`，Admin 可随时切换，Random 默认排除 CLOSED。

投票（§22）：`VoteRoom { id:6位base32, ballots[], decision }`；`decision.method ∈ DICE_TIE | DICE_FORCE`；截止时间到自动锁定（读取时判定）。

---

## 4. 目录职责

```
apps/web/src/lib/        geo / coordinate / gpx / routes / random / votes / store / format / client
apps/web/src/app/        页面（7 MVP 页）+ api/（12 个 REST 端点）
apps/web/src/components/ MapView / ElevationChart / RouteCard / FilterSheet / VoteRoom / RouteDetail / badges
scripts/                 seed-*.ts 种子(50条) · generate-routes.ts 生成器 · test-core.ts 测试(30项)
```

## 5. 已知边界与下一步（对齐 PRD §99）

- [ ] 轨迹为示意数据，接官方 GPX/管线替换（P0 收尾）
- [ ] Supabase 迁移 + Realtime（P1）
- [ ] 收藏夹/完成记录跨设备同步（P1，本地 localStorage 已预留）
- [ ] GPX 对比去重（§32，P1）
- [ ] 微信 JS-SDK 自定义分享卡（MVP 用 OG meta 近似）
- [ ] PWA 离线（P2）
