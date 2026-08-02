/**
 * EditorToolbar —— 谱面编辑器顶部工具栏。
 *
 * 负责：
 *  - 元数据编辑（标题、作者、BPM、偏移、难度、难度等级）；
 *  - 网格细分、音符密度（自动生成）；
 *  - 导入 / 导出 JSON、保存到本地谱面库、预览测试。
 *
 * 所有修改通过 onChange 回写到上层的 draftChartAtom。
 */

import { useRef } from 'react';
import {
  Download,
  Upload,
  Save,
  Play,
  Dices,
  ArrowLeft,
} from 'lucide-react';
import type { Chart, Difficulty } from '../types/chart';

interface Props {
  chart: Chart;
  onChange: (chart: Chart) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSave: () => void;
  onPreview: () => void;
  onGenerate: (density: number) => void;
  onBack: () => void;
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Normal', 'Hard', 'Expert', 'Master'];

function EditorToolbar({
  chart,
  onChange,
  onExport,
  onImport,
  onSave,
  onPreview,
  onGenerate,
  onBack,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateMeta = (patch: Partial<Chart['metadata']>) => {
    onChange({ ...chart, metadata: { ...chart.metadata, ...patch } });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    // 重置 value 以便重复选择同一文件
    e.target.value = '';
  };

  return (
    <div className="bg-slate-900/90 border-b border-white/10 p-3 flex flex-wrap gap-3 items-center text-white text-sm">
      <button
        onClick={onBack}
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* 元数据输入 */}
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">Title</span>
        <input
          className="bg-white/10 rounded px-2 py-1 w-40 outline-none"
          value={chart.metadata.title}
          onChange={(e) => updateMeta({ title: e.target.value })}
        />
      </label>
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">Author</span>
        <input
          className="bg-white/10 rounded px-2 py-1 w-32 outline-none"
          value={chart.metadata.author}
          onChange={(e) => updateMeta({ author: e.target.value })}
        />
      </label>
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">BPM</span>
        <input
          type="number"
          min={1}
          className="bg-white/10 rounded px-2 py-1 w-20 outline-none"
          value={chart.metadata.bpm}
          onChange={(e) => updateMeta({ bpm: Number(e.target.value) || 1 })}
        />
      </label>
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">Offset(s)</span>
        <input
          type="number"
          step={0.01}
          className="bg-white/10 rounded px-2 py-1 w-20 outline-none"
          value={chart.metadata.offset}
          onChange={(e) => updateMeta({ offset: Number(e.target.value) || 0 })}
        />
      </label>
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">Difficulty</span>
        <select
          className="bg-white/10 rounded px-2 py-1 outline-none"
          value={chart.metadata.difficulty}
          onChange={(e) => updateMeta({ difficulty: e.target.value as Difficulty })}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d} className="bg-slate-800">
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        <span className="text-[10px] text-white/50 uppercase">Level ★</span>
        <input
          type="number"
          min={1}
          max={15}
          className="bg-white/10 rounded px-2 py-1 w-16 outline-none"
          value={chart.metadata.level}
          onChange={(e) => updateMeta({ level: Number(e.target.value) || 1 })}
        />
      </label>

      <div className="w-px h-8 bg-white/10" />

      {/* 自动生成密度 */}
      <button
        onClick={() => onGenerate(1)}
        title="按当前 BPM 在每个节拍上随机生成音符"
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
      >
        <Dices size={16} /> 1/beat
      </button>
      <button
        onClick={() => onGenerate(2)}
        title="每拍生成 2 个音符（更密）"
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
      >
        <Dices size={16} /> 2/beat
      </button>

      <div className="flex-1" />

      {/* 文件操作 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
      >
        <Upload size={16} /> Import
      </button>
      <button
        onClick={onExport}
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
      >
        <Download size={16} /> Export
      </button>
      <button
        onClick={onSave}
        className="flex items-center gap-1 bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded-lg"
      >
        <Save size={16} /> Save
      </button>
      <button
        onClick={onPreview}
        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg"
      >
        <Play size={16} /> Test Play
      </button>
    </div>
  );
}

export default EditorToolbar;
