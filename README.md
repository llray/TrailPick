# TrailPick 去走哪 · 深圳徒步路线选择平台

> **今天走哪条？** —— 深圳徒步路线多人选择与决策 Web 平台（MVP V0.1）
>
> 发现路线 → 条件筛选 → 生成候选 → 多人投票 → 随机决定 → 查看路线 → 出发

本仓库为 PRD《深圳徒步路线选择平台.md》的 MVP 实现，覆盖 PRD §90 定义的 7 个 MVP 页面全部闭环：**地图 + 真实深圳路线 + 筛选 + Vote + Dice**。

## 快速开始

```bash
pnpm install          # 安装依赖
pnpm seed             # 生成 50 条路线数据集 → apps/web/data/routes.json
pnpm dev              # 启动开发服务器 http://localhost:3000
pnpm test             # 核心逻辑测试（30 项：GIS / 筛选 / Random / Vote）
pnpm build            # 生产构建
```

要求：Node 18+，pnpm 8+。

## 功能总览（MVP P0）

| 模块 | 说明 | PRD |
| --- | --- | --- |
| 首页 Discover | 搜索 + 多维筛选（距离/时长/难度/爬升/区域/类型/交通）+ 地图 + 列表，排序 | §8-15, §90 |
| 路线详情 | Leaflet 轨迹地图（POI/起终点/下撤点）、可 hover 海拔剖面、难度构成、交通、安全面板、状态徽章、GPX 导出 | §16-20 |
| Random 🎲 | 条件 → 硬筛选 → 排除关闭路线 → 排除最近走过 → 加权随机（match 45% / rating 20% / 热度 15% / 新鲜度 20%）+ 老虎机动画 | §25-27 |
| 创建投票 | 选 2-8 条候选 + 截止时间 + 单/多选 + 实时开关 → 6 位分享码 /v/XXXXXX | §21, §47 |
| 投票房 | 微信免登录投票（Guest Name + browserId）、4s 轮询实时结果、平局骰子（只在最高票中抽）、创建者提前掷骰/结束 | §22-27 |
| GPX 上传 | 解析 trkpt → 自动计算距离/爬升/时长 → 默认 PRIVATE + 待审核 | §28-30 |
| Admin | 口令登录、路线状态机管理（OPEN/CAUTION/PARTIALLY_CLOSED/CLOSED）、用户上传审核发布、投票箱一览 | §58-59 |

## 技术栈

```
Next.js 14 (App Router) · TypeScript · Tailwind CSS
Leaflet + CARTO Voyager 瓦片（WGS84 直显，无偏移）
JSON 文件数据层（结构对齐 PRD §35 PostgreSQL/Supabase，可平迁）
无后端依赖、无数据库依赖的零成本部署 MVP
```

## 目录结构

```
├─ apps/web                 # Next.js 应用
│  ├─ src/lib               # 核心库：geo(测距/DP简化/难度/Naismith) · coordinate(WGS84↔GCJ02)
│  │                        #        routes(搜索) · random(加权随机) · votes(投票) · gpx · store
│  ├─ src/app               # 页面：/ · /route/[slug] · /random · /vote/create · /v/[id] · /upload · /admin
│  ├─ src/app/api           # REST：routes / routes/random / tracks / votes(+/vote /dice /close) / upload / admin
│  ├─ src/components        # MapView · ElevationChart · RouteCard · FilterSheet · VoteRoom · RouteDetail
│  └─ data                  # routes.json（种子生成） + votes.json / stats.json（运行时）
├─ scripts                  # seed-*.ts（50 条路线种子） · generate-routes.ts · test-core.ts
└─ docs/ARCHITECTURE.md     # 架构决策与 PRD 映射
```

## 路线数据说明（重要）

Phase 0 数据原型（PRD §92）：**50 条覆盖深圳 10 区的真实路线**（梧桐山 6 线、马峦山 4 线、三水线、东西冲、七娘山、梅沙尖、鲲鹏径/凤凰径/翠微径官方段、深圳湾/大沙河/虹桥等城市绿道）。

- 距离 / 爬升 / 下降 / 时长 / 难度 / 海拔剖面 / 陡坡段全部由轨迹**自动计算**（Catmull-Rom 插值 + 确定性分形噪声 + Naismith 时长 + 六因子难度模型）
- 控制点为**示意级 WGS84 坐标**（误差数百米级），每条路线均带 ``source_type`` / ``source_license`` 溯源标注
- **接官方 GPX 后即可无缝替换**（PRD §31 禁止无来源数据——本原型全部显式标注为“平台人工整理（原型示意轨迹）”）

## 与 PRD 推荐栈的差异决策

| PRD 推荐 | MVP 实现 | 原因 |
| --- | --- | --- |
| 高德 JS API | Leaflet + OSM/CARTO | 高德需 API Key + 商用授权；数据层已备好 `coordinate.ts` WGS84→GCJ02 转换，拿到 Key 即可切换 |
| Supabase + PostGIS | JSON 文件存储 | 零配置可运行；表结构/接口与 §35 同构，迁移仅替换 `store.ts` |
| Supabase Realtime | 4s 轮询 | MVP 够用；投票箱组件已隔离数据获取，可平滑替换 |

详见 `docs/ARCHITECTURE.md`。

## 测试

```bash
pnpm test   # 30 项断言：haversine/DP简化/坐标往返/GPX解析/难度模型/海拔分析
            #           数据集完整性(≥50条/10区) · 组合筛选 · Random 硬过滤与排除
            #           投票：单选约束/改票幂等/平局检测/骰子只在最高票抽取/IP防刷/过期锁定
```

## 环境变量

```
ADMIN_PASSWORD=trailpick      # /admin 登录口令（开发默认）
NEXT_PUBLIC_SITE_URL=         # OG 分享链接域名（生产设置）
```
