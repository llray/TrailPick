"use client";

/**
 * 天气 + 动态预警卡片（PRD §19/§61）
 * 挂载时请求 /api/weather?slug=，失败静默隐藏（不阻塞详情页）
 */
import { useEffect, useState } from "react";
import type { RouteAlert, WeatherPayload } from "@/lib/types";
import { withBase } from "@/lib/client";

const SEV_META: Record<RouteAlert["severity"], { icon: string; cls: string; label: string }> = {
  danger: { icon: "⛔", cls: "border-[#c0392b]/60 bg-[#c0392b]/10 text-[#8e2418]", label: "危险" },
  warning: { icon: "⚠️", cls: "border-[#e67e22]/60 bg-[#e67e22]/10 text-[#9a5312]", label: "警告" },
  caution: { icon: "🟡", cls: "border-[#d4a017]/60 bg-[#faf0d7] text-[#7a5c10]", label: "注意" },
  info: { icon: "ℹ️", cls: "border-[#1f7a8c]/40 bg-[#1f7a8c]/10 text-[#155e6e]", label: "提示" },
};

function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00");
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return dt.getMonth() + 1 + "/" + dt.getDate() + " " + weekdays[dt.getDay()];
}

export default function WeatherCard({ slug }: { slug: string }) {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retried = false;
    const load = () =>
      fetch(withBase("/api/weather?slug=" + encodeURIComponent(slug)))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          // 502 多为上游冷启动/限流，延迟 2.5s 重试一次
          if (!cancelled && !retried) {
            retried = true;
            setTimeout(() => {
              if (!cancelled) load();
            }, 2500);
            return;
          }
          if (!cancelled) setFailed(true);
        });
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed || !data) return null;
  const hasAlerts = data.alerts.length > 0;

  return (
    <section className="mt-4 space-y-2">
      {hasAlerts &&
        data.alerts.map((a, i) => {
          const m = SEV_META[a.severity];
          return (
            <div key={i} className={"flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed " + m.cls}>
              <span className="shrink-0">{m.icon}</span>
              <span className="flex-1">
                {a.message}
                <span className="ml-1.5 text-[11px] opacity-70">
                  [{a.source}
                  {a.end_time ? " · 至 " + new Date(a.end_time).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : ""}]
                </span>
              </span>
            </div>
          );
        })}

      <div className="card flex items-stretch gap-3 px-4 py-3">
        {data.current && (
          <div className="flex min-w-[86px] flex-col justify-center border-r border-[color:var(--line)] pr-3">
            <div className="label">当前实况</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[22px] leading-none">{data.current.emoji}</span>
              <span className="font-num text-[20px] font-bold">{data.current.temp}°</span>
            </div>
            <div className="mt-0.5 text-[11px] text-[color:var(--ink-3)]">{data.current.desc}</div>
          </div>
        )}
        {data.daily.map((d, i) => (
          <div key={d.date} className="flex flex-1 items-center gap-2.5">
            <div className="flex flex-col">
              <div className="label">{i === 0 ? "今天" : "明天"} · {fmtDate(d.date)}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[18px] leading-none">{d.emoji}</span>
                <span className="font-num text-[13.5px] font-semibold">{d.tMin}~{d.tMax}°C</span>
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--ink-3)]">
                {d.desc} · 降水 {d.precipProb}%
                {d.windMax >= 30 ? " · 风 " + d.windMax + "km/h" : ""}
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-col justify-end text-right text-[10px] leading-tight text-[color:var(--ink-3)]">
          <span>山径徒步指数仅供</span>
          <span>参考 · 以深圳气象</span>
          <span>台官方预报为准</span>
        </div>
      </div>
    </section>
  );
}
