/**
 * 谱面（Chart）相关的核心类型定义。
 * 谱面是音游的核心数据：描述一首「歌曲」中所有音符应该在什么时间、出现在哪条轨道上。
 * 该类型同时用于：游戏运行时、谱面编辑器、JSON 导入导出三个场景，保证全链路数据结构一致。
 */

// 游戏固定为 9 条轨道，对应键盘 A S D F Space J K L ; 九个按键
export const LANE_COUNT = 9;

// 谱面文件的格式标识，导入时校验用，避免误读其他 JSON 文件
export const CHART_FORMAT = 'finger-dance-chart';

// 当前谱面文件格式版本号，便于未来格式升级时做兼容处理
export const CHART_VERSION = 1;

/**
 * 音符类型：
 * - tap  单点音符，到达判定线时按一下即可
 * - hold 长条音符（简化实现：只判定头部按下时机，尾部仅作视觉展示）
 */
export type NoteType = 'tap' | 'hold';

/**
 * 单个音符。
 * time     —— 音符到达判定线的绝对时间（毫秒，相对谱面起点，已包含偏移量的坐标系）
 * lane     —— 轨道下标 0~8
 * duration —— 长条音符的持续毫秒数；tap 音符固定为 0
 */
export interface ChartNote {
  id: string;
  time: number;
  lane: number;
  type: NoteType;
  duration: number;
}

/**
 * 谱面元数据。
 * bpm        —— 每分钟节拍数（Beats Per Minute），决定节拍网格的疏密
 * offset     —— 偏移量（毫秒）：音乐第 1 拍在谱面时间轴上的位置，
 *              用于对齐音频与节拍网格（可为负数）
 * difficulty —— 难度等级 1~10 的整数
 */
export interface ChartMetadata {
  title: string;
  author: string;
  bpm: number;
  offset: number;
  difficulty: number;
}

/** 内存中使用的完整谱面结构：元数据 + 音符序列（按 time 升序） */
export interface Chart {
  metadata: ChartMetadata;
  notes: ChartNote[];
}

/**
 * 写入 / 读取 JSON 文件时的磁盘结构。
 * 相比 Chart 多了 format 与 version 两个校验字段。
 */
export interface ChartFile extends Chart {
  format: typeof CHART_FORMAT;
  version: number;
}
