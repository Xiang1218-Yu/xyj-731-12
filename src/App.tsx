import { useAtom, useAtomValue } from 'jotai';
import { RefreshCw, Home, Maximize, Minimize } from 'lucide-react';
import { audioManager } from './lib/audio';
import { screenAtom, currentChartAtom } from './atoms/gameAtoms';
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
  const { resetGameState: resetClassicGame } = useGameLogic();

  useEffect(() => {
    // 检测触摸设备（预留扩展）
    isTouchDevice();
  }, []);

  /**
   * 返回主菜单
   * 同时处理经典模式和节奏模式的清理
   */
  const handleBackToMenu = () => {
    audioManager.releaseAll();
    unlockOrientation();
    // 经典模式重置
    resetClassicGame();
    // 回到主菜单
    setScreen('levelSelect');
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
  // 只有在游戏或主菜单使用绿色背景；其他页面用深色背景
  const useDarkBg = screen === 'editor' || screen === 'ranking' || (screen === 'result' && currentChart);

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
        <div className="absolute top-4 right-4 flex items-center gap-4 z-50">
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
        </div>
      )}

      <GameContainer />
    </div>
  );
}

export default App;
