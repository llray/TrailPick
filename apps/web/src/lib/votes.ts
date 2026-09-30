/**
 * 投票系统 (PRD §21-24, §27)
 * - 不强制注册：Guest Name + browser_id (LocalStorage)
 * - 防刷：browser_id 幂等（可改票）+ IP/browser 速率限制
 * - 平局骰子：只在最高票路线中随机 (PRD §27)
 */
import crypto from "node:crypto";
import { cached, readJson, writeJson, invalidate } from "./store";
import type { VoteRoom, VoteResults, Ballot } from "./types";

const VOTES_FILE = "votes.json";
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去除易混淆字符

type VoteStore = Record<string, VoteRoom>;

function loadStore(): VoteStore {
  return readJson<VoteStore>(VOTES_FILE, {});
}

function saveStore(store: VoteStore): void {
  writeJson(VOTES_FILE, store);
  invalidate("votes");
}

function loadRoomsCached(): VoteStore {
  return cached("votes", () => loadStore());
}

function genId(len = 6): string {
  const bytes = crypto.randomBytes(len);
  let id = "";
  for (let i = 0; i < len; i++) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}

export interface CreateVoteInput {
  title: string;
  routeIds: string[];
  multipleChoice: boolean;
  showLive: boolean;
  /** 分钟数；null 表示不限 */
  deadlineMin: number | null;
  createdBy: string;
}

export function createVote(input: CreateVoteInput): VoteRoom {
  if (!input.title?.trim()) throw new Error("TITLE_REQUIRED");
  if (!Array.isArray(input.routeIds) || input.routeIds.length < 2) throw new Error("NEED_2_ROUTES");
  if (input.routeIds.length > 8) throw new Error("MAX_8_ROUTES");
  if (!input.createdBy?.trim()) throw new Error("CREATOR_REQUIRED");

  const store = loadStore();
  let id = genId();
  while (store[id]) id = genId();

  const room: VoteRoom = {
    id,
    title: input.title.trim().slice(0, 60),
    routeIds: input.routeIds,
    multipleChoice: !!input.multipleChoice,
    showLive: input.showLive !== false,
    deadline:
      input.deadlineMin && input.deadlineMin > 0
        ? new Date(Date.now() + input.deadlineMin * 60000).toISOString()
        : null,
    closedAt: null,
    createdBy: input.createdBy.trim().slice(0, 16),
    createdAt: new Date().toISOString(),
    ballots: [],
    decision: null,
  };
  store[id] = room;
  saveStore(store);
  return room;
}

export function getVote(id: string): VoteRoom | null {
  return loadRoomsCached()[id?.toUpperCase()] ?? null;
}

export function isExpired(room: VoteRoom): boolean {
  return !!room.deadline && new Date(room.deadline).getTime() < Date.now();
}

export function isClosed(room: VoteRoom): boolean {
  return !!room.closedAt || !!room.decision || isExpired(room);
}

