/**
 * 经典模式（原版「按键序列跟打」玩法）的状态（Jotai）。
 * 与音游下落模式（rhythmAtoms）完全隔离，两种模式互不影响。
 *
 * 玩法回顾：屏幕上排显示目标按键序列（0/1 数组），
 * 玩家把 9 个按键按成与目标完全一致即前进一步，
 * 全部步骤完成则结算用时，按用时评定 S/A/B/C 等级。
 */
import { atom } from 'jotai';

/** 关卡索引条目（public/levels/index.json） */
export interface LegacyLevelMeta {
  id: number;
  name: string;
  file: string;
}

/** 经典模式关卡数据：patterns 为按键序列，ranks 为 S/A/B 用时阈值（秒） */
export interface LegacyLevelData {
  name: string;
  patterns: number[][];
  ranks: number[];
}

/** 关卡索引列表（异步 atom，选歌页 Suspense 内读取） */
export const legacyLevelIndexAtom = atom(async (): Promise<LegacyLevelMeta[]> => {
  const response = await fetch('/levels/index.json');
  if (!response.ok) {
    throw new Error('Failed to fetch level index');
  }
  return (await response.json()) as LegacyLevelMeta[];
});

/** 当前选中的经典关卡（元信息 + 在索引中的位置，用于「下一关」） */
export const selectedLegacyLevelAtom = atom<{ meta: LegacyLevelMeta; index: number } | null>(null);

/**
 * 当前经典关卡的完整数据（同步 atom）。
 * 选歌时由选歌页直接 fetch 后写入，避免在游戏 hook / 游戏屏中读取异步 atom 造成悬念。
 */
export const activeLegacyLevelDataAtom = atom<LegacyLevelData | null>(null);

/** 玩家当前按键状态 [A, S, D, F, Space, J, K, L, ;]（1 = 按下） */
export const classicPlayerStateAtom = atom<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** 当前进行到的步骤下标（对应 patterns 数组） */
export const classicStepAtom = atom<number>(0);

/** 首次按键时刻（Date.now 毫秒，0 = 尚未开始计时） */
export const classicStartTimeAtom = atom<number>(0);

/** 通关用时（毫秒，结算时写入） */
export const classicFinalTimeAtom = atom<number>(0);
