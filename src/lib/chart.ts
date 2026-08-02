/**
 * 谱面工具库：
 * - 节拍/时间换算（BPM → 毫秒）
 * - 节拍对齐吸附（snap）
 * - 谱面 JSON 序列化 / 解析校验（导入导出）
 * - 随机谱面生成（内置「随机音符」玩法 + 编辑器按密度生成）
 * - 旧关卡（patterns 格式）→ 谱面的转换，保证 26 个内置关卡全部可玩
 * - 编辑器自制谱面的 localStorage 存取（自定义曲库）
 */
import {
  CHART_FORMAT,
  CHART_VERSION,
  LANE_COUNT,
  type Chart,
  type ChartFile,
  type ChartMetadata,
  type ChartNote,
  type NoteType,
} from '../types/chart';

/** 旧版关卡文件的格式（public/levels/*.json），仅用于转换成谱面 */
export interface LegacyLevel {
  name: string;
  patterns: number[][];
}

/** 自定义谱面在曲库中的存储条目（附带唯一 id 与保存时间） */
export interface StoredChart {
  id: string;
  savedAt: number;
  chart: Chart;
}

// ---------------------------------------------------------------------------
// 基础换算
// ---------------------------------------------------------------------------

/** BPM → 每拍毫秒数。例如 120 BPM = 500ms/拍 */
export function msPerBeat(bpm: number): number {
  return 60000 / bpm;
}

/**
 * 将任意时间吸附到最近的节拍网格上。
 * 网格以 offset 为原点，每格 = 1拍 / division（division: 1=四分音符, 2=八分, 4=十六分）。
 * 结果不会小于 0（谱面时间轴不允许负时间）。
 */
export function snapTimeToGrid(timeMs: number, bpm: number, offsetMs: number, division: number): number {
  const step = msPerBeat(bpm) / division; // 每格毫秒数
  const snapped = offsetMs + Math.round((timeMs - offsetMs) / step) * step;
  return Math.max(0, Math.round(snapped));
}

/** 谱面总时长（毫秒）：最后一个音符（含长条尾部）+ 2 秒收尾 */
export function chartDurationMs(chart: Chart): number {
  const lastEnd = chart.notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
  return lastEnd + 2000;
}

// ---------------------------------------------------------------------------
// 创建与生成
// ---------------------------------------------------------------------------

let noteSeq = 0;
/** 生成局部唯一的音符 id（前缀随机避免跨会话冲突） */
export function makeNoteId(): string {
  noteSeq += 1;
  return `n_${Date.now().toString(36)}_${noteSeq}`;
}

/** 创建一条默认元数据（编辑器新建谱面时使用） */
export function createDefaultMetadata(): ChartMetadata {
  return { title: '未命名谱面', author: '', bpm: 120, offset: 0, difficulty: 5 };
}

/** 创建一条空谱面 */
export function createEmptyChart(): Chart {
  return { metadata: createDefaultMetadata(), notes: [] };
}

/**
 * mulberry32 伪随机数生成器：同一种子产生同一序列。
 * 用于「随机谱面」的可复现生成（编辑器生成、内置随机歌曲）。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机谱面生成参数 */
export interface GenerateOptions {
  bpm: number;
  offsetMs: number;
  /** 音符密度：平均每拍的音符个数（0.25 稀疏 ~ 2 密集） */
  density: number;
  /** 生成的拍数（决定谱面长度） */
  beats: number;
  difficulty: number;
  title?: string;
  author?: string;
  seed?: number;
}

/**
 * 按密度生成随机谱面：
 * 以十六分音符为最小网格（每拍 4 格）逐个掷骰，单格命中概率 = density / 4，
 * 因此「平均每拍音符数」与 density 参数严格一致：
 * density=0.25 → 约每 4 拍 1 个音符；density=4 → 每个十六分格填满（4 个/拍）。
 * 每个命中的格子另有 12% 概率追加一条不同轨道的音符组成双押（双押不计入密度）。
 */
