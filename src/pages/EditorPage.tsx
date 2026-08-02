/**
 * EditorPage —— 谱面编辑器页面（/editor）。
 *
 * 组合：
 *  - EditorToolbar：元数据与文件操作；
 *  - EditorTimeline：拖拽放置音符的时间轴；
 *  - 预览控制：播放 / 暂停 / 停止，带节拍器与播放头动画。
 *
 * 谱面草稿保存在 draftChartAtom；点 Save 后写入 customChartsAtom 并持久化。
 */

import { useEffect, useRef, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
  customChartsAtom,
  draftChartAtom,
  selectedChartAtom,
} from '../atoms/chartAtoms';
import { navigateAtom } from '../atoms/routeAtoms';
import { rhythmStatusAtom } from '../atoms/rhythmAtoms';
import type { ChartNote } from '../types/chart';
import { createEmptyChart, parseChart } from '../types/chart';
import { beatDuration } from '../lib/timeline';
import { click, initRhythmAudio, triggerLaneNote, releaseAllRhythm } from '../lib/rhythmAudio';
import EditorToolbar from '../components/EditorToolbar';
import EditorTimeline from '../components/EditorTimeline';
import { Play, Pause, Square, Trash2 } from 'lucide-react';

function EditorPage() {
  const [chart, setChart] = useAtom(draftChartAtom);
  const [customCharts, setCustomCharts] = useAtom(customChartsAtom);
  const navigate = useSetAtom(navigateAtom);
  const setSelected = useSetAtom(selectedChartAtom);
  const setRhythmStatus = useSetAtom(rhythmStatusAtom);

  const [subdivision, setSubdivision] = useState(2);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 预览相关 ref
  const rafRef = useRef<number | null>(null);
  const startPerfRef = useRef(0);
  const lastBeatRef = useRef(-1);
  const playedNotesRef = useRef<Set<number>>(new Set());

  // 清理预览
  const stopPreview = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPlaying(false);
    setPlayhead(null);
    releaseAllRhythm();
  };

  useEffect(() => () => stopPreview(), []);

  /** 播放预览：按 BPM 打节拍器，并在音符时间点触发对应轨道声音 */
  const playPreview = async () => {
    await initRhythmAudio();
    setIsPlaying(true);
    startPerfRef.current = performance.now();
    lastBeatRef.current = -1;
    playedNotesRef.current = new Set();
    const beat = beatDuration(chart.metadata.bpm);
    const lastTime =
      chart.notes.reduce(
        (max, n) => Math.max(max, n.time + (n.type === 'hold' ? n.duration ?? 0 : 0)),
        0,
      ) + 1;

    const loop = () => {
      const t = (performance.now() - startPerfRef.current) / 1000;
      setPlayhead(t);

      // 节拍器
      const beatIdx = Math.floor(t / beat);
      if (beatIdx !== lastBeatRef.current && t >= 0) {
        lastBeatRef.current = beatIdx;
        click(beatIdx % 4 === 0);
      }

      // 触发音符
      chart.notes.forEach((n, i) => {
        if (!playedNotesRef.current.has(i) && t >= n.time) {
          playedNotesRef.current.add(i);
          triggerLaneNote(n.lane);
        }
      });

      if (t >= lastTime) {
        stopPreview();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  /** 导出 JSON 文件 */
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(chart, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chart.metadata.title || 'chart'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 导入 JSON 文件 */
  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseChart(JSON.parse(String(reader.result)));
        if (parsed) setChart(parsed);
        else alert('Invalid chart file.');
      } catch {
        alert('Failed to parse JSON.');
      }
    };
    reader.readAsText(file);
  };

  /** 保存到本地自定义谱面库 */
  const handleSave = () => {
    // 去重：按 title+author 覆盖同名片
    const others = customCharts.filter(
      (c) =>
        !(
          c.metadata.title === chart.metadata.title &&
          c.metadata.author === chart.metadata.author
        ),
    );
    setCustomCharts([...others, chart]);
    alert('Chart saved to your library!');
  };

  /** 自动生成：按密度在节拍上随机放置音符 */
  const handleGenerate = (perBeat: number) => {
    const beat = beatDuration(chart.metadata.bpm);
    const totalBeats = 16; // 默认生成 16 小节 * 4
    const notes: ChartNote[] = [];
    for (let b = 0; b < totalBeats; b++) {
      for (let s = 0; s < perBeat; s++) {
        // 每个时间点有 60% 概率生成音符，避免过满
        if (Math.random() < 0.6) {
          notes.push({
            time: (b + s / perBeat) * beat,
            lane: Math.floor(Math.random() * 9) as ChartNote['lane'],
            type: 'tap',
          });
        }
      }
    }
    setChart({ ...chart, notes: notes.sort((a, b) => a.time - b.time) });
  };

  /** 跳转到游戏页测试当前谱面 */
  const handleTestPlay = () => {
    stopPreview();
    setSelected({ chart, source: 'custom' });
    setRhythmStatus('idle');
    navigate('/');
    // 直接进入游戏需要稍等路由切换
    setTimeout(() => setRhythmStatus('playing'), 80);
  };

  const handleClear = () => {
    if (confirm('Clear all notes?')) setChart({ ...chart, notes: [] });
  };

  const handleNew = () => {
    if (confirm('Discard current chart and start a new one?')) {
      setChart(createEmptyChart());
    }
  };

  return (
    <div className="h-svh w-svw flex flex-col bg-slate-950 text-white overflow-hidden">
      <EditorToolbar
        chart={chart}
        onChange={setChart}
        onExport={handleExport}
        onImport={handleImport}
        onSave={handleSave}
        onPreview={handleTestPlay}
        onGenerate={handleGenerate}
        onBack={() => navigate('/')}
      />

      {/* 预览控制条 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border-b border-white/10 text-xs">
        <button
          onClick={isPlaying ? stopPreview : playPreview}
          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? 'Stop Preview' : 'Preview (metronome)'}
        </button>
        <button
          onClick={stopPreview}
          className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded"
        >
          <Square size={14} /> Reset
        </button>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <label className="flex items-center gap-1">
          Subdivision
          <select
            value={subdivision}
            onChange={(e) => setSubdivision(Number(e.target.value))}
            className="bg-white/10 rounded px-2 py-1 outline-none"
          >
            <option value={1} className="bg-slate-800">1/beat</option>
            <option value={2} className="bg-slate-800">1/2 beat</option>
            <option value={4} className="bg-slate-800">1/4 beat</option>
            <option value={8} className="bg-slate-800">1/8 beat</option>
          </select>
        </label>
        <div className="flex-1" />
        <button
          onClick={handleClear}
          className="flex items-center gap-1 bg-red-600/80 hover:bg-red-500 px-3 py-1.5 rounded"
        >
          <Trash2 size={14} /> Clear notes
        </button>
        <button
          onClick={handleNew}
          className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded"
        >
          New
        </button>
      </div>

      <EditorTimeline
        chart={chart}
        onChange={setChart}
        playhead={playhead}
        subdivision={subdivision}
      />
    </div>
  );
}

export default EditorPage;
