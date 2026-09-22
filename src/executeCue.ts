import { computeFocusStatus } from "./focusStatus";
import { Cue, Light, ShowState } from "./types";

/**
 * 业务文件 2/3：Cue 执行校验（纯函数，不依赖 React / DOM）。
 *
 * 规则：执行 Cue 时，组内任一灯具
 *   1. 焦点确认已过期（>20 分钟）
 *   2. 走位坐标为空
 *   3. 确认早于最新走位调整
 *   4. 或根本未确认 / 灯具已缺失
 * 则整组拒绝：不改原 Cue 顺序、不动舞台图、不切当前场景预览。
 */
export type CueRejectReason =
  | "expired"
  | "stale"
  | "missing"
  | "unconfirmed"
  | "light-not-found";

export interface CueLightCheck {
  lightId: string;
  /** null 表示 Cue 引用了已不存在的灯具 */
  kind: CueRejectReason | null;
  pass: boolean;
  message: string;
}

export interface CueValidation {
  cueId: string;
  canExecute: boolean;
  /** 通过的灯数 */
  passedCount: number;
  /** 未通过的灯数（整组拒绝的判定依据：>0 即拒绝） */
  failedCount: number;
  checks: CueLightCheck[];
  /** 拒绝时给灯光师的汇总说明 */
  rejectMessage: string | null;
}

const KIND_MESSAGE: Record<CueRejectReason, string> = {
  expired: "确认已过期（超过 20 分钟）",
  stale: "确认早于最新走位调整",
  missing: "走位坐标为空",
  unconfirmed: "未确认焦点",
  "light-not-found": "灯具数据缺失",
};

/** 按 Cue 原始顺序逐灯校验；不修改任何输入 */
export function validateCue(
  cue: Cue,
  lights: Light[],
  now: number
): CueValidation {
  const byId = new Map(lights.map((l) => [l.id, l]));

  const checks: CueLightCheck[] = cue.lightIds.map((lightId) => {
    const light = byId.get(lightId);
    if (!light) {
      return {
        lightId,
        kind: "light-not-found",
        pass: false,
        message: KIND_MESSAGE["light-not-found"],
      };
    }
    const status = computeFocusStatus(light, now);
    if (status.kind === "valid") {
      return { lightId, kind: null, pass: true, message: "确认有效" };
    }
    return {
      lightId,
      kind: status.kind,
      pass: false,
      message: KIND_MESSAGE[status.kind],
    };
  });

  const failed = checks.filter((c) => !c.pass);
  let rejectMessage: string | null = null;
  if (failed.length > 0) {
    rejectMessage = `${cue.id} 整组拒绝：${failed
      .map((f) => `${f.lightId}（${f.message}）`)
      .join("、")}。请逐灯复检后再执行。`;
  }

  return {
    cueId: cue.id,
    canExecute: failed.length === 0,
    passedCount: checks.length - failed.length,
    failedCount: failed.length,
    checks,
    rejectMessage,
  };
}

export interface ExecuteResult {
  ok: boolean;
  validation: CueValidation;
  /**
   * ok 时返回新状态（仅追加执行历史并切换当前场景预览）。
   * 拒绝时为 null —— 调用方必须保持原状态不动：
   * Cue 顺序、舞台图、预览均不变。
   */
  nextState: ShowState | null;
}

/**
 * 执行 Cue。灯具列表（舞台图与焦点记录）不在此处写入，
 * 成功时只更新 activeCueId（预览）与执行历史。
 */
export function executeCue(state: ShowState, cueId: string, now: number): ExecuteResult {
  const cue = state.cues.find((c) => c.id === cueId);
  if (!cue) {
    throw new Error(`Cue 不存在：${cueId}`);
  }

  const validation = validateCue(cue, state.lights, now);

  if (!validation.canExecute) {
    return { ok: false, validation, nextState: null };
  }

  const nextState: ShowState = {
    ...state,
    activeCueId: cue.id,
    history: [{ cueId, executedAt: now }, ...state.history].slice(0, 30),
  };

  return { ok: true, validation, nextState };
}