export function generateRandomChart(options: GenerateOptions): Chart {
  const { bpm, offsetMs, density, beats, difficulty } = options;
  const rand = mulberry32(options.seed ?? Date.now());
  const beatMs = msPerBeat(bpm);
  const notes: ChartNote[] = [];
  // 十六分网格：density 直接等于平均每拍音符数（密度上限 4/拍 与 UI 范围一致）
  const probability = Math.min(1, Math.max(0.01, density / 4));
  const slots = beats * 4; // 每拍 4 个十六分格

  for (let slot = 0; slot < slots; slot++) {
    if (rand() >= probability) continue;
    const time = Math.round(Math.max(0, offsetMs) + slot * (beatMs / 4));
    const lane = Math.floor(rand() * LANE_COUNT);
    notes.push({ id: makeNoteId(), time, lane, type: 'tap', duration: 0 });
    // 小概率双押：随机选一条不同的轨道补一个同时音符
    if (rand() < 0.12) {
      const second = (lane + 1 + Math.floor(rand() * (LANE_COUNT - 1))) % LANE_COUNT;
      notes.push({ id: makeNoteId(), time, lane: second, type: 'tap', duration: 0 });
    }
  }

  notes.sort((a, b) => a.time - b.time);
  return {
    metadata: {
      title: options.title ?? '随机生成',
      author: options.author ?? 'Auto',
      bpm,
      offset: offsetMs,
      difficulty,
    },
    notes,
  };
}

/**
 * 将旧版关卡（patterns：每一步一个 0/1 按键数组）转换为谱面。
 * 每个 pattern 占用一拍，pattern 中为 1 的位置生成对应轨道的 tap 音符，
 * 因此旧关卡中的「和弦」会自然变成多押音符。
 */
