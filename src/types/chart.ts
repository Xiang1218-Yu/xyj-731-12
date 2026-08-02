/**
 * 谱面（Chart）与判定、成绩相关的共享类型定义。
 *
 * 本文件是整个"节奏模式"（谱面编辑器 + 判定系统 + 成绩记录）的数据契约来源，
 * 编辑器、播放器、排行榜都依赖这里的类型，确保三端数据结构一致。
 */

/** 轨道数量：与原有游戏保持一致，对应键位 A S D F Space J K L ; */
export const TRACK_COUNT = 9;

/**
 * 音符类型。
 * - tap：单击音符（按下即判定）。
 * - hold：长按音符，包含额外的 duration（毫秒）。判定以其"头部"到达时间为准，
 *   尾部仅用于可视化渲染。
 */
export type NoteType = 'tap' | 'hold';

/**
 * 单个音符。
 * - time：音符应被击打的时间戳（毫秒，相对于歌曲/谱面起点，已包含 offset 的语义由生产端保证）。
 * - track：轨道索引，取值 0..TRACK_COUNT-1。
 * - type：音符类型。
 * - duration：仅 hold 音符使用，表示长按持续时间（毫秒）。
 */
export interface ChartNote {
  time: number;
  track: number;
  type: NoteType;
  duration?: number;
}

/** 难度等级标签（用于分类展示与排行榜筛选）。 */
export type DifficultyLevel = 'Easy' | 'Normal' | 'Hard' | 'Expert';

/** 所有可选难度，供下拉选择等 UI 复用。 */
export const DIFFICULTY_LEVELS: DifficultyLevel[] = ['Easy', 'Normal', 'Hard', 'Expert'];

/**
 * 谱面元数据。
 * - title：曲目/谱面标题。
 * - author：谱面作者。
 * - bpm：每分钟节拍数，决定节拍网格与时间换算。
 * - offset：起始偏移量（毫秒），用于对齐音频与第一拍。
 * - difficulty：难度等级标签。
 */
export interface ChartMetadata {
  title: string;
  author: string;
  bpm: number;
  offset: number;
  difficulty: DifficultyLevel;
}

/**
 * 完整谱面文件结构：元数据 + 音符序列。
 * 这是导入/导出 JSON 的顶层结构。
 */
export interface Chart {
  /** 数据格式版本，便于未来做兼容迁移。 */
  version: 1;
  metadata: ChartMetadata;
  /** 音符序列，约定按 time 升序存储。 */
  notes: ChartNote[];
}

/** 判定等级。 */
export type Judgement = 'perfect' | 'good' | 'miss';

/**
 * 一局游戏的成绩记录（持久化到 localStorage）。
 * 字段刻意保持精简、可序列化，避免占用过多存储空间。
 */
export interface ScoreRecord {
  /** 唯一 id（时间戳 + 随机数），用于删除单条记录。 */
  id: string;
  /** 曲目标题。 */
  song: string;
  /** 难度等级。 */
  difficulty: DifficultyLevel;
  /** 最终得分。 */
  score: number;
  /** 准确率（百分比，0-100，保留两位小数）。 */
  accuracy: number;
  /** 最大连击数。 */
  maxCombo: number;
  /** Perfect 数量。 */
  perfect: number;
  /** Good 数量。 */
  good: number;
  /** Miss 数量。 */
  miss: number;
  /** 综合评级（S/A/B/C/D）。 */
  grade: Grade;
  /** 游玩时长（毫秒）。 */
  playTime: number;
  /** 记录创建时间（Unix 毫秒时间戳）。 */
  date: number;
}

/** 综合评级。 */
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
