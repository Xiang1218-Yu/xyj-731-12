// ============================================================
// 排行榜页面组件 (RankingScreen)
// ============================================================
// 功能清单：
// 1. 按"歌曲 + 难度"分组展示，每组默认显示最佳成绩
// 2. 点击分组可展开查看该歌曲+难度的所有历史记录
// 3. 支持按歌曲名、难度、日期范围筛选
// 4. 支持按分数、准确率、日期、最大连击排序
// 5. 支持文本搜索歌曲名
// 6. 支持删除单条记录和清空全部记录
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useAtom } from 'jotai';
import {
  ArrowLeft,
  Trash2,
  Trophy,
  Search,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crown,
  Medal,
} from 'lucide-react';
import { screenAtom, scoreRecordsAtom } from '../atoms/gameAtoms';
import {
  deleteScore,
  clearAllScores,
  getUniqueSongTitles,
  getUniqueDifficulties,
} from '../lib/storage';
import type { ScoreRecord } from '../types/chart';
import { getRank } from '../types/chart';

// ============================================================
// 类型定义
// ============================================================

/** 排序字段 */
type SortField = 'score' | 'accuracy' | 'playedAt' | 'maxCombo';
/** 排序方向 */
type SortDirection = 'asc' | 'desc';
/** 日期筛选预设 */
type DatePreset = 'all' | 'today' | 'week' | 'month';
/** 视图模式：分组视图或平铺视图 */
type ViewMode = 'grouped' | 'flat';

/**
 * 分组数据结构：同一首歌 + 同一难度的所有记录
 */
interface ChartGroup {
  /** 分组唯一键：歌曲名@@@难度 */
  key: string;
  songTitle: string;
  difficulty: string;
  /** 该分组内的所有记录（已排序） */
  records: ScoreRecord[];
  /** 该分组的最佳成绩记录 */
  best: ScoreRecord;
  /** 该分组总游玩次数 */
  playCount: number;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 将 ISO 日期字符串格式化为本地可读格式
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
 * 检查日期是否在指定的预设范围内
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
 * 排行榜页面主组件
 */
export default function RankingScreen() {
  const [, setScreen] = useAtom(screenAtom);
  const [records, setRecords] = useAtom(scoreRecordsAtom);

  // --- 筛选状态 ---
  const [songFilter, setSongFilter] = useState<string>('all'); // 歌曲筛选
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all'); // 难度筛选
  const [datePreset, setDatePreset] = useState<DatePreset>('all'); // 日期范围
  const [searchText, setSearchText] = useState(''); // 文本搜索

  // --- 排序状态 ---
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // --- 视图状态 ---
  const [viewMode, setViewMode] = useState<ViewMode>('grouped'); // 分组/平铺
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // 展开的分组

  // 从记录中提取可选的筛选项
  const songTitles = useMemo(() => getUniqueSongTitles(records), [records]);
  const difficulties = useMemo(
    () => getUniqueDifficulties(records),
    [records],
  );

  // ============================================================
  // 筛选逻辑
  // ============================================================

  /**
   * 经过所有筛选条件过滤后的记录
   */
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // 按歌曲筛选
    if (songFilter !== 'all') {
      result = result.filter((r) => r.songTitle === songFilter);
    }

    // 按难度筛选
    if (difficultyFilter !== 'all') {
      result = result.filter((r) => r.difficulty === difficultyFilter);
    }

    // 按日期范围筛选
    result = result.filter((r) => isDateInPreset(r.playedAt, datePreset));

    // 按文本搜索（歌曲名包含关键词）
    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter((r) =>
        r.songTitle.toLowerCase().includes(query),
      );
    }

