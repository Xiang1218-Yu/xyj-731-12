/**
 * ClassicApp —— 原始「指舞」游戏入口（完全保留改版前的页面与交互）。
 *
 * 该组件即原 App.tsx 的内容：
 *  - 关卡选择（LevelSelectScreen）-> 游戏（GameScreen）-> 结算（ResultScreen）；
 *  - 原有全屏、朝向、触控、音频等行为保持不变。
 *
 * 仅在「关卡选择」界面右下角增加了一个小型悬浮导航，
 * 用于跳转到新增的节奏模式（/rhythm）、谱面编辑器（/editor）、排行榜（/ranking）。
 * 该导航不覆盖、不改动任何原有按钮与交互。
 */

import { useAtom } from 'jotai';
import { RefreshCw, Home, Maximize, Minimize, Music } from 'lucide-react';
import { audioManager } from '../lib/audio';
import { screenAtom } from '../atoms/gameAtoms';
import { navigateAtom } from '../atoms/routeAtoms';
import GameContainer from '../components/GameContainer';
import { useGameLogic } from '../hooks/useGameLogic';
import { useGlobalAudio } from '../hooks/useGlobalAudio';
import { useEffect, useState } from 'react';
import TouchOverlay from '../components/TouchOverlay';
import { useScreenOrientation } from '../hooks/useScreenOrientation';
import { useFullscreen } from '../hooks/useFullscreen';

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function ClassicApp() {
  useGlobalAudio(); // Mount the global audio handler
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { lockOrientation, unlockOrientation } = useScreenOrientation();
  const [screen, setScreen] = useAtom(screenAtom);
  const navigate = useAtom(navigateAtom)[1];
  const { resetGameState } = useGameLogic();
  const [showTouchOverlay, setShowTouchOverlay] = useState(false);

  useEffect(() => {
    setShowTouchOverlay(isTouchDevice());
  }, []);

  const handleBackToMenu = () => {
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
            onClick={resetGameState}
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

      {/* 仅在关卡选择界面显示进入新增节奏模式的入口（不影响原有交互） */}
      {screen === 'levelSelect' && (
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
          <button
            onClick={() => navigate('/rhythm')}
            className="flex items-center gap-1.5 bg-black/40 hover:bg-black/60 text-white text-xs font-bold px-3 py-2 rounded-lg backdrop-blur"
            title="Rhythm mode (new)"
          >
            <Music size={14} /> Rhythm Mode
          </button>
        </div>
      )}

      <GameContainer />
    </div>
  );
}

export default ClassicApp;
