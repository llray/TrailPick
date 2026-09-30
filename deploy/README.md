# 部署到 https://rayliu.xyz/TrailPick

应用在 Next.js 层启用 `basePath=/TrailPick`（由 `NEXT_PUBLIC_BASE_PATH` 环境变量控制，本地开发留空则无前缀）。

## 服务器要求

- Node.js ≥ 18（推荐 20）
- nginx（rayliu.xyz 的源站）
- 可访问 github.com

## 首次部署步骤

```bash
# 1. 服务器上克隆
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/llray/TrailPick.git
sudo chown -R $USER /opt/TrailPick && cd TrailPick

# 2. 安装依赖 + 构建
pnpm install --frozen-lockfile
cd apps/web
NEXT_PUBLIC_BASE_PATH=/TrailPick pnpm build

# 3. systemd 常驻（推荐）
sudo cp deploy/trailpick.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trailpick

# 4. nginx 追加反代（把 deploy/nginx-trailpick.conf 内容
#    粘贴进 rayliu.xyz 对应的 server{} 块）
sudo nginx -t && sudo nginx -s reload
```

验证：`curl -I https://rayliu.xyz/TrailPick` → 200

## 后续更新

```bash
bash scripts/deploy-vps.sh   # 拉代码 → 构建 → 重启 → 健康检查
```

## 环境变量

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_BASE_PATH` | `/TrailPick` | 子路径前缀（构建期生效，改后需重新 build） |
| `PORT` | `4310` | 服务监听端口（仅本机回环） |
| `ADMIN_PASSWORD` | 自定义 | /admin 登录口令，**上线请改掉默认值** |

投票数据持久化在 `/opt/TrailPick/apps/web/data/`（votes.json），升级时自动保留。
