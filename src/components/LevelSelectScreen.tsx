/**
 * 选歌界面（游戏主页）。
 * 歌曲来源三类：
 * 1. 随机生成 —— 内置随机音符玩法（保留原「随机生成」能力，每次开局重新随机）；
 * 2. 内置谱面 —— 由 public/levels 旧关卡转换而来的 26 张谱面；
 * 3. 自制谱面 —— 在 /editor 编辑器中制作并保存到本地曲库的谱面。
 * 页面顶部提供 /editor（谱面编辑器）与 /ranking（排行榜）入口。
 */
import { Suspense, useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { screenAtom, scaleAtom, songListAtom, activeSongAtom, gameModeAtom, type SongEntry } from '../atoms/gameAtoms';
import {
  activeLegacyLevelDataAtom,
  classicFinalTimeAtom,
  classicPlayerStateAtom,
  classicStartTimeAtom,
  classicStepAtom,
  legacyLevelIndexAtom,
  selectedLegacyLevelAtom,
  type LegacyLevelData,
  type LegacyLevelMeta,
} from '../atoms/classicAtoms';
import { audioManager, scales, type ScaleName } from '../lib/audio';
import { generateRandomChart } from '../lib/chart';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard';
import { useFullscreen } from '../hooks/useFullscreen';
import { useScreenOrientation } from '../hooks/useScreenOrientation';
import { ChartColumn, Music4, PencilLine, Shuffle } from 'lucide-react';

/** 内置随机歌曲的默认参数 */
const RANDOM_SONG_OPTIONS = { bpm: 120, offsetMs: 0, density: 0.75, beats: 64, difficulty: 5 };

/**
 * 带超时的 Promise 兜底：
 * 全屏 / 锁定横屏 API 在部分环境（桌面浏览器、无头环境）可能拒绝或永不 settle，
 * 这里统一加超时并吞掉异常，保证选歌流程一定能进入游戏。
 */
function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]).then(
    () => undefined,
    () => undefined,
  );
}

function SongList() {
  const songs = useAtomValue(songListAtom);
  const setScreen = useSetAtom(screenAtom);
  const setActiveSong = useSetAtom(activeSongAtom);
  const { enterFullscreen } = useFullscreen();
  const { lockOrientation } = useScreenOrientation();

  /** 选中歌曲：初始化音频 → 尝试全屏/横屏 → 写入当前歌曲 → 进入游戏屏 */
  const handleSongSelect = async (song: SongEntry) => {
    // 音频上下文必须在用户手势中启动
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }
    // 移动端体验优化：全屏 + 横屏；失败或 800ms 无响应都不阻塞进游戏
    await withTimeout(Promise.allSettled([enterFullscreen(), lockOrientation('landscape')]), 800);
    setActiveSong(song);
    setScreen('game');
  };

  /** 随机歌曲：每次点击都用新种子重新生成一张谱面 */
  const handleRandomSelect = () => {
    const chart = generateRandomChart({
      ...RANDOM_SONG_OPTIONS,
      title: `随机生成 (BPM ${RANDOM_SONG_OPTIONS.bpm})`,
      seed: Date.now(),
    });
    void handleSongSelect({
      id: 'random',
      title: chart.metadata.title,
      author: 'Auto',
      difficulty: chart.metadata.difficulty,
      source: 'random',
      chart,
    });
  };

  const builtin = songs.filter((s) => s.source === 'builtin');
  const custom = songs.filter((s) => s.source === 'custom');

  /** 单个歌曲按钮（标题 + 难度 + 「谱面」类型徽章，与经典模式关卡区分） */
  const renderSongButton = (song: SongEntry) => (
    <button
      key={song.id}
      onClick={() => void handleSongSelect(song)}
      className="bg-white text-emerald-600 border-none py-3 px-4 rounded-xl cursor-pointer transition-transform duration-100 ease-in-out hover:scale-[1.03] text-left"
    >
      <span className="flex items-center gap-2 font-bold truncate">
        <span className="truncate">{song.title}</span>
        <span className="shrink-0 rounded bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
          谱面
        </span>
      </span>
      <span className="block text-xs font-bold text-emerald-500/70">
        Lv.{song.difficulty} · {song.chart.notes.length} 音符
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4 max-h-[38vh] overflow-y-auto pr-1 border-t border-white/20 pt-4">
      {/* 随机生成入口（保留原有随机音符玩法） */}
      <button
        onClick={handleRandomSelect}
        className="flex items-center justify-center gap-2 bg-emerald-300 text-emerald-800 font-bold border-none py-3 px-4 rounded-xl cursor-pointer transition-transform hover:scale-[1.03]"
      >
        <Shuffle size={18} />
        随机生成一首（BPM {RANDOM_SONG_OPTIONS.bpm} · 密度 {RANDOM_SONG_OPTIONS.density}/拍）
      </button>

      {/* 自制谱面（来自编辑器） */}
      {custom.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-white/60 -mb-2">自制谱面</h3>
          {custom.map(renderSongButton)}
        </>
      )}

      {/* 内置谱面 */}
      <h3 className="text-sm font-bold text-white/60 -mb-2">内置谱面</h3>
      {builtin.map(renderSongButton)}
    </div>
  );
}

/**
 * 经典模式关卡列表（原版玩法）：
 * 读取关卡索引 → 点击后 fetch 关卡 JSON 写入同步 atom → 进入游戏屏。
 */
