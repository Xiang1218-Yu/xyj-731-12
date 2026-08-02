/**
 * App —— 应用根组件（路由分发）。
 *
 * 路由设计（保留原有游戏，新增功能独立成页，互不干扰）：
 *  - /        原始「指舞」游戏（关卡选择 / 游戏 / 结算，交互完全不变）；
 *  - /rhythm  新增的下落式节奏游戏（基于谱面 Chart，带判定/评分/连击）；
 *  - /editor  可视化谱面编辑器；
 *  - /ranking 成绩排行榜。
 *
 * 启动时从 localStorage 读取用户自定义谱面，并同步浏览器前进/后退。
 */

import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { routeAtom, syncRouteAtom } from './atoms/routeAtoms';
import {
  initCustomChartsAtom,
  customChartsAtom,
  persistCustomChartsAtom,
} from './atoms/chartAtoms';
import ClassicApp from './pages/ClassicApp';
import HomePage from './pages/HomePage';
import EditorPage from './pages/EditorPage';
import RankingPage from './pages/RankingPage';

function App() {
  const route = useAtomValue(routeAtom);
  const syncRoute = useSetAtom(syncRouteAtom);
  const initCustomCharts = useSetAtom(initCustomChartsAtom);
  const persistCustomCharts = useSetAtom(persistCustomChartsAtom);
  // 订阅自定义谱面变化以自动持久化
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
  } else if (route === '/rhythm') {
    page = <HomePage />;
  } else {
    // / —— 原始游戏，页面与交互保持不变
    page = <ClassicApp />;
  }

  return (
    <div className="font-sans min-h-svh w-full bg-slate-950 text-white">
      {page}
    </div>
  );
}

export default App;
