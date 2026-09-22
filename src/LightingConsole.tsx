// 业务文件三：界面
// 舞台灯位图、Cue 列表、当前场景预览、灯具筛选、单灯复检面板。
// 本文件只负责展示与用户交互，状态计算来自 focusStatus.ts，
// 执行校验来自 cueExecution.ts，数据与持久化由 App.tsx 管理。

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  type Cue,
  type Fixture,
  type FixtureType,
  type FocusStatusKind,
  type FocusSummary,
  type NewFixtureInput,
  FIXTURE_TYPES,
  FOCUS_VALID_MS,
  formatAgo,
  formatClock,
  formatRemaining,
  getFocusStatus,
  summarizeFocus,
} from "./focusStatus";
import {
  type ActiveCue,
  type CueCheckResult,
  type RejectionNotice,
  evaluateCue,
} from "./cueExecution";

type FilterKind = "全部" | "待复检" | FixtureType;

export interface LightingConsoleProps {
  production: string;
  onProductionChange: (name: string) => void;
  versionNote: string;
  onVersionNoteChange: (note: string) => void;
  fixtures: Fixture[];
  cues: Cue[];
  now: number;
  activeCue: ActiveCue | null;
  rejection: RejectionNotice | null;
  onExecuteCue: (cueId: string) => void;
  onReconfirm: (fixtureId: string, x: number, y: number, at: number) => void;
  onBlockingAdjust: (fixtureId: string, at: number) => void;
  onTargetChange: (fixtureId: string, x: number, y: number) => void;
  onAddFixture: (input: NewFixtureInput) => void;
}

const STAGE_W = 12; // 舞台宽（米）
const STAGE_D = 8; // 舞台纵深（米）

const PILL_CLASS: Record<FocusStatusKind, string> = {
  fresh: "pill pill-ok",
  expired: "pill pill-expired",
  stale: "pill pill-stale",
  "missing-coordinate": "pill pill-missing",
  unconfirmed: "pill pill-none",
};

const KIND_DOT: Record<FocusStatusKind, string> = {
  fresh: "#16a34a",
  expired: "#dc2626",
  stale: "#f59e0b",
  "missing-coordinate": "#94a3b8",
  unconfirmed: "#cbd5e1",
};

function toPercent(value: number, span: number): number {
  return (value / span) * 100;
}

function coordLabel(value: number | null): string {
  return value === null || Number.isNaN(value) ? "空" : value.toFixed(1);
}

interface StageMapProps {
  fixtures: Fixture[];
  now: number;
  previewCue?: Cue | null;
  selectedId?: string | null;
  onSelect?: (fixture: Fixture) => void;
  dimmedIds?: Set<string>;
  markerFixtures?: Fixture[];
}

