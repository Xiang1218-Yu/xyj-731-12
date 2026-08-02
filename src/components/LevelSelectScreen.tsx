// ============================================================
// 主菜单 / 关卡选择屏幕 (LevelSelectScreen)
// ============================================================
// 展示内容：
// 1. 谱面编辑器和排行榜入口
// 2. 音阶选择
// 3. 已保存的自定义谱面（可直接游玩）
// 4. 内置经典关卡列表
// ============================================================

import { Suspense, useState, useEffect } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  screenAtom,
  levelIndexAtom,
  selectedLevelInfoAtom,
  scaleAtom,
  type LevelIndexInfo,
  currentLevelIndexAtom,
  playerStateAtom,
  currentStepAtom,
  startTimeAtom,
  currentChartAtom,
  cameFromEditorAtom,
} from '../atoms/gameAtoms';
import { audioManager, scales, type ScaleName } from '../lib/audio';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard';
import { useFullscreen } from '../hooks/useFullscreen';
import { useScreenOrientation } from '../hooks/useScreenOrientation';
import { Pencil, Trophy, Music, Play, FileMusic } from 'lucide-react';
import { loadCustomCharts, type StoredChart } from '../lib/customCharts';

/**
 * 内置经典关卡列表组件
 */
function LevelList() {
  const levelIndex = useAtomValue(levelIndexAtom);
  const setScreen = useSetAtom(screenAtom);
  const setSelectedLevelInfo = useSetAtom(selectedLevelInfoAtom);
  const setCurrentLevelIndex = useSetAtom(currentLevelIndexAtom);
  const setPlayerState = useSetAtom(playerStateAtom);
  const setCurrentStep = useSetAtom(currentStepAtom);
  const setStartTime = useSetAtom(startTimeAtom);
  const setCurrentChart = useSetAtom(currentChartAtom);
  const setCameFromEditor = useSetAtom(cameFromEditorAtom);
  const { enterFullscreen } = useFullscreen();
  const { lockOrientation } = useScreenOrientation();

  const handleLevelSelect = async (levelInfo: LevelIndexInfo, index: number) => {
    // Start audio context on first user interaction
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }

    // 全屏和锁屏方向可能在某些环境（如 iframe）中失败，不阻塞游戏启动
    enterFullscreen().catch(() => {});
    lockOrientation('landscape').catch(() => {});

    // 清除节奏游戏状态，确保进入经典模式
    setCurrentChart(null);
    setCameFromEditor(false);

    // Reset game state before starting a new level
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setCurrentStep(0);
    setStartTime(0);

    setSelectedLevelInfo(levelInfo);
    setCurrentLevelIndex(index);
    setScreen('game');
  };

  return (
    <div className="flex flex-col gap-2 max-h-[25vh] overflow-y-auto pr-1 border-t border-white/20 pt-3">
      <div className="text-xs text-white/60 text-center mb-1">CLASSIC LEVELS</div>
      {levelIndex.map((level, index) => (
        <button
          key={level.id}
          onClick={() => handleLevelSelect(level, index)}
          className="bg-white text-emerald-600 text-sm font-bold border-none py-2.5 px-5 rounded-xl cursor-pointer transition-transform duration-100 ease-in-out hover:scale-105"
        >
          {level.name}
        </button>
      ))}
    </div>
  );
}

/**
 * 已保存的自定义谱面列表组件
 * 从 localStorage 读取，点击直接进入节奏游戏
 */
