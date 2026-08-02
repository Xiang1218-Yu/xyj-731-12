/**
 * RhythmGamePage —— 节奏游戏主页面。
 *
 * 流程：待机（显示开始按钮） -> 进行中（场地 + HUD） -> 结算（ResultPanel）。
 * 由 useRhythmGame 驱动引擎，判定/分数/连击通过 Jotai 实时反映到 UI。
 */

import { useAtomValue, useSetAtom } from 'jotai';
import {
  rhythmResultAtom,
  rhythmStatsAtom,
  rhythmStatusAtom,
} from '../atoms/rhythmAtoms';
import { selectedChartAtom } from '../atoms/chartAtoms';
import { navigateAtom } from '../atoms/routeAtoms';
import { useRhythmGame } from '../hooks/useRhythmGame';
import { initRhythmAudio } from '../lib/rhythmAudio';
import RhythmPlayfield from './RhythmPlayfield';
import RhythmHud from './RhythmHud';
import RhythmResultPanel from './RhythmResult';
import { ArrowLeft, Play, Pencil, Trophy } from 'lucide-react';

function RhythmGamePage() {
  const selected = useAtomValue(selectedChartAtom);
  const setSelected = useSetAtom(selectedChartAtom);
  const status = useAtomValue(rhythmStatusAtom);
  const result = useAtomValue(rhythmResultAtom);
  const stats = useAtomValue(rhythmStatsAtom);
  const navigate = useSetAtom(navigateAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);

  const { subscribeFrame } = useRhythmGame();

  const handleStart = async () => {
    await initRhythmAudio();
    setStatus('playing');
  };

  /** 返回节奏模式选歌页：清除当前选中谱面 */
  const handleBackHome = () => {
    setSelected(null);
    setStatus('idle');
    navigate('/rhythm');
  };

  // 未选择谱面时的提示
  if (!selected) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center text-white gap-4 bg-gradient-to-b from-emerald-700 to-emerald-900 p-6">
        <h1 className="text-3xl font-black">No chart selected</h1>
        <p className="text-white/70">Please select a song from the home page.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-white text-emerald-700 font-bold px-6 py-3 rounded-xl"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-svh w-svw bg-gradient-to-b from-emerald-800 to-slate-900 overflow-hidden flex flex-col">
      {/* 顶部导航 */}
      <div className="absolute top-3 left-3 z-30 flex gap-2">
        <button
          onClick={handleBackHome}
          className="flex items-center gap-1 bg-black/40 hover:bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg backdrop-blur"
        >
          <ArrowLeft size={16} /> Home
        </button>
      </div>
      <div className="absolute top-3 right-3 z-30 flex gap-2">
        <button
          onClick={() => navigate('/editor')}
          className="flex items-center gap-1 bg-black/40 hover:bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg backdrop-blur"
        >
          <Pencil size={16} /> Editor
        </button>
        <button
          onClick={() => navigate('/ranking')}
          className="flex items-center gap-1 bg-black/40 hover:bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg backdrop-blur"
        >
          <Trophy size={16} /> Ranking
        </button>
      </div>

      {/* 游戏场地 */}
      <div className="flex-1 p-4 pt-14 pb-4 flex justify-center">
        <div className="w-full max-w-3xl h-full relative">
          <RhythmPlayfield subscribeFrame={subscribeFrame} />
          {(status === 'playing' || status === 'paused') && <RhythmHud />}
        </div>
      </div>

      {/* 待机遮罩 */}
      {status === 'idle' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-6">
          <div className="text-center">
            <h1 className="text-4xl font-black text-white">
              {selected.chart.metadata.title}
            </h1>
            <p className="text-white/60 mt-1">
              {selected.chart.metadata.author} · {selected.chart.metadata.difficulty} · ★
              {selected.chart.metadata.level}
            </p>
            <p className="text-white/40 text-sm mt-1">
              {selected.chart.notes.length} notes · {selected.chart.metadata.bpm} BPM
            </p>
          </div>
          <button
            onClick={handleStart}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xl font-bold px-8 py-4 rounded-2xl shadow-lg transition-transform hover:scale-105"
          >
            <Play size={24} /> Start
          </button>
          <div className="text-white/50 text-sm">
            Keys: A S D F [SPACE] J K L ;
          </div>
        </div>
      )}

      {/* 结算界面 */}
      {status === 'finished' && result && (
        <RhythmResultPanel result={result} stats={stats} />
      )}
    </div>
  );
}

export default RhythmGamePage;
