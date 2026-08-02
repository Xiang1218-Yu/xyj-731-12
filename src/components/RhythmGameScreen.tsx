// ============================================================
// 节奏游戏主屏幕组件 (RhythmGameScreen)
// ============================================================
// 这是新谱面系统的游戏界面，采用下落式音符玩法：
// - 9 条轨道对应键盘 A S D F SPACE J K L ;
// - 音符从顶部下落，到达底部判定线时需要按下对应按键
// - 实时显示分数、准确率、连击、判定结果
// ============================================================

import { useAtomValue } from 'jotai';
import {
  currentChartAtom,
  playerStateAtom,
  startTimeAtom,
  gameStatsAtom,
  lastJudgmentAtom,
  judgedNotesAtom,
} from '../atoms/gameAtoms';
import { useEffect, useState, useRef } from 'react';
import { useRhythmGameLogic } from '../hooks/useRhythmGameLogic';
import type { Note, Judgment } from '../types/chart';

// 9 个轨道对应的按键标签（显示在底部按键区域）
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

// 各轨道音符的渐变色（从左到右：暖色 → 冷色 → 紫色）
const LANE_COLORS = [
  'from-rose-500 to-rose-600',
  'from-orange-500 to-orange-600',
  'from-amber-500 to-amber-600',
  'from-yellow-500 to-yellow-600',
  'from-emerald-500 to-emerald-600',
  'from-cyan-500 to-cyan-600',
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-fuchsia-500 to-fuchsia-600',
];

// 判定结果对应的文字和颜色（用于中央弹出特效）
const JUDGMENT_STYLES: Record<Judgment, { text: string; color: string }> = {
  perfect: { text: 'PERFECT', color: 'text-yellow-300' },
  good: { text: 'GOOD', color: 'text-emerald-400' },
  miss: { text: 'MISS', color: 'text-red-500' },
};

// 音符从出现到到达判定线的总时间（毫秒）
// 必须与 useRhythmGameLogic 中的 NOTE_APPROACH_TIME 保持一致
const NOTE_APPROACH_TIME = 2000;

// ============================================================
// 子组件
// ============================================================

/**
 * 单个下落音符组件
 * 根据当前游戏时间计算音符在轨道中的垂直位置
 * 命中后播放淡出动画，Miss 后变灰保留短暂时间
 */
function FallingNote({
  note,
  currentTime,
  isJudged,
  judgment,
}: {
  note: Note;
  currentTime: number;
  isJudged: boolean;
  judgment?: Judgment;
}) {
  // 计算音符到达判定线还剩多少毫秒
  const noteTime = note.time;
  const timeUntilNote = noteTime - currentTime;

  // 音符已经完全滑过判定线且已判定：不再渲染
  if (isJudged && timeUntilNote < -100) return null;
  // 音符还未进入视野（提前量之外）：不渲染
  if (timeUntilNote > NOTE_APPROACH_TIME) return null;

  // 将剩余时间映射为 0~100% 的垂直位置
  // progress = 0 时音符在顶部（刚出现），= 1 时在底部判定线
  const progress = 1 - timeUntilNote / NOTE_APPROACH_TIME;
  const topPercent = progress * 100;

  // 根据判定结果设置视觉效果
  // - 命中（Perfect/Good）：快速淡出并放大
  // - Miss：变暗、保留原色但降低透明度
  const opacity = isJudged ? (judgment === 'miss' ? 0.3 : 0) : 1;
  const scale = isJudged ? (judgment === 'miss' ? 1 : 1.5) : 1;
  const noteClass =
    isJudged && judgment === 'miss'
      ? 'from-slate-500 to-slate-600' // Miss 音符变灰
      : LANE_COLORS[note.lane];

  return (
    <div
      className={`absolute w-full flex justify-center transition-opacity duration-150 pointer-events-none`}
      style={{
        top: `${topPercent}%`,
        opacity,
        transform: `translateY(-50%) scale(${scale})`,
      }}
    >
      {/* 音符本体 */}
      <div
        className={`mx-auto w-4/5 h-5 rounded-md bg-gradient-to-b ${noteClass} shadow-lg`}
      >
        {/* 顶部高光，增加立体感 */}
        <div className="w-full h-1/2 bg-white/30 rounded-t-md" />
      </div>
    </div>
  );
}

