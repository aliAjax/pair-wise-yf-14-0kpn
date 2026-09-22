import { Light, ShowState } from "./types";

const STORAGE_KEY = "hxyfront-62002-cue-sheet-v1";

/** 20 分钟有效期 */
export const FOCUS_TTL_MS = 20 * 60 * 1000;

const MIN = 60 * 1000;

/**
 * 构造演示数据。时间均相对 now 生成：
 * - Cue 12 相关灯全部新鲜确认，可整组执行
 * - Cue 18 含走位调整晚于确认（stale）与空坐标（missing）灯，整组拒绝
 * - Cue 24 含过期（expired）与从未确认（unconfirmed）灯，整组拒绝
 */
export function createSeedState(now: number = Date.now()): ShowState {
  const lights: Light[] = [
    {
      id: "FOH-01",
      channel: "CH 001",
      type: "面光",
      gel: "暖白 1/2 CTO",
      gelColor: "#ffd166",
      focusLabel: "舞台中前场",
      brightness: 80,
      mapPos: { x: 20, y: 12 },
      blockingUpdatedAt: now - 60 * MIN,
      confirmation: { confirmedAt: now - 3 * MIN, coordX: 5.0, coordY: 3.0 },
    },
    {
      id: "FOH-02",
      channel: "CH 002",
      type: "面光",
      gel: "暖白 1/2 CTO",
      gelColor: "#ffd166",
      focusLabel: "上场门前区",
      brightness: 72,
      mapPos: { x: 38, y: 12 },
      blockingUpdatedAt: now - 50 * MIN,
      confirmation: { confirmedAt: now - 6 * MIN, coordX: 2.6, coordY: 2.4 },
    },
    {
      id: "FOH-03",
      channel: "CH 003",
      type: "面光",
      gel: "冷白 1/4 CTB",
      gelColor: "#93c5fd",
      focusLabel: "追光入场门口",
      brightness: 90,
      mapPos: { x: 56, y: 12 },
      // 走位刚刚调整，早于此时间的确认已失效
      blockingUpdatedAt: now - 2 * MIN,
      confirmation: { confirmedAt: now - 25 * MIN, coordX: 8.1, coordY: 1.5 },
    },
    {
      id: "SIDE-04",
      channel: "CH 021",
      type: "侧光",
      gel: "冷蓝 L201",
      gelColor: "#3b82f6",
      focusLabel: "二幕侧光带",
      brightness: 65,
      mapPos: { x: 6, y: 48 },
      blockingUpdatedAt: now - 40 * MIN,
      confirmation: { confirmedAt: now - 5 * MIN, coordX: 1.4, coordY: 3.1 },
    },
    {
      id: "SIDE-05",
      channel: "CH 022",
      type: "侧光",
      gel: "冷蓝 L201",
      gelColor: "#3b82f6",
      focusLabel: "二幕侧光带延伸",
      brightness: 65,
      mapPos: { x: 94, y: 48 },
      blockingUpdatedAt: now - 40 * MIN,
      confirmation: { confirmedAt: now - 8 * MIN, coordX: 8.6, coordY: 3.1 },
    },
    {
      id: "BACK-06",
      channel: "CH 041",
      type: "逆光",
      gel: "琥珀 L117",
      gelColor: "#f59e0b",
      focusLabel: "后景区顶逆光",
      brightness: 58,
      mapPos: { x: 30, y: 86 },
      blockingUpdatedAt: now - 200 * MIN,
      // 确认超过 20 分钟：过期
      confirmation: { confirmedAt: now - 34 * MIN, coordX: 3.2, coordY: 5.2 },
    },
    {
      id: "BACK-07",
      channel: "CH 042",
      type: "逆光",
      gel: "品红 L327",
      gelColor: "#c084fc",
      focusLabel: "谢幕逆光铺底",
      brightness: 76,
      mapPos: { x: 62, y: 86 },
      blockingUpdatedAt: now - 200 * MIN,
      // 从未确认焦点
      confirmation: null,
    },
    {
      id: "FX-08",
      channel: "CH 060",
      type: "效果光",
      gel: "青绿 L724",
      gelColor: "#06b6d4",
      focusLabel: "门口云效果",
      brightness: 40,
      mapPos: { x: 82, y: 22 },
      blockingUpdatedAt: now - 35 * MIN,
      // 确认有效但走位坐标缺失：坐标为空
      confirmation: { confirmedAt: now - 4 * MIN, coordX: null, coordY: null },
    },
    {
      id: "FX-09",
      channel: "CH 061",
      type: "效果光",
      gel: "暖粉 L345",
      gelColor: "#f472b6",
      focusLabel: "台中定点",
      brightness: 55,
      mapPos: { x: 48, y: 50 },
      blockingUpdatedAt: now - 70 * MIN,
      confirmation: { confirmedAt: now - 9 * MIN, coordX: 5.0, coordY: 3.0 },
    },
  ];

  const cues = [
    {
      id: "Cue 12",
      name: "冷蓝侧光 · 二幕开场",
      lightIds: ["SIDE-04", "SIDE-05", "FOH-01", "FX-09"],
      note: "四灯确认均新鲜，可直接执行。",
    },
    {
      id: "Cue 18",
      name: "追光入场",
      lightIds: ["FOH-03", "FX-08"],
      note: "FOH-03 走位刚调整需复检；FX-08 走位坐标未记录。",
    },
    {
      id: "Cue 24",
      name: "暖色谢幕",
      lightIds: ["FOH-02", "BACK-06", "BACK-07"],
      note: "版本 B：BACK-06 确认过期，BACK-07 从未确认。",
    },
  ];

  return {
    showName: "《夜航》· 二幕联排",
    versionNotes:
      "演出版本 B（2026-09-22 排练）：二幕追光走位改至上场门；谢幕逆光铺底待定。",
    lights,
    cues,
    activeCueId: null,
    history: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 宽松校验持久化数据。旧版本/损坏数据不做修补，直接回落到演示数据；
 * 旧确认记录只要时间戳有效就保留——是否过期、是否早于走位调整，
 * 全部在加载后按当前时间动态计算（即“旧记录按过期处理，刷新后保留”）。
 */
export function loadState(): ShowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed: unknown = JSON.parse(raw);
    if (
      isRecord(parsed) &&
      typeof parsed.showName === "string" &&
      typeof parsed.versionNotes === "string" &&
      Array.isArray(parsed.lights) &&
      Array.isArray(parsed.cues)
    ) {
      const lights = parsed.lights.filter(isRecord) as unknown as Light[];
      const cues = parsed.cues.filter(isRecord) as unknown as ShowState["cues"];
      if (lights.length > 0 && cues.length > 0) {
        return {
          showName: parsed.showName,
          versionNotes: parsed.versionNotes,
          lights,
          cues,
          activeCueId:
            typeof parsed.activeCueId === "string" ? parsed.activeCueId : null,
          history: Array.isArray(parsed.history)
            ? (parsed.history.filter(isRecord) as unknown as ShowState["history"])
            : [],
        };
      }
    }
  } catch {
    // 读取或解析失败时回落演示数据
  }
  return createSeedState();
}

export function saveState(state: ShowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅影响刷新持久化，不影响当前会话
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
