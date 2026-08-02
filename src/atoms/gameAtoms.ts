import { atom } from 'jotai';
import { type ScaleName } from '../lib/audio';
import type {
  Chart,
  Note,
  GameStats,
  NoteJudgment,
  ScoreRecord,
} from '../types/chart';
import { loadScores, saveScore } from '../lib/storage';

// --- 类型别名（保持向后兼容）---
export type Screen =
  | 'levelSelect'
  | 'game'
  | 'result'
  | 'editor'
  | 'ranking';

export interface Level {
  name: string;
  patterns: number[][];
  ranks: number[];
}

export interface LevelIndexInfo {
  id: number;
  name: string;
  file: string;
}

// --- 屏幕导航原子 ---

/** 当前显示的屏幕 */
export const screenAtom = atom<Screen>('levelSelect');

// --- 旧关卡系统（保持向后兼容）---

/** 异步获取内置关卡索引 */
export const levelIndexAtom = atom(async () => {
  const response = await fetch('/levels/index.json');
  if (!response.ok) {
    throw new Error('Failed to fetch level index');
  }
  return response.json() as Promise<LevelIndexInfo[]>;
});

/** 当前选择的音阶 */
export const scaleAtom = atom<ScaleName | 'Custom'>('C Major Scale');

/** 当前选中的内置关卡信息 */
export const selectedLevelInfoAtom = atom<LevelIndexInfo | null>(null);

/** 当前内置关卡索引 */
export const currentLevelIndexAtom = atom<number>(-1);

/** 异步获取当前内置关卡数据 */
export const currentLevelAtom = atom(async (get) => {
  const levelInfo = get(selectedLevelInfoAtom);
  if (!levelInfo) {
    return null;
  }

  const response = await fetch(`/levels/${levelInfo.file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch level: ${response.statusText}`);
  }
  const levelData = (await response.json()) as Level;
  if (!levelData.patterns || !levelData.ranks) {
    throw new Error('Invalid level data format');
  }
  return levelData;
});

// ============================================================
// 新谱面系统原子
// ============================================================

/** 当前正在游玩的谱面（从编辑器或导入的文件） */
export const currentChartAtom = atom<Chart | null>(null);

/** 玩家按键状态 [A, S, D, F, Space, J, K, L, ;] */
export const playerStateAtom = atom<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** 经典模式：当前步骤/模式索引（用于旧关卡系统） */
export const currentStepAtom = atom<number>(0);

/** 游戏开始时间戳（毫秒） */
export const startTimeAtom = atom<number>(0);

/** 游戏结束时间（毫秒，用于成绩记录） */
export const finalTimeAtom = atom<number>(0);

/** 判断游戏是否激活 */
export const gameActiveAtom = atom((get) => {
  const screen = get(screenAtom);
  const chart = get(currentChartAtom);
  return screen === 'game' && chart !== null;
});

// ============================================================
// 判定系统原子
// ============================================================

/** 初始游戏统计数据 */
const INITIAL_STATS: GameStats = {
  perfect: 0,
  good: 0,
  miss: 0,
  combo: 0,
  maxCombo: 0,
  score: 0,
  accuracy: 1,
};

/** 游戏实时统计原子 */
export const gameStatsAtom = atom<GameStats>(INITIAL_STATS);

/** 最近一次判定结果（用于 UI 特效） */
export const lastJudgmentAtom = atom<NoteJudgment | null>(null);

/** 已判定的音符记录列表 */
export const judgedNotesAtom = atom<NoteJudgment[]>([]);

/** 重置游戏统计数据 */
export const resetGameStatsAtom = atom(null, (_get, set) => {
  set(gameStatsAtom, INITIAL_STATS);
  set(lastJudgmentAtom, null);
  set(judgedNotesAtom, []);
});

// ============================================================
// 成绩记录原子
// ============================================================

/** 所有成绩记录（从 localStorage 加载） */
export const scoreRecordsAtom = atom<ScoreRecord[]>(loadScores());

/** 保存一条新成绩并更新状态 */
export const addScoreRecordAtom = atom(null, (_get, set, record: ScoreRecord) => {
  const updated = saveScore(record);
  set(scoreRecordsAtom, updated);
});

// ============================================================
// 编辑器相关原子
// ============================================================

/** 编辑器中正在编辑的谱面 */
export const editorChartAtom = atom<Chart>({
  metadata: {
    title: 'New Chart',
    author: 'Anonymous',
    bpm: 120,
    difficulty: 'Normal',
    offset: 0,
  },
  notes: [],
});

/** 编辑器当前播放位置（毫秒） */
export const editorPlaybackTimeAtom = atom<number>(0);

/** 编辑器是否正在播放 */
export const editorIsPlayingAtom = atom<boolean>(false);

/** 编辑器网格吸附精度（以拍为单位：1 = 全音符，0.5 = 二分音符，0.25 = 四分，0.125 = 八分） */
export const editorGridSnapAtom = atom<number>(0.25);

/** 编辑器时间轴缩放（像素/毫秒） */
export const editorZoomAtom = atom<number>(0.5);

/**
 * 辅助函数：将时间戳吸附到最近的网格线
 * @param time 原始时间（毫秒）
 * @param bpm BPM
 * @param gridSnap 网格精度（拍数）
 * @param offset 偏移量（毫秒）
 */
export function snapToGrid(
  time: number,
  bpm: number,
  gridSnap: number,
  offset: number,
): number {
  const beatDuration = 60000 / bpm; // 一拍的毫秒数
  const gridDuration = beatDuration * gridSnap;
  const adjustedTime = time - offset;
  const snapped = Math.round(adjustedTime / gridDuration) * gridDuration;
  return snapped + offset;
}

/**
 * 辅助函数：根据时间和轨道查找音符
 */
export function findNoteAt(
  notes: Note[],
  time: number,
  lane: number,
  toleranceMs = 10,
): Note | undefined {
  return notes.find(
    (n) => n.lane === lane && Math.abs(n.time - time) <= toleranceMs,
  );
}
