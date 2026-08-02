import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import EditorPage from './editor/EditorPage'
import RankingPage from './ranking/RankingPage'
import './index.css'

/**
 * 轻量级路径路由（无需引入 react-router）：
 * - /editor  → 谱面编辑器（独立页面）
 * - /ranking → 排行榜（独立页面）
 * - 其他     → 游戏主页（选歌 / 对局 / 结算）
 * 三个页面均为整页渲染，互不挂载，保证编辑器与游戏主页面完全分离。
 */
const path = window.location.pathname;
let page = <App />;
if (path.startsWith('/editor')) {
  page = <EditorPage />;
} else if (path.startsWith('/ranking')) {
  page = <RankingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
