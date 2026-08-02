// ============================================================
// 自定义谱面本地存储管理 (customCharts storage)
// ============================================================
// 负责将编辑器中创建的谱面保存到 localStorage，
// 以便在首页直接选择游玩。
// ============================================================

import type { Chart } from '../types/chart';
import { generateId } from '../types/chart';

// localStorage 键名
const STORAGE_KEY = 'finger-dance-custom-charts';

/** 存储的自定义谱面结构（附带 id 和保存时间） */
export interface StoredChart {
  id: string;
  chart: Chart;
  savedAt: string; // ISO 时间字符串
}

/**
 * 读取所有已保存的自定义谱面
 * 按保存时间倒序排列（最新的在前）
 */
export function loadCustomCharts(): StoredChart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChart[];
    if (!Array.isArray(parsed)) return [];
    // 按保存时间倒序
    return parsed.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * 保存一个谱面（如果 id 已存在则更新，否则新增）
 * 返回保存后的 StoredChart
 */
export function saveCustomChart(chart: Chart, existingId?: string): StoredChart {
  const charts = loadCustomCharts();
  const now = new Date().toISOString();

  if (existingId) {
    // 更新已有谱面
    const idx = charts.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: StoredChart = {
        ...charts[idx],
        chart,
        savedAt: now,
      };
      charts[idx] = updated;
      writeCharts(charts);
      return updated;
    }
  }

  // 新增谱面
  const newEntry: StoredChart = {
    id: generateId(),
    chart,
    savedAt: now,
  };
  charts.unshift(newEntry);
  writeCharts(charts);
  return newEntry;
}

/**
 * 删除指定 id 的自定义谱面
 */
export function deleteCustomChart(id: string): void {
  const charts = loadCustomCharts().filter((c) => c.id !== id);
  writeCharts(charts);
}

/**
 * 将谱面列表写入 localStorage
 */
function writeCharts(charts: StoredChart[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
  } catch (e) {
    console.error('Failed to save custom charts:', e);
  }
}