    return result;
  }, [records, songFilter, difficultyFilter, datePreset, searchText]);

  // ============================================================
  // 分组逻辑
  // ============================================================

  /**
   * 将筛选后的记录按"歌曲+难度"分组
   * 每组内的记录按分数降序排列
   */
  const groupedRecords = useMemo<ChartGroup[]>(() => {
    const groupMap = new Map<string, ScoreRecord[]>();

    // 第一步：按 key 分组
    filteredRecords.forEach((record) => {
      const key = `${record.songTitle}@@@${record.difficulty}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(record);
    });

    // 第二步：构建分组对象，找出最佳成绩
    const groups: ChartGroup[] = [];
    groupMap.forEach((groupRecords, key) => {
      // 按分数降序排序，第一条即最佳
      const sorted = [...groupRecords].sort((a, b) => b.score - a.score);
      const [songTitle, difficulty] = key.split('@@@');
      groups.push({
        key,
        songTitle,
        difficulty,
        records: sorted,
        best: sorted[0],
        playCount: sorted.length,
      });
    });

    // 第三步：对分组排序（按最佳成绩的当前排序字段）
    groups.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'score':
          cmp = a.best.score - b.best.score;
          break;
        case 'accuracy':
          cmp = a.best.accuracy - b.best.accuracy;
          break;
        case 'playedAt':
          cmp =
            new Date(a.best.playedAt).getTime() -
            new Date(b.best.playedAt).getTime();
          break;
        case 'maxCombo':
          cmp = a.best.maxCombo - b.best.maxCombo;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return groups;
  }, [filteredRecords, sortField, sortDir]);

  /**
   * 平铺视图下排序后的记录
   */
  const sortedFlatRecords = useMemo(() => {
    const result = [...filteredRecords];
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
          cmp = new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime();
          break;
        case 'maxCombo':
          cmp = a.maxCombo - b.maxCombo;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [filteredRecords, sortField, sortDir]);

  // ============================================================
  // 交互处理
  // ============================================================

  /**
   * 切换排序字段和方向
   * 同一字段再次点击时切换升序/降序
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
   * 切换分组展开/折叠状态
   */
  const toggleGroupExpand = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /**
   * 删除单条成绩记录
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
   * 清空所有成绩记录
   */
  const handleClearAll = useCallback(() => {
    if (confirm('确定要清空所有成绩记录吗？此操作不可撤销！')) {
      clearAllScores();
      setRecords([]);
      setExpandedGroups(new Set());
    }
  }, [setRecords]);

  /**
   * 渲染排序图标（激活时高亮并显示方向）
   */
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-30" />;
    }
    return (
      <ArrowUpDown
        size={14}
        className={`text-emerald-400 ${sortDir === 'asc' ? 'rotate-180' : ''}`}
      />
    );
  };

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="w-full min-h-screen bg-slate-900 text-white flex flex-col">
      {/* ===== 顶部导航栏 ===== */}
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
        <div className="flex items-center gap-2">
          {/* 视图切换：分组 / 平铺 */}
          <div className="flex bg-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'grouped'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              分组视图
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全部记录
            </button>
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
        </div>
      </header>

      {/* ===== 筛选区域 ===== */}
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

          {/* 歌曲筛选下拉 */}
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

          {/* 难度筛选下拉 */}
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

          {/* 日期范围筛选 */}
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

        {/* 筛选结果统计 */}
        <div className="mt-3 text-xs text-slate-400">
          {viewMode === 'grouped' ? (
            <>
              共 {groupedRecords.length} 个谱面分组（总计 {filteredRecords.length} 条记录）
            </>
          ) : (
            <>共 {filteredRecords.length} 条记录（总计 {records.length} 条）</>
          )}
        </div>
      </div>

      {/* ===== 成绩列表区域 ===== */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* 空状态 */}
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Trophy size={48} className="mb-4 opacity-30" />
            <p className="text-lg">
              {records.length === 0
                ? '还没有游戏记录，快去玩一局吧！'
                : '没有符合筛选条件的记录'}
            </p>
          </div>
        ) : viewMode === 'grouped' ? (
          /* ===== 分组视图 ===== */
          <div className="max-w-5xl mx-auto space-y-3">
            {groupedRecords.map((group, index) => (
              <GroupCard
                key={group.key}
                group={group}
                rank={index + 1}
                isExpanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroupExpand(group.key)}
                onDelete={handleDelete}
                sortField={sortField}
                onSort={toggleSort}
                SortIcon={SortIcon}
              />
            ))}
          </div>
        ) : (
          /* ===== 平铺视图 ===== */
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
            {sortedFlatRecords.map((record, index) => (
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

// ============================================================
// 分组卡片组件
// ============================================================

interface GroupCardProps {
  group: ChartGroup;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  sortField: SortField;
  onSort: (field: SortField) => void;
  SortIcon: React.FC<{ field: SortField }>;
}

/**
 * 单个分组卡片：展示歌曲+难度的最佳成绩
 * 点击可展开查看该分组的所有历史记录
 */
function GroupCard({
  group,
  rank,
  isExpanded,
  onToggle,
  onDelete,
}: GroupCardProps) {
  const { best } = group;
  const { rank: grade, color } = getRank(best.accuracy);

  return (
    <div className="bg-slate-800/60 rounded-xl overflow-hidden border border-slate-700/50 hover:border-slate-600 transition-colors">
      {/* 分组头部（最佳成绩摘要） */}
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={onToggle}
      >
        {/* 展开/折叠箭头 */}
        <div className="text-slate-400">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        {/* 分组排名 */}
        <div className="w-8 text-center">
          {rank === 1 ? (
            <Crown size={20} className="text-yellow-400 mx-auto" />
          ) : rank <= 3 ? (
            <Medal
              size={20}
              className={
                rank === 2
                  ? 'text-slate-300 mx-auto'
                  : 'text-amber-600 mx-auto'
              }
            />
          ) : (
            <span className="text-sm font-bold text-slate-500">{rank}</span>
          )}
        </div>

        {/* 歌曲信息 */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate flex items-center gap-2">
            {group.songTitle}
            <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 font-normal">
              {group.difficulty}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            游玩 {group.playCount} 次 · 最佳: {formatDate(best.playedAt)}
          </div>
        </div>

        {/* 等级 */}
        <div className={`text-4xl font-black ${color}`}>{grade}</div>

        {/* 最佳分数 */}
        <div className="text-right w-28">
          <div className="text-lg font-bold font-mono">
            {best.score.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-400">
            {(best.accuracy * 100).toFixed(1)}%
          </div>
        </div>

        {/* 最大连击 */}
        <div className="text-right w-16">
          <div className="text-sm font-bold text-cyan-400">{best.maxCombo}x</div>
          <div className="text-[10px] text-slate-500">MAX COMBO</div>
        </div>

        {/* P/G/M 统计 */}
        <div className="text-right w-32 text-xs">
          <span className="text-yellow-300">{best.perfect}</span>
          {' / '}
          <span className="text-emerald-400">{best.good}</span>
          {' / '}
          <span className="text-red-400">{best.miss}</span>
        </div>
      </div>

      {/* 展开后的详细记录列表 */}
      {isExpanded && (
        <div className="border-t border-slate-700/50 bg-slate-900/30">
          {/* 详细列表表头 */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-1">等级</div>
            <div className="col-span-4">日期</div>
            <div className="col-span-2 text-right">分数</div>
            <div className="col-span-2 text-right">准确率</div>
            <div className="col-span-1 text-right">连击</div>
            <div className="col-span-1" />
          </div>

          {/* 该分组内的所有记录 */}
          {group.records.map((record, idx) => {
            const recGrade = getRank(record.accuracy);
            const isBest = idx === 0; // 第一条是最佳成绩
            return (
              <div
                key={record.id}
                className={`grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center ${
                  isBest ? 'bg-emerald-500/5' : ''
                } hover:bg-slate-700/20 group`}
              >
                <div className="col-span-1 text-center">
                  {isBest ? (
                    <Crown size={14} className="text-yellow-400 mx-auto" />
                  ) : (
                    <span className="text-xs text-slate-500">{idx + 1}</span>
                  )}
                </div>
                <div className="col-span-1">
                  <span className={`text-lg font-black ${recGrade.color}`}>
                    {recGrade.rank}
                  </span>
                </div>
                <div className="col-span-4 text-xs text-slate-400">
                  {formatDate(record.playedAt)}
                </div>
                <div className="col-span-2 text-right font-mono text-xs">
                  {record.score.toLocaleString()}
                </div>
                <div className="col-span-2 text-right font-mono text-xs text-emerald-400">
                  {(record.accuracy * 100).toFixed(1)}%
                </div>
                <div className="col-span-1 text-right font-mono text-xs text-cyan-400">
                  {record.maxCombo}x
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(record.id);
                    }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 单行记录组件（平铺视图使用）
// ============================================================

interface RankingRowProps {
  record: ScoreRecord;
  rank: number;
  onDelete: () => void;
}

/**
 * 单行成绩记录（平铺视图）
 */
function RankingRow({ record, rank, onDelete }: RankingRowProps) {
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
