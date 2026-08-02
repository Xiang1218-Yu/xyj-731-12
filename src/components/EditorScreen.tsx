import { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Upload,
  Trash2,
  Plus,
  ZoomIn,
  ZoomOut,
  Music,
} from 'lucide-react';
import {
  screenAtom,
  editorChartAtom,
  editorPlaybackTimeAtom,
  editorIsPlayingAtom,
  editorGridSnapAtom,
  editorZoomAtom,
  currentChartAtom,
  snapToGrid,
} from '../atoms/gameAtoms';
import type { Chart, Note } from '../types/chart';
import { generateId } from '../types/chart';
import { audioManager } from '../lib/audio';

// 9 个轨道对应的按键标签
const LANE_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];
// 轨道颜色（渐变区分左右）
const LANE_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-fuchsia-500',
];

// 难度选项
const DIFFICULTY_OPTIONS = ['Easy', 'Normal', 'Hard', 'Expert', 'Master'];

/**
 * 谱面编辑器主组件
 * 支持：
 * - 时间轴上拖拽/点击放置音符
 * - BPM、偏移量、难度、标题、作者设置
 * - 网格吸附（节拍对齐）
 * - 播放预览
 * - JSON 导入/导出
 */
export default function EditorScreen() {
  const [, setScreen] = useAtom(screenAtom);
  const [chart, setChart] = useAtom(editorChartAtom);
  const [playbackTime, setPlaybackTime] = useAtom(editorPlaybackTimeAtom);
  const [isPlaying, setIsPlaying] = useAtom(editorIsPlayingAtom);
  const [gridSnap, setGridSnap] = useAtom(editorGridSnapAtom);
  const [zoom, setZoom] = useAtom(editorZoomAtom);
  const [, setCurrentChart] = useAtom(currentChartAtom);

  const timelineRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 音符密度设置：每拍自动生成的音符数（0 表示不自动生成）
  const [noteDensity, setNoteDensity] = useState<number>(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const { metadata, notes } = chart;
  const beatDuration = 60000 / metadata.bpm;

  /**
   * 将屏幕 X 坐标转换为时间（毫秒）
   */
  const xToTime = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clientX - rect.left + timelineRef.current.scrollLeft;
      const rawTime = x / zoom;
      return snapToGrid(rawTime, metadata.bpm, gridSnap, metadata.offset);
    },
    [zoom, metadata.bpm, metadata.offset, gridSnap],
  );

  /**
   * 将时间（毫秒）转换为像素 X 坐标
   */
  const timeToX = useCallback(
    (time: number): number => {
      return time * zoom;
    },
    [zoom],
  );

  /**
   * 在时间轴上点击/拖拽添加音符
   */
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, lane: number) => {
      const time = xToTime(e.clientX);
      if (time < 0) return;

      // 检查同一位置是否已有音符
      const existing = notes.find(
        (n) =>
          n.lane === lane && Math.abs(n.time - time) < beatDuration * gridSnap * 0.5,
      );

      if (existing) {
        // 如果已有音符，则删除
        setChart((prev) => ({
          ...prev,
          notes: prev.notes.filter((n) => n.id !== existing.id),
        }));
      } else {
        // 添加新音符
        const newNote: Note = {
          id: generateId(),
          time,
          lane,
          type: 'tap',
        };
        setChart((prev) => ({
          ...prev,
          notes: [...prev.notes, newNote.id ? newNote : { ...newNote, id: generateId() }]
            .filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i)
            .sort((a, b) => a.time - b.time),
        }));
      }
    },
    [xToTime, notes, setChart, beatDuration, gridSnap],
  );

  /**
   * 更新元数据字段
   */
  const updateMetadata = useCallback(
    (field: keyof Chart['metadata'], value: string | number) => {
      setChart((prev) => ({
        ...prev,
        metadata: { ...prev.metadata, [field]: value },
      }));
    },
    [setChart],
  );

  /**
   * 导出谱面为 JSON 文件
   */
  const handleExport = useCallback(() => {
    // 导出时清理内部 id 字段（可选，这里保留以便再次导入时识别）
    const exportData: Chart = {
      metadata: { ...chart.metadata },
      notes: chart.notes.map(({ id, ...rest }) => ({
        ...rest,
        id: id || generateId(),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.title || 'chart'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chart, metadata.title]);

  /**
   * 从 JSON 文件导入谱面
   */
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as Chart;
          // 数据校验
          if (!data.metadata || !Array.isArray(data.notes)) {
            alert('无效的谱面文件格式');
            return;
          }
          // 确保每个音符都有 id
          const notesWithIds = data.notes.map((n) => ({
            ...n,
            id: n.id || generateId(),
          }));
          setChart({
            metadata: {
              title: data.metadata.title || 'Imported Chart',
              author: data.metadata.author || 'Unknown',
              bpm: data.metadata.bpm || 120,
              difficulty: data.metadata.difficulty || 'Normal',
              offset: data.metadata.offset || 0,
            },
            notes: notesWithIds.sort((a, b) => a.time - b.time),
          });
        } catch {
          alert('文件解析失败，请确保是有效的 JSON 文件');
        }
      };
      reader.readAsText(file);
      // 重置 input 以允许重复导入同一文件
      e.target.value = '';
    },
    [setChart],
  );

  /**
   * 播放/暂停预览
   */
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      // 暂停
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      audioManager.releaseAll();
    } else {
      // 开始播放
      if (!audioManager.isInitialized()) {
        audioManager.start();
      }
      setIsPlaying(true);
      playbackStartRef.current = performance.now() - playbackTime;

      const tick = () => {
        const now = performance.now();
        const currentTime = now - playbackStartRef.current;

        // 检查是否需要播放音符声音
        const notesToPlay = notes.filter(
          (n) =>
            n.time >= currentTime - 20 &&
            n.time <= currentTime + 20,
        );

        // 使用简单的标记来避免重复触发
        // 这里用时间窗口判断，实际生产环境可以用更精确的调度
        notesToPlay.forEach((note) => {
          const keyMap = ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'];
          audioManager.playNote(keyMap[note.lane]);
          // 短暂释放
          setTimeout(() => audioManager.releaseNote(keyMap[note.lane]), 100);
        });

        // 检查播放是否结束（最后一个音符后 2 秒）
        const lastNoteTime = notes.length > 0 ? notes[notes.length - 1].time : 0;
        if (currentTime >= lastNoteTime + 2000) {
          setIsPlaying(false);
          setPlaybackTime(0);
          audioManager.releaseAll();
          return;
        }

        setPlaybackTime(currentTime);
        animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    }
  }, [isPlaying, notes, playbackTime, setIsPlaying, setPlaybackTime]);

  /**
   * 停止播放并回到开头
   */
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setPlaybackTime(0);
    audioManager.releaseAll();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [setIsPlaying, setPlaybackTime]);

  /**
   * 清除所有音符
   */
  const clearNotes = useCallback(() => {
    if (confirm('确定要清除所有音符吗？')) {
      setChart((prev) => ({ ...prev, notes: [] }));
    }
  }, [setChart]);

  /**
   * 根据密度自动生成音符序列
   * 在 N 拍范围内生成示例音符
   */
  const generateByDensity = useCallback(() => {
    if (noteDensity <= 0) return;
    const totalBeats = 16; // 生成 16 拍的音符
    const newNotes: Note[] = [];

    for (let beat = 0; beat < totalBeats; beat++) {
      const notesPerBeat = noteDensity;
      for (let i = 0; i < notesPerBeat; i++) {
        const time = (beat + i / notesPerBeat) * beatDuration;
        const lane = Math.floor(Math.random() * 9);
        newNotes.push({
          id: generateId(),
          time,
          lane,
          type: 'tap',
        });
      }
    }

    setChart((prev) => ({
      ...prev,
      notes: newNotes.sort((a, b) => a.time - b.time),
    }));
  }, [noteDensity, beatDuration, setChart]);

  /**
   * 测试游玩当前编辑的谱面
   */
  const handleTestPlay = useCallback(() => {
    if (notes.length === 0) {
      alert('谱面为空，请先添加音符');
      return;
    }
    setCurrentChart({ ...chart });
    audioManager.releaseAll();
    setScreen('game');
  }, [chart, notes.length, setCurrentChart, setScreen]);

  /**
   * 计算时间轴总宽度（根据最后一个音符 + 4 拍留白）
   */
  const timelineWidth = useCallback(() => {
    const lastNote = notes[notes.length - 1];
    const endTime = lastNote ? lastNote.time + beatDuration * 4 : beatDuration * 16;
    return Math.max(endTime * zoom, 800);
  }, [notes, beatDuration, zoom]);

  /**
   * 生成网格线位置（每拍一条粗线，细分网格根据 gridSnap）
   */
  const gridLines = useCallback(() => {
    const lines: { time: number; isBeat: boolean }[] = [];
    const totalTime = timelineWidth() / zoom;
    const step = beatDuration * gridSnap;
    for (let t = 0; t <= totalTime; t += step) {
      lines.push({
        time: t,
        isBeat: Math.abs(t % beatDuration) < 1 || t % beatDuration < 1,
      });
    }
    return lines;
  }, [timelineWidth, zoom, beatDuration, gridSnap]);

  // 组件卸载时清理播放
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioManager.releaseAll();
    };
  }, []);

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              stopPlayback();
              setScreen('levelSelect');
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            返回
          </button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Music size={20} className="text-emerald-400" />
            谱面编辑器
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={togglePlayback}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-medium"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button
            onClick={stopPlayback}
            className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
          >
            停止
          </button>
          <button
            onClick={handleTestPlay}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            测试游玩
          </button>
          <div className="w-px h-6 bg-slate-600 mx-1" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
          >
            <Upload size={16} />
            导入
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
          >
            <Download size={16} />
            导出
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧设置面板 */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto shrink-0">
          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">谱面信息</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">标题</label>
              <input
                type="text"
                value={metadata.title}
                onChange={(e) => updateMetadata('title', e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">作者</label>
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => updateMetadata('author', e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">BPM</label>
              <input
                type="number"
                min="1"
                max="300"
                value={metadata.bpm}
                onChange={(e) =>
                  updateMetadata('bpm', Math.max(1, Number(e.target.value)))
                }
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">偏移量 (ms)</label>
              <input
                type="number"
                value={metadata.offset}
                onChange={(e) => updateMetadata('offset', Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">难度</label>
              <select
                value={metadata.difficulty}
                onChange={(e) => updateMetadata('difficulty', e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              >
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3 mt-6">
            网格设置
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">网格精度</label>
              <select
                value={gridSnap}
                onChange={(e) => setGridSnap(Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              >
                <option value={1}>1/1 (全音符)</option>
                <option value={0.5}>1/2 (二分音符)</option>
                <option value={0.25}>1/4 (四分音符)</option>
                <option value={0.125}>1/8 (八分音符)</option>
                <option value={0.0625}>1/16 (十六分音符)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">缩放</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
                  className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"
                >
                  <ZoomOut size={14} />
                </button>
                <input
                  type="range"
                  min="0.2"
                  max="2"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
                <button
                  onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                  className="p-1.5 bg-slate-700 rounded hover:bg-slate-600"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            </div>
          </div>

          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3 mt-6">
            快速生成
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                音符密度 (每拍)
              </label>
              <input
                type="number"
                min="0"
                max="8"
                value={noteDensity}
                onChange={(e) => setNoteDensity(Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-slate-700 rounded text-sm border border-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
            <button
              onClick={generateByDensity}
              disabled={noteDensity <= 0}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors text-sm"
            >
              <Plus size={14} />
              生成音符
            </button>
            <button
              onClick={clearNotes}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-500 transition-colors text-sm"
            >
              <Trash2 size={14} />
              清空谱面
            </button>
          </div>

          <div className="mt-6 p-3 bg-slate-700/50 rounded text-xs text-slate-400">
            <p className="font-bold text-slate-300 mb-1">使用说明</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>点击轨道网格添加/删除音符</li>
              <li>音符会自动吸附到网格线</li>
              <li>播放时可预览音效</li>
              <li>支持导出/导入 JSON</li>
            </ul>
          </div>
        </aside>

        {/* 时间轴编辑区 */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* 时间轴标尺 */}
          <div className="h-8 bg-slate-800 border-b border-slate-700 relative overflow-hidden shrink-0">
            <div
              className="h-full relative"
              style={{ width: timelineWidth() }}
            >
              {gridLines().map((line, i) => {
                const x = timeToX(line.time);
                const beatNumber = Math.round(line.time / beatDuration) + 1;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex flex-col items-center"
                    style={{ left: x }}
                  >
                    {line.isBeat && (
                      <>
                        <div className="w-px h-full bg-slate-500" />
                        <span className="absolute top-1 text-[10px] text-slate-400 -translate-x-1/2">
                          {beatNumber}
                        </span>
                      </>
                    )}
                    {!line.isBeat && (
                      <div className="w-px h-3 bg-slate-600 mt-auto" />
                    )}
                  </div>
                );
              })}
              {/* 播放指针 */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500 z-10 pointer-events-none"
                style={{ left: timeToX(playbackTime) }}
              >
                <div className="w-2 h-2 bg-red-500 rounded-full -translate-x-1/2" />
              </div>
            </div>
          </div>

          {/* 轨道区域 */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto overflow-y-hidden relative"
          >
            <div
              className="h-full relative"
              style={{ width: timelineWidth() }}
            >
              {/* 网格背景 */}
              {gridLines().map((line, i) => (
                <div
                  key={i}
                  className={`absolute top-0 h-full w-px ${
                    line.isBeat ? 'bg-slate-600/60' : 'bg-slate-700/40'
                  }`}
                  style={{ left: timeToX(line.time) }}
                />
              ))}

              {/* 9 条轨道 */}
              <div className="absolute inset-0 flex">
                {LANE_LABELS.map((label, laneIndex) => (
                  <div
                    key={laneIndex}
                    className="flex-1 border-r border-slate-700/50 last:border-r-0 relative cursor-crosshair hover:bg-white/5 transition-colors group"
                    onClick={(e) => handleTimelineClick(e, laneIndex)}
                  >
                    {/* 轨道标签 */}
                    <div className="sticky left-0 top-0 z-20 bg-slate-800/90 px-2 py-1 text-xs font-bold text-slate-400 border-b border-slate-700">
                      {label}
                    </div>

                    {/* 该轨道上的音符 */}
                    {notes
                      .filter((n) => n.lane === laneIndex)
                      .map((note) => (
                        <div
                          key={note.id}
                          className={`absolute w-4 h-3/5 -translate-x-1/2 -translate-y-1/2 top-1/2 ${LANE_COLORS[laneIndex]} rounded shadow-lg cursor-pointer hover:brightness-125 transition-all ${
                            selectedNoteId === note.id
                              ? 'ring-2 ring-white'
                              : ''
                          }`}
                          style={{ left: timeToX(note.time) }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNoteId(
                              selectedNoteId === note.id ? null : note.id || null,
                            );
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            // 双击删除音符
                            setChart((prev) => ({
                              ...prev,
                              notes: prev.notes.filter((n) => n.id !== note.id),
                            }));
                          }}
                          title={`时间: ${(note.time / 1000).toFixed(2)}s | 双击删除`}
                        >
                          <div className="absolute inset-0 bg-white/20 rounded-sm" />
                        </div>
                      ))}
                  </div>
                ))}
              </div>

              {/* 播放指针（覆盖层） */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500/80 z-30 pointer-events-none"
                style={{ left: timeToX(playbackTime) }}
              />
            </div>
          </div>

          {/* 底部状态栏 */}
          <footer className="h-8 bg-slate-800 border-t border-slate-700 flex items-center px-4 text-xs text-slate-400 gap-6 shrink-0">
            <span>音符数: {notes.length}</span>
            <span>BPM: {metadata.bpm}</span>
            <span>
              时长:{' '}
              {notes.length > 0
                ? (notes[notes.length - 1].time / 1000).toFixed(1)
                : '0.0'}
              s
            </span>
            <span>
              播放位置: {(playbackTime / 1000).toFixed(2)}s
            </span>
            <div className="flex-1" />
            <span className="text-slate-500">点击网格添加音符 · 双击音符删除</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
