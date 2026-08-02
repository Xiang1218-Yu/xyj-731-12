import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Home, Download, Upload, Play, Trash2, Wand2, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react';
import type { Chart, DifficultyLevel } from '../types/chart';
import { TRACK_COUNT, DIFFICULTY_LEVELS } from '../types/chart';
import {
  emptyChart,
  msPerBeat,
  snapToGrid,
  validateChart,
  serializeChart,
  generateNotesByDensity,
} from '../lib/chartUtils';
import { useHistory } from '../hooks/useHistory';
import { playChartAtom } from '../atoms/rhythmAtoms';

/** 缩放：每毫秒对应的像素高度的可选档位。值越大时间轴越"长"、间距越大。 */
const ZOOM_LEVELS = [0.06, 0.09, 0.12, 0.18, 0.28, 0.42, 0.6];
/** 默认缩放档位索引（对应 0.18，与旧版一致）。 */
const DEFAULT_ZOOM_INDEX = 3;
/** 轨道键位标签。 */
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SP', 'J', 'K', 'L', ';'];

/**
 * 可视化谱面编辑器页面（/editor）。
 *
 * 功能：
 * - 在纵向时间轴上点击放置 / 拖拽移动 / 点击删除音符；
 * - 撤销 / 重做（Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z，或工具栏按钮）；
 * - 时间轴缩放（放大/缩小），改善长谱面编辑体验；
 * - 设置 BPM、偏移量、音符密度、每拍细分（节拍对齐网格）；
 * - 导入 / 导出 JSON 格式谱面文件（含元数据 + 音符序列）；
 * - "播放预览"跳转到 /play 使用节奏引擎试玩当前谱面。
 *
 * 时间自上而下流动：y=0 对应 time=offset 起点，越往下时间越大。
 */
