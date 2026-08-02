/**
 * 排行榜页面（独立路由 /ranking）。
 * 功能：
 * - 最佳成绩区：按「歌曲 + 难度」分组，各组只展示分数最高的一条；
 * - 全部成绩表：支持按歌曲 / 难度 / 日期范围筛选，按分数 / 准确率 / 日期排序；
 * - 支持删除单条成绩（二次确认）与清空全部成绩（二次确认）。
 * 数据通过 Jotai atom 管理，增删后同步写回 localStorage（见 scoreStorage.ts）。
 */
import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import { clearScores, deleteScore, loadScores, type ScoreRecord } from '../lib/scoreStorage';
import { Home, Trash2 } from 'lucide-react';

/**
 * 成绩记录列表 atom：初始值从 localStorage 读取。
 * 页面对成绩的删除/清空操作 = 写 localStorage + 更新该 atom。
 */
const scoreRecordsAtom = atom<ScoreRecord[]>(loadScores());

/** 排序字段 */
type SortField = 'score' | 'accuracy' | 'playedAt';
/** 排序方向 */
type SortOrder = 'desc' | 'asc';

/** 毫秒时长 → m:ss 格式 */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** 时间戳 → YYYY-MM-DD HH:mm 格式 */
function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RankingPage() {
  const [records, setRecords] = useAtom(scoreRecordsAtom);

  // --- 筛选条件（本页本地状态即可，无需共享） ---
  const [filterSong, setFilterSong] = useState(''); // 空串 = 全部歌曲
  const [filterDifficulty, setFilterDifficulty] = useState(''); // 空串 = 全部难度
  const [filterDateFrom, setFilterDateFrom] = useState(''); // 起始日期 yyyy-mm-dd
  const [filterDateTo, setFilterDateTo] = useState(''); // 截止日期 yyyy-mm-dd

  // --- 排序 ---
  const [sortField, setSortField] = useState<SortField>('playedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  /** 下拉框候选：从记录中提取去重后的歌曲名与难度 */
  const songOptions = useMemo(() => [...new Set(records.map((r) => r.songTitle))].sort(), [records]);
  const difficultyOptions = useMemo(
    () => [...new Set(records.map((r) => r.difficulty))].sort((a, b) => a - b),
    [records],
  );

  /**
   * 最佳成绩：按「歌曲名#难度」分组，每组取分数最高的一条
   * （同分时取游玩时间更早的，先到先得）。
   */
  const bestRecords = useMemo(() => {
    const bestMap = new Map<string, ScoreRecord>();
    for (const r of records) {
      const key = `${r.songTitle}#${r.difficulty}`;
      const prev = bestMap.get(key);
      if (!prev || r.score > prev.score || (r.score === prev.score && r.playedAt < prev.playedAt)) {
        bestMap.set(key, r);
      }
    }
    // 按分数倒序展示
    return [...bestMap.values()].sort((a, b) => b.score - a.score);
  }, [records]);

  /** 筛选 + 排序后的全部成绩列表 */
  const filteredRecords = useMemo(() => {
    // 日期范围换算：起始日 00:00:00 ~ 截止日 23:59:59.999
    const fromTs = filterDateFrom ? new Date(`${filterDateFrom}T00:00:00`).getTime() : null;
    const toTs = filterDateTo ? new Date(`${filterDateTo}T23:59:59.999`).getTime() : null;

    const filtered = records.filter((r) => {
      if (filterSong && r.songTitle !== filterSong) return false;
      if (filterDifficulty && r.difficulty !== Number(filterDifficulty)) return false;
      if (fromTs !== null && r.playedAt < fromTs) return false;
      if (toTs !== null && r.playedAt > toTs) return false;
      return true;
    });

    const direction = sortOrder === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => (a[sortField] - b[sortField]) * direction);
  }, [records, filterSong, filterDifficulty, filterDateFrom, filterDateTo, sortField, sortOrder]);

  /** 删除单条成绩（二次确认） */
  const handleDelete = (record: ScoreRecord) => {
    if (!window.confirm(`确定删除「${record.songTitle}」的这条成绩吗？`)) return;
    deleteScore(record.id);
    setRecords(loadScores()); // 重新读取，保证与存储一致
  };

  /** 清空全部成绩（二次确认） */
  const handleClearAll = () => {
    if (!window.confirm('确定清空全部成绩吗？此操作不可恢复！')) return;
    clearScores();
    setRecords([]);
  };

  const selectClass = 'bg-slate-800 border border-white/15 rounded px-2 py-1.5 text-sm text-white';
  const thClass = 'px-3 py-2 text-left text-xs font-bold text-white/50 whitespace-nowrap';
  const tdClass = 'px-3 py-2 text-sm whitespace-nowrap';

  return (
    <div className="min-h-screen w-screen bg-slate-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-6">
        {/* ===== 顶栏 ===== */}
        <header className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm font-bold text-white/70 hover:text-white transition-colors"
          >
            <Home size={16} />
            返回游戏
          </a>
          <h1 className="text-2xl font-black">排行榜</h1>
          <span className="text-xs text-white/40">共 {records.length} 条成绩</span>
          {records.length > 0 && (
            <button
              onClick={handleClearAll}
              className="ml-auto flex items-center gap-1.5 bg-red-500/80 hover:bg-red-400 text-white text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
            >
              <Trash2 size={14} />
              清空全部成绩
            </button>
          )}
        </header>

        {records.length === 0 ? (
          /* 空状态 */
          <div className="rounded-xl bg-white/5 border border-white/10 p-12 text-center text-white/50">
            还没有任何成绩记录，去
            <a href="/" className="text-emerald-300 font-bold hover:underline mx-1">游戏主页</a>
            玩一局吧！
          </div>
        ) : (
          <>
            {/* ===== 最佳成绩（按歌曲 + 难度分组） ===== */}
            <section>
              <h2 className="text-sm font-bold text-white/60 mb-2">最佳成绩（按歌曲 / 难度）</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {bestRecords.map((r) => (
                  <div key={r.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="font-bold truncate" title={r.songTitle}>{r.songTitle}</div>
                    <div className="text-xs text-white/50 mb-2">Lv.{r.difficulty}</div>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-black text-emerald-300 tabular-nums">
                        {r.score.toLocaleString()}
                      </span>
                      <span className="text-xs text-white/60 tabular-nums">
                        {r.accuracy.toFixed(2)}% · {r.maxCombo} 连击
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== 筛选 + 排序工具行 ===== */}
            <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-3">
              <select className={selectClass} value={filterSong} onChange={(e) => setFilterSong(e.target.value)}>
                <option value="">全部歌曲</option>
                {songOptions.map((title) => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
              <select
                className={selectClass}
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
              >
                <option value="">全部难度</option>
                {difficultyOptions.map((d) => (
                  <option key={d} value={d}>Lv.{d}</option>
                ))}
              </select>
              {/* 日期范围筛选 */}
              <label className="flex items-center gap-1 text-xs text-white/50">
                从
                <input
                  type="date"
                  className={selectClass}
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-white/50">
                到
                <input
                  type="date"
                  className={selectClass}
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </label>

              <span className="mx-1 h-4 w-px bg-white/15" />

              {/* 排序 */}
              <select
                className={selectClass}
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
              >
                <option value="playedAt">按日期</option>
                <option value="score">按分数</option>
                <option value="accuracy">按准确率</option>
              </select>
              <button
                className="bg-slate-800 border border-white/15 rounded px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-700 cursor-pointer"
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                title="切换排序方向"
              >
                {sortOrder === 'desc' ? '降序 ↓' : '升序 ↑'}
              </button>
              <span className="text-xs text-white/40">{filteredRecords.length} 条匹配</span>
            </section>

            {/* ===== 全部成绩表 ===== */}
            <section className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
              <table className="w-full">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className={thClass}>歌曲</th>
                    <th className={thClass}>难度</th>
                    <th className={thClass}>分数</th>
                    <th className={thClass}>准确率</th>
                    <th className={thClass}>最大连击</th>
                    <th className={thClass}>P / G / M</th>
                    <th className={thClass}>用时</th>
                    <th className={thClass}>游玩时间</th>
                    <th className={thClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/5">
                      <td className={`${tdClass} font-bold max-w-48 truncate`} title={r.songTitle}>
                        {r.songTitle}
                      </td>
                      <td className={tdClass}>Lv.{r.difficulty}</td>
                      <td className={`${tdClass} font-black text-emerald-300 tabular-nums`}>
                        {r.score.toLocaleString()}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>{r.accuracy.toFixed(2)}%</td>
                      <td className={`${tdClass} tabular-nums`}>{r.maxCombo}</td>
                      <td className={`${tdClass} tabular-nums`}>
                        <span className="text-yellow-300">{r.perfect}</span>
                        {' / '}
                        <span className="text-sky-300">{r.good}</span>
                        {' / '}
                        <span className="text-red-400">{r.miss}</span>
                      </td>
                      <td className={`${tdClass} tabular-nums`}>{formatDuration(r.durationMs)}</td>
                      <td className={`${tdClass} text-white/60 tabular-nums`}>{formatDateTime(r.playedAt)}</td>
                      <td className={tdClass}>
                        <button
                          onClick={() => handleDelete(r)}
                          className="text-red-400/70 hover:text-red-300 transition-colors cursor-pointer"
                          title="删除这条成绩"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-white/40">
                        没有符合筛选条件的成绩
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default RankingPage;
