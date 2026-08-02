import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Home, Download, Upload, Play, Trash2, Wand2, Undo2, Redo2, ZoomIn, ZoomOut, Save, FilePlus } from 'lucide-react';
import type { Chart, DifficultyLevel } from '../types/chart';
import { TRACK_COUNT, DIFFICULTY_LEVELS } from '../types/chart';
import {
  emptyChart,
  msPerBeat,
  snapToGrid,
  validateChart,
  serializeChart,
  generateNotesByDensity,
  saveEditorDraft,
  saveChartToLibrary,
} from '../lib/chartUtils';
import { useHistory } from '../hooks/useHistory';
import { playChartAtom, editorChartAtom, editorResumeAtom } from '../atoms/rhythmAtoms';

/** 缩放：每毫秒对应的像素宽度的可选档位。值越大时间轴越"长"、间距越大。 */
const ZOOM_LEVELS = [0.06, 0.09, 0.12, 0.18, 0.28, 0.42, 0.6];
/** 默认缩放档位索引（对应 0.18）。 */
const DEFAULT_ZOOM_INDEX = 3;
/** 每条轨道（行）的最小像素高度。实际高度会随容器高度自适应，撑满可视区。 */
const MIN_TRACK_HEIGHT = 44;
/** 左侧行首键位标签列的宽度（像素）。 */
const LABEL_WIDTH = 56;
/** 轨道键位标签（自上而下对应轨道 0..8）。 */
const KEY_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/**
 * 可视化谱面编辑器页面（/editor）。
 *
 * 坐标系（本次调整）：
 * - X 轴 = 时间（从左到右递增），横向滚动。
 * - Y 轴 = 键盘轨道（9 行，自上而下对应 A S D F SPACE J K L ;）。
 *
 * 其它能力：撤销/重做、缩放、保存草稿、导入/导出 JSON、随机铺谱、播放预览。
 *
 * 布局要点：整页高度固定（h-svh + overflow-hidden），左侧参数面板与右侧时间轴
 * 各自独立滚动，横向滚动时间轴时不会带动左侧面板。
 */
