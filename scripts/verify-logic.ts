import { createSeedState } from "../src/store";
import { computeFocusStatus } from "../src/focusStatus";
import { executeCue, validateCue } from "../src/executeCue";
import { ShowState } from "../src/types";

const now = 1_000_000_000_000; // 固定时钟
let state = createSeedState(now);
let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const lightById = (s: ShowState, id: string) =>
  s.lights.find((l) => l.id === id)!;

console.log("1) 初始状态计算（固定时钟）");
check("SIDE-04 valid", computeFocusStatus(lightById(state, "SIDE-04"), now).kind === "valid");
check("FOH-03 stale（确认早于走位调整）", computeFocusStatus(lightById(state, "FOH-03"), now).kind === "stale");
check("FX-08 missing（坐标为空）", computeFocusStatus(lightById(state, "FX-08"), now).kind === "missing");
check("BACK-06 expired（>20 分钟）", computeFocusStatus(lightById(state, "BACK-06"), now).kind === "expired");
check("BACK-07 unconfirmed", computeFocusStatus(lightById(state, "BACK-07"), now).kind === "unconfirmed");
check("valid 灯 needsRecheck=false", computeFocusStatus(lightById(state, "FOH-01"), now).needsRecheck === false);

console.log("2) Cue 校验");
const v12 = validateCue(state.cues[0], state.lights, now);
check("Cue 12 可执行", v12.canExecute === true && v12.failedCount === 0);
const v18 = validateCue(state.cues[1], state.lights, now);
check("Cue 18 整组拒绝", v18.canExecute === false && v18.failedCount === 2);
check(
  "Cue 18 命中 stale+missing",
  v18.checks.some((c) => c.lightId === "FOH-03" && c.kind === "stale") &&
    v18.checks.some((c) => c.lightId === "FX-08" && c.kind === "missing")
);
const v24 = validateCue(state.cues[2], state.lights, now);
check("Cue 24 整组拒绝（expired+unconfirmed）", !v24.canExecute && v24.failedCount === 2);
check(
  "拒绝顺序与 Cue 原顺序一致",
  v24.checks.map((c) => c.lightId).join(",") === "FOH-02,BACK-06,BACK-07"
);

console.log("3) 执行拒绝时状态不动");
const snapshot = JSON.stringify(state);
const r18 = executeCue(state, "Cue 18", now);
check("executeCue 拒绝返回 nextState=null", r18.ok === false && r18.nextState === null);
check("拒绝后原状态完全不变", JSON.stringify(state) === snapshot);
check("拒绝后无预览", state.activeCueId === null && state.history.length === 0);

console.log("4) 执行成功才切预览、记历史，顺序/灯位不动");
const r12 = executeCue(state, "Cue 12", now);
check("Cue 12 执行成功", r12.ok === true && r12.nextState !== null);
if (r12.nextState) {
  check("预览切到 Cue 12", r12.nextState.activeCueId === "Cue 12");
  check("历史追加 1 条", r12.nextState.history.length === 1);
  check("灯具/舞台图数据不变", JSON.stringify(r12.nextState.lights) === JSON.stringify(state.lights));
  check("Cue 顺序不变", JSON.stringify(r12.nextState.cues) === JSON.stringify(state.cues));
}

console.log("5) 复检只更新单灯，不替整组确认");
// 模拟 App 的单灯复检：只 map 目标灯
const t1 = now + 60_000;
state = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "FOH-03"
      ? { ...l, confirmation: { confirmedAt: t1, coordX: 8.2, coordY: 1.6 } }
      : l
  ),
};
check("FOH-03 复检后 valid", computeFocusStatus(lightById(state, "FOH-03"), t1).kind === "valid");
check("同组 FX-08 仍 missing（复检不替整组）", computeFocusStatus(lightById(state, "FX-08"), t1).kind === "missing");
const v18b = validateCue(state.cues[1], state.lights, t1);
check("Cue 18 仍因 FX-08 被整组拒绝", v18b.canExecute === false && v18b.failedCount === 1);
// FX-08 补录坐标复检
const t2 = t1 + 1000;
state = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "FX-08"
      ? { ...l, confirmation: { confirmedAt: t2, coordX: 7.5, coordY: 2.0 } }
      : l
  ),
};
check("FX-08 补坐标后 Cue 18 可执行", validateCue(state.cues[1], state.lights, t2).canExecute === true);

console.log("6) 时间推进：旧记录自动过期（模拟刷新保留记录）");
const later = t2 + 21 * 60_000;
check("21 分钟后 FOH-03 翻为 expired", computeFocusStatus(lightById(state, "FOH-03"), later).kind === "expired");
// 持久化记录原样存在，只是按当前时间重算
const persisted = JSON.parse(JSON.stringify(state));
check("旧确认记录刷新后仍保留", persisted.lights.find((l: any) => l.id === "FOH-03").confirmation.confirmedAt === t1);
check("刷新后按当前时间判定为过期", computeFocusStatus(lightById(persisted as ShowState, "FOH-03"), later).kind === "expired");

console.log("7) 边界：恰好 20 分钟视为过期；差 1ms 仍有效");
const edge: ShowState = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "SIDE-04"
      ? { ...l, blockingUpdatedAt: 0, confirmation: { confirmedAt: 1000, coordX: 1, coordY: 1 } }
      : l
  ),
};
check(
  "19:59.999 有效",
  computeFocusStatus(lightById(edge, "SIDE-04"), 1000 + 20 * 60_000 - 1).kind === "valid"
);
check(
  "恰好 20:00 过期",
  computeFocusStatus(lightById(edge, "SIDE-04"), 1000 + 20 * 60_000).kind === "expired"
);

console.log("8) 走位调整后旧确认立即 stale，重新复检恢复");
const adj = later + 1000;
state = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "FOH-01" ? { ...l, blockingUpdatedAt: adj } : l
  ),
};
check("走位调整后 FOH-01 stale", computeFocusStatus(lightById(state, "FOH-01"), adj).kind === "stale");
state = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "FOH-01"
      ? { ...l, confirmation: { confirmedAt: adj + 2000, coordX: 5.0, coordY: 3.0 } }
      : l
  ),
};
check("复检时间晚于走位 → valid", computeFocusStatus(lightById(state, "FOH-01"), adj + 2000).kind === "valid");

console.log("9) 只有一个坐标为空也算 missing");
const half: ShowState = {
  ...state,
  lights: state.lights.map((l) =>
    l.id === "FOH-01"
      ? { ...l, confirmation: { confirmedAt: adj + 3000, coordX: 5.0, coordY: null } }
      : l
  ),
};
check("仅 X 有值、Y 为空 → missing", computeFocusStatus(lightById(half, "FOH-01"), adj + 3000).kind === "missing");

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