export function chartFromLevel(level: LegacyLevel, levelId: number): Chart {
  // 难度随关卡号递增（1~10），BPM 在 100~170 之间循环，越后面越快
  const difficulty = Math.min(10, Math.max(1, Math.ceil((levelId * 10) / 26)));
  const bpm = 100 + ((levelId - 1) % 8) * 10;
  const beatMs = msPerBeat(bpm);
  const notes: ChartNote[] = [];

  level.patterns.forEach((pattern, index) => {
    const time = Math.round(index * beatMs);
    pattern.forEach((pressed, lane) => {
      if (pressed === 1 && lane < LANE_COUNT) {
        notes.push({ id: makeNoteId(), time, lane, type: 'tap', duration: 0 });
      }
    });
  });

  return {
    metadata: {
      title: level.name,
      author: 'Built-in',
      bpm,
      offset: 0,
      difficulty,
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// JSON 导入导出
// ---------------------------------------------------------------------------

/** 序列化为可下载的 JSON 文本（带格式与版本标识，2 空格缩进便于人工查看） */
export function serializeChart(chart: Chart): string {
  const file: ChartFile = {
    format: CHART_FORMAT,
    version: CHART_VERSION,
    metadata: chart.metadata,
    notes: chart.notes,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 解析并校验谱面 JSON 文本。
 * 采用「宽容修复」策略：能修复的字段（越界轨道、非法数字、缺失 id）自动修复，
 * 结构性错误（不是对象、缺少音符数组）则抛出中文错误信息。
 */
export function parseChartFile(jsonText: string): Chart {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('文件不是合法的 JSON，请检查后重试');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('谱面文件结构错误：顶层必须是对象');
  }
  const obj = raw as Record<string, unknown>;
  // format 字段存在时必须匹配；不存在时宽容放行（兼容手写文件）
  if (obj.format !== undefined && obj.format !== CHART_FORMAT) {
    throw new Error(`文件格式不匹配：期望 ${CHART_FORMAT}`);
  }

  const metaRaw = (obj.metadata ?? {}) as Record<string, unknown>;
  const metadata: ChartMetadata = {
    title: typeof metaRaw.title === 'string' && metaRaw.title.trim() ? metaRaw.title : '未命名谱面',
    author: typeof metaRaw.author === 'string' ? metaRaw.author : '',
    bpm: clampNumber(metaRaw.bpm, 30, 300, 120),
    offset: clampNumber(metaRaw.offset, -10000, 10000, 0),
    difficulty: Math.round(clampNumber(metaRaw.difficulty, 1, 10, 5)),
  };

  if (!Array.isArray(obj.notes)) {
    throw new Error('谱面文件结构错误：缺少 notes 音符数组');
  }
  const notes: ChartNote[] = [];
  for (const item of obj.notes) {
    if (typeof item !== 'object' || item === null) continue; // 跳过坏条目
    const n = item as Record<string, unknown>;
    const time = Number(n.time);
    const lane = Number(n.lane);
    if (!Number.isFinite(time) || time < 0) continue; // 时间非法直接丢弃
    if (!Number.isInteger(lane) || lane < 0 || lane >= LANE_COUNT) continue; // 轨道非法直接丢弃
    const type: NoteType = n.type === 'hold' ? 'hold' : 'tap';
    const duration = type === 'hold' ? Math.max(0, Number(n.duration) || 0) : 0;
    notes.push({
      id: typeof n.id === 'string' && n.id ? n.id : makeNoteId(),
      time: Math.round(time),
      lane,
      type,
      duration: Math.round(duration),
    });
  }
  notes.sort((a, b) => a.time - b.time);
  return { metadata, notes };
}

/** 数值钳制工具：非数字时回退到 fallback */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** 触发浏览器下载，将谱面保存为 JSON 文件 */
export function downloadChart(chart: Chart): void {
  const blob = new Blob([serializeChart(chart)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // 文件名取自标题，过滤掉文件系统不安全的字符
  const safeTitle = chart.metadata.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chart';
  a.href = url;
  a.download = `${safeTitle}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 读取用户选择的本地文件为文本（供 parseChartFile 使用） */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// 自定义谱面曲库（localStorage）
// ---------------------------------------------------------------------------

const CUSTOM_CHARTS_KEY = 'finger-dance:custom-charts:v1';
// 限制最多保存 30 份自制谱面，防止 localStorage 空间溢出
const MAX_CUSTOM_CHARTS = 30;

/** 读取全部自制谱面（数据损坏时返回空数组，保证页面不崩） */
export function loadCustomCharts(): StoredChart[] {
  try {
    const text = localStorage.getItem(CUSTOM_CHARTS_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as { version: number; items: StoredChart[] };
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

/**
 * 保存一份自制谱面到曲库。
 * 超出容量时淘汰最旧的记录；遇到 QuotaExceeded 时砍掉一半后重试一次。
 */
export function saveCustomChart(chart: Chart): StoredChart {
  const entry: StoredChart = {
    id: `custom_${Date.now().toString(36)}`,
    savedAt: Date.now(),
    chart,
  };
  let items = [entry, ...loadCustomCharts()];
  if (items.length > MAX_CUSTOM_CHARTS) {
    items = items.slice(0, MAX_CUSTOM_CHARTS); // 只保留最新的 N 份
  }
  try {
    localStorage.setItem(CUSTOM_CHARTS_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    // 空间不足：激进清理一半后重试一次，仍失败则放弃（不影响编辑器主流程）
    items = items.slice(0, Math.ceil(items.length / 2));
    try {
      localStorage.setItem(CUSTOM_CHARTS_KEY, JSON.stringify({ version: 1, items }));
    } catch {
      /* 忽略：存储彻底不可用 */
    }
  }
  return entry;
}

/** 按 id 删除一份自制谱面 */
export function deleteCustomChart(id: string): void {
  const items = loadCustomCharts().filter((item) => item.id !== id);
  try {
    localStorage.setItem(CUSTOM_CHARTS_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    /* 存储不可用时静默失败 */
  }
}
