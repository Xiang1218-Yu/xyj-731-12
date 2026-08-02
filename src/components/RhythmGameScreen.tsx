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

// 9 个轨道的按键标签
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

// 轨道对应的颜色
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

// 判定文字样式
const JUDGMENT_STYLES: Record<Judgment, { text: string; color: string }> = {
  perfect: { text: 'PERFECT', color: 'text-yellow-300' },
  good: { text: 'GOOD', color: 'text-emerald-400' },
  miss: { text: 'MISS', color: 'text-red-500' },
};

// 音符下落提前量（与 useRhythmGameLogic 中保持一致）
const NOTE_APPROACH_TIME = 2000;

/**
 * 单个下落音符组件
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
  const offset = 0;
  const noteTime = note.time + offset;
  const timeUntilNote = noteTime - currentTime;

  if (isJudged && timeUntilNote < -100) return null;
  if (timeUntilNote > NOTE_APPROACH_TIME) return null;

  const progress = 1 - timeUntilNote / NOTE_APPROACH_TIME;
  const topPercent = progress * 100;

  // 已判定音符的透明度和缩放：命中时淡出放大，Miss 时快速消失
  const opacity = isJudged ? (judgment === 'miss' ? 0.3 : 0) : 1;
  const scale = isJudged ? (judgment === 'miss' ? 1 : 1.5) : 1;
  // Miss 的音符变灰
  const noteClass = isJudged && judgment === 'miss'
    ? 'from-slate-500 to-slate-600'
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
      <div
        className={`mx-auto w-4/5 h-5 rounded-md bg-gradient-to-b ${noteClass} shadow-lg`}
      >
        <div className="w-full h-1/2 bg-white/30 rounded-t-md" />
      </div>
    </div>
  );
}

/**
 * 判定文字弹出组件（带动画）
 */
function JudgmentPopup({ judgment }: { judgment: Judgment | null }) {
  const [visible, setVisible] = useState(false);
  const [currentJudgment, setCurrentJudgment] = useState<Judgment | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (judgment) {
      setCurrentJudgment(judgment);
      setVisible(true);

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
 * 连击显示组件
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
 * 实时游戏计时器
 */
function GameTimer({ startTime }: { startTime: number }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
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
    <span className="text-lg font-mono">
      {(time / 1000).toFixed(2)}s
    </span>
  );
}

/**
 * 主游戏屏幕组件
 *
 * 展示下落式音符、判定线、实时分数/连击/准确率
 */
export default function RhythmGameScreen() {
  const currentChart = useAtomValue(currentChartAtom);
  const playerState = useAtomValue(playerStateAtom);
  const startTime = useAtomValue(startTimeAtom);
  const stats = useAtomValue(gameStatsAtom);
  const lastJudgment = useAtomValue(lastJudgmentAtom);
  const judgedNotes = useAtomValue(judgedNotesAtom);

  const { resetGameState } = useRhythmGameLogic();

  // 用于渲染的当前时间
  const [renderTime, setRenderTime] = useState(0);
  const rafRef = useRef<number | null>(null);

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

  // 重置游戏状态（暴露给外部按钮）
  useEffect(() => {
    (window as unknown as { __resetRhythmGame?: () => void }).__resetRhythmGame =
      resetGameState;
    return () => {
      delete (window as unknown as { __resetRhythmGame?: () => void })
        .__resetRhythmGame;
    };
  }, [resetGameState]);

  if (!currentChart) {
    return (
      <div className="text-center p-8 text-white">
        <p>未选择谱面</p>
      </div>
    );
  }

  const { metadata, notes } = currentChart;
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
      {/* 顶部信息栏 */}
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

      {/* 游戏区域 */}
      <div className="flex-1 relative overflow-hidden">
        {/* 9 条轨道 */}
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
                {/* 轨道渐变背景 */}
                <div
                  className={`absolute inset-0 bg-gradient-to-b ${
                    isPressed
                      ? 'from-white/10 to-transparent'
                      : 'from-transparent to-transparent'
                  }`}
                />

                {/* 该轨道上的音符 */}
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

        {/* 判定线 */}
        <div
          className="absolute left-0 right-0 h-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)] z-10"
          style={{ bottom: '120px' }}
        />

        {/* 判定特效 */}
        <JudgmentPopup judgment={lastJudgment?.judgment || null} />

        {/* 连击显示 */}
        <ComboDisplay combo={stats.combo} />

        {/* 统计数据悬浮（左上角） */}
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

      {/* 底部按键区域 */}
      <footer
        className="h-[120px] bg-slate-800/90 border-t border-slate-700 flex items-stretch shrink-0 z-20"
      >
        {KEY_LABELS.map((label, index) => {
          const isPressed = playerState[index] === 1;
          return (
            <div
              key={label}
              className={`flex-1 flex flex-col items-center justify-center border-r border-slate-700 last:border-r-0 transition-all duration-75 ${
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
              {/* 按键按下时的光效 */}
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