function CustomChartsList() {
  const setScreen = useSetAtom(screenAtom);
  const setCurrentChart = useSetAtom(currentChartAtom);
  const setCameFromEditor = useSetAtom(cameFromEditorAtom);
  const setPlayerState = useSetAtom(playerStateAtom);
  const setStartTime = useSetAtom(startTimeAtom);
  const { enterFullscreen } = useFullscreen();
  const { lockOrientation } = useScreenOrientation();

  const [customCharts, setCustomCharts] = useState<StoredChart[]>([]);

  // 组件挂载和屏幕聚焦时加载已保存谱面
  useEffect(() => {
    setCustomCharts(loadCustomCharts());
  }, []);

  // 监听窗口聚焦事件，刷新列表（从编辑器返回时能看到新保存的谱面）
  useEffect(() => {
    const onFocus = () => setCustomCharts(loadCustomCharts());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  /**
   * 点击自定义谱面直接进入节奏游戏
   */
  const handlePlayCustomChart = async (stored: StoredChart) => {
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }
    // 全屏可能失败，不阻塞
    enterFullscreen().catch(() => {});
    lockOrientation('landscape').catch(() => {});

    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStartTime(0);
    setCurrentChart(stored.chart);
    setCameFromEditor(false); // 从首页进入，不是从编辑器测试
    setScreen('game');
  };

  if (customCharts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-white/20 pt-3 mb-2">
      <div className="text-xs text-white/60 text-center mb-1 flex items-center justify-center gap-1">
        <FileMusic size={12} />
        MY CHARTS ({customCharts.length})
      </div>
      {customCharts.map((stored) => (
        <button
          key={stored.id}
          onClick={() => handlePlayCustomChart(stored)}
          className="flex items-center gap-3 bg-white/15 hover:bg-white/25 text-white text-sm font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all duration-100 hover:scale-[1.02] text-left"
        >
          <Play size={16} className="text-emerald-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{stored.chart.metadata.title}</div>
            <div className="text-xs text-white/60 font-normal">
              {stored.chart.metadata.difficulty} · {stored.chart.notes.length} 音符
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * 主菜单屏幕主组件
 */
function LevelSelectScreen() {
  useMenuKeyboard(); // Enable keyboard sounds on this screen
  const setScreen = useSetAtom(screenAtom);
  const [currentScale, setCurrentScale] = useAtom(scaleAtom);
  const [customScaleInput, setCustomScaleInput] = useState(
    'C2 D2 E2 G2 A2 C3 D3 E3 G3',
  );
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleScaleChange = (newScale: ScaleName) => {
    setCurrentScale(newScale);
    audioManager.setScale(newScale);
    setShowCustomInput(false);
  };

  const handleCustomScaleApply = () => {
    const notes = customScaleInput.trim().split(/\s+/);
    if (notes.length === 9) {
      audioManager.setCustomScale(notes);
      setCurrentScale('Custom');
    } else {
      alert('Please enter exactly 9 notes separated by spaces.');
    }
  };

  const handleCustomButtonClick = () => {
    setShowCustomInput(!showCustomInput);
    if (currentScale !== 'Custom') {
      handleCustomScaleApply();
    }
  };

  const handleOpenEditor = () => {
    setScreen('editor');
  };

  const handleOpenRanking = () => {
    setScreen('ranking');
  };

  return (
    <section className="w-[90%] max-w-3xl p-5 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20 max-h-[92vh] overflow-y-auto">
      <h1 className="text-center font-black text-4xl mb-5 flex items-center justify-center gap-3">
        <Music size={36} />
        Finger Dance
      </h1>

      {/* 编辑器和排行榜入口 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={handleOpenEditor}
          className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 px-4 rounded-xl transition-transform hover:scale-105 cursor-pointer"
        >
          <Pencil size={20} />
          谱面编辑器
        </button>
        <button
          onClick={handleOpenRanking}
          className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 px-4 rounded-xl transition-transform hover:scale-105 cursor-pointer"
        >
          <Trophy size={20} />
          排行榜
        </button>
      </div>

      {/* 已保存的自定义谱面 */}
      <CustomChartsList />

      {/* 音阶选择 */}
      <div className="mb-4">
        <label className="block text-sm font-bold mb-2 text-center">
          SELECT MUSICAL SCALE
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(scales) as ScaleName[]).map((scaleName) => (
            <button
              key={scaleName}
              onClick={() => handleScaleChange(scaleName)}
              className={`p-2 rounded-md text-sm font-bold transition-colors ${
                currentScale === scaleName
                  ? 'bg-white text-emerald-600'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {scaleName}
            </button>
          ))}
          <button
            onClick={handleCustomButtonClick}
            className={`p-2 rounded-md text-sm font-bold transition-colors ${
              currentScale === 'Custom'
                ? 'bg-white text-emerald-600'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            Custom
          </button>
        </div>
        {showCustomInput && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={customScaleInput}
              onChange={(e) => setCustomScaleInput(e.target.value)}
              className="grow bg-white/10 p-2 rounded-md text-white placeholder-white/50"
              placeholder="Enter 9 notes (e.g., C4 D4 E4...)"
            />
            <button
              onClick={handleCustomScaleApply}
              className="bg-emerald-500 text-white font-bold p-2 rounded-md hover:bg-emerald-600"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* 经典关卡列表 */}
      <Suspense fallback={<div className="text-center p-8">Loading levels...</div>}>
        <LevelList />
      </Suspense>
    </section>
  );
}

export default LevelSelectScreen;
