/**
 * 谱面工具函数：节拍与时间换算、校验、JSON 序列化/反序列化、随机生成。
 * 供编辑器与播放器共用。
 */

import {
  TRACK_COUNT,
  type Chart,
  type ChartMetadata,
  type ChartNote,
  type DifficultyLevel,
} from '../types/chart';
import { DIFFICULTY_LEVELS } from '../types/chart';

/** 一拍的毫秒数（60000 / bpm）。 */
export function msPerBeat(bpm: number): number {
  return 60000 / Math.max(1, bpm);
}

/** 编辑器草稿谱面在 localStorage 中的存储键。 */
const EDITOR_DRAFT_KEY = 'fingerdance.editorDraft.v1';

/**
 * 将当前编辑的谱面保存到 localStorage（草稿），下次进入编辑器可自动恢复。
 * 返回是否保存成功。
 */
export function saveEditorDraft(chart: Chart): boolean {
  try {
    localStorage.setItem(EDITOR_DRAFT_KEY, serializeChart(chart));
    return true;
  } catch {
    return false;
  }
}

/** 从 localStorage 读取编辑器草稿谱面；无有效草稿时返回 null。 */
export function loadEditorDraft(): Chart | null {
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return null;
    return validateChart(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 已保存谱面库在 localStorage 中的存储键。 */
const SAVED_CHARTS_KEY = 'fingerdance.savedCharts.v1';

/**
 * 已保存谱面条目：带唯一 id、保存时间与谱面本体。
 * 用于首页"我的谱面"列表展示与游玩。
 */
export interface SavedChart {
  /** 唯一 id（保存时生成，用于删除/覆盖）。 */
  id: string;
  /** 保存时间（Unix 毫秒时间戳）。 */
  savedAt: number;
  /** 谱面本体。 */
  chart: Chart;
}

/** 从 localStorage 读取全部已保存谱面；解析失败时安全返回空数组。 */
export function loadSavedCharts(): SavedChart[] {
  try {
    const raw = localStorage.getItem(SAVED_CHARTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 逐条校验，过滤脏数据。
    return parsed
      .filter((e) => e && typeof e.id === 'string' && e.chart)
      .map((e) => ({
        id: String(e.id),
        savedAt: Number(e.savedAt) || Date.now(),
        chart: validateChart(e.chart),
      }));
  } catch {
    return [];
  }
}

/**
 * 将谱面保存到"我的谱面"库并持久化，返回更新后的完整列表。
 * 去重策略：同"标题 + 难度"视为同一谱面并覆盖更新（避免重复保存产生大量副本）。
 */
export function saveChartToLibrary(chart: Chart): SavedChart[] {
  const list = loadSavedCharts();
  const key = `${chart.metadata.title}\u0000${chart.metadata.difficulty}`;
  const existingIndex = list.findIndex(
    (e) => `${e.chart.metadata.title}\u0000${e.chart.metadata.difficulty}` === key
  );
  const entry: SavedChart = {
    id: existingIndex >= 0 ? list[existingIndex].id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    // 存一份深拷贝，避免后续编辑影响已保存内容。
    chart: JSON.parse(JSON.stringify(chart)) as Chart,
  };
  if (existingIndex >= 0) list[existingIndex] = entry;
  else list.push(entry);
  try {
    localStorage.setItem(SAVED_CHARTS_KEY, JSON.stringify(list));
  } catch {
    // 存储失败（如空间不足）时忽略，调用方可通过返回值判断。
  }
  return list;
}

/** 按 id 删除已保存谱面，返回更新后的列表。 */
export function deleteSavedChart(id: string): SavedChart[] {
  const list = loadSavedCharts().filter((e) => e.id !== id);
  try {
    localStorage.setItem(SAVED_CHARTS_KEY, JSON.stringify(list));
  } catch {
    // 忽略。
  }
  return list;
}

/**
 * 将任意时间戳吸附到最近的节拍网格线。
 * @param time 原始时间（毫秒）
 * @param bpm 每分钟节拍数
 * @param offset 起始偏移量（毫秒）
 * @param division 每拍细分数（1=整拍, 2=八分, 4=十六分）
 */
export function snapToGrid(
  time: number,
  bpm: number,
  offset: number,
  division: number
): number {
  const step = msPerBeat(bpm) / Math.max(1, division);
  const rel = time - offset;
  const snapped = Math.round(rel / step) * step + offset;
  return Math.max(0, Math.round(snapped));
}

/** 生成默认的空谱面元数据。 */
export function defaultMetadata(): ChartMetadata {
  return {
    title: 'Untitled Chart',
    author: 'Anonymous',
    bpm: 120,
    offset: 0,
    difficulty: 'Normal',
  };
}

/** 生成一个空谱面。 */
export function emptyChart(): Chart {
  return { version: 1, metadata: defaultMetadata(), notes: [] };
}

/**
 * 校验并规整一个从 JSON 解析出来的对象是否为合法谱面。
 * 校验失败时抛出带说明的 Error。返回一个经过清洗、按时间排序的新 Chart。
 */
export function validateChart(data: unknown): Chart {
  if (!data || typeof data !== 'object') {
    throw new Error('谱面文件格式无效：根节点不是对象');
  }
  const obj = data as Record<string, unknown>;
  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') {
    throw new Error('谱面文件缺少 metadata');
  }
  if (!Array.isArray(obj.notes)) {
    throw new Error('谱面文件缺少 notes 数组');
  }

  const bpm = Number(meta.bpm);
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error('metadata.bpm 必须是正数');
  }

  const difficulty = DIFFICULTY_LEVELS.includes(meta.difficulty as DifficultyLevel)
    ? (meta.difficulty as DifficultyLevel)
    : 'Normal';

  const metadata: ChartMetadata = {
    title: typeof meta.title === 'string' ? meta.title : 'Untitled Chart',
    author: typeof meta.author === 'string' ? meta.author : 'Anonymous',
    bpm,
    offset: Number.isFinite(Number(meta.offset)) ? Number(meta.offset) : 0,
    difficulty,
  };

  // 清洗音符：丢弃越界/非法项。
  const notes: ChartNote[] = (obj.notes as unknown[])
    .map((n) => n as Record<string, unknown>)
    .filter(
      (n) =>
        n &&
        Number.isFinite(Number(n.time)) &&
        Number.isInteger(Number(n.track)) &&
        Number(n.track) >= 0 &&
        Number(n.track) < TRACK_COUNT
    )
    .map((n) => {
      const type = n.type === 'hold' ? 'hold' : 'tap';
      const note: ChartNote = {
        time: Math.max(0, Math.round(Number(n.time))),
        track: Number(n.track),
        type,
      };
      if (type === 'hold' && Number.isFinite(Number(n.duration))) {
        note.duration = Math.max(0, Math.round(Number(n.duration)));
      }
      return note;
    })
    .sort((a, b) => a.time - b.time);

  return { version: 1, metadata, notes };
}

/** 将谱面序列化为带缩进的 JSON 字符串（用于导出/下载）。 */
export function serializeChart(chart: Chart): string {
  const sorted: Chart = {
    ...chart,
    notes: [...chart.notes].sort((a, b) => a.time - b.time),
  };
  return JSON.stringify(sorted, null, 2);
}

/**
 * 根据密度随机生成音符序列（用于"音符密度"快速铺谱）。
 * @param bpm 每分钟节拍数
 * @param offset 偏移量
 * @param durationMs 谱面总时长（毫秒）
 * @param density 每拍生成音符的概率密度（0-1，1 表示每拍必有音符）
 * @param division 每拍细分数
 */
export function generateNotesByDensity(
  bpm: number,
  offset: number,
  durationMs: number,
  density: number,
  division: number
): ChartNote[] {
  const step = msPerBeat(bpm) / Math.max(1, division);
  const notes: ChartNote[] = [];
  const clampedDensity = Math.min(1, Math.max(0, density));
  for (let t = offset; t <= durationMs; t += step) {
    if (Math.random() < clampedDensity) {
      notes.push({
        time: Math.round(t),
        track: Math.floor(Math.random() * TRACK_COUNT),
        type: 'tap',
      });
    }
  }
  return notes;
}

/** 计算谱面时长（最后一个音符的时间，含 hold 尾部）。至少返回一个合理下限。 */
export function chartDuration(chart: Chart): number {
  if (chart.notes.length === 0) return 8000;
  const last = chart.notes.reduce((max, n) => {
    const end = n.time + (n.type === 'hold' ? n.duration ?? 0 : 0);
    return Math.max(max, end);
  }, 0);
  return last + 2000; // 额外留 2 秒尾巴。
}
