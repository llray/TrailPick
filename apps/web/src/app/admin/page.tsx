"use client";

/**
 * Admin CMS (PRD §58-59)：路线状态管理 / 用户上传审核 / 投票箱一览
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/client";
import { formatKm, STATUS_META } from "@/lib/format";
import { StatusBadge } from "@/components/badges";

interface AdminRoute {
  id: string;
  slug: string;
  name_cn: string;
  district: string;
  distance_km: number;
  difficulty: number;
  status: string;
  source_type: string;
  review_status?: string;
  uploader_name?: string;
  popularity: number;
}

interface VoteRow {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  deadline: string | null;
  closedAt: string | null;
  decision: { routeId: string } | null;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [routes, setRoutes] = useState<AdminRoute[] | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"routes" | "votes">("routes");
  const [saving, setSaving] = useState("");

  const login = async () => {
    setError("");
    try {
      await fetchJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setAuthed(true);
      loadData();
    } catch {
      setError("口令错误（开发默认 trailpick，可用 ADMIN_PASSWORD 环境变量覆盖）");
    }
  };

  const loadData = async () => {
    try {
      const d = await fetchJson<{ routes: AdminRoute[] }>("/api/admin/routes");
      setRoutes(d.routes);
      const v = await fetchJson<VoteRow[]>("/api/votes");
      setVotes(v);
    } catch {
      setError("加载失败");
    }
  };

  useEffect(() => {
    // 尝试用 cookie 静默登录
    fetchJson("/api/admin/routes")
      .then(() => {
        setAuthed(true);
        loadData();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="text-[40px]">🔐</div>
        <h1 className="mt-2 font-display text-[24px] font-extrabold">Admin 后台</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">路线状态 / 上传审核 / 投票管理</p>
        <div className="card mt-6 space-y-3 p-5 text-left">
          <input
            className="input w-full"
            type="password"
            placeholder="管理口令"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          {error && <p className="text-[12.5px] text-[color:var(--danger)]">{error}</p>}
          <button className="btn-forest w-full" onClick={login}>
            登录
          </button>
        </div>
      </div>
    );
  }

  const filtered = (routes ?? []).filter(
    (r) => !q.trim() || r.name_cn.includes(q.trim()) || r.district.includes(q.trim())
  );
  const pending = (routes ?? []).filter((r) => r.review_status === "PENDING_REVIEW");
  const stats = [
    { label: "路线总数", value: routes?.length ?? "…" },
    { label: "待审核", value: pending.length },
    { label: "投票箱", value: votes.length },
    { label: "进行中", value: votes.filter((v) => !v.closedAt && !v.decision).length },
  ];

  const setStatus = async (id: string, status: string) => {
    setSaving(id);
    try {
      await fetchJson("/api/admin/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", id, status }),
      });
      await loadData();
    } finally {
      setSaving("");
    }
  };

  const publish = async (id: string) => {
    setSaving(id);
    try {
      await fetchJson("/api/admin/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", id }),
      });
      await loadData();
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Admin CMS</div>
          <h1 className="mt-1 font-display text-[26px] font-extrabold">路线与社区管理</h1>
        </div>
        <div className="flex overflow-hidden rounded-full border border-[color:var(--line-2)] text-[13px]">
          {(["routes", "votes"] as const).map((t) => (
            <button
              key={t}
              className={"px-4 py-2 font-medium transition-colors " + (tab === t ? "bg-[color:var(--forest)] text-white" : "text-[color:var(--ink-2)]")}
              onClick={() => setTab(t)}
            >
              {t === "routes" ? "路线" : "投票箱"}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="label">{s.label}</div>
            <div className="stat-num mt-1 text-[22px]">{s.value}</div>
          </div>
        ))}
      </div>

      {tab === "routes" && (
        <>
          <input className="input mt-5 w-full sm:max-w-xs" placeholder="搜索路线 / 区域…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--card)]">
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-[color:var(--paper-2)] text-[11px] uppercase tracking-wider text-[color:var(--ink-3)]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">路线</th>
                    <th className="px-2 py-2.5 font-semibold">数据</th>
                    <th className="px-2 py-2.5 font-semibold">来源</th>
                    <th className="px-2 py-2.5 font-semibold">状态</th>
                    <th className="px-2 py-2.5 font-semibold">审核</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-[color:var(--line)]">
                      <td className="px-4 py-2.5">
                        <Link href={"/route/" + r.slug} className="font-semibold hover:text-[color:var(--forest)]">
                          {r.name_cn}
                        </Link>
                        <div className="text-[11px] text-[color:var(--ink-3)]">
                          {r.district} · 热度 {r.popularity}
                        </div>
                      </td>
                      <td className="font-num px-2 py-2.5 text-[12px] text-[color:var(--ink-2)]">
                        {formatKm(r.distance_km)} · ★{r.difficulty}
                      </td>
                      <td className="px-2 py-2.5 text-[11.5px]">
                        {r.source_type === "USER_UPLOAD" ? (
                          <span className="rounded bg-[color:var(--blaze-soft)] px-1.5 py-0.5 text-[color:var(--blaze-2)]">
                            用户 · {r.uploader_name}
                          </span>
                        ) : (
                          <span className="text-[color:var(--ink-3)]">{r.source_type}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <select
                          className="input !py-1 !px-1.5 text-[12px]"
                          value={r.status}
                          onChange={(e) => setStatus(r.id, e.target.value)}
                          disabled={saving === r.id}
                        >
                          {Object.entries(STATUS_META).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.emoji} {v.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2.5">
                        {r.review_status === "PENDING_REVIEW" ? (
                          <button className="btn-primary !px-3 !py-1.5 text-[12px]" onClick={() => publish(r.id)} disabled={saving === r.id}>
                            审核发布
                          </button>
                        ) : (
                          <StatusBadge status={r.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "votes" && (
        <div className="mt-5 space-y-2.5">
          {votes.length === 0 && <p className="card p-8 text-center text-[13px] text-[color:var(--ink-3)]">还没有投票箱</p>}
          {votes.map((v) => (
            <Link key={v.id} href={"/v/" + v.id} className="card card-hover flex items-center justify-between p-4">
              <div>
                <div className="text-[14.5px] font-bold">{v.title}</div>
                <div className="font-num mt-0.5 text-[11.5px] text-[color:var(--ink-3)]">
                  {v.id} · 发起 {v.createdBy} · {new Date(v.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="text-[12px]">
                {v.decision ? (
                  <span className="rounded-full bg-[color:var(--blaze-soft)] px-2.5 py-1 font-semibold text-[color:var(--blaze-2)]">已决定</span>
                ) : v.closedAt ? (
                  <span className="rounded-full bg-[color:var(--paper-2)] px-2.5 py-1 text-[color:var(--ink-3)]">已关闭</span>
                ) : (
                  <span className="rounded-full bg-[color:var(--forest-soft)] px-2.5 py-1 font-semibold text-[color:var(--forest)]">进行中</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