function ClassicLevelList() {
  const levelIndex = useAtomValue(legacyLevelIndexAtom);
  const setScreen = useSetAtom(screenAtom);
  const setSelectedLegacyLevel = useSetAtom(selectedLegacyLevelAtom);
  const setActiveLevelData = useSetAtom(activeLegacyLevelDataAtom);
  const setPlayerState = useSetAtom(classicPlayerStateAtom);
  const setStep = useSetAtom(classicStepAtom);
  const setStartTime = useSetAtom(classicStartTimeAtom);
  const setFinalTime = useSetAtom(classicFinalTimeAtom);
  const { enterFullscreen } = useFullscreen();
  const { lockOrientation } = useScreenOrientation();

  const handleSelect = async (meta: LegacyLevelMeta, index: number) => {
    // 音频上下文必须在用户手势中启动
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }
    // 全屏 / 横屏：失败或超时都不阻塞进游戏
    await withTimeout(Promise.allSettled([enterFullscreen(), lockOrientation('landscape')]), 800);

    // 拉取关卡数据（按键序列 + 评级阈值）并写入同步 atom
    const response = await fetch(`/levels/${meta.file}`);
    if (!response.ok) return;
    const data = (await response.json()) as LegacyLevelData;

    // 重置经典模式对局状态
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setStep(0);
    setStartTime(0);
    setFinalTime(0);

    setActiveLevelData(data);
    setSelectedLegacyLevel({ meta, index });
    setScreen('game');
  };

  return (
    <div className="flex flex-col gap-4 max-h-[38vh] overflow-y-auto pr-1 border-t border-white/20 pt-4">
      <p className="text-xs text-white/50 -mb-1">
        经典玩法：把 9 个按键按成与上方目标序列完全一致即可前进，全部完成后按用时评级。
      </p>
      {levelIndex.map((meta, index) => (
        <button
          key={meta.id}
          onClick={() => void handleSelect(meta, index)}
          className="bg-white text-emerald-600 font-bold border-none py-3 px-4 rounded-xl cursor-pointer transition-transform duration-100 ease-in-out hover:scale-[1.03] text-left"
        >
          <span className="flex items-center gap-2">
            <span className="truncate">{meta.name}</span>
            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
              经典
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function LevelSelectScreen() {
  useMenuKeyboard(); // 在选歌页屏蔽游戏按键的默认行为（如空格滚屏）
  const [currentScale, setCurrentScale] = useAtom(scaleAtom);
  const [mode, setMode] = useAtom(gameModeAtom);
  const [customScaleInput, setCustomScaleInput] = useState('C2 D2 E2 G2 A2 C3 D3 E3 G3');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleScaleChange = (newScale: ScaleName) => {
    setCurrentScale(newScale);
    audioManager.setScale(newScale);
    setShowCustomInput(false);
  };

  const handleCustomScaleApply = () => {
    const notes = customScaleInput.trim().split(/\s+/);
    if (notes.length === 9) {
      audioManager.setCustomScale(notes);
      setCurrentScale('Custom');
    } else {
      alert('Please enter exactly 9 notes separated by spaces.');
    }
  };

  const handleCustomButtonClick = () => {
    setShowCustomInput(!showCustomInput);
    if (currentScale !== 'Custom') {
      handleCustomScaleApply();
    }
  };

  return (
    <section className="w-[98%] max-w-7xl p-5 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20">
      {/* 标题 + 编辑器 / 排行榜入口（独立页面，整页跳转）。
          编辑器与排行榜仅服务于「谱面（下落模式）」，经典模式下不显示入口 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-black text-4xl">Finger Dance</h1>
        {mode === 'rhythm' ? (
          <div className="flex gap-2">
            <a
              href="/editor"
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors"
            >
              <PencilLine size={16} />
              谱面编辑器
            </a>
            <a
              href="/ranking"
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors"
            >
              <ChartColumn size={16} />
              排行榜
            </a>
          </div>
        ) : (
          <span className="text-xs font-bold text-white/40">经典模式不支持谱面编辑与排行榜</span>
        )}
      </div>

      {/* 音阶选择（决定按键音色），保留原有功能 */}
      <div className="mb-5">
        <label className="block text-sm font-bold mb-3 text-center">SELECT MUSICAL SCALE</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(scales) as ScaleName[]).map((scaleName) => (
            <button
              key={scaleName}
              onClick={() => handleScaleChange(scaleName)}
              className={`p-2 rounded-md text-sm font-bold transition-colors ${
                currentScale === scaleName
                  ? 'bg-white text-emerald-600'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {scaleName}
            </button>
          ))}
          <button
            onClick={handleCustomButtonClick}
            className={`p-2 rounded-md text-sm font-bold transition-colors ${
              currentScale === 'Custom'
                ? 'bg-white text-emerald-600'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            Custom
          </button>
        </div>
        {showCustomInput && (
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={customScaleInput}
              onChange={(e) => setCustomScaleInput(e.target.value)}
              className="grow bg-white/10 p-2 rounded-md text-white placeholder-white/50"
              placeholder="Enter 9 notes (e.g., C4 D4 E4...)"
            />
            <button
              onClick={handleCustomScaleApply}
              className="bg-emerald-500 text-white font-bold p-2 rounded-md hover:bg-emerald-600"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* 模式切换：下落模式（音游） / 经典模式（原版按键跟打） */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setMode('rhythm')}
          className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
            mode === 'rhythm' ? 'bg-white text-emerald-600' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          <Music4 size={16} />
          下落模式（音游）
        </button>
        <button
          onClick={() => setMode('classic')}
          className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
            mode === 'classic' ? 'bg-white text-emerald-600' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          经典模式（按键跟打）
        </button>
      </div>

      <Suspense fallback={<div className="text-center p-8">Loading songs...</div>}>
        {mode === 'rhythm' ? <SongList /> : <ClassicLevelList />}
      </Suspense>
    </section>
  );
}

export default LevelSelectScreen;
