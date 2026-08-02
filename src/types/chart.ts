// ============================================================
// 谱面相关类型定义
// ============================================================

/** 音符类型：普通音符（tap）或长按音符（hold，预留扩展） */
export type NoteType = 'tap';

/** 单条音符数据结构 */
export interface Note {
  /** 音符时间戳（毫秒，相对于谱面开始） */
  time: number;
  /** 轨道索引（0-8，对应 9 个按键） */
  lane: number;
  /** 音符类型 */
  type: NoteType;
  /** 可选：唯一标识符，用于编辑器和游戏内追踪 */
  id?: string;
}

/** 谱面元数据 */
export interface ChartMetadata {
  /** 歌曲/谱面标题 */
  title: string;
  /** 作者 */
  author: string;
  /** BPM（每分钟节拍数） */
  bpm: number;
  /** 难度等级（1-10 或自定义字符串） */
  difficulty: string;
  /** 音频偏移量（毫秒） */
  offset: number;
}

/** 完整谱面文件结构 */
export interface Chart {
  /** 元数据 */
  metadata: ChartMetadata;
  /** 音符序列 */
  notes: Note[];
}

// ============================================================
// 判定系统相关类型定义
// ============================================================

/** 判定等级 */
export type Judgment = 'perfect' | 'good' | 'miss';

/** 单条音符的判定结果 */
export interface NoteJudgment {
  /** 对应的音符 */
  note: Note;
  /** 判定结果 */
  judgment: Judgment;
  /** 时间偏差（毫秒，正数表示晚按，负数表示早按） */
  delta: number;
}

/** 游戏实时统计数据 */
export interface GameStats {
  /** Perfect 判定数量 */
  perfect: number;
  /** Good 判定数量 */
  good: number;
  /** Miss 判定数量 */
  miss: number;
  /** 当前连击数 */
  combo: number;
  /** 最大连击数 */
  maxCombo: number;
  /** 当前总分 */
  score: number;
  /** 准确率（0-1） */
  accuracy: number;
}

// ============================================================
// 成绩记录相关类型定义
// ============================================================

/** 单条游戏成绩记录 */
export interface ScoreRecord {
  /** 记录唯一 ID */
  id: string;
  /** 歌曲名称 */
  songTitle: string;
  /** 难度 */
  difficulty: string;
  /** 总分 */
  score: number;
  /** 准确率（0-1） */
  accuracy: number;
  /** 最大连击 */
  maxCombo: number;
  /** Perfect 数量 */
  perfect: number;
  /** Good 数量 */
  good: number;
  /** Miss 数量 */
  miss: number;
  /** 总音符数 */
  totalNotes: number;
  /** 游玩时间（ISO 字符串） */
  playedAt: string;
  /** 游戏时长（毫秒） */
  playDuration: number;
}

// ============================================================
// 判定窗口配置
// ============================================================

/** 判定时间窗口（毫秒） */
export const JUDGMENT_WINDOWS = {
  /** Perfect: ±50ms */
  perfect: 50,
  /** Good: ±100ms */
  good: 100,
  /** Miss: 超过 100ms 未命中 */
  miss: 100,
} as const;

/** 各判定基础分数 */
export const SCORE_VALUES = {
  perfect: 300,
  good: 100,
  miss: 0,
} as const;

/**
 * 计算等级
 * S: 95%+, A: 90%+, B: 80%+, C: 70%+, D: <70%
 */
export function getRank(accuracy: number): { rank: string; color: string } {
  const accPercent = accuracy * 100;
  if (accPercent >= 95) return { rank: 'S', color: 'text-yellow-400' };
  if (accPercent >= 90) return { rank: 'A', color: 'text-emerald-400' };
  if (accPercent >= 80) return { rank: 'B', color: 'text-blue-400' };
  if (accPercent >= 70) return { rank: 'C', color: 'text-orange-400' };
  return { rank: 'D', color: 'text-red-400' };
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
