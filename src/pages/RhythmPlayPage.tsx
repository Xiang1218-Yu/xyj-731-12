import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { playChartAtom, liveStatsAtom } from '../atoms/rhythmAtoms';
import { useRhythmEngine, type FinishResult } from '../hooks/useRhythmEngine';
import { TRACK_COUNT, type Judgement } from '../types/chart';
import { JUDGEMENT_STYLE, calcAccuracy } from '../lib/judgement';
import { addScore, makeScoreId } from '../lib/scoreStorage';
import { audioManager } from '../lib/audio';

/** 音符从顶部落到判定线所需的时间（毫秒）。越小音符下落越快、难度越高。 */
const LOOKAHEAD_MS = 1800;

/** 每条轨道的键位标签（与手指舞模式一致）。 */
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/**
 * 节奏模式游玩页面（/play）。
 *
 * 展示 9 条轨道，音符从顶部下落至底部判定线；玩家在音符到线时按下对应键，
 * 引擎据时间偏差给出 Perfect/Good/Miss 判定。页面顶部实时显示分数、连击、
 * 准确率等判定数据；结束后展示结算界面（含 S/A/B/C/D 总评），并写入成绩。
 */
export default function RhythmPlayPage() {
  const navigate = useNavigate();
  const chart = useAtomValue(playChartAtom);
  const [result, setResult] = useState<FinishResult | null>(null);

  // 结束回调：保存成绩到 localStorage，并切换到结算界面。
  const handleFinish = useCallback(
    (r: FinishResult) => {
      setResult(r);
      if (chart) {
        addScore({
          id: makeScoreId(),
          song: chart.metadata.title,
          difficulty: chart.metadata.difficulty,
          score: r.score,
          accuracy: r.accuracy,
          maxCombo: r.maxCombo,
          perfect: r.perfect,
          good: r.good,
          miss: r.miss,
          grade: r.grade,
          playTime: Math.round(r.playTime),
          date: Date.now(),
        });
      }
    },
    [chart]
  );

  const engine = useRhythmEngine(chart, handleFinish);
  const stats = useAtomValue(liveStatsAtom);

  // 进入页面时确保音频已初始化。
  useEffect(() => {
    if (!audioManager.isInitialized()) {
      audioManager.start();
    }
  }, []);

  // 无谱面时的兜底提示。
  if (!chart) {
    return (
      <div className="min-h-svh bg-slate-900 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl">没有可游玩的谱面。</p>
        <button
          onClick={() => navigate('/')}
          className="bg-emerald-500 px-5 py-2 rounded-lg font-bold hover:bg-emerald-600"
        >
          返回主页
        </button>
      </div>
    );
  }

  // 实时准确率（结算前用运行中的统计计算）。
  const liveAccuracy = calcAccuracy(stats.perfect, stats.good, stats.miss);

  return (
    <div className="min-h-svh bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* 顶部实时判定数据栏 */}
      <header className="flex items-center justify-between px-6 py-3 bg-black/30 z-10">
        <div className="flex flex-col">
          <span className="text-lg font-bold">{chart.metadata.title}</span>
          <span className="text-xs text-white/60">
            {chart.metadata.author} · {chart.metadata.difficulty} · {chart.metadata.bpm} BPM
          </span>
        </div>
        <div className="flex items-center gap-8">
          <Stat label="SCORE" value={stats.score.toLocaleString()} />
          <Stat label="COMBO" value={stats.combo.toString()} />
          <Stat label="ACC" value={`${liveAccuracy.toFixed(2)}%`} />
        </div>
        <button
          onClick={() => navigate('/')}
          className="p-2 text-white/60 hover:text-white"
          title="返回主页"
        >
          <Home size={20} />
        </button>
      </header>

      {/* 游玩区域 */}
      <main className="relative flex-1">
        {engine.phase === 'ready' && (
          <Overlay>
            <h2 className="text-3xl font-black mb-6">{chart.metadata.title}</h2>
            <p className="text-white/70 mb-8 text-center max-w-md">
              使用 A S D F 空格 J K L ; 击打下落到底部判定线的音符。
              <br />
              越贴近判定线命中，判定越高（Perfect / Good / Miss）。
            </p>
            <button
              onClick={engine.start}
              className="bg-emerald-500 px-8 py-3 rounded-xl text-xl font-bold hover:bg-emerald-600"
            >
              开始
            </button>
          </Overlay>
        )}

        {engine.phase === 'playing' && <PlayField engine={engine} lastJudgement={stats.lastJudgement} lastAt={stats.lastJudgementAt} combo={stats.combo} />}

        {engine.phase === 'finished' && result && (
          <ResultOverlay result={result} onRetry={engine.start} onExit={() => navigate('/')} onRanking={() => navigate('/ranking')} />
        )}
      </main>
    </div>
  );
}