export default function EditorPage() {
  const navigate = useNavigate();
  const setPlayChart = useSetAtom(playChartAtom);

  /**
   * 当前正在编辑的谱面，改为使用带撤销/重做历史的状态管理。
   * chart 为当前值，setChart 提交新值（默认产生一个撤销点）。
   */
  const {
    state: chart,
    set: setChart,
    undo,
    redo,
    reset: resetChart,
    canUndo,
    canRedo,
  } = useHistory<Chart>(emptyChart());

  /** 每拍细分数：1=整拍, 2=八分音符, 4=十六分音符。 */
  const [division, setDivision] = useState(2);
  /** 音符密度（0-1），用于"随机铺谱"。 */
  const [density, setDensity] = useState(0.5);
  /** 时间轴总时长（毫秒），决定可编辑区域高度。 */
  const [timelineMs, setTimelineMs] = useState(16000);
  /** 缩放档位索引。 */
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  /** 当前每毫秒像素数。 */
  const pxPerMs = ZOOM_LEVELS[zoomIndex];

  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 正在拖拽的音符在数组中的索引；null 表示未拖拽。 */
  const draggingIndex = useRef<number | null>(null);
  /** 本次拖拽是否已记录"拖拽前"的撤销点（保证一次拖拽只产生一个撤销点）。 */
  const dragRecorded = useRef(false);
  /** 拖拽是否真正产生了移动，用于在 pointerup 后抑制误触发的 click。 */
  const suppressClick = useRef(false);

  const { bpm, offset } = chart.metadata;

  // --- 元数据更新辅助（元数据变更也纳入撤销历史） ---
  const updateMeta = useCallback(
    (patch: Partial<Chart['metadata']>) => {
      setChart((c) => ({ ...c, metadata: { ...c.metadata, ...patch } }));
    },
    [setChart]
  );

  // --- 网格线：根据 bpm/offset/division 计算所有需要绘制的横向网格线时间点 ---
  const gridLines = useMemo(() => {
    const step = msPerBeat(bpm) / division;
    const lines: { time: number; isBeat: boolean }[] = [];
    for (let t = offset; t <= timelineMs; t += step) {
      // 是否为整拍线（用于加粗显示）
      const beatIndex = Math.round((t - offset) / (msPerBeat(bpm) / division));
      lines.push({ time: Math.round(t), isBeat: beatIndex % division === 0 });
    }
    return lines;
  }, [bpm, offset, division, timelineMs]);

  /** 将像素 y 坐标转换为时间（毫秒）。 */
  const yToTime = useCallback((y: number) => y / pxPerMs, [pxPerMs]);
  /** 将时间转换为像素 y 坐标。 */
  const timeToY = useCallback((time: number) => time * pxPerMs, [pxPerMs]);

  // --- 缩放控制 ---
  const zoomIn = useCallback(() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(0, i - 1)), []);

  /** 点击轨道空白处：在吸附网格后的时间点放置一个 tap 音符。 */
  const handleTrackClick = useCallback(
    (track: number, e: React.MouseEvent<HTMLDivElement>) => {
      // 若刚结束拖拽，忽略这次 click（避免拖拽后误建音符）。
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top + (timelineRef.current?.scrollTop ?? 0);
      const rawTime = yToTime(y);
      const time = snapToGrid(rawTime, bpm, offset, division);
      setChart((c) => {
        // 若同轨道同时间已有音符则不重复添加。
        if (c.notes.some((n) => n.track === track && Math.abs(n.time - time) < 5)) {
          return c;
        }
        const next = [...c.notes, { time, track, type: 'tap' as const }];
        next.sort((a, b) => a.time - b.time);
        return { ...c, notes: next };
      });
    },
    [bpm, offset, division, yToTime, setChart]
  );

  /** 点击音符：删除它。 */
  const handleNoteClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      setChart((c) => ({ ...c, notes: c.notes.filter((_, i) => i !== index) }));
    },
    [setChart]
  );

  // --- 拖拽移动音符 ---
  const handleNotePointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.stopPropagation();
      draggingIndex.current = index;
      dragRecorded.current = false; // 本次拖拽尚未记录撤销点。
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleTimelinePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingIndex.current === null || !timelineRef.current) return;
      const idx = draggingIndex.current;
      // 一旦发生移动，标记抑制随后的 click。
      suppressClick.current = true;
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollTop = timelineRef.current.scrollTop;
      const y = e.clientY - rect.top + scrollTop;
      const time = snapToGrid(yToTime(y), bpm, offset, division);

      // 根据 x 定位轨道列。
      const x = e.clientX - rect.left;
      const trackWidth = rect.width / TRACK_COUNT;
      const track = Math.min(TRACK_COUNT - 1, Math.max(0, Math.floor(x / trackWidth)));

      // 第一次移动记录撤销点（coalesce=false），之后的移动合并（coalesce=true），
      // 从而"一次拖拽 = 一个撤销点"。
      const coalesce = dragRecorded.current;
      dragRecorded.current = true;
      setChart((c) => {
        const notes = [...c.notes];
        if (!notes[idx]) return c;
        if (notes[idx].time === time && notes[idx].track === track) return c;
        notes[idx] = { ...notes[idx], time, track };
        return { ...c, notes };
      }, coalesce);
    },
    [bpm, offset, division, yToTime, setChart]
  );

  const handleTimelinePointerUp = useCallback(() => {
    if (draggingIndex.current !== null) {
      // 拖拽结束后重新排序（合并进当前撤销点，不新增）。
      setChart((c) => ({ ...c, notes: [...c.notes].sort((a, b) => a.time - b.time) }), true);
      draggingIndex.current = null;
    }
  }, [setChart]);

  // --- 键盘快捷键：撤销 / 重做 ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 在输入框内编辑文本时不拦截。
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // --- 导出 JSON ---
  const handleExport = useCallback(() => {
    const json = serializeChart(chart);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chart.metadata.title || 'chart'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chart]);

  // --- 导入 JSON ---
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const validated = validateChart(parsed);
          // 导入是一次全新的编辑起点，清空撤销/重做历史。
          resetChart(validated);
          // 导入后自动扩展时间轴以覆盖所有音符。
          const maxTime = validated.notes.reduce((m, n) => Math.max(m, n.time), 0);
          setTimelineMs(Math.max(16000, maxTime + 4000));
        } catch (err) {
          alert(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
        }
      };
      reader.readAsText(file);
      // 重置 input 以便同一文件可再次选择。
      e.target.value = '';
    },
    [resetChart]
  );

  // --- 随机铺谱（按密度生成） ---
  const handleGenerate = useCallback(() => {
    const notes = generateNotesByDensity(bpm, offset, timelineMs, density, division);
    setChart((c) => ({ ...c, notes }));
  }, [bpm, offset, timelineMs, density, division, setChart]);

  // --- 清空音符 ---
  const handleClear = useCallback(() => {
    if (chart.notes.length === 0) return;
    if (confirm('确定清空所有音符？（可通过撤销恢复）')) {
      setChart((c) => ({ ...c, notes: [] }));
    }
  }, [chart.notes.length, setChart]);

  // --- 播放预览 ---
  const handlePreview = useCallback(() => {
    setPlayChart(chart);
    navigate('/play');
  }, [chart, navigate, setPlayChart]);

  return (
    <div className="min-h-svh bg-slate-900 text-white flex flex-col">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 text-white/60 hover:text-white" title="返回主页">
            <Home size={20} />
          </button>
          <h1 className="text-lg font-bold">谱面编辑器</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 撤销 / 重做 */}
          <ToolButton onClick={undo} icon={<Undo2 size={16} />} label="撤销" disabled={!canUndo} title="撤销 (Ctrl/Cmd+Z)" />
          <ToolButton onClick={redo} icon={<Redo2 size={16} />} label="重做" disabled={!canRedo} title="重做 (Ctrl/Cmd+Shift+Z)" />
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton onClick={() => fileInputRef.current?.click()} icon={<Upload size={16} />} label="导入" />
          <ToolButton onClick={handleExport} icon={<Download size={16} />} label="导出" />
          <ToolButton onClick={handleGenerate} icon={<Wand2 size={16} />} label="随机铺谱" />
          <ToolButton onClick={handleClear} icon={<Trash2 size={16} />} label="清空" />
          <ToolButton onClick={handlePreview} icon={<Play size={16} />} label="播放预览" primary />
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧控制面板 */}
        <aside className="w-72 shrink-0 bg-black/20 p-4 overflow-y-auto space-y-4">
          <Field label="标题">
            <input
              className="editor-input"
              value={chart.metadata.title}
              onChange={(e) => updateMeta({ title: e.target.value })}
            />
          </Field>
          <Field label="作者">
            <input
              className="editor-input"
              value={chart.metadata.author}
              onChange={(e) => updateMeta({ author: e.target.value })}
            />
          </Field>
          <Field label="难度">
            <select
              className="editor-input"
              value={chart.metadata.difficulty}
              onChange={(e) => updateMeta({ difficulty: e.target.value as DifficultyLevel })}
            >
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`BPM：${bpm}`}>
            <input
              type="number"
              min={30}
              max={400}
              className="editor-input"
              value={bpm}
              onChange={(e) => updateMeta({ bpm: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label={`偏移量（ms）：${offset}`}>
            <input
              type="number"
              className="editor-input"
              value={offset}
              onChange={(e) => updateMeta({ offset: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label={`节拍细分：1/${division}`}>
            <div className="flex gap-2">
              {[1, 2, 4].map((d) => (
                <button
                  key={d}
                  onClick={() => setDivision(d)}
                  className={`flex-1 py-1 rounded text-sm font-bold ${
                    division === d ? 'bg-emerald-500' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  1/{d}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`音符密度：${(density * 100).toFixed(0)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label={`时间轴长度（ms）：${timelineMs}`}>
            <input
              type="number"
              min={4000}
              step={1000}
              className="editor-input"
              value={timelineMs}
              onChange={(e) => setTimelineMs(Math.max(4000, Number(e.target.value) || 4000))}
            />
          </Field>

          {/* 缩放控制 */}
          <Field label={`缩放：${pxPerMs.toFixed(2)} px/ms`}>
            <div className="flex items-center gap-2">
              <button
                onClick={zoomOut}
                disabled={zoomIndex === 0}
                className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-30"
                title="缩小"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-xs text-white/60 w-12 text-center">
                {zoomIndex + 1}/{ZOOM_LEVELS.length}
              </span>
              <button
                onClick={zoomIn}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-30"
                title="放大"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </Field>

          <div className="text-xs text-white/50 border-t border-white/10 pt-3 leading-relaxed">
            音符数：{chart.notes.length}
            <br />
            点击轨道空白处添加音符，点击音符删除，按住音符可拖拽移动（自动吸附网格）。
            <br />
            撤销/重做：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z。
          </div>
        </aside>

        {/* 右侧时间轴编辑区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 轨道头部键位标签 */}
          <div className="flex border-b border-white/10 bg-black/20">
            {KEY_LABELS.map((label, i) => (
              <div
                key={i}
                className={`flex-1 text-center py-2 text-sm font-black text-white/50 ${
                  i === 4 ? 'bg-white/[0.04]' : ''
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 可滚动时间轴 */}
          <div ref={timelineRef} className="flex-1 overflow-y-auto relative">
            <div
              className="relative flex"
              style={{ height: timeToY(timelineMs) + 40 }}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
            >
              {/* 网格线 */}
              {gridLines.map((line, i) => (
                <div
                  key={i}
                  className={`absolute left-0 right-0 ${line.isBeat ? 'bg-white/20' : 'bg-white/[0.06]'}`}
                  style={{ top: timeToY(line.time), height: line.isBeat ? 2 : 1 }}
                />
              ))}

              {/* 轨道列 */}
              {Array.from({ length: TRACK_COUNT }).map((_, track) => (
                <div
                  key={track}
                  className={`flex-1 relative border-r border-white/5 cursor-pointer ${
                    track === 4 ? 'bg-white/[0.02]' : ''
                  }`}
                  onClick={(e) => handleTrackClick(track, e)}
                >
                  {/* 属于该轨道的音符 */}
                  {chart.notes.map((note, index) =>
                    note.track === track ? (
                      <div
                        key={index}
                        onClick={(e) => handleNoteClick(index, e)}
                        onPointerDown={(e) => handleNotePointerDown(index, e)}
                        className="absolute left-1/2 -translate-x-1/2 h-3 rounded bg-emerald-400 hover:bg-emerald-300 shadow shadow-emerald-400/40 cursor-grab active:cursor-grabbing"
                        style={{ top: timeToY(note.time) - 6, width: '75%' }}
                        title={`t=${note.time}ms, track=${track}`}
                      />
                    ) : null
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 左侧表单字段容器。 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/60 mb-1">{label}</span>
      {children}
    </label>
  );
}

/** 工具栏按钮。 */
function ToolButton({
  onClick,
  icon,
  label,
  primary,
  disabled,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        primary ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
