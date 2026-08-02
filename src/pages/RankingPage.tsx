/**
 * RankingPage —— 排行榜页面（/ranking）。
 *
 * 功能：
 *  - 按「歌曲 + 难度」分类展示，每个分组显示该分类的最佳成绩（最高分）；
 *  - 可展开分组查看该分类下的所有历史成绩；
 *  - 筛选：歌曲下拉精确选择（同时保留文本搜索）、难度下拉、日期范围；
 *  - 排序：按分数 / 准确率 / 日期；
 *  - 删除单条成绩、清空全部成绩。
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
import { ArrowLeft, Trash2, Trophy, ChevronDown, X } from 'lucide-react';

type SortKey = 'score' | 'accuracy' | 'date';

const RANK_COLORS: Record<string, string> = {
  S: 'text-yellow-300',
  A: 'text-emerald-300',
  B: 'text-sky-300',
  C: 'text-amber-300',
  D: 'text-red-400',
};

/** 一个「歌曲+难度」分组及其最佳成绩与全部成绩 */
interface ScoreGroup {
  key: string;
  title: string;
  difficulty: string;
  best: ScoreRecord;
  records: ScoreRecord[];
}

/** 把记录按 歌曲|难度 分组，并选出每组最高分作为 best */
function groupRecords(records: ScoreRecord[]): ScoreGroup[] {
  const map = new Map<string, ScoreGroup>();
  for (const r of records) {
    const key = `${r.title}__${r.difficulty}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        title: r.title,
        difficulty: r.difficulty,
        best: r,
        records: [r],
      });
    } else {
      existing.records.push(r);
      // 最高分作为最佳；同分则取准确率更高者
      if (
        r.score > existing.best.score ||
        (r.score === existing.best.score && r.accuracy > existing.best.accuracy)
      ) {
        existing.best = r;
      }
    }
  }
  return Array.from(map.values());
}

function RankingPage() {
  const navigate = useSetAtom(navigateAtom);
  const [records, setRecords] = useState<ScoreRecord[]>([]);

  // 筛选条件
  const [titleFilter, setTitleFilter] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('all'); // 下拉精确筛选
  const [diffFilter, setDiffFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 读取成绩
  const refresh = () => setRecords(loadScores());
  useEffect(() => {
    refresh();
  }, []);

  // 提取所有歌曲与难度选项（基于全部记录，而非过滤后）
  const allTitles = useMemo(
    () => Array.from(new Set(records.map((r) => r.title))).sort(),
    [records],
  );
  const difficulties = useMemo(
    () => Array.from(new Set(records.map((r) => r.difficulty))).sort(),
    [records],
  );

  // 排序单组内记录
  const sortRecords = (list: ScoreRecord[]) => {
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === 'score') return b.score - a.score;
      if (sortKey === 'accuracy') return b.accuracy - a.accuracy;
      return b.createdAt - a.createdAt;
    });
    return sorted;
  };

  // 过滤 + 分组
  const groups = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    const keyword = titleFilter.trim().toLowerCase();

    const filtered = records.filter((r) => {
      // 下拉精确筛选优先
      if (selectedTitle !== 'all' && r.title !== selectedTitle) return false;
      // 文本搜索（与下拉可叠加）
      if (keyword && !r.title.toLowerCase().includes(keyword)) return false;
      if (diffFilter !== 'all' && r.difficulty !== diffFilter) return false;
      if (r.createdAt < from || r.createdAt > to) return false;
      return true;
    });

    const grouped = groupRecords(filtered);
    // 分组按最佳成绩排序
    grouped.sort((a, b) => {
      if (sortKey === 'score') return b.best.score - a.best.score;
      if (sortKey === 'accuracy') return b.best.accuracy - a.best.accuracy;
      return b.best.createdAt - a.best.createdAt;
    });
    return grouped;
  }, [records, titleFilter, selectedTitle, diffFilter, dateFrom, dateTo, sortKey]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
    setSelectedTitle('all');
    setDiffFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const totalShown = groups.reduce((sum, g) => sum + g.records.length, 0);

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
            <span className="text-white/50 text-xs">Song (dropdown)</span>
            <select
              value={selectedTitle}
              onChange={(e) => setSelectedTitle(e.target.value)}
              className="bg-white/10 rounded px-2 py-1.5 outline-none min-w-40"
            >
              <option value="all" className="bg-slate-800">All songs</option>
              {allTitles.map((t) => (
                <option key={t} value={t} className="bg-slate-800">
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">Search</span>
            <input
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
              placeholder="Title keyword..."
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
            {groups.length} groups · {totalShown} records
          </div>
        </div>

        {/* 分组列表 */}
        {groups.length === 0 ? (
          <div className="text-center text-white/40 py-20">
            No scores yet. Play a chart to see your records here!
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => {
              const isOpen = expanded.has(group.key);
              const sorted = sortRecords(group.records);
              return (
                <div
                  key={group.key}
                  className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
                >
                  {/* 分组头：最佳成绩 */}
                  <button
                    onClick={() => toggleExpand(group.key)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-white/5 text-left"
                  >
                    <ChevronDown
                      size={18}
                      className={`text-white/50 transition-transform ${
                        isOpen ? '' : '-rotate-90'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{group.title}</div>
                      <div className="text-xs text-white/50">
                        {group.difficulty} · {group.records.length} play
                        {group.records.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-2xl font-black ${RANK_COLORS[group.best.rank] ?? 'text-white'}`}
                      >
                        {group.best.rank}
                      </div>
                      <div className="text-[10px] text-white/40 uppercase">Best</div>
                    </div>
                    <div className="text-right w-28">
                      <div className="text-xl font-black tabular-nums">
                        {group.best.score.toLocaleString()}
                      </div>
                      <div className="text-xs text-white/50 tabular-nums">
                        {(group.best.accuracy * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-right w-20 hidden sm:block">
                      <div className="text-sm font-bold">{group.best.maxCombo}x</div>
                      <div className="text-[10px] text-white/40 uppercase">Max Combo</div>
                    </div>
                  </button>

                  {/* 展开后的历史记录 */}
                  {isOpen && (
                    <div className="border-t border-white/10 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-white/40 uppercase">
                          <tr>
                            <th className="text-left p-2 pl-12">Rank</th>
                            <th className="text-right p-2">Score</th>
                            <th className="text-right p-2">Accuracy</th>
                            <th className="text-right p-2">Combo</th>
                            <th className="text-center p-2">P/G/M</th>
                            <th className="text-left p-2">Date</th>
                            <th className="p-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((r) => (
                            <tr
                              key={r.id}
                              className={`border-t border-white/5 ${
                                r.id === group.best.id ? 'bg-yellow-400/5' : ''
                              }`}
                            >
                              <td className="p-2 pl-12">
                                <span
                                  className={`text-lg font-black ${RANK_COLORS[r.rank] ?? 'text-white'}`}
                                >
                                  {r.rank}
                                </span>
                                {r.id === group.best.id && (
                                  <span className="ml-2 text-[10px] text-yellow-300 font-bold">
                                    BEST
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-right tabular-nums font-bold">
                                {r.score.toLocaleString()}
                              </td>
                              <td className="p-2 text-right tabular-nums text-white/70">
                                {(r.accuracy * 100).toFixed(2)}%
                              </td>
                              <td className="p-2 text-right tabular-nums text-white/70">
                                {r.maxCombo}
                              </td>
                              <td className="p-2 text-center tabular-nums text-white/50">
                                {r.perfect}/{r.good}/{r.miss}
                              </td>
                              <td className="p-2 text-white/50 whitespace-nowrap">
                                {new Date(r.createdAt).toLocaleString()}
                              </td>
                              <td className="p-2 text-right">
                                <button
                                  onClick={() => handleDelete(r.id)}
                                  className="text-red-400 hover:text-red-300 p-1"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RankingPage;
