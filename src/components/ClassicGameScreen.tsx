/**
 * 经典模式游戏界面（原版玩法 UI，随本次迭代恢复并加宽）。
 * 上排：当前步骤的目标按键序列（黑色实心 = 需要按下）；
 * 下排：玩家实时按键状态（白色实心 = 已按下）；
 * 顶部显示关卡名与实时计时器（首次按键开始计时）。
 */
import { useAtomValue } from 'jotai';
import {
  activeLegacyLevelDataAtom,
  classicPlayerStateAtom,
  classicStepAtom,
  classicStartTimeAtom,
} from '../atoms/classicAtoms';
import { useEffect, useState } from 'react';
import Dot from './Dot';

/** 9 键提示文案 */
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/** 实时计时器（rAF 驱动，首次按键前显示 0） */
function Timer() {
  const startTime = useAtomValue(classicStartTimeAtom);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (startTime === 0) {
      setTime(0);
      return;
    }

    let animationFrameId: number;
    const updateTimer = () => {
      setTime(Date.now() - startTime);
      animationFrameId = requestAnimationFrame(updateTimer);
    };

    animationFrameId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(animationFrameId);
  }, [startTime]);

  return <span className="text-2xl font-bold min-w-20 text-right tabular-nums">{(time / 1000).toFixed(2)}s</span>;
}

function ClassicGameScreen() {
  const level = useAtomValue(activeLegacyLevelDataAtom);
  const playerState = useAtomValue(classicPlayerStateAtom);
  const currentStep = useAtomValue(classicStepAtom);

  if (!level) {
    return <div className="text-center p-8">Error: Level data is missing.</div>;
  }

  const targetPattern = level.patterns[currentStep];

  /** 渲染一排圆点：isPlayer=false 为目标序列，true 为玩家状态 */
  const renderDots = (pattern: number[], isPlayer: boolean) =>
    pattern.map((isPressedValue, index) => (
      <Dot
        key={index}
        variant={index === 4 ? 'space' : 'key'}
        isPressed={isPressedValue === 1}
        isPlayer={isPlayer}
        isTarget={!isPlayer}
      />
    ));

  return (
    <section className="w-[98%] max-w-7xl h-[94vh] flex flex-col p-5 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20 overflow-hidden">
      <header className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-bold">{level.name}</h2>
        <Timer />
      </header>

      {/* 目标按键序列 */}
      <div className="flex justify-center items-center gap-4 mb-2.5">
        {renderDots(targetPattern, false)}
      </div>

      {/* 玩家按键状态 */}
      <div className="flex justify-center items-center gap-4">
        {renderDots(playerState, true)}
      </div>

      {/* 按键提示 */}
      <div className="flex justify-center items-center gap-4 mt-4">
        {KEY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`h-16 flex justify-center items-center text-3xl font-black text-white/30 ${
              index === 4 ? 'w-32 text-2xl' : 'w-16'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="text-center text-lg font-bold mt-5">
        Step {currentStep + 1} / {level.patterns.length}
      </div>
    </section>
  );
}

export default ClassicGameScreen;
