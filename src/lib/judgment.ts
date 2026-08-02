/**
 * 判定系统核心逻辑。
 *
 * - 根据按键时机与音符到达时间的偏差（毫秒）判定为 Perfect / Good / Miss；
 * - 维护连击计数（连续命中不中断，Miss 清零）；
 * - 评分：Perfect=300、Good=100、Miss=0，并根据连击数施加分数加成；
 * - 准确率计算与最终评级 S/A/B/C/D。
 */

import type { ChartNote } from '../types/chart';

/** 判定结果 */
export type JudgeResult = 'perfect' | 'good' | 'miss';

/**
 * 判定时间窗（毫秒）。
 * 以音符时间为 0 点：
 *  - |Δt| <= PERFECT_WINDOW  -> Perfect
 *  - |Δt| <= GOOD_WINDOW     -> Good
 *  - 超过 GOOD_WINDOW（按键太晚，或音符已经流走） -> Miss
 */
export const PERFECT_WINDOW = 50;
export const GOOD_WINDOW = 120;
/** 音符超过判定线多久后算作 Miss（自动流失） */
export const MISS_WINDOW = 150;

/** 各判定的基础分值 */
export const BASE_SCORE: Record<JudgeResult, number> = {
  perfect: 300,
  good: 100,
  miss: 0,
};

/**
 * 根据时间偏差给出判定结果。
 * @param deltaMs 按键时间 - 音符时间（可正可负）
 */
export function judgeByDelta(deltaMs: number): JudgeResult {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_WINDOW) return 'perfect';
  if (abs <= GOOD_WINDOW) return 'good';
  return 'miss';
}

/** 实时统计数据（游戏过程中不断更新） */
export interface JudgeStats {
  perfect: number;
  good: number;
  miss: number;
  /** 当前连击数 */
  combo: number;
  /** 本局最大连击数 */
  maxCombo: number;
  /** 累计分数 */
  score: number;
}

/** 创建一份初始统计 */
export function createEmptyStats(): JudgeStats {
  return { perfect: 0, good: 0, miss: 0, combo: 0, maxCombo: 0, score: 0 };
}

/**
 * 计算连击中的分数加成系数。
 * 设计：每 10 连击提升 10% 加成，上限 100%（即最高 2 倍）。
 */
export function comboMultiplier(combo: number): number {
  const bonus = Math.floor(combo / 10) * 0.1;
  return 1 + Math.min(bonus, 1);
}

/**
 * 应用一次判定结果，返回更新后的统计（不可变更新）。
 * @param stats 当前统计
 * @param result 本次判定
 */
export function applyJudge(stats: JudgeStats, result: JudgeResult): JudgeStats {
  const next: JudgeStats = { ...stats };
  if (result === 'miss') {
    next.miss += 1;
    next.combo = 0;
    return next;
  }
  // perfect / good：连击 +1
  next[result] += 1;
  next.combo = stats.combo + 1;
  next.maxCombo = Math.max(stats.maxCombo, next.combo);
  // 分数 = 基础分 * 连击加成
  const gained = Math.round(BASE_SCORE[result] * comboMultiplier(stats.combo));
  next.score = stats.score + gained;
  return next;
}

/**
 * 结算长按（hold）音符的尾部得分。
 *
 * 设计：头部命中时已经计入一次 Perfect/Good 判定（影响连击与准确率）；
 * 当玩家长按至尾部并成功结束时，额外给予一次与头部同等级的分数奖励
 * （不重复累加 Perfect/Good 计数，也不改变连击与准确率），
 * 这样 Hold 音符的总价值高于普通 Tap，符合节奏游戏惯例。
 *
 * @param stats 当前统计
 * @param headResult 头部命中时的判定等级（perfect/good）
 */
export function applyHoldTail(
  stats: JudgeStats,
  headResult: 'perfect' | 'good',
): JudgeStats {
  const gained = Math.round(BASE_SCORE[headResult] * comboMultiplier(stats.combo));
  return { ...stats, score: stats.score + gained };
}

/**
 * 计算准确率（0~1）。
 * 采用加权：Perfect=1、Good=0.5、Miss=0，再除以总音符数。
 */
export function calcAccuracy(stats: JudgeStats, totalNotes: number): number {
  if (totalNotes <= 0) return 0;
  const weighted = stats.perfect * 1 + stats.good * 0.5;
  return weighted / totalNotes;
}

/** 评级（根据准确率） */
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/**
 * 根据准确率给出评级：
 *  S >= 0.95
 *  A >= 0.90
 *  B >= 0.80
 *  C >= 0.70
 *  D <  0.70
 */
export function calcRank(accuracy: number): Rank {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.9) return 'A';
  if (accuracy >= 0.8) return 'B';
  if (accuracy >= 0.7) return 'C';
  return 'D';
}

/** 计算理论最高分（全部 Perfect 且吃满连击加成），用于展示分数进度 */
export function calcMaxScore(notes: ChartNote[]): number {
  let max = 0;
  for (let i = 0; i < notes.length; i++) {
    max += Math.round(BASE_SCORE.perfect * comboMultiplier(i));
  }
  return max;
}
