/**
 * useRhythmGame —— 把 RhythmEngine 接入 React/Jotai 的 Hook。
 *
 * 负责：
 *  - 在 selectedChartAtom 就绪时创建并启动引擎；
 *  - 监听键盘（A S D F Space J K L ;），转发为按下/松开事件；
 *  - 把引擎的 onJudge 写入 rhythmStatsAtom / lastJudgeAtom；
 *  - 把 onFrame 通过 ref 暴露给渲染层（避免每帧触发 React 重渲染）；
 *  - 游戏结束时写入 rhythmResultAtom 并保存成绩到 localStorage。
 */

import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { RhythmEngine, type FrameData } from '../lib/rhythmEngine';
import {
  rhythmResultAtom,
  rhythmStatsAtom,
  rhythmStatusAtom,
  lastJudgeAtom,
  resetSignalAtom,
} from '../atoms/rhythmAtoms';
import { selectedChartAtom } from '../atoms/chartAtoms';
import {
  calcAccuracy,
  calcRank,
  createEmptyStats,
  type JudgeStats,
} from '../lib/judgment';
import { saveScore } from '../lib/scores';
import { initRhythmAudio, releaseAllRhythm } from '../lib/rhythmAudio';

/** 键盘 code -> 轨道 index */
const CODE_TO_LANE: Record<string, number> = {
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

export function useRhythmGame() {
  const selected = useAtomValue(selectedChartAtom);
  const status = useAtomValue(rhythmStatusAtom);
  const resetSignal = useAtomValue(resetSignalAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);
  const setStats = useSetAtom(rhythmStatsAtom);
  const setLastJudge = useSetAtom(lastJudgeAtom);
  const setResult = useSetAtom(rhythmResultAtom);

  // 引擎实例与帧数据用 ref，避免触发渲染
  const engineRef = useRef<RhythmEngine | null>(null);
  const frameRef = useRef<FrameData | null>(null);
  // 用于外部订阅帧数据的回调集合
  const frameListenersRef = useRef<Set<(data: FrameData) => void>>(new Set());

  // 订阅/取消订阅每帧数据
  const subscribeFrame = (cb: (data: FrameData) => void) => {
    frameListenersRef.current.add(cb);
    return () => {
      frameListenersRef.current.delete(cb);
    };
  };

  useEffect(() => {
    if (!selected || status !== 'playing') return;
    const chart = selected.chart;

    // 初始化统计与音频
    setStats(createEmptyStats());
    setLastJudge(null);
    setResult(null);

    let judgeKey = 0;
    const engine = new RhythmEngine(chart, {
      onFrame: (data) => {
        frameRef.current = data;
        frameListenersRef.current.forEach((cb) => cb(data));
      },
      onJudge: (result, lane, stats: JudgeStats) => {
        // 更新 Jotai 统计（仅在判定时重渲染 UI）
        setStats({ ...stats });
        judgeKey += 1;
        setLastJudge({ result, key: judgeKey, lane });
      },
      onFinish: (stats, playTime) => {
        releaseAllRhythm();
        const accuracy = calcAccuracy(stats, chart.notes.length);
        const rank = calcRank(accuracy);
        const result = { chart, stats, accuracy, rank, playTime };
        setResult(result);
        // 保存到排行榜
        saveScore({ chart, stats, accuracy, rank, playTime });
        setStatus('finished');
      },
    });
    engineRef.current = engine;

    // 确保音频初始化后启动
    initRhythmAudio().then(() => {
      engine.start();
    });

    return () => {
      engine.stop();
      engineRef.current = null;
      releaseAllRhythm();
    };
    // 仅在 selected / status / resetSignal 变化时重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, status, resetSignal]);

  // 键盘事件
  useEffect(() => {
    if (status !== 'playing') return;
    const pressed = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      const lane = CODE_TO_LANE[e.code];
      if (lane === undefined) return;
      e.preventDefault();
      if (pressed.has(e.code)) return;
      pressed.add(e.code);
      engineRef.current?.pressLane(lane);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const lane = CODE_TO_LANE[e.code];
      if (lane === undefined) return;
      e.preventDefault();
      pressed.delete(e.code);
      engineRef.current?.releaseLane(lane);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [status]);

  return { subscribeFrame, status, setStatus };
}
