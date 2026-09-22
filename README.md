# hxyfront-62002 剧场灯光Cue表管理

源提示词编号：2

做一个给剧场灯光师使用的灯位与Cue表管理前端项目，可以维护演出名称、灯具编号、通道号、色片、焦点位置、亮度预设和Cue触发顺序。页面需要有舞台平面灯位图、Cue列表、当前场景预览、灯具筛选和演出版本备注，适合排练期间快速调整。

## 技术栈

React + Vite + TypeScript

## 本地运行

```bash
npm install
npm run dev
```

开发端口：62002

## 焦点时效复核规则

每盏灯确认焦点时记录**确认时间**与**走位坐标 (X/Y)**，确认 **20 分钟内有效**。

- 执行 Cue 时，组内任一灯具出现以下情况之一，**整组拒绝**：
  - 确认已过期（超过 20 分钟）
  - 走位坐标为空
  - 确认时间早于最新走位调整
  - 从未确认 / 灯具数据缺失
- 拒绝时**原 Cue 顺序、舞台灯位图、当前场景预览均不动**，仅给出拒绝原因横幅。
- **复检只更新单灯**（确认时间+坐标），不会替同组其它灯确认。
- 待复检灯具在筛选区（"待复检" chip 带计数）和舞台图（彩色边框 + "检"角标）上标注。
- 确认记录存 localStorage：刷新后保留，旧记录按当前时间动态判定为过期。

### 业务文件分层

| 文件 | 职责 |
| --- | --- |
| `src/focusStatus.ts` | 状态计算（纯函数）：valid / expired / stale / missing / unconfirmed、倒计时文案 |
| `src/executeCue.ts` | 执行校验（纯函数）：按 Cue 原顺序逐灯校验，整组拒绝时不产生新状态 |
| `src/FocusConsole.tsx` | 界面：舞台图、Cue 列表、场景预览、筛选与单灯复检标注 |

辅助文件：`src/types.ts`（数据模型）、`src/store.ts`（localStorage 持久化与演示数据）、`src/App.tsx`（装配 + 每秒时钟）。

规则验证脚本：`scripts/verify-logic.ts`（31 条业务规则）、`scripts/smoke-ui.tsx`（首帧渲染冒烟）。

```bash
npx esbuild scripts/verify-logic.ts --bundle --platform=node --format=esm --outfile=/tmp/v.mjs && node /tmp/v.mjs
npx esbuild scripts/smoke-ui.tsx --bundle --platform=node --format=cjs --outfile=/tmp/s.cjs --loader:.tsx=tsx && node /tmp/s.cjs
```
