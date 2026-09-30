import { STATUS_META, difficultyLabel, difficultyColor } from "@/lib/format";

export function StatusBadge({ status, note, size = "sm" }: { status: string; note?: string; size?: "sm" | "lg" }) {
  const meta = STATUS_META[status] ?? STATUS_META.UNKNOWN;
  return (
    <span
      title={note}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === "lg" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ color: meta.color, background: meta.bg }}
    >
      <span>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

export function DifficultyBadge({ level, showLabel = true, size = "md" }: { level: number; showLabel?: boolean; size?: "sm" | "md" | "lg" }) {
  const color = difficultyColor(level);
  const px = size === "lg" ? "text-[15px]" : size === "sm" ? "text-[11px]" : "text-[12px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-bold text-white ${px} ${size === "lg" ? "px-2.5 py-1" : "px-1.5 py-0.5"}`}
      style={{ background: color }}
      title={`难度 ${level} · ${difficultyLabel(level)}`}
    >
      <span className="font-num">{"★".repeat(level)}</span>
      {showLabel && <span className="font-sans">{difficultyLabel(level)}</span>}
    </span>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return (
    <span className="rounded-full bg-[color:var(--forest-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--forest)]">
      {tag}
    </span>
  );
}
