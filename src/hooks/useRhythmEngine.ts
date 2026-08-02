import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import type { Chart, ChartNote, Judgement } from '../types/chart';
import { TRACK_COUNT } from '../types/chart';
import {
  MISS_WINDOW,
  calcAccuracy,
  calcGrade,
  judgeByDelta,
  scoreForHit,
} from '../lib/judgement';
import { liveStatsAtom, initialLiveStats, type LiveStats } from '../atoms/rhythmAtoms';
import { audioManager } from '../lib/audio';

/** 键位 code -> 轨道索引映射（与手指舞模式保持一致）。 */
const CODE_TO_TRACK: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  Space: 4,
  KeyJ: 5,
  KeyK: 6,
  KeyL: 7,
  Semicolon: 8,
};

/** 轨道 -> 音频键位（用于击打时发声）。 */
const TRACK_TO_AUDIO_KEY = ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'];

/** 每条音符在运行时附带的判定状态。 */
interface RuntimeNote extends ChartNote {
  /** 是否已被处理（命中或已判定 Miss），避免重复计分。 */
  resolved: boolean;
}

/** 游玩阶段。 */
export type PlayPhase = 'ready' | 'playing' | 'finished';

/** 结束时上报的最终结果。 */
export interface FinishResult {
  score: number;
  accuracy: number;
  grade: ReturnType<typeof calcGrade>;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  playTime: number;
}

/**
 * 节奏模式播放引擎。
 *
 * 职责：
 * - 维护一个高精度的播放时钟（基于 performance.now）。
 * - 处理键盘输入，将按键时机与"当前时间窗口内最近的未处理音符"配对判定。
 * - 在 RAF 循环里自动将错过的音符判定为 Miss。
 * - 维护实时统计（分数、连击、准确率相关计数），并写入 liveStatsAtom 供 UI 显示。
 * - 结束时通过 onFinish 回调返回最终结果，供上层写入成绩。
 *
 * @param chart    待游玩谱面
 * @param onFinish 结束回调，参数为最终统计与游玩时长
 */
