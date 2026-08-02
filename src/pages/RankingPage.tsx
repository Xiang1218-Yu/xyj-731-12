/**
 * RankingPage —— 排行榜页面（/ranking）。
 *
 * 功能：
 *  - 展示 localStorage 中的全部成绩；
 *  - 按歌曲、难度、日期范围筛选；
 *  - 按分数、准确率、日期排序；
 *  - 删除单条成绩、清空全部成绩；
 *  - 按歌曲+难度分组，自动高亮每个分组的最佳成绩。
 */

import { useEffect, useMemo, useState } from 'react';
import { useSetAtom } from 'jotai';
import { navigateAtom } from '../atoms/routeAtoms';
import {
  clearAllScores,
  deleteScore,
  loadScores,
  type ScoreRecord,
} from '../lib/scores';
import { ArrowLeft, Trash2, Trophy, X } from 'lucide-react';

type SortKey = 'score' | 'accuracy' | 'date';

const RANK_COLORS: Record<string, string> = {
  S: 'text-yellow-300',
  A: 'text-emerald-300',
  B: 'text-sky-300',
  C: 'text-amber-300',
  D: 'text-red-400',
};

function RankingPage() {
  const navigate = useSetAtom(navigateAtom);
  const [records, setRecords] = useState<ScoreRecord[]>([]);

  // 筛选条件
  const [titleFilter, setTitleFilter] = useState('');
  const [diffFilter, setDiffFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');

  // 读取成绩
  const refresh = () => setRecords(loadScores());
  useEffect(() => {
    refresh();
  }, []);

  // 提取所有难度选项
  const difficulties = useMemo(() => {
    const set = new Set(records.map((r) => r.difficulty));
    return Array.from(set);
  }, [records]);

  // 过滤 + 排序
  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    const list = records.filter((r) => {
      if (titleFilter && !r.title.toLowerCase().includes(titleFilter.toLowerCase()))
        return false;
      if (diffFilter !== 'all' && r.difficulty !== diffFilter) return false;
      if (r.createdAt < from || r.createdAt > to) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === 'score') return b.score - a.score;
      if (sortKey === 'accuracy') return b.accuracy - a.accuracy;
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [records, titleFilter, diffFilter, dateFrom, dateTo, sortKey]);

  const handleDelete = (id: string) => {
    deleteScore(id);
    refresh();
  };

  const handleClear = () => {
    if (confirm('Delete ALL scores? This cannot be undone.')) {
      clearAllScores();
      refresh();
    }
  };

  const handleResetFilters = () => {
    setTitleFilter('');
    setDiffFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="min-h-svh w-full bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <div className="max-w-5xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm"
          >
            <ArrowLeft size={16} /> Home
          </button>
          <h1 className="text-3xl font-black flex items-center gap-2">
            <Trophy size={28} /> Ranking
          </h1>
          <button
            onClick={handleClear}
            disabled={records.length === 0}
            className="flex items-center gap-1 bg-red-600/80 hover:bg-red-500 disabled:opacity-30 px-3 py-2 rounded-lg text-sm"
          >
            <Trash2 size={16} /> Clear All
          </button>
        </header>

        {/* 筛选/排序工具栏 */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">Song</span>
            <input
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
              placeholder="Search title..."
              className="bg-white/10 rounded px-2 py-1.5 outline-none w-44"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">Difficulty</span>
            <select
              value={diffFilter}
              onChange={(e) => setDiffFilter(e.target.value)}
              className="bg-white/10 rounded px-2 py-1.5 outline-none"
            >
              <option value="all" className="bg-slate-800">All</option>
              {difficulties.map((d) => (
                <option key={d} value={d} className="bg-slate-800">
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white/10 rounded px-2 py-1.5 outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white/10 rounded px-2 py-1.5 outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">Sort by</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-white/10 rounded px-2 py-1.5 outline-none"
            >
              <option value="score" className="bg-slate-800">Score</option>
              <option value="accuracy" className="bg-slate-800">Accuracy</option>
              <option value="date" className="bg-slate-800">Date</option>
            </select>
          </label>
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded"
          >
            <X size={14} /> Reset
          </button>
          <div className="flex-1 text-right text-white/40 text-xs self-center">
            {filtered.length} / {records.length} records
          </div>
        </div>

        {/* 成绩表格 */}
        {filtered.length === 0 ? (
          <div className="text-center text-white/40 py-20">
            No scores yet. Play a chart to see your records here!
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/10 text-white/70 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Rank</th>
                  <th className="text-left p-3">Song</th>
                  <th className="text-left p-3">Difficulty</th>
                  <th className="text-right p-3">Score</th>
                  <th className="text-right p-3">Accuracy</th>
                  <th className="text-right p-3">Max Combo</th>
                  <th className="text-center p-3">P / G / M</th>
                  <th className="text-left p-3">Date</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-white/5 hover:bg-white/5"
                  >
                    <td className="p-3">
                      <span
                        className={`text-2xl font-black ${RANK_COLORS[r.rank] ?? 'text-white'}`}
                      >
                        {r.rank}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold">{r.title}</div>
                      <div className="text-xs text-white/40">by {r.author}</div>
                    </td>
                    <td className="p-3">
                      {r.difficulty}
                      <span className="text-white/40"> · ★{r.level}</span>
                    </td>
                    <td className="p-3 text-right font-black tabular-nums">
                      {r.score.toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {(r.accuracy * 100).toFixed(2)}%
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.maxCombo}</td>
                    <td className="p-3 text-center text-xs tabular-nums text-white/60">
                      {r.perfect}/{r.good}/{r.miss}
                    </td>
                    <td className="p-3 text-white/50 text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default RankingPage;
