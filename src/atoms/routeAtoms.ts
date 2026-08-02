/**
 * 极简客户端路由状态（基于 history API + Jotai）。
 *
 * 需求要求：
 *  - 游戏主页面与谱面编辑器分离，编辑器位于 /editor；
 *  - 排行榜位于 /ranking。
 *
 * 这里不引入 react-router，用一个 atom 同步 window.location.pathname，
 * 并通过 history.pushState 进行跳转，足以支撑三个静态页面。
 */

import { atom } from 'jotai';

export type Route = '/' | '/editor' | '/ranking';

/** 根据当前 pathname 解析为已知路由，未知路径统一回到首页 */
function parseRoute(pathname: string): Route {
  if (pathname === '/editor') return '/editor';
  if (pathname === '/ranking') return '/ranking';
  return '/';
}

/** 当前路由 atom，初始化时读取 location，并订阅浏览器前进/后退 */
export const routeAtom = atom<Route>(parseRoute(window.location.pathname));

/** 挂载时调用，监听 popstate */
export const syncRouteAtom = atom(null, (_get, set) => {
  const onPop = () => set(routeAtom, parseRoute(window.location.pathname));
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
});

/** 导航到指定路由 */
export const navigateAtom = atom(null, (_get, set, to: Route) => {
  if (window.location.pathname !== to) {
    window.history.pushState({}, '', to);
  }
  set(routeAtom, to);
});