/** 顶部小统计块。 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center min-w-16">
      <span className="text-[10px] tracking-widest text-white/50">{label}</span>
      <span className="text-2xl font-black tabular-nums">{value}</span>
    </div>
  );
}

/** 居中覆盖层容器。 */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-20">
      {children}
    </div>
  );
}

/**
 * 下落音符游玩场地。
 * 音符按 progress（0=顶部, 1=判定线）从上往下移动，判定线固定在底部。
 */
function PlayField({
  engine,
  lastJudgement,
  lastAt,
  combo,
}: {
  engine: ReturnType<typeof useRhythmEngine>;
  lastJudgement: Judgement | null;
  lastAt: number;
  combo: number;
}) {
  const visible = engine.getVisibleNotes(LOOKAHEAD_MS);
  // 最近判定是否处于"新鲜"状态（0.6 秒内），用于淡出动画。
  const fresh = performance.now() - lastAt < 600;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* 判定反馈（居中大字） */}
      {lastJudgement && fresh && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none">
          <span className={`text-5xl font-black ${JUDGEMENT_STYLE[lastJudgement].className}`}>
            {JUDGEMENT_STYLE[lastJudgement].label}
          </span>
          {combo > 1 && <span className="text-2xl font-bold text-white/80 mt-2">{combo} COMBO</span>}
        </div>
      )}

      {/* 轨道容器 */}
      <div className="flex-1 flex justify-center px-2">
        <div className="relative flex gap-1.5 h-full w-full" style={{ maxWidth: 'min(1400px, 98vw)' }}>
          {Array.from({ length: TRACK_COUNT }).map((_, track) => (
            <div
              key={track}
              className={`relative flex-1 rounded-sm border-x border-white/5 ${
                track === 4 ? 'bg-white/[0.05]' : 'bg-white/[0.02]'
              }`}
            >
              {/* 该轨道内的下落音符 */}
              {visible
                .filter((v) => v.track === track)
                .map((v, i) => (
                  <div
                    key={`${track}-${v.note.time}-${i}`}
                    className="absolute left-1/2 -translate-x-1/2 rounded-md bg-emerald-400 shadow-lg shadow-emerald-400/40"
                    style={{
                      // 用 progress 定位：0% 在顶部，95% 在判定线附近。
                      top: `${v.progress * 92}%`,
                      width: '86%',
                      height: '22px',
                    }}
                  />
                ))}
            </div>
          ))}

          {/* 判定线 */}
          <div className="absolute left-0 right-0 h-1 bg-white/80" style={{ top: '92%' }} />
        </div>
      </div>

      {/* 底部键位标签 */}
      <div className="flex justify-center px-2 pb-4">
        <div className="flex gap-1.5 w-full" style={{ maxWidth: 'min(1400px, 98vw)' }}>
          {KEY_LABELS.map((label, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-sm font-black text-white/40 py-2 ${
                i === 4 ? 'text-xs' : ''
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 结算界面：展示总评与详细统计。 */
function ResultOverlay({
  result,
  onRetry,
  onExit,
  onRanking,
}: {
  result: FinishResult;
  onRetry: () => void;
  onExit: () => void;
  onRanking: () => void;
}) {
  const gradeColor: Record<string, string> = {
    S: 'text-yellow-300',
    A: 'text-emerald-300',
    B: 'text-sky-300',
    C: 'text-amber-400',
    D: 'text-rose-400',
  };
  return (
    <Overlay>
      <div className="bg-slate-800 rounded-2xl p-8 w-[90%] max-w-md text-center border border-white/10">
        <h2 className="text-2xl font-bold mb-2">结算</h2>
        <div className={`text-8xl font-black leading-none my-4 ${gradeColor[result.grade]}`}>
          {result.grade}
        </div>
        <div className="text-4xl font-black tabular-nums mb-6">
          {result.score.toLocaleString()}
        </div>
        <div className="grid grid-cols-2 gap-3 text-left text-sm mb-6">
          <Row label="准确率" value={`${result.accuracy.toFixed(2)}%`} />
          <Row label="最大连击" value={result.maxCombo.toString()} />
          <Row label="Perfect" value={result.perfect.toString()} valueClass="text-yellow-300" />
          <Row label="Good" value={result.good.toString()} valueClass="text-sky-300" />
          <Row label="Miss" value={result.miss.toString()} valueClass="text-rose-400" />
          <Row label="用时" value={`${(result.playTime / 1000).toFixed(1)}s`} />
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={onRetry} className="bg-emerald-500 px-5 py-2 rounded-lg font-bold hover:bg-emerald-600">
            重玩
          </button>
          <button onClick={onRanking} className="bg-white/10 px-5 py-2 rounded-lg font-bold hover:bg-white/20">
            排行榜
          </button>
          <button onClick={onExit} className="bg-white/10 px-5 py-2 rounded-lg font-bold hover:bg-white/20">
            返回
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/** 结算详情行。 */
function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between bg-black/20 rounded px-3 py-2">
      <span className="text-white/60">{label}</span>
      <span className={`font-bold tabular-nums ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}
