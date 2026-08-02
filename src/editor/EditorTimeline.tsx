/**
 * 谱面编辑器的时间轴组件（核心交互区）。
 * 功能：
 * - 9 条轨道 + 节拍对齐网格（小节线 / 拍线 / 细分线三级样式）；
 * - 左键点击空白处放置音符（自动吸附到节拍网格），按住可拖拽调整时间/轨道；
 * - 左键拖动已有音符进行移动，右键删除，Delete 键删除选中音符；
 * - 左侧标尺：显示小节号，点击可将播放头跳转到对应位置；
 * - 播放预览：播放头前进 + 节拍器滴答 + 音符经过时发声 + 自动滚动跟随。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  editorMetadataAtom,
  editorNotesAtom,
  editorNoteTypeAtom,
  editorHoldBeatsAtom,
  editorSnapDivisionAtom,
  editorZoomAtom,
  editorPlayheadMsAtom,
  editorIsPlayingAtom,
  editorSelectedNoteIdAtom,
} from '../atoms/editorAtoms';
import { chartDurationMs, makeNoteId, msPerBeat, snapTimeToGrid } from '../lib/chart';
import { audioManager } from '../lib/audio';
import { LANE_COUNT, type ChartNote } from '../types/chart';

/** 基准像素密度：缩放倍率为 1 时，1 毫秒 = 0.12px（120 BPM 下 1 拍 ≈ 60px） */
const BASE_PX_PER_MS = 0.12;
/** 左侧小节标尺宽度（px） */
const RULER_WIDTH = 56;
/** 一个小节的拍数（4/4 拍） */
const BEATS_PER_MEASURE = 4;

/** 拖拽中的音符信息（新建音符按下后立即进入拖拽，松手完成放置） */
interface DragState {
  noteId: string;
}

