/**
 * 谱面与编辑器相关的 Jotai 状态。
 *
 * - customChartsAtom：用户在编辑器中创建并保存的自定义谱面（自动持久化到 localStorage）；
 * - draftChartAtom：编辑器当前正在编辑的谱面（草稿，未落盘）；
 * - selectedChartAtom：从首页选中、准备开始游戏的谱面。
 */

import { atom } from 'jotai';
import {
  type Chart,
  createEmptyChart,
  parseChart,
} from '../types/chart';

const CUSTOM_CHARTS_KEY = 'finger-dance-custom-charts-v1';

/** 读取本地保存的自定义谱面列表 */
function loadCustomCharts(): Chart[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CHARTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => parseChart(item))
      .filter((c): c is Chart => c !== null);
  } catch {
    return [];
  }
}

/** 保存自定义谱面列表到 localStorage */
function persistCustomCharts(charts: Chart[]): void {
  try {
    localStorage.setItem(CUSTOM_CHARTS_KEY, JSON.stringify(charts));
  } catch (err) {
    console.warn('Failed to persist custom charts', err);
  }
}

/** 用户自定义谱面列表（可写原子） */
export const customChartsAtom = atom<Chart[]>([]);

/** 初始化：应用启动时把 localStorage 内容读入 customChartsAtom */
export const initCustomChartsAtom = atom(null, (_get, set) => {
  set(customChartsAtom, loadCustomCharts());
});

/** 持久化副作用：customChartsAtom 变化时写入 localStorage */
export const persistCustomChartsAtom = atom(null, (get) => {
  persistCustomCharts(get(customChartsAtom));
});

/** 编辑器草稿谱面 */
export const draftChartAtom = atom<Chart>(createEmptyChart());

/**
 * 首页选中、即将进入游戏的谱面。
 * 同时记录它来自内置关卡还是自定义谱面。
 */
export interface SelectedChart {
  chart: Chart;
  source: 'builtin' | 'custom';
}
export const selectedChartAtom = atom<SelectedChart | null>(null);
