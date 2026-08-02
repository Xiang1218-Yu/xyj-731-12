/**
 * 全局游戏状态（Jotai）。
 * 本文件负责「页面切换」与「歌曲列表 / 当前歌曲」，
 * 对局内的实时状态（连击、分数、判定等）见 rhythmAtoms.ts。
 */
import { atom } from 'jotai';
import { type ScaleName } from '../lib/audio';
import { chartFromLevel, loadCustomCharts, type LegacyLevel } from '../lib/chart';
import type { Chart } from '../types/chart';
import { rhythmStatusAtom } from './rhythmAtoms';

// --- 类型 ---

/** 主页面内部的三个屏幕：选歌 → 游戏 → 结算 */
export type Screen = 'levelSelect' | 'game' | 'result';

/**
 * 游戏模式：
 * - rhythm  音游下落模式（新玩法：判定 / 连击 / 评分 / 成绩记录）
 * - classic 经典模式（原版玩法：按键序列跟打 + 计时评级）
 */
export type GameMode = 'rhythm' | 'classic';

/**
 * 一首可游玩的歌曲条目。
 * source 含义：
 * - builtin 内置关卡（由 public/levels/*.json 转换为谱面）
 * - custom  编辑器自制并保存到本地曲库的谱面
 * - random  内置随机生成（chart 字段为占位，真正开局时重新随机生成）
 */
export interface SongEntry {
  id: string;
  title: string;
  author: string;
  difficulty: number;
  source: 'builtin' | 'custom' | 'random';
  chart: Chart;
}

// --- Atoms ---

/** 当前显示的屏幕 */
export const screenAtom = atom<Screen>('levelSelect');

/** 当前游戏模式（下落 / 经典），选歌页可切换 */
export const gameModeAtom = atom<GameMode>('rhythm');

/** 当前选择的音阶（决定按键音色），保留原有功能 */
export const scaleAtom = atom<ScaleName | 'Custom'>('C Major Scale');

/**
 * 内置歌曲列表（异步 atom）：
 * 读取关卡索引 → 并发拉取全部关卡 JSON → 逐个转换为谱面。
 */
export const builtinSongsAtom = atom(async (): Promise<SongEntry[]> => {
  const indexResponse = await fetch('/levels/index.json');
  if (!indexResponse.ok) {
    throw new Error('Failed to fetch level index');
  }
  const levelIndex = (await indexResponse.json()) as { id: number; name: string; file: string }[];
  // 并发加载所有关卡文件并转换为谱面歌曲
  return Promise.all(
    levelIndex.map(async (info) => {
      const response = await fetch(`/levels/${info.file}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch level: ${info.file}`);
      }
      const level = (await response.json()) as LegacyLevel;
      const chart = chartFromLevel(level, info.id);
      return {
        id: `builtin-${info.id}`,
        title: chart.metadata.title,
        author: chart.metadata.author,
        difficulty: chart.metadata.difficulty,
        source: 'builtin' as const,
        chart,
      };
    }),
  );
});

/**
 * 自定义歌曲列表：读取编辑器保存到 localStorage 的自制谱面。
 * 编辑器是独立页面，返回主页会整页刷新，因此这里在 atom 初始化时读取即可保证最新。
 */
export const customSongsAtom = atom<SongEntry[]>(
  loadCustomCharts().map((stored) => ({
    id: stored.id,
    title: stored.chart.metadata.title,
    author: stored.chart.metadata.author || 'Custom',
    difficulty: stored.chart.metadata.difficulty,
    source: 'custom' as const,
    chart: stored.chart,
  })),
);

/** 完整歌曲列表 = 内置 + 自定义（随机生成入口在选歌页单独展示） */
export const songListAtom = atom(async (get) => {
  const builtin = await get(builtinSongsAtom);
  return [...builtin, ...get(customSongsAtom)];
});

/** 当前正在游玩 / 结算的歌曲 */
export const activeSongAtom = atom<SongEntry | null>(null);

/** 派生状态：下落模式是否处于「可对局」状态（用于过滤按键输入） */
export const gameActiveAtom = atom(
  (get) =>
    get(gameModeAtom) === 'rhythm' &&
    get(screenAtom) === 'game' &&
    get(activeSongAtom) !== null &&
    get(rhythmStatusAtom) === 'playing',
);
