import { useMemo, useState } from "react";
import { CueRejectReason, validateCue } from "./executeCue";
import {
  FocusStatus,
  FocusStatusKind,
  formatAge,
  formatClock,
  formatRemaining,
  statusMap,
} from "./focusStatus";
import {
  Cue,
  FilterKey,
  LIGHT_TYPES,
  Light,
  LightType,
  NewLightInput,
  ShowState,
} from "./types";

/**
 * 业务文件 3/3：界面层。
 * 只负责展示与交互转发；焦点时效由 focusStatus.ts 计算，
 * 执行整组拒绝由 executeCue.ts 裁决，本文件不写业务判定。
 */

const FILTERS: FilterKey[] = ["全部", ...LIGHT_TYPES, "待复检"];

interface FocusConsoleProps {
  state: ShowState;
  now: number;
  filter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 单灯复检：仅更新该灯的确认时间与走位坐标 */
  onConfirmFocus: (
    lightId: string,
    coordX: number | null,
    coordY: number | null
  ) => void;
  /** 登记一次最新走位调整（使早于它的确认作废） */
  onBlockingAdjust: (lightId: string) => void;
  onExecuteCue: (cueId: string) => void;
  onAddLight: (input: NewLightInput) => boolean;
  onShowNameChange: (name: string) => void;
  onNotesChange: (notes: string) => void;
  onResetSeed: () => void;
  rejectBanner: { cueId: string; message: string } | null;
  onDismissBanner: () => void;
}

export function toneClass(kind: FocusStatusKind | CueRejectReason | null): string {
  if (kind === null) return "st-valid";
  // 灯具数据缺失不是焦点状态，复用灰色（未确认）色调用同一套告警呈现
  if (kind === "light-not-found") return "st-unconfirmed";
  return `st-${kind}`;
}

