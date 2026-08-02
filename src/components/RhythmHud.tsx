/**
 * RhythmHud —— 游戏中的实时信息面板。
 *
 * 展示：歌曲名 / 难度、分数、当前连击、实时准确率、最近判定（Perfect/Good/Miss 弹出）。
 */

import { useAtomValue } from 'jotai';
import {
  lastJudgeAtom,
  rhythmStatsAtom,
} from '../atoms/rhythmAtoms';
import { selectedChartAtom } from '../atoms/chartAtoms';
import { calcAccuracy } from '../lib/judgment';

function RhythmHud() {
  const stats = useAtomValue(rhythmStatsAtom);
  const lastJudge = useAtomValue(lastJudgeAtom);
  const selected = useAtomValue(selectedChartAtom);

  const totalNotes = selected?.chart.notes.length ?? 0;
  const accuracy = calcAccuracy(stats, totalNotes);

  // 判定弹出的颜色
  const judgeColor =
    lastJudge?.result === 'perfect'
      ? 'text-yellow-300'
      : lastJudge?.result === 'good'
        ? 'text-green-300'
        : 'text-red-400';

  return (
    <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start pointer-events-none z-10">
      {/* 左侧：歌曲信息 */}
      <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2">
        <div className="text-sm font-bold text-white">
          {selected?.chart.metadata.title ?? 'Unknown'}
        </div>
        <div className="text-xs text-white/60">
          {selected?.chart.metadata.difficulty} · ★{selected?.chart.metadata.level} ·{' '}
          {selected?.chart.metadata.bpm} BPM
          {selected && selected.chart.metadata.density > 0
            ? ` · ${selected.chart.metadata.density} n/s`
            : ''}
        </div>
      </div>

      {/* 中间：判定弹出 */}
      <div className="flex flex-col items-center">
        <div
          key={lastJudge?.key}
          className={`text-3xl font-black ${judgeColor} animate-[judgePop_0.4s_ease-out]`}
        >
          {lastJudge ? lastJudge.result.toUpperCase() : ''}
        </div>
        <div className="text-4xl font-black text-white drop-shadow">
          {stats.combo > 0 ? `${stats.combo} COMBO` : ''}
        </div>
      </div>

      {/* 右侧：分数与准确率 */}
      <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-right">
        <div className="text-2xl font-black text-white tabular-nums">
          {stats.score.toLocaleString()}
        </div>
        <div className="text-xs text-white/70">
          Acc { (accuracy * 100).toFixed(2) }%
        </div>
        <div className="text-[10px] text-white/50 mt-0.5">
          P {stats.perfect} / G {stats.good} / M {stats.miss}
        </div>
      </div>
    </div>
  );
}

export default RhythmHud;
