/**
 * 成绩记录的持久化存储层（基于 localStorage）。
 *
 * 设计要点（避免 localStorage 空间溢出）：
 * 1. 所有成绩存放在单一 key 下的一个数组，一次读写，避免碎片化 key。
 * 2. 设置最大记录条数上限（MAX_RECORDS），超出时按时间淘汰最旧记录。
 * 3. 只存储结构化的精简字段（见 ScoreRecord），不冗余存储谱面等大对象。
 * 4. 写入使用 try/catch，遇到 QuotaExceededError 时自动裁剪后重试。
 */

import type { ScoreRecord } from '../types/chart';

/** localStorage 存储键。 */
const STORAGE_KEY = 'fingerdance.scores.v1';

/** 最大保留记录数，防止无限增长导致存储溢出。 */
const MAX_RECORDS = 500;

/** 从 localStorage 读取全部成绩记录。解析失败时安全返回空数组。 */
export function loadScores(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 简单校验，过滤掉结构异常的脏数据。
    return parsed.filter(
      (r): r is ScoreRecord =>
        r && typeof r.id === 'string' && typeof r.score === 'number'
    );
  } catch {
    return [];
  }
}

/**
 * 将成绩数组写回 localStorage。
 * 超出上限时保留"最新"的 MAX_RECORDS 条（按 date 降序）。
 * 若仍触发配额超限，则逐步裁剪一半后重试，尽最大努力保存。
 */
function persist(records: ScoreRecord[]): void {
  let toSave = records;
  if (toSave.length > MAX_RECORDS) {
    toSave = [...toSave].sort((a, b) => b.date - a.date).slice(0, MAX_RECORDS);
  }

  // 最多重试若干次：每次失败就砍掉一半旧数据。
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      return;
    } catch {
      // 可能是 QuotaExceededError：裁剪后重试。
      if (toSave.length <= 1) return; // 无法再裁剪，放弃。
      toSave = [...toSave]
        .sort((a, b) => b.date - a.date)
        .slice(0, Math.floor(toSave.length / 2));
    }
  }
}

/** 新增一条成绩记录，返回更新后的完整列表。 */
export function addScore(record: ScoreRecord): ScoreRecord[] {
  const records = loadScores();
  records.push(record);
  persist(records);
  return records;
}

/** 按 id 删除单条成绩记录，返回更新后的完整列表。 */
export function deleteScore(id: string): ScoreRecord[] {
  const records = loadScores().filter((r) => r.id !== id);
  persist(records);
  return records;
}

/** 清空全部成绩记录。 */
export function clearScores(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略：即使删除失败也不应影响主流程。
  }
}

/** 生成一个较为唯一的记录 id。 */
export function makeScoreId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
