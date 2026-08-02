/**
 * 内置关卡加载与转换。
 *
 * 旧版游戏的关卡是「按键模式序列」（patterns），每一步要求玩家同时按下若干键。
 * 为了让这些关卡在新的节奏游戏引擎中可玩，这里把 patterns 转换成带时间戳的音符：
 *  - 使用固定 BPM（120）；
 *  - 每一拍对应一个 step；
 *  - pattern 中值为 1 的轨道在该拍生成一个 tap 音符。
 *
 * 同时保留从 /levels/index.json 读取关卡列表的能力。
 */

import type { Chart, ChartNote, Difficulty, Lane } from '../types/chart';

/** 旧版关卡结构 */
export interface LegacyLevel {
  name: string;
  patterns: number[][];
  ranks: number[];
}

export interface LevelIndexInfo {
  id: number;
  name: string;
  file: string;
}

/** 内置关卡使用的固定 BPM（把旧 pattern 映射为音符的节拍） */
const BUILTIN_BPM = 120;

/** 把旧版 patterns 转换为音符序列 */
export function patternsToNotes(
  patterns: number[][],
  bpm = BUILTIN_BPM,
): ChartNote[] {
  const beatDur = 60 / bpm;
  const notes: ChartNote[] = [];
  patterns.forEach((pattern, step) => {
    pattern.forEach((value, lane) => {
      if (value === 1) {
        notes.push({
          time: step * beatDur,
          lane: lane as Lane,
          type: 'tap',
        });
      }
    });
  });
  return notes;
}

/** 根据旧关卡数据构造完整 Chart */
export function legacyLevelToChart(level: LegacyLevel, id = 0): Chart {
  // 根据音符数量粗略估计难度数值
  const totalNotes = level.patterns.reduce(
    (sum, p) => sum + p.filter((v) => v === 1).length,
    0,
  );
  let difficulty: Difficulty = 'Easy';
  let star = 3;
  if (totalNotes > 120) {
    difficulty = 'Hard';
    star = 8;
  } else if (totalNotes > 60) {
    difficulty = 'Normal';
    star = 5;
  }
  return {
    version: 1,
    metadata: {
      title: level.name,
      author: 'Built-in',
      bpm: BUILTIN_BPM,
      offset: 0,
      difficulty,
      level: star,
    },
    notes: patternsToNotes(level.patterns),
    // 保留 id 信息在 title 中（这里不额外加字段以免破坏类型）
    ...(id ? { _levelId: id } : {}),
  } as Chart;
}

/** 读取内置关卡索引 */
export async function fetchLevelIndex(): Promise<LevelIndexInfo[]> {
  const response = await fetch('/levels/index.json');
  if (!response.ok) throw new Error('Failed to fetch level index');
  return response.json() as Promise<LevelIndexInfo[]>;
}

/** 根据 file 读取单个内置关卡并转成 Chart */
export async function fetchLevelAsChart(file: string): Promise<Chart> {
  const response = await fetch(`/levels/${file}`);
  if (!response.ok) throw new Error(`Failed to fetch level: ${response.statusText}`);
  const level = (await response.json()) as LegacyLevel;
  return legacyLevelToChart(level);
}
