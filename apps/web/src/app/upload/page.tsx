"use client";

/**
 * GPX 上传 (PRD §28-30, §74)：解析 → 预览 → 私有默认 → 待审核
 */
import { useState } from "react";
import Link from "next/link";
import { getGuestName, withBase } from "@/lib/client";
import { formatKm, formatDuration } from "@/lib/format";

interface UploadResult {
  ok: boolean;
  slug: string;
  computed: {
    distance_km: number;
    elevation_gain_m: number;
    elevation_loss_m: number;
    duration_min: number;
    max_ele: number;
    points: number;
  };
  reviewStatus: string;
  visibility: string;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [uploader, setUploader] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  const initUploader = () => setUploader((u) => u || getGuestName());
  void initUploader;

  const submit = async () => {
    setError("");
    if (!file) return setError("请选择 .gpx 文件");
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch(withBase("/api/upload"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpx: text,
          name: name || file.name.replace(/\.gpx$/i, ""),
          description,
          visibility,
          uploaderName: uploader || "匿名",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "上传失败");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-lg pop-in text-center">
        <div className="text-[44px]">✅</div>
        <h1 className="mt-2 font-display text-[24px] font-extrabold">上传成功，已进入审核</h1>
        <div className="card mt-5 p-5 text-left">
          <div className="label mb-2">自动计算结果</div>
          <div className="font-num grid grid-cols-2 gap-2 text-[14px]">
            <span>距离 {formatKm(result.computed.distance_km)}</span>
            <span>爬升 ↑{result.computed.elevation_gain_m}m</span>
            <span>下降 ↓{result.computed.elevation_loss_m}m</span>
            <span>时长 {formatDuration(result.computed.duration_min)}</span>
            <span>最高 {result.computed.max_ele}m</span>
            <span>轨迹点 {result.computed.points}</span>
          </div>
          <div className="mt-3 rounded-xl bg-[color:var(--forest-soft)] p-3 text-[12px] leading-relaxed text-[color:var(--forest)]">
            隐私状态：{result.visibility === "PRIVATE" ? "私有（仅自己可见）" : result.visibility}
            <br />
            审核状态：待管理员审核（DRAFT → PENDING_REVIEW → PUBLISHED）
          </div>
        </div>
        <div className="mt-5 flex justify-center gap-2.5">
          <Link href="/admin" className="btn-forest">
            前往审核发布
          </Link>
          <button className="btn-ghost" onClick={() => { setResult(null); setFile(null); }}>
            再传一条
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="fade-up">
        <div className="label">Upload GPX · 上传路线</div>
        <h1 className="mt-1 font-display text-[28px] font-extrabold sm:text-[34px]">分享你走过的线</h1>
        <p className="mt-1 text-[14px] text-[color:var(--ink-2)]">
          支持 .gpx 文件，系统自动计算距离 / 爬升 / 时长。默认私有，审核通过后才会公开。
        </p>
      </header>

      <div className="card mt-6 space-y-5 p-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--line-2)] px-6 py-10 text-center transition-colors hover:border-[color:var(--forest-2)]">
          <span className="text-[34px]">📥</span>
          <input type="file" accept=".gpx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <>
              <span className="text-[15px] font-semibold">{file.name}</span>
              <span className="font-num text-[12px] text-[color:var(--ink-3)]">{(file.size / 1024).toFixed(0)} KB</span>
            </>
          ) : (
            <>
              <span className="text-[15px] font-semibold">点击选择 GPX 文件</span>
              <span className="text-[12px] text-[color:var(--ink-3)]">解析 trk / trkseg / trkpt（lat lon ele time）</span>
            </>
          )}
        </label>

        <div>
          <div className="label mb-1.5">路线名称</div>
          <input className="input w-full" placeholder="不填则使用文件内名称" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <div className="label mb-1.5">描述</div>
          <textarea className="input min-h-[80px] w-full" placeholder="路况、风景、注意事项…" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </div>
        <div>
          <div className="label mb-1.5">可见性（默认私有）</div>
          <div className="flex gap-2">
            {[
              { v: "PRIVATE", l: "🔒 私有" },
              { v: "UNLISTED", l: "🔗 链接可见" },
              { v: "PUBLIC", l: "🌍 公开" },
            ].map((o) => (
              <button key={o.v} className={"chip flex-1 justify-center " + (visibility === o.v ? "chip-active" : "")} onClick={() => setVisibility(o.v)}>
                {o.l}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
            GPX 包含精确位置信息。默认私有，公开前会经过人工审核。
          </p>
        </div>
        <div>
          <div className="label mb-1.5">上传者名字</div>
          <input className="input w-full" placeholder="如 Ray" value={uploader} onChange={(e) => setUploader(e.target.value)} maxLength={16} />
        </div>

        {error && <p className="rounded-xl bg-[#fbe3e3] px-3 py-2 text-[13px] text-[color:var(--danger)]">{error}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? "解析上传中…" : "📤 上传并解析"}
        </button>
      </div>
    </div>
  );
}
