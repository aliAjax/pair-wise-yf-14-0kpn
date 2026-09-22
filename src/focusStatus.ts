// 业务文件一：焦点时效状态计算
// 规则：
// 1. 每盏灯确认焦点时记录确认时间(confirmedAt)与走位坐标(x/y)；
// 2. 确认记录在 FOCUS_VALID_MS（20 分钟）内有效；
// 3. 坐标为空、确认早于最新走位调整、超过有效期，均视为不可用；
// 4. 走位被调整后，旧确认记录保留，按过期处理（待复检），不删除。

export const FOCUS_VALID_MS = 20 * 60 * 1000;

export type FixtureType = "面光" | "侧光" | "逆光" | "效果光";

export const FIXTURE_TYPES: FixtureType[] = ["面光", "侧光", "逆光", "效果光"];

/** 一次焦点确认记录：确认时间 + 当时的演员走位坐标（米） */
export interface FocusRecord {
  confirmedAt: number;
  x: number | null;
  y: number | null;
}

export interface Fixture {
  id: string;
  channel: string;
  type: FixtureType;
  gel: string;
  gelColor: string;
  /** 亮度预设 0-100 */
  brightness: number;
  /** 灯位图上的灯具位置（百分比） */
  stageX: number;
  stageY: number;
  /** 计划走位焦点坐标（米，台口左起 0-12，纵深 0-8） */
  targetX: number;
  targetY: number;
  /** 最新一次走位调整时间；确认早于它即判定待复检 */
  blockingAdjustAt: number;
  focus: FocusRecord | null;
}

export interface Cue {
  id: string;
  order: number;
  name: string;
  brightness: number;
  note: string;
  fixtureIds: string[];
}

export interface NewFixtureInput {
  id: string;
  channel: string;
  type: FixtureType;
  gel: string;
  brightness: number;
  targetX: number;
  targetY: number;
}

export type FocusStatusKind =
  | "fresh" // 有效期内，坐标齐全
  | "expired" // 超过 20 分钟
  | "stale" // 确认早于最新走位调整 -> 待复检
  | "missing-coordinate" // 旧记录缺少走位坐标
  | "unconfirmed"; // 从未确认

export interface FocusStatus {
  kind: FocusStatusKind;
  label: string;
  /** 阻止 Cue 执行的原因；fresh 为 null */
  reason: string | null;
  /** fresh 状态的剩余有效毫秒 */
  remainingMs: number | null;
}

const STATUS_LABEL: Record<FocusStatusKind, string> = {
  fresh: "焦点有效",
  expired: "确认已过期",
  stale: "待复检",
  "missing-coordinate": "坐标为空",
  unconfirmed: "未确认",
};

const STATUS_REASON: Record<FocusStatusKind, string | null> = {
  fresh: null,
  expired: "焦点确认已超过 20 分钟有效期，需重新确认",
  stale: "确认时间早于最新走位调整，需对该灯复检",
  "missing-coordinate": "确认记录缺少走位坐标，无法执行",
  unconfirmed: "尚未确认焦点，也没有走位坐标记录",
};

function buildStatus(kind: FocusStatusKind, remainingMs: number | null): FocusStatus {
  return { kind, label: STATUS_LABEL[kind], reason: STATUS_REASON[kind], remainingMs };
}

function isCoordMissing(value: number | null): boolean {
  return value === null || Number.isNaN(value);
}

export function getFocusStatus(fixture: Fixture, now: number): FocusStatus {
  const record = fixture.focus;

  if (!record) {
    return buildStatus("unconfirmed", null);
  }
  if (isCoordMissing(record.x) || isCoordMissing(record.y)) {
    return buildStatus("missing-coordinate", null);
  }
  // 走位调整晚于确认 -> 旧记录保留但按过期处理，等待单灯复检
  if (record.confirmedAt < fixture.blockingAdjustAt) {
    return buildStatus("stale", null);
  }
  const ageMs = now - record.confirmedAt;
  if (ageMs > FOCUS_VALID_MS) {
    return buildStatus("expired", null);
  }
  return buildStatus("fresh", Math.max(0, FOCUS_VALID_MS - ageMs));
}

export function isFocusUsable(status: FocusStatus): boolean {
  return status.kind === "fresh";
}

export interface FocusSummary {
  total: number;
  fresh: number;
  stale: number;
  expired: number;
  missing: number;
  unconfirmed: number;
  /** 待确认焦点：除有效之外的全部灯具 */
  actionable: number;
}

export function summarizeFocus(fixtures: Fixture[], now: number): FocusSummary {
  const summary: FocusSummary = {
    total: fixtures.length,
    fresh: 0,
    stale: 0,
    expired: 0,
    missing: 0,
    unconfirmed: 0,
    actionable: 0,
  };
  for (const fixture of fixtures) {
    const kind = getFocusStatus(fixture, now).kind;
    if (kind === "fresh") summary.fresh += 1;
    else summary.actionable += 1;
    if (kind === "stale") summary.stale += 1;
    if (kind === "expired") summary.expired += 1;
    if (kind === "missing-coordinate") summary.missing += 1;
    if (kind === "unconfirmed") summary.unconfirmed += 1;
  }
  return summary;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatClock(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined) return "—";
  const d = new Date(timestamp);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function formatAgo(timestamp: number, now: number): string {
  const diff = now - timestamp;
  if (diff < 60 * 1000) return "刚刚";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  return `${hours} 小时前`;
}