function EditorTimeline() {
  const metadata = useAtomValue(editorMetadataAtom);
  const [notes, setNotes] = useAtom(editorNotesAtom);
  const noteType = useAtomValue(editorNoteTypeAtom);
  const holdBeats = useAtomValue(editorHoldBeatsAtom);
  const snapDivision = useAtomValue(editorSnapDivisionAtom);
  const zoom = useAtomValue(editorZoomAtom);
  const [playheadMs, setPlayheadMs] = useAtom(editorPlayheadMsAtom);
  const [isPlaying, setIsPlaying] = useAtom(editorIsPlayingAtom);
  const [selectedNoteId, setSelectedNoteId] = useAtom(editorSelectedNoteIdAtom);

  const scrollRef = useRef<HTMLDivElement>(null); // 滚动容器
  const gridRef = useRef<HTMLDivElement>(null); // 网格内容区（坐标换算基准）
  const [drag, setDrag] = useState<DragState | null>(null);

  // 播放预览用的进度追踪 ref（避免每帧重建闭包）
  const nextNoteIndexRef = useRef(0); // 下一个待发声的音符下标
  const nextBeatTimeRef = useRef(0); // 下一个节拍器滴答时间
  const beatCountRef = useRef(0); // 已过拍数（判断强拍）

  const pxPerMs = BASE_PX_PER_MS * zoom;
  const beatMs = msPerBeat(metadata.bpm);

  /**
   * 时间轴总时长：取「谱面实际时长」与「32 小节保底」的较大值，
   * 保证空谱面也有足够的编辑空间。
   */
  const totalMs = useMemo(() => {
    const chartMs = chartDurationMs({ metadata, notes });
    const minMs = Math.max(0, metadata.offset) + 32 * BEATS_PER_MEASURE * beatMs;
    return Math.max(chartMs, minMs);
  }, [metadata, notes, beatMs]);

  const contentHeight = Math.ceil(totalMs * pxPerMs);

  /**
   * 生成节拍网格线：从 offset 开始，每格 = 1拍 / 吸附精度。
   * 三级样式：小节线（每 4 拍，最亮）/ 拍线（中等）/ 细分线（最暗）。
   */
  const gridLines = useMemo(() => {
    const step = beatMs / snapDivision;
    const lines: { time: number; kind: 'measure' | 'beat' | 'sub'; measure: number }[] = [];
    // 从第一个非负网格点开始
    const startK = Math.max(0, Math.ceil((0 - metadata.offset) / step));
    for (let k = startK; ; k++) {
      const time = metadata.offset + k * step;
      if (time > totalMs) break;
      const isMeasure = k % (BEATS_PER_MEASURE * snapDivision) === 0;
      const isBeat = k % snapDivision === 0;
      lines.push({
        time,
        kind: isMeasure ? 'measure' : isBeat ? 'beat' : 'sub',
        measure: Math.floor(k / (BEATS_PER_MEASURE * snapDivision)) + 1,
      });
    }
    return lines;
  }, [beatMs, snapDivision, metadata.offset, totalMs]);

  /** 将鼠标事件坐标换算为「轨道 + 未吸附时间」 */
  const getLaneAndTime = useCallback(
    (clientX: number, clientY: number) => {
      const grid = gridRef.current;
      if (!grid) return null;
      const rect = grid.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const lane = Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((x / rect.width) * LANE_COUNT)));
      const timeMs = Math.max(0, y / pxPerMs);
      return { lane, timeMs };
    },
    [pxPerMs],
  );

  /** 更新指定音符的时间与轨道（吸附后保持数组有序） */
  const moveNote = useCallback(
    (noteId: string, lane: number, rawTimeMs: number) => {
      const time = snapTimeToGrid(rawTimeMs, metadata.bpm, metadata.offset, snapDivision);
      setNotes((prev) =>
        prev
          .map((n) => (n.id === noteId ? { ...n, lane, time } : n))
          .sort((a, b) => a.time - b.time),
      );
    },
    [metadata.bpm, metadata.offset, snapDivision, setNotes],
  );

  /** 网格按下：命中音符 → 选中并拖拽；空白 → 新建音符并进入拖拽放置 */
  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键，右键走 onContextMenu 删除
    const pos = getLaneAndTime(e.clientX, e.clientY);
    if (!pos) return;

    // 通过 DOM 的 data-note-id 判断是否命中了已有音符
    const noteEl = (e.target as HTMLElement).closest('[data-note-id]') as HTMLElement | null;
    if (noteEl) {
      const noteId = noteEl.dataset.noteId!;
      setSelectedNoteId(noteId);
      setDrag({ noteId });
      return;
    }

    // 空白处：创建新音符（tap 或 hold，hold 长度 = holdBeats 拍）
    const time = snapTimeToGrid(pos.timeMs, metadata.bpm, metadata.offset, snapDivision);
    const newNote: ChartNote = {
      id: makeNoteId(),
      time,
      lane: pos.lane,
      type: noteType,
      duration: noteType === 'hold' ? Math.round(holdBeats * beatMs) : 0,
    };
    setNotes((prev) => [...prev, newNote].sort((a, b) => a.time - b.time));
    setSelectedNoteId(newNote.id);
    setDrag({ noteId: newNote.id });
  };

  /** 右键删除音符 */
  const handleContextMenu = (e: React.MouseEvent) => {
    const noteEl = (e.target as HTMLElement).closest('[data-note-id]') as HTMLElement | null;
    if (noteEl) {
      e.preventDefault();
      const noteId = noteEl.dataset.noteId!;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedNoteId === noteId) setSelectedNoteId(null);
    }
  };

  // 拖拽移动 / 松手结束（监听 window，允许拖出网格区域）
  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      const pos = getLaneAndTime(e.clientX, e.clientY);
      if (pos) moveNote(drag.noteId, pos.lane, pos.timeMs);
    };
    const handleUp = () => setDrag(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [drag, getLaneAndTime, moveNote]);

  // Delete / Backspace 删除选中音符（输入框聚焦时不拦截）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (selectedNoteId) {
        e.preventDefault();
        setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId));
        setSelectedNoteId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNoteId, setNotes, setSelectedNoteId]);

  /** 标尺点击：跳转播放头（不吸附，精确到毫秒） */
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    const ruler = e.currentTarget as HTMLElement;
    const rect = ruler.getBoundingClientRect();
    const timeMs = Math.min(totalMs, Math.max(0, (e.clientY - rect.top) / pxPerMs));
    setPlayheadMs(Math.round(timeMs));
  };

  /**
   * 播放预览主循环（rAF）：
   * 播放头随真实时间前进；每经过一拍播放节拍器（每小节首拍强音），
   * 每经过一个音符播放对应轨道音色；播放时自动滚动让播放头保持在视口 60% 处。
   */
  useEffect(() => {
    if (!isPlaying) return;

    // 初始化进度指针：从当前播放头位置继续（支持暂停后续播）
    nextNoteIndexRef.current = notes.findIndex((n) => n.time > playheadMs);
    if (nextNoteIndexRef.current === -1) nextNoteIndexRef.current = notes.length;
    const k0 = Math.ceil((playheadMs - metadata.offset) / beatMs);
    nextBeatTimeRef.current = metadata.offset + Math.max(0, k0) * beatMs;
    beatCountRef.current = Math.max(0, k0);

    let rafId = 0;
    let lastTs = performance.now();
    let current = playheadMs;

    const tick = (now: number) => {
      const dt = now - lastTs;
      lastTs = now;
      current += dt;

      // 节拍器：越过节拍点时发声（每 4 拍一个强拍）
      while (nextBeatTimeRef.current <= current && nextBeatTimeRef.current <= totalMs) {
        audioManager.playTick(beatCountRef.current % BEATS_PER_MEASURE === 0);
        beatCountRef.current += 1;
        nextBeatTimeRef.current += beatMs;
      }
      // 音符发声：播放头越过音符时间即播放对应轨道音色；
      // hold 长条音符按其 duration 持续发声，tap 单点短促发声
      while (nextNoteIndexRef.current < notes.length && notes[nextNoteIndexRef.current].time <= current) {
        const note = notes[nextNoteIndexRef.current];
        audioManager.playLaneNote(note.lane, note.type === 'hold' ? note.duration : undefined);
        nextNoteIndexRef.current += 1;
      }

      setPlayheadMs(Math.round(current));

      // 自动滚动跟随播放头
      const container = scrollRef.current;
      if (container) {
        container.scrollTop = current * pxPerMs - container.clientHeight * 0.6;
      }

      // 播到结尾自动停止
      if (current >= totalMs) {
        setIsPlaying(false);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // 故意只在播放状态变化时启动/停止循环；notes 等通过 ref 下标按序消费，无需入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  /** 播放头时间格式化（m:ss.d） */
  const formatTime = (ms: number) => {
    const totalSec = ms / 1000;
    const m = Math.floor(totalSec / 60);
    const s = (totalSec % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  };

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto bg-slate-950 select-none">
      <div className="relative" style={{ height: contentHeight }}>
        {/* ===== 左侧小节标尺（点击跳转播放头） ===== */}
        <div
          className="absolute left-0 top-0 h-full border-r border-white/20 bg-slate-900/80 cursor-pointer z-10"
          style={{ width: RULER_WIDTH }}
          onMouseDown={handleRulerMouseDown}
          title="点击跳转播放头"
        >
          {gridLines
            .filter((l) => l.kind === 'measure')
            .map((l) => (
              <div
                key={l.time}
                className="absolute left-1 text-[10px] font-bold text-white/50"
                style={{ top: l.time * pxPerMs - 6 }}
              >
                {l.measure}
              </div>
            ))}
        </div>

        {/* ===== 网格编辑区 ===== */}
        <div
          ref={gridRef}
          className="absolute top-0 h-full cursor-crosshair"
          style={{ left: RULER_WIDTH, right: 0 }}
          onMouseDown={handleGridMouseDown}
          onContextMenu={handleContextMenu}
        >
          {/* 轨道背景（斑马纹 + 分隔线） */}
          {Array.from({ length: LANE_COUNT }).map((_, lane) => (
            <div
              key={lane}
              className={`absolute top-0 h-full border-r border-white/10 ${
                lane % 2 === 0 ? 'bg-white/[0.03]' : ''
              }`}
              style={{ left: `${(lane / LANE_COUNT) * 100}%`, width: `${100 / LANE_COUNT}%` }}
            />
          ))}

          {/* 节拍网格线 */}
          {gridLines.map((l) => (
            <div
              key={l.time}
              className={`absolute left-0 right-0 pointer-events-none ${
                l.kind === 'measure'
                  ? 'h-[2px] bg-white/40'
                  : l.kind === 'beat'
                    ? 'h-px bg-white/20'
                    : 'h-px bg-white/[0.07]'
              }`}
              style={{ top: l.time * pxPerMs }}
            />
          ))}

          {/* 音符块 */}
          {notes.map((note) => {
            const isSelected = note.id === selectedNoteId;
            const laneWidth = 100 / LANE_COUNT;
            return (
              <div
                key={note.id}
                data-note-id={note.id}
                className={`absolute rounded-sm cursor-grab active:cursor-grabbing ${
                  note.type === 'hold'
                    ? 'bg-cyan-400/80'
                    : 'bg-emerald-400/90'
                } ${isSelected ? 'ring-2 ring-yellow-300 z-[5]' : ''}`}
                style={{
                  left: `${note.lane * laneWidth + 0.5}%`,
                  width: `${laneWidth - 1}%`,
                  top: note.time * pxPerMs,
                  // hold 音符高度覆盖整个持续时长；tap 固定 10px
                  height: note.type === 'hold' ? Math.max(10, note.duration * pxPerMs) : 10,
                }}
                title={`${note.type} @ ${note.time}ms · 轨道 ${note.lane + 1}`}
              />
            );
          })}

          {/* 播放头红线 */}
          <div
            className="absolute left-0 right-0 h-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] pointer-events-none z-[6]"
            style={{ top: playheadMs * pxPerMs }}
          />
        </div>
      </div>

      {/* 底部悬浮时间显示 */}
      <div className="sticky bottom-2 left-2 inline-block rounded bg-black/60 px-2 py-1 text-xs font-bold text-white/80 z-10">
        {formatTime(playheadMs)} / {formatTime(totalMs)}
      </div>
    </div>
  );
}

export default EditorTimeline;
