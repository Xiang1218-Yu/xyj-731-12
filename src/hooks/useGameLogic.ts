/**
 * 音游对局引擎（重写版）。
 * 职责：
 * 1. 开局准备：把当前歌曲的谱面转换为运行时音符，重置全部对局状态；
 * 2. rAF 游戏循环：驱动歌曲时间轴、自动判定超时 Miss、检测对局结束；
 * 3. 键盘输入判定：按「按键时机与音符到达时间的偏差」判定 Perfect / Good；
 * 4. 结算：计算分数 / 准确率 / 等级，写入 localStorage 成绩记录，跳转结算页。
 *
 * 状态写入全部走 Jotai atoms（见 rhythmAtoms.ts），
 * 高频中间值（连击、分数等）用 ref 做同步镜像，避免在 atom updater 里嵌套 set。
 */
import { useEffect, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeSongAtom, screenAtom } from '../atoms/gameAtoms';
import {
  rhythmStatusAtom,
  songTimeMsAtom,
  runtimeNotesAtom,
  notesVersionAtom,
  comboAtom,
  maxComboAtom,
  judgmentCountsAtom,
  scoreAtom,
  lastJudgmentAtom,
  pressedLanesAtom,
  finalStatsAtom,
  type RuntimeNote,
} from '../atoms/rhythmAtoms';
import { audioManager } from '../lib/audio';
import {
  BASE_SCORE,
  MISS_WINDOW_MS,
  comboMultiplier,
  computeAccuracy,
  computeRank,
  judgeDeviation,
  selectJudgeTargets,
  type JudgmentCounts,
  type JudgmentKind,
} from '../lib/judgment';
import { saveScore } from '../lib/scoreStorage';

/** 按键码 → 轨道下标映射（9 键布局） */
const CODE_MAP: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3,
  Space: 4,
  KeyJ: 5, KeyK: 6, KeyL: 7, Semicolon: 8,
};

/** 开局准备时间（毫秒）：给玩家反应时间，期间歌曲时间为负值并显示倒计时 */
export const LEAD_IN_MS = 2000;

/** 音符接近时间（毫秒）：音符从屏幕顶端出现到到达判定线的时长（决定下落速度） */
export const APPROACH_MS = 1600;

/** 最后一个音符结束后，等待多久进入结算（毫秒） */
const FINISH_DELAY_MS = 1500;

/**
 * 单帧最大推进时长（毫秒）。
 * 标签页切到后台时 rAF 会被暂停，若直接用 performance.now 绝对时钟，
 * 后台停留的时间会全部计入歌曲时间（音符瞬间集体 Miss、用时虚高）。
 * 改为「逐帧累加 + 单帧上限」：后台期间时钟最多只走 100ms，恢复后自然续播。
 */
const MAX_FRAME_DT_MS = 100;

// 模块级结算哨兵：防止 StrictMode 双挂载下两个 rAF 循环在同一帧重复结算/重复保存成绩
let finalizeGuard = false;

