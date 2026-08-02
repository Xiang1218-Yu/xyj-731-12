/**
 * 音游对局的实时状态（Jotai）。
 * 由 useGameLogic 驱动写入，由 GameScreen / ResultScreen 订阅渲染。
 * 拆分原则：
 * - 每帧都变化的值（歌曲时间）独立成 atom，避免牵连其他 UI；
 * - 离散事件（判定、连击、分数）各自独立，UI 按需订阅。
 */
import { atom } from 'jotai';
import type { ChartNote } from '../types/chart';
import { computeAccuracy, type JudgmentCounts, type JudgmentKind } from '../lib/judgment';

/** 对局状态机：idle 未开始 → playing 对局中 → finished 已结算 */
export type RhythmStatus = 'idle' | 'playing' | 'finished';

/** 对局状态 */
export const rhythmStatusAtom = atom<RhythmStatus>('idle');

/**
 * 歌曲当前时间（毫秒，相对谱面起点）。
 * 开局前有 LEAD_IN 准备时间，此时该值为负数，由 rAF 每帧更新。
 */
export const songTimeMsAtom = atom<number>(0);

/**
 * 运行时音符：在谱面音符基础上附带判定结果标记。
 * 数组本身在开局时创建一次，判定结果通过修改对象字段 + notesVersionAtom 通知 UI。
 */
export interface RuntimeNote extends ChartNote {
  /** 是否已被判定（击中或超时 Miss） */
  judged: boolean;
  /** 判定结果（judged 为 true 时有值） */
  result?: JudgmentKind;
}

/** 本局的运行时音符列表（按时间升序） */
export const runtimeNotesAtom = atom<RuntimeNote[]>([]);

/** 音符判定版本号：每次判定 +1，用于驱动依赖音符状态的 UI 精确刷新 */
export const notesVersionAtom = atom(0);

/** 当前连击数（Miss 时清零） */
export const comboAtom = atom(0);

/** 本局最大连击数 */
export const maxComboAtom = atom(0);

/** 三档判定计数 */
export const judgmentCountsAtom = atom<JudgmentCounts>({ perfect: 0, good: 0, miss: 0 });

/** 当前总分（每次判定时按 基础分 * 连击倍率 累加） */
export const scoreAtom = atom(0);

/**
 * 最近一次判定事件（用于判定文字弹出动画）。
 * seq 为自增序号，保证连续相同判定也能触发动画重放。
 */
export const lastJudgmentAtom = atom<{
  kind: JudgmentKind;
  /** 按键偏差（毫秒）：负数 = 按早了，正数 = 按晚了；Miss 无偏差概念 */
  deviationMs: number | null;
  seq: number;
} | null>(null);

/** 9 条轨道的按下状态（用于轨道高亮等视觉反馈） */
export const pressedLanesAtom = atom<boolean[]>(Array(9).fill(false));

/** 派生：实时准确率（0~100），随判定计数自动更新 */
export const accuracyAtom = atom((get) => computeAccuracy(get(judgmentCountsAtom)));

/** 派生：歌曲播放进度 0~1（按最后一个音符时间估算，用于进度条） */
export const progressAtom = atom((get) => {
  const notes = get(runtimeNotesAtom);
  const time = get(songTimeMsAtom);
  if (notes.length === 0) return 0;
  const lastTime = notes[notes.length - 1].time;
  if (lastTime <= 0) return 1;
  return Math.min(1, Math.max(0, time / lastTime));
});

/** 结算数据（对局结束时由 useGameLogic 写入，结算页与成绩保存共用） */
export interface FinalStats {
  score: number;
  accuracy: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  maxCombo: number;
  counts: JudgmentCounts;
  /** 本局实际游玩时长（毫秒） */
  durationMs: number;
}

/** 本局结算数据；未结算时为 null */
export const finalStatsAtom = atom<FinalStats | null>(null);
