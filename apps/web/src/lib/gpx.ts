/**
 * GPX 解析与导出 (PRD §28-30)
 * MVP 优先 GPX；解析 trk > trkseg > trkpt 的 lat/lon/ele/time
 */
import type { TrackPoint } from "./types";

export interface GpxPoint {
  lat: number;
  lng: number;
  ele: number | null;
  time: string | null;
}

export interface GpxParsed {
  name: string | null;
  points: GpxPoint[];
}

/** 轻量 GPX 解析（正则流式提取 trkpt，避免重量级 XML 依赖） */
export function parseGpx(xml: string): GpxParsed {
  const points: GpxPoint[] = [];
  const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
  const trkptRe = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  // 兼容自闭合 <trkpt lat=".." lon=".."/>
  const selfClosingRe = /<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(xml))) {
    const inner = m[3];
    const ele = inner.match(/<ele>([^<]+)<\/ele>/);
    const time = inner.match(/<time>([^<]+)<\/time>/);
    points.push({
      lat: parseFloat(m[1]),
      lng: parseFloat(m[2]),
      ele: ele ? parseFloat(ele[1]) : null,
      time: time ? time[1] : null,
    });
  }
  if (points.length === 0) {
    while ((m = selfClosingRe.exec(xml))) {
      points.push({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), ele: null, time: null });
    }
  }
  if (points.length < 2) throw new Error("GPX_NO_TRACKPOINTS");
  return { name: nameMatch ? nameMatch[1].trim() : null, points };
}

/** 解析结果 → TrailPoint 轨迹（缺失海拔用 0 填充再由调用方决定是否插值） */
export function gpxToTrack(parsed: GpxParsed): TrackPoint[] {
  return parsed.points.map((p) => [p.lng, p.lat, p.ele ?? 0] as TrackPoint);
}

/** 导出路线为 GPX 1.1 字符串 */
export function trackToGpx(
  name: string,
  description: string,
  track: TrackPoint[]
): string {
  const pts = track
    .map(
      ([lng, lat, ele]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${Math.round(ele)}</ele></trkpt>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailPick" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name><desc>${escapeXml(description)}</desc></metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c
  );
}
