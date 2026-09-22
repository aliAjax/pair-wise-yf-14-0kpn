import { FOCUS_TTL_MS } from "./store";
import { Light } from "./types";

/**
 * 业务文件 1/3：焦点时效状态计算（纯函数，不依赖 React / DOM）。
 *
 * 状态优先级（一条确认记录只可能命中一种）：
 *   unconfirmed 无确认记录
 *   missing      有确认，但走位坐标为空
 *   stale        确认时间早于最新走位调整（走位变了，确认作废）
 *   expired      确认超过 20 分钟
 *   valid        可参与 Cue 执行
 */
export type FocusStatusKind =
  | "valid"
  | "expired"
  | "stale"
  | "missing"
  | "unconfirmed";

/**
 * 待复检 = 一切不能直接执行 Cue 的状态。
 * 复检动作只更新单灯，不存在“整组确认”。
 */
export const RECHECK_STATUSES: FocusStatusKind[] = [
  "expired",
  "stale",
  "missing",
  "unconfirmed",
];

export interface FocusStatus {
  kind: FocusStatusKind;
  /** 是否待复检（valid 之外的全部状态） */
  needsRecheck: boolean;
  /** valid 状态下剩余有效毫秒数 */
  remainingMs: number;
  /** 距过期/距确认等展示文案的依据（ms） */
  ageMs: number;
  label: string;
  reason: string;
}

export function isCoordEmpty(light: Light): boolean {
  const c = light.confirmation;
  return c === null || c.coordX === null || c.coordY === null;
}

export function computeFocusStatus(light: Light, now: number): FocusStatus {
  const c = light.confirmation;

  if (c === null) {
    return {
      kind: "unconfirmed",
      needsRecheck: true,
      remainingMs: 0,
      ageMs: 0,
      label: "未确认",
      reason: `${light.id} 尚未确认焦点，需单灯复检`,
    };
  }

  const ageMs = now - c.confirmedAt;
  const remainingMs = FOCUS_TTL_MS - ageMs;

  if (isCoordEmpty(light)) {
    return {
      kind: "missing",
      needsRecheck: true,
      remainingMs: Math.max(0, remainingMs),
      ageMs,
      label: "坐标为空",
      reason: `${light.id} 确认时未记录走位坐标 (X/Y)，需补录后单灯复检`,
    };
  }

  if (c.confirmedAt < light.blockingUpdatedAt) {
    return {
      kind: "stale",
      needsRecheck: true,
      remainingMs: Math.max(0, remainingMs),
      ageMs,
      label: "走位已变更",
      reason: `${light.id} 的确认早于最新走位调整，原确认作废，需单灯复检`,
    };
  }

  if (ageMs >= FOCUS_TTL_MS) {
    return {
      kind: "expired",
      needsRecheck: true,
      remainingMs: 0,
      ageMs,
      label: "确认已过期",
      reason: `${light.id} 的焦点确认已超过 20 分钟有效期，需单灯复检`,
    };
  }

  return {
    kind: "valid",
    needsRecheck: false,
    remainingMs,
    ageMs,
    label: "确认有效",
    reason: `焦点确认 20 分钟内有效`,
  };
}

export function statusMap(
  lights: Light[],
  now: number
): Map<string, FocusStatus> {
  const map = new Map<string, FocusStatus>();
  for (const light of lights) {
    map.set(light.id, computeFocusStatus(light, now));
  }
  return map;
}

export function needsRecheck(light: Light, now: number): boolean {
  return computeFocusStatus(light, now).needsRecheck;
}

/** 倒计时：mm:ss；过期/无效返回 "--:--" */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** “3 分钟前 / 26 分钟前 / 1 小时前” */
export function formatAge(ms: number): string {
  if (ms < 0) ms = 0;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  return `${h} 小时前`;
}

/** HH:MM 时刻 */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
