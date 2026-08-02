import * as Tone from 'tone';

let polySynth: Tone.PolySynth;
let reverb: Tone.Reverb;
let audioInitialized = false;

const KEYS = ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'];

export const scales = {
  'C Major Chord': ['C2', 'E2', 'G2', 'A2', 'C3', 'G3', 'A3', 'C4', 'E4'],
  'C Major Scale': ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3'],
  'Pentatonic':    ['C2', 'D2', 'E2', 'G2', 'A2', 'C3', 'D3', 'E3', 'G3'],
  'Harmonic Minor':['C2', 'D2', 'Eb2', 'F2', 'G2', 'Ab2', 'B2', 'C3', 'D3'],
  'Blues':         ['C2', 'Eb2', 'F2', 'F#2', 'G2', 'Bb2', 'C3', 'Eb3', 'F3'],
};

export type ScaleName = keyof typeof scales;

let currentScale: Record<string, string> = {};

function buildScaleMap(scaleName: ScaleName): Record<string, string> {
  const notes = scales[scaleName];
  const scaleMap: Record<string, string> = {};
  KEYS.forEach((key, index) => {
    scaleMap[key] = notes[index];
  });
  return scaleMap;
}

currentScale = buildScaleMap('C Major Scale');

async function initializeAudio() {
  if (audioInitialized) return;
  
  await Tone.start();
  reverb = new Tone.Reverb(0.7).toDestination();
  polySynth = new Tone.PolySynth(Tone.Synth, {
    volume: 10,
  }).connect(reverb);
  // maxPolyphony 提升到 64：编辑器预览中 hold 长条音符持续发声会同时占用多个复音
  polySynth.maxPolyphony = 64;
  audioInitialized = true;
  console.log('Audio context started and initialized.');
}

export const audioManager = {
  start: initializeAudio,
  setScale: (scaleName: ScaleName) => {
    currentScale = buildScaleMap(scaleName);
  },
  setCustomScale: (notes: string[]) => {
    const scaleMap: Record<string, string> = {};
    KEYS.forEach((key, index) => {
      scaleMap[key] = notes[index];
    });
    currentScale = scaleMap;
  },
  playNote: (key: string) => {
    if (!audioInitialized) return;
    const note = currentScale[key];
    if (note) {
      polySynth.triggerAttack(note, Tone.now());
    }
  },
  releaseNote: (key: string) => {
    if (!audioInitialized) return;
    const note = currentScale[key];
    if (note) {
      polySynth.triggerRelease(note, Tone.now());
    }
  },
  releaseAll: () => {
    if (!audioInitialized) return;
    polySynth.releaseAll();
  },
  isInitialized: () => audioInitialized,
  /**
   * 节拍器滴答声（谱面编辑器预览用）。
   * accent = true 表示每小节第 1 拍（强拍），音调更高。
   */
  playTick: (accent: boolean) => {
    if (!audioInitialized) return;
    polySynth.triggerAttackRelease(accent ? 'G6' : 'D6', '32n', Tone.now(), 0.6);
  },
  /**
   * 按轨道号试听音符（谱面编辑器预览用）。
   * @param lane       轨道下标 0~8
   * @param durationMs 持续毫秒数（可选）：
   *                   不传时按 16 分音符短促发声（tap 音符）；
   *                   传入时声音持续对应时长（hold 长条音符的持续发声效果）。
   */
  playLaneNote: (lane: number, durationMs?: number) => {
    if (!audioInitialized) return;
    const key = KEYS[lane];
    const note = key !== undefined ? currentScale[key] : undefined;
    if (note) {
      // Tone.js 的 duration 参数支持秒数；短音用 '16n' 记谱时长更干脆
      const duration = durationMs && durationMs > 0 ? durationMs / 1000 : '16n';
      polySynth.triggerAttackRelease(note, duration, Tone.now());
    }
  },
};
