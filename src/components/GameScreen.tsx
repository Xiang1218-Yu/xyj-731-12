/**
 * 游戏主界面：下落式音游轨道（Note Highway）。
 * 布局：顶部 HUD（分数/准确率/连击/判定计数）+ 中部 9 条下落轨道 + 底部按键提示。
 * 渲染驱动：songTimeMsAtom 每帧更新 → 只重渲染可见时间窗内的音符，保证 60fps。
 */
import { useAtomValue } from 'jotai';
import { activeSongAtom } from '../atoms/gameAtoms';
import {
  accuracyAtom,
  comboAtom,
  judgmentCountsAtom,
  lastJudgmentAtom,
  pressedLanesAtom,
  progressAtom,
  runtimeNotesAtom,
  scoreAtom,
  songTimeMsAtom,
  notesVersionAtom,
} from '../atoms/rhythmAtoms';
import { APPROACH_MS, LEAD_IN_MS } from '../hooks/useGameLogic';
import { comboMultiplier, MISS_WINDOW_MS, type JudgmentKind } from '../lib/judgment';

/** 9 条轨道对应的按键提示 */
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/** 判定线距轨道顶部的比例（85% 处） */
const JUDGE_LINE_RATIO = 0.85;

/** 判定文字颜色 */
const JUDGMENT_STYLE: Record<JudgmentKind, string> = {
  perfect: 'text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.8)]',
  good: 'text-sky-300 drop-shadow-[0_0_12px_rgba(125,211,252,0.8)]',
  miss: 'text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.8)]',
};

