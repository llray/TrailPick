import { getRouteById, toCard } from "./routes";
import type { RouteCardData } from "./types";

/** 投票房展示用的路线精简信息 */
export interface VoteRouteLite {
  id: string;
  slug: string;
  name_cn: string;
  destination?: string;
  district: string;
  distance_km: number;
  estimated_duration_min: number;
  elevation_gain_m: number;
  difficulty: number;
  status: string;
  image?: never;
}

export async function getRoutesLite(ids: string[]): Promise<VoteRouteLite[]> {
  return ids
    .map((id) => getRouteById(id))
    .filter(Boolean)
    .map((r) => {
      const card = toCard(r!);
      return {
        id: card.id,
        slug: card.slug,
        name_cn: card.name_cn,
        destination: card.destination,
        district: card.district,
        distance_km: card.distance_km,
        estimated_duration_min: card.estimated_duration_min,
        elevation_gain_m: card.elevation_gain_m,
        difficulty: card.difficulty,
        status: card.status,
      };
    });
}

export type { RouteCardData };
