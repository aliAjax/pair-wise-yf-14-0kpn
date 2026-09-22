// 业务文件二：Cue 执行校验
// 规则：执行 Cue 时，组内任一灯具
//   - 焦点确认已过期（超过 20 分钟）
//   - 走位坐标为空
//   - 确认时间早于最新走位调整（待复检）
//   - 或从未确认
// 则整组拒绝执行，Cue 顺序、舞台图与预览均不发生变化。
// 复检（reconfirm）只更新单灯记录，不能替整组确认。

import {
  type Cue,
  type Fixture,
  type FocusStatus,
  getFocusStatus,
  isFocusUsable,
} from "./focusStatus";

export interface FixtureFocusBlock {
  fixtureId: string;
  status: FocusStatus;
}

export type CueCheckResult =
  | { allowed: true; cue: Cue; blocks: FixtureFocusBlock[] }
  | { allowed: false; cue: Cue; blocks: FixtureFocusBlock[] };

export interface ActiveCue {
  cueId: string;
  executedAt: number;
}

/** 整组拒绝后的留痕：刷新后仍可在界面看到上次拦截结果 */
export interface RejectionNotice {
  cueId: string;
  at: number;
  blocks: FixtureFocusBlock[];
}

export function evaluateCue(cue: Cue, fixtures: Fixture[], now: number): CueCheckResult {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const blocks: FixtureFocusBlock[] = cue.fixtureIds
    .map((fixtureId) => {
      const fixture = byId.get(fixtureId);
      // 组内灯具不存在时同样拒绝，防止引用残缺的 Cue 被执行
      if (!fixture) {
        return {
          fixtureId,
          status: {
            kind: "unconfirmed" as const,
            label: "灯具缺失",
            reason: "Cue 引用的灯具不存在",
            remainingMs: null,
          },
        };
      }
      return { fixtureId, status: getFocusStatus(fixture, now) };
    })
    .filter((block) => !isFocusUsable(block.status));

  return blocks.length === 0
    ? { allowed: true, cue, blocks }
    : { allowed: false, cue, blocks };
}
