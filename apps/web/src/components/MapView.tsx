"use client";

/**
 * 地图组件 (PRD §40/§88)
 * 底图：Esri 免 key 瓦片（地形/街道/卫星可切换）。
 * 坐标系：Esri 中国的街道/地形底图按国内法规为 GCJ-02，卫星影像为 WGS84。
 * 因此轨迹/POI 在 地形/街道 图层渲染前做 WGS84→GCJ-02 转换（coordinate.ts），
 * 卫星图层用 WGS84 原样渲染，切换图层时自动重绘对齐。
 */
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { difficultyColor } from "@/lib/format";
import { wgs84ToGcj02 } from "@/lib/coordinate";

export interface MapRoute {
  id: string;
  slug?: string;
  name: string;
  difficulty: number;
  status?: string;
  /** [lng, lat][] */
  coords: [number, number][];
}

export interface MapMarker {
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
}

interface Props {
  routes: MapRoute[];
  markers?: MapMarker[];
  activeId?: string | null;
  onRouteClick?: (id: string) => void;
  className?: string;
  fitPadding?: number;
}

export default function MapView({ routes, markers = [], activeId, onRouteClick, className = "", fitPadding = 20 }: Props) {
  const mapId = useMemo(() => "tpmap_" + Math.random().toString(36).slice(2), []);

  useEffect(() => {
    const el = document.getElementById(mapId);
    if (!el) return;
    const map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // 免 key 底图（Esri ArcGIS Online，中国大陆可直连）：地形 / 街道 / 卫星
    // 备选：CARTO Voyager 已于 2025 起强制 API key（水印提示），如需可在 URL 加 ?key=xxx
    const baseLayers: Record<string, L.TileLayer> = {
      地形: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri &mdash; Source: USGS, Esri, TANA, Garmin", maxZoom: 19 }
      ),
      街道: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ", maxZoom: 19 }
      ),
      卫星: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
      ),
    };
    baseLayers["地形"].addTo(map);
    L.control.layers(baseLayers, undefined, { position: "topright" }).addTo(map);

    // 中国法规偏移：地形/街道底图为 GCJ-02，需要把 WGS84 轨迹转换后叠加
    const GCJ_LAYERS = new Set(["地形", "街道"]);
    let useGcj = GCJ_LAYERS.has("地形");

    const layer = L.layerGroup().addTo(map);
    const draw = (keepView = false) => {
      layer.clearLayers();
      const bounds = L.latLngBounds([]);
      let has = false;
      for (const r of routes) {
        const latlngs = r.coords.map(([lng, lat]) => {
          if (!useGcj) return [lat, lng] as [number, number];
          const [gLat, gLng] = wgs84ToGcj02(lat, lng);
          return [gLat, gLng] as [number, number];
        });
        if (latlngs.length < 2) continue;
        const isActive = activeId === r.id;
        const dimmed = activeId != null && !isActive;
        const closed = r.status === "CLOSED" || r.status === "PARTIALLY_CLOSED";
        const poly = L.polyline(latlngs, {
          color: closed ? "#9aa39b" : difficultyColor(r.difficulty),
          weight: isActive ? 5 : 3,
          opacity: dimmed ? 0.25 : 0.9,
          dashArray: closed ? "6 6" : undefined,
        });
        if (onRouteClick) {
          poly.on("click", () => onRouteClick(r.id));
          poly.bindTooltip(r.name, { sticky: true, direction: "top" });
        }
        poly.addTo(layer);
        if (!dimmed) {
          latlngs.forEach((ll) => bounds.extend(ll));
          has = true;
        }
      }
      for (const m of markers) {
        const icon = L.divIcon({
          className: "tp-marker",
          html: `<div class="tp-pin" style="background:${m.color ?? "var(--forest)"}"><span>${m.emoji}</span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
        const [pLat, pLng] = useGcj ? wgs84ToGcj02(m.lat, m.lng) : [m.lat, m.lng];
        const mk = L.marker([pLat, pLng], { icon }).addTo(layer);
        mk.bindPopup(`<b>${m.name}</b>`);
        bounds.extend([pLat, pLng]);
        has = true;
      }
      if (has && !keepView) map.fitBounds(bounds, { padding: [fitPadding, fitPadding] });
    };
    draw();
    // 切换底图时按新坐标重绘（保持当前视野）
    map.on("baselayerchange", (e) => {
      useGcj = GCJ_LAYERS.has(e.name);
      draw(true);
    });
    // 容器尺寸变化时重绘
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, markers, activeId, mapId]);

  return <div id={mapId} className={`h-full w-full ${className}`} />;
}
