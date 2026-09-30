"use client";

/**
 * 海拔剖面图 (PRD §17)：SVG 面积图 + hover 显示 KM/海拔
 */
import { useMemo, useRef, useState } from "react";
import type { ElevationPoint } from "@/lib/types";

interface Props {
  profile: ElevationPoint[];
  height?: number;
  gain?: number;
  loss?: number;
}

export function ElevationChart({ profile, height = 180, gain, loss }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; d: number; e: number } | null>(null);

  const geo = useMemo(() => {
    if (profile.length < 2) return null;
    const W = 800;
    const H = height;
    const padB = 22;
    const padT = 10;
    const maxD = profile[profile.length - 1].d;
    const minE = Math.min(...profile.map((p) => p.e));
    const maxE = Math.max(...profile.map((p) => p.e));
    const spanE = Math.max(50, maxE - minE);
    const lo = Math.max(0, Math.floor((minE - spanE * 0.12) / 50) * 50);
    const hi = Math.ceil((maxE + spanE * 0.1) / 50) * 50;
    const x = (d: number) => (d / maxD) * W;
    const y = (e: number) => padT + (1 - (e - lo) / (hi - lo)) * (H - padB - padT);
    const line = profile.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`).join("");
    const area = `${line}L${W},${H - padB}L0,${H - padB}Z`;
    return { W, H, padB, x, y, line, area, maxD, lo, hi };
  }, [profile, height]);

  if (!geo) return null;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (e.clientX - rect.left) / rect.width;
    const d = Math.max(0, Math.min(1, rel)) * geo.maxD;
    // 找最近采样点
    let best = profile[0];
    for (const p of profile) {
      if (Math.abs(p.d - d) < Math.abs(best.d - d)) best = p;
    }
    setHover({ x: (best.d / geo.maxD) * rect.width, d: best.d, e: best.e });
  };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        className="w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c6a4d" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2c6a4d" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[geo.lo, (geo.lo + geo.hi) / 2, geo.hi].map((e, i) => (
          <g key={i}>
            <line x1="0" x2={geo.W} y1={geo.y(e)} y2={geo.y(e)} stroke="#ddd6c2" strokeWidth="1" strokeDasharray="4 4" />
            <text x="4" y={geo.y(e) - 4} fontSize="10" fill="#83907f" className="font-num">
              {Math.round(e)}m
            </text>
          </g>
        ))}
        <path d={geo.area} fill="url(#elevFill)" />
        <path d={geo.line} fill="none" stroke="#1e4d38" strokeWidth="2.5" strokeLinejoin="round" />
        <text x={geo.W} y={geo.H - 6} fontSize="10" fill="#83907f" textAnchor="end" className="font-num">
          {geo.maxD.toFixed(1)} km
        </text>
        {hover && (
          <g>
            <line
              x1={(hover.d / geo.maxD) * geo.W}
              x2={(hover.d / geo.maxD) * geo.W}
              y1="0"
              y2={geo.H - geo.padB}
              stroke="#e85d26"
              strokeWidth="1.5"
            />
            <circle
              cx={(hover.d / geo.maxD) * geo.W}
              cy={geo.y(hover.e)}
              r="4"
              fill="#e85d26"
              stroke="#fffdf6"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 font-num text-[12px] shadow-md"
          style={{ left: Math.min(Math.max(hover.x - 45, 0), 10000), transform: "translateX(0)" }}
        >
          <span className="text-[color:var(--ink-3)]">KM </span>
          {hover.d.toFixed(2)}
          <span className="ml-2 text-[color:var(--ink-3)]">海拔 </span>
          {Math.round(hover.e)}m
        </div>
      )}
      {(gain != null || loss != null) && (
        <div className="mt-1 flex gap-4 font-num text-[12px] text-[color:var(--ink-2)]">
          {gain != null && <span>↑ {gain}m</span>}
          {loss != null && <span>↓ {loss}m</span>}
        </div>
      )}
    </div>
  );
}
