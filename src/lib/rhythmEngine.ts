/**
 * 节奏游戏引擎（命令式实现，由 requestAnimationFrame 驱动）。
 *
 * 职责：
 *  1. 根据谱面音符的时间戳，在每帧计算其在轨道上的纵向位置（用于下落渲染）；
 *  2. 处理玩家按键，根据按键时间与音符时间的偏差判定 Perfect/Good/Miss；
 *  3. 自动把超过判定窗口且未被击中的音符判为 Miss；
 *  4. 处理长按（hold）音符：按下时判定头部，松开时若未按到底则判 Miss；
 *  5. 实时回调统计数据与帧渲染数据；
 *  6. 所有音符处理完毕后触发结算回调。
 *
 * 引擎本身不依赖 React，便于在 hook 中以 ref 持有。
 */

import type { Chart, ChartNote, Lane } from '../types/chart';
import {
  applyJudge,
  calcAccuracy,
  calcRank,
  createEmptyStats,
  GOOD_WINDOW,
  judgeByDelta,
  MISS_WINDOW,
  type JudgeResult,
  type JudgeStats,
} from './judgment';
import { triggerLaneAttack, triggerLaneNote, triggerLaneRelease } from './rhythmAudio';

/** 音符的运行时判定状态 */
type NoteState = 'pending' | 'holding' | 'hit' | 'missed';

interface RuntimeNote {
  note: ChartNote;
  state: NoteState;
}

/** 每帧需要渲染的音符视图 */
export interface RenderNote {
  id: number;
  lane: number;
  /** 音符头部在轨道上的 y 位置（0~1，1 表示到达判定线） */
  headY: number;
  /** 长按音符尾部 y 位置；非 hold 时等于 headY */
  tailY: number;
  /** 是否已被判定（用于灰化） */
  judged: boolean;
  type: ChartNote['type'];
}

/** 每帧回调数据 */
export interface FrameData {
  /** 当前歌曲时间（秒，可负表示倒计时 lead-in） */
  songTime: number;
  /** 需要渲染的音符 */
  notes: RenderNote[];
  /** 当前按下的轨道 */
  pressedLanes: boolean[];
}

export interface EngineCallbacks {
  /** 每帧回调（用于渲染） */
  onFrame: (data: FrameData) => void;
  /** 判定发生时回调（用于弹 Perfect/Good/Miss 与更新分数） */
  onJudge: (result: JudgeResult, lane: number, stats: JudgeStats) => void;
  /** 整局结束回调 */
  onFinish: (stats: JudgeStats, playTime: number) => void;
}

/** 音符从顶部下落到判定线所需时间（秒）——决定下落速度 */
const APPROACH_TIME = 1.2;
/** 开始前的倒计时（秒） */
const LEAD_IN = 1.5;

export class RhythmEngine {
  private chart: Chart;
  private callbacks: EngineCallbacks;
  private notes: RuntimeNote[] = [];
  private pressed: boolean[] = new Array(9).fill(false);
  private stats: JudgeStats = createEmptyStats();
  private rafId: number | null = null;
  /** performance.now() 对应的歌曲 0 点（毫秒） */
  private startPerf = 0;
  private running = false;
  private finished = false;

  constructor(chart: Chart, callbacks: EngineCallbacks) {
    this.chart = chart;
    this.callbacks = callbacks;
    // 深拷贝并初始化运行时状态
    this.notes = chart.notes.map((note) => ({ note, state: 'pending' as NoteState }));
  }

