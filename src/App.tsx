import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { RefreshCw, Home, Maximize, Minimize, Pencil } from 'lucide-react';
import { audioManager } from './lib/audio';
import {
  screenAtom,
  currentChartAtom,
  cameFromEditorAtom,
} from './atoms/gameAtoms';
import GameContainer from './components/GameContainer';
import { useGameLogic } from './hooks/useGameLogic';
import { useGlobalAudio } from './hooks/useGlobalAudio';
import { useEffect } from 'react';
import { useFullscreen } from './hooks/useFullscreen';
import { useScreenOrientation } from './hooks/useScreenOrientation';
import { useHashRoute } from './hooks/useHashRoute';

const isTouchDevice = () =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0;

/**
 * 应用根组件
 *
 * 职责：
 * - 初始化全局音频
 * - 管理全屏和屏幕方向
 * - 根据当前屏幕显示对应的控制按钮
 * - 路由到 GameContainer
 */
function App() {
  useGlobalAudio();
  useHashRoute(); // 启用 hash 路由（#/editor, #/ranking）
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { lockOrientation, unlockOrientation } = useScreenOrientation();
  const [screen, setScreen] = useAtom(screenAtom);
  const currentChart = useAtomValue(currentChartAtom);
  const cameFromEditor = useAtomValue(cameFromEditorAtom);
  const setCameFromEditor = useSetAtom(cameFromEditorAtom);
  const setCurrentChart = useSetAtom(currentChartAtom);
  const { resetGameState: resetClassicGame } = useGameLogic();

  useEffect(() => {
    // 检测触摸设备（预留扩展）
    isTouchDevice();
  }, []);

  /**
   * 返回主菜单
   */
  const handleBackToMenu = () => {
    audioManager.releaseAll();
    unlockOrientation();
    resetClassicGame();
    setCurrentChart(null);
    setCameFromEditor(false);
    setScreen('levelSelect');
  };

  /**
   * 返回谱面编辑器继续编辑
   * 仅当游戏从编辑器进入时可用
   */
  const handleBackToEditor = () => {
    audioManager.releaseAll();
    unlockOrientation();
    // 清空当前游戏谱面引用（编辑器中保留原始数据）
    setCurrentChart(null);
    setCameFromEditor(false);
    setScreen('editor');
  };

  /**
   * 重置当前游戏
   */
  const handleReset = () => {
    if (currentChart) {
      // 节奏模式：通过全局重置函数触发
      const resetFn = (window as unknown as {
        __resetRhythmGame?: () => void;
      }).__resetRhythmGame;
      if (resetFn) resetFn();
    } else {
      // 经典模式
      resetClassicGame();
    }
  };

  const handleToggleFullscreen = () => {
    toggleFullscreen();
    lockOrientation('landscape');
  };

  // 只有在游戏屏幕才显示控制按钮
  const showGameControls = screen === 'game';
  // 编辑器、排行榜、节奏游戏结算页使用深色背景
  const useDarkBg =
    screen === 'editor' ||
    screen === 'ranking' ||
    (screen === 'result' && currentChart);

  return (
    <div
      className={`font-sans flex justify-center items-center overflow-hidden select-none relative ${
        useDarkBg ? 'bg-slate-900' : 'bg-emerald-500'
      } text-white ${
        isFullscreen ? 'h-screen w-screen' : 'h-svh w-svw'
      }`}
    >
      {/* 游戏中的右上角控制按钮 */}
      {showGameControls && (
        <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
          {/* 从编辑器进入时显示返回编辑器按钮 */}
          {cameFromEditor && (
            <button
              onClick={handleBackToEditor}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 transition-colors text-sm"
              title="返回编辑器"
            >
              <Pencil size={16} />
              编辑器
            </button>
          )}
          <button
            onClick={handleToggleFullscreen}
            className="p-2 text-white/50 hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 text-white/50 hover:text-white transition-colors cursor-pointer"
            title="Restart"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={handleBackToMenu}
            className="p-2 text-white/50 hover:text-white transition-colors cursor-pointer"
            title="Back to Menu"
          >
            <Home size={20} />
          </button>
       <[CLS_never_used_51bce0c785ca2f68081bfa7d91973934]></div>
      )}

      <GameContainer />
    </div>
  );
}

export default App;