export function listVotes(): VoteRoom[] {
  return Object.values(loadRoomsCached()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---- 防刷：内存速率限制 (PRD §24) ----
const rateMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 4000;
const RATE_MAX = 2;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (rateMap.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return true;
  arr.push(now);
  rateMap.set(key, arr);
  return false;
}

export interface CastVoteInput {
  voterName: string;
  browserId: string;
  routeIds: string[];
  ip?: string;
}

export function castVote(
  id: string,
  input: CastVoteInput
): { ok: true; room: VoteRoom } | { ok: false; error: string } {
  const store = loadStore();
  const room = store[id?.toUpperCase()];
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.decision) return { ok: false, error: "ALREADY_DECIDED" };
  if (room.closedAt) return { ok: false, error: "ROOM_CLOSED" };
  if (isExpired(room)) return { ok: false, error: "VOTE_EXPIRED" };

  const name = input.voterName?.trim();
  if (!name || name.length < 1 || name.length > 16) return { ok: false, error: "INVALID_NAME" };
  if (!input.browserId) return { ok: false, error: "INVALID_BROWSER" };

  const ids = Array.from(new Set(input.routeIds));
  if (ids.length === 0) return { ok: false, error: "EMPTY_VOTE" };
  if (!room.multipleChoice && ids.length > 1) return { ok: false, error: "SINGLE_CHOICE_ONLY" };
  if (ids.length > room.routeIds.length) return { ok: false, error: "TOO_MANY_CHOICES" };
  const valid = new Set(room.routeIds);
  if (!ids.every((r) => valid.has(r))) return { ok: false, error: "INVALID_ROUTE" };

  if (rateLimited(input.browserId) || (input.ip && rateLimited("ip:" + input.ip))) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const ballot: Ballot = {
    voterName: name,
    browserId: input.browserId,
    routeIds: ids,
    at: new Date().toISOString(),
  };
  // 同一 browser 可改票（覆盖）；同名不同设备允许（家人代投场景）
  const idx = room.ballots.findIndex((b) => b.browserId === input.browserId);
  if (idx >= 0) room.ballots[idx] = ballot;
  else room.ballots.push(ballot);

  store[room.id] = room;
  saveStore(store);
  return { ok: true, room };
}

export function resultsOf(room: VoteRoom): VoteResults {
  const counts = room.routeIds.map((routeId) => ({
    routeId,
    count: room.ballots.filter((b) => b.routeIds.includes(routeId)).length,
  }));
  const max = Math.max(...counts.map((c) => c.count), 0);
  const leaders = counts.filter((c) => c.count === max && max > 0).map((c) => c.routeId);
  const expired = isExpired(room);
  const revealed = room.showLive || !!room.closedAt || !!room.decision || expired;
  return {
    counts,
    totalBallots: room.ballots.length,
    voters: room.ballots
      .map((b) => ({ name: b.voterName, at: b.at, count: b.routeIds.length }))
      .sort((a, b) => (a.at < b.at ? -1 : 1)),
    leaders,
    isTie: leaders.length > 1 && room.ballots.length > 0,
    revealed,
    expired,
  };
}

/**
 * 骰子决定 (PRD §27)：
 * - tie 模式：只在最高票（并列第一）路线中随机
 * - force 模式：仅创建者可提前掷骰，在全部候选中随机
 */
export function rollDice(
  id: string,
  by: string,
  force = false
): { ok: true; room: VoteRoom; picked: string } | { ok: false; error: string } {
  const store = loadStore();
  const room = store[id?.toUpperCase()];
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.decision) return { ok: false, error: "ALREADY_DECIDED" };

  const res = resultsOf(room);
  let candidates: string[];
  if (res.isTie) {
    candidates = res.leaders;
  } else if (force) {
    if (by?.trim() !== room.createdBy) return { ok: false, error: "ONLY_CREATOR" };
    if (res.totalBallots === 0) return { ok: false, error: "NO_VOTES" };
    candidates = room.routeIds;
  } else {
    return { ok: false, error: "NOT_TIE" };
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  room.decision = {
    routeId: picked,
    method: res.isTie ? "DICE_TIE" : "DICE_FORCE",
    candidates,
    by: by?.trim().slice(0, 16) || room.createdBy,
    at: new Date().toISOString(),
  };
  store[room.id] = room;
  saveStore(store);
  return { ok: true, room, picked };
}

export function closeVote(id: string, by: string): { ok: true; room: VoteRoom } | { ok: false; error: string } {
  const store = loadStore();
  const room = store[id?.toUpperCase()];
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (by?.trim() !== room.createdBy) return { ok: false, error: "ONLY_CREATOR" };
  room.closedAt = new Date().toISOString();
  store[room.id] = room;
  saveStore(store);
  return { ok: true, room };
}

/** 投票选中路线计数（热度分来源之一 PRD §56） */
export function countVoteSelections(): Record<string, number> {
  const rooms = Object.values(loadRoomsCached());
  const out: Record<string, number> = {};
  for (const room of rooms) {
    for (const b of room.ballots) {
      for (const rid of b.routeIds) out[rid] = (out[rid] ?? 0) + 1;
    }
    if (room.decision) out[room.decision.routeId] = (out[room.decision.routeId] ?? 0) + 4;
  }
  return out;
}
