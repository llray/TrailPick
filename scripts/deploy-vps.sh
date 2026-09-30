#!/usr/bin/env bash
# TrailPick VPS 部署/更新脚本（在服务器上执行）
# 用法: bash scripts/deploy-vps.sh
set -euo pipefail

APP_DIR=/opt/TrailPick
PORT=4310
BASE_PATH=/TrailPick

cd "$APP_DIR"

echo "==> 拉取最新代码"
git fetch origin
git reset --hard origin/main

echo "==> 安装依赖"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
else
  npm i -g pnpm@9 2>/dev/null || corepack enable
  pnpm install --frozen-lockfile
fi

echo "==> 构建 (basePath=$BASE_PATH)"
cd apps/web
NEXT_PUBLIC_BASE_PATH=$BASE_PATH pnpm build

echo "==> 重启服务"
systemctl restart trailpick 2>/dev/null || {
  echo "（无 systemd 单元，改用 pm2/nohup）"
  pkill -f 'next start.*-p '$PORT 2>/dev/null || true
  sleep 1
  NEXT_PUBLIC_BASE_PATH=$BASE_PATH nohup npx next start -p $PORT -H 127.0.0.1 > /var/log/trailpick.log 2>&1 &
}

echo "==> 健康检查"
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT$BASE_PATH/ || true)
echo "本地健康: $code （预期 200/308）"
echo "完成：https://rayliu.xyz/TrailPick"
