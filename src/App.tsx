/**
 * App —— 应用根组件。
 *
 * 负责：
 *  - 挂载全局音频处理（保留旧版菜单音效）；
 *  - 启动时从 localStorage 读取用户自定义谱面；
 *  - 订阅浏览器前进/后退，同步 routeAtom；
 *  - 根据当前路由渲染首页 / 编辑器 / 排行榜。
 *
 * 旧版的指舞小游戏（GameContainer 等）仍保留在代码库中，
 * 但新的主入口改为基于谱面（Chart）的节奏游戏。
 */

import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { routeAtom, syncRouteAtom } from './atoms/routeAtoms';
import {
  initCustomChartsAtom,
  customChartsAtom,
  persistCustomChartsAtom,
} from './atoms/chartAtoms';
import { useGlobalAudio } from './hooks/useGlobalAudio';
import HomePage from './pages/HomePage';
import EditorPage from './pages/EditorPage';
import RankingPage from './pages/RankingPage';

function App() {
  useGlobalAudio();
  const route = useAtomValue(routeAtom);
  const syncRoute = useSetAtom(syncRouteAtom);
  const initCustomCharts = useSetAtom(initCustomChartsAtom);
  const persistCustomCharts = useSetAtom(persistCustomChartsAtom);
  // 读取自定义谱面以订阅变化（变化时触发持久化）
  const customCharts = useAtomValue(customChartsAtom);

  // 初始化：同步路由 + 加载本地自定义谱面
  useEffect(() => {
    const cleanup = syncRoute();
    initCustomCharts();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [syncRoute, initCustomCharts]);

  // 自定义谱面变化时自动持久化
  useEffect(() => {
    persistCustomCharts();
  }, [customCharts, persistCustomCharts]);

  let page;
  if (route === '/editor') {
    page = <EditorPage />;
  } else if (route === '/ranking') {
    page = <RankingPage />;
  } else {
    page = <HomePage />;
  }

  return (
    <div className="font-sans min-h-svh w-full bg-slate-950 text-white">
      {page}
    </div>
  );
}

export default App;
