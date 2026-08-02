/**
 * 经典模式游戏逻辑（原版玩法，随本次迭代恢复）。
 * 规则：
 * - 玩家按下 / 松开 9 个按键，实时与当前步骤的目标按键序列比对；
 * - 按键状态与目标完全一致 → 前进一步；完成最后一步 → 结算用时并跳转结算页；
 * - 计时从第一次按键开始。
 *
 * 与音游下落模式（useGameLogic）的关系：
 * 两个 hook 同时挂载在 App，但各自通过「模式 + 屏幕」守卫过滤输入，互不干扰。
 */
import { useEffect, useCallback, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { gameModeAtom, screenAtom } from '../atoms/gameAtoms';
import {
  activeLegacyLevelDataAtom,
  classicPlayerStateAtom,
  classicStepAtom,
  classicStartTimeAtom,
  classicFinalTimeAtom,
} from '../atoms/classicAtoms';
import { audioManager } from '../lib/audio';

/** 按键码 → 轨道下标映射（9 键布局） */
const CODE_MAP: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3,
  Space: 4,
  KeyJ: 5, KeyK: 6, KeyL: 7, Semicolon: 8,
};

/** 9 键全 0 状态（重置用） */
const EMPTY_STATE = [0, 0, 0, 0, 0, 0, 0, 0, 0];

export function useClassicGameLogic() {
  const pressedKeys = useRef(new Set<string>());
  const mode = useAtomValue(gameModeAtom);
  const screen = useAtomValue(screenAtom);
  const level = useAtomValue(activeLegacyLevelDataAtom);
  const setScreen = useSetAtom(screenAtom);
  const setPlayerState = useSetAtom(classicPlayerStateAtom);
  const [currentStep, setCurrentStep] = useAtom(classicStepAtom);
  const [startTime, setStartTime] = useAtom(classicStartTimeAtom);
  const setFinalTime = useSetAtom(classicFinalTimeAtom);

  // 供事件处理器读取的最新状态镜像（避免频繁重建监听器）
  const stateRef = useRef({ mode, screen, level, currentStep, startTime });
  useEffect(() => {
    stateRef.current = { mode, screen, level, currentStep, startTime };
  }, [mode, screen, level, currentStep, startTime]);

  /** 重置经典模式对局状态（重新开始 / 返回选歌时调用） */
  const resetClassicState = useCallback(() => {
    audioManager.releaseAll();
    pressedKeys.current.clear();
    setPlayerState([...EMPTY_STATE]);
    setCurrentStep(0);
    setStartTime(0);
  }, [setPlayerState, setCurrentStep, setStartTime]);

  /** 通关判定：按键状态与当前步骤目标完全一致则前进 / 结算 */
  const checkWinCondition = useCallback(
    (currentState: number[]) => {
      const { level: lv, currentStep: step, startTime: time } = stateRef.current;
      if (!lv) return;

      const targetPattern = lv.patterns[step];
      const match = currentState.every((val, index) => val === targetPattern[index]);

      if (match) {
        if (step < lv.patterns.length - 1) {
          setCurrentStep(step + 1);
        } else {
          // 最后一步完成：结算用时，跳转结算页
          audioManager.releaseAll();
          pressedKeys.current.clear();
          setPlayerState([...EMPTY_STATE]);
          setFinalTime(Date.now() - time);
          setScreen('result');
        }
      }
    },
    [setCurrentStep, setFinalTime, setScreen, setPlayerState],
  );

  // 键盘输入（仅经典模式 + 游戏屏时生效）
  useEffect(() => {
    const isClassicGameActive = () =>
      stateRef.current.mode === 'classic' && stateRef.current.screen === 'game' && stateRef.current.level !== null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const lane = CODE_MAP[e.code];
      if (lane === undefined || !isClassicGameActive() || pressedKeys.current.has(e.code)) return;

      e.preventDefault();
      pressedKeys.current.add(e.code);

      // 首次按键启动计时
      setStartTime((prev) => (prev === 0 ? Date.now() : prev));

      setPlayerState((prev) => {
        const next = [...prev];
        next[lane] = 1;
        checkWinCondition(next);
        return next;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const lane = CODE_MAP[e.code];
      if (lane === undefined || !isClassicGameActive()) return;

      e.preventDefault();
      pressedKeys.current.delete(e.code);

      setPlayerState((prev) => {
        const next = [...prev];
        next[lane] = 0;
        checkWinCondition(next);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [checkWinCondition, setPlayerState, setStartTime]);

  // 切换关卡时重置对局状态
  useEffect(() => {
    resetClassicState();
  }, [level, resetClassicState]);

  return { resetClassicState };
}
