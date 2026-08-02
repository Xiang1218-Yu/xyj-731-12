import { useAtomValue } from 'jotai';
import { gameModeAtom, screenAtom } from '../atoms/gameAtoms';
import LevelSelectScreen from './LevelSelectScreen';
import GameScreen from './GameScreen';
import ResultScreen from './ResultScreen';
import ClassicGameScreen from './ClassicGameScreen';
import ClassicResultScreen from './ClassicResultScreen';
import ErrorBoundary from './ErrorBoundary';

/** 下落模式（音游）的屏幕组件映射 */
const rhythmScreens = {
  levelSelect: <LevelSelectScreen />,
  game: <GameScreen />,
  result: <ResultScreen />,
};

/** 经典模式（原版按键序列跟打）的屏幕组件映射 */
const classicScreens = {
  levelSelect: <LevelSelectScreen />,
  game: <ClassicGameScreen />,
  result: <ClassicResultScreen />,
};

function GameContainer() {
  const currentScreen = useAtomValue(screenAtom);
  const mode = useAtomValue(gameModeAtom);
  // 两种模式共用选歌页；游戏 / 结算屏按模式切换
  const screens = mode === 'classic' ? classicScreens : rhythmScreens;

  return (
    <main id="game-container" className="flex justify-center content-center w-full">
      <ErrorBoundary
        fallback={
          <div className="text-center p-8 bg-red-500/20 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Loading Failed</h2>
            <p>An error occurred while loading level data. Please refresh the page and try again.</p>
          </div>
        }
      >
        {screens[currentScreen]}
      </ErrorBoundary>
    </main>
  );
}

export default GameContainer;
