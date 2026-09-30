/**
 * 天气 + 动态安全预警（PRD §61 Route Alert）
 * 数据源：Open-Meteo（免费无 key）；深圳单点查询，服务端 30 分钟缓存
 */
import type { Route, RouteAlert, WeatherDay, WeatherPayload } from "./types";

const WMO: Record<number, [string, string]> = {
  0: ["晴", "☀️"],
  1: ["基本晴", "🌤️"],
  2: ["多云", "⛅"],
  3: ["阴", "☁️"],
  45: ["雾", "🌫️"],
  48: ["雾凇", "🌫️"],
  51: ["毛毛雨", "🌦️"],
  53: ["毛毛雨", "🌦️"],
  55: ["浓毛毛雨", "🌦️"],
  61: ["小雨", "🌧️"],
  63: ["中雨", "🌧️"],
  65: ["大雨", "🌧️"],
  66: ["冻雨", "🌧️"],
  67: ["强冻雨", "🌧️"],
  71: ["小雪", "🌨️"],
  73: ["中雪", "🌨️"],
  75: ["大雪", "❄️"],
  77: ["雪粒", "🌨️"],
  80: ["阵雨", "🌦️"],
  81: ["阵雨", "🌧️"],
  82: ["强阵雨", "⛈️"],
  85: ["阵雪", "🌨️"],
  86: ["阵雪", "🌨️"],
  95: ["雷暴", "⛈️"],
  96: ["雷暴伴冰雹", "⛈️"],
  99: ["强雷暴伴冰雹", "⛈️"],
};

export function codeToDesc(code: number): [string, string] {
  return WMO[code] ?? ["未知", "🌡️"];
}

const SEV_ORDER = { danger: 0, warning: 1, caution: 2, info: 3 } as const;

interface OMResponse {
  current?: { temperature_2m: number; weather_code: number };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: number[];
  };
}

function todayIndex(times: string[]): number {
  // Open-Meteo 已按 Asia/Shanghai 本地化日期，须用同时区“今天”匹配（UTC 日期凌晨会错位）
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const i = times.indexOf(today);
  return i === -1 ? Math.min(1, times.length - 2) : i;
}

