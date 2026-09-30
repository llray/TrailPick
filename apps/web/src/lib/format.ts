/** 展示格式化工具 */

export function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function formatDurationRange(min: number): string {
  const lo = Math.max(15, Math.round((min * 0.85) / 15) * 15);
  const hi = Math.round((min * 1.2) / 15) * 15;
  return `${formatDuration(lo)} – ${formatDuration(hi)}`;
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function formatElev(m: number): string {
  return `${m.toLocaleString("zh-CN")} m`;
}

export const DIFFICULTY_LABELS = ["", "很容易", "容易", "中等", "困难", "挑战"] as const;

export const DIFFICULTY_COLORS = [
  "#8a9a8e",
  "#4f9d5d",
  "#2c8c99",
  "#e08f26",
  "#d95d39",
  "#b02e2e",
] as const;

export function difficultyLabel(level: number): string {
  return DIFFICULTY_LABELS[level] ?? "未知";
}

export function difficultyColor(level: number): string {
  return DIFFICULTY_COLORS[level] ?? DIFFICULTY_COLORS[0];
}

export const STATUS_META: Record<
  string,
  { label: string; emoji: string; color: string; bg: string }
> = {
  OPEN: { label: "正常开放", emoji: "🟢", color: "#2e7d43", bg: "#e5f3e8" },
  CAUTION: { label: "注意", emoji: "🟡", color: "#9a6b0a", bg: "#faf0d7" },
  PARTIALLY_CLOSED: { label: "部分关闭", emoji: "🟠", color: "#b45309", bg: "#fde8d8" },
  CLOSED: { label: "临时关闭", emoji: "🔴", color: "#b02e2e", bg: "#fbe3e3" },
  UNKNOWN: { label: "状态未知", emoji: "⚪", color: "#6b7280", bg: "#eef0f2" },
};

export const SOURCE_META: Record<string, string> = {
  OFFICIAL: "官方数据",
  ADMIN: "平台整理",
  USER_UPLOAD: "用户上传",
  AUTHORIZED_PARTNER: "授权合作",
};

export const ROUTE_TYPE_LABELS: Record<string, string> = {
  LOOP: "环线",
  TRAVERSE: "穿越",
  OUT_AND_BACK: "往返",
};

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}
