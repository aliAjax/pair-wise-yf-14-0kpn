import { useEffect, useState } from "react";
import FocusConsole from "./FocusConsole";
import { executeCue } from "./executeCue";
import { clearStorage, createSeedState, loadState, saveState } from "./store";
import { FilterKey, Light, NewLightInput, ShowState } from "./types";

/**
 * 顶层只负责状态装配与持久化：
 * 焦点状态计算 → focusStatus.ts
 * Cue 执行校验 → executeCue.ts
 * 界面          → FocusConsole.tsx
 */

/** 新增灯具按灯型在舞台图上的默认摆放位（依次轮转） */
const TYPE_SLOTS: Record<string, { x: number; y: number }[]> = {
  面光: [
    { x: 12, y: 12 },
    { x: 30, y: 12 },
    { x: 48, y: 12 },
    { x: 66, y: 12 },
    { x: 84, y: 12 },
  ],
  侧光: [
    { x: 6, y: 30 },
    { x: 94, y: 30 },
    { x: 6, y: 62 },
    { x: 94, y: 62 },
  ],
  逆光: [
    { x: 18, y: 86 },
    { x: 40, y: 86 },
    { x: 70, y: 86 },
    { x: 86, y: 86 },
  ],
  效果光: [
    { x: 74, y: 30 },
    { x: 26, y: 30 },
    { x: 74, y: 66 },
    { x: 26, y: 66 },
  ],
};

function App() {
  const [state, setState] = useState<ShowState>(() => loadState());
  // 每秒推进：驱动“剩 mm:ss”倒计时与过期状态的实时翻转
  const [now, setNow] = useState<number>(() => Date.now());
  const [filter, setFilter] = useState<FilterKey>("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectBanner, setRejectBanner] = useState<{
    cueId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  /** 单灯复检：只写该灯的确认时间与走位坐标，不影响其它灯与任何 Cue */
  const handleConfirmFocus = (
    lightId: string,
    coordX: number | null,
    coordY: number | null
  ) => {
    setState((prev) => ({
      ...prev,
      lights: prev.lights.map((l) =>
        l.id === lightId
          ? {
              ...l,
              confirmation: { confirmedAt: Date.now(), coordX, coordY },
            }
          : l
      ),
    }));
  };

  /** 登记走位调整：只更新该灯时间戳，旧确认因“早于走位调整”而失效 */
  const handleBlockingAdjust = (lightId: string) => {
    setState((prev) => ({
      ...prev,
      lights: prev.lights.map((l) =>
        l.id === lightId ? { ...l, blockingUpdatedAt: Date.now() } : l
      ),
    }));
  };

  const handleExecuteCue = (cueId: string) => {
    const result = executeCue(state, cueId, Date.now());
    if (result.ok && result.nextState) {
      // 只有整组通过：切预览、记历史；顺序和舞台图数据本身不动
      setState(result.nextState);
      setRejectBanner(null);
    } else {
      // 整组拒绝：state 完全不写，原 Cue 顺序、舞台图、预览保持原状
      setRejectBanner({
        cueId,
        message: result.validation.rejectMessage ?? "存在待复检灯具。",
      });
    }
  };

  const handleAddLight = (input: NewLightInput): boolean => {
    if (state.lights.some((l) => l.id === input.id)) {
      window.alert(`灯具编号 ${input.id} 已存在。`);
      return false;
    }
    const sameType = state.lights.filter((l) => l.type === input.type).length;
    const slots = TYPE_SLOTS[input.type] ?? TYPE_SLOTS["效果光"];
    const slot = slots[sameType % slots.length];
    const t = Date.now();
    const light: Light = {
      ...input,
      mapPos: slot,
      // 新灯从未确认焦点，天然进入“待复检”
      blockingUpdatedAt: t,
      confirmation: null,
    };
    setState((prev) => ({ ...prev, lights: [...prev.lights, light] }));
    setSelectedId(light.id);
    return true;
  };

  const handleResetSeed = () => {
    if (!window.confirm("清空本地缓存并恢复演示数据？当前修改将丢失。")) return;
    clearStorage();
    const seed = createSeedState();
    setState(seed);
    setRejectBanner(null);
    setSelectedId(null);
    setFilter("全部");
  };

  return (
    <FocusConsole
      state={state}
      now={now}
      filter={filter}
      onFilterChange={setFilter}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onConfirmFocus={handleConfirmFocus}
      onBlockingAdjust={handleBlockingAdjust}
      onExecuteCue={handleExecuteCue}
      onAddLight={handleAddLight}
      onShowNameChange={(name) =>
        setState((prev) => ({ ...prev, showName: name }))
      }
      onNotesChange={(notes) =>
        setState((prev) => ({ ...prev, versionNotes: notes }))
      }
      onResetSeed={handleResetSeed}
      rejectBanner={rejectBanner}
      onDismissBanner={() => setRejectBanner(null)}
    />
  );
}

export default App;
