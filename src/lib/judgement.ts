/**
 * 判定系统与评分体系的纯逻辑函数集合。
 *
 * 这里只放"无副作用的纯计算"，方便单元推理与复用：
 * - 时间偏差 -> 判定等级（Perfect/Good/Miss）
 * - 判定等级 -> 基础分
 * - 连击数 -> 分数加成倍率
 * - 统计数据 -> 准确率与综合评级
 */

import type { Grade, Judgement } from '../types/chart';

/**
 * 判定时间窗口（毫秒，绝对值）。
 * 按键时机与音符目标时间的偏差在此窗口内视为对应等级。
 * - Perfect：|Δt| <= PERFECT_WINDOW
 * - Good：PERFECT_WINDOW < |Δt| <= GOOD_WINDOW
 * - Miss：|Δt| > GOOD_WINDOW（或音符完全未被击打）
 */
export const PERFECT_WINDOW = 50;
export const GOOD_WINDOW = 120;

/**
 * 超过该窗口后音符不再可被击打，直接判定为 Miss。
 * 与 GOOD_WINDOW 相同——即当音符时间点过去超过 GOOD_WINDOW 仍未被击打时算 Miss。
 */
export const MISS_WINDOW = GOOD_WINDOW;

/** 各判定等级的基础分。 */
export const BASE_SCORE: Record<Judgement, number> = {
  perfect: 300,
  good: 100,
  miss: 0,
};

/**
 * 根据按键时机与音符目标时间的偏差（deltaMs = 按键时间 - 音符时间）判定等级。
 * 传入的是有符号偏差，这里取绝对值比较窗口。
 */
export function judgeByDelta(deltaMs: number): Judgement {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_WINDOW) return 'perfect';
  if (abs <= GOOD_WINDOW) return 'good';
  return 'miss';
}

/**
 * 连击加成倍率。
 * 连击越高，单个音符得分越高，但设置上限避免分数爆炸。
 * 规则：每 10 连击增加 10% 加成，最高 +50%。
 */
export function comboMultiplier(combo: number): number {
  const bonus = Math.floor(combo / 10) * 0.1;
  return 1 + Math.min(bonus, 0.5);
}

/**
 * 计算单个音符命中所得分数（已含连击加成）。
 * @param judgement 判定等级
 * @param comboBeforeHit 命中"之前"的连击数（命中后连击才 +1）
 */
export function scoreForHit(judgement: Judgement, comboBeforeHit: number): number {
  const base = BASE_SCORE[judgement];
  if (base === 0) return 0;
  // 使用命中后的连击数（+1）计算加成，使连击奖励更直观。
  return Math.round(base * comboMultiplier(comboBeforeHit + 1));
}

/**
 * 准确率计算。
 * 采用加权命中率：Perfect 记满权重(1.0)，Good 记半权重(0.5)，Miss 记 0。
 * 结果为百分比，保留两位小数。
 * @returns 0-100 的数值
 */
export function calcAccuracy(perfect: number, good: number, miss: number): number {
  const total = perfect + good + miss;
  if (total === 0) return 0;
  const weighted = perfect * 1 + good * 0.5;
  return Math.round((weighted / total) * 10000) / 100;
}

/**
 * 综合评级（S/A/B/C/D）。
 * 依据准确率划分：
 * - S：>= 95%
 * - A：>= 90%
 * - B：>= 80%
 * - C：>= 70%
 * - D：其余
 */
export function calcGrade(accuracy: number): Grade {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}

/** 判定等级对应的展示文案与配色（供 UI 复用）。 */
export const JUDGEMENT_STYLE: Record<Judgement, { label: string; className: string }> = {
  perfect: { label: 'PERFECT', className: 'text-yellow-300' },
  good: { label: 'GOOD', className: 'text-sky-300' },
  miss: { label: 'MISS', className: 'text-rose-400' },
};
