import { useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  screenAtom,
  currentChartAtom,
  playerStateAtom,
  startTimeAtom,
  finalTimeAtom,
  gameActiveAtom,
  gameStatsAtom,
  lastJudgmentAtom,
  judgedNotesAtom,
  resetGameStatsAtom,
  addScoreRecordAtom,
} from '../atoms/gameAtoms';
import { audioManager } from '../lib/audio';
import {
  JUDGMENT_WINDOWS,
  SCORE_VALUES,
  type Note,
  type NoteJudgment,
  type Judgment,
  type ScoreRecord,
  generateId,
} from '../types/chart';

// 键盘映射：event.code -> 轨道索引和音频按键
// 注意：部分键盘布局上分号键的 code 可能不同，这里同时兼容 Semicolon 和 Comma
const CODE_MAP: Record<string, { index: number; key: string }> = {
  KeyA: { index: 0, key: 'a' },
  KeyS: { index: 1, key: 's' },
  KeyD: { index: 2, key: 'd' },
  KeyF: { index: 3, key: 'f' },
  Space: { index: 4, key: ' ' },
  KeyJ: { index: 5, key: 'j' },
  KeyK: { index: 6, key: 'k' },
  KeyL: { index: 7, key: 'l' },
  Semicolon: { index: 8, key: ';' },
  Comma: { index: 8, key: ';' }, // 兼容部分键盘布局上逗号键在同一位置
};

// 音符下落提前量（毫秒）：音符在判定线前多久出现
const NOTE_APPROACH_TIME = 2000;

// 连击加成阈值和倍率
const COMBO_BONUS_THRESHOLD = 50;
const COMBO_BONUS_MULTIPLIER = 1.1;

/**
 * 判断时间偏差对应的判定等级
 * @param delta 时间偏差（毫秒，绝对值）
 */
function getJudgmentFromDelta(delta: number): Judgment {
  if (delta <= JUDGMENT_WINDOWS.perfect) return 'perfect';
  if (delta <= JUDGMENT_WINDOWS.good) return 'good';
  return 'miss';
}

/**
 * 计算带连击加成的分数
 */
function calculateScore(baseScore: number, combo: number): number {
  if (combo >= COMBO_BONUS_THRESHOLD) {
    return Math.round(baseScore * COMBO_BONUS_MULTIPLIER);
  }
  return baseScore;
}

/**
 * 计算准确率
 * 准确率 = (Perfect*1 + Good*0.5 + Miss*0) / 总音符数
 */
function calculateAccuracy(perfect: number, good: number, total: number): number {
  if (total === 0) return 1;
  return (perfect + good * 0.5) / total;
}

/**
 * 节奏游戏核心逻辑 Hook
 *
 * 职责：
 * 1. 监听键盘输入，记录按键状态
 * 2. 基于 requestAnimationFrame 进行游戏循环
 * 3. 判定音符命中（Perfect/Good/Miss）
 * 4. 更新分数、连击、准确率
 * 5. 游戏结束时保存成绩
 */
