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

/** 选择判定目标时的音符最小接口（RuntimeNote / ChartNote 均满足） */
interface JudgeableNote {
  time: number;
  lane: number;
  judged: boolean;
}

/**
 * 选择一次按键应判定的音符（按键判定目标选择策略）。
 *
 * 采用「同轨道最早未判定音符优先」（FIFO）策略，而不是「偏差最小优先」：
 * 当同一轨道有多个时间接近的未判定音符时，最早的一个优先消耗本次按键，
 * 其余音符保留给后续按键 —— 这样快速连击时每个音符都能被依次判定，
 * 不会出现「后面的音符被提前吃掉、前面的音符反而漏判」的问题。
 *
 * 另外支持「同时间戳簇」：若同轨道存在多个时间戳相同（误差 ≤1ms）的音符
 * （如编辑器制作的同轨双押），一次按键将它们一并判定，避免同轨簇必然漏一个。
 *
 * @param notes      运行时音符列表（必须按 time 升序）
 * @param lane       按下的轨道
 * @param songTimeMs 按键时刻的歌曲时间
 * @returns 本次按键应判定的音符数组（通常 1 个，同轨簇时多个；无候选为空数组）
 */
export function selectJudgeTargets<T extends JudgeableNote>(
  notes: T[],
  lane: number,
  songTimeMs: number,
): T[] {
  // 收集该轨道上仍在判定窗口内的未判定音符（输入按时间升序，结果自然升序）
  const candidates: T[] = [];
  for (const note of notes) {
    if (note.judged || note.lane !== lane) continue;
    const deviation = songTimeMs - note.time;
    if (deviation > GOOD_WINDOW_MS) {
      // 已超过 Good 窗口的旧音符：留给 rAF 的自动 Miss 流程处理，不用按键消耗
      continue;
    }
    if (-deviation > GOOD_WINDOW_MS) {
      // 音符按时间升序，之后的音符只会更远，提前结束遍历
      break;
    }
    candidates.push(note);
  }
  if (candidates.length === 0) return [];

  // 取时间最早的一个作为判定目标；与其同时间戳（≤1ms）的同轨音符一并返回
  const first = candidates[0];
  return candidates.filter((n) => Math.abs(n.time - first.time) <= 1);
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
