/**
 * HomePage —— 游戏首页（/）。
 *
 * 展示：
 *  - 内置关卡（从 /levels/index.json 读取，运行时转换为 Chart）；
 *  - 用户在编辑器中保存的自定义谱面；
 *  - 顶部导航到 /editor 和 /ranking。
 *
 * 点击「Play」会把所选谱面写入 selectedChartAtom，并把 rhythmStatusAtom 置为 idle，
 * 然后渲染 RhythmGamePage。
 */

import { Suspense, useEffect, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { customChartsAtom, selectedChartAtom } from '../atoms/chartAtoms';
import { navigateAtom } from '../atoms/routeAtoms';
import { rhythmStatusAtom } from '../atoms/rhythmAtoms';
import {
  fetchLevelAsChart,
  fetchLevelIndex,
  type LevelIndexInfo,
} from '../lib/levels';
import type { Chart } from '../types/chart';
import RhythmGamePage from '../components/RhythmGamePage';
import { Pencil, Trophy, Play, Music } from 'lucide-react';

/** 难度颜色 */
const DIFF_COLOR: Record<string, string> = {
  Easy: 'bg-green-500',
  Normal: 'bg-sky-500',
  Hard: 'bg-orange-500',
  Expert: 'bg-red-500',
  Master: 'bg-purple-500',
};

interface SongItem {
  chart: Chart;
  source: 'builtin' | 'custom';
  /** 内置关卡的 file（用于按需加载） */
  file?: string;
  id: string;
}

function HomePage() {
  const customCharts = useAtomValue(customChartsAtom);
  const selected = useAtomValue(selectedChartAtom);
  const setSelected = useSetAtom(selectedChartAtom);
  const navigate = useSetAtom(navigateAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);
  const [builtinIndex, setBuiltinIndex] = useState<LevelIndexInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 拉取内置关卡索引
  useEffect(() => {
    fetchLevelIndex()
      .then(setBuiltinIndex)
      .catch(() => setBuiltinIndex([]))
      .finally(() => setLoading(false));
  }, []);

  /** 开始游戏：内置关卡需先异步转换为 Chart */
  const handlePlay = async (item: SongItem) => {
    let chart = item.chart;
    if (item.source === 'builtin' && item.file) {
      chart = await fetchLevelAsChart(item.file);
    }
    setSelected({ chart, source: item.source });
    setStatus('idle');
  };

  // 选中谱面后即进入游戏流程（RhythmGamePage 内部根据 status 显示待机/游戏/结算）
  if (selected) {
    return <RhythmGamePage />;
  }

  // 组装展示列表
  const items: SongItem[] = [
    ...builtinIndex.map((info) => ({
      id: `builtin-${info.id}`,
      source: 'builtin' as const,
      file: info.file,
      chart: {
        version: 1,
        metadata: {
          title: info.name,
          author: 'Built-in',
          bpm: 120,
          offset: 0,
          difficulty: 'Normal' as const,
          level: 5,
          density: 0,
        },
        notes: [],
      },
    })),
    ...customCharts.map((chart, i) => ({
      id: `custom-${i}`,
      source: 'custom' as const,
      chart,
    })),
  ];

  return (
    <div className="min-h-svh w-full bg-gradient-to-b from-emerald-700 via-emerald-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto p-6">
        {/* 标题与导航 */}
        <header className="flex items-center justify-between mb-8 mt-2">
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-2">
            <Music size={32} /> Finger Dance
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold"
              title="Back to classic mode"
            >
              <Music size={16} /> Classic
            </button>
            <button
              onClick={() => navigate('/editor')}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold"
            >
              <Pencil size={16} /> Editor
            </button>
            <button
              onClick={() => navigate('/ranking')}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-bold"
            >
              <Trophy size={16} /> Ranking
            </button>
          </div>
        </header>

        <p className="text-white/60 mb-6 text-center">
          Select a chart to play. Use keys <b>A S D F [SPACE] J K L ;</b>
        </p>

        {loading ? (
          <div className="text-center text-white/60 py-12">Loading charts...</div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <SongRow key={item.id} item={item} onPlay={() => handlePlay(item)} />
            ))}
            {items.length === 0 && (
              <div className="text-center text-white/50 py-12">
                No charts yet. Open the Editor to create one!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SongRow({ item, onPlay }: { item: SongItem; onPlay: () => void }) {
  const { chart, source } = item;
  const diff = chart.metadata.difficulty;
  return (
    <div className="flex items-center gap-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl p-4 transition-colors">
      <div
        className={`${DIFF_COLOR[diff] ?? 'bg-slate-500'} rounded-lg px-3 py-1 text-xs font-black w-20 text-center`}
      >
        {diff} · ★{chart.metadata.level}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{chart.metadata.title}</div>
        <div className="text-xs text-white/50">
          by {chart.metadata.author} · {chart.metadata.bpm} BPM
          {chart.metadata.density > 0 ? ` · ${chart.metadata.density} n/s` : ''}
          {source === 'custom' && ' · Custom'}
          {source === 'builtin' && item.file ? ' · Built-in' : ''}
        </div>
      </div>
      <button
        onClick={onPlay}
        className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-5 py-2.5 rounded-lg"
      >
        <Play size={16} /> Play
      </button>
    </div>
  );
}

// 用 Suspense 包裹以兼容可能的异步 atom
export default function HomePageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-white text-center">Loading...</div>}>
      <HomePage />
    </Suspense>
  );
}
