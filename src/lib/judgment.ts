/**
 * 判定系统核心逻辑（纯函数，便于测试与复用）。
 * 覆盖：判定窗口、三档判定、连击加成计分、实时准确率、S/A/B/C/D 总评等级。
 */

/** Perfect 判定窗口：按键时机与音符到达时间的偏差绝对值 ≤ 45ms */
export const PERFECT_WINDOW_MS = 45;
/** Good 判定窗口：偏差 ≤ 100ms（46~100ms 区间） */
export const GOOD_WINDOW_MS = 100;
/**
 * Miss 兜底窗口：音符越过判定线超过 130ms 仍未被击中，自动判 Miss。
 * 按键时不使用该窗口：偏差 >100ms 的空按不惩罚（避免误触毁掉连击）。
 */
export const MISS_WINDOW_MS = 130;

/** 三档判定结果 */
export type JudgmentKind = 'perfect' | 'good' | 'miss';

/** 每档判定的基础分：Perfect 300 / Good 100 / Miss 0 */
export const BASE_SCORE: Record<JudgmentKind, number> = {
  perfect: 300,
  good: 100,
  miss: 0,
};

/** 判定计数器 */
export interface JudgmentCounts {
  perfect: number;
  good: number;
  miss: number;
}

/**
 * 根据按键偏差（毫秒，取绝对值后传入）给出判定。
 * 返回 null 表示偏差超出 Good 窗口，本次按键不命中任何音符。
 */
export function judgeDeviation(absDeviationMs: number): JudgmentKind | null {
  if (absDeviationMs <= PERFECT_WINDOW_MS) return 'perfect';
  if (absDeviationMs <= GOOD_WINDOW_MS) return 'good';
  return null;
}

/**
 * 连击分数加成倍率：
 * 每 1 连击 +2% 分数，50 连击封顶（最高 2 倍）。
 * 例如 25 连击时倍率 = 1 + 25*0.02 = 1.5，Perfect 可得 300*1.5 = 450 分。
 */
export function comboMultiplier(combo: number): number {
  return 1 + Math.min(Math.max(combo, 0), 50) * 0.02;
}

/**
 * 实时准确率（百分比 0~100）：
 * 按满分加权计算 —— (Perfect*300 + Good*100) / (已判定音符数*300) * 100。
 * 一个音符都未判定时返回 100（开局显示满准确率）。
 */
export function computeAccuracy(counts: JudgmentCounts): number {
  const judged = counts.perfect + counts.good + counts.miss;
  if (judged === 0) return 100;
  const earned = counts.perfect * BASE_SCORE.perfect + counts.good * BASE_SCORE.good;
  return (earned / (judged * BASE_SCORE.perfect)) * 100;
}

/**
 * 结算总评等级（基于最终准确率）：
 * S ≥ 95%，A ≥ 90%，B ≥ 80%，C ≥ 70%，其余 D。
 */
export function computeRank(accuracy: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}