  /** 启动游戏循环 */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startPerf = performance.now() + LEAD_IN * 1000;
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** 停止（不会触发 finish） */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // 释放可能还在响的长按音
    for (let i = 0; i < 9; i++) {
      if (this.pressed[i]) triggerLaneRelease(i);
    }
  }

  /** 玩家按下某轨道 */
  pressLane(lane: number): void {
    if (!this.running || lane < 0 || lane >= 9) return;
    if (this.pressed[lane]) return;
    this.pressed[lane] = true;

    const songTime = this.currentSongTimeSec();
    // 在判定窗口内寻找该轨道最近的未判定音符
    const target = this.findNearestPending(lane as Lane, songTime);
    if (!target) {
      // 空按：播放按键音但不计判定
      triggerLaneNote(lane);
      return;
    }

    const deltaMs = (songTime - target.note.time) * 1000;
    const result = judgeByDelta(deltaMs);
    if (result === 'miss') {
      // 按得太早/太晚，不计（留给自动 Miss 处理）
      triggerLaneNote(lane);
      return;
    }

    // 命中
    this.stats = applyJudge(this.stats, result);
    if (target.note.type === 'hold') {
      target.state = 'holding';
      triggerLaneAttack(lane);
    } else {
      target.state = 'hit';
      triggerLaneNote(lane);
    }
    this.callbacks.onJudge(result, lane, this.stats);
  }

  /** 玩家松开某轨道 */
  releaseLane(lane: number): void {
    if (!this.running || lane < 0 || lane >= 9) return;
    if (!this.pressed[lane]) return;
    this.pressed[lane] = false;

    const songTime = this.currentSongTimeSec();
    // 检查该轨道是否有正在 holding 的音符
    const holding = this.notes.find(
      (rn) => rn.state === 'holding' && rn.note.lane === lane,
    );
    if (holding) {
      const endTime = holding.note.time + (holding.note.duration ?? 0);
      if (songTime < endTime - GOOD_WINDOW / 1000) {
        // 提前松开 -> Miss 该音符
        holding.state = 'missed';
        this.stats = applyJudge(this.stats, 'miss');
        this.callbacks.onJudge('miss', lane, this.stats);
      } else {
        // 按时松开
        holding.state = 'hit';
      }
      triggerLaneRelease(lane);
    }
  }

  /** 当前歌曲时间（秒） */
  private currentSongTimeSec(): number {
    return (performance.now() - this.startPerf) / 1000 - this.chart.metadata.offset;
  }

  /** 查找某轨道在判定窗口内最近的 pending 音符 */
  private findNearestPending(lane: Lane, songTime: number): RuntimeNote | null {
    let best: RuntimeNote | null = null;
    let bestDelta = Infinity;
    for (const rn of this.notes) {
      if (rn.state !== 'pending' || rn.note.lane !== lane) continue;
      const delta = Math.abs(songTime - rn.note.time);
      // 仅考虑进入判定窗口的音符
      if (delta <= GOOD_WINDOW / 1000 && delta < bestDelta) {
        best = rn;
        bestDelta = delta;
      }
    }
    return best;
  }

  /** 每帧更新 */
  private tick(): void {
    const songTime = this.currentSongTimeSec();

    // 1. 自动 Miss：已经超过 MISS_WINDOW 仍未击中的音符
    for (const rn of this.notes) {
      if (rn.state !== 'pending') continue;
      if (songTime - rn.note.time > MISS_WINDOW / 1000) {
        rn.state = 'missed';
        this.stats = applyJudge(this.stats, 'miss');
        this.callbacks.onJudge('miss', rn.note.lane, this.stats);
      }
    }

    // 2. 自动结束 holding：到了 hold 尾部仍按着，则视为成功
    for (const rn of this.notes) {
      if (rn.state !== 'holding') continue;
      const endTime = rn.note.time + (rn.note.duration ?? 0);
      if (songTime >= endTime) {
        rn.state = 'hit';
        if (this.pressed[rn.note.lane]) {
          this.pressed[rn.note.lane] = false;
          triggerLaneRelease(rn.note.lane);
        }
      }
    }

    // 3. 计算需要渲染的音符（接近判定区的一段窗口）
    const renderNotes: RenderNote[] = [];
    for (let i = 0; i < this.notes.length; i++) {
      const rn = this.notes[i];
      const t = rn.note.time;
      // 仅渲染头部还未完全越过判定线太远的音符
      if (t - songTime > APPROACH_TIME) continue;
      if (songTime - t > 0.5) continue;
      const headY = 1 - (t - songTime) / APPROACH_TIME;
      const tailT = t + (rn.note.type === 'hold' ? rn.note.duration ?? 0 : 0);
      const tailY = 1 - (tailT - songTime) / APPROACH_TIME;
      renderNotes.push({
        id: i,
        lane: rn.note.lane,
        headY,
        tailY,
        judged: rn.state === 'hit' || rn.state === 'missed',
        type: rn.note.type,
      });
    }

    this.callbacks.onFrame({
      songTime,
      notes: renderNotes,
      pressedLanes: [...this.pressed],
    });

    // 4. 判断是否全部结束：所有音符都已判定，且超过最后一个音符一小段时间
    if (!this.finished) {
      const allJudged = this.notes.every(
        (rn) => rn.state === 'hit' || rn.state === 'missed',
      );
      const lastNote = this.notes[this.notes.length - 1];
      const endTime = lastNote
        ? lastNote.note.time + (lastNote.note.duration ?? 0)
        : 0;
      if (allJudged && songTime > endTime + 0.3) {
        this.finished = true;
        this.running = false;
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        // 准确率/评级
        const accuracy = calcAccuracy(this.stats, this.notes.length);
        const rank = calcRank(accuracy);
        // 这里把 result 组装交给外部（onFinish），由 hook 保存
        this.callbacks.onFinish(this.stats, Math.max(0, songTime));
        // rank 未在回调中单独传；外部可由 stats 重算（这里保留 rank 计算一致性）
        void rank;
      }
    }
  }
}
