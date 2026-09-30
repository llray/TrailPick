/**
 * TrailPick 核心类型定义
 * 对应 PRD §34 数据架构 / §20 路线状态 / §31 数据来源
 */

export type RouteStatus = "OPEN" | "CAUTION" | "PARTIALLY_CLOSED" | "CLOSED" | "UNKNOWN";

export type SourceType = "OFFICIAL" | "ADMIN" | "USER_UPLOAD" | "AUTHORIZED_PARTNER";

export type RouteType = "LOOP" | "TRAVERSE" | "OUT_AND_BACK";

export type ReviewStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "PUBLISHED";

export type UploadVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

export interface LatLng {
  lat: number;
  lng: number;
}

/** 轨迹点：[lng, lat, ele] —— GeoJSON 坐标顺序，ele 单位米 */
export type TrackPoint = [number, number, number];

export interface ElevationPoint {
  /** 距起点公里数 */
  d: number;
  /** 海拔米 */
  e: number;
}

export type POIKind =
  | "summit"
  | "start"
  | "end"
  | "exit"
  | "water"
  | "supply"
  | "toilet"
  | "metro"
  | "bus"
  | "sight";

export interface POI {
  name: string;
  kind: POIKind;
  lat: number;
  lng: number;
  note?: string;
}

export interface SafetyInfo {
  /** 紧急电话与救援信息 */
  emergency: string;
  /** 补水点是否可用 */
  waterAvailable: boolean;
  /** 手机信号 */
  mobileSignal: "good" | "fair" | "spotty";
  /** 天气风险提示 */
  weatherRisk: string;
  /** 是否适合夜爬 */
  nightHiking: boolean;
  /** 野生动物提示 */
  wildlife: string;
  /** 陡峭路段（由轨迹坡度自动分析 + 人工标注） */
  steepSections: { fromKm: number; toKm: number; note?: string }[];
}

export interface Transport {
  access: ("METRO" | "BUS" | "CAR" | "TAXI")[];
  nearestMetro?: { name: string; line: string; distanceKm: number };
  nearestBus?: { name: string; distanceKm: number };
  parking?: { available: boolean; note?: string };
}

export interface DifficultyDetail {
  distance: number;
  climb: number;
  gradient: number;
  surface: number;
  technical: number;
  exit: number;
  composite: number;
}

export interface RouteStats {
  views: number;
  favorites: number;
  vote_selected: number;
  completed: number;
}

export interface Route {
  id: string;
  slug: string;
  name_cn: string;
  name_en?: string;
  /** 所属目的地（如 梧桐山）—— Destination ≠ Route (PRD §70) */
  destination?: string;
  city: string;
  district: string;
  districts: string[];
  description: string;
  distance_km: number;
  estimated_duration_min: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  max_elevation_m: number;
  min_elevation_m: number;
  difficulty: number; // 1-5
  difficulty_detail?: DifficultyDetail;
  route_type: RouteType;
  start: LatLng;
  end: LatLng;
  /** 完整轨迹（约 80m 采样） */
  track: TrackPoint[];
  /** Douglas-Peucker 简化轨迹，用于地图渲染 (PRD §88) */
  track_simplified: [number, number][];
  elevation_profile: ElevationPoint[];
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
  tags: string[];
  surface_types: string[];
  status: RouteStatus;
  status_note?: string;
  source_type: SourceType;
  /** 来源显示名（如 深圳远足径） */
  source_name?: string;
  source_url?: string;
  source_license?: string;
  verified_at?: string;
  review_status?: ReviewStatus;
  visibility?: UploadVisibility;
  uploader_name?: string;
  transport: Transport;
  pois: POI[];
  safety: SafetyInfo;
  rating: number;
  stats: RouteStats;
  version: number;
  created_at: string;
  updated_at: string;
}

/** 列表/卡片使用，不含几何数据（PRD §87 首屏性能） */
export type RouteCardData = Omit<
  Route,
  "track" | "track_simplified" | "elevation_profile"
>;

export interface Ballot {
  voterName: string;
  browserId: string;
  routeIds: string[];
  at: string;
}

export interface VoteDecision {
  routeId: string;
  method: "DICE_TIE" | "DICE_FORCE";
  candidates: string[];
  by: string;
  at: string;
}

export interface VoteRoom {
  id: string;
  title: string;
  routeIds: string[];
  multipleChoice: boolean;
  showLive: boolean;
  /** ISO 时间或 null（不限） */
  deadline: string | null;
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  ballots: Ballot[];
  decision: VoteDecision | null;
}

export interface VoteResults {
  counts: { routeId: string; count: number }[];
  totalBallots: number;
  voters: { name: string; at: string; count: number }[];
  leaders: string[];
  isTie: boolean;
  revealed: boolean;
  expired: boolean;
}

export interface RouteAlert {
  id: string;
  routeId: string;
  type: string;
  severity: "info" | "warning" | "danger";
  message: string;
  start_time?: string;
  end_time?: string;
  source: string;
  verified: boolean;
  createdAt: string;
}

/** 随机选择结果 (PRD §25-27) */
export interface RandomResult {
  picked: RouteCardData;
  scores: {
    match: number;
    rating: number;
    popularity: number;
    freshness: number;
    total: number;
  };
  candidateCount: number;
  topCandidates: { slug: string; name: string; score: number }[];
}
