// ============================================================
// 成绩记录 localStorage 管理工具
// ============================================================
import type { ScoreRecord } from '../types/chart';

/** localStorage 键名 */
const STORAGE_KEY = 'finger-dance-scores';

/** 最大存储记录数，防止 localStorage 溢出 */
const MAX_RECORDS = 500;

/**
 * 从 localStorage 读取所有成绩记录
 */
export function loadScores(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScoreRecord[];
  } catch (e) {
    console.error('Failed to load scores from localStorage:', e);
    return [];
  }
}

/**
 * 保存成绩记录到 localStorage
 * 自动限制总记录数，保留最新的 MAX_RECORDS 条
 */
export function saveScore(record: ScoreRecord): ScoreRecord[] {
  const scores = loadScores();
  scores.push(record);

  // 按日期降序排序，保留最新的记录
  scores.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

  // 限制记录数量，防止溢出
  const trimmed = scores.slice(0, MAX_RECORDS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save scores to localStorage:', e);
  }

  return trimmed;
}

/**
 * 删除单条成绩记录
 */
export function deleteScore(id: string): ScoreRecord[] {
  const scores = loadScores();
  const filtered = scores.filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete score:', e);
  }
  return filtered;
}

/**
 * 清空所有成绩记录
 */
export function clearAllScores(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear scores:', e);
  }
}

/**
 * 获取所有不重复的歌曲名（用于筛选）
 */
export function getUniqueSongTitles(scores: ScoreRecord[]): string[] {
  return [...new Set(scores.map((s) => s.songTitle))].sort();
}

/**
 * 获取所有不重复的难度（用于筛选）
 */
export function getUniqueDifficulties(scores: ScoreRecord[]): string[] {
  return [...new Set(scores.map((s) => s.difficulty))].sort();
}
