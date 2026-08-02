import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { screenAtom, type Screen } from '../atoms/gameAtoms';

/**
 * 简单的 Hash 路由 Hook
 *
 * 支持以下路径：
 * - #/ 或空 : 主菜单 (levelSelect)
 * - #/editor : 谱面编辑器
 * - #/ranking : 排行榜
 *
 * 同时在屏幕切换时自动更新 URL hash，支持浏览器前进/后退
 */

// 路径到屏幕的映射
const PATH_TO_SCREEN: Record<string, Screen> = {
  '/': 'levelSelect',
  '/editor': 'editor',
  '/ranking': 'ranking',
};

// 屏幕到路径的映射
const SCREEN_TO_PATH: Record<Screen, string> = {
  levelSelect: '/',
  game: '/',
  result: '/',
  editor: '/editor',
  ranking: '/ranking',
};

/**
 * 从当前 hash 解析屏幕
 */
function getScreenFromHash(): Screen {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  return PATH_TO_SCREEN[hash] || 'levelSelect';
}

/**
 * Hash 路由 Hook
 * 监听 hash 变化并同步屏幕状态，同时在屏幕变化时更新 hash
 */
export function useHashRoute() {
  const [screen, setScreen] = useAtom(screenAtom);

  // 监听 hash 变化（浏览器前进/后退）
  useEffect(() => {
    const handleHashChange = () => {
      const newScreen = getScreenFromHash();
      setScreen(newScreen);
    };

    // 初始化时从 URL 读取屏幕
    const initialScreen = getScreenFromHash();
    if (initialScreen !== screen) {
      setScreen(initialScreen);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当屏幕变化时更新 URL hash（仅在非游戏/结果屏幕时）
  useEffect(() => {
    const targetPath = SCREEN_TO_PATH[screen];
    const currentPath = window.location.hash.replace(/^#/, '') || '/';

    if (targetPath !== currentPath) {
      window.location.hash = targetPath;
    }
  }, [screen]);
}
