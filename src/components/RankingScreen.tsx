import { useState, useMemo, useCallback } from 'react';
import { useAtom } from 'jotai';
import {
  ArrowLeft,
  Trash2,
  Trophy,
  Search,
  ArrowUpDown,
  Calendar,
} from 'lucide-react';
import {
  screenAtom,
  scoreRecordsAtom,
} from '../atoms/gameAtoms';
import {
  deleteScore,
  clearAllScores,
  getUniqueSongTitles,
  getUniqueDifficulties,
} from '../lib/storage';
import type { ScoreRecord } from '../types/chart';
import { getRank } from '../types/chart';

// 排序方式类型
type SortField = 'score' | 'accuracy' | 'playedAt' | 'maxCombo';
type SortDirection = 'asc' | 'desc';

// 日期筛选预设
type DatePreset = 'all' | 'today' | 'week' | 'month';

/**
 * 格式化日期为本地字符串
 */
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 检查日期是否在预设范围内
 */
function isDateInPreset(isoString: string, preset: DatePreset): boolean {
  if (preset === 'all') return true;
  const date = new Date(isoString).getTime();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'today': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date >= today.getTime();
    }
    case 'week':
      return now - date <= 7 * dayMs;
    case 'month':
      return now - date <= 30 * dayMs;
    default:
      return true;
  }
}

/**
 * 排行榜页面组件
 *
 * 功能：
 * - 展示所有历史成绩
 * - 按歌曲名、难度、日期范围筛选
 * - 按分数、准确率、日期、最大连击排序
 * - 删除单条成绩
 * - 清空所有成绩
 * - 展示每条成绩的等级（S/A/B/C/D）
 */
