/**
 * 成绩记录的本地持久化（localStorage）。
 *
 * - 每局结束后保存一条 ScoreRecord；
 * - 结构化存储为 JSON 数组，key 固定；
 * - 提供查询、删除、清空等方法；
 * - 对存储容量做了保护：超过上限时丢弃最旧记录，避免 localStorage 空间溢出。
 */

import type { Chart } from '../types/chart';
import type { JudgeStats } from './judgment';

/** 单条成绩记录 */
export interface ScoreRecord {
  /** 唯一 id */
  id: string;
  /** 歌曲名（谱面标题） */
  title: string;
  /** 作者 */
  author: string;
  /** 难度（文本） */
  difficulty: string;
  /** 难度数值（★） */
  level: number;
  /** 总分 */
  score: number;
  /** 准确率（0~1） */
  accuracy: number;
  /** 评级 S/A/B/C/D */
  rank: string;
  /** 最大连击 */
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  /** 游玩耗时（秒） */
  playTime: number;
  /** 记录创建时间戳（毫秒） */
  createdAt: number;
}

const STORAGE_KEY = 'finger-dance-scores-v1';
/** 最多保留的成绩条数，防止 localStorage 被写满 */
const MAX_RECORDS = 500;

/** 读取全部成绩（按时间倒序） */
export function loadScores(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreRecord[];
    if (!Array.isArray(parsed)) return [];
    // 按创建时间倒序
    return parsed.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** 写入全部成绩（内部方法，带容量保护） */
function persist(records: ScoreRecord[]): void {
  // 按时间倒序后裁剪到上限
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt);
  const trimmed = sorted.slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // 配额超限时进一步裁剪直到能写入
    let keep = trimmed.length;
    while (keep > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, keep)));
        break;
      } catch {
        keep = Math.floor(keep / 2);
      }
    }
    console.warn('localStorage quota exceeded, trimmed scores.', err);
  }
}

/** 从一局游戏结果生成并保存一条成绩记录 */
export function saveScore(params: {
  chart: Chart;
  stats: JudgeStats;
  accuracy: number;
  rank: string;
  playTime: number;
}): ScoreRecord {
  const { chart, stats, accuracy, rank, playTime } = params;
  const record: ScoreRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: chart.metadata.title,
    author: chart.metadata.author,
    difficulty: chart.metadata.difficulty,
    level: chart.metadata.level,
    score: stats.score,
    accuracy,
    rank,
    maxCombo: stats.maxCombo,
    perfect: stats.perfect,
    good: stats.good,
    miss: stats.miss,
    playTime,
    createdAt: Date.now(),
  };
  const all = loadScores();
  all.push(record);
  persist(all);
  return record;
}

/** 删除单条成绩 */
export function deleteScore(id: string): void {
  const all = loadScores().filter((r) => r.id !== id);
  persist(all);
}

/** 清空全部成绩 */
export function clearAllScores(): void {
  localStorage.removeItem(STORAGE_KEY);
}
