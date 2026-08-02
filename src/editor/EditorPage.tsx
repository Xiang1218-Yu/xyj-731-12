/**
 * 谱面编辑器页面（独立路由 /editor，与游戏主页完全分离）。
 * 页面结构：
 * - 顶栏：返回主页 + 标题 + 状态消息；
 * - 元数据行：标题 / 作者 / BPM / 偏移量 / 难度等级；
 * - 工具行：音符类型、长条长度、吸附精度、缩放；
 * - 生成行：按 BPM + 音符密度 + 拍数自动生成音符；
 * - 文件行：导入 JSON / 导出 JSON / 保存到本地曲库（曲库歌曲可在主页游玩）；
 * - 播放行：播放 / 暂停 / 停止预览；
 * - 下方大区域为时间轴（见 EditorTimeline）。
 */
import { useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  editorChartAtom,
  editorMetadataAtom,
  editorNotesAtom,
  editorNoteTypeAtom,
  editorHoldBeatsAtom,
  editorSnapDivisionAtom,
  editorZoomAtom,
  editorDensityAtom,
  editorGenerateBeatsAtom,
  editorIsPlayingAtom,
  editorPlayheadMsAtom,
  editorStatusAtom,
  editorSelectedNoteIdAtom,
} from '../atoms/editorAtoms';
import {
  downloadChart,
  generateRandomChart,
  parseChartFile,
  readFileAsText,
  saveCustomChart,
} from '../lib/chart';
import { audioManager } from '../lib/audio';
import EditorTimeline from './EditorTimeline';
import {
  Download,
  Home,
  Pause,
  Play,
  Save,
  Square,
  Trash2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

/** 缩放档位（0.25x ~ 4x） */
const ZOOM_STEPS = [0.25, 0.5, 1, 2, 4];

/** 通用数字输入解析：非法输入时回退默认值，并做范围钳制 */
function parseNumberInput(value: string, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function EditorPage() {
  const [metadata, setMetadata] = useAtom(editorMetadataAtom);
  const [notes, setNotes] = useAtom(editorNotesAtom);
  const chart = useAtomValue(editorChartAtom);
  const [noteType, setNoteType] = useAtom(editorNoteTypeAtom);
  const [holdBeats, setHoldBeats] = useAtom(editorHoldBeatsAtom);
  const [snapDivision, setSnapDivision] = useAtom(editorSnapDivisionAtom);
  const [zoom, setZoom] = useAtom(editorZoomAtom);
  const [density, setDensity] = useAtom(editorDensityAtom);
  const [generateBeats, setGenerateBeats] = useAtom(editorGenerateBeatsAtom);
  const [isPlaying, setIsPlaying] = useAtom(editorIsPlayingAtom);
  const setPlayheadMs = useSetAtom(editorPlayheadMsAtom);
  const setSelectedNoteId = useSetAtom(editorSelectedNoteIdAtom);
  const [status, setStatus] = useAtom(editorStatusAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 更新单个元数据字段 */
  const updateMetadata = (patch: Partial<typeof metadata>) => {
    setMetadata((prev) => ({ ...prev, ...patch }));
  };

  // -------------------------------------------------------------------------
  // 播放预览控制
  // -------------------------------------------------------------------------

  /** 播放/暂停切换；首次播放需要在点击手势中启动音频上下文 */
  const handleTogglePlay = async () => {
    if (!audioManager.isInitialized()) {
      await audioManager.start();
    }
    // 已播到结尾时再次播放 → 从头开始
    setIsPlaying((prev) => !prev);
  };

  /** 停止：暂停 + 播放头归零 */
  const handleStop = () => {
    setIsPlaying(false);
    setPlayheadMs(0);
  };

  // -------------------------------------------------------------------------
  // 音符生成 / 清空
  // -------------------------------------------------------------------------

  /** 按当前 BPM / 密度 / 拍数随机生成音符（覆盖现有音符，需确认） */
  const handleGenerate = () => {
    if (notes.length > 0 && !window.confirm('生成将覆盖当前全部音符，是否继续？')) return;
    const generated = generateRandomChart({
      bpm: metadata.bpm,
      offsetMs: metadata.offset,
      density,
      beats: generateBeats,
      difficulty: metadata.difficulty,
      title: metadata.title,
      author: metadata.author,
    });
    setNotes(generated.notes);
    setSelectedNoteId(null);
    setPlayheadMs(0);
    setStatus(`已按密度 ${density}/拍 生成 ${generated.notes.length} 个音符`);
  };

  /** 清空全部音符（需确认） */
  const handleClear = () => {
    if (notes.length === 0) return;
    if (!window.confirm('确定清空全部音符吗？')) return;
    setNotes([]);
    setSelectedNoteId(null);
    setStatus('已清空全部音符');
  };

  // -------------------------------------------------------------------------
  // 导入 / 导出 / 保存曲库
  // -------------------------------------------------------------------------

  /** 导出：下载当前谱面为 JSON 文件 */
  const handleExport = () => {
    downloadChart(chart);
    setStatus(`已导出「${metadata.title}」（${notes.length} 个音符）`);
  };

  /** 导入：选择本地 JSON 文件 → 解析校验 → 载入编辑器 */
  const handleImportFile = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const imported = parseChartFile(text);
      setMetadata(imported.metadata);
      setNotes(imported.notes);
      setSelectedNoteId(null);
      setPlayheadMs(0);
      setStatus(`导入成功：「${imported.metadata.title}」（${imported.notes.length} 个音符）`);
    } catch (error) {
      setStatus(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  /** 保存到本地曲库：主页选歌界面的「自制谱面」分区即可游玩 */
  const handleSaveToLibrary = () => {
    if (notes.length === 0) {
      setStatus('谱面还没有音符，无法保存到曲库');
      return;
    }
    saveCustomChart(chart);
    setStatus(`已保存到本地曲库：「${metadata.title}」，返回主页即可游玩`);
  };

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  const inputClass = 'bg-slate-800 border border-white/15 rounded px-2 py-1 text-sm text-white w-full';
  const labelClass = 'flex flex-col gap-1 text-xs font-bold text-white/60';
  const toolButtonClass = (active: boolean) =>
    `px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
      active ? 'bg-emerald-400 text-emerald-950' : 'bg-slate-800 text-white/70 hover:bg-slate-700'
    }`;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 text-white">
      {/* ===== 顶栏 ===== */}
      <header className="flex items-center gap-3 px-4 py-2 bg-slate-950 border-b border-white/10">
        <a
          href="/"
          className="flex items-center gap-1.5 text-sm font-bold text-white/70 hover:text-white transition-colors"
        >
          <Home size={16} />
          返回游戏
        </a>
        <h1 className="text-lg font-black">谱面编辑器</h1>
        <span className="text-xs text-white/40">共 {notes.length} 个音符</span>
        {/* 状态消息（导入/导出/生成反馈） */}
        {status && <span className="ml-auto text-xs font-bold text-emerald-300 truncate max-w-[40%]">{status}</span>}
      </header>

      {/* ===== 元数据行 ===== */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-2 border-b border-white/10 bg-slate-900">
        <label className={`${labelClass} w-44`}>
          标题
          <input
            className={inputClass}
            value={metadata.title}
            onChange={(e) => updateMetadata({ title: e.target.value })}
            placeholder="谱面标题"
          />
        </label>
        <label className={`${labelClass} w-32`}>
          作者
          <input
            className={inputClass}
            value={metadata.author}
            onChange={(e) => updateMetadata({ author: e.target.value })}
            placeholder="作者名"
          />
        </label>
        <label className={`${labelClass} w-20`}>
          BPM
          <input
            className={inputClass}
            type="number"
            min={30}
            max={300}
            value={metadata.bpm}
            onChange={(e) => updateMetadata({ bpm: parseNumberInput(e.target.value, 30, 300, 120) })}
          />
        </label>
        <label className={`${labelClass} w-24`}>
          偏移量(ms)
          <input
            className={inputClass}
            type="number"
            step={10}
            value={metadata.offset}
            onChange={(e) => updateMetadata({ offset: parseNumberInput(e.target.value, -10000, 10000, 0) })}
          />
        </label>
        <label className={`${labelClass} w-20`}>
          难度 1-10
          <input
            className={inputClass}
            type="number"
            min={1}
            max={10}
            value={metadata.difficulty}
            onChange={(e) => updateMetadata({ difficulty: Math.round(parseNumberInput(e.target.value, 1, 10, 5)) })}
          />
        </label>

        {/* 音符类型切换 */}
        <div className={labelClass}>
          音符类型
          <div className="flex gap-1">
            <button className={toolButtonClass(noteType === 'tap')} onClick={() => setNoteType('tap')}>
              单点
            </button>
            <button className={toolButtonClass(noteType === 'hold')} onClick={() => setNoteType('hold')}>
              长条
            </button>
          </div>
        </div>

        {/* 长条长度（仅 hold 类型有意义） */}
        {noteType === 'hold' && (
          <label className={`${labelClass} w-20`}>
            长度(拍)
            <input
              className={inputClass}
              type="number"
              min={0.5}
              max={16}
              step={0.5}
              value={holdBeats}
              onChange={(e) => setHoldBeats(parseNumberInput(e.target.value, 0.5, 16, 1))}
            />
          </label>
        )}

        {/* 吸附精度 */}
        <div className={labelClass}>
          吸附网格
          <div className="flex gap-1">
            {([1, 2, 4] as const).map((d) => (
              <button key={d} className={toolButtonClass(snapDivision === d)} onClick={() => setSnapDivision(d)}>
                1/{d * 4}
              </button>
            ))}
          </div>
        </div>

        {/* 缩放 */}
        <div className={labelClass}>
          缩放 {zoom}x
          <div className="flex gap-1">
            <button
              className={toolButtonClass(false)}
              onClick={() => setZoom(ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(zoom) - 1)])}
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              className={toolButtonClass(false)}
              onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(zoom) + 1)])}
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== 生成 / 文件 / 播放行 ===== */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10 bg-slate-900 text-xs font-bold">
        {/* 随机生成 */}
        <span className="text-white/50">密度</span>
        <input
          className="bg-slate-800 border border-white/15 rounded px-2 py-1 w-16"
          type="number"
          min={0.25}
          max={4}
          step={0.25}
          value={density}
          onChange={(e) => setDensity(parseNumberInput(e.target.value, 0.25, 4, 1))}
          title="平均每拍音符数"
        />
        <span className="text-white/50">/拍 · 拍数</span>
        <input
          className="bg-slate-800 border border-white/15 rounded px-2 py-1 w-16"
          type="number"
          min={8}
          max={512}
          value={generateBeats}
          onChange={(e) => setGenerateBeats(Math.round(parseNumberInput(e.target.value, 8, 512, 64)))}
        />
        <button
          className="flex items-center gap-1 bg-violet-500 hover:bg-violet-400 text-white px-2.5 py-1 rounded cursor-pointer"
          onClick={handleGenerate}
          title="按 BPM / 密度 / 拍数自动生成音符（覆盖现有）"
        >
          <Wand2 size={14} />
          生成音符
        </button>
        <button
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white/70 px-2.5 py-1 rounded cursor-pointer"
          onClick={handleClear}
        >
          <Trash2 size={14} />
          清空
        </button>

        <span className="mx-1 h-4 w-px bg-white/15" />

        {/* 导入导出 */}
        <button
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white/80 px-2.5 py-1 rounded cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          导入 JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = ''; // 允许重复导入同一文件
          }}
        />
        <button
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white/80 px-2.5 py-1 rounded cursor-pointer"
          onClick={handleExport}
        >
          <Download size={14} />
          导出 JSON
        </button>
        <button
          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-2.5 py-1 rounded cursor-pointer"
          onClick={handleSaveToLibrary}
          title="保存后可在游戏主页的「自制谱面」中游玩"
        >
          <Save size={14} />
          保存到曲库
        </button>

        <span className="mx-1 h-4 w-px bg-white/15" />

        {/* 播放预览 */}
        <button
          className="flex items-center gap-1 bg-sky-500 hover:bg-sky-400 text-white px-2.5 py-1 rounded cursor-pointer"
          onClick={() => void handleTogglePlay()}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? '暂停' : '播放预览'}
        </button>
        <button
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white/70 px-2.5 py-1 rounded cursor-pointer"
          onClick={handleStop}
        >
          <Square size={14} />
          停止
        </button>
        <span className="text-white/40">左键放置/拖动 · 右键删除 · Delete 删除选中 · 点标尺跳转</span>
      </div>

      {/* ===== 时间轴 ===== */}
      <EditorTimeline />
    </div>
  );
}

export default EditorPage;
