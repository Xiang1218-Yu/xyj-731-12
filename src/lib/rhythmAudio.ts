/**
 * 节奏游戏的音频辅助模块。
 *
 * 在原有 audioManager（用于菜单/旧模式的按键发声）之外，
 * 这里提供：
 *  - 基于轨道编号 0~8 的合成音符发声（tap / hold）；
 *  - 一个简单的节拍器（用于编辑器预览与节拍对齐）。
 *
 * 全部基于 Tone.js，需要先调用 init()（通常在首次用户交互时）。
 */

import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;
let metronome: Tone.MembraneSynth | null = null;
let initialized = false;

/** 轨道对应的音高（与主游戏音阶 C Major Scale 对应） */
const LANE_NOTES = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3'];

/** 初始化（幂等） */
export async function initRhythmAudio(): Promise<void> {
  if (initialized) return;
  await Tone.start();
  synth = new Tone.PolySynth(Tone.Synth, { volume: -6 }).toDestination();
  metronome = new Tone.MembraneSynth({ volume: -12 }).toDestination();
  initialized = true;
}

export function isRhythmAudioReady(): boolean {
  return initialized;
}

/** 触发某个轨道的单点音符（立即发声） */
export function triggerLaneNote(lane: number, when?: number): void {
  if (!synth) return;
  const note = LANE_NOTES[lane] ?? 'C4';
  synth.triggerAttackRelease(note, '8n', when ?? Tone.now());
}

/** 长按音符开始 */
export function triggerLaneAttack(lane: number): void {
  if (!synth) return;
  const note = LANE_NOTES[lane] ?? 'C4';
  synth.triggerAttack(note, Tone.now());
}

/** 长按音符结束 */
export function triggerLaneRelease(lane: number): void {
  if (!synth) return;
  const note = LANE_NOTES[lane] ?? 'C4';
  synth.triggerRelease(note, Tone.now());
}

/** 节拍器：accent=true 时音调更高（强拍） */
export function click(accent = false): void {
  if (!metronome) return;
  metronome.triggerAttackRelease(accent ? 'C4' : 'C3', '32n');
}

/** 释放所有正在发声的音符 */
export function releaseAllRhythm(): void {
  synth?.releaseAll();
}