function StageMap({
  fixtures,
  now,
  previewCue = null,
  selectedId = null,
  onSelect,
  dimmedIds,
  markerFixtures,
}: StageMapProps) {
  const previewIds = previewCue ? new Set(previewCue.fixtureIds) : null;
  const markerIds = markerFixtures ? new Set(markerFixtures.map((item) => item.id)) : null;

  return (
    <div className="stage-wrap">
      <div className="stage">
        <span className="stage-label stage-label-up">上场口 / 天幕</span>
        <span className="stage-label stage-label-l">侧台 左</span>
        <span className="stage-label stage-label-r">侧台 右</span>
        <div className="stage-center-line" />
        <svg className="stage-beams" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {previewCue &&
            fixtures
              .filter((fixture) => previewIds?.has(fixture.id))
              .map((fixture) => {
                const fx = toPercent(fixture.stageX, STAGE_W);
                const fy = toPercent(fixture.stageY, STAGE_D);
                const tx = toPercent(fixture.targetX, STAGE_W);
                const ty = toPercent(fixture.targetY, STAGE_D);
                return (
                  <line
                    key={`beam-${fixture.id}`}
                    x1={fx}
                    y1={fy}
                    x2={tx}
                    y2={ty}
                    stroke={fixture.gelColor}
                    strokeWidth={Math.max(0.6, fixture.brightness / 55)}
                    strokeLinecap="round"
                    opacity={0.55}
                  />
                );
              })}
        </svg>

        {markerFixtures?.map((fixture) => {
          const status = getFocusStatus(fixture, now);
          if (status.kind === "unconfirmed") return null;
          return (
            <span
              key={`target-${fixture.id}`}
              className={`focus-marker marker-${status.kind}`}
              title={`${fixture.id} 走位焦点 (${coordLabel(fixture.focus?.x ?? null)}, ${coordLabel(
                fixture.focus?.y ?? null,
              )})`}
              style={{
                left: `${toPercent(fixture.targetX, STAGE_W)}%`,
                top: `${toPercent(fixture.targetY, STAGE_D)}%`,
              }}
            >
              ×
            </span>
          );
        })}

        {fixtures.map((fixture) => {
          const status = getFocusStatus(fixture, now);
          const dimmed = dimmedIds?.has(fixture.id);
          const selected = selectedId === fixture.id;
          const inPreview = previewIds?.has(fixture.id);
          return (
            <button
              key={fixture.id}
              type="button"
              className={[
                "lamp",
                `lamp-${status.kind}`,
                selected ? "lamp-selected" : "",
                dimmed ? "lamp-dim" : "",
                inPreview ? "lamp-preview" : "",
                markerIds?.has(fixture.id) ? "lamp-marker-set" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: `${toPercent(fixture.stageX, STAGE_W)}%`,
                top: `${toPercent(fixture.stageY, STAGE_D)}%`,
              }}
              onClick={() => onSelect?.(fixture)}
              title={`${fixture.id} · ${fixture.type} · CH ${fixture.channel} · ${status.label}`}
            >
              <i className="lamp-dot" style={{ background: fixture.gelColor }} />
              <em>{fixture.id}</em>
            </button>
          );
        })}
      </div>
      <div className="audience">观 众 席</div>
      <ul className="legend">
        <li><i style={{ background: KIND_DOT.fresh }} />焦点有效（20 分钟内）</li>
        <li><i style={{ background: KIND_DOT.stale }} />待复检（走位已调整）</li>
        <li><i style={{ background: KIND_DOT.expired }} />确认过期</li>
        <li><i style={{ background: KIND_DOT["missing-coordinate"] }} />坐标为空</li>
        <li><i style={{ background: KIND_DOT.unconfirmed }} />从未确认</li>
      </ul>
    </div>
  );
}

