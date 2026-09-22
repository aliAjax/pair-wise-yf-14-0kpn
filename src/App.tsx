import { useEffect, useState } from "react";
import LightingConsole from "./LightingConsole";
import {
  type Cue,
  type Fixture,
  type FixtureType,
  type NewFixtureInput,
} from "./focusStatus";
import {
  type ActiveCue,
  type RejectionNotice,
  evaluateCue,
} from "./cueExecution";
import "./styles.css";

const STORAGE_KEY = "hxyfront-62002-console-v1";

interface PersistState {
  version: 1;
  production: string;
  versionNote: string;
  fixtures: Fixture[];
  cues: Cue[];
  activeCue: ActiveCue | null;
  rejection: RejectionNotice | null;
}

const TYPE_COLOR: Record<FixtureType, string> = {
  面光: "#ffe9b3",
  侧光: "#60a5fa",
  逆光: "#fbbf24",
  效果光: "#f59e0b",
};

function buildSeedState(): PersistState {
  const now = Date.now();
  const min = 60 * 1000;
  const longAgo = now - 120 * min;

  const fixtures: Fixture[] = [
    // 面光
    {
      id: "FOH-01", channel: "CH 001", type: "面光", gel: "L152 暖白", gelColor: TYPE_COLOR["面光"],
      brightness: 80, stageX: 2.2, stageY: 7.3, targetX: 3.5, targetY: 4.0,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 6 * min, x: 3.5, y: 4.0 },
    },
    {
      id: "FOH-02", channel: "CH 002", type: "面光", gel: "L152 暖白", gelColor: TYPE_COLOR["面光"],
      brightness: 80, stageX: 9.8, stageY: 7.3, targetX: 8.5, targetY: 4.0,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 45 * min, x: 8.5, y: 4.0 },
    },
    // 效果光（含追光）
    {
      id: "FOH-03", channel: "CH 018", type: "效果光", gel: "L205 追光白", gelColor: TYPE_COLOR["效果光"],
      brightness: 100, stageX: 6.0, stageY: 7.5, targetX: 9.2, targetY: 5.0,
      blockingAdjustAt: now - 30 * min, focus: { confirmedAt: now - 4 * min, x: 9.2, y: 5.0 },
    },
    {
      id: "EFF-01", channel: "CH 019", type: "效果光", gel: "L128 琥珀", gelColor: TYPE_COLOR["效果光"],
      brightness: 55, stageX: 10.8, stageY: 6.8, targetX: 6.0, targetY: 2.5,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 8 * min, x: 6.0, y: 2.5 },
    },
    // 侧光（CH 021-028）
    {
      id: "SIDE-01", channel: "CH 021", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 0.5, stageY: 1.8, targetX: 2.8, targetY: 2.2,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 3 * min, x: 2.8, y: 2.2 },
    },
    {
      id: "SIDE-02", channel: "CH 022", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 0.5, stageY: 3.4, targetX: 3.0, targetY: 3.6,
      // 走位 2 分钟前刚调整，早于确认 -> 待复检；旧记录保留
      blockingAdjustAt: now - 2 * min, focus: { confirmedAt: now - 10 * min, x: 2.6, y: 3.3 },
    },
    {
      id: "SIDE-03", channel: "CH 023", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 0.5, stageY: 5.0, targetX: 3.2, targetY: 5.0,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 12 * min, x: 3.2, y: 5.0 },
    },
    {
      id: "SIDE-04", channel: "CH 024", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 0.5, stageY: 6.6, targetX: 3.0, targetY: 6.2,
      blockingAdjustAt: now - 50 * min, focus: null,
    },
    {
      id: "SIDE-05", channel: "CH 025", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 11.5, stageY: 1.8, targetX: 9.2, targetY: 2.2,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 18 * min, x: 9.2, y: 2.2 },
    },
    {
      id: "SIDE-06", channel: "CH 026", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 11.5, stageY: 3.4, targetX: 9.0, targetY: 3.6,
      // 旧记录走位坐标缺失 -> 坐标为空
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 6 * min, x: null, y: null },
    },
    {
      id: "SIDE-07", channel: "CH 027", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 11.5, stageY: 5.0, targetX: 8.8, targetY: 5.0,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 35 * min, x: 8.8, y: 5.0 },
    },
    {
      id: "SIDE-08", channel: "CH 028", type: "侧光", gel: "L201 冷蓝", gelColor: TYPE_COLOR["侧光"],
      brightness: 65, stageX: 11.5, stageY: 6.6, targetX: 9.2, targetY: 6.2,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 2 * min, x: 9.2, y: 6.2 },
    },
    // 逆光
    {
      id: "BACK-01", channel: "CH 041", type: "逆光", gel: "L154 浅金", gelColor: TYPE_COLOR["逆光"],
      brightness: 70, stageX: 3.0, stageY: 0.5, targetX: 4.0, targetY: 2.5,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 7 * min, x: 4.0, y: 2.5 },
    },
    {
      id: "BACK-02", channel: "CH 042", type: "逆光", gel: "L154 浅金", gelColor: TYPE_COLOR["逆光"],
      brightness: 70, stageX: 6.0, stageY: 0.5, targetX: 6.0, targetY: 2.5,
      blockingAdjustAt: longAgo, focus: { confirmedAt: now - 7 * min, x: 6.0, y: 2.5 },
    },
    {
      id: "BACK-03", channel: "CH 043", type: "逆光", gel: "L154 浅金", gelColor: TYPE_COLOR["逆光"],
      brightness: 70, stageX: 9.0, stageY: 0.5, targetX: 8.0, targetY: 2.5,
      blockingAdjustAt: now - 40 * min, focus: null,
    },
  ];

  const cues: Cue[] = [
    {
      id: "Cue 12", order: 12, name: "冷蓝侧光", brightness: 65, note: "二幕开场，CH 021-028",
      fixtureIds: ["SIDE-01", "SIDE-02", "SIDE-03", "SIDE-04", "SIDE-05", "SIDE-06", "SIDE-07", "SIDE-08"],
    },
    {
      id: "Cue 18", order: 18, name: "追光入场", brightness: 100, note: "FOH-03，焦点门口，需演员走位确认",
      fixtureIds: ["FOH-03"],
    },
    {
      id: "Cue 24", order: 24, name: "暖色谢幕", brightness: 80, note: "全台面光与逆光，版本 B",
      fixtureIds: ["FOH-01", "FOH-02", "BACK-01", "BACK-02", "BACK-03"],
    },
  ];

  return {
    version: 1,
    production: "《冬日回声》彩排 · 版本 B",
    versionNote:
      "Cue 12 冷蓝侧光用于二幕开场；SIDE-02 演员走位 2 分钟前调整，待复检。\nCue 18 追光焦点为上场门，已由演员确认。\nCue 24 谢幕面光 80%，FOH-02 与 BACK-03 仍需确认。",
    fixtures,
    cues,
    activeCue: null,
    rejection: null,
  };
}