export function useRhythmEngine(
  chart: Chart | null,
  onFinish: (result: FinishResult) => void
) {
  const setLiveStats = useSetAtom(liveStatsAtom);
  const [phase, setPhase] = useState<PlayPhase>('ready');
  /** 当前播放时间（毫秒），驱动音符下落渲染。用 state 以触发重渲染。 */
  const [songTime, setSongTime] = useState(0);

  // --- 引擎内部的可变引用（避免闭包读到旧值 / 频繁重建） ---
  const notesRef = useRef<RuntimeNote[]>([]);
  const statsRef = useRef<LiveStats>({ ...initialLiveStats });
  const startPerfRef = useRef(0);
  const rafRef = useRef(0);
  const phaseRef = useRef<PlayPhase>('ready');
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  /** 将内部统计同步到 Jotai atom（供 UI 订阅）。 */
  const syncStats = useCallback(() => {
    setLiveStats({ ...statsRef.current });
  }, [setLiveStats]);

  /** 应用一次判定结果，更新统计（不触发 syncStats，由调用方决定何时同步）。 */
  const applyJudgement = useCallback((judgement: Judgement) => {
    const s = statsRef.current;
    if (judgement === 'miss') {
      s.combo = 0; // Miss 清零连击。
      s.miss += 1;
    } else {
      s.score += scoreForHit(judgement, s.combo);
      s.combo += 1;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      if (judgement === 'perfect') s.perfect += 1;
      else s.good += 1;
    }
    s.lastJudgement = judgement;
    s.lastJudgementAt = performance.now();
  }, []);

  /** 结束当前一局，汇总结果并回调。 */
  const finish = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = 'finished';
    setPhase('finished');
    cancelAnimationFrame(rafRef.current);
    audioManager.releaseAll();

    const s = statsRef.current;
    const accuracy = calcAccuracy(s.perfect, s.good, s.miss);
    onFinishRef.current({
      score: s.score,
      accuracy,
      grade: calcGrade(accuracy),
      maxCombo: s.maxCombo,
      perfect: s.perfect,
      good: s.good,
      miss: s.miss,
      playTime: performance.now() - startPerfRef.current,
    });
  }, []);

  /** 开始游玩：初始化音符与时钟，启动 RAF 循环。 */
  const start = useCallback(() => {
    if (!chart) return;
    // 深拷贝音符并附加运行时状态，按时间升序排列以便高效查找。
    notesRef.current = chart.notes
      .map((n) => ({ ...n, resolved: false }))
      .sort((a, b) => a.time - b.time);
    statsRef.current = { ...initialLiveStats };
    syncStats();
    startPerfRef.current = performance.now();
    phaseRef.current = 'playing';
    setPhase('playing');

    const totalDuration =
      chart.notes.length > 0
        ? chart.notes[chart.notes.length - 1].time + 2500
        : 3000;

    const loop = () => {
      const now = performance.now() - startPerfRef.current;
      setSongTime(now);

      // 自动判定错过的音符：目标时间已过去超过 MISS_WINDOW 且未处理。
      let changed = false;
      for (const note of notesRef.current) {
        if (!note.resolved && now - note.time > MISS_WINDOW) {
          note.resolved = true;
          applyJudgement('miss');
          changed = true;
        }
      }
      if (changed) syncStats();

      // 结束条件：超过总时长。
      if (now >= totalDuration) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [chart, syncStats, finish, applyJudgement]);

  /** 键盘按下：寻找命中窗口内、同轨道、未处理、时间最接近的音符。 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing') return;
      const track = CODE_TO_TRACK[e.code];
      if (track === undefined) return;
      e.preventDefault();

      const now = performance.now() - startPerfRef.current;

      // 在该轨道上寻找 |Δt| 最小且在可命中窗口内的未处理音符。
      let best: RuntimeNote | null = null;
      let bestAbs = Infinity;
      for (const note of notesRef.current) {
        if (note.resolved || note.track !== track) continue;
        const delta = now - note.time;
        if (delta > MISS_WINDOW) continue; // 已经太晚，交给自动 Miss。
        if (delta < -MISS_WINDOW) break; // 音符还太早（列表按时间升序，可提前结束）。
        const abs = Math.abs(delta);
        if (abs < bestAbs) {
          bestAbs = abs;
          best = note;
        }
      }

      // 无论是否命中都发声，提供听觉反馈。
      audioManager.playNote(TRACK_TO_AUDIO_KEY[track]);
      window.setTimeout(() => audioManager.releaseNote(TRACK_TO_AUDIO_KEY[track]), 150);

      if (best) {
        best.resolved = true;
        applyJudgement(judgeByDelta(now - best.time));
        syncStats();
      }
    },
    [applyJudgement, syncStats]
  );

  // 注册键盘监听。
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 卸载时清理 RAF。
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /**
   * 返回当前"可见"音符（在下落窗口内的未处理音符），供渲染层使用。
   * @param lookaheadMs 提前多少毫秒开始显示音符（即音符从顶部落到判定线的时长）
   */
  const getVisibleNotes = useCallback(
    (lookaheadMs: number): { note: ChartNote; progress: number; track: number }[] => {
      const result: { note: ChartNote; progress: number; track: number }[] = [];
      for (const note of notesRef.current) {
        if (note.resolved) continue;
        const delta = note.time - songTime; // 距离命中还有多久
        if (delta > lookaheadMs) continue; // 还没进入可视区
        if (delta < -MISS_WINDOW) continue; // 已经过判定线太久
        // progress: 0=刚出现在顶部, 1=到达判定线
        const progress = 1 - delta / lookaheadMs;
        result.push({ note, progress, track: note.track });
      }
      return result;
    },
    [songTime]
  );

  return {
    phase,
    songTime,
    start,
    finish,
    getVisibleNotes,
    trackCount: TRACK_COUNT,
  };
}
