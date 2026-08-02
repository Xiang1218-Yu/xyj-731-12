/**
 * EditorTimeline —— 可视化时间轴编辑区。
 *
 * 布局：
 *  - 纵向：9 条轨道（A S D F Space J K L ;）；
 *  - 横向：时间（秒），根据 BPM 绘制节拍对齐网格；
 *  - 每个音符是一个色块，tap 为方块、hold 为长条。
 *
 * 交互：
 *  - 在空白网格上按下鼠标 = 放置音符（吸附到网格）；
 *  - 在已有音符上按下并拖动 = 改变其时间（横向）/轨道（纵向）；
 *  - 按住拖动 hold 音符右边缘 = 调整持续时长；
 *  - 右键 / 双击音符 = 删除；
 *  - 底部滚动条控制水平滚动，缩放控制时间刻度。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Chart, ChartNote, Lane, NoteType } from '../types/chart';
import { LANE_COUNT } from '../types/chart';
import { beatDuration, formatTime, snapTime } from '../lib/timeline';
import { triggerLaneNote, initRhythmAudio } from '../lib/rhythmAudio';

interface Props {
  chart: Chart;
  onChange: (chart: Chart) => void;
  /** 当前预览播放时间（秒），用于绘制播放头 */
  playhead: number | null;
  /** 网格细分（每拍分成几份） */
  subdivision: number;
}

/** 轨道高度（px） */
const LANE_HEIGHT = 44;
const TIMELINE_HEIGHT = LANE_HEIGHT * LANE_COUNT;
/** 左侧标尺宽度 */
const LABEL_WIDTH = 64;

const LANE_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/** 拖拽状态 */
interface DragState {
  mode: 'move' | 'resize' | 'create';
  noteIndex: number;
  startX: number;
  startY: number;
  originalNote: ChartNote;
}

