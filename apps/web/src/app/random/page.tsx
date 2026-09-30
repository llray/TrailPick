"use client";

/**
 * 🎲 Random Trail (PRD §25-27)
 * 条件 → 硬筛选 → 安全过滤 → 排除最近 → 加权随机 → ROLL 动画
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { RandomResult } from "@/lib/types";
import { formatKm, formatDuration } from "@/lib/format";
import { StatusBadge, DifficultyBadge } from "@/components/badges";
import { getRecent, withBase } from "@/lib/client";
import { DISTRICTS_ALL } from "@/components/FilterSheet";

const PRESETS = [
  { label: "🚶 轻松遛腿", distance: [0, 6], duration: [0, 2.5], difficulty: [1, 2] },
  { label: "🌿 周末经典", distance: [8, 14], duration: [3, 5], difficulty: [2, 3] },
  { label: "⛰️ 进阶拉练", distance: [12, 22], duration: [5, 9], difficulty: [3, 4] },
  { label: "🔥 全部随机", distance: null, duration: null, difficulty: null },
] as const;

function RandomInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const parseArr = (k: string): [number, number] | null => {
    const v = sp.get(k);
    if (!v) return null;
    const [a, b] = v.split(",").map(Number);
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
  };

  const [distance, setDistance] = useState<[number, number] | null>(parseArr("distance") ?? [5, 15]);
  const [duration, setDuration] = useState<[number, number] | null>(parseArr("duration") ?? [0, 6]);
  const [difficulty, setDifficulty] = useState<[number, number] | null>(parseArr("difficulty") ?? [1, 3]);
  const [elevationMax, setElevationMax] = useState<number | null>(null);
  const [districts, setDistricts] = useState<string[]>(sp.get("districts")?.split(",") ?? []);
  const [excludeRecent, setExcludeRecent] = useState(true);

  const [rolling, setRolling] = useState(false);
  const [rollName, setRollName] = useState("");
  const [result, setResult] = useState<RandomResult | null>(null);
  const [empty, setEmpty] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const body = useMemo(
    () => ({
      city: "shenzhen",
      distance: distance ?? undefined,
      difficulty: difficulty ?? undefined,
      durationMax: duration ? duration[1] * 60 : undefined,
      durationMin: duration ? duration[0] * 60 : undefined,
      elevationMax: elevationMax ?? undefined,
      districts: districts.length ? districts : undefined,
      excludeIds: excludeRecent ? [...getRecent()] : [],
    }),
    [distance, duration, difficulty, elevationMax, districts, excludeRecent]
  );

  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    setResult(null);
    setEmpty(false);
    try {
      const res = await fetch(withBase("/api/routes/random"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 404) {
        setEmpty(true);
        setRolling(false);
        return;
      }
      const data: RandomResult = await res.json();
      // 老虎机式名字滚动，最后落在结果上
      const names = data.topCandidates.map((c) => c.name);
      if (!names.includes(data.picked.name_cn)) names.push(data.picked.name_cn);
      let i = 0;
      const tick = () => {
        setRollName(names[i % names.length]);
        i++;
        if (i < names.length * 2 + 3) {
          timers.current.push(setTimeout(tick, 110 + i * 30));
        } else {
          setResult(data);
          setRolling(false);
        }
      };
      tick();
    } catch {
      setRolling(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <header className="fade-up text-center">
        <div className="label">Random Trail · 随机路线</div>
        <h1 className="mt-1 font-display text-[30px] font-extrabold sm:text-[38px]">
          不知道去哪<span className="text-[color:var(--blaze)]">？</span>
        </h1>
        <p className="mt-1 text-[14px] text-[color:var(--ink-2)]">
          设定条件，加权算法在合规候选中掷骰——关闭路线不会出现。
        </p>
      </header>

      {/* 条件区 */}
      <section className="card mt-6 space-y-5 p-5">
        <div>
          <div className="label mb-2">快速预设</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="chip"
                onClick={() => {
                  setDistance(p.distance ? ([...p.distance] as [number, number]) : null);
                  setDuration(p.duration ? ([...p.duration] as [number, number]) : null);
                  setDifficulty(p.difficulty ? ([...p.difficulty] as [number, number]) : null);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="label mb-2">
              距离：{distance ? `${distance[0]}–${distance[1]} km` : "不限"}
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={distance?.[0] ?? 0}
              onChange={(e) => setDistance((d) => [Number(e.target.value), Math.max(Number(e.target.value) + 1, d?.[1] ?? 10)])}
              className="w-full accent-[color:var(--forest)]"
            />
            <input
              type="range"
              min={2}
              max={30}
              step={2}
              value={distance?.[1] ?? 15}
              onChange={(e) => setDistance((d) => [Math.min(d?.[0] ?? 0, Number(e.target.value) - 1), Number(e.target.value)])}
              className="w-full accent-[color:var(--blaze)]"
            />
          </div>
          <div>
            <div className="label mb-2">
              时长：{duration ? (duration[1] >= 8 ? "8h+" : `${duration[0]}–${duration[1]} h`) : "不限"}
            </div>
            <div className="flex flex-wrap gap-2">
              {([[0, 2], [2, 4], [4, 6], [6, 8], [8, 24]] as [number, number][]).map(([a, b]) => (
                <button
                  key={a}
                  className={`chip ${duration?.[0] === a && duration?.[1] === b ? "chip-active" : ""}`}
                  onClick={() => setDuration(duration?.[0] === a && duration?.[1] === b ? null : [a, b])}
                >
                  {a === 0 ? `≤${b}h` : b >= 8 ? "8h+" : `${a}–${b}h`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2">难度：{difficulty ? `${"★".repeat(difficulty[0])}~${"★".repeat(difficulty[1])}` : "不限"}</div>
            <div className="flex flex-wrap gap-2">
              {([[1, 2], [2, 3], [3, 4], [4, 5]] as [number, number][]).map(([a, b]) => (
                <button
                  key={a}
                  className={`chip ${difficulty?.[0] === a && difficulty?.[1] === b ? "chip-active" : ""}`}
                  onClick={() => setDifficulty(difficulty?.[0] === a ? null : [a, b])}
                >
                  {"★".repeat(a)}
                  {b > a && <>~{"★".repeat(b)}</>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2">爬升上限：{elevationMax ? `${elevationMax} m` : "不限"}</div>
            <div className="flex flex-wrap gap-2">
              {[300, 600, 1000, 1500].map((v) => (
                <button
                  key={v}
                  className={`chip ${elevationMax === v ? "chip-active" : ""}`}
                  onClick={() => setElevationMax(elevationMax === v ? null : v)}
                >
                  &lt; {v}m
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="label mb-2">区域（可多选）</div>
          <div className="flex flex-wrap gap-2">
            {DISTRICTS_ALL.map((d) => (
              <button
                key={d}
                className={`chip ${districts.includes(d) ? "chip-active" : ""}`}
                onClick={() =>
                  setDistricts((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            checked={excludeRecent}
            onChange={(e) => setExcludeRecent(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--forest)]"
          />
          排除我最近走过的路线（本地记录，不上传）
        </label>
      </section>

      {/* ROLL */}
      <div className="mt-6 text-center">
        <button className="btn-primary !px-10 !py-4 !text-[17px]" onClick={roll} disabled={rolling}>
          {rolling ? (
            <>
              <span className="dice-rolling text-[20px]">🎲</span> 掷骰中…
            </>
          ) : (
            <>🎲 ROLL · 帮我选</>
          )}
        </button>
      </div>

      {/* 结果 */}
      {rolling && (
        <div className="card mt-6 p-8 text-center">
          <p className="font-num text-[22px] font-bold text-[color:var(--forest)]">{rollName}</p>
          <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">加权随机：匹配 45% · 评分 20% · 热度 15% · 新鲜度 20%</p>
        </div>
      )}

      {empty && (
        <div className="card mt-6 p-8 text-center">
          <p className="text-[28px]">🪹</p>
          <p className="mt-1 font-semibold">没有符合的路线</p>
          <p className="text-[13px] text-[color:var(--ink-3)]">放宽一点条件再掷一次</p>
        </div>
      )}

      {result && (
        <div className="card pop-in mt-6 overflow-hidden">
          <div className="bg-[color:var(--forest)] px-5 py-3 text-[13px] font-semibold text-white">
            🎯 骰子决定了：
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-extrabold">{result.picked.name_cn}</h2>
                <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                  {result.picked.destination ? `${result.picked.destination} · ` : ""}
                  {result.picked.district} · 从 {result.candidateCount} 条候选中选出
                </p>
              </div>
              <DifficultyBadge level={result.picked.difficulty} size="lg" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-num text-[14px] text-[color:var(--ink-2)]">
              <span>{formatKm(result.picked.distance_km)}</span>
              <span>⏱ {formatDuration(result.picked.estimated_duration_min)}</span>
              <span>↑ {result.picked.elevation_gain_m}m</span>
              <StatusBadge status={result.picked.status} note={result.picked.status_note} />
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[color:var(--ink-2)]">{result.picked.description}</p>
            <div className="mt-4 font-num text-[11.5px] text-[color:var(--ink-3)]">
              match {result.scores.match} · rating {result.scores.rating} · popularity {result.scores.popularity} · freshness {result.scores.freshness}
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link href={`/route/${result.picked.slug}`} className="btn-forest">
                查看路线详情
              </Link>
              <button className="btn-ghost" onClick={roll}>
                🎲 换一条
              </button>
              <button
                className="btn-ghost"
                onClick={() => router.push(`/vote/create?route=${result.picked.id}`)}
              >
                👥 拉人投票
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RandomPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[color:var(--ink-3)]">加载中…</div>}>
      <RandomInner />
    </Suspense>
  );
}
