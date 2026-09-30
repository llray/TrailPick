import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";

// 自托管字体（构建不依赖 Google CDN；latin 子集）
const archivo = localFont({
  src: "../fonts/archivo-latin-var.woff2", // Archivo 可变字体 wght 100-900
  weight: "100 900",
  variable: "--font-display",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "TrailPick 去走哪 · 深圳徒步路线选择平台",
    template: "%s · TrailPick 去走哪",
  },
  description:
    "深圳 50 条徒步路线的结构化筛选、多人投票与随机决定平台。发现路线 → 条件筛选 → 生成候选 → 多人投票 → 随机决定 → 出发。",
  keywords: ["深圳徒步", "徒步路线", "梧桐山", "马峦山", "三水线", "深圳登山", "路线投票"],
  openGraph: {
    title: "TrailPick 去走哪 · 今天走哪条？",
    description: "深圳徒步路线发现与决策平台：筛选、投票、骰子，今天就能出发。",
    type: "website",
    locale: "zh_CN",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e4d38",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const NAV = [
  { href: "/", label: "发现", icon: "🗺️" },
  { href: "/random", label: "帮我选", icon: "🎲" },
  { href: "/vote/create", label: "发起投票", icon: "👥" },
  { href: "/upload", label: "上传", icon: "📥" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${archivo.variable} ${plexMono.variable} antialiased topo-bg`}>
        <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--paper)]/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--forest)] text-[15px] text-white shadow-sm">
                ▲
              </span>
              <span className="font-display text-[19px] font-extrabold tracking-tight">
                TrailPick
                <span className="ml-2 hidden text-[12px] font-semibold text-[color:var(--ink-3)] sm:inline">
                  去走哪 · 深圳
                </span>
              </span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-full px-3.5 py-2 text-[14px] font-medium text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--forest-soft)] hover:text-[color:var(--forest)]"
                >
                  <span className="mr-1.5">{n.icon}</span>
                  {n.label}
                </Link>
              ))}
              <Link href="/admin" className="ml-2 rounded-full border border-[color:var(--line-2)] px-3.5 py-1.5 text-[12px] font-semibold text-[color:var(--ink-3)] transition-colors hover:border-[color:var(--forest)] hover:text-[color:var(--forest)]">
                Admin
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-6xl px-4 pb-28 pt-6 md:pb-16">
          {children}
        </main>

        <footer className="hidden border-t border-[color:var(--line)] py-8 text-center text-[12px] text-[color:var(--ink-3)] md:block">
          TrailPick · 深圳徒步路线多人选择与决策平台 MVP · 路线数据为原型示意，出发前请核实官方公告
        </footer>

        {/* 移动端底部导航 */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--line)] bg-[color:var(--card)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid grid-cols-4">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-[color:var(--ink-2)] active:text-[color:var(--blaze)]"
              >
                <span className="text-[17px] leading-none">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
