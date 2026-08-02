import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import EditorPage from './pages/EditorPage'
import RankingPage from './pages/RankingPage'
import RhythmPlayPage from './pages/RhythmPlayPage'
import './index.css'

/**
 * 应用路由表。
 * - "/"        原有的手指舞（Finger Dance）模式主页面（关卡选择 + 对战式练习）。
 * - "/editor"  可视化谱面编辑器（独立页面，与游戏主页面分离）。
 * - "/ranking" 排行榜页面（展示 localStorage 中的历史成绩）。
 * - "/play"    节奏模式游玩页面（基于谱面进行判定/计分，游玩结束写入成绩）。
 */
const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/editor', element: <EditorPage /> },
  { path: '/ranking', element: <RankingPage /> },
  { path: '/play', element: <RhythmPlayPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