export default function FocusConsole({
  state,
  now,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  onConfirmFocus,
  onBlockingAdjust,
  onExecuteCue,
  onAddLight,
  onShowNameChange,
  onNotesChange,
  onResetSeed,
  rejectBanner,
  onDismissBanner,
}: FocusConsoleProps) {
  const { lights, cues } = state;
  const statuses = useMemo(() => statusMap(lights, now), [lights, now]);
  const recheckCount = useMemo(
    () => lights.filter((l) => statuses.get(l.id)?.needsRecheck).length,
    [lights, statuses]
  );
  const activeCue = cues.find((c) => c.id === state.activeCueId) ?? null;

  return (
    <main className="app">
      <section className="hero panel">
        <p>焦点时效复核 · 确认后 20 分钟内有效 · 任一灯失效整组拒绝</p>
        <label className="show-name">
          <span>演出名称</span>
          <input
            value={state.showName}
            onChange={(e) => onShowNameChange(e.target.value)}
          />
        </label>
        <div className="hero-meta">
          <button onClick={onResetSeed}>重置演示数据（清本地缓存）</button>
        </div>
      </section>

      <section className="metrics">
        <article>
          <small>灯具数量</small>
          <strong>{lights.length}</strong>
        </article>
        <article>
          <small>Cue 数量</small>
          <strong>{cues.length}</strong>
        </article>
        <article>
          <small>当前场景</small>
          <strong className="metric-text">
            {activeCue ? activeCue.id : "未执行"}
          </strong>
        </article>
        <article className={recheckCount > 0 ? "metric-alert" : ""}>
          <small>待确认焦点</small>
          <strong>{recheckCount}</strong>
        </article>
      </section>

      <section className="board">
        <aside className="panel side-panel">
          <h2>灯具筛选</h2>
          <div className="chips filter-chips">
            {FILTERS.map((f) => {
              const count =
                f === "全部"
                  ? lights.length
                  : f === "待复检"
                    ? recheckCount
                    : lights.filter((l) => l.type === f).length;
              return (
                <button
                  key={f}
                  className={
                    filter === f
                      ? "chip-active"
                      : f === "待复检" && count > 0
                        ? "chip-pending"
                        : ""
                  }
                  onClick={() => onFilterChange(f)}
                >
                  {f}
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          <h3>状态图例</h3>
          <ul className="legend">
            <li>
              <i className="dot st-valid" /> 确认有效（20 分钟内）
            </li>
            <li>
              <i className="dot st-expired" /> 确认已过期
            </li>
            <li>
              <i className="dot st-stale" /> 确认早于走位调整
            </li>
            <li>
              <i className="dot st-missing" /> 走位坐标为空
            </li>
            <li>
              <i className="dot st-unconfirmed" /> 未确认焦点
            </li>
          </ul>
        </aside>

        <section className="panel stage-panel">
          <div className="heading">
            <div>
              <p>舞台平面灯位图</p>
              <h2>当前灯位</h2>
            </div>
            <span className="hint">
              边框/角标标注待复检灯；点击灯位可在右侧复检
            </span>
          </div>
          <StageMap
            lights={lights}
            statuses={statuses}
            now={now}
            filter={filter}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </section>

        <section className="panel cue-panel">
          <div className="heading">
            <div>
              <p>Cue 触发顺序</p>
              <h2>Cue 列表</h2>
            </div>
            <span className="hint">顺序固定，执行不改写</span>
          </div>

          {rejectBanner && (
            <div className="banner">
              <div>
                <b>整组拒绝 · {rejectBanner.cueId}</b>
                <p>{rejectBanner.message}</p>
              </div>
              <button onClick={onDismissBanner}>知道了</button>
            </div>
          )}

          <div className="cue-list">
            {cues.map((cue) => (
              <CueCard
                key={cue.id}
                cue={cue}
                lights={lights}
                now={now}
                selectedId={selectedId}
                onSelect={onSelect}
                onExecute={onExecuteCue}
              />
            ))}
          </div>
        </section>

        <section className="panel focus-panel">
          <div className="heading">
            <div>
              <p>焦点时效复核</p>
              <h2>灯具焦点</h2>
            </div>
          </div>
          <FocusList
            lights={lights}
            statuses={statuses}
            now={now}
            filter={filter}
            selectedId={selectedId}
            onSelect={onSelect}
            onConfirmFocus={onConfirmFocus}
            onBlockingAdjust={onBlockingAdjust}
          />
        </section>

        <section className="panel preview-panel">
          <div className="heading">
            <div>
              <p>当前场景预览</p>
              <h2>{activeCue ? `${activeCue.id} · ${activeCue.name}` : "尚未执行 Cue"}</h2>
            </div>
          </div>
          <PreviewPanel cue={activeCue} lights={lights} />
        </section>

        <section className="panel add-panel">
          <div className="heading">
            <div>
              <p>新增灯具</p>
              <h2>登记灯位</h2>
            </div>
          </div>
          <AddLightForm onAddLight={onAddLight} />
        </section>
      </section>

      <section className="bottom-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p>演出版本备注</p>
              <h2>排练记录</h2>
            </div>
          </div>
          <textarea
            className="notes"
            rows={5}
            value={state.versionNotes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>执行历史</p>
              <h2>成功执行记录</h2>
            </div>
          </div>
          {state.history.length === 0 ? (
            <p className="hint">还没有成功执行的 Cue（被整组拒绝的不会进入）。</p>
          ) : (
            <ul className="history">
              {state.history.map((h, i) => (
                <li key={`${h.cueId}-${h.executedAt}-${i}`}>
                  <b>{h.cueId}</b>
                  <span>
                    {formatClock(h.executedAt)} · {formatAge(now - h.executedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

/* ------------------------------- 舞台图 ------------------------------- */

interface StageMapProps {
  lights: Light[];
  statuses: Map<string, FocusStatus>;
  now: number;
  filter: FilterKey;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function StageMap({
  lights,
  statuses,
  now,
  filter,
  selectedId,
  onSelect,
}: StageMapProps) {
  const selected = lights.find((l) => l.id === selectedId) ?? null;
  const cross =
    selected?.confirmation &&
    selected.confirmation.coordX !== null &&
    selected.confirmation.coordY !== null
      ? {
          x: (selected.confirmation.coordX / 10) * 100,
          y: (selected.confirmation.coordY / 6) * 100,
        }
      : null;

  return (
    <div className="stage-map">
      <span className="stage-tag tag-up">上场门</span>
      <span className="stage-tag tag-down">下场门</span>
      <span className="stage-tag tag-aud">观众席</span>

      {lights.map((light) => {
        const status = statuses.get(light.id);
        if (!status) return null;
        const dim =
          (filter !== "全部" &&
            filter !== "待复检" &&
            light.type !== filter) ||
          (filter === "待复检" && !status.needsRecheck);
        return (
          <button
            key={light.id}
            className={[
              "marker",
              toneClass(status.kind),
              dim ? "marker-dim" : "",
              selectedId === light.id ? "marker-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${light.mapPos.x}%`, top: `${light.mapPos.y}%` }}
            onClick={() =>
              onSelect(selectedId === light.id ? null : light.id)
            }
            title={`${light.id} · ${light.focusLabel} · ${status.label}`}
          >
            <i style={{ background: light.gelColor }} />
            <b>{light.id}</b>
            {status.needsRecheck && <em className="recheck-badge">检</em>}
          </button>
        );
      })}

      {selected && cross && (
        <div
          className="crosshair"
          style={{ left: `${cross.x}%`, top: `${cross.y}%` }}
          title={`${selected.id} 走位坐标 X${selected.confirmation?.coordX}m / Y${selected.confirmation?.coordY}m`}
        >
          <span>
            X{selected.confirmation?.coordX} · Y{selected.confirmation?.coordY}
          </span>
        </div>
      )}
      <span className="map-clock">时钟 {formatClock(now)}</span>
    </div>
  );
}

/* ----------------------------- Cue 列表卡片 ----------------------------- */

interface CueCardProps {
  cue: Cue;
  lights: Light[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onExecute: (cueId: string) => void;
}

function CueCard({
  cue,
  lights,
  now,
  selectedId,
  onSelect,
  onExecute,
}: CueCardProps) {
  const validation = validateCue(cue, lights, now);

  return (
    <article
      className={`cue-card ${validation.canExecute ? "cue-ready" : "cue-blocked"}`}
    >
      <div className="cue-head">
        <div>
          <h3>
            <i className={`dot ${validation.canExecute ? "st-valid" : "st-expired"}`} />
            {cue.id} · {cue.name}
          </h3>
          <p>{cue.note}</p>
        </div>
        <div className="cue-side">
          <small>
            {validation.passedCount}/{cue.lightIds.length} 灯就绪
          </small>
          <button
            className={validation.canExecute ? "primary" : "danger"}
            onClick={() => onExecute(cue.id)}
          >
            执行 Cue
          </button>
        </div>
      </div>
      <div className="cue-lights">
        {validation.checks.map((check) => (
          <button
            key={check.lightId}
            className={[
              "cue-light",
              toneClass(check.kind),
              selectedId === check.lightId ? "cue-light-selected" : "",
            ].join(" ")}
            onClick={() => onSelect(check.lightId)}
            title={check.pass ? "确认有效" : `${check.message}（点击定位单灯复检）`}
          >
            <b>{check.lightId}</b>
            <span>{check.pass ? "有效" : check.message}</span>
            {!check.pass && <em className="recheck-badge">检</em>}
          </button>
        ))}
      </div>
    </article>
  );
}

/* ------------------------------ 焦点复核列表 ------------------------------ */

interface FocusListProps {
  lights: Light[];
  statuses: Map<string, FocusStatus>;
  now: number;
  filter: FilterKey;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onConfirmFocus: (
    lightId: string,
    coordX: number | null,
    coordY: number | null
  ) => void;
  onBlockingAdjust: (lightId: string) => void;
}

function FocusList({
  lights,
  statuses,
  now,
  filter,
  selectedId,
  onSelect,
  onConfirmFocus,
  onBlockingAdjust,
}: FocusListProps) {
  const visible = lights.filter((l) => {
    const status = statuses.get(l.id);
    if (!status) return false;
    if (filter === "全部") return true;
    if (filter === "待复检") return status.needsRecheck;
    return l.type === filter;
  });

  const selected =
    lights.find((l) => l.id === selectedId) ?? visible[0] ?? lights[0] ?? null;

  return (
    <div className="focus-body">
      <div className="focus-rows">
        {visible.length === 0 && <p className="hint">当前筛选下没有灯具。</p>}
        {visible.map((light) => {
          const status = statuses.get(light.id);
          if (!status) return null;
          return (
            <button
              key={light.id}
              className={[
                "focus-row",
                toneClass(status.kind),
                selected?.id === light.id ? "focus-row-active" : "",
              ].join(" ")}
              onClick={() => onSelect(light.id)}
            >
              <i className="gel-dot" style={{ background: light.gelColor }} />
              <b>{light.id}</b>
              <span>{light.type}</span>
              <em className="status-tag">{status.label}</em>
              {status.kind === "valid" && (
                <small className="countdown">
                  剩 {formatRemaining(status.remainingMs)}
                </small>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <LightEditor
          key={selected.id}
          light={selected}
          status={statuses.get(selected.id)!}
          now={now}
          onConfirmFocus={onConfirmFocus}
          onBlockingAdjust={onBlockingAdjust}
        />
      )}
    </div>
  );
}

interface LightEditorProps {
  light: Light;
  status: FocusStatus;
  now: number;
  onConfirmFocus: (
    lightId: string,
    coordX: number | null,
    coordY: number | null
  ) => void;
  onBlockingAdjust: (lightId: string) => void;
}

function LightEditor({
  light,
  status,
  now,
  onConfirmFocus,
  onBlockingAdjust,
}: LightEditorProps) {
  const c = light.confirmation;
  const [x, setX] = useState<string>(
    c?.coordX === null || c?.coordX === undefined ? "" : String(c.coordX)
  );
  const [y, setY] = useState<string>(
    c?.coordY === null || c?.coordY === undefined ? "" : String(c.coordY)
  );

  const handleConfirm = () => {
    const px = x.trim() === "" ? null : Number(x.trim());
    const py = y.trim() === "" ? null : Number(y.trim());
    if ((px !== null && Number.isNaN(px)) || (py !== null && Number.isNaN(py))) {
      window.alert("走位坐标必须是数字（米）。");
      return;
    }
    if (px === null || py === null) {
      const ok = window.confirm(
        "走位坐标为空将无法执行该灯所在的 Cue，仍要按“坐标为空”记录确认吗？"
      );
      if (!ok) return;
    } else {
      if (px < 0 || px > 10 || py < 0 || py > 6) {
        window.alert("走位坐标范围：X 0-10m，Y 0-6m。");
        return;
      }
    }
    onConfirmFocus(light.id, px, py);
  };

  return (
    <div className={`light-editor ${toneClass(status.kind)}`}>
      <div className="editor-head">
        <h3>{light.id}</h3>
        <em className="status-tag">{status.label}</em>
      </div>
      <dl className="editor-meta">
        <div>
          <dt>通道</dt>
          <dd>{light.channel}</dd>
        </div>
        <div>
          <dt>色片</dt>
          <dd>
            <i className="gel-dot" style={{ background: light.gelColor }} />
            {light.gel}
          </dd>
        </div>
        <div>
          <dt>亮度预设</dt>
          <dd>{light.brightness}%</dd>
        </div>
        <div>
          <dt>焦点位置</dt>
          <dd>{light.focusLabel}</dd>
        </div>
        <div>
          <dt>确认时刻</dt>
          <dd>
            {c ? `${formatClock(c.confirmedAt)}（${formatAge(status.ageMs)}）` : "—"}
          </dd>
        </div>
        <div>
          <dt>走位调整</dt>
          <dd>
            {formatClock(light.blockingUpdatedAt)}（
            {formatAge(now - light.blockingUpdatedAt)}）
          </dd>
        </div>
      </dl>

      <p className={`status-reason ${toneClass(status.kind)}`}>{status.reason}</p>
      {status.kind === "valid" && (
        <p className="countdown-line">
          距过期 <b>{formatRemaining(status.remainingMs)}</b>（20 分钟有效）
        </p>
      )}

      <div className="coord-grid">
        <label>
          <span>走位坐标 X（0-10m）</span>
          <input
            inputMode="decimal"
            placeholder="如 5.0"
            value={x}
            onChange={(e) => setX(e.target.value)}
          />
        </label>
        <label>
          <span>走位坐标 Y（0-6m）</span>
          <input
            inputMode="decimal"
            placeholder="如 3.0"
            value={y}
            onChange={(e) => setY(e.target.value)}
          />
        </label>
      </div>

      <div className="editor-actions">
        <button className="primary" onClick={handleConfirm}>
          {c ? "单灯复检（仅更新本灯）" : "确认焦点（记录时间+坐标）"}
        </button>
        <button onClick={() => onBlockingAdjust(light.id)}>
          登记走位调整
        </button>
      </div>
      <p className="hint">
        复检只更新本灯的确认时间与坐标，不替同组其它灯确认；
        登记走位调整后，早于该时刻的旧确认立即失效。
      </p>
    </div>
  );
}

/* -------------------------------- 预览 -------------------------------- */

function PreviewPanel({ cue, lights }: { cue: Cue | null; lights: Light[] }) {
  if (!cue) {
    return (
      <div className="preview-empty">
        <p>等待 Cue 执行……</p>
        <span className="hint">
          只有整组校验通过，预览才会切换；被拒绝时预览保持原状。
        </span>
      </div>
    );
  }

  const byId = new Map(lights.map((l) => [l.id, l]));

  return (
    <div className="preview-stage">
      <div className="preview-beams">
        {cue.lightIds.map((id, idx) => {
          const light = byId.get(id);
          if (!light) return null;
          return (
            <div
              key={id}
              className="beam"
              style={{
                background: `linear-gradient(to bottom, ${light.gelColor}cc, ${light.gelColor}22)`,
                opacity: 0.25 + light.brightness / 130,
                left: `${10 + (idx * 80) / Math.max(1, cue.lightIds.length - 1)}%`,
              }}
            />
          );
        })}
      </div>
      <ol className="preview-order">
        {cue.lightIds.map((id) => {
          const light = byId.get(id);
          if (!light) return null;
          return (
            <li key={id}>
              <i className="gel-dot" style={{ background: light.gelColor }} />
              <b>{id}</b>
              <span>{light.channel}</span>
              <div className="brightness-bar">
                <i style={{ width: `${light.brightness}%` }} />
              </div>
              <em>{light.brightness}%</em>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------ 新增灯具表单 ------------------------------ */

const EMPTY_FORM: NewLightInput = {
  id: "",
  channel: "",
  type: "面光",
  gel: "",
  gelColor: "#7c3aed",
  focusLabel: "",
  brightness: 60,
};

function AddLightForm({
  onAddLight,
}: {
  onAddLight: (input: NewLightInput) => boolean;
}) {
  const [form, setForm] = useState<NewLightInput>(EMPTY_FORM);

  const set = <K extends keyof NewLightInput>(key: K, value: NewLightInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.id.trim() || !form.channel.trim() || !form.focusLabel.trim()) {
      window.alert("灯具编号、通道号、焦点位置必填。");
      return;
    }
    if (onAddLight({ ...form, id: form.id.trim() })) {
      setForm(EMPTY_FORM);
    }
  };

  return (
    <div className="add-grid">
      <label>
        <span>灯具编号</span>
        <input
          placeholder="如 FOH-10"
          value={form.id}
          onChange={(e) => set("id", e.target.value)}
        />
      </label>
      <label>
        <span>通道号</span>
        <input
          placeholder="如 CH 004"
          value={form.channel}
          onChange={(e) => set("channel", e.target.value)}
        />
      </label>
      <label>
        <span>灯型</span>
        <select
          value={form.type}
          onChange={(e) => set("type", e.target.value as LightType)}
        >
          {LIGHT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>色片</span>
        <input
          placeholder="如 暖白 1/2 CTO"
          value={form.gel}
          onChange={(e) => set("gel", e.target.value)}
        />
      </label>
      <label>
        <span>色片色</span>
        <input
          type="color"
          value={form.gelColor}
          onChange={(e) => set("gelColor", e.target.value)}
        />
      </label>
      <label>
        <span>焦点位置</span>
        <input
          placeholder="如 舞台左前区"
          value={form.focusLabel}
          onChange={(e) => set("focusLabel", e.target.value)}
        />
      </label>
      <label>
        <span>亮度预设（%）</span>
        <input
          type="number"
          min={0}
          max={100}
          value={form.brightness}
          onChange={(e) => set("brightness", Number(e.target.value))}
        />
      </label>
      <button className="primary add-submit" onClick={submit}>
        登记灯具（默认未确认）
      </button>
    </div>
  );
}
