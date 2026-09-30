# 部署说明

## 当前生产环境：https://rayliu.xyz/TrailPick

架构：**本机 (Mac) next start → cloudflared 命名隧道 `fc-game` → Cloudflare → 公网**

```
iPhone/浏览器 ── HTTPS ──> Cloudflare (rayliu.xyz)
                             │  ingress: ^/TrailPick.*$
                             ▼
                 cloudflared (launchd: com.rayliu.fc-tunnel)
                             │ http://localhost:4310
                             ▼
              next start (launchd: com.rayliu.trailpick-web)
              NEXT_PUBLIC_BASE_PATH=/TrailPick, 端口 4310
```

同域共存：`/signal0*` → :1025（Signal0）、`/TrailPick*` → :4310（本项目）、其余 → :5173（绿茵巨星 Vite）。

## 组件清单

| 组件 | 位置 |
| --- | --- |
| 隧道 ingress 规则 | `~/AI/Football_Card/cloudflared/rayliu.xyz.yml`（`path: ^/TrailPick.*$ → localhost:4310`） |
| Web 服务 launchd | `launchd/com.rayliu.trailpick-web.plist` → `~/Library/LaunchAgents/` |
| 运行日志 | `logs/web.log` / `logs/web.err.log` |
| 投票数据 | `apps/web/data/votes.json`（随代码目录持久化） |

## 更新流程

```bash
cd ~/AI/TrailPick
git pull
pnpm install --frozen-lockfile
cd apps/web && NEXT_PUBLIC_BASE_PATH=/TrailPick pnpm build && cd ../..
launchctl kickstart -k gui/$(id -u)/com.rayliu.trailpick-web   # 重启服务
```

或一键：`bash scripts/deploy-local.sh`

注意：`NEXT_PUBLIC_BASE_PATH` 是**构建期**变量，改了必须重新 build。

## 首次安装（新机器）

```bash
cp launchd/com.rayliu.trailpick-web.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rayliu.trailpick-web.plist
# 隧道侧：在 Football_Card/cloudflared/rayliu.xyz.yml 的 ingress 里
# 于 catch-all 之前插入：
#   - hostname: rayliu.xyz
#     path: ^/TrailPick.*$
#     service: http://localhost:4310
# 然后：launchctl kickstart -k gui/$(id -u)/com.rayliu.fc-tunnel
```

## 排障

- 页面变成绿茵巨星 → 隧道 ingress 规则丢失，或有旧 cloudflared 进程残留：`ps aux | grep 'run fc-game'`，只应有一个（launchd 的那个）
- 502 → `curl -I http://127.0.0.1:4310/TrailPick` 看本机服务；看 `logs/web.err.log`
- 本地开发（无前缀）：`pnpm dev` → http://localhost:3000

---

## 备选：VPS + nginx 部署

若将来迁到 Linux 服务器：`deploy/nginx-trailpick.conf`（location 反代）+ `deploy/trailpick.service`（systemd）+ `scripts/deploy-vps.sh`（拉取/构建/重启），步骤见 git 历史中的说明：克隆到 /opt/TrailPick → `NEXT_PUBLIC_BASE_PATH=/TrailPick pnpm build` → systemd 常驻 :4310 → nginx `location /TrailPick` 反代。
