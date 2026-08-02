// ============================================================
// Hash 路由 Hook (useHashRoute)
// ============================================================
// 支持以下路径：
// - #/ 或空 : 主菜单 (levelSelect)
// - #/editor : 谱面编辑器
// - #/ranking : 排行榜
//
// 游戏中和结算页面不修改 URL hash，避免与编辑器/排行榜导航冲突。
// 使用 isProgrammaticRef 标志防止程序化修改 hash 时触发循环更新。
// ============================================================

import { useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { screenAtom, type Screen } from '../atoms/gameAtoms';

// 路径到屏幕的映射
const PATH_TO_SCREEN: Record<string, Screen> = {
  '/': 'levelSelect',
  '/editor': 'editor',
  '/ranking': 'ranking',
};

// 屏幕到路径的映射（game/result 不映射，保持当前 URL）
const SCREEN_TO_PATH: Partial<Record<Screen, string>> = {
  levelSelect: '/',
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
  // 标志位：标记当前 hash 变更是由代码程序化触发的，
  // 此时 hashchange 事件不应再次更新 screen，防止循环
  const isProgrammaticRef = useRef(false);

  // 监听 hash 变化（浏览器前进/后退按钮）
  useEffect(() => {
    const handleHashChange = () => {
      // 如果是我们自己程序化设置的 hash，忽略此次事件
      if (isProgrammaticRef.current) {
        isProgrammaticRef.current = false;
        return;
      }
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

  // 当屏幕变化时更新 URL hash（仅对有映射的屏幕）
  useEffect(() => {
    const targetPath = SCREEN_TO_PATH[screen];
    // 如果当前屏幕没有对应的路径（如 game/result），不修改 hash
    if (!targetPath) return;

    const currentPath = window.location.hash.replace(/^#/, '') || '/';
    if (targetPath !== currentPath) {
      // 标记为程序化变更，防止 hashchange 回调循环触发
      isProgrammaticRef.current = true;
      window.location.hash = targetPath;
    }
  }, [screen]);
}
