import { atom } from 'jotai';
import type { Chart, Judgement } from '../types/chart';

/**
 * 节奏模式（Rhythm Mode）相关的全局状态。
 *
 * 该模块与原有 gameAtoms（手指舞模式）相互独立，避免耦合：
 * 手指舞模式是"模仿静态图案"，节奏模式是"按时间轴击打下落音符"。
 */

/**
 * 待游玩的谱面。
 * 由谱面编辑器（点击"游玩"）或主菜单（选择内置谱面）写入，
 * 供 /play 页面读取。为空时 /play 页面提示无谱面。
 */
export const playChartAtom = atom<Chart | null>(null);

/**
 * 编辑器当前正在编辑的谱面（在内存中跨路由保留）。
 *
 * 作用：从编辑器点击"播放预览"跳到 /play 后，再返回 /editor 时，
 * 编辑器可从此 atom 恢复之前的编辑内容，避免丢失进度。
 * 初始为 null，表示"编辑器尚未初始化过"，此时编辑器会尝试从 localStorage 载入。
 */
export const editorChartAtom = atom<Chart | null>(null);

/**
 * 是否应"恢复"编辑器上次内容的标志。
 *
 * 仅当从编辑器点击"播放预览"跳到 /play 时被置为 true；返回编辑器后消费并重置为 false。
 * 这样：预览往返会保留正在编辑的谱面；而从首页/其它入口打开编辑器则视为"新建"，
 * 呈现空白谱面，不会残留上一次已保存/编辑过的内容。
 */
export const editorResumeAtom = atom<boolean>(false);

/** 实时判定统计。 */
export interface LiveStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  /** 最近一次判定，用于 UI 弹出反馈；null 表示暂无。 */
  lastJudgement: Judgement | null;
  /** 最近一次判定的时间戳（用于触发动画/淡出）。 */
  lastJudgementAt: number;
}

/** 初始的实时统计。 */
export const initialLiveStats: LiveStats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  perfect: 0,
  good: 0,
  miss: 0,
  lastJudgement: null,
  lastJudgementAt: 0,
};

/** 当前一局的实时统计。 */
export const liveStatsAtom = atom<LiveStats>({ ...initialLiveStats });
