import { useAtom, useAtomValue } from 'jotai';
import { RefreshCw, Home, Maximize, Minimize } from 'lucide-react';
import { audioManager } from './lib/audio';
import { gameModeAtom, screenAtom } from './atoms/gameAtoms';
import GameContainer from './components/GameContainer';
import { useGameLogic } from './hooks/useGameLogic';
import { useClassicGameLogic } from './hooks/useClassicGameLogic';
import { useGlobalAudio } from './hooks/useGlobalAudio';
import { useEffect, useState } from 'react';
import TouchOverlay from './components/TouchOverlay';
import { useScreenOrientation } from './hooks/useScreenOrientation';
import { useFullscreen } from './hooks/useFullscreen';

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function App() {
  useGlobalAudio(); // Mount the global audio handler
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { lockOrientation, unlockOrientation } = useScreenOrientation();
  const [screen, setScreen] = useAtom(screenAtom);
  const mode = useAtomValue(gameModeAtom);
  // 两种模式的逻辑 hook 同时挂载，各自通过「模式 + 屏幕」守卫过滤输入，互不干扰
  const { resetGameState } = useGameLogic();
  const { resetClassicState } = useClassicGameLogic();
  const [showTouchOverlay, setShowTouchOverlay] = useState(false);

  useEffect(() => {
    setShowTouchOverlay(isTouchDevice());
  }, []);

  /** 按当前模式重置对局（下落模式停止 rAF 循环，经典模式清零步骤与计时） */
  const handleReset = () => {
    if (mode === 'classic') {
      resetClassicState();
    } else {
      resetGameState();
    }
  };

  const handleBackToMenu = () => {
    // 两种模式的状态都重置，保证返回选歌后干净
    resetGameState();
    resetClassicState();
    audioManager.releaseAll();
    unlockOrientation();
    setScreen('levelSelect');
  };

  const handleToggleFullscreen = () => {
    toggleFullscreen();
    lockOrientation('landscape');
  };

  return (
    <div
      className={`font-sans flex justify-center items-center bg-emerald-500 text-white overflow-hidden select-none relative ${
        isFullscreen ? 'h-screen w-screen' : 'h-svh w-svw'
      }`}
    >
      {screen === 'game' && showTouchOverlay && <TouchOverlay />}
      {screen === 'game' && (
        <div className="absolute top-4 right-4 flex items-center gap-4 z-20">
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
            title="Restart Level"
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
