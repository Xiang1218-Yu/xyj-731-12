/**
 * 谱面（Chart）相关的数据模型定义。
 *
 * 一个谱面由两部分组成：
 *  1. metadata  —— 描述谱面的元信息（标题、作者、BPM、偏移、难度等）；
 *  2. notes     —— 音符序列，每个音符记录它在歌曲中的时间点、所在轨道以及类型。
 *
 * 该结构同时用于：
 *  - 可视化谱面编辑器（/editor）；
 *  - 节奏游戏运行时的判定与渲染；
 *  - JSON 格式的导入 / 导出文件。
 */

/** 轨道编号：0~8，对应 9 个按键 A S D F Space J K L ; */
export type Lane = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 轨道总数（与游戏按键数量一致） */
export const LANE_COUNT = 9;

/** 音符类型：tap=单点；hold=长按 */
export type NoteType = 'tap' | 'hold';

/** 难度等级 */
export type Difficulty = 'Easy' | 'Normal' | 'Hard' | 'Expert' | 'Master';

/** 单个音符 */
export interface ChartNote {
  /** 音符到达判定线的时间（相对于歌曲开始，单位：秒） */
  time: number;
  /** 所在轨道 0~8 */
  lane: Lane;
  /** 音符类型 */
  type: NoteType;
  /** 长按音符的持续时长（秒），仅 type==='hold' 时有意义 */
  duration?: number;
}

/** 谱面元数据 */
export interface ChartMeta {
  /** 谱面标题（歌曲名） */
  title: string;
  /** 作者 */
  author: string;
  /** 每分钟节拍数 */
  bpm: number;
  /** 歌曲起始偏移量（秒），用于校准音频与谱面 */
  offset: number;
  /** 难度等级 */
  difficulty: Difficulty;
  /** 难度数值（用于展示，例如 ★5） */
  level: number;
  /**
   * 音符密度（每秒音符数，notes per second）。
   * 用于描述谱面密集程度，可在编辑器中手动设置，
   * 自动生成音符时也会根据 BPM/细分计算并回填此字段。
   */
  density: number;
}

/** 完整谱面文件结构（即导入/导出的 JSON 结构） */
export interface Chart {
  /** 谱面格式版本，便于未来兼容升级 */
  version: number;
  metadata: ChartMeta;
  /** 音符数组（编辑器与运行时均假定已按 time 升序排列） */
  notes: ChartNote[];
}

/** 生成一个空白的默认谱面 */
export function createEmptyChart(): Chart {
  return {
    version: 1,
    metadata: {
      title: 'Untitled Chart',
      author: 'Anonymous',
      bpm: 120,
      offset: 0,
      difficulty: 'Normal',
      level: 5,
      density: 2,
    },
    notes: [],
  };
}

/** 把任意值安全地解析为 Chart，失败时返回 null */
export function parseChart(raw: unknown): Chart | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const meta = obj.metadata as Record<string, unknown> | undefined;
  const notes = obj.notes;
  if (!meta || !Array.isArray(notes)) return null;

  const parsedNotes: ChartNote[] = [];
  for (const n of notes) {
    if (!n || typeof n !== 'object') continue;
    const note = n as Record<string, unknown>;
    const time = Number(note.time);
    const lane = Number(note.lane);
    if (!Number.isFinite(time) || lane < 0 || lane >= LANE_COUNT) continue;
    parsedNotes.push({
      time,
      lane: lane as Lane,
      type: note.type === 'hold' ? 'hold' : 'tap',
      duration: note.type === 'hold' ? Number(note.duration) || 0 : undefined,
    });
  }
  // 保证音符按时间升序
  parsedNotes.sort((a, b) => a.time - b.time);

  return {
    version: Number(obj.version) || 1,
    metadata: {
      title: String(meta.title ?? 'Untitled Chart'),
      author: String(meta.author ?? 'Anonymous'),
      bpm: Number(meta.bpm) || 120,
      offset: Number(meta.offset) || 0,
      difficulty: (meta.difficulty as Difficulty) || 'Normal',
      level: Number(meta.level) || 5,
      density: Number(meta.density) || 0,
    },
    notes: parsedNotes,
  };
}