export default function RankingScreen() {
  const [, setScreen] = useAtom(screenAtom);
  const [records, setRecords] = useAtom(scoreRecordsAtom);

  // 筛选状态
  const [songFilter, setSongFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [searchText, setSearchText] = useState('');

  // 排序状态
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // 获取可选项
  const songTitles = useMemo(() => getUniqueSongTitles(records), [records]);
  const difficulties = useMemo(
    () => getUniqueDifficulties(records),
    [records],
  );

  /**
   * 切换排序
   */
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField],
  );

  /**
   * 筛选并排序后的记录
   */
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 歌曲筛选
    if (songFilter !== 'all') {
      result = result.filter((r) => r.songTitle === songFilter);
    }

    // 难度筛选
    if (difficultyFilter !== 'all') {
      result = result.filter((r) => r.difficulty === difficultyFilter);
    }

    // 日期筛选
    result = result.filter((r) => isDateInPreset(r.playedAt, datePreset));

    // 文本搜索（歌曲名）
    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter((r) =>
        r.songTitle.toLowerCase().includes(query),
      );
    }

    // 排序
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'score':
          cmp = a.score - b.score;
          break;
        case 'accuracy':
          cmp = a.accuracy - b.accuracy;
          break;
        case 'playedAt':
          cmp =
            new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime();
          break;
        case 'maxCombo':
          cmp = a.maxCombo - b.maxCombo;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [
    records,
    songFilter,
    difficultyFilter,
    datePreset,
    searchText,
    sortField,
    sortDir,
  ]);

  /**
   * 删除单条成绩
   */
  const handleDelete = useCallback(
    (id: string) => {
      if (confirm('确定要删除这条成绩记录吗？')) {
        const updated = deleteScore(id);
        setRecords(updated);
      }
    },
    [setRecords],
  );

  /**
   * 清空所有成绩
   */
  const handleClearAll = useCallback(() => {
    if (
      confirm(
        '确定要清空所有成绩记录吗？此操作不可撤销！',
      )
    ) {
      clearAllScores();
      setRecords([]);
    }
  }, [setRecords]);

  /**
   * 渲染排序图标
   */
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-30" />;
    }
    return (
      <ArrowUpDown
        size={14}
        className={`text-emerald-400 ${
          sortDir === 'asc' ? 'rotate-180' : ''
        }`}
      />
    );
  };

  return (
    <div className="w-full min-h-screen bg-slate-900 text-white flex flex-col">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreen('levelSelect')}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            返回
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" />
            排行榜
          </h1>
        </div>
        {records.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-500 transition-colors text-sm"
          >
            <Trash2 size={14} />
            清空全部
          </button>
        )}
      </header>

      {/* 筛选区 */}
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-700 shrink-0">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 搜索框 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">搜索歌曲</label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="输入歌曲名..."
                className="w-full pl-9 pr-3 py-2 bg-slate-700 rounded-lg text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* 歌曲筛选 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">歌曲</label>
            <select
              value={songFilter}
              onChange={(e) => setSongFilter(e.target.value)}
              className="px-3 py-2 bg-slate-700 rounded-lg text-sm border border-slate-600 focus:border-emerald-500 outline-none min-w-[140px]"
            >
              <option value="all">全部歌曲</option>
              {songTitles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* 难度筛选 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">难度</label>
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="px-3 py-2 bg-slate-700 rounded-lg text-sm border border-slate-600 focus:border-emerald-500 outline-none min-w-[120px]"
            >
              <option value="all">全部难度</option>
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* 日期范围 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
              <Calendar size={12} />
              日期
            </label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="px-3 py-2 bg-slate-700 rounded-lg text-sm border border-slate-600 focus:border-emerald-500 outline-none"
            >
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="week">最近 7 天</option>
              <option value="month">最近 30 天</option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-400">
          共 {filteredRecords.length} 条记录（总计 {records.length} 条）
        </div>
      </div>

      {/* 成绩列表 */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Trophy size={48} className="mb-4 opacity-30" />
            <p className="text-lg">
              {records.length === 0
                ? '还没有游戏记录，快去玩一局吧！'
                : '没有符合筛选条件的记录'}
            </p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700 mb-2">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-2">等级</div>
              <div
                className="col-span-3 flex items-center gap-1 cursor-pointer hover:text-white"
                onClick={() => toggleSort('score')}
              >
                歌曲
                <SortIcon field="score" />
              </div>
              <div
                className="col-span-1 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1"
                onClick={() => toggleSort('accuracy')}
              >
                准确率
                <SortIcon field="accuracy" />
              </div>
              <div
                className="col-span-1 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1"
                onClick={() => toggleSort('score')}
              >
                分数
                <SortIcon field="score" />
              </div>
              <div
                className="col-span-1 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1"
                onClick={() => toggleSort('maxCombo')}
              >
                连击
                <SortIcon field="maxCombo" />
              </div>
              <div
                className="col-span-2 text-right cursor-pointer hover:text-white flex items-center justify-end gap-1"
                onClick={() => toggleSort('playedAt')}
              >
                日期
                <SortIcon field="playedAt" />
              </div>
              <div className="col-span-1" />
            </div>

            {/* 记录行 */}
            {filteredRecords.map((record, index) => (
              <RankingRow
                key={record.id}
                record={record}
                rank={index + 1}
                onDelete={() => handleDelete(record.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 单行成绩记录组件
 */
function RankingRow({
  record,
  rank,
  onDelete,
}: {
  record: ScoreRecord;
  rank: number;
  onDelete: () => void;
}) {
  const { rank: grade, color } = getRank(record.accuracy);

  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg mb-2 items-center transition-colors group">
      {/* 排名 */}
      <div className="col-span-1 text-center">
        <span
          className={`text-sm font-bold ${
            rank === 1
              ? 'text-yellow-400'
              : rank === 2
                ? 'text-slate-300'
                : rank === 3
                  ? 'text-amber-600'
                  : 'text-slate-500'
          }`}
        >
          {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
        </span>
      </div>

      {/* 等级 */}
      <div className="col-span-2">
        <span className={`text-3xl font-black ${color}`}>{grade}</span>
      </div>

      {/* 歌曲信息 */}
      <div className="col-span-3">
        <div className="font-bold text-sm truncate">{record.songTitle}</div>
        <div className="text-xs text-slate-400">
          {record.difficulty} · {record.perfect}/{record.good}/{record.miss}
        </div>
      </div>

      {/* 准确率 */}
      <div className="col-span-1 text-right font-mono text-sm text-emerald-400">
        {(record.accuracy * 100).toFixed(1)}%
      </div>

      {/* 分数 */}
      <div className="col-span-1 text-right font-mono text-sm font-bold">
        {record.score.toLocaleString()}
      </div>

      {/* 最大连击 */}
      <div className="col-span-1 text-right font-mono text-sm text-cyan-400">
        {record.maxCombo}x
      </div>

      {/* 日期 */}
      <div className="col-span-2 text-right text-xs text-slate-400">
        {formatDate(record.playedAt)}
      </div>

      {/* 删除按钮 */}
      <div className="col-span-1 flex justify-end">
        <button
          onClick={onDelete}
          className="p-1.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
