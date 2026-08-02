/**
 * 编辑器用到的时间 / 节拍工具函数。
 */

/** 将秒数格式化为 m:ss.sss 字符串，用于时间轴标尺显示 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** 根据 BPM 计算每拍时长（秒） */
export function beatDuration(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

/** 把任意时间吸附到最近的网格点（以拍为单位，细分数由 subdivision 决定） */
export function snapTime(time: number, bpm: number, subdivision: number): number {
  const grid = beatDuration(bpm) / Math.max(1, subdivision);
  return Math.round(time / grid) * grid;
}