export default function EditorPage() {
  const navigate = useNavigate();
  const setPlayChart = useSetAtom(playChartAtom);
  /** 跨路由保留的编辑器谱面（用于预览后返回时恢复）。 */
  const [persistedChart, setPersistedChart] = useAtom(editorChartAtom);
  /** "恢复上次内容"标志：仅预览往返时为 true。 */
  const [resume, setResume] = useAtom(editorResumeAtom);

  /**
   * 初始谱面：
   * - 若为预览往返（resume=true）且有内存副本，则恢复它，避免丢失预览前的编辑；
   * - 否则视为"新建"，呈现空白谱面（不再自动载入上次草稿/已保存内容）。
   * 用惰性初始化，仅在首次挂载时求值一次；随后消费并重置 resume 标志。
   */
  const initialChart = resume && persistedChart ? persistedChart : emptyChart();
  const {
    state: chart,
    set: setChart,
    undo,
    redo,
    reset: resetChart,
    canUndo,
    canRedo,
  } = useHistory<Chart>(() => initialChart);

  /**
   * "是否有未保存改动"标志。保存后清零；任何编辑（含新建/导入后再编辑）置为 true。
   * 用于返回主页时提示用户。
   */
  const [dirty, setDirty] = useState(false);

  /** 每拍细分数：1=整拍, 2=八分音符, 4=十六分音符。 */
  const [division, setDivision] = useState(2);
  /** 音符密度（0-1），用于"随机铺谱"。 */
  const [density, setDensity] = useState(0.5);
  /** 时间轴总时长（毫秒），决定可编辑区域宽度。 */
  const [timelineMs, setTimelineMs] = useState(16000);
  /** 缩放档位索引。 */
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  /** 当前每毫秒像素数。 */
  const pxPerMs = ZOOM_LEVELS[zoomIndex];
  /** 保存成功后的短暂提示。 */
  const [savedTip, setSavedTip] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 正在拖拽的音符在数组中的索引；null 表示未拖拽。 */
  const draggingIndex = useRef<number | null>(null);
  /** 本次拖拽是否已记录"拖拽前"的撤销点（保证一次拖拽只产生一个撤销点）。 */
  const dragRecorded = useRef(false);
  /** 拖拽是否真正产生了移动，用于在 pointerup 后抑制误触发的 click。 */
  const suppressClick = useRef(false);

  /**
   * 时间轴滚动容器的可视高度（像素），用于让 9 条轨道自适应撑满整个高度。
   * 通过 ResizeObserver 实时测量，窗口/布局变化时更新。
   */
  const [viewportHeight, setViewportHeight] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * 单条轨道行高：优先让 9 行铺满容器高度；若容器过矮则退回最小行高（可纵向滚动）。
   */
  const trackHeight = Math.max(MIN_TRACK_HEIGHT, Math.floor(viewportHeight / TRACK_COUNT));

  const { bpm, offset } = chart.metadata;

  // 首次挂载后消费 resume 标志：无论本次是否恢复，都重置为 false，
  // 使下一次从首页打开编辑器时默认为"新建"。
  useEffect(() => {
    if (resume) setResume(false);
    // 仅需运行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每当谱面变化，同步到跨路由内存副本（供预览后返回时恢复）。
  useEffect(() => {
    setPersistedChart(chart);
  }, [chart, setPersistedChart]);

  // 谱面内容变化即标记为"有未保存改动"。
  // 用"干净基线引用"比较判断：useHistory 在每次编辑后返回新的 chart 引用，
  // 未变化时引用保持不变。此法对 React StrictMode 的双调用天然安全。
  const cleanBaselineRef = useRef<Chart>(chart);
  useEffect(() => {
    setDirty(chart !== cleanBaselineRef.current);
  }, [chart]);

  // --- 元数据更新辅助（元数据变更也纳入撤销历史） ---
  const updateMeta = useCallback(
    (patch: Partial<Chart['metadata']>) => {
      setChart((c) => ({ ...c, metadata: { ...c.metadata, ...patch } }));
    },
    [setChart]
  );

  /** 将时间（毫秒）转换为 X 像素坐标。 */
  const timeToX = useCallback((time: number) => time * pxPerMs, [pxPerMs]);
  /** 将 X 像素坐标转换为时间（毫秒）。 */
  const xToTime = useCallback((x: number) => x / pxPerMs, [pxPerMs]);

  // --- 网格线：根据 bpm/offset/division 计算所有竖直网格线的时间点 ---
  const gridLines = useMemo(() => {
    const step = msPerBeat(bpm) / division;
    const lines: { time: number; isBeat: boolean }[] = [];
    for (let t = offset; t <= timelineMs; t += step) {
      const beatIndex = Math.round((t - offset) / (msPerBeat(bpm) / division));
      lines.push({ time: Math.round(t), isBeat: beatIndex % division === 0 });
    }
    return lines;
  }, [bpm, offset, division, timelineMs]);

  // --- 缩放控制 ---
  const zoomIn = useCallback(() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(0, i - 1)), []);

  /**
   * 由指针事件计算出 { time, track }。
   * grid 区域左侧留有 LABEL_WIDTH 的键位标签列，需扣除。
   */
  const eventToCell = useCallback(
    (clientX: number, clientY: number) => {
      const grid = gridRef.current!;
      const rect = grid.getBoundingClientRect();
      // X：扣除标签列宽度后即为时间轴内的像素偏移。
      const x = clientX - rect.left - LABEL_WIDTH;
      const rawTime = xToTime(Math.max(0, x));
      const time = snapToGrid(rawTime, bpm, offset, division);
      // Y：按行高定位轨道。
      const y = clientY - rect.top;
      const track = Math.min(TRACK_COUNT - 1, Math.max(0, Math.floor(y / trackHeight)));
      return { time, track };
    },
    [xToTime, bpm, offset, division, trackHeight]
  );

  /** 点击网格空白处：放置一个 tap 音符。 */
  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      const { time, track } = eventToCell(e.clientX, e.clientY);
      setChart((c) => {
        if (c.notes.some((n) => n.track === track && Math.abs(n.time - time) < 5)) {
          return c;
        }
        const next = [...c.notes, { time, track, type: 'tap' as const }];
        next.sort((a, b) => a.time - b.time);
        return { ...c, notes: next };
      });
    },
    [eventToCell, setChart]
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
  const handleNotePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    draggingIndex.current = index;
    dragRecorded.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingIndex.current === null) return;
      const idx = draggingIndex.current;
      suppressClick.current = true;
      const { time, track } = eventToCell(e.clientX, e.clientY);

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
    [eventToCell, setChart]
  );

  const handleGridPointerUp = useCallback(() => {
    if (draggingIndex.current !== null) {
      setChart((c) => ({ ...c, notes: [...c.notes].sort((a, b) => a.time - b.time) }), true);
      draggingIndex.current = null;
    }
  }, [setChart]);

  // --- 键盘快捷键：撤销 / 重做 ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  // --- 保存草稿到 localStorage + 保存到"我的谱面"库（首页可见） ---
  const handleSave = useCallback(() => {
    const ok = saveEditorDraft(chart);
    // 同时写入谱面库，使其出现在首页"我的谱面"中，可直接游玩。
    saveChartToLibrary(chart);
    if (ok) {
      cleanBaselineRef.current = chart; // 当前内容成为新的"干净基线"。
      setDirty(false); // 已保存，清除未保存标记。
      setSavedTip(true);
      window.setTimeout(() => setSavedTip(false), 1500);
    } else {
      alert('保存失败：本地存储空间可能已满。');
    }
  }, [chart]);

  // --- 新建：清空当前编辑内容，重置为空白谱面 ---
  const handleNew = useCallback(() => {
    // 有未保存改动时先确认，避免误清空。
    if (dirty && !confirm('当前谱面有未保存的修改，确定要新建并放弃这些修改吗？')) {
      return;
    }
    const blank = emptyChart();
    cleanBaselineRef.current = blank; // 新建后即为干净状态。
    resetChart(blank);
    setTimelineMs(16000);
    setDirty(false);
  }, [dirty, resetChart]);

  // --- 返回主页：有未保存改动时提示 ---
  const handleBackHome = useCallback(() => {
    if (dirty && !confirm('当前谱面有未保存的修改，确定要离开吗？未保存的内容将丢失。')) {
      return;
    }
    navigate('/');
  }, [dirty, navigate]);

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
          resetChart(validated);
          const maxTime = validated.notes.reduce((m, n) => Math.max(m, n.time), 0);
          setTimelineMs(Math.max(16000, maxTime + 4000));
        } catch (err) {
          alert(`导入失败：${err instanceof Error ? err.message : '未知错误'}`);
        }
      };
      reader.readAsText(file);
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
    // 标记为预览往返，返回编辑器时恢复当前内容。
    setResume(true);
    navigate('/play');
  }, [chart, navigate, setPlayChart, setResume]);

  // 时间轴总像素宽度（含左侧标签列）。
  const gridWidth = LABEL_WIDTH + timeToX(timelineMs) + 40;

  return (
    <div className="h-svh bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleBackHome} className="p-2 text-white/60 hover:text-white" title="返回主页">
            <Home size={20} />
          </button>
          <h1 className="text-lg font-bold">谱面编辑器</h1>
          {dirty && <span className="text-xs text-amber-300" title="有未保存的修改">● 未保存</span>}
          {savedTip && <span className="text-xs text-emerald-300">已保存 ✓</span>}
        </div>
        <div className="flex items-center gap-2">
          <ToolButton onClick={undo} icon={<Undo2 size={16} />} label="撤销" disabled={!canUndo} title="撤销 (Ctrl/Cmd+Z)" />
          <ToolButton onClick={redo} icon={<Redo2 size={16} />} label="重做" disabled={!canRedo} title="重做 (Ctrl/Cmd+Shift+Z)" />
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton onClick={handleNew} icon={<FilePlus size={16} />} label="新建" title="新建空白谱面" />
          <ToolButton onClick={handleSave} icon={<Save size={16} />} label="保存" title="保存草稿到本地" />
          <ToolButton onClick={() => fileInputRef.current?.click()} icon={<Upload size={16} />} label="导入" />
          <ToolButton onClick={handleExport} icon={<Download size={16} />} label="导出" />
          <ToolButton onClick={handleGenerate} icon={<Wand2 size={16} />} label="随机铺谱" />
          <ToolButton onClick={handleClear} icon={<Trash2 size={16} />} label="清空" />
          <ToolButton onClick={handlePreview} icon={<Play size={16} />} label="播放预览" primary />
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 左侧控制面板：独立滚动，不受时间轴横向滚动影响 */}
        <aside className="w-72 shrink-0 bg-black/20 p-4 overflow-y-auto space-y-4">
          <Field label="标题">
            <input className="editor-input" value={chart.metadata.title} onChange={(e) => updateMeta({ title: e.target.value })} />
          </Field>
          <Field label="作者">
            <input className="editor-input" value={chart.metadata.author} onChange={(e) => updateMeta({ author: e.target.value })} />
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
            X 轴为时间（横向滚动），Y 轴为键盘轨道。
            <br />
            点击空白添加音符，点击音符删除，拖拽音符可移动（自动吸附网格）。
            <br />
            撤销/重做：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z。
          </div>
        </aside>

        {/* 右侧时间轴编辑区：横向 + 纵向独立滚动 */}
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto">
          <div
            ref={gridRef}
            className="relative"
            style={{ width: gridWidth, height: TRACK_COUNT * trackHeight }}
            onClick={handleGridClick}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
          >
            {/* 轨道行（水平条纹）+ 行首键位标签 */}
            {Array.from({ length: TRACK_COUNT }).map((_, track) => (
              <div
                key={track}
                className={`absolute left-0 right-0 flex items-center border-b border-white/5 ${
                  track === 4 ? 'bg-white/[0.05]' : track % 2 === 0 ? 'bg-white/[0.02]' : ''
                }`}
                style={{ top: track * trackHeight, height: trackHeight }}
              >
                {/* 行首键位标签（sticky 固定在左侧，横向滚动时始终可见） */}
                <div
                  className="sticky left-0 z-10 h-full flex items-center justify-center text-sm font-black text-white/60 bg-slate-900/90 border-r border-white/10"
                  style={{ width: LABEL_WIDTH }}
                >
                  {KEY_LABELS[track]}
                </div>
              </div>
            ))}

            {/* 竖直网格线（时间线），从标签列右侧开始绘制 */}
            {gridLines.map((line, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 ${line.isBeat ? 'bg-white/20' : 'bg-white/[0.06]'}`}
                style={{ left: LABEL_WIDTH + timeToX(line.time), width: line.isBeat ? 2 : 1 }}
              />
            ))}

            {/* 音符 */}
            {chart.notes.map((note, index) => (
              <div
                key={index}
                onClick={(e) => handleNoteClick(index, e)}
                onPointerDown={(e) => handleNotePointerDown(index, e)}
                className="absolute w-3 rounded bg-emerald-400 hover:bg-emerald-300 shadow shadow-emerald-400/40 cursor-grab active:cursor-grabbing"
                style={{
                  left: LABEL_WIDTH + timeToX(note.time) - 6,
                  top: note.track * trackHeight + 6,
                  height: trackHeight - 12,
                }}
                title={`t=${note.time}ms, track=${note.track}`}
              />
            ))}
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
