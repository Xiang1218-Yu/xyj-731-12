import { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trophy, Play, Trash2 } from 'lucide-react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  screenAtom,
  levelIndexAtom,
  selectedLevelInfoAtom,
  scaleAtom,
  type LevelIndexInfo,
  currentLevelIndexAtom,
  playerStateAtom,
  currentStepAtom,
  startTimeAtom,
} from '../atoms/gameAtoms';
import { playChartAtom, editorChartAtom } from '../atoms/rhythmAtoms';
import { loadSavedCharts, deleteSavedChart, type SavedChart } from '../lib/chartUtils';
import { audioManager, scales, type ScaleName } from '../lib/audio';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard';
import { useFullscreen } from '../hooks/useFullscreen';
import { useScreenOrientation } from '../hooks/useScreenOrientation';

function LevelList() {
  const levelIndex = useAtomValue(levelIndexAtom);
  const setScreen = useSetAtom(screenAtom);
  const setSelectedLevelInfo = useSetAtom(selectedLevelInfoAtom);
  const setCurrentLevelIndex = useSetAtom(currentLevelIndexAtom);
  const setPlayerState = useSetAtom(playerStateAtom);
  const setCurrentStep = useSetAtom(currentStepAtom);
  const setStartTime = useSetAtom(startTimeAtom);
  const { enterFullscreen } = useFullscreen();
  const { lockOrientation } = useScreenOrientation();

  const handleLevelSelect = async (levelInfo: LevelIndexInfo, index: number) => {
    // Start audio context on first user interaction
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }

    await enterFullscreen();
    await lockOrientation('landscape');
    
    // Reset game state before starting a new level
    setPlayerState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setCurrentStep(0);
    setStartTime(0);
    
    setSelectedLevelInfo(levelInfo);
    setCurrentLevelIndex(index);
    setScreen('game');
  };

  return (
    <div className="flex flex-col gap-4 max-h-[40vh] overflow-y-auto pr-1 border-t border-white/20 pt-4">
      {levelIndex.map((level, index) => (
        <button
          key={level.id}
          onClick={() => handleLevelSelect(level, index)}
          className="bg-white text-emerald-600 text-lg font-bold border-none py-4 px-5 rounded-xl cursor-pointer transition-transform duration-100 ease-in-out hover:scale-105"
        >
          {level.name}
        </button>
      ))}
    </div>
  );
}

/**
 * "我的谱面"列表：展示保存到本地的自制谱面，可直接游玩（进入节奏模式）或删除。
 * 从 localStorage 读取，保存后返回首页即可看到。
 */
function SavedChartsList() {
  const navigate = useNavigate();
  const setPlayChart = useSetAtom(playChartAtom);
  const setEditorChart = useSetAtom(editorChartAtom);
  const [charts, setCharts] = useState<SavedChart[]>(() => loadSavedCharts());

  // 游玩某个已保存谱面：写入待游玩 atom 并进入 /play。
  // 注意清空 editorChart，使 /play 不显示"返回编辑器"（此次并非来自编辑器）。
  const handlePlay = (entry: SavedChart) => {
    setEditorChart(null);
    setPlayChart(entry.chart);
    navigate('/play');
  };

  const handleDelete = (id: string) => {
    setCharts(deleteSavedChart(id));
  };

  if (charts.length === 0) {
    return (
      <div className="text-center text-white/50 text-sm py-4 border-t border-white/20">
        还没有自制谱面。点击上方「谱面编辑器」创建并保存吧！
      </div>
    );
  }

  return (
    <div className="border-t border-white/20 pt-4">
      <h2 className="text-sm font-bold mb-3 text-center">我的谱面（自制）</h2>
      <div className="flex flex-col gap-2">
        {charts.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3"
          >
            <div className="grow min-w-0">
              <div className="font-bold truncate">{entry.chart.metadata.title}</div>
              <div className="text-xs text-white/60">
                {entry.chart.metadata.difficulty} · {entry.chart.metadata.bpm} BPM ·{' '}
                {entry.chart.notes.length} 音符
              </div>
            </div>
            <button
              onClick={() => handlePlay(entry)}
              className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-1.5 px-3 rounded-lg shrink-0"
              title="游玩"
            >
              <Play size={16} />
              游玩
            </button>
            <button
              onClick={() => handleDelete(entry.id)}
              className="p-2 text-white/50 hover:text-rose-300 shrink-0"
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelSelectScreen() {
  useMenuKeyboard(); // Enable keyboard sounds on this screen
  const navigate = useNavigate();
  const [currentScale, setCurrentScale] = useAtom(scaleAtom);
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
  }

  return (
    <section className="w-[90%] max-w-3xl max-h-[92svh] overflow-y-auto p-5 rounded-2xl bg-black/10 backdrop-blur-lg border border-white/20">
      <h1 className="text-center font-black text-4xl mb-6">Finger Dance</h1>

      {/* 节奏模式入口：谱面编辑器与排行榜（新增功能） */}
      <div className="flex justify-center gap-3 mb-6">
        <button
          onClick={() => navigate('/editor')}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          <Pencil size={18} />
          谱面编辑器
        </button>
        <button
          onClick={() => navigate('/ranking')}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          <Trophy size={18} />
          排行榜
        </button>
      </div>
      
      <div className="mb-6">
        <label className="block text-sm font-bold mb-3 text-center">
          SELECT MUSICAL SCALE
        </label>
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

      <Suspense fallback={<div className="text-center p-8">Loading levels...</div>}>
        <LevelList />
      </Suspense>

      {/* 我的谱面（自制，保存到本地后在此展示，可直接游玩） */}
      <div className="mt-4">
        <SavedChartsList />
      </div>
    </section>
  );
}

export default LevelSelectScreen;
