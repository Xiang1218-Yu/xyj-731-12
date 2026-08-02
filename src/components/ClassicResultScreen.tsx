/**
 * 经典模式结算界面（原版玩法：按通关用时评定 S/A/B/C 等级）。
 * 等级阈值来自关卡数据的 ranks 字段（[S 秒, A 秒, B 秒]，超过 B 为 C）。
 * 支持：下一关 / 再来一次 / 返回选歌。
 * 注意：经典模式没有判定系统，不产生排行榜成绩记录（成绩仅记录下落模式）。
 */
import { Suspense, useCallback, useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { screenAtom } from '../atoms/gameAtoms';
import {
  activeLegacyLevelDataAtom,
  classicFinalTimeAtom,
  classicPlayerStateAtom,
  classicStartTimeAtom,
  classicStepAtom,
  legacyLevelIndexAtom,
  selectedLegacyLevelAtom,
  type LegacyLevelData,
} from '../atoms/classicAtoms';
import { audioManager } from '../lib/audio';
import { useScreenOrientation } from '../hooks/useScreenOrientation';

function ClassicResultContent() {
  const { unlockOrientation } = useScreenOrientation();
  const finalTime = useAtomValue(classicFinalTimeAtom);
  const level = useAtomValue(activeLegacyLevelDataAtom);
  const levelIndex = useAtomValue(legacyLevelIndexAtom);
  const selected = useAtomValue(selectedLegacyLevelAtom);
  const setScreen = useSetAtom(screenAtom);
  const setSelectedLegacyLevel = useSetAtom(selectedLegacyLevelAtom);
  const setActiveLevelData = useSetAtom(activeLegacyLevelDataAtom);
  const setPlayerState = useSetAtom(classicPlayerStateAtom);
  const setStep = useSetAtom(classicStepAtom);
  const setStartTime = useSetAtom(classicStartTimeAtom);

  /**
   * 重置经典模式对局状态。
   * 注意：这里只重置 atoms（按键追踪集合由 App 挂载的 useClassicGameLogic 持有，
   * 本组件不再重复挂载该 hook，避免重复注册键盘监听）。
   */
  const resetClassicState = useCallback(() => {
    audioManager.releaseAll();
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStep(0);
    setStartTime(0);
  }, [setPlayerState, setStep, setStartTime]);

  // 进入结算页时停止所有残留的音符声音
  useEffect(() => {
    audioManager.releaseAll();
  }, []);

  const hasNextLevel = selected !== null && selected.index + 1 < levelIndex.length;

  /** 载入指定关卡数据并进入游戏屏（下一关用） */
  const startLevel = useCallback(
    async (index: number) => {
      const meta = levelIndex[index];
      const response = await fetch(`/levels/${meta.file}`);
      if (!response.ok) return;
      const data = (await response.json()) as LegacyLevelData;
      resetClassicState();
      setActiveLevelData(data);
      setSelectedLegacyLevel({ meta, index });
      setScreen('game');
    },
    [levelIndex, resetClassicState, setActiveLevelData, setSelectedLegacyLevel, setScreen],
  );

  /** 返回选歌：停止对局并解锁屏幕方向 */
  const handleBackToMenu = () => {
    audioManager.releaseAll();
    unlockOrientation();
    resetClassicState();
    setScreen('levelSelect');
  };

  if (!level || !selected) {
    return (
      <div className="text-center">
        <p className="mb-4">暂无结算数据，请先游玩一关。</p>
        <button
          onClick={handleBackToMenu}
          className="bg-white text-emerald-600 text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          返回选歌
        </button>
      </div>
    );
  }

  // 按用时评级：≤ranks[0] 为 S，≤ranks[1] 为 A，≤ranks[2] 为 B，否则 C
  const finalTimeInSeconds = finalTime / 1000;
  const ranks = level.ranks;
  let rank = 'C';
  let rankColor = 'text-slate-500';
  if (finalTimeInSeconds <= ranks[0]) {
    rank = 'S';
    rankColor = 'text-yellow-400';
  } else if (finalTimeInSeconds <= ranks[1]) {
    rank = 'A';
    rankColor = 'text-slate-300';
  } else if (finalTimeInSeconds <= ranks[2]) {
    rank = 'B';
    rankColor = 'text-amber-600';
  }

  return (
    <section className="w-[98%] max-w-7xl p-6 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20 text-center">
      <h2 className="text-3xl font-black mb-6">{level.name} Complete!</h2>
      <div className={`text-9xl font-black leading-none mb-2.5 ${rankColor}`}>{rank}</div>
      <div className="text-2xl font-bold mb-8 tabular-nums">Your Time: {finalTimeInSeconds.toFixed(2)}s</div>

      <div className="flex justify-center gap-4">
        {hasNextLevel && (
          <button
            onClick={() => void startLevel(selected.index + 1)}
            className="bg-white text-emerald-600 text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
          >
            下一关
          </button>
        )}
        <button
          onClick={() => void startLevel(selected.index)}
          className="bg-white text-emerald-600 text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          再来一次
        </button>
        <button
          onClick={handleBackToMenu}
          className="bg-white/20 text-white text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          返回选歌
        </button>
      </div>
    </section>
  );
}

/** 外层包 Suspense：内部需要读取异步的关卡索引 atom */
function ClassicResultScreen() {
  return (
    <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
      <ClassicResultContent />
    </Suspense>
  );
}

export default ClassicResultScreen;