export function useRhythmGameLogic() {
  const pressedKeys = useRef(new Set<string>());
  const setScreen = useSetAtom(screenAtom);
  const currentChart = useAtomValue(currentChartAtom);
  const setPlayerState = useSetAtom(playerStateAtom);
  const [startTime, setStartTime] = useAtom(startTimeAtom);
  const setFinalTime = useSetAtom(finalTimeAtom);
  const gameActive = useAtomValue(gameActiveAtom);
  const [stats, setStats] = useAtom(gameStatsAtom);
  const setLastJudgment = useSetAtom(lastJudgmentAtom);
  const setJudgedNotes = useSetAtom(judgedNotesAtom);
  const resetStats = useSetAtom(resetGameStatsAtom);
  const addScoreRecord = useSetAtom(addScoreRecordAtom);

  // 已判定音符 ID 集合（用 ref 避免闭包陷阱）
  const judgedNoteIdsRef = useRef<Set<string>>(new Set());
  // 游戏循环引用
  const animationFrameRef = useRef<number | null>(null);
  // 状态 ref，供事件处理函数访问最新值
  const stateRef = useRef({
    currentChart,
    startTime,
    gameActive,
    stats,
  });

  useEffect(() => {
    stateRef.current = {
      currentChart,
      startTime,
      gameActive,
      stats,
    };
  }, [currentChart, startTime, gameActive, stats]);

  /**
   * 应用判定结果，更新统计数据
   */
  const applyJudgment = useCallback(
    (note: Note, judgment: Judgment, delta: number) => {
      const noteId = note.id || `${note.time}-${note.lane}`;
      if (judgedNoteIdsRef.current.has(noteId)) return;
      judgedNoteIdsRef.current.add(noteId);

      const judgmentRecord: NoteJudgment = { note, judgment, delta };
      setLastJudgment(judgmentRecord);

      setStats((prev) => {
        const newStats = { ...prev };

        if (judgment === 'perfect') {
          newStats.perfect += 1;
          newStats.combo += 1;
          newStats.score += calculateScore(SCORE_VALUES.perfect, newStats.combo);
        } else if (judgment === 'good') {
          newStats.good += 1;
          newStats.combo += 1;
          newStats.score += calculateScore(SCORE_VALUES.good, newStats.combo);
        } else {
          newStats.miss += 1;
          newStats.combo = 0;
        }

        newStats.maxCombo = Math.max(newStats.maxCombo, newStats.combo);

        const totalJudged = newStats.perfect + newStats.good + newStats.miss;
        newStats.accuracy = calculateAccuracy(
          newStats.perfect,
          newStats.good,
          totalJudged,
        );

        return newStats;
      });

      setJudgedNotes((prev) => [...prev, judgmentRecord]);
    },
    [setStats, setLastJudgment, setJudgedNotes],
  );

  /**
   * 游戏主循环
   */
  const gameLoop = useCallback(() => {
    const { currentChart: chart, startTime: start } = stateRef.current;
    if (!chart || start === 0) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const currentTime = performance.now() - start;
    const notes = chart.notes;
    const offset = chart.metadata.offset;

    // 检查所有音符的自动 Miss 判定
    notes.forEach((note) => {
      const noteId = note.id || `${note.time}-${note.lane}`;
      if (judgedNoteIdsRef.current.has(noteId)) return;

      const noteTime = note.time + offset;
      const delta = currentTime - noteTime;

      // 超过 miss 窗口，自动 Miss
      if (delta > JUDGMENT_WINDOWS.miss) {
        applyJudgment(note, 'miss', delta);
      }
    });

    // 检查游戏是否结束（所有音符都已判定，或时间超过最后一个音符 + 2秒）
    const lastNote = notes[notes.length - 1];
    const gameEndTime = lastNote
      ? lastNote.time + offset + 2000
      : 5000;

    if (currentTime >= gameEndTime && judgedNoteIdsRef.current.size >= notes.length) {
      endGame(currentTime);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [applyJudgment]);

  /**
   * 结束游戏，保存成绩
   */
  const endGame = useCallback(
    (playDuration: number) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      audioManager.releaseAll();
      pressedKeys.current.clear();
      setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      setFinalTime(playDuration);

      // 保存成绩记录
      const chart = stateRef.current.currentChart;
      const currentStats = stateRef.current.stats;
      if (chart) {
        const record: ScoreRecord = {
          id: generateId(),
          songTitle: chart.metadata.title,
          difficulty: chart.metadata.difficulty,
          score: currentStats.score,
          accuracy: currentStats.accuracy,
          maxCombo: currentStats.maxCombo,
          perfect: currentStats.perfect,
          good: currentStats.good,
          miss: currentStats.miss,
          totalNotes: chart.notes.length,
          playedAt: new Date().toISOString(),
          playDuration,
        };
        addScoreRecord(record);
      }

      setScreen('result');
    },
    [setFinalTime, setPlayerState, setScreen, addScoreRecord],
  );

  /**
   * 重置游戏状态
   */
  const resetGameState = useCallback(() => {
    audioManager.releaseAll();
    pressedKeys.current.clear();
    judgedNoteIdsRef.current.clear();
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStartTime(0);
    resetStats();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [setPlayerState, setStartTime, resetStats]);

  /**
   * 从键盘事件中获取按键映射信息
   * 优先使用 e.code，若未匹配则尝试 e.key 作为后备
   * 这样可以兼容不同键盘布局和输入法环境
   */
  const getKeyInfo = useCallback((e: KeyboardEvent) => {
    // 首先通过 e.code 查找（物理按键位置，不受输入法影响）
    if (CODE_MAP[e.code]) return CODE_MAP[e.code];
    // 后备：通过 e.key 查找（字符值，可能受输入法/Shift影响）
    const keyMap: Record<string, { index: number; key: string }> = {
      a: CODE_MAP.KeyA, s: CODE_MAP.KeyS, d: CODE_MAP.KeyD, f: CODE_MAP.KeyF,
      j: CODE_MAP.KeyJ, k: CODE_MAP.KeyK, l: CODE_MAP.KeyL,
      ';': CODE_MAP.Semicolon, ',': CODE_MAP.Comma,
      ' ': CODE_MAP.Space,
    };
    const lowerKey = e.key.toLowerCase();
    return keyMap[lowerKey] || null;
  }, []);

  /**
   * 处理按键按下
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const keyInfo = getKeyInfo(e);
      if (!keyInfo || !stateRef.current.gameActive) return;
      // 使用 code 作为去重键，若 code 不可用则用 key
      const dedupeKey = e.code || e.key;
      if (pressedKeys.current.has(dedupeKey)) return;

      e.preventDefault();
      pressedKeys.current.add(dedupeKey);

      // 首次按键时设置游戏开始时间
      setStartTime((prev) => {
        if (prev === 0) {
          return performance.now();
        }
        return prev;
      });

      // 更新按键状态
      setPlayerState((prev) => {
        const newState = [...prev];
        newState[keyInfo.index] = 1;
        return newState;
      });

      // 播放音效
      audioManager.playNote(keyInfo.key);

      // 查找当前轨道上最近的未判定音符
      const chart = stateRef.current.currentChart;
      const startTime = stateRef.current.startTime;
      if (!chart || startTime === 0) return;

      const currentTime = performance.now() - startTime;
      const offset = chart.metadata.offset;

      // 找到该轨道上在判定窗口内的最近音符
      const candidateNotes = chart.notes
        .filter((n) => n.lane === keyInfo.index)
        .filter((n) => {
          const noteId = n.id || `${n.time}-${n.lane}`;
          return !judgedNoteIdsRef.current.has(noteId);
        })
        .map((n) => ({
          note: n,
          absDelta: Math.abs(currentTime - (n.time + offset)),
        }))
        .filter((item) => item.absDelta <= JUDGMENT_WINDOWS.good)
        .sort((a, b) => a.absDelta - b.absDelta);

      if (candidateNotes.length > 0) {
        const target = candidateNotes[0];
        const noteTime = target.note.time + offset;
        const delta = currentTime - noteTime;
        const judgment = getJudgmentFromDelta(target.absDelta);
        applyJudgment(target.note, judgment, delta);
      }
    },
    [setStartTime, setPlayerState, applyJudgment, getKeyInfo],
  );

  /**
   * 处理按键抬起
   */
  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const keyInfo = getKeyInfo(e);
      if (!keyInfo || !stateRef.current.gameActive) return;

      e.preventDefault();
      const dedupeKey = e.code || e.key;
      pressedKeys.current.delete(dedupeKey);

      setPlayerState((prev) => {
        const newState = [...prev];
        newState[keyInfo.index] = 0;
        return newState;
      });

      audioManager.releaseNote(keyInfo.key);
    },
    [setPlayerState, getKeyInfo],
  );

  // 注册键盘事件
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // 游戏激活时启动主循环
  useEffect(() => {
    if (gameActive && currentChart) {
      resetGameState();
      // 自动开始游戏：短暂延迟后设置开始时间，给玩家准备时间
      const startTimeout = window.setTimeout(() => {
        setStartTime(performance.now());
      }, 1000);

      // 延迟一帧启动，确保状态已重置
      requestAnimationFrame(() => {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      });

      return () => {
        window.clearTimeout(startTimeout);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [gameActive, currentChart, gameLoop, resetGameState, setStartTime]);

  return {
    resetGameState,
    /** 音符下落提前量（毫秒），UI 层可用 */
    noteApproachTime: NOTE_APPROACH_TIME,
  };
}
