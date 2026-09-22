import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";

// SSR 冒烟：App 初始化会读 localStorage；effect/事件处理器不在首帧执行
const store: Record<string, string> = {};
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
};

const html = renderToStaticMarkup(createElement(App));

let fail = 0;
const mustContain = [
  "Cue 12",
  "Cue 18",
  "Cue 24",
  "FOH-03",
  "整组拒绝", // 界面规则文案（执行按钮区/说明里出现）
  "待复检",
  "单灯复检",
  "舞台平面灯位图",
  "当前场景预览",
  "走位坐标",
  "20 分钟",
  "演出版本备注",
  "确认已过期",
  "走位已变更",
  "坐标为空",
  "未确认",
  "recheck-badge",
];
for (const token of mustContain) {
  if (!html.includes(token)) {
    console.error(`✘ 首帧缺少：${token}`);
    fail++;
  } else {
    console.log(`✓ 首帧包含：${token}`);
  }
}

// 演示数据：待复检灯 4 盏（FOH-03 stale / FX-08 missing / BACK-06 expired / BACK-07 unconfirmed）
const badgeCount = (html.match(/recheck-badge/g) || []).length;
if (badgeCount < 4) {
  console.error(`✘ 待复检角标数量异常：${badgeCount}`);
  fail++;
} else {
  console.log(`✘→✓ 待复检角标存在（${badgeCount} 处，含舞台图与各 Cue 灯条）`);
}

console.log(`\n首帧 HTML 长度：${html.length}`);
console.log(fail === 0 ? "冒烟测试通过" : `冒烟测试失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