function EditorTimeline({ chart, onChange, playhead, subdivision }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(80); // 每秒对应的像素宽度
  const [scrollLeft, setScrollLeft] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const beat = beatDuration(chart.metadata.bpm);
  const totalDuration =
    Math.max(
      10,
      ...chart.notes.map((n) => n.time + (n.type === 'hold' ? n.duration ?? 0 : 0)),
    ) + 4;
  const contentWidth = totalDuration * zoom;

  /** 由鼠标位置计算时间与轨道 */
  const pointerToTimeLane = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft - LABEL_WIDTH;
      const y = clientY - rect.top;
      const time = snapTime(Math.max(0, x / zoom), chart.metadata.bpm, subdivision);
      const lane = Math.max(
        0,
        Math.min(LANE_COUNT - 1, Math.floor(y / LANE_HEIGHT)),
      ) as Lane;
      return { time, lane };
    },
    [zoom, chart.metadata.bpm, subdivision],
  );

  const commitNotes = useCallback(
    (updater: (notes: ChartNote[]) => ChartNote[]) => {
      const next = updater([...chart.notes]).sort((a, b) => a.time - b.time);
      onChange({ ...chart, notes: next });
    },
    [chart, onChange],
  );

  // 全局鼠标移动/抬起，保证拖出画布仍能继续
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const pos = pointerToTimeLane(e.clientX, e.clientY);
      if (!pos) return;
      if (drag.mode === 'create') {
        // 创建模式：更新正在放置的音符
        commitNotes((notes) => {
          const next = [...notes];
          next[drag.noteIndex] = {
            ...next[drag.noteIndex],
            time: pos.time,
            lane: pos.lane,
          };
          return next;
        });
      } else if (drag.mode === 'move') {
        commitNotes((notes) => {
          const next = [...notes];
          next[drag.noteIndex] = {
            ...drag.originalNote,
            time: pos.time,
            lane: pos.lane,
          };
          return next;
        });
      } else if (drag.mode === 'resize') {
        commitNotes((notes) => {
          const next = [...notes];
          const n = next[drag.noteIndex];
          const dur = Math.max(0.1, pos.time - n.time);
          next[drag.noteIndex] = { ...n, type: 'hold', duration: dur };
          return next;
        });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, pointerToTimeLane, commitNotes]);

  /** 在空白网格上按下：创建音符 */
  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pos = pointerToTimeLane(e.clientX, e.clientY);
    if (!pos) return;
    initRhythmAudio();
    triggerLaneNote(pos.lane);
    const newNote: ChartNote = {
      time: pos.time,
      lane: pos.lane,
      type: 'tap' as NoteType,
    };
    let newIndex = 0;
    commitNotes((notes) => {
      const next = [...notes, newNote];
      newIndex = next.length - 1;
      return next;
    });
    setDrag({
      mode: 'create',
      noteIndex: newIndex,
      startX: e.clientX,
      startY: e.clientY,
      originalNote: newNote,
    });
  };

  /** 在已有音符上按下：移动或缩放 */
  const handleNoteMouseDown = (e: React.MouseEvent, index: number, mode: 'move' | 'resize') => {
    e.stopPropagation();
    if (e.button === 2) {
      // 右键删除
      commitNotes((notes) => notes.filter((_, i) => i !== index));
      return;
    }
    if (e.button !== 0) return;
    const note = chart.notes[index];
    initRhythmAudio();
    triggerLaneNote(note.lane);
    setDrag({
      mode,
      noteIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      originalNote: { ...note },
    });
  };

  /** 双击删除 */
  const handleNoteDoubleClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    commitNotes((notes) => notes.filter((_, i) => i !== index));
  };

  // 生成网格线：每拍一条主线，细分线更浅
  const gridLines: { x: number; major: boolean }[] = [];
  for (let t = 0; t <= totalDuration; t += beat / subdivision) {
    gridLines.push({ x: t * zoom, major: Math.abs(t % beat) < 0.001 });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-950">
      {/* 缩放控制 */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10 text-white text-xs">
        <span>Zoom</span>
        <input
          type="range"
          min={30}
          max={240}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-40"
        />
        <span className="text-white/50">{zoom}px/s</span>
        <span className="text-white/50 ml-4">
          Snap: 1/{subdivision} beat
        </span>
        <div className="flex-1" />
        <span className="text-white/50">
          {chart.notes.length} notes · right-click or double-click a note to delete
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto"
        onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        onMouseMove={(e) => {
          const pos = pointerToTimeLane(e.clientX, e.clientY);
          setHoverTime(pos?.time ?? null);
        }}
        onMouseLeave={() => setHoverTime(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="relative"
          style={{ width: contentWidth + LABEL_WIDTH, height: TIMELINE_HEIGHT + 28 }}
        >
          {/* 左侧轨道标签 */}
          <div
            className="sticky left-0 z-20 bg-slate-900 border-r border-white/10"
            style={{ width: LABEL_WIDTH, height: TIMELINE_HEIGHT }}
          >
            {LANE_LABELS.map((label) => (
              <div
                key={label}
                className="flex items-center justify-center text-[11px] font-bold text-white/40 border-b border-white/5"
                style={{ height: LANE_HEIGHT }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 时间轴主体（绝对定位覆盖在标签右侧） */}
          <div
            className="absolute top-0"
            style={{ left: LABEL_WIDTH, width: contentWidth, height: TIMELINE_HEIGHT }}
            onMouseDown={handleGridMouseDown}
          >
            {/* 网格线 */}
            {gridLines.map((line, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 ${
                  line.major ? 'bg-white/15' : 'bg-white/5'
                }`}
                style={{ left: line.x, width: 1 }}
              />
            ))}

            {/* 轨道横向分隔线 */}
            {Array.from({ length: LANE_COUNT + 1 }).map((_, i) => (
              <div
                key={`lane-${i}`}
                className="absolute left-0 right-0 border-b border-white/5"
                style={{ top: i * LANE_HEIGHT }}
              />
            ))}

            {/* 音符 */}
            {chart.notes.map((note, index) => {
              const left = note.time * zoom;
              const width =
                note.type === 'hold'
                  ? Math.max(20, (note.duration ?? 0) * zoom)
                  : 20;
              const top = note.lane * LANE_HEIGHT + 4;
              const isHold = note.type === 'hold';
              return (
                <div
                  key={index}
                  onMouseDown={(e) => handleNoteMouseDown(e, index, 'move')}
                  onDoubleClick={(e) => handleNoteDoubleClick(e, index)}
                  className={`absolute rounded-md cursor-grab active:cursor-grabbing ${
                    isHold
                      ? 'bg-gradient-to-r from-cyan-400 to-cyan-600'
                      : 'bg-white'
                  } shadow-md`}
                  style={{
                    left,
                    top,
                    width,
                    height: LANE_HEIGHT - 8,
                  }}
                  title={`${note.type} @ ${note.time.toFixed(2)}s lane ${note.lane}`}
                >
                  {/* hold 右边缘拖拽手柄 */}
                  {isHold && (
                    <div
                      onMouseDown={(e) => handleNoteMouseDown(e, index, 'resize')}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40 rounded-r-md"
                    />
                  )}
                </div>
              );
            })}

            {/* 播放头 */}
            {playhead !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none"
                style={{ left: playhead * zoom }}
              />
            )}

            {/* hover 时间指示 */}
            {hoverTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-emerald-300/40 pointer-events-none"
                style={{ left: hoverTime * zoom }}
              />
            )}
          </div>

          {/* 底部时间标尺 */}
          <div
            className="sticky left-0 bg-slate-900 border-t border-white/10 flex"
            style={{ width: LABEL_WIDTH + contentWidth, height: 28 }}
          >
            <div style={{ width: LABEL_WIDTH }} className="border-r border-white/10" />
            <div className="relative" style={{ width: contentWidth, height: 28 }}>
              {Array.from({ length: Math.ceil(totalDuration / beat) + 1 }).map(
                (_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 flex items-center text-[10px] text-white/40"
                    style={{ left: i * beat * zoom }}
                  >
                    <div className="w-px h-2 bg-white/20" />
                    <span className="ml-1">{formatTime(i * beat)}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 提示当前滚动位置（调试/辅助） */}
      <div className="px-3 py-1 text-[10px] text-white/30 border-t border-white/10">
        scroll: {scrollLeft.toFixed(0)}px · beat {beat.toFixed(3)}s
      </div>
    </div>
  );
}

export default EditorTimeline;
