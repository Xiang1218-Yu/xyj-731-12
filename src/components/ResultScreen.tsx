/**
 * 结算界面：展示本局总评等级（S/A/B/C/D）、分数、准确率、
 * 最大连击与 Perfect/Good/Miss 明细。
 * 成绩已在判定结束时由 useGameLogic 自动保存到 localStorage（可在 /ranking 查看）。
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { activeSongAtom, screenAtom } from '../atoms/gameAtoms';
import { finalStatsAtom, rhythmStatusAtom } from '../atoms/rhythmAtoms';
import { useEffect } from 'react';
import { audioManager } from '../lib/audio';
import { useScreenOrientation } from '../hooks/useScreenOrientation';

/** 各等级对应的颜色 */
const RANK_COLOR: Record<string, string> = {
  S: 'text-yellow-300',
  A: 'text-emerald-300',
  B: 'text-sky-300',
  C: 'text-orange-300',
  D: 'text-red-400',
};

function ResultScreen() {
  const { unlockOrientation } = useScreenOrientation();
  const stats = useAtomValue(finalStatsAtom);
  const song = useAtomValue(activeSongAtom);
  const setScreen = useSetAtom(screenAtom);
  const setStatus = useSetAtom(rhythmStatusAtom);

  // 进入结算页时停止所有残留的音符声音
  useEffect(() => {
    audioManager.releaseAll();
  }, []);

  // 再来一次：状态置 idle + 切回游戏屏，useGameLogic 的准备副作用会自动重新开局
  const handleRetry = () => {
    setStatus('idle');
    setScreen('game');
  };

  // 返回选歌：停止对局并解锁屏幕方向
  const handleBackToMenu = () => {
    audioManager.releaseAll();
    unlockOrientation();
    setStatus('idle');
    setScreen('levelSelect');
  };

  // 兜底：没有结算数据（例如直接刷新页面）时引导返回选歌
  if (!stats || !song) {
    return (
      <div className="text-center">
        <p className="mb-4">暂无结算数据，请先游玩一首歌曲。</p>
        <button
          onClick={handleBackToMenu}
          className="bg-white text-emerald-600 text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          返回选歌
        </button>
      </div>
    );
  }

  return (
    <section className="w-[90%] max-w-3xl p-6 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20 text-center">
      <h2 className="text-2xl font-black mb-1 truncate">{song.title}</h2>
      <p className="text-sm text-white/60 mb-4">Lv.{song.difficulty} · 成绩已保存到排行榜</p>

      {/* 总评等级：基于最终准确率（S≥95 / A≥90 / B≥80 / C≥70 / D） */}
      <div className={`text-9xl font-black leading-none mb-6 ${RANK_COLOR[stats.rank]}`}>{stats.rank}</div>

      {/* 核心数据 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-2xl font-black tabular-nums">{stats.score.toLocaleString()}</div>
          <div className="text-xs text-white/60 font-bold">分数</div>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-2xl font-black tabular-nums">{stats.accuracy.toFixed(2)}%</div>
          <div className="text-xs text-white/60 font-bold">准确率</div>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <div className="text-2xl font-black tabular-nums">{stats.maxCombo}</div>
          <div className="text-xs text-white/60 font-bold">最大连击</div>
        </div>
      </div>

      {/* 判定明细 */}
      <div className="flex justify-center gap-6 mb-8 text-sm font-bold tabular-nums">
        <span className="text-yellow-300">Perfect {stats.counts.perfect}</span>
        <span className="text-sky-300">Good {stats.counts.good}</span>
        <span className="text-red-400">Miss {stats.counts.miss}</span>
      </div>

      <div className="flex justify-center gap-4">
        <button
          onClick={handleRetry}
          className="bg-white text-emerald-600 text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          再来一次
        </button>
        <button
          onClick={handleBackToMenu}
          className="bg-white/20 text-white text-lg font-bold py-3 px-5 rounded-xl cursor-pointer transition-transform hover:scale-105"
        >
          返回选歌
        </button>
      </div>
    </section>
  );
}

export default ResultScreen;
