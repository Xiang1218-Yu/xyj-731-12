/**
 * 节奏游戏运行时状态（Jotai）。
 *
 * 这些 atom 仅在一局游戏期间使用：
 *  - rhythmStatusAtom：游戏阶段（待机/进行中/暂停/结束）；
 *  - rhythmStatsAtom ：实时判定统计（分数、连击、Perfect/Good/Miss 数量）；
 *  - lastJudgeAtom   ：最近一次判定，用于在 UI 上弹出 Perfect/Good/Miss 提示；
 *  - rhythmResultAtom：一局结束后的完整结算数据（供结算界面展示）。
 */

import { atom } from 'jotai';
import {
  createEmptyStats,
  type JudgeStats,
  type JudgeResult,
  type Rank,
} from '../lib/judgment';
import type { Chart } from '../types/chart';

export type RhythmStatus = 'idle' | 'playing' | 'paused' | 'finished';

/** 游戏阶段 */
export const rhythmStatusAtom = atom<RhythmStatus>('idle');

/**
 * 重启信号：每次 retry 时自增，
 * 用于让 useRhythmGame 的引擎 effect 重新执行（即使 status 仍为 playing）。
 */
export const resetSignalAtom = atom(0);

/** 实时判定统计 */
export const rhythmStatsAtom = atom<JudgeStats>(createEmptyStats());

/** 最近一次判定（用于弹出动画） */
export interface LastJudge {
  result: JudgeResult;
  /** 用于触发动画的自增 key */
  key: number;
  lane?: number;
}
export const lastJudgeAtom = atom<LastJudge | null>(null);

/** 结算数据 */
export interface RhythmResult {
  chart: Chart;
  stats: JudgeStats;
  accuracy: number;
  rank: Rank;
  /** 游玩耗时（秒） */
  playTime: number;
}
export const rhythmResultAtom = atom<RhythmResult | null>(null);
