"use client";

/** 浏览器本地身份与偏好（PRD §23 Guest Name / §52-53 本地收藏与足迹） */

const K = {
  browserId: "tp_browser_id",
  name: "tp_guest_name",
  namePrefix: "tp_room_name_",
  recent: "tp_recent_routes",
  completed: "tp_completed_routes",
  favorites: "tp_favorites",
  pendingVote: "tp_pending_vote_routes",
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

function safeJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getBrowserId(): string {
  let id = safeGet(K.browserId);
  if (!id) {
    id = "b_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet(K.browserId, id);
  }
  return id;
}

export function getGuestName(): string {
  return safeGet(K.name) ?? "";
}

export function setGuestName(name: string) {
  safeSet(K.name, name);
}

export function getRoomName(roomId: string): string {
  return safeGet(K.namePrefix + roomId) ?? getGuestName();
}

export function setRoomName(roomId: string, name: string) {
  safeSet(K.namePrefix + roomId, name);
  setGuestName(name);
}

function pushToList(key: string, id: string, max = 30) {
  const list = safeJson<string[]>(key, []);
  const next = [id, ...list.filter((x) => x !== id)].slice(0, max);
  safeSet(key, JSON.stringify(next));
}

/** 最近走过（Random 排除用） */
export function markRecent(routeId: string) {
  pushToList(K.recent, routeId);
}

export function getRecent(): string[] {
  return safeJson<string[]>(K.recent, []);
}

export function markCompleted(routeId: string) {
  pushToList(K.completed, routeId);
  markRecent(routeId);
}

export function getCompleted(): string[] {
  return safeJson<string[]>(K.completed, []);
}

export function toggleFavorite(routeId: string): boolean {
  const list = safeJson<string[]>(K.favorites, []);
  const has = list.includes(routeId);
  const next = has ? list.filter((x) => x !== routeId) : [routeId, ...list];
  safeSet(K.favorites, JSON.stringify(next));
  return !has;
}

export function getFavorites(): string[] {
  return safeJson<string[]>(K.favorites, []);
}

/** 待加入投票的路线（从详情页“加入投票”跳转携带） */
export function setPendingVoteRoutes(ids: string[]) {
  safeSet(K.pendingVote, JSON.stringify(ids));
}

export function popPendingVoteRoutes(): string[] {
  const ids = safeJson<string[]>(K.pendingVote, []);
  safeSet(K.pendingVote, "[]");
  return ids;
}

/** 部署子路径（如 /TrailPick）。构建时由 NEXT_PUBLIC_BASE_PATH 内联，本地开发为空 */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** 绝对路径加部署前缀；相对路径原样返回 */
export function withBase(path: string): string {
  return path.startsWith("/") ? BASE_PATH + path : path;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { message?: string }).message || "请求失败"), { status: res.status, data });
  return data as T;
}
