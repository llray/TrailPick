#!/usr/bin/env bash
# TrailPick 本机部署/更新（Mac + launchd）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 拉取最新代码"
git pull --ff-only || echo "（拉取失败，使用本地代码继续）"

echo "==> 安装依赖"
pnpm install --frozen-lockfile

echo "==> 构建 (basePath=/TrailPick)"
cd apps/web
NEXT_PUBLIC_BASE_PATH=/TrailPick pnpm build
cd ../..

echo "==> 重启服务"
launchctl kickstart -k gui/$(id -u)/com.rayliu.trailpick-web
sleep 4

code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4310/TrailPick)
echo "==> 本地健康: $code"
echo "完成：https://rayliu.xyz/TrailPick"