export function useGameLogic() {
  // --- Atom 读写 ---
  const screen = useAtomValue(screenAtom);
  const activeSong = useAtomValue(activeSongAtom);
  const status = useAtomValue(rhythmStatusAtom);
  const setScreen = useSetAtom(screenAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);
  const setSongTime = useSetAtom(songTimeMsAtom);
  const setRuntimeNotes = useSetAtom(runtimeNotesAtom);
  const setNotesVersion = useSetAtom(notesVersionAtom);
  const setCombo = useSetAtom(comboAtom);
  const setMaxCombo = useSetAtom(maxComboAtom);
  const setJudgmentCounts = useSetAtom(judgmentCountsAtom);
  const setScore = useSetAtom(scoreAtom);
  const setLastJudgment = useSetAtom(lastJudgmentAtom);
  const setPressedLanes = useSetAtom(pressedLanesAtom);
  const setFinalStats = useSetAtom(finalStatsAtom);

  // --- 高频 / 事件处理器专用的同步镜像 ref ---
  const pressedKeys = useRef(new Set<string>()); // 已按下的键（防止长按重复触发）
  const gameTimeRef = useRef(0); // 歌曲时间（逐帧累加，抗后台漂移）
  const lastFrameTsRef = useRef(0); // 上一帧的 performance.now 时间戳
  const notesRef = useRef<RuntimeNote[]>([]); // 运行时音符（与 atom 共享同一数组引用）
  const lastNoteEndRef = useRef(0); // 最后一个音符（含长条尾部）的结束时间
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const scoreRef = useRef(0);
  const countsRef = useRef<JudgmentCounts>({ perfect: 0, good: 0, miss: 0 });
  const judgmentSeqRef = useRef(0); // 判定事件序号（驱动弹出动画）
  const lanesRef = useRef<boolean[]>(Array(9).fill(false)); // 轨道按下状态镜像
  // 供事件处理器读取的最新 atom 值
  const stateRef = useRef({ screen, status, activeSong });
  useEffect(() => {
    stateRef.current = { screen, status, activeSong };
  }, [screen, status, activeSong]);

  /**
   * 对一次判定进行统一记账：
   * 标记音符 → 更新计数 → 连击（Miss 清零）→ 按连击倍率加分 → 通知 UI。
   * @param deviationMs 按键偏差（仅按键命中时有值；超时 Miss 为 null）
   */
  const applyJudgment = useCallback(
    (note: RuntimeNote, kind: JudgmentKind, deviationMs: number | null) => {
      note.judged = true;
      note.result = kind;

      // 1. 判定计数
      countsRef.current = { ...countsRef.current, [kind]: countsRef.current[kind] + 1 };
      setJudgmentCounts(countsRef.current);

      // 2. 连击与得分：命中则连击 +1 并按倍率加分，Miss 清零连击且不得分
      if (kind === 'miss') {
        comboRef.current = 0;
      } else {
        comboRef.current += 1;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        scoreRef.current += Math.round(BASE_SCORE[kind] * comboMultiplier(comboRef.current));
      }
      setCombo(comboRef.current);
      setMaxCombo(maxComboRef.current);
      setScore(scoreRef.current);

      // 3. 判定弹出事件（seq 自增保证动画可重放）
      judgmentSeqRef.current += 1;
      setLastJudgment({ kind, deviationMs, seq: judgmentSeqRef.current });

      // 4. 通知依赖音符状态的 UI 刷新
      setNotesVersion((v) => v + 1);
    },
    [setJudgmentCounts, setCombo, setMaxCombo, setScore, setLastJudgment, setNotesVersion],
  );

  /** 读取当前歌曲时间（帧间按键时按帧差补插值，保证判定精度） */
  const currentSongTime = useCallback(() => {
    const pending = Math.min(performance.now() - lastFrameTsRef.current, MAX_FRAME_DT_MS);
    return gameTimeRef.current + pending;
  }, []);

  /**
   * 结算：汇总数据 → 保存成绩到 localStorage → 切换状态并跳转结算页。
   * finalizeGuard 保证一局只结算一次。
   */
  const finalize = useCallback(() => {
    if (finalizeGuard) return;
    finalizeGuard = true;

    const counts = countsRef.current;
    const accuracy = computeAccuracy(counts);
    // 用时口径 = 歌曲时钟累计值（不含 LEAD_IN 倒计时与后台暂停时间）
    const durationMs = Math.max(0, Math.round(gameTimeRef.current));
    const stats = {
      score: scoreRef.current,
      accuracy,
      rank: computeRank(accuracy),
      maxCombo: maxComboRef.current,
      counts,
      durationMs,
    };
    setFinalStats(stats);

    // 保存成绩记录（歌曲名、难度、分数、准确率、最大连击、P/G/M 数量、游玩时间）
    const song = stateRef.current.activeSong;
    if (song) {
      saveScore({
        songTitle: song.title,
        difficulty: song.difficulty,
        score: stats.score,
        accuracy: Math.round(accuracy * 100) / 100, // 保留两位小数，控制存储体积
        maxCombo: stats.maxCombo,
        perfect: counts.perfect,
        good: counts.good,
        miss: counts.miss,
        playedAt: Date.now(),
        durationMs,
      });
    }

    audioManager.releaseAll();
    setStatus('finished');
    setScreen('result');
  }, [setFinalStats, setStatus, setScreen]);

  /** 开局准备：构建运行时音符、清零所有对局状态、启动歌曲时钟 */
  const prepareSong = useCallback(() => {
    const song = stateRef.current.activeSong;
    if (!song) return;

    // 深拷贝谱面音符为运行时音符（不污染原始谱面数据）
    const runtime: RuntimeNote[] = song.chart.notes
      .map((n) => ({ ...n, judged: false }))
      .sort((a, b) => a.time - b.time);
    notesRef.current = runtime;
    lastNoteEndRef.current = runtime.reduce((max, n) => Math.max(max, n.time + n.duration), 0);

    // 清零全部对局状态
    comboRef.current = 0;
    maxComboRef.current = 0;
    scoreRef.current = 0;
    countsRef.current = { perfect: 0, good: 0, miss: 0 };
    judgmentSeqRef.current = 0;
    lanesRef.current = Array(9).fill(false);
    pressedKeys.current.clear();
    finalizeGuard = false;

    setRuntimeNotes(runtime);
    setNotesVersion((v) => v + 1);
    setCombo(0);
    setMaxCombo(0);
    setJudgmentCounts(countsRef.current);
    setScore(0);
    setLastJudgment(null);
    setPressedLanes(lanesRef.current);
    setFinalStats(null);

    // 启动歌曲时钟：从 -LEAD_IN 开始逐帧累加（抗后台漂移）
    gameTimeRef.current = -LEAD_IN_MS;
    lastFrameTsRef.current = performance.now();
    setSongTime(-LEAD_IN_MS);
    setStatus('playing');
  }, [
    setRuntimeNotes, setNotesVersion, setCombo, setMaxCombo, setJudgmentCounts,
    setScore, setLastJudgment, setPressedLanes, setFinalStats, setSongTime, setStatus,
  ]);

  /**
   * 停止对局（返回选歌 / 重新开始前调用）：
   * 状态置为 idle 后，准备副作用会在进入游戏屏时自动重新开局。
   */
  const resetGameState = useCallback(() => {
    audioManager.releaseAll();
    pressedKeys.current.clear();
    lanesRef.current = Array(9).fill(false);
    setPressedLanes(lanesRef.current);
    setStatus('idle');
  }, [setPressedLanes, setStatus]);

  // 进入游戏屏且状态为 idle 时自动开局（选歌进入 / 结算页「再来一次」/ 刷新按钮都走这里）
  useEffect(() => {
    if (screen === 'game' && activeSong && status === 'idle') {
      prepareSong();
    }
  }, [screen, activeSong, status, prepareSong]);

  // rAF 游戏循环：仅在对局中运行
  useEffect(() => {
    if (status !== 'playing' || screen !== 'game') return;

    let rafId = 0;
    const tick = () => {
      const now = performance.now();
      // 逐帧累加并钳制单帧步长：后台暂停期间时钟最多只走 MAX_FRAME_DT_MS
      const dt = Math.min(now - lastFrameTsRef.current, MAX_FRAME_DT_MS);
      lastFrameTsRef.current = now;
      gameTimeRef.current += dt;
      const songTime = gameTimeRef.current;
      setSongTime(songTime);

      // 自动 Miss：音符越过判定线超过 MISS_WINDOW_MS 仍未被击中
      if (songTime > 0) {
        for (const note of notesRef.current) {
          if (note.judged) continue;
          if (songTime - note.time > MISS_WINDOW_MS) {
            applyJudgment(note, 'miss', null);
          } else if (note.time - songTime > MISS_WINDOW_MS) {
            break; // 音符按时间升序，后面的都还远，提前结束遍历
          }
        }
      }

      // 结束检测：越过最后一个音符 FINISH_DELAY_MS 后结算
      if (songTime > lastNoteEndRef.current + FINISH_DELAY_MS) {
        finalize();
        return; // 不再调度下一帧
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status, screen, setSongTime, applyJudgment, finalize]);

  // 键盘输入：按下判定 + 轨道按下视觉状态
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const lane = CODE_MAP[e.code];
      const { screen: curScreen, status: curStatus } = stateRef.current;
      if (lane === undefined || curScreen !== 'game' || curStatus !== 'playing') return;
      if (pressedKeys.current.has(e.code)) return; // 忽略长按重复触发

      e.preventDefault();
      pressedKeys.current.add(e.code);

      // 轨道按下高亮
      lanesRef.current[lane] = true;
      setPressedLanes([...lanesRef.current]);

      // 计算按键时刻的歌曲时间，按「同轨道最早音符优先」策略选择判定目标。
      // 时间接近的多个音符不会被一次按键全部吃掉：最早的一个消耗本次按键，
      // 其余保留给后续按键（快速连击 / 双押时不会漏判）；同时间戳的同轨簇一并判定。
      const songTime = currentSongTime();
      const targets = selectJudgeTargets(notesRef.current, lane, songTime);
      for (const target of targets) {
        const deviation = songTime - target.time;
        const kind = judgeDeviation(Math.abs(deviation));
        if (kind) {
          applyJudgment(target, kind, Math.round(deviation));
        }
      }
      // 空按（无候选音符）不惩罚，只保留轨道高亮与按键音
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = CODE_MAP[e.code];
      if (lane === undefined) return;
      if (stateRef.current.screen === 'game') {
        e.preventDefault();
      }
      pressedKeys.current.delete(e.code);
      if (lanesRef.current[lane]) {
        lanesRef.current[lane] = false;
        setPressedLanes([...lanesRef.current]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [applyJudgment, setPressedLanes, currentSongTime]);

  return { resetGameState };
}
