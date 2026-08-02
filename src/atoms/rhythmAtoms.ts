import { atom } from 'jotai';
import type { Chart, Judgement } from '../types/chart';

/**
 * 节奏模式（Rhythm Mode）相关的全局状态。
 *
 * 该模块与原有 gameAtoms（手指舞模式）相互独立，避免耦合：
 * 手指舞模式是"模仿静态图案"，节奏模式是"按时间轴击打下落音符"。
 */

/**
 * 待游玩的谱面。
 * 由谱面编辑器（点击"游玩"）或主菜单（选择内置谱面）写入，
 * 供 /play 页面读取。为空时 /play 页面提示无谱面。
 */
export const playChartAtom = atom<Chart | null>(null);

/** 实时判定统计。 */
export interface LiveStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  /** 最近一次判定，用于 UI 弹出反馈；null 表示暂无。 */
  lastJudgement: Judgement | null;
  /** 最近一次判定的时间戳（用于触发动画/淡出）。 */
  lastJudgementAt: number;
}

/** 初始的实时统计。 */
export const initialLiveStats: LiveStats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  perfect: 0,
  good: 0,
  miss: 0,
  lastJudgement: null,
  lastJudgementAt: 0,
};

/** 当前一局的实时统计。 */
export const liveStatsAtom = atom<LiveStats>({ ...initialLiveStats });