function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistState;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.fixtures) && Array.isArray(parsed.cues)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落到演示数据
  }
  return buildSeedState();
}

function slotForFixture(type: FixtureType, count: number): { stageX: number; stageY: number } {
  switch (type) {
    case "面光":
      return { stageX: [1.5, 4.5, 7.5, 10.5][count % 4], stageY: 7.3 };
    case "侧光":
      return count % 2 === 0
        ? { stageX: 0.5, stageY: 1.8 + ((count / 2) % 4) * 1.6 }
        : { stageX: 11.5, stageY: 1.8 + (((count - 1) / 2) % 4) * 1.6 };
    case "逆光":
      return { stageX: [3, 6, 9, 1.5, 10.5][count % 5], stageY: 0.5 };
    case "效果光":
      return { stageX: [6, 10.8, 1.2, 8.5][count % 4], stageY: 7.0 };
  }
}

function App() {
  const [state, setState] = useState<PersistState>(loadState);
  const [now, setNow] = useState(() => Date.now());

  // 每秒刷新，倒计时与过期判定实时更新
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 刷新后保留：灯具、确认记录、旧记录、备注、执行与拒绝留痕
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 隐私模式等情况下静默保留内存状态
    }
  }, [state]);

  const patchFixture = (fixtureId: string, patch: Partial<Fixture>) => {
    setState((prev) => ({
      ...prev,
      fixtures: prev.fixtures.map((fixture) =>
        fixture.id === fixtureId ? { ...fixture, ...patch } : fixture,
      ),
    }));
  };

  const handleReconfirm = (fixtureId: string, x: number, y: number, at: number) => {
    // 复检只更新单灯：仅写该灯的确认时间与走位坐标，不触碰同组其他灯具
    patchFixture(fixtureId, { focus: { confirmedAt: at, x, y } });
  };

  const handleBlockingAdjust = (fixtureId: string, at: number) => {
    // 旧确认记录不删除，因 confirmedAt 早于新的调整时间，会被判定为待复检
    patchFixture(fixtureId, { blockingAdjustAt: at });
  };

  const handleTargetChange = (fixtureId: string, x: number, y: number) => {
    patchFixture(fixtureId, { targetX: x, targetY: y });
  };

  const handleAddFixture = (input: NewFixtureInput) => {
    setState((prev) => {
      const count = prev.fixtures.filter((fixture) => fixture.type === input.type).length;
      const slot = slotForFixture(input.type, count);
      const fixture: Fixture = {
        id: input.id,
        channel: input.channel,
        type: input.type,
        gel: input.gel,
        gelColor: TYPE_COLOR[input.type],
        brightness: input.brightness,
        stageX: slot.stageX,
        stageY: slot.stageY,
        targetX: input.targetX,
        targetY: input.targetY,
        blockingAdjustAt: Date.now(),
        focus: null,
      };
      return { ...prev, fixtures: [...prev.fixtures, fixture] };
    });
  };

  const handleExecuteCue = (cueId: string) => {
    setState((prev) => {
      const cue = prev.cues.find((item) => item.id === cueId);
      if (!cue) return prev;
      // 执行时再次按当前时间整组校验
      const result = evaluateCue(cue, prev.fixtures, Date.now());
      if (!result.allowed) {
        // 整组拒绝：Cue 顺序、舞台图、预览全部保持不动，仅留下拦截留痕
        return {
          ...prev,
          rejection: { cueId, at: Date.now(), blocks: result.blocks },
        };
      }
      return {
        ...prev,
        activeCue: { cueId, executedAt: Date.now() },
        rejection: null,
      };
    });
  };

  return (
    <LightingConsole
      production={state.production}
      onProductionChange={(production) => setState((prev) => ({ ...prev, production }))}
      versionNote={state.versionNote}
      onVersionNoteChange={(versionNote) => setState((prev) => ({ ...prev, versionNote }))}
      fixtures={state.fixtures}
      cues={state.cues}
      now={now}
      activeCue={state.activeCue}
      rejection={state.rejection}
      onExecuteCue={handleExecuteCue}
      onReconfirm={handleReconfirm}
      onBlockingAdjust={handleBlockingAdjust}
      onTargetChange={handleTargetChange}
      onAddFixture={handleAddFixture}
    />
  );
}

export default App;
