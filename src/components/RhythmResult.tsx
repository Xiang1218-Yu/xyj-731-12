/**
 * RhythmResult —— 节奏游戏结算界面。
 *
 * 展示：评级（S/A/B/C/D，带颜色）、分数、准确率、最大连击、
 * Perfect/Good/Miss 数量、游玩耗时，并提供「再来一局 / 返回首页 / 查看排行榜」操作。
 */

import { useSetAtom } from 'jotai';
import type { RhythmResult } from '../atoms/rhythmAtoms';
import type { JudgeStats } from '../lib/judgment';
import { navigateAtom } from '../atoms/routeAtoms';
import { rhythmStatusAtom, resetSignalAtom } from '../atoms/rhythmAtoms';
import { selectedChartAtom } from '../atoms/chartAtoms';
import { RotateCcw, Home, Trophy } from 'lucide-react';

interface Props {
  result: RhythmResult;
  stats: JudgeStats;
}

/** 评级对应的颜色 */
const RANK_COLORS: Record<string, string> = {
  S: 'text-yellow-300',
  A: 'text-emerald-300',
  B: 'text-sky-300',
  C: 'text-amber-300',
  D: 'text-red-400',
};

function RhythmResultPanel({ result, stats }: Props) {
  const navigate = useSetAtom(navigateAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);
  const bumpReset = useSetAtom(resetSignalAtom);
  const setSelectedChart = useSetAtom(selectedChartAtom);
  const { chart, accuracy, rank, playTime } = result;

  /** 再来一局：通过自增 resetSignal 重建引擎，并重新进入 playing */
  const handleRetry = () => {
    setStatus('playing');
    bumpReset((n) => n + 1);
  };

  /** 返回节奏模式选歌页：清除选中谱面 */
  const handleHome = () => {
    setSelectedChart(null);
    setStatus('idle');
    navigate('/rhythm');
  };

  /** 查看排行榜：清除当前谱面并跳转 */
  const handleRanking = () => {
    setSelectedChart(null);
    setStatus('idle');
    navigate('/ranking');
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur p-6">
      <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-2xl p-8 text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white/70">{chart.metadata.title}</h2>
          <div
            className={`text-8xl font-black leading-none mt-2 ${RANK_COLORS[rank] ?? 'text-white'}`}
            style={{ animation: 'rankGlow 2s ease-in-out infinite' }}
          >
            {rank}
          </div>
          <div className="text-4xl font-black mt-4 tabular-nums">
            {stats.score.toLocaleString()}
          </div>
          <div className="text-white/60 text-sm">Score</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-6 text-center">
          <Stat label="Accuracy" value={`${(accuracy * 100).toFixed(2)}%`} />
          <Stat label="Max Combo" value={`${stats.maxCombo}`} />
          <Stat label="Perfect" value={`${stats.perfect}`} color="text-yellow-300" />
          <Stat label="Good" value={`${stats.good}`} color="text-green-300" />
          <Stat label="Miss" value={`${stats.miss}`} color="text-red-400" />
          <Stat label="Time" value={`${playTime.toFixed(1)}s`} />
        </div>

        <div className="flex flex-col gap-2 mt-8">
          <button
            onClick={handleRetry}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-xl"
          >
            <RotateCcw size={18} /> Retry
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleHome}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl"
            >
              <Home size={18} /> Home
            </button>
            <button
              onClick={handleRanking}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl"
            >
              <Trophy size={18} /> Ranking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-white',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white/5 rounded-lg py-2">
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-[11px] text-white/50 uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default RhythmResultPanel;