export async function fetchWeatherPayload(route: Route): Promise<WeatherPayload | null> {
  // 取轨迹中点（山体气候比起终点更贴近徒步体验）
  const trk = route.track;
  if (!trk || trk.length === 0) return null;
  const mid = trk[Math.floor(trk.length / 2)];
  const lat = mid[1].toFixed(4);
  const lng = mid[0].toFixed(4);
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lng +
    "&current=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max" +
    "&past_days=1&forecast_days=2&timezone=Asia%2FShanghai";
  const res = await fetch(url, {
    headers: { "User-Agent": "TrailPick/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const om = (await res.json()) as OMResponse;
  if (!om.daily || om.daily.time.length < 2) return null;

  const days: WeatherDay[] = om.daily.time.map((date, i) => {
    const code = om.daily!.weather_code[i] ?? 0;
    const [desc, emoji] = codeToDesc(code);
    return {
      date,
      code,
      desc,
      emoji,
      tMax: Math.round(om.daily!.temperature_2m_max[i] ?? 0),
      tMin: Math.round(om.daily!.temperature_2m_min[i] ?? 0),
      precipProb: om.daily!.precipitation_probability_max[i] ?? 0,
      precipSum: om.daily!.precipitation_sum[i] ?? 0,
      windMax: Math.round(om.daily!.wind_speed_10m_max[i] ?? 0),
    };
  });

  const ti = todayIndex(om.daily.time);
  const today = days[ti];
  const yesterday = days[0];
  const cur = om.current;
  const [curDesc, curEmoji] = cur ? codeToDesc(cur.weather_code) : ["", ""];

  const alerts: RouteAlert[] = [];
  const now = new Date().toISOString();
  const endOfToday = today.date + "T23:59:59+08:00";

  if (today.code >= 95) {
    alerts.push({
      type: "weather",
      severity: "danger",
      message: "今日预报有" + today.desc + "，请勿前往空旷山脊与孤立树下，建议改期。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  } else if (today.precipProb >= 70 || today.precipSum >= 20) {
    alerts.push({
      type: "weather",
      severity: "warning",
      message: "今日降雨概率 " + today.precipProb + "%（预计 " + today.precipSum.toFixed(0) + "mm），山路湿滑、溪谷涨水风险高，建议改期或选低难度绿道。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  } else if (today.precipProb >= 40 || today.precipSum >= 5) {
    alerts.push({
      type: "weather",
      severity: "caution",
      message: "今日可能有阵雨（概率 " + today.precipProb + "%），建议携带雨具并留意天色变化。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  }
  if (yesterday && yesterday.precipSum >= 15 && today.precipProb < 40) {
    alerts.push({
      type: "weather",
      severity: "caution",
      message: "昨日有较大降雨，岩石与土坡路段仍湿滑泥泞，注意防滑。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 实况",
      verified: false,
    });
  }
  if (today.tMax >= 33) {
    alerts.push({
      type: "weather",
      severity: "warning",
      message: "今日最高 " + today.tMax + "°C，高温暴晒，务必带足 2L+ 饮水并避开正午时段。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  } else if (today.tMax >= 30 && today.tMin >= 26) {
    alerts.push({
      type: "weather",
      severity: "caution",
      message: "今日 " + today.tMin + "~" + today.tMax + "°C 悶熱，注意补水防中暑。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  }
  if (today.tMin <= 8) {
    alerts.push({
      type: "weather",
      severity: "caution",
      message: "今日最低仅 " + today.tMin + "°C，山顶风大体感更低，注意保暖。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  }
  if (today.windMax >= 40) {
    alerts.push({
      type: "weather",
      severity: "caution",
      message: "今日最大风力 " + today.windMax + "km/h，山脊与崖边注意防风。",
      start_time: now,
      end_time: endOfToday,
      source: "Open-Meteo 预报",
      verified: false,
    });
  }

  if (route.status === "CLOSED" || route.status === "PARTIALLY_CLOSED") {
    alerts.push({
      type: "status",
      severity: "danger",
      message: "路线" + (route.status === "CLOSED" ? "已关闭" : "部分关闭") + (route.status_note ? "：" + route.status_note : "") + "。",
      source: "平台数据",
      verified: true,
    });
  } else if (route.status === "CAUTION") {
    alerts.push({
      type: "status",
      severity: "caution",
      message: "此路线需注意" + (route.status_note ? "：" + route.status_note : "（详见安全信息）") + "。",
      source: "平台数据",
      verified: true,
    });
  } else if (route.status === "UNKNOWN") {
    alerts.push({
      type: "status",
      severity: "info",
      message: "路线状态未知，出行前建议向管理部门确认。",
      source: "平台数据",
      verified: true,
    });
  }

  alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  return {
    slug: route.slug,
    current: cur ? { temp: Math.round(cur.temperature_2m), code: cur.weather_code, desc: curDesc, emoji: curEmoji } : null,
    daily: days.slice(ti, ti + 2).length === 2 ? days.slice(ti, ti + 2) : days.slice(-2),
    alerts: alerts.slice(0, 5),
    updatedAt: now,
  };
}

/** 简单内存缓存（单进程部署足够） */
const cache = new Map<string, { at: number; data: WeatherPayload }>();
const TTL_MS = 30 * 60 * 1000;
const ERR_TTL_MS = 90 * 1000;
const errCache = new Map<string, number>();

export async function getWeatherCached(route: Route): Promise<WeatherPayload | null> {
  const hit = cache.get(route.slug);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.data, cached: true };
  }
  const err = errCache.get(route.slug);
  if (err && Date.now() - err < ERR_TTL_MS) {
    return null;
  }
  // 上游偶发限流/超时：本轮内重试一次，仍失败才进入错误负缓存
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await fetchWeatherPayload(route);
      if (data) {
        cache.set(route.slug, { at: Date.now(), data });
        errCache.delete(route.slug);
        return data;
      }
    } catch {
      // fallthrough to retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  errCache.set(route.slug, Date.now());
  return null;
}
