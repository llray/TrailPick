"use client";

/**
 * 投票房 (PRD §22-24, §27)：Guest 身份 / 实时结果轮询 / 平局骰子
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { VoteRoom as Room, VoteResults } from "@/lib/types";
import type { VoteRouteLite } from "@/lib/vote-helpers";
import { formatKm, formatDuration, difficultyLabel } from "@/lib/format";
import { fetchJson, getBrowserId, getRoomName, setRoomName } from "@/lib/client";

interface Payload {
  room: Omit<Room, "ballots" | "routeIds">;
  closed: boolean;
  results: VoteResults;
  routes: VoteRouteLite[];
}

export function VoteRoom({ voteId }: { voteId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [rolling, setRolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<Payload>("/api/votes/" + voteId);
      setData(d);
    } catch {}
  }, [voteId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // MVP 实时：轮询（生产换 Supabase Realtime）
    return () => clearInterval(t);
  }, [load, voteId]);

  useEffect(() => {
    const saved = getRoomName(voteId);
    if (saved) {
      setName(saved);
      setJoined(true);
    }
  }, [voteId]);

  if (!data) {
    return <div className="py-20 text-center text-[color:var(--ink-3)]">投票箱打开中…</div>;
  }

  const { room, results, routes, closed } = data;
  const canVote = joined && !closed && !room.decision;
  const isCreator = joined && name.trim() === room.createdBy;
  const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const countOf = (id: string) => results.counts.find((c) => c.routeId === id)?.count ?? 0;
  const maxCount = Math.max(...results.counts.map((c) => c.count), 1);

  const submitVote = async () => {
    if (!selection.length) return setMsg("先选择路线");
    setSubmitting(true);
    setMsg("");
    try {
      await fetchJson("/api/votes/" + voteId + "/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterName: name.trim(), browserId: getBrowserId(), routeIds: selection }),
      });
      setRoomName(voteId, name.trim());
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "投票失败");
    } finally {
      setSubmitting(false);
    }
  };

  const rollDice = async (force: boolean) => {
    if (rolling) return;
    setRolling(true);
    try {
      await fetchJson("/api/votes/" + voteId + "/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: name.trim() || room.createdBy, force }),
      });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "骰子失败了");
    } finally {
      setRolling(false);
    }
  };

  const closeNow = async () => {
    try {
      await fetchJson("/api/votes/" + voteId + "/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: name.trim() }),
      });
      await load();
    } catch {}
  };

  const shareText =
    "🥾 " + room.title + "\n" + routes.length + " 条路线等你投票，点击选择：\n" +
    (typeof window !== "undefined" ? window.location.href : "/v/" + voteId);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="fade-up text-center">
        <div className="label">Vote Room · {closed || room.decision ? "已结束" : "投票进行中"}</div>
        <h1 className="mt-1 font-display text-[26px] font-extrabold sm:text-[32px]">{room.title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-3 text-[12.5px] text-[color:var(--ink-3)]">
          <span>
            👥 <span className="font-num font-bold text-[color:var(--forest)]">{results.totalBallots}</span> 人已投
          </span>
          <span>发起人 {room.createdBy}</span>
          {room.deadline && !closed && (
            <span className="pulse-dot">
              ⏰ 截止{" "}
              {new Date(room.deadline).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </p>
      </header>

      {room.decision && (
        <div className="card pop-in mt-5 border-[color:var(--blaze)]/60 p-5 text-center">
          <div className="text-[13px] font-semibold text-[color:var(--blaze-2)]">
            {room.decision.method === "DICE_TIE" ? "🎲 平局，骰子决定" : "🎲 提前掷骰决定"}
          </div>
          <h2 className="mt-1.5 font-display text-[22px] font-extrabold text-[color:var(--forest)]">
            {routeById[room.decision.routeId]?.name_cn ?? "已决定"}
          </h2>
          <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">
            由 {room.decision.by} 于 {new Date(room.decision.at).toLocaleString("zh-CN")} 确定
          </p>
          {routeById[room.decision.routeId] && (
            <Link href={"/route/" + routeById[room.decision.routeId].slug} className="btn-forest mt-4">
              查看这条路线 →
            </Link>
          )}
        </div>
      )}

      {!joined && !room.decision && (
        <div className="card mt-5 p-5">
          <div className="label mb-1.5">输入昵称参与投票</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="你的名字，如 Ray / Stanley"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && setJoined(true)}
            />
            <button className="btn-forest shrink-0" disabled={!name.trim()} onClick={() => setJoined(true)}>
              进入投票箱
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-[color:var(--ink-3)]">无需注册，昵称保存在本机</p>
        </div>
      )}

      <section className="mt-5 space-y-2.5">
        {routes.map((r) => {
          const on = selection.includes(r.id);
          const isLeader = results.revealed && results.leaders.includes(r.id);
          const cnt = countOf(r.id);
          const pct = results.totalBallots ? Math.round((cnt / results.totalBallots) * 100) : 0;
          const isPicked = room.decision?.routeId === r.id;
          return (
            <div key={r.id} className={"card relative overflow-hidden p-4 " + (isPicked ? "border-[color:var(--blaze)]" : "")}>
              {results.revealed && (
                <div
                  className={
                    "absolute inset-y-0 left-0 transition-all duration-700 " +
                    (isLeader ? "bg-[color:var(--forest-soft)]" : "bg-[color:var(--paper-2)]")
                  }
                  style={{ width: (cnt / maxCount) * 100 + "%", zIndex: 0 }}
                />
              )}
              <div className="relative z-10 flex items-center gap-3">
                {canVote && (
                  <button
                    onClick={() =>
                      setSelection((s) =>
                        room.multipleChoice
                          ? on
                            ? s.filter((x) => x !== r.id)
                            : [...s, r.id]
                          : on
                            ? []
                            : [r.id]
                      )
                    }
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[12px] font-bold text-white transition-colors " +
                      (on
                        ? "border-[color:var(--forest)] bg-[color:var(--forest)]"
                        : "border-[color:var(--line-2)]") +
                      " " +
                      (room.multipleChoice ? "rounded-md" : "rounded-full")
                    }
                  >
                    {on && "✓"}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold">{r.name_cn}</span>
                    {isPicked && (
                      <span className="rounded bg-[color:var(--blaze)] px-1.5 py-0.5 text-[10px] font-bold text-white">最终</span>
                    )}
                    {isLeader && !room.decision && (
                      <span className="rounded bg-[color:var(--forest)] px-1.5 py-0.5 text-[10px] font-bold text-white">领先</span>
                    )}
                  </div>
                  <div className="font-num mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-[color:var(--ink-3)]">
                    <span>{formatKm(r.distance_km)}</span>
                    <span>{formatDuration(r.estimated_duration_min)}</span>
                    <span>↑{r.elevation_gain_m}m</span>
                    <span>
                      {"★".repeat(r.difficulty)} {difficultyLabel(r.difficulty)}
                    </span>
                  </div>
                </div>
                {results.revealed && (
                  <div className="text-right">
                    <div className="font-num text-[20px] font-bold leading-none">{cnt}</div>
                    <div className="text-[10.5px] text-[color:var(--ink-3)]">票 · {pct}%</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {canVote && (
        <div className="mt-5">
          <button className="btn-primary w-full !py-3.5" onClick={submitVote} disabled={submitting}>
            {submitting ? "提交中…" : "🗳️ 提交投票"}
          </button>
          {msg && <p className="mt-2 text-center text-[13px] text-[color:var(--danger)]">{msg}</p>}
          <p className="mt-2 text-center text-[11.5px] text-[color:var(--ink-3)]">
            {room.multipleChoice ? "可多选" : "单选"} · 提交后可修改（同一设备）
          </p>
        </div>
      )}
      {!canVote && joined && !room.decision && (
        <p className="mt-4 text-center text-[13px] text-[color:var(--ink-3)]">
          {closed ? "⏰ 投票已结束" : "正在查看投票箱"}
        </p>
      )}

      {results.revealed && results.isTie && !room.decision && (
        <div className="card mt-5 border-[color:var(--blaze)]/50 p-5 text-center">
          <p className="text-[15px] font-bold">
            🎲 平票了！{results.leaders.map((id) => routeById[id]?.name_cn).join(" vs ")}
          </p>
          <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">只在最高票路线中随机抽取（避免选到低票路线）</p>
          <button className="btn-primary mt-3" onClick={() => rollDice(false)} disabled={rolling}>
            {rolling ? "🎲 滚动中…" : "🎲 掷骰决定"}
          </button>
        </div>
      )}

      {isCreator && !room.decision && !closed && results.totalBallots > 0 && (
        <div className="mt-4 flex justify-center gap-2.5">
          <button className="btn-ghost !py-2 text-[13px]" onClick={() => rollDice(true)} disabled={rolling}>
            🎲 提前掷骰（在全部候选中随机）
          </button>
          <button className="btn-ghost !py-2 text-[13px]" onClick={closeNow}>
            结束投票
          </button>
        </div>
      )}

      {!room.decision && (
        <div className="mt-6 flex items-center justify-center gap-2.5 pb-4">
          <button
            className="btn-ghost !py-2 text-[13px]"
            onClick={async () => {
              await navigator.clipboard.writeText(shareText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "✅ 已复制" : "🔗 复制分享文案"}
          </button>
          <span className="text-[12px] text-[color:var(--ink-3)]">发到微信群，无需装 App</span>
        </div>
      )}

      {results.revealed && results.voters.length > 0 && (
        <div className="mt-2 pb-8 text-center">
          <div className="label mb-2">投票名单</div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {results.voters.map((v, i) => (
              <span key={i} className="rounded-full bg-[color:var(--paper-2)] px-2.5 py-1 text-[11.5px]">
                {v.name}
                {v.count > 1 && <span className="font-num text-[color:var(--ink-3)]"> ×{v.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
