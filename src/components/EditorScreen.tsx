// ============================================================
// 谱面编辑器组件 (EditorScreen)
// ============================================================
// 功能清单：
// 1. 时间轴可视化编辑：点击网格添加/删除音符
// 2. 拖拽交互：拖拽已有音符移动其时间和轨道位置
// 3. 元数据编辑：标题、作者、BPM、偏移量、难度
// 4. 网格吸附：按节拍对齐（1/1 到 1/16 音符精度可选）
// 5. 播放预览：带音效的实时预览
// 6. JSON 导入/导出
// 7. 音符密度快速生成
// ============================================================

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
  GripVertical,
  Save,
  FolderOpen,
} from 'lucide-react';
import {
  screenAtom,
  editorChartAtom,
  editorPlaybackTimeAtom,
  editorIsPlayingAtom,
  editorGridSnapAtom,
  editorZoomAtom,
  currentChartAtom,
  cameFromEditorAtom,
  snapToGrid,
} from '../atoms/gameAtoms';
import type { Chart, Note } from '../types/chart';
import { generateId } from '../types/chart';
import { audioManager } from '../lib/audio';
import { saveCustomChart, loadCustomCharts, deleteCustomChart, type StoredChart } from '../lib/customCharts';

// 9 个轨道对应的按键标签（与游戏内一致）
const LANE_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

// 轨道背景色（与游戏内音符颜色对应）
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

// 轨道悬停高亮色（半透明版本）
const LANE_HOVER_COLORS = [
  'hover:bg-rose-500/10',
  'hover:bg-orange-500/10',
  'hover:bg-amber-500/10',
  'hover:bg-yellow-500/10',
  'hover:bg-emerald-500/10',
  'hover:bg-cyan-500/10',
  'hover:bg-blue-500/10',
  'hover:bg-violet-500/10',
  'hover:bg-fuchsia-500/10',
];

// 难度预设选项
const DIFFICULTY_OPTIONS = ['Easy', 'Normal', 'Hard', 'Expert', 'Master'];

// 键盘按键到音频音符的映射（用于预览播放）
const KEY_TO_AUDIO = ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'];

// ============================================================
// 拖拽状态类型
// ============================================================

/** 鼠标移动阈值（像素），超过则判定为拖拽而非点击 */
const DRAG_THRESHOLD = 5;

/** 拖拽操作的类型 */
type DragMode =
  | { kind: 'none' }
  // mousedown 后的待定状态：等待鼠标移动来判断是"点击"还是"拖拽"
  | {
      kind: 'pending-click';
      startX: number;
      startY: number;
      lane: number;
      /** pending 期间已经添加过的音符 id（用于拖拽开始时不重复添加） */
      addedNoteId?: string;
    }
  // 拖拽绘制模式：按住鼠标经过网格时连续添加音符
  | { kind: 'paint'; lastTime: number; lastLane: number }
  // 拖拽移动音符模式
  | {
      kind: 'move-note';
      noteId: string;
      startX: number;
      startY: number;
      originalTime: number;
      originalLane: number;
      /** 是否已真正开始移动（超过阈值） */
      moved: boolean;
    };

/**
 * 谱面编辑器主组件
 */