/**
 * 判定文字弹出组件
 * 每次判定时在屏幕中央显示 PERFECT/GOOD/MISS 文字，带有缩放淡出动画
 */
function JudgmentPopup({ judgment }: { judgment: Judgment | null }) {
  const [visible, setVisible] = useState(false);
  const [currentJudgment, setCurrentJudgment] = useState<Judgment | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // 收到新的判定结果时显示
    if (judgment) {
      setCurrentJudgment(judgment);
      setVisible(true);

      // 400ms 后自动隐藏
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setVisible(false);
      }, 400);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [judgment]);

  if (!currentJudgment) return null;

  const style = JUDGMENT_STYLES[currentJudgment];

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 text-4xl font-black ${style.color} transition-all duration-300 pointer-events-none z-20 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-150'
      }`}
      style={{ top: '35%' }}
    >
      {style.text}
    </div>
  );
}

/**
 * 连击数显示组件
 * 连击数 >= 2 时才显示，带有脉冲动画效果
 */
function ComboDisplay({ combo }: { combo: number }) {
  if (combo < 2) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[45%] text-center pointer-events-none z-10">
      <div className="text-6xl font-black text-white drop-shadow-lg animate-pulse">
        {combo}
      </div>
      <div className="text-lg font-bold text-white/80 tracking-widest">COMBO</div>
    </div>
  );
}

/**
 * 游戏计时器组件
 * 使用 requestAnimationFrame 实时更新已游玩时间
 */
function GameTimer({ startTime }: { startTime: number }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    // 游戏未开始时显示 0
    if (startTime === 0) {
      setTime(0);
      return;
    }

    let rafId: number;
    const update = () => {
      setTime(performance.now() - startTime);
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafId);
  }, [startTime]);

  return (
    <span className="text-lg font-mono">{(time / 1000).toFixed(2)}s</span>
  );
}

// ============================================================
// 主组件
// ============================================================

/**
 * 节奏游戏主屏幕
 *
 * 布局结构（从上到下）：
 * 1. 顶部信息栏：歌曲信息 + 分数/准确率/计时器
 * 2. 游戏区域：9 条轨道 + 下落音符 + 判定线 + 特效
 * 3. 底部按键栏：9 个按键的视觉反馈
 */
export default function RhythmGameScreen() {
  // --- 从 Jotai 获取全局状态 ---
  const currentChart = useAtomValue(currentChartAtom); // 当前谱面
  const playerState = useAtomValue(playerStateAtom); // 按键按下状态
  const startTime = useAtomValue(startTimeAtom); // 游戏开始时间戳
  const stats = useAtomValue(gameStatsAtom); // 实时统计数据
  const lastJudgment = useAtomValue(lastJudgmentAtom); // 最近一次判定
  const judgedNotes = useAtomValue(judgedNotesAtom); // 所有已判定音符记录

  // 初始化游戏逻辑 hook（注册键盘监听、游戏循环等）
  const { resetGameState } = useRhythmGameLogic();

  // 渲染用的当前时间（独立于游戏逻辑的时间，仅用于 UI 更新）
  const [renderTime, setRenderTime] = useState(0);
  const rafRef = useRef<number | null>(null);

  // 驱动渲染时间更新
  useEffect(() => {
    if (startTime === 0) {
      setRenderTime(0);
      return;
    }

    const tick = () => {
      setRenderTime(performance.now() - startTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime]);

  // 将重置函数暴露到 window，供 App.tsx 中的重置按钮调用
  useEffect(() => {
    (window as unknown as { __resetRhythmGame?: () => void }).__resetRhythmGame =
      resetGameState;
    return () => {
      delete (window as unknown as { __resetRhythmGame?: () => void })
        .__resetRhythmGame;
    };
  }, [resetGameState]);

  // 谱面数据缺失时显示错误提示
  if (!currentChart) {
    return (
      <div className="text-center p-8 text-white">
        <p>未选择谱面</p>
      </div>
    );
  }

  const { metadata, notes } = currentChart;

  // 构建已判定音符的 ID 集合和判定结果 Map，用于快速查找
  const judgedNoteIds = new Set(
    judgedNotes.map((j) => j.note.id || `${j.note.time}-${j.note.lane}`),
  );
  const judgmentMap = new Map(
    judgedNotes.map((j) => [
      j.note.id || `${j.note.time}-${j.note.lane}`,
      j.judgment,
    ]),
  );

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* ===== 顶部信息栏 ===== */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800/80 backdrop-blur z-30 shrink-0 pr-48">
        <div>
          <h2 className="text-xl font-bold">{metadata.title}</h2>
          <p className="text-xs text-slate-400">
            {metadata.author} · {metadata.difficulty} · {metadata.bpm} BPM
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-xs text-slate-400">SCORE</div>
            <div className="text-2xl font-bold font-mono">
              {stats.score.toLocaleString()}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">ACCURACY</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {(stats.accuracy * 100).toFixed(1)}%
            </div>
          </div>
          <GameTimer startTime={startTime} />
        </div>
      </header>

      {/* ===== 游戏主区域（轨道 + 音符 + 判定线） ===== */}
      <div className="flex-1 relative overflow-hidden">
        {/* 9 条竖直轨道 */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 9 }).map((_, laneIndex) => {
            const isPressed = playerState[laneIndex] === 1;
            return (
              <div
                key={laneIndex}
                className={`flex-1 border-x border-slate-700/50 relative transition-colors duration-75 ${
                  isPressed ? 'bg-white/5' : ''
                }`}
              >
                {/* 按键按下时的渐变光效 */}
                <div
                  className={`absolute inset-0 bg-gradient-to-b ${
                    isPressed
                      ? 'from-white/10 to-transparent'
                      : 'from-transparent to-transparent'
                  }`}
                />

                {/* 渲染该轨道上的所有音符 */}
                {notes
                  .filter((n) => n.lane === laneIndex)
                  .map((note) => {
                    const noteId =
                      note.id || `${note.time}-${note.lane}`;
                    const isJudged = judgedNoteIds.has(noteId);
                    const j = judgmentMap.get(noteId);
                    return (
                      <FallingNote
                        key={noteId}
                        note={note}
                        currentTime={renderTime}
                        isJudged={isJudged}
                        judgment={j}
                      />
                    );
                  })}
              </div>
            );
          })}
        </div>

        {/* 判定线（音符到达此处时需要按键） */}
        <div
          className="absolute left-0 right-0 h-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)] z-10"
          style={{ bottom: '120px' }}
        />

        {/* 判定文字弹出特效 */}
        <JudgmentPopup judgment={lastJudgment?.judgment || null} />

        {/* 连击数显示 */}
        <ComboDisplay combo={stats.combo} />

        {/* 左上角实时统计面板 */}
        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur rounded-lg p-3 text-sm space-y-1 z-20">
          <div className="flex gap-4">
            <span className="text-yellow-300 font-bold">Perfect: {stats.perfect}</span>
            <span className="text-emerald-400 font-bold">Good: {stats.good}</span>
            <span className="text-red-400 font-bold">Miss: {stats.miss}</span>
          </div>
          <div className="text-slate-300 text-xs">
            Max Combo: {stats.maxCombo}
          </div>
        </div>
      </div>

      {/* ===== 底部按键反馈区域 ===== */}
      <footer className="h-[120px] bg-slate-800/90 border-t border-slate-700 flex items-stretch shrink-0 z-20">
        {KEY_LABELS.map((label, index) => {
          const isPressed = playerState[index] === 1;
          return (
            <div
              key={label}
              className={`flex-1 flex flex-col items-center justify-center border-r border-slate-700 last:border-r-0 transition-all duration-75 relative ${
                isPressed
                  ? `bg-gradient-to-t ${LANE_COLORS[index]} brightness-125`
                  : 'bg-slate-700/30'
              }`}
            >
              <div
                className={`text-lg font-black ${
                  isPressed ? 'text-white scale-110' : 'text-slate-400'
                } transition-transform`}
              >
                {label}
              </div>
              {/* 按键按下时向上发射的光效 */}
              {isPressed && (
                <div className="absolute bottom-[120px] w-full h-8 bg-gradient-to-t from-white/30 to-transparent pointer-events-none" />
              )}
            </div>
          );
        })}
      </footer>
    </div>
  );
}
