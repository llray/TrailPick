/** @type {import('next').NextConfig} */
// 部署到子路径时设置 NEXT_PUBLIC_BASE_PATH=/TrailPick（本地开发留空）
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  basePath,
  env: {
    // 客户端 fetch/分享链接读取同一前缀（见 src/lib/client.ts）
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
