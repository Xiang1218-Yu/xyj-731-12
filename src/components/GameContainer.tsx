import { useAtomValue } from 'jotai';
import { screenAtom, currentChartAtom, selectedLevelInfoAtom } from '../atoms/gameAtoms';
import LevelSelectScreen from './LevelSelectScreen';
import GameScreen from './GameScreen';
import ResultScreen from './ResultScreen';
import EditorScreen from './EditorScreen';
import RankingScreen from './RankingScreen';
import RhythmGameScreen from './RhythmGameScreen';
import ErrorBoundary from './ErrorBoundary';
import { Suspense } from 'react';

/**
 * 游戏容器组件
 *
 * 负责根据当前屏幕状态路由到对应的页面组件：
 * - levelSelect: 主菜单/关卡选择
 * - game: 游戏界面（根据是否有自定义谱面，决定使用经典模式还是节奏模式）
 * - result: 结算界面
 * - editor: 谱面编辑器
 * - ranking: 排行榜
 */
function GameContainer() {
  const currentScreen = useAtomValue(screenAtom);
  const currentChart = useAtomValue(currentChartAtom);
  const selectedLevelInfo = useAtomValue(selectedLevelInfoAtom);

  /**
   * 渲染游戏屏幕
   * 如果有自定义谱面（来自编辑器），使用新的节奏游戏屏幕；
   * 否则使用经典的按键组合模式
   */
  const renderGameScreen = () => {
    if (currentChart) {
      return <RhythmGameScreen />;
    }
    if (selectedLevelInfo) {
      return <GameScreen />;
    }
    return <GameScreen />;
  };

  // 屏幕组件映射
  const screenComponents = {
    levelSelect: <LevelSelectScreen />,
    game: (
      <Suspense
        fallback={
          <div className="text-center p-8 text-white">Loading...</div>
        }
      >
        {renderGameScreen()}
      </Suspense>
    ),
    result: <ResultScreen />,
    editor: <EditorScreen />,
    ranking: <RankingScreen />,
  };

  return (
    <main id="game-container" className="w-full self-stretch flex items-center justify-center">
      <ErrorBoundary
        fallback={
          <div className="text-center p-8 bg-red-500/20 rounded-lg text-white">
            <h2 className="text-2xl font-bold mb-4">出错了</h2>
            <p>加载或运行时发生错误，请刷新页面重试。</p>
          </div>
        }
      >
        {screenComponents[currentScreen]}
      </ErrorBoundary>
    </main>
  );
}

export default GameContainer;