export default function EditorScreen() {
  // --- Jotai 全局状态 ---
  const [, setScreen] = useAtom(screenAtom);
  const [chart, setChart] = useAtom(editorChartAtom);
  const [playbackTime, setPlaybackTime] = useAtom(editorPlaybackTimeAtom);
  const [isPlaying, setIsPlaying] = useAtom(editorIsPlayingAtom);
  const [gridSnap, setGridSnap] = useAtom(editorGridSnapAtom);
  const [zoom, setZoom] = useAtom(editorZoomAtom);
  const [, setCurrentChart] = useAtom(currentChartAtom);
  const [, setCameFromEditor] = useAtom(cameFromEditorAtom);

  // --- 自定义谱面保存状态 ---
  // 当前正在编辑的谱面在 localStorage 中的 id（新谱面为 null）
  const [savedChartId, setSavedChartId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>('');
  // 已保存谱面列表
  const [savedCharts, setSavedCharts] = useState<StoredChart[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);

  // --- DOM 引用 ---
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 本地状态 ---
  const [noteDensity, setNoteDensity] = useState<number>(0); // 自动生成密度
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null); // 当前选中音符
  const [dragState, setDragState] = useState<DragMode>({ kind: 'none' }); // 拖拽状态
  const [dragPreview, setDragPreview] = useState<{ x: number; lane: number } | null>(null); // 拖拽幽灵预览位置

  // 从谱面中解构元数据和音符
  const { metadata, notes } = chart;
  // 一拍的毫秒数（BPM = 120 时为 500ms）
  const beatDuration = 60000 / metadata.bpm;

  // ============================================================
  // 坐标换算工具
  // ============================================================

  /**
   * 将鼠标的屏幕 X 坐标转换为谱面时间（毫秒）
   * 会自动根据当前网格精度进行吸附
   */
  const xToTime = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      // 需要加上横向滚动偏移量
      const x = clientX - rect.left + timelineRef.current.scrollLeft;
      const rawTime = x / zoom;
      // 吸附到网格
      return snapToGrid(rawTime, metadata.bpm, gridSnap, metadata.offset);
    },
    [zoom, metadata.bpm, metadata.offset, gridSnap],
  );

  /**
   * 将谱面时间（毫秒）转换为像素 X 坐标
   */
  const timeToX = useCallback(
    (time: number): number => time * zoom,
    [zoom],
  );

  /**
   * 根据鼠标 Y 坐标计算所在轨道索引（0-8）
   * 用于拖拽时跨轨道移动
   */
  const yToLane = useCallback((clientY: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    // 时间轴区域的高度分配给 9 条轨道
    const laneHeight = rect.height / 9;
    const lane = Math.floor(y / laneHeight);
    // 钳制在 0-8 范围内
    return Math.max(0, Math.min(8, lane));
  }, []);

  // ============================================================
  // 音符操作
  // ============================================================

  /**
   * 在指定时间和轨道添加音符
   * 如果同一网格位置已有音符，则不执行任何操作（避免重复）
   * 返回是否成功添加
   */
  const addNoteAt = useCallback(
    (time: number, lane: number): boolean => {
      if (time < 0) return false;

      let added = false;
      setChart((prev) => {
        // 查找同一网格位置附近是否已有音符
        const tolerance = beatDuration * gridSnap * 0.5;
        const existing = prev.notes.find(
          (n) => n.lane === lane && Math.abs(n.time - time) < tolerance,
        );

        if (existing) {
          // 已有音符：不重复添加
          return prev;
        }

        added = true;
        const newNote: Note = {
          id: generateId(),
          time,
          lane,
          type: 'tap',
        };
        return {
          ...prev,
          notes: [...prev.notes, newNote].sort((a, b) => a.time - b.time),
        };
      });
      return added;
    },
    [setChart, beatDuration, gridSnap],
  );

  /**
   * 删除指定音符
   */
  const removeNote = useCallback(
    (noteId: string) => {
      setChart((prev) => ({
        ...prev,
        notes: prev.notes.filter((n) => n.id !== noteId),
      }));
    },
    [setChart],
  );

  /**
   * 移动已有音符到新的时间和轨道
   */
  const moveNote = useCallback(
    (noteId: string, newTime: number, newLane: number) => {
      setChart((prev) => {
        // 检查目标位置是否已有其他音符
        const tolerance = beatDuration * gridSnap * 0.5;
        const blocked = prev.notes.some(
          (n) =>
            n.id !== noteId &&
            n.lane === newLane &&
            Math.abs(n.time - newTime) < tolerance,
        );
        if (blocked) return prev; // 目标位置被占用，不移动

        return {
          ...prev,
          notes: prev.notes
            .map((n) =>
              n.id === noteId
                ? { ...n, time: Math.max(0, newTime), lane: newLane }
                : n,
            )
            .sort((a, b) => a.time - b.time),
        };
      });
    },
    [setChart, beatDuration, gridSnap],
  );

  // ============================================================
  // 拖拽事件处理
  // ============================================================
  // 交互设计：
  // - 在空白处 mousedown：进入 pending-click 状态
  //   - 若鼠标未明显移动就 mouseup：判定为"点击"，在该位置 toggle 音符
  //   - 若鼠标移动超过阈值：转为 paint 模式，起点添加音符并随拖拽连续添加
  // - 在音符上 mousedown：进入 pending-move 状态
  //   - 未移动就 mouseup：选中/取消选中该音符
  //   - 移动超过阈值：转为 move-note 模式，拖拽音符到新位置
  // - 双击音符：删除
  // ============================================================

  /**
   * 鼠标在轨道空白处按下：进入待定点击状态
   * 不立即添加音符，等待判断是点击还是拖拽
   */
  const handleLaneMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, lane: number) => {
      if (e.button !== 0) return; // 只响应左键
      setDragState({
        kind: 'pending-click',
        startX: e.clientX,
        startY: e.clientY,
        lane,
      });
    },
    [],
  );

  /**
   * 在音符上按下鼠标：准备拖拽移动
   */
  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, note: Note) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      setSelectedNoteId(note.id || null);
      setDragState({
        kind: 'move-note',
        noteId: note.id || '',
        startX: e.clientX,
        startY: e.clientY,
        originalTime: note.time,
        originalLane: note.lane,
        moved: false,
      });
    },
    [],
  );

  /**
   * 鼠标在时间轴上移动
   */
  const handleTimelineMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState.kind === 'none') return;

      if (dragState.kind === 'pending-click') {
        // 检查鼠标是否已移动超过阈值
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          // 确认为拖拽：在起始位置添加音符，进入 paint 模式
          const time = xToTime(dragState.startX);
          const lane = dragState.lane;
          addNoteAt(time, lane);
          setDragState({
            kind: 'paint',
            lastTime: time,
            lastLane: lane,
          });
        }
      } else if (dragState.kind === 'paint') {
        // 绘制模式：在经过的新网格位置添加音符
        const time = xToTime(e.clientX);
        const lane = yToLane(e.clientY);
        const tolerance = beatDuration * gridSnap * 0.5;
        // 只在网格位置变化时才添加，避免同一位置重复
        const timeChanged = Math.abs(time - dragState.lastTime) >= tolerance * 0.8;
        const laneChanged = lane !== dragState.lastLane;
        if (timeChanged || laneChanged) {
          addNoteAt(time, lane);
          setDragState({
            kind: 'paint',
            lastTime: time,
            lastLane: lane,
          });
        }
      } else if (dragState.kind === 'move-note') {
        // 拖拽音符：超过阈值后才显示预览并标记为已移动
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (
          !dragState.moved &&
          (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
        ) {
          setDragState({ ...dragState, moved: true });
        }
        if (dragState.moved) {
          const newTime = xToTime(e.clientX);
          const newLane = yToLane(e.clientY);
          setDragPreview({ x: timeToX(newTime), lane: newLane });
        }
      }
    },
    [
      dragState,
      xToTime,
      yToLane,
      timeToX,
      beatDuration,
      gridSnap,
      addNoteAt,
    ],
  );

  /**
   * 鼠标松开：根据拖拽状态决定行为
   */
  const handleTimelineMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState.kind === 'pending-click') {
        // 待定点击状态下松开且未移动：判定为单击，在 mousedown 的位置添加音符
        // 使用 mousedown 时记录的轨道，避免鼠标微小移动导致轨道偏移
        const time = xToTime(e.clientX);
        addNoteAt(time, dragState.lane);
      } else if (dragState.kind === 'move-note') {
        if (dragState.moved) {
          // 真正发生了拖拽：提交新位置
          const newTime = xToTime(e.clientX);
          const newLane = yToLane(e.clientY);
          moveNote(dragState.noteId, newTime, newLane);
        }
        // 如果未移动，就是单击音符（选中/取消选中已在 mousedown 中处理）
      }
      // paint 模式松开：不需要额外操作，音符已在拖拽中添加

      setDragState({ kind: 'none' });
      setDragPreview(null);
    },
    [dragState, xToTime, yToLane, addNoteAt, moveNote],
  );

  /**
   * 鼠标离开时间轴区域：取消待定/拖拽状态
   */
  const handleTimelineMouseLeave = useCallback(() => {
    setDragState({ kind: 'none' });
    setDragPreview(null);
  }, []);

  // ============================================================
  // 元数据编辑
  // ============================================================

  /**
   * 更新谱面元数据的单个字段
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

  // ============================================================
  // 导入 / 导出
  // ============================================================

  /**
   * 将当前谱面导出为 JSON 文件下载
   */
  const handleExport = useCallback(() => {
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
   * 从本地 JSON 文件导入谱面
   */
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as Chart;
          // 基本数据校验
          if (!data.metadata || !Array.isArray(data.notes)) {
            alert('无效的谱面文件格式');
            return;
          }
          // 确保每个音符都有唯一 id
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
      e.target.value = ''; // 重置以允许重复导入同一文件
    },
    [setChart],
  );

  // ============================================================
  // 播放预览
  // ============================================================

  /**
   * 切换播放/暂停状态
   * 播放时使用 requestAnimationFrame 驱动时间轴推进
   */
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      // 暂停：取消动画帧并释放所有音频
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
      // 记录播放起始时间（减去当前播放位置以支持暂停续播）
      playbackStartRef.current = performance.now() - playbackTime;

      // 记录上一帧已触发的音符时间，避免重复播放
      let lastTriggeredTime = -1;

      const tick = () => {
        const now = performance.now();
        const currentTime = now - playbackStartRef.current;

        // 找到当前时间窗口内需要播放的音符（±20ms 窗口）
        notes.forEach((note) => {
          if (
            note.time >= lastTriggeredTime &&
            note.time <= currentTime + 20 &&
            note.time >= currentTime - 50
          ) {
            const key = KEY_TO_AUDIO[note.lane];
            if (key) {
              audioManager.playNote(key);
              // 100ms 后释放音符
              setTimeout(() => audioManager.releaseNote(key), 100);
            }
          }
        });
        lastTriggeredTime = currentTime;

        // 检查是否播放结束（最后一个音符后 2 秒）
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
   * 停止播放并将播放头回到起始位置
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

  // ============================================================
  // 其他操作
  // ============================================================

  /** 清空所有音符 */
  const clearNotes = useCallback(() => {
    if (confirm('确定要清除所有音符吗？')) {
      setChart((prev) => ({ ...prev, notes: [] }));
      setSelectedNoteId(null);
    }
  }, [setChart]);

  /**
   * 根据密度设置自动生成随机音符序列
   * 在 16 拍范围内生成
   */
  const generateByDensity = useCallback(() => {
    if (noteDensity <= 0) return;
    const totalBeats = 16;
    const newNotes: Note[] = [];

    for (let beat = 0; beat < totalBeats; beat++) {
      for (let i = 0; i < noteDensity; i++) {
        const time = (beat + i / noteDensity) * beatDuration;
        // 随机选择轨道
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
   * 将当前编辑的谱面发送到游戏进行测试游玩
   * 标记来源为编辑器，以便游戏中/结算页可以返回继续编辑
   */
  const handleTestPlay = useCallback(() => {
    if (notes.length === 0) {
      alert('谱面为空，请先添加音符');
      return;
    }
    setCurrentChart({ ...chart });
    setCameFromEditor(true);
    audioManager.releaseAll();
    setScreen('game');
  }, [chart, notes.length, setCurrentChart, setCameFromEditor, setScreen]);

  /**
   * 保存当前谱面到 localStorage（首页可直接游玩）
   * 如果是已保存过的谱面则更新，否则新建
   */
  const handleSave = useCallback(() => {
    if (notes.length === 0) {
      alert('谱面为空，无法保存');
      return;
    }
    const saved = saveCustomChart(chart, savedChartId || undefined);
    setSavedChartId(saved.id);
    setSavedCharts(loadCustomCharts());
    setSaveMessage('已保存 ✓');
    // 2 秒后清除提示
    window.setTimeout(() => setSaveMessage(''), 2000);
  }, [chart, notes.length, savedChartId]);

  /**
   * 加载一个已保存的自定义谱面到编辑器
   */
  const handleLoadChart = useCallback((stored: StoredChart) => {
    setChart(stored.chart);
    setSavedChartId(stored.id);
    setShowSavedList(false);
  }, [setChart]);

  /**
   * 删除一个已保存的自定义谱面
   */
  const handleDeleteSaved = useCallback((id: string) => {
    if (confirm('确定删除这个已保存的谱面吗？')) {
      deleteCustomChart(id);
      setSavedCharts(loadCustomCharts());
      if (savedChartId === id) setSavedChartId(null);
    }
  }, [savedChartId]);

  // 组件挂载时加载已保存谱面列表
  useEffect(() => {
    setSavedCharts(loadCustomCharts());
  }, []);

  // ============================================================
  // 布局计算
  // ============================================================

  /**
   * 计算时间轴总宽度（像素）
   * 取最后一个音符时间 + 4 拍留白，最小 800px
   */
  const timelineWidth = useCallback(() => {
    const lastNote = notes[notes.length - 1];
    const endTime = lastNote
      ? lastNote.time + beatDuration * 4
      : beatDuration * 16;
    return Math.max(endTime * zoom, 800);
  }, [notes, beatDuration, zoom]);

  /**
   * 生成所有网格线的时间位置
   * 每拍显示粗线（带拍号），细分网格显示细线
   */
  const gridLines = useCallback(() => {
    const lines: { time: number; isBeat: boolean }[] = [];
    const totalTime = timelineWidth() / zoom;
    const step = beatDuration * gridSnap;
    for (let t = 0; t <= totalTime; t += step) {
      // 判断是否为整拍（容差 1ms）
      const isBeat = Math.abs(t % beatDuration) < 1;
      lines.push({ time: t, isBeat });
    }
    return lines;
  }, [timelineWidth, zoom, beatDuration, gridSnap]);

  // ============================================================
  // 副作用
  // ============================================================

  // 组件卸载时清理动画帧和音频
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioManager.releaseAll();
    };
  }, []);

  // 全局鼠标松开监听（防止鼠标在轨道外松开时拖拽状态卡住）
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.kind !== 'none') {
        setDragState({ kind: 'none' });
        setDragPreview(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragState.kind]);

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col overflow-hidden select-none">
      {/* ===== 顶部工具栏 ===== */}
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
          {/* 播放控制 */}
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
          {/* 保存和打开 */}
          <div className="relative">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 transition-colors text-sm font-medium"
            >
              <Save size={16} />
              保存
            </button>
            {saveMessage && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-emerald-400 whitespace-nowrap">
                {saveMessage}
              </span>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => {
                setSavedCharts(loadCustomCharts());
                setShowSavedList((v) => !v);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-sm"
            >
              <FolderOpen size={16} />
              打开
            </button>
            {/* 已保存谱面下拉列表 */}
            {showSavedList && (
              <div className="absolute right-0 top-full mt-1 w-72 max-h-64 overflow-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50">
                {savedCharts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">
                    暂无已保存的谱面
                  </div>
                ) : (
                  savedCharts.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-slate-700 cursor-pointer group"
                      onClick={() => handleLoadChart(sc)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {sc.chart.metadata.title}
                        </div>
                        <div className="text-xs text-slate-400">
                          {sc.chart.metadata.difficulty} · {sc.chart.notes.length} 音符
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSaved(sc.id);
                        }}
                        className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="w-px h-6 bg-slate-600 mx-1" />
          {/* 文件操作 */}
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
        {/* ===== 左侧设置面板 ===== */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto shrink-0">
          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">
            谱面信息
          </h2>

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
              <label className="block text-xs text-slate-400 mb-1">
                偏移量 (ms)
              </label>
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

          {/* 网格设置 */}
          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3 mt-6">
            网格设置
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                网格精度
              </label>
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

          {/* 快速生成 */}
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

          {/* 使用说明 */}
          <div className="mt-6 p-3 bg-slate-700/50 rounded text-xs text-slate-400">
            <p className="font-bold text-slate-300 mb-1">使用说明</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>点击空白网格添加音符</li>
              <li>拖拽音符可移动时间和轨道</li>
              <li>按住鼠标拖拽可连续绘制</li>
              <li>双击音符删除</li>
              <li>音符自动吸附网格线</li>
            </ul>
          </div>
        </aside>

        {/* ===== 右侧时间轴编辑区 ===== */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* 时间轴标尺（显示拍号） */}
          <div className="h-8 bg-slate-800 border-b border-slate-700 relative overflow-hidden shrink-0">
            <div className="h-full relative" style={{ width: timelineWidth() }}>
              {gridLines().map((line, i) => {
                const x = timeToX(line.time);
                const beatNumber = Math.round(line.time / beatDuration) + 1;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex flex-col items-center"
                    style={{ left: x }}
                  >
                    {line.isBeat ? (
                      <>
                        <div className="w-px h-full bg-slate-500" />
                        <span className="absolute top-1 text-[10px] text-slate-400 -translate-x-1/2">
                          {beatNumber}
                        </span>
                      </>
                    ) : (
                      <div className="w-px h-3 bg-slate-600 mt-auto" />
                    )}
                  </div>
                );
              })}
              {/* 播放头指针 */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500 z-10 pointer-events-none"
                style={{ left: timeToX(playbackTime) }}
              >
                <div className="w-2 h-2 bg-red-500 rounded-full -translate-x-1/2" />
              </div>
            </div>
          </div>

          {/* 轨道编辑区域 */}
          <div
            ref={timelineRef}
            className={`flex-1 overflow-x-auto overflow-y-hidden relative ${
              dragState.kind !== 'none' ? 'cursor-grabbing' : ''
            }`}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
            onMouseLeave={handleTimelineMouseLeave}
          >
            <div
              className="h-full relative"
              style={{ width: timelineWidth() }}
            >
              {/* 垂直网格线背景 */}
              {gridLines().map((line, i) => (
                <div
                  key={i}
                  className={`absolute top-0 h-full w-px ${
                    line.isBeat ? 'bg-slate-600/60' : 'bg-slate-700/40'
                  } pointer-events-none`}
                  style={{ left: timeToX(line.time) }}
                />
              ))}

              {/* 9 条轨道（仅用于点击区域和标签，不包含音符） */}
              <div className="absolute inset-0 flex z-0">
                {LANE_LABELS.map((label, laneIndex) => (
                  <div
                    key={laneIndex}
                    className={`flex-1 border-r border-slate-700/50 last:border-r-0 relative transition-colors ${LANE_HOVER_COLORS[laneIndex]} ${
                      dragState.kind === 'paint' ? 'cursor-crosshair' : 'cursor-pointer'
                    }`}
                    onMouseDown={(e) => handleLaneMouseDown(e, laneIndex)}
                  >
                    {/* 轨道标签（固定在左侧，不随横向滚动） */}
                    <div className="sticky left-0 top-0 z-20 bg-slate-800/90 px-2 py-1 text-xs font-bold text-slate-400 border-b border-slate-700 flex items-center gap-1">
                      <GripVertical size={10} className="opacity-50" />
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* 音符覆盖层：所有音符在此层渲染，left 相对于时间轴起点 */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                {notes.map((note) => {
                  const isSelected = selectedNoteId === note.id;
                  const isBeingDragged =
                    dragState.kind === 'move-note' &&
                    dragState.noteId === note.id &&
                    dragState.moved;
                  const laneCenterPercent = (note.lane + 0.5) * (100 / 9);
                  return (
                    <div
                      key={note.id}
                      className={`absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 ${LANE_COLORS[note.lane]} rounded shadow-lg cursor-grab active:cursor-grabbing hover:brightness-125 transition-all pointer-events-auto ${
                        isSelected
                          ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900'
                          : ''
                      } ${isBeingDragged ? 'opacity-30 scale-90' : ''}`}
                      style={{
                        left: timeToX(note.time),
                        top: `${laneCenterPercent}%`,
                      }}
                      onMouseDown={(e) => handleNoteMouseDown(e, note)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        // 双击删除音符
                        if (note.id) removeNote(note.id);
                        setSelectedNoteId(null);
                      }}
                      title={`时间: ${(note.time / 1000).toFixed(2)}s | 拖拽移动 | 双击删除`}
                    >
                      <div className="absolute inset-0 bg-white/20 rounded-sm pointer-events-none" />
                    </div>
                  );
                })}

                {/* 拖拽移动时的幽灵预览 */}
                {dragPreview && dragState.kind === 'move-note' && (
                  <div
                    className={`absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 ${LANE_COLORS[dragPreview.lane]} rounded opacity-60 ring-2 ring-white/70 pointer-events-none z-30`}
                    style={{
                      left: dragPreview.x,
                      top: `${(dragPreview.lane + 0.5) * (100 / 9)}%`,
                    }}
                  />
                )}
              </div>

              {/* 播放头（覆盖在最上层） */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500/80 z-30 pointer-events-none"
                style={{ left: timeToX(playbackTime) }}
              />
            </div>
          </div>

          {/* ===== 底部状态栏 ===== */}
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
            <span>播放位置: {(playbackTime / 1000).toFixed(2)}s</span>
            <div className="flex-1" />
            <span className="text-slate-500">
              点击/拖拽添加 · 拖拽音符移动 · 双击删除
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
