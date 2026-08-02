import { useAtomValue, useSetAtom } from 'jotai';
import {
  finalTimeAtom,
  currentChartAtom,
  screenAtom,
  gameStatsAtom,
  playerStateAtom,
  startTimeAtom,
  currentChartAtom as chartAtom,
  cameFromEditorAtom,
} from '../atoms/gameAtoms';
import { useEffect, useCallback } from 'react';
import { audioManager } from '../lib/audio';
import { useScreenOrientation } from '../hooks/useScreenOrientation';
import { getRank } from '../types/chart';
import { Home, RotateCcw, Trophy, Pencil } from 'lucide-react';

/**
 * 游戏结算/结果屏幕
 *
 * 展示：
 * - 等级评定（S/A/B/C/D，基于准确率）
 * - 总分
 * - 准确率百分比
 * - 最大连击
 * - Perfect / Good / Miss 计数
 * - 游戏时长
 * - 操作按钮（重试、返回菜单、查看排行榜）
 */
export default function ResultScreen() {
  const { unlockOrientation } = useScreenOrientation();
  const finalTime = useAtomValue(finalTimeAtom);
  const currentChart = useAtomValue(chartAtom);
  const stats = useAtomValue(gameStatsAtom);
  const cameFromEditor = useAtomValue(cameFromEditorAtom);
  const setScreen = useSetAtom(screenAtom);
  const setPlayerState = useSetAtom(playerStateAtom);
  const setStartTime = useSetAtom(startTimeAtom);
  const setCurrentChart = useSetAtom(currentChartAtom);
  const setCameFromEditor = useSetAtom(cameFromEditorAtom);

  // 结果页出现时确保所有声音停止
  useEffect(() => {
    audioManager.releaseAll();
  }, []);

  // 根据准确率计算等级
  const { rank, color: rankColor } = getRank(stats.accuracy);

  const finalTimeInSeconds = finalTime / 1000;

  /**
   * 重新开始当前谱面
   */
  const handleRetry = useCallback(() => {
    audioManager.releaseAll();
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStartTime(0);
    // 通过先清空再设置来触发游戏重置
    const chart = currentChart;
    setCurrentChart(null);
    setTimeout(() => {
      if (chart) setCurrentChart(chart);
      setScreen('game');
    }, 50);
  }, [currentChart, setPlayerState, setStartTime, setCurrentChart, setScreen]);

  /**
   * 返回主菜单
   */
  const handleBackToMenu = useCallback(() => {
    audioManager.releaseAll();
    unlockOrientation();
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStartTime(0);
    setCurrentChart(null);
    setCameFromEditor(false);
    setScreen('levelSelect');
  }, [unlockOrientation, setPlayerState, setStartTime, setCurrentChart, setCameFromEditor, setScreen]);

  /**
   * 返回谱面编辑器继续编辑（仅当从编辑器进入时可用）
   */
  const handleBackToEditor = useCallback(() => {
    audioManager.releaseAll();
    unlockOrientation();
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStartTime(0);
    // 清空游戏谱面引用，编辑器中保留编辑数据
    setCurrentChart(null);
    setCameFromEditor(false);
    setScreen('editor');
  }, [unlockOrientation, setPlayerState, setStartTime, setCurrentChart, setCameFromEditor, setScreen]);

  /**
   * 查看排行榜
   */
  const handleViewRanking = useCallback(() => {
    setScreen('ranking');
  }, [setScreen]);

  // 总音符数
  const totalNotes = currentChart?.notes.length || 0;

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex items-center justify-center p-6 overflow-auto">
      <section className="w-full max-w-2xl p-8 rounded-3xl bg-slate-800/80 backdrop-blur border border-slate-700 shadow-2xl">
        {/* 标题 */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-slate-300 mb-1">
            {currentChart?.metadata.title || 'Chart Complete'}
          </h2>
          <p className="text-sm text-slate-500">
            {currentChart?.metadata.difficulty} · {currentChart?.metadata.bpm} BPM
          </p>
        </div>

        {/* 等级大字 */}
        <div className="text-center mb-8">
          <div
            className={`text-[120px] font-black leading-none ${rankColor} drop-shadow-lg`}
          >
            {rank}
          </div>
        </div>

        {/* 主要数据：分数和准确率 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-900/50 rounded-xl p-4 text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">
              Score
            </div>
            <div className="text-4xl font-black font-mono text-white">
              {stats.score.toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4 text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">
              Accuracy
            </div>
            <div className="text-4xl font-black font-mono text-emerald-400">
              {(stats.accuracy * 100).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* 详细统计 */}
        <div className="bg-slate-900/50 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-yellow-300">
                {stats.perfect}
              </div>
              <div className="text-xs text-slate-400 uppercase">Perfect</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400">
                {stats.good}
              </div>
              <div className="text-xs text-slate-400 uppercase">Good</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{stats.miss}</div>
              <div className="text-xs text-slate-400 uppercase">Miss</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-400">
                {stats.maxCombo}
              </div>
              <div className="text-xs text-slate-400 uppercase">Max Combo</div>
            </div>
          </div>

          {/* 进度条可视化 */}
          <div className="mt-4">
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-700">
              {totalNotes > 0 && (
                <>
                  <div
                    className="bg-yellow-400 transition-all"
                    style={{ width: `${(stats.perfect / totalNotes) * 100}%` }}
                  />
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(stats.good / totalNotes) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(stats.miss / totalNotes) * 100}%` }}
                  />
                </>
              )}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Total: {totalNotes} notes</span>
              <span>Time: {finalTimeInSeconds.toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-center gap-3 flex-wrap">
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl transition-transform hover:scale-105 cursor-pointer"
          >
            <RotateCcw size={18} />
            再来一次
          </button>
          {/* 从编辑器进入时显示返回编辑器按钮 */}
          {cameFromEditor && (
            <button
              onClick={handleBackToEditor}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 px-6 rounded-xl transition-transform hover:scale-105 cursor-pointer"
            >
              <Pencil size={18} />
              返回编辑器
            </button>
          )}
          <button
            onClick={handleViewRanking}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-xl transition-transform hover:scale-105 cursor-pointer"
          >
            <Trophy size={18} />
            排行榜
          </button>
          <button
            onClick={handleBackToMenu}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-6 rounded-xl transition-transform hover:scale-105 cursor-pointer"
          >
            <Home size={18} />
            返回菜单
          </button>
        </div>
      </section>
    </div>
  );
}
