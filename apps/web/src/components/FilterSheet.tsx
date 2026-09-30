"use client";

/**
 * 筛选面板 (PRD §9-15)：距离/时长/难度/爬升/区域/类型/交通
 * 移动端底部抽屉，桌面端居中弹层
 */
import { useEffect } from "react";

export interface FilterState {
  distance: [number, number] | null;
  duration: [number, number] | null; // 小时
  difficulty: [number, number] | null;
  elevation: [number, number] | null; // 爬升米
  districts: string[];
  tags: string[];
  transport: string[];
}

export const EMPTY_FILTERS: FilterState = {
  distance: null,
  duration: null,
  difficulty: null,
  elevation: null,
  districts: [],
  tags: [],
  transport: [],
};

const DISTANCE_OPTS: { label: string; value: [number, number] }[] = [
  { label: "< 5 km", value: [0, 5] },
  { label: "5–10 km", value: [5, 10] },
  { label: "10–15 km", value: [10, 15] },
  { label: "15–20 km", value: [15, 20] },
  { label: "20–30 km", value: [20, 30] },
  { label: "30 km+", value: [30, 100] },
];
const DURATION_OPTS: { label: string; value: [number, number] }[] = [
  { label: "≤ 2 h", value: [0, 2] },
  { label: "2–4 h", value: [2, 4] },
  { label: "4–6 h", value: [4, 6] },
  { label: "6–8 h", value: [6, 8] },
  { label: "8 h+", value: [8, 24] },
];
const ELEVATION_OPTS: { label: string; value: [number, number] }[] = [
  { label: "< 300 m", value: [0, 300] },
  { label: "300–600 m", value: [300, 600] },
  { label: "600–1000 m", value: [600, 1000] },
  { label: "1000 m+", value: [1000, 3000] },
];
const DIFFS = [1, 2, 3, 4, 5];
export const DISTRICTS_ALL = ["福田", "罗湖", "南山", "盐田", "宝安", "龙岗", "龙华", "坪山", "光明", "大鹏", "东部", "西部", "市中心", "大鹏半岛"];
const TAGS_ALL = ["山地", "滨海", "森林", "溪谷", "城市", "公园", "绿道", "穿越", "环线", "往返", "亲子", "摄影", "日落", "看海", "瀑布", "登顶", "拉练", "官方径", "人文", "湖泊"];
const TRANSPORTS = [
  { key: "METRO", label: "🚇 地铁可达" },
  { key: "BUS", label: "🚌 公交可达" },
  { key: "CAR", label: "🚗 自驾推荐" },
  { key: "TAXI", label: "🚕 可打车" },
];

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.distance) n++;
  if (f.duration) n++;
  if (f.difficulty) n++;
  if (f.elevation) n++;
  n += f.districts.length + f.tags.length + f.transport.length;
  return n;
}

export function filterToQuery(f: FilterState, q: string, sort: string): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  p.set("city", "shenzhen");
  if (f.distance) {
    p.set("distanceMin", String(f.distance[0]));
    p.set("distanceMax", String(f.distance[1]));
  }
  if (f.duration) {
    p.set("durationMin", String(f.duration[0] * 60));
    p.set("durationMax", String(f.duration[1] * 60));
  }
  if (f.difficulty) {
    p.set("difficultyMin", String(f.difficulty[0]));
    p.set("difficultyMax", String(f.difficulty[1]));
  }
  if (f.elevation) {
    p.set("elevationMin", String(f.elevation[0]));
    p.set("elevationMax", String(f.elevation[1]));
  }
  if (f.districts.length) p.set("districts", f.districts.join(","));
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.transport.length) p.set("transport", f.transport.join(","));
  if (sort && sort !== "recommend") p.set("sort", sort);
  return p.toString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function RangeChips({
  opts,
  value,
  onChange,
}: {
  opts: { label: string; value: [number, number] }[];
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  return (
    <>
      {opts.map((o) => {
        const active = value && value[0] === o.value[0] && value[1] === o.value[1];
        return (
          <button
            key={o.label}
            className={`chip ${active ? "chip-active" : ""}`}
            onClick={() => onChange(active ? null : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </>
  );
}

export function FilterSheet({
  open,
  filters,
  onChange,
  onClose,
}: {
  open: boolean;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[color:var(--ink)]/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="pop-in relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-[color:var(--paper)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
          <h2 className="text-[16px] font-bold">筛选路线</h2>
          <button
            className="text-[13px] font-medium text-[color:var(--ink-3)] hover:text-[color:var(--blaze)]"
            onClick={() => onChange({ ...EMPTY_FILTERS })}
          >
            重置
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <Section title="距离">
            <RangeChips opts={DISTANCE_OPTS} value={filters.distance} onChange={(v) => set({ distance: v })} />
          </Section>
          <Section title="时长">
            <RangeChips opts={DURATION_OPTS} value={filters.duration} onChange={(v) => set({ duration: v })} />
          </Section>
          <Section title="难度">
            {DIFFS.map((d) => {
              const active = filters.difficulty?.[0] === d && filters.difficulty?.[1] === d;
              return (
                <button
                  key={d}
                  className={`chip ${active ? "chip-active" : ""}`}
                  onClick={() => set({ difficulty: active ? null : [d, d] })}
                >
                  {"★".repeat(d)}
                </button>
              );
            })}
            <button
              className={`chip ${filters.difficulty && filters.difficulty[1] - filters.difficulty[0] > 0 ? "chip-active" : ""}`}
              onClick={() => set({ difficulty: [1, 3] })}
            >
              ★~★★★ 轻松到中等
            </button>
          </Section>
          <Section title="累计爬升">
            <RangeChips opts={ELEVATION_OPTS} value={filters.elevation} onChange={(v) => set({ elevation: v })} />
          </Section>
          <Section title="区域">
            {DISTRICTS_ALL.map((d) => {
              const active = filters.districts.includes(d);
              return (
                <button
                  key={d}
                  className={`chip ${active ? "chip-active" : ""}`}
                  onClick={() =>
                    set({
                      districts: active ? filters.districts.filter((x) => x !== d) : [...filters.districts, d],
                    })
                  }
                >
                  {d}
                </button>
              );
            })}
          </Section>
          <Section title="路线类型">
            {TAGS_ALL.map((t) => {
              const active = filters.tags.includes(t);
              return (
                <button
                  key={t}
                  className={`chip ${active ? "chip-active" : ""}`}
                  onClick={() => set({ tags: active ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })}
                >
                  {t}
                </button>
              );
            })}
          </Section>
          <Section title="交通">
            {TRANSPORTS.map((t) => {
              const active = filters.transport.includes(t.key);
              return (
                <button
                  key={t.key}
                  className={`chip ${active ? "chip-active" : ""}`}
                  onClick={() =>
                    set({
                      transport: active
                        ? filters.transport.filter((x) => x !== t.key)
                        : [...filters.transport, t.key],
                    })
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </Section>
        </div>
        <div className="border-t border-[color:var(--line)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button className="btn-forest w-full" onClick={onClose}>
            查看
          </button>
        </div>
      </div>
    </div>
  );
}
