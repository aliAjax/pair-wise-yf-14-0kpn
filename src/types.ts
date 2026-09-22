export type LightType = "面光" | "侧光" | "逆光" | "效果光";

export const LIGHT_TYPES: LightType[] = ["面光", "侧光", "逆光", "效果光"];

/** 筛选条件：灯型或“待复检”专属筛选 */
export type FilterKey = "全部" | LightType | "待复检";

/** 舞台平面灯位图上的位置，0-100 百分比坐标 */
export interface StagePoint {
  x: number;
  y: number;
}

/**
 * 单灯焦点确认记录。
 * 确认时必须落时间戳；走位坐标允许为空（空坐标在执行整组 Cue 时会被拒绝）。
 */
export interface FocusConfirmation {
  /** 确认时间（epoch ms） */
  confirmedAt: number;
  /** 走位坐标 X（舞台米制网格，0-10m） */
  coordX: number | null;
  /** 走位坐标 Y（舞台米制网格，0-6m） */
  coordY: number | null;
}

export interface Light {
  /** 灯具编号，如 FOH-03 */
  id: string;
  /** 通道号 */
  channel: string;
  type: LightType;
  /** 色片描述 */
  gel: string;
  /** 色片展示色 */
  gelColor: string;
  /** 焦点位置文字描述 */
  focusLabel: string;
  /** 亮度预设 0-100 */
  brightness: number;
  /** 灯位在舞台图上的固定位置 */
  mapPos: StagePoint;
  /** 最新一次走位调整时间；确认时间早于它即视为走位已变更 */
  blockingUpdatedAt: number;
  /** 当前焦点确认记录；null 表示从未确认（旧记录缺字段时同样按此处理） */
  confirmation: FocusConfirmation | null;
}

export interface Cue {
  /** Cue 编号，如 Cue 12 */
  id: string;
  name: string;
  /** 按原触发顺序排列的灯具编号，执行校验不允许改动其顺序 */
  lightIds: string[];
  note: string;
}

export interface ExecutionRecord {
  cueId: string;
  executedAt: number;
}

export interface ShowState {
  showName: string;
  versionNotes: string;
  lights: Light[];
  cues: Cue[];
  /** 当前场景预览对应的 Cue；只有整组校验通过才会更新 */
  activeCueId: string | null;
  /** 成功执行记录 */
  history: ExecutionRecord[];
}

/** 新增灯具表单提交内容 */
export interface NewLightInput {
  id: string;
  channel: string;
  type: LightType;
  gel: string;
  gelColor: string;
  focusLabel: string;
  brightness: number;
}