function GameScreen() {
  const song = useAtomValue(activeSongAtom);
  const songTime = useAtomValue(songTimeMsAtom);
  const notes = useAtomValue(runtimeNotesAtom);
  // 订阅判定版本号，保证音符判定结果（消失/变灰）能及时反映到画面上
  useAtomValue(notesVersionAtom);
  const score = useAtomValue(scoreAtom);
  const combo = useAtomValue(comboAtom);
  const accuracy = useAtomValue(accuracyAtom);
  const counts = useAtomValue(judgmentCountsAtom);
  const lastJudgment = useAtomValue(lastJudgmentAtom);
  const pressedLanes = useAtomValue(pressedLanesAtom);
  const progress = useAtomValue(progressAtom);

  if (!song) {
    return <div className="text-center p-8">Error: Song data is missing.</div>;
  }

  // 只渲染「可见时间窗」内的音符：从提前 APPROACH_MS 出现，到越过判定线 MISS_WINDOW_MS 后消失
  const visibleNotes = notes.filter(
    (n) => !n.judged && n.time - songTime <= APPROACH_MS && songTime - n.time <= MISS_WINDOW_MS + n.duration,
  );

  // 倒计时：歌曲时间为负时显示 3/2/1 准备数字
  const countdown = songTime < 0 ? Math.ceil(-songTime / (LEAD_IN_MS / 3)) : 0;

  return (
    <section className="w-[98%] max-w-7xl h-[94vh] flex flex-col p-4 rounded-2xl bg-black/30 backdrop-blur-lg border border-white/20 overflow-hidden">
      {/* ===== 顶部 HUD：歌曲信息 + 实时判定数据 ===== */}
      <header className="flex justify-between items-center gap-4 mb-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate" title={song.title}>{song.title}</h2>
          <p className="text-xs text-white/60">Lv.{song.difficulty} · {song.author}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black tabular-nums">{score.toLocaleString()}</div>
          <div className="text-xs text-white/60 tabular-nums">
            {accuracy.toFixed(2)}% · 倍率 x{comboMultiplier(combo).toFixed(2)}
          </div>
        </div>
      </header>

      {/* 进度条 */}
      <div className="h-1.5 rounded-full bg-white/10 mb-2 overflow-hidden">
        <div className="h-full bg-emerald-400 transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* ===== 下落轨道区 ===== */}
      <div className="relative grow flex rounded-lg overflow-hidden bg-black/40">
        {KEY_LABELS.map((label, lane) => (
          <div
            key={label}
            className={`relative flex-1 border-r border-white/10 last:border-r-0 transition-colors ${
              lane === 4 ? 'flex-[1.6]' : '' // 空格轨道稍宽，贴合实体键盘手感
            } ${pressedLanes[lane] ? 'bg-white/15' : ''}`}
          >
            {/* 轨道内的音符绝对定位渲染在外层，这里只画按键提示 */}
            <div
              className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-black ${
                pressedLanes[lane] ? 'text-white' : 'text-white/30'
              }`}
            >
              {label}
            </div>
          </div>
        ))}

        {/* 音符层：绝对定位覆盖整个轨道区（宽度与下方轨道 flex 布局严格一致） */}
        {visibleNotes.map((note) => {
          // 距离判定线还有多久（>0 未到达，<0 已越过）
          const untilHit = note.time - songTime;
          // 头部位置百分比：0=轨道顶，85=判定线；越过判定线后按相同速度继续下沉
          const headTop = (1 - untilHit / APPROACH_MS) * JUDGE_LINE_RATIO * 100;
          // 长条尾巴长度同样按「时间 → 距离」换算
          const tailPct = (note.duration / APPROACH_MS) * JUDGE_LINE_RATIO * 100;
          const left = LANE_LEFT[note.lane];
          const width = LANE_WIDTH[note.lane];
          return (
            <div key={note.id} className="contents">
              {/* 长条尾巴：从头部位置向上延伸 */}
              {note.type === 'hold' && note.duration > 0 && (
                <div
                  className="absolute w-2 -translate-x-1/2 rounded-full bg-cyan-300/40 pointer-events-none"
                  style={{
                    left: `calc(${left}% + ${width / 2}%)`,
                    top: `${Math.max(0, headTop - tailPct)}%`,
                    height: `${tailPct}%`,
                  }}
                />
              )}
              {/* 音符头部 */}
              <div
                className="absolute pointer-events-none"
                style={{ left: `calc(${left}% + 3px)`, width: `calc(${width}% - 6px)`, top: `${headTop}%` }}
              >
                <div
                  className={`h-4 rounded-md border-b-4 ${
                    note.type === 'hold'
                      ? 'bg-cyan-300 border-cyan-500'
                      : 'bg-emerald-300 border-emerald-500'
                  }`}
                />
              </div>
            </div>
          );
        })}

        {/* 判定线 */}
        <div
          className="absolute left-0 right-0 h-1 bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.7)]"
          style={{ top: `${JUDGE_LINE_RATIO * 100}%` }}
        />

        {/* 判定弹出文字（外层负责定位，内层负责动画，避免 transform 互相覆盖） */}
        {lastJudgment && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
            style={{ top: `${JUDGE_LINE_RATIO * 100 - 18}%` }}
          >
            <div key={lastJudgment.seq} className={`font-black animate-ping-once ${JUDGMENT_STYLE[lastJudgment.kind]}`}>
              <div className="text-3xl uppercase">{lastJudgment.kind}</div>
              {lastJudgment.deviationMs !== null && (
                <div className="text-sm">
                  {lastJudgment.deviationMs > 0 ? '+' : ''}{lastJudgment.deviationMs}ms
                </div>
              )}
            </div>
          </div>
        )}

        {/* 中央连击数 */}
        {combo >= 2 && (
          <div className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center pointer-events-none">
            <div className="text-5xl font-black text-white/90">{combo}</div>
            <div className="text-sm font-bold text-white/50 tracking-widest">COMBO</div>
          </div>
        )}

        {/* 开局倒计时 */}
        {countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div key={countdown} className="text-8xl font-black animate-ping-once">{countdown}</div>
          </div>
        )}
      </div>

      {/* ===== 底部实时判定统计 ===== */}
      <footer className="flex justify-center gap-6 mt-2 text-sm font-bold tabular-nums">
        <span className="text-yellow-300">Perfect {counts.perfect}</span>
        <span className="text-sky-300">Good {counts.good}</span>
        <span className="text-red-400">Miss {counts.miss}</span>
      </footer>
    </section>
  );
}

/**
 * 每条轨道的宽度（百分比），与轨道背景的 flex 布局严格对应：
 * 8 条普通轨道各占 flex-1，空格轨道占 flex-[1.6]，总份数 9.6。
 * 即普通轨道 = 100/9.6 ≈ 10.42%，空格轨道 = 160/9.6 ≈ 16.67%。
 */
const LANE_WIDTH = (() => {
  const unit = 100 / 9.6;
  return [unit, unit, unit, unit, unit * 1.6, unit, unit, unit, unit];
})();

/** 每条轨道的左边距（百分比）= 前面所有轨道宽度累加 */
const LANE_LEFT = (() => {
  const lefts: number[] = [];
  let acc = 0;
  for (const w of LANE_WIDTH) {
    lefts.push(acc);
    acc += w;
  }
  return lefts;
})();

export default GameScreen;
