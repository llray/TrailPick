"use client";

/**
 * 路线详情 (PRD §16-20)：地图轨迹 / 海拔图 / 基础信息 / 交通 / 安全 / 状态
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "@/lib/types";
import { formatDuration, difficultyLabel, SOURCE_META, ROUTE_TYPE_LABELS } from "@/lib/format";
import { StatusBadge, DifficultyBadge, TagChip } from "./badges";
import { ElevationChart } from "./ElevationChart";
import WeatherCard from "./WeatherCard";
import { toggleFavorite, markCompleted, markRecent, setPendingVoteRoutes, getFavorites, getCompleted, withBase } from "@/lib/client";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function RouteDetail({ route }: { route: Route }) {
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFav(getFavorites().includes(route.id));
    setDone(getCompleted().includes(route.id));
    // 浏览计数 + 最近足迹
    fetch(withBase(`/api/routes/${route.slug}?view=1`)).catch(() => {});
    markRecent(route.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  const mapRoutes = useMemo(
    () => [
      {
        id: route.id,
        name: route.name_cn,
        difficulty: route.difficulty,
        status: route.status,
        coords: route.track_simplified,
      },
    ],
    [route]
  );
  const mapMarkers = useMemo(() => {
    const kindIcon: Record<string, string> = {
      summit: "⛰️",
      start: "🚩",
      end: "🏁",
      exit: "🪧",
      water: "💧",
      supply: "🏪",
      toilet: "🚻",
      metro: "🚇",
      bus: "🚌",
      sight: "📸",
    };
    return route.pois.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      emoji: kindIcon[p.kind] ?? "📍",
      name: p.note ? `${p.name}（${p.note}）` : p.name,
      color: p.kind === "summit" ? "#e85d26" : p.kind === "metro" ? "#1f7a8c" : "var(--forest)",
    }));
  }, [route]);

  const shareText = `🥾 ${route.name_cn}｜${route.distance_km}km · ${formatDuration(route.estimated_duration_min)} · 难度${"★".repeat(route.difficulty)}\n${route.description.slice(0, 60)}…\n${typeof window !== "undefined" ? window.location.href : ""}`;

  const doShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${route.name_cn} · TrailPick`, text: shareText, url });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const stats = [
    { label: "距离", value: route.distance_km.toFixed(1), unit: "km" },
    { label: "参考时长", value: formatDuration(route.estimated_duration_min), unit: "" },
    { label: "累计爬升", value: String(route.elevation_gain_m), unit: "m" },
    { label: "累计下降", value: String(route.elevation_loss_m), unit: "m" },
    { label: "最高海拔", value: String(route.max_elevation_m), unit: "m" },
    { label: "最低海拔", value: String(route.min_elevation_m), unit: "m" },
  ];

  const dd = route.difficulty_detail;
  const ddRows = dd
    ? [
        ["距离分", dd.distance],
        ["爬升分", dd.climb],
        ["坡度分", dd.gradient],
        ["路面分", dd.surface],
        ["技术分", dd.technical],
        ["下撤难度", dd.exit],
      ]
    : [];

  return (
    <article>
      {/* 头部 */}
      <header className="fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={route.status} note={route.status_note} size="lg" />
          <DifficultyBadge level={route.difficulty} size="lg" />
          <span className="rounded-full bg-[color:var(--blaze-soft)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--blaze-2)]">
            ★ {route.rating.toFixed(1)}
          </span>
        </div>
        <h1 className="mt-2.5 font-display text-[28px] font-extrabold leading-tight sm:text-[34px]">{route.name_cn}</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">
          {route.destination ? `${route.destination} · ` : ""}
          {route.district} · {ROUTE_TYPE_LABELS[route.route_type]} ·{" "}
          <span className="font-num">{route.stats.views.toLocaleString()}</span> 次浏览
        </p>
        {route.status_note && (
          <div className="mt-3 rounded-xl border border-[color:var(--warn)]/40 bg-[#faf0d7] px-4 py-3 text-[13px] text-[color:var(--warn)]">
            ⚠️ {route.status_note}
          </div>
        )}
      </header>

      {/* 地图 + 海拔 */}
      <section className="card mt-5 overflow-hidden fade-up">
        <div className="h-[300px] w-full sm:h-[380px]">
          <MapView routes={mapRoutes} markers={mapMarkers} fitPadding={28} slug={route.slug} />
        </div>
        <div className="border-t border-[color:var(--line)] px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">海拔剖面 Elevation</span>
            <span className="font-num text-[12px] text-[color:var(--ink-3)]">
              ↑{route.elevation_gain_m}m ↓{route.elevation_loss_m}m
            </span>
          </div>
          <ElevationChart profile={route.elevation_profile} gain={route.elevation_gain_m} loss={route.elevation_loss_m} />
        </div>
      </section>

      {/* 操作条 */}
      <section className="mt-4 flex flex-wrap gap-2.5">
        <button
          className={`btn ${fav ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFav(toggleFavorite(route.id))}
        >
          {fav ? "❤️ 已收藏" : "🤍 收藏"}
        </button>
        <button
          className={`btn ${done ? "btn-forest" : "btn-ghost"}`}
          onClick={() => {
            markCompleted(route.id);
            setDone(true);
          }}
        >
          {done ? "✅ 走过" : "✓ 标记走过"}
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            setPendingVoteRoutes([route.id]);
            router.push("/vote/create");
          }}
        >
          ➕ 加入投票
        </button>
        <button className="btn-ghost" onClick={doShare}>
          {copied ? "✅ 已复制" : "🔗 分享"}
        </button>
        <a className="btn-ghost" href={withBase(`/api/routes/${route.slug}/gpx`)} download>
          📥 GPX
        </a>
      </section>

      {/* 天气 + 动态安全预警 (PRD §19/§61) */}
      <WeatherCard slug={route.slug} />

      {/* 描述 */}
      <p className="mt-5 max-w-3xl text-[15px] leading-[1.9] text-[color:var(--ink-2)]">{route.description}</p>

      {/* 数据网格 */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="label">{s.label}</div>
            <div className="stat-num mt-1 text-[20px]">
              {s.value}
              <span className="ml-0.5 text-[12px] font-normal text-[color:var(--ink-3)]">{s.unit}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* 路线信息 */}
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-bold">路线信息</h2>
          <dl className="space-y-2.5 text-[13.5px]">
            <Row k="路线类型" v={ROUTE_TYPE_LABELS[route.route_type]} />
            <Row k="难度" v={`${route.difficulty} 级 · ${difficultyLabel(route.difficulty)}`} />
            <Row k="路面" v={route.surface_types.join(" / ")} />
            <Row k="标签" v={<span className="flex flex-wrap gap-1">{route.tags.map((t) => <TagChip key={t} tag={t} />)}</span>} />
            <Row k="数据来源" v={`${SOURCE_META[route.source_type] ?? route.source_type}${route.source_name ? ` · ${route.source_name}` : ""}`} />
            <Row k="数据说明" v={route.source_license ?? "-"} />
            {dd && (
              <Row
                k="难度构成"
                v={
                  <span className="font-num text-[12px] text-[color:var(--ink-3)]">
                    {ddRows.map(([k, v]) => `${k}${Math.round(v as number)}`).join(" · ")} → 综合 {dd.composite}
                  </span>
                }
              />
            )}
          </dl>
        </section>

        {/* 交通 */}
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-bold">如何到达</h2>
          <div className="space-y-2.5 text-[13.5px]">
            {route.transport.nearestMetro && (
              <div className="flex items-center gap-2">
                <span className="waymark" style={{ background: "#1f7a8c" }}>METRO</span>
                <span>
                  {route.transport.nearestMetro.line} {route.transport.nearestMetro.name}站
                  <span className="ml-1 font-num text-[color:var(--ink-3)]">≈{route.transport.nearestMetro.distanceKm}km</span>
                </span>
              </div>
            )}
            {route.transport.nearestBus && (
              <div className="flex items-center gap-2">
                <span className="waymark" style={{ background: "#2c6a4d" }}>BUS</span>
                <span>
                  {route.transport.nearestBus.name}
                  <span className="ml-1 font-num text-[color:var(--ink-3)]">≈{route.transport.nearestBus.distanceKm}km</span>
                </span>
              </div>
            )}
            {route.transport.parking && (
              <div className="flex items-center gap-2">
                <span className="waymark" style={{ background: "#83907f" }}>PARK</span>
                <span>
                  {route.transport.parking.available ? "有停车场" : "停车位紧张"}
                  {route.transport.parking.note ? ` · ${route.transport.parking.note}` : ""}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {route.transport.access.map((a) => (
                <span key={a} className="chip !cursor-default !py-1 text-[11px]">
                  {{ METRO: "🚇 地铁", BUS: "🚌 公交", CAR: "🚗 自驾", TAXI: "🚕 打车" }[a]}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 安全信息 (PRD §19) */}
      <section className="card mt-4 border-[color:var(--warn)]/50 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
          🛡️ 安全信息
          <span className="rounded-full bg-[#faf0d7] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--warn)]">
            出发前必读
          </span>
        </h2>
        <div className="grid gap-x-8 gap-y-3 text-[13.5px] sm:grid-cols-2">
          <Row k="紧急救援" v={<span className="font-num">{route.safety.emergency}</span>} />
          <Row k="补水点" v={route.safety.waterAvailable ? "沿线/起终点有补给" : "无可靠补给，请带足 1.5L+"} />
          <Row
            k="手机信号"
            v={{ good: "全程良好", fair: "部分路段弱", spotty: "多段无信号，提前下载离线地图" }[route.safety.mobileSignal]}
          />
          <Row k="夜爬" v={route.safety.nightHiking ? "可夜爬（仍建议结伴+头灯）" : "不建议夜间行走"} />
          <Row k="天气风险" v={route.safety.weatherRisk} />
          <Row k="野生动物" v={route.safety.wildlife} />
          <Row
            k="陡峭路段"
            v={
              route.safety.steepSections.length
                ? route.safety.steepSections
                    .slice(0, 4)
                    .map((s) => `K${s.fromKm}–K${s.toKm}（${s.note}）`)
                    .join("；")
                : "无显著陡坡"
            }
          />
          <Row k="下撤点" v={route.pois.filter((p) => p.kind === "exit").map((p) => p.name).join("、") || "见地图标记"} />
        </div>
      </section>
    </article>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[72px] shrink-0 text-[color:var(--ink-3)]">{k}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed">{v}</dd>
    </div>
  );
}
