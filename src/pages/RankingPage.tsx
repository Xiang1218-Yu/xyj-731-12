import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Trash2, X } from 'lucide-react';
import type { DifficultyLevel, ScoreRecord } from '../types/chart';
import { DIFFICULTY_LEVELS } from '../types/chart';
import { loadScores, deleteScore, clearScores } from '../lib/scoreStorage';

/** 排序字段。 */
type SortKey = 'score' | 'accuracy' | 'date';

/** 评级配色。 */
const GRADE_COLOR: Record<string, string> = {
  S: 'text-yellow-300',
  A: 'text-emerald-300',
  B: 'text-sky-300',
  C: 'text-amber-400',
  D: 'text-rose-400',
};

/**
 * 排行榜页面（/ranking）。
 *
 * - 从 localStorage 读取全部成绩。
 * - 支持筛选：按歌曲（关键字）、难度、日期范围。
 * - 支持排序：按分数 / 准确率 / 日期。
 * - 按"歌曲 + 难度"分组展示每组的最佳成绩榜。
 * - 支持删除单条成绩、清空全部成绩。
 */
export default function RankingPage() {
  const navigate = useNavigate();
  /** 成绩列表状态（删除/清空后同步刷新）。 */
  const [records, setRecords] = useState<ScoreRecord[]>(() => loadScores());

  // --- 筛选条件 ---
  const [songQuery, setSongQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyLevel | 'All'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // --- 排序条件 ---
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDesc, setSortDesc] = useState(true);

  /** 删除单条成绩。 */
  const handleDelete = (id: string) => {
    setRecords(deleteScore(id));
  };

  /** 清空全部成绩。 */
  const handleClearAll = () => {
    if (records.length === 0) return;
    if (confirm('确定清空全部成绩记录？此操作不可撤销。')) {
      clearScores();
      setRecords([]);
    }
  };

  // 应用筛选 + 排序，并按"歌曲 + 难度"分组。
  const groups = useMemo(() => {
    // 1) 筛选
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    // dateTo 视为当天 23:59:59。
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;

    const filtered = records.filter((r) => {
      if (songQuery && !r.song.toLowerCase().includes(songQuery.toLowerCase())) return false;
      if (difficultyFilter !== 'All' && r.difficulty !== difficultyFilter) return false;
      if (r.date < fromTs || r.date > toTs) return false;
      return true;
    });

    // 2) 排序（组内）
    const cmp = (a: ScoreRecord, b: ScoreRecord) => {
      let diff = 0;
      if (sortKey === 'score') diff = a.score - b.score;
      else if (sortKey === 'accuracy') diff = a.accuracy - b.accuracy;
      else diff = a.date - b.date;
      return sortDesc ? -diff : diff;
    };

    // 3) 分组：key = 歌曲 + 难度
    const map = new Map<string, { song: string; difficulty: DifficultyLevel; items: ScoreRecord[] }>();
    for (const r of filtered) {
      const key = `${r.song}\u0000${r.difficulty}`;
      if (!map.has(key)) map.set(key, { song: r.song, difficulty: r.difficulty, items: [] });
      map.get(key)!.items.push(r);
    }
    for (const g of map.values()) g.items.sort(cmp);

    // 分组本身按"该组最高分"降序展示。
    return Array.from(map.values()).sort(
      (a, b) => Math.max(...b.items.map((i) => i.score)) - Math.max(...a.items.map((i) => i.score))
    );
  }, [records, songQuery, difficultyFilter, dateFrom, dateTo, sortKey, sortDesc]);

  return (
    <div className="min-h-svh bg-slate-900 text-white flex flex-col">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 text-white/60 hover:text-white" title="返回主页">
            <Home size={20} />
          </button>
          <h1 className="text-lg font-bold">排行榜</h1>
        </div>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-500/80 hover:bg-rose-500"
        >
          <Trash2 size={16} />
          清空全部
        </button>
      </header>

      {/* 筛选 / 排序控制条 */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-black/20 border-b border-white/10">
        <Control label="按歌曲筛选">
          <input
            className="editor-input"
            placeholder="输入歌曲名关键字"
            value={songQuery}
            onChange={(e) => setSongQuery(e.target.value)}
          />
        </Control>
        <Control label="难度">
          <select
            className="editor-input"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as DifficultyLevel | 'All')}
          >
            <option value="All">全部</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Control>
        <Control label="起始日期">
          <input type="date" className="editor-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Control>
        <Control label="结束日期">
          <input type="date" className="editor-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Control>
        <Control label="排序字段">
          <select className="editor-input" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="score">分数</option>
            <option value="accuracy">准确率</option>
            <option value="date">日期</option>
          </select>
        </Control>
        <button
          onClick={() => setSortDesc((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white/10 hover:bg-white/20 h-9"
        >
          {sortDesc ? '降序 ↓' : '升序 ↑'}
        </button>
      </div>

      {/* 分组列表 */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {groups.length === 0 && (
          <div className="text-center text-white/50 py-20">
            暂无成绩记录。去
            <button className="text-emerald-400 underline mx-1" onClick={() => navigate('/editor')}>
              编辑器
            </button>
            创建谱面并游玩吧！
          </div>
        )}

        {groups.map((group) => (
          <section key={`${group.song}-${group.difficulty}`} className="bg-black/20 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-white/5">
              <h2 className="font-bold">
                {group.song}
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200">
                  {group.difficulty}
                </span>
              </h2>
              <span className="text-xs text-white/50">{group.items.length} 条记录</span>
            </div>

            {/* 表头 */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 text-xs text-white/40 border-b border-white/10">
              <span>#</span>
              <span>评级</span>
              <span>分数</span>
              <span>准确率</span>
              <span>最大连击</span>
              <span>日期</span>
              <span></span>
            </div>

            {group.items.map((r, i) => (
              <div
                key={r.id}
                className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 items-center text-sm border-b border-white/5 hover:bg-white/5"
              >
                <span className="text-white/40 w-6">{i + 1}</span>
                <span className={`font-black ${GRADE_COLOR[r.grade]}`}>{r.grade}</span>
                <span className="font-bold tabular-nums">{r.score.toLocaleString()}</span>
                <span className="tabular-nums">{r.accuracy.toFixed(2)}%</span>
                <span className="tabular-nums">{r.maxCombo}</span>
                <span className="text-white/60 text-xs">{new Date(r.date).toLocaleString()}</span>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1 text-white/40 hover:text-rose-400"
                  title="删除此记录"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

/** 筛选控件容器。 */
function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-white/50">{label}</span>
      <div className="w-40">{children}</div>
    </label>
  );
}
