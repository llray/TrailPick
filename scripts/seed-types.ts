import type { POI, RouteStatus, SourceType, RouteType, Transport } from "../apps/web/src/lib/types";

export interface SeedRoute {
  slug: string;
  name_cn: string;
  name_en?: string;
  destination?: string;
  district: string;
  districts?: string[];
  desc: string;
  type: RouteType;
  /** Naismith 地形系数 1.0(绿道) - 1.35(野径) */
  terrain: number;
  surface: 0 | 1 | 2 | 3;
  surfaceTypes: string[];
  technical: 0 | 1 | 2 | 3;
  exit: 0 | 1 | 2 | 3;
  tags: string[];
  rating: number;
  /** [views, favorites, vote_selected, completed] */
  pop: [number, number, number, number];
  transport: Transport;
  extraPois?: POI[];
  safety: {
    signal: "good" | "fair" | "spotty";
    water: boolean;
    night: boolean;
    weatherRisk: string;
    wildlife: string;
  };
  source: SourceType;
  sourceName: string;
  status?: RouteStatus;
  statusNote?: string;
  difficultyOverride?: number;
  startName?: string;
  endName?: string;
  /** 控制点 [lat, lng, ele(m)] */
  ctrl: [number, number, number][];
}
