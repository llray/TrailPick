"use client";

/**
 * 创建投票 (PRD §21/§47)：选路线 → 设置 → 生成分享链接
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { RouteCardData } from "@/lib/types";
import { fetchJson, popPendingVoteRoutes, getGuestName, setGuestName, BASE_PATH } from "@/lib/client";
import { formatKm, formatDuration } from "@/lib/format";
import { DifficultyBadge } from "@/components/badges";

const DEADLINE_OPTS = [
  { label: "不限时", value: 0 },
  { label: "今晚 22:00", value: -1 },
  { label: "明晚 22:00", value: -2 },
  { label: "3 天后", value: 4320 },
];

function deadlineToDate(value: number): number | null {
  if (value === 0) return null;
  if (value === -1 || value === -2) {
    const d = new Date();
    d.setDate(d.getDate() + (value === -1 ? 0 : 1));
    d.setHours(22, 0, 0, 0);
    return Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
  }
  return value;
}

function CreateInner() {
  const sp = useSearchParams();
  const [routes, setRoutes] = useState<RouteCardData[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("这周去哪徒步？");
  const [deadlineOpt, setDeadlineOpt] = useState(0);
  const [multipleChoice, setMultipleChoice] = useState(true);
  const [showLive, setShowLive] = useState(true);
  const [creator, setCreator] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ voteId: string; shareUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCreator(getGuestName());
    fetchJson<{ routes: RouteCardData[] }>("/api/routes?city=shenzhen")
      .then((d) => setRoutes(d.routes))
      .catch(() => setRoutes([]));
    // 从详情页 / Random 页带入
    const pre = sp.get("route");
    const pending = popPendingVoteRoutes();
    const ids = Array.from(new Set([...(pre ? [pre] : []), ...pending])).filter(Boolean);
    if (ids.length) setPicked(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!routes) return [];
    if (!q.trim()) return routes;
    const s = q.trim().toLowerCase();
    return routes.filter(
      (r) => r.name_cn.toLowerCase().includes(s) || (r.destination ?? "").includes(s) || r.district.includes(s)
    );
  }, [routes, q]);

  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 8 ? p : [...p, id]));
  };

  const create = async () => {
    setError("");
    if (!creator.trim()) return setError("请填写你的名字（发起人）");
    if (picked.length < 2) return setError("至少选择 2 条候选路线");
    setSubmitting(true);
    try {
      const res = await fetchJson<{ voteId: string; shareUrl: string }>("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          routes: picked,
          multipleChoice,
          showLive,
          deadlineMin: deadlineToDate(deadlineOpt),
          createdBy: creator.trim(),
        }),
      });
      setGuestName(creator.trim());
      setCreated(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    const fullUrl = `${window.location.origin}${BASE_PATH}${created.shareUrl}`;
    const shareText = `🥾 ${title}\n${picked.length} 条路线等你投票，点击选择：\n${fullUrl}`;
    return (
      <div className="mx-auto max-w-lg pop-in text-center">
        <div className="text-[44px]">🗳️</div>
        <h1 className="mt-2 font-display text-[24px] font-extrabold">投票箱已就绪</h1>
        <p className="mt-1 text-[14px] text-[color:var(--ink-2)]">
          把链接发到微信群，大家无需安装任何 App 即可投票
        </p>
        <div className="card mt-5 p-5 text-left">
          <div className="label mb-1.5">投票链接</div>
          <div className="flex gap-2">
            <input className="input font-num flex-1 !text-[13px]" readOnly value={fullUrl} onFocus={(e) => e.target.select()} />
            <button
              className="btn-primary shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(shareText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? "✅ 已复制" : "📋 复制分享文案"}
            </button>
          </div>
          <div className="mt-3 rounded-xl bg-[color:var(--forest-soft)] p-3 text-[13px] leading-relaxed text-[color:var(--forest)]">
            微信分享预览：<br />
            <span className="font-semibold">🥾 {title}</span>
            <br />
            {picked.length} 条路线等你投票，点击选择
          </div>
        </div>
        <div className="mt-5 flex justify-center gap-2.5">
          <Link href={created.shareUrl} className="btn-forest">
            打开投票箱 →
          </Link>
          <button className="btn-ghost" onClick={() => setCreated(null)}>
            再建一个
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="fade-up">
        <div className="label">Create Vote · 发起投票</div>
        <h1 className="mt-1 font-display text-[28px] font-extrabold sm:text-[34px]">周六去哪？让大家都说话</h1>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* 选路线 */}
        <section className="card flex max-h-[560px] flex-col overflow-hidden">
          <div className="border-b border-[color:var(--line)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold">
                选择候选路线{" "}
                <span className={`ml-1 font-num ${picked.length >= 2 ? "text-[color:var(--forest)]" : "text-[color:var(--blaze)]"}`}>
                  {picked.length}/8
                </span>
              </h2>
              {picked.length > 0 && (
                <button className="text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--blaze)]" onClick={() => setPicked([])}>
                  清空
                </button>
              )}
            </div>
            <input className="input mt-3 w-full" placeholder="搜索路线…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {routes === null && <div className="p-6 text-center text-[13px] text-[color:var(--ink-3)]">加载中…</div>}
            {filtered.map((r) => {
              const on = picked.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    on ? "border-[color:var(--forest)] bg-[color:var(--forest-soft)]" : "border-[color:var(--line)] hover:border-[color:var(--line-2)]"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-bold text-white ${
                      on ? "border-[color:var(--forest)] bg-[color:var(--forest)]" : "border-[color:var(--line-2)]"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{r.name_cn}</span>
                    <span className="font-num block text-[11px] text-[color:var(--ink-3)]">
                      {formatKm(r.distance_km)} · {formatDuration(r.estimated_duration_min)} · ↑{r.elevation_gain_m}m
                    </span>
                  </span>
                  <DifficultyBadge level={r.difficulty} showLabel={false} size="sm" />
                </button>
              );
            })}
          </div>
        </section>

        {/* 设置 */}
        <section className="card h-fit space-y-5 p-5">
          <div>
            <div className="label mb-1.5">投票标题</div>
            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </div>
          <div>
            <div className="label mb-1.5">截止时间</div>
            <div className="flex flex-wrap gap-2">
              {DEADLINE_OPTS.map((o) => (
                <button
                  key={o.label}
                  className={`chip ${deadlineOpt === o.value ? "chip-active" : ""}`}
                  onClick={() => setDeadlineOpt(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1.5">投票方式</div>
            <div className="flex gap-2">
              <button className={`chip flex-1 justify-center ${!multipleChoice ? "chip-active" : ""}`} onClick={() => setMultipleChoice(false)}>
                单选
              </button>
              <button className={`chip flex-1 justify-center ${multipleChoice ? "chip-active" : ""}`} onClick={() => setMultipleChoice(true)}>
                多选
              </button>
            </div>
          </div>
          <div>
            <div className="label mb-1.5">结果可见性</div>
            <div className="flex gap-2">
              <button className={`chip flex-1 justify-center ${showLive ? "chip-active" : ""}`} onClick={() => setShowLive(true)}>
                实时显示
              </button>
              <button className={`chip flex-1 justify-center ${!showLive ? "chip-active" : ""}`} onClick={() => setShowLive(false)}>
                截止后显示
              </button>
            </div>
          </div>
          <div>
            <div className="label mb-1.5">你的名字（发起人）</div>
            <input className="input w-full" placeholder="如 Ray" value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={16} />
          </div>

          {error && <p className="rounded-xl bg-[#fbe3e3] px-3 py-2 text-[13px] text-[color:var(--danger)]">{error}</p>}

          <button className="btn-primary w-full" onClick={create} disabled={submitting}>
            {submitting ? "创建中…" : "🗳️ 创建投票并生成链接"}
          </button>
          <p className="text-center text-[11px] leading-relaxed text-[color:var(--ink-3)]">
            无需注册 · 微信内可直接打开投票 · 平票时可用骰子决定
          </p>
        </section>
      </div>
    </div>
  );
}

export default function CreateVotePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[color:var(--ink-3)]">加载中…</div>}>
      <CreateInner />
    </Suspense>
  );
}
