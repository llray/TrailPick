"use client";

/**
 * 地图组件 (PRD §40/§88)
 * MVP 使用 Leaflet + OSM/CARTO 瓦片（WGS84 直显，无偏移）。
 * 生产切换高德 JS API 时：track 先过 src/lib/coordinate 的 wgs84ToGcj02。
 */
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { difficultyColor } from "@/lib/format";

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

    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      const bounds = L.latLngBounds([]);
      let has = false;
      for (const r of routes) {
        const latlngs = r.coords.map(([lng, lat]) => [lat, lng]) as [number, number][];
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
        const mk = L.marker([m.lat, m.lng], { icon }).addTo(layer);
        mk.bindPopup(`<b>${m.name}</b>`);
        bounds.extend([m.lat, m.lng]);
        has = true;
      }
      if (has) map.fitBounds(bounds, { padding: [fitPadding, fitPadding] });
    };
    draw();
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