function parseNumber(value: string): number {
  if (value.trim() === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export default function LightingConsole({
  production,
  onProductionChange,
  versionNote,
  onVersionNoteChange,
  fixtures,
  cues,
  now,
  activeCue,
  rejection,
  onExecuteCue,
  onReconfirm,
  onBlockingAdjust,
  onTargetChange,
  onAddFixture,
}: LightingConsoleProps) {
  const [filter, setFilter] = useState<FilterKind>("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmX, setConfirmX] = useState("");
  const [confirmY, setConfirmY] = useState("");
  const [targetX, setTargetX] = useState("");
  const [targetY, setTargetY] = useState("");
  const [form, setForm] = useState({
    id: "",
    channel: "",
    type: "面光" as FixtureType,
    gel: "",
    brightness: "60",
    targetX: "6.0",
    targetY: "4.0",
  });

  const statuses = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getFocusStatus>>();
    fixtures.forEach((fixture) => map.set(fixture.id, getFocusStatus(fixture, now)));
    return map;
  }, [fixtures, now]);

  const summary: FocusSummary = useMemo(() => summarizeFocus(fixtures, now), [fixtures, now]);

  const filtered = useMemo(() => {
    if (filter === "全部") return fixtures;
    if (filter === "待复检") {
      return fixtures.filter((fixture) => statuses.get(fixture.id)?.kind === "stale");
    }
    return fixtures.filter((fixture) => fixture.type === filter);
  }, [fixtures, filter, statuses]);

  const filteredIds = useMemo(() => new Set(filtered.map((fixture) => fixture.id)), [filtered]);

  const selected = useMemo(
    () => fixtures.find((fixture) => fixture.id === selectedId) ?? null,
    [fixtures, selectedId],
  );

  // 切换灯具时，用该灯最新计划焦点与已有确认记录填充复检表单
  useEffect(() => {
    if (!selected) return;
    setTargetX(Number.isFinite(selected.targetX) ? selected.targetX.toFixed(1) : "");
    setTargetY(Number.isFinite(selected.targetY) ? selected.targetY.toFixed(1) : "");
    setConfirmX(selected.focus && selected.focus.x !== null ? selected.focus.x.toFixed(1) : selected.targetX.toFixed(1));
    setConfirmY(selected.focus && selected.focus.y !== null ? selected.focus.y.toFixed(1) : selected.targetY.toFixed(1));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedCues = useMemo(() => [...cues].sort((a, b) => a.order - b.order), [cues]);
  const activeCueRecord = activeCue
    ? cues.find((cue) => cue.id === activeCue.cueId) ?? null
    : null;

  const typeCount = (type: FixtureType) => fixtures.filter((item) => item.type === type).length;
  const filterChip = (kind: FilterKind, label: string, count: number, stale = 0) => (
    <button
      key={kind}
      type="button"
      className={filter === kind ? "chip chip-active" : "chip"}
      onClick={() => setFilter(kind)}
    >
      <span>{label}</span>
      <b>{count}</b>
      {stale > 0 && <i className="chip-badge">{stale}</i>}
    </button>
  );

  const handleConfirm = (fixture: Fixture) => {
    const x = parseNumber(confirmX);
    const y = parseNumber(confirmY);
    // 坐标为空的确认同样不允许，保证记录始终带走位坐标
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      window.alert("请填写走位坐标（X / Y），不能留空。");
      return;
    }
    onReconfirm(fixture.id, x, y, Date.now());
  };

  const handleTargetSave = (fixture: Fixture) => {
    const x = parseNumber(targetX);
    const y = parseNumber(targetY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      window.alert("计划焦点坐标需要是数字。");
      return;
    }
    onTargetChange(fixture.id, x, y);
  };

  const handleAdd = () => {
    const brightness = parseNumber(form.brightness);
    const x = parseNumber(form.targetX);
    const y = parseNumber(form.targetY);
    if (!form.id.trim() || !form.channel.trim()) {
      window.alert("灯具编号与通道号必填。");
      return;
    }
    if (fixtures.some((fixture) => fixture.id === form.id.trim())) {
      window.alert("灯具编号已存在。");
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      window.alert("走位焦点坐标需要是数字。");
      return;
    }
    onAddFixture({
      id: form.id.trim(),
      channel: form.channel.trim(),
      type: form.type,
      gel: form.gel.trim() || "—",
      brightness: Number.isFinite(brightness) ? Math.min(100, Math.max(0, brightness)) : 60,
      targetX: x,
      targetY: y,
    });
    setForm((prev) => ({ ...prev, id: "", channel: "", gel: "" }));
  };

  return (
    <main className="console">
      <header className="console-head panel-flat">
        <div>
          <p className="eyebrow">hxyfront-62002 · 排练工作台 · {formatClock(now)}</p>
          <div className="title-row">
            <input
              className="production-input"
              value={production}
              onChange={(event) => onProductionChange(event.target.value)}
              aria-label="演出名称"
            />
            <span className="rule-hint">焦点确认 20 分钟内有效 · 整组校验，任一不过整组拒绝</span>
          </div>
        </div>
      </header>

      <section className="metrics">
        <article><small>灯具数量</small><strong>{summary.total}</strong></article>
        <article><small>Cue 数量</small><strong>{cues.length}</strong></article>
        <article><small>当前场景</small><strong className="metric-text">{activeCueRecord?.id ?? "—"}</strong></article>
        <article className={summary.actionable > 0 ? "metric-alert" : ""}>
          <small>待确认焦点</small>
          <strong>{summary.actionable}</strong>
          {summary.stale > 0 && <em className="metric-sub">其中 {summary.stale} 盏待复检</em>}
        </article>
      </section>

      <section className="board">
        <aside className="side panel-flat">
          <h2>灯具筛选</h2>
          <div className="chips-vertical">
            {filterChip("全部", "全部灯具", summary.total)}
            {filterChip("待复检", "待复检", summary.stale, summary.stale)}
            {FIXTURE_TYPES.map((type) =>
              filterChip(
                type,
                type,
                typeCount(type),
                fixtures.filter(
                  (fixture) => fixture.type === type && statuses.get(fixture.id)?.kind === "stale",
                ).length,
              ),
            )}
          </div>

          <h2 className="side-title">焦点状态</h2>
          <ul className="status-list">
            <li><i style={{ background: KIND_DOT.fresh }} />有效 {summary.fresh}</li>
            <li><i style={{ background: KIND_DOT.stale }} />待复检 {summary.stale}</li>
            <li><i style={{ background: KIND_DOT.expired }} />已过期 {summary.expired}</li>
            <li><i style={{ background: KIND_DOT["missing-coordinate"] }} />坐标为空 {summary.missing}</li>
            <li><i style={{ background: KIND_DOT.unconfirmed }} />未确认 {summary.unconfirmed}</li>
          </ul>

          <div className="side-note">
            复检只更新单盏灯的确认记录，不会替同组其他灯具确认；走位调整后旧记录保留，按过期处理。
          </div>
        </aside>

        <section className="panel-flat stage-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">舞台平面灯位图</p>
              <h2>
                {filter === "待复检"
                  ? "待复检灯具已标注（其余置灰）"
                  : filter === "全部"
                    ? "全部灯具"
                    : `${filter} 灯具`}
              </h2>
            </div>
            <span className="muted">× 为最近一次确认的走位坐标</span>
          </div>
          <StageMap
            fixtures={fixtures}
            now={now}
            selectedId={selectedId}
            onSelect={(fixture) => setSelectedId(fixture.id)}
            dimmedIds={filter === "全部" ? undefined : new Set(fixtures.filter((item) => !filteredIds.has(item.id)).map((item) => item.id))}
            markerFixtures={fixtures}
          />
        </section>

        <aside className="panel-flat inspector">
          {!selected ? (
            <div className="empty-inspector">
              <h2>单灯复检</h2>
              <p>在舞台图或下方 Cue 成员中点击一盏灯，查看确认时间、走位坐标与时效。</p>
            </div>
          ) : (
            (() => {
              const status = getFocusStatus(selected, now);
              return (
                <Fragment key={selected.id}>
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">单灯复检 · CH {selected.channel}</p>
                      <h2>{selected.id}</h2>
                    </div>
                    <span className={PILL_CLASS[status.kind]}>{status.label}</span>
                  </div>

                  <dl className="detail-list">
                    <dt>灯位类型</dt><dd>{selected.type}</dd>
                    <dt>色片</dt><dd>{selected.gel}</dd>
                    <dt>亮度预设</dt><dd>{selected.brightness}%</dd>
                    <dt>计划焦点</dt><dd>X {selected.targetX.toFixed(1)} · Y {selected.targetY.toFixed(1)}</dd>
                    <dt>上次确认</dt><dd>{selected.focus ? `${formatClock(selected.focus.confirmedAt)}（${formatAgo(selected.focus.confirmedAt, now)}）` : "无记录"}</dd>
                    <dt>确认坐标</dt>
                    <dd>
                      ({coordLabel(selected.focus?.x ?? null)}, {coordLabel(selected.focus?.y ?? null)})
                    </dd>
                    <dt>最近走位调整</dt><dd>{formatClock(selected.blockingAdjustAt)}</dd>
                    <dt>时效</dt>
                    <dd>
                      {status.kind === "fresh"
                        ? `剩余 ${formatRemaining(status.remainingMs ?? 0)}`
                        : status.reason}
                    </dd>
                  </dl>

                  <div className="inspector-block">
                    <h3>计划走位焦点</h3>
                    <div className="two-inputs">
                      <label>
                        <span>X（0-{STAGE_W} 米）</span>
                        <input value={targetX} onChange={(event) => setTargetX(event.target.value)} inputMode="decimal" />
                      </label>
                      <label>
                        <span>Y（0-{STAGE_D} 米）</span>
                        <input value={targetY} onChange={(event) => setTargetY(event.target.value)} inputMode="decimal" />
                      </label>
                    </div>
                    <button type="button" className="ghost-btn" onClick={() => handleTargetSave(selected)}>
                      保存计划焦点
                    </button>
                  </div>

                  <div className="inspector-block">
                    <h3>走位调整（排练变动）</h3>
                    <p className="muted small">
                      登记后该灯旧确认记录立即按过期处理，进入“待复检”；记录本身保留，刷新后仍可见。
                    </p>
                    <button
                      type="button"
                      className="warn-btn"
                      onClick={() => onBlockingAdjust(selected.id, Date.now())}
                    >
                      登记一次走位调整
                    </button>
                  </div>

                  <div className="inspector-block">
                    <h3>确认 / 复检焦点</h3>
                    <div className="two-inputs">
                      <label>
                        <span>走位坐标 X</span>
                        <input value={confirmX} onChange={(event) => setConfirmX(event.target.value)} inputMode="decimal" />
                      </label>
                      <label>
                        <span>走位坐标 Y</span>
                        <input value={confirmY} onChange={(event) => setConfirmY(event.target.value)} inputMode="decimal" />
                      </label>
                    </div>
                    <button type="button" className="primary-btn" onClick={() => handleConfirm(selected)}>
                      {selected.focus ? "对该灯复检（仅本灯生效）" : "确认该灯焦点"}
                    </button>
                  </div>
                </Fragment>
              );
            })()
          )}
        </aside>
      </section>

      {rejection && (
        <div className="reject-banner" role="alert">
          <strong>整组拒绝 · {rejection.cueId}</strong>
          <span>
            于 {formatClock(rejection.at)} 执行被拦截，{rejection.blocks.length} 盏灯具未通过：
            {rejection.blocks
              .map((block) => `${block.fixtureId}（${block.status.label}）`)
              .join("、")}
            。原 Cue 顺序、舞台图与预览未改变。
          </span>
        </div>
      )}

      <section className="lower-grid">
        <section className="panel-flat cue-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Cue 触发顺序（固定，拒绝执行不改变顺序）</p>
              <h2>Cue 列表</h2>
            </div>
          </div>
          <div className="cue-list">
            {sortedCues.map((cue) => {
              const check: CueCheckResult = evaluateCue(cue, fixtures, now);
              const isActive = activeCue?.cueId === cue.id;
              return (
                <article key={cue.id} className={`cue-card ${isActive ? "cue-card-active" : ""}`}>
                  <header>
                    <div className="cue-order">Q{cue.order}</div>
                    <div className="cue-title">
                      <h3>{cue.id} · {cue.name}</h3>
                      <p>{cue.note}</p>
                    </div>
                    <button
                      type="button"
                      className={check.allowed ? "primary-btn" : "danger-btn"}
                      onClick={() => onExecuteCue(cue.id)}
                    >
                      {check.allowed ? "执行 Cue" : "整组不可执行"}
                    </button>
                  </header>

                  <div className="cue-fixtures">
                    {cue.fixtureIds.map((fid) => {
                      const fixture = fixtures.find((item) => item.id === fid);
                      const status = statuses.get(fid);
                      const kind: FocusStatusKind = status?.kind ?? "unconfirmed";
                      return (
                        <button
                          key={fid}
                          type="button"
                          className={`fixture-chip ${kind === "fresh" ? "" : `fixture-chip-${kind}`}`}
                          onClick={() => setSelectedId(fid)}
                          title={status?.reason ?? "灯具缺失"}
                        >
                          <i className="chip-dot" style={{ background: KIND_DOT[kind] }} />
                          {fid}
                          {fixture && <em>{fixture.brightness}%</em>}
                        </button>
                      );
                    })}
                  </div>

                  {!check.allowed && (
                    <ul className="block-list">
                      {check.blocks.map((block) => (
                        <li key={block.fixtureId}>
                          <b>{block.fixtureId}</b>：{block.status.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isActive && (
                    <p className="active-line">
                      已于 {activeCue ? formatClock(activeCue.executedAt) : ""} 执行，为当前预览场景
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel-flat preview-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">当前场景预览</p>
              <h2>{activeCueRecord ? `${activeCueRecord.id} · ${activeCueRecord.name}` : "尚无已执行 Cue"}</h2>
            </div>
          </div>
          {activeCueRecord ? (
            <StageMap fixtures={fixtures} now={now} previewCue={activeCueRecord} />
          ) : (
            <div className="stage-wrap">
              <div className="stage stage-empty">
                <span>执行通过校验的 Cue 后，此处显示光束与走位焦点</span>
              </div>
              <div className="audience">观 众 席</div>
            </div>
          )}
        </section>
      </section>

      <section className="lower-grid">
        <section className="panel-flat add-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">灯具档案</p>
              <h2>新增灯具</h2>
            </div>
          </div>
          <div className="add-grid">
            <label>
              <span>灯具编号</span>
              <input placeholder="如 SIDE-09" value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
            </label>
            <label>
              <span>通道号</span>
              <input placeholder="如 CH 029" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} />
            </label>
            <label>
              <span>灯位类型</span>
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FixtureType })}>
                {FIXTURE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              <span>色片</span>
              <input placeholder="如 L201 冷蓝" value={form.gel} onChange={(event) => setForm({ ...form, gel: event.target.value })} />
            </label>
            <label>
              <span>亮度预设 %</span>
              <input value={form.brightness} onChange={(event) => setForm({ ...form, brightness: event.target.value })} inputMode="numeric" />
            </label>
            <div className="two-inputs">
              <label>
                <span>走位焦点 X</span>
                <input value={form.targetX} onChange={(event) => setForm({ ...form, targetX: event.target.value })} inputMode="decimal" />
              </label>
              <label>
                <span>走位焦点 Y</span>
                <input value={form.targetY} onChange={(event) => setForm({ ...form, targetY: event.target.value })} inputMode="decimal" />
              </label>
            </div>
          </div>
          <button type="button" className="primary-btn add-btn" onClick={handleAdd}>新增灯具</button>
        </section>

        <section className="panel-flat notes-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">演出版本备注</p>
              <h2>排练记录</h2>
            </div>
          </div>
          <textarea
            className="notes-area"
            value={versionNote}
            onChange={(event) => onVersionNoteChange(event.target.value)}
            placeholder="记录版本 B、走位调整说明、需演员确认的事项……"
          />
          <p className="muted small">
            说明：所有灯具、确认记录与备注保存在本机浏览器（localStorage），刷新后保留；
            过期与待复检状态由当前时间实时计算，确认有效期 {Math.round(FOCUS_VALID_MS / 60000)} 分钟。
          </p>
        </section>
      </section>
    </main>
  );
}
