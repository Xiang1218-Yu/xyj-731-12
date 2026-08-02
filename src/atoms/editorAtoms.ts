/**
 * 谱面编辑器（/editor 独立页面）的状态（Jotai）。
 * 编辑器不依赖游戏主页的任何 atom，保证两个页面完全解耦。
 */
import { atom } from 'jotai';
import { createDefaultMetadata } from '../lib/chart';
import type { Chart, ChartMetadata, ChartNote, NoteType } from '../types/chart';

/** 正在编辑的谱面元数据（标题 / 作者 / BPM / 偏移量 / 难度） */
export const editorMetadataAtom = atom<ChartMetadata>(createDefaultMetadata());

/** 正在编辑的音符序列（始终按 time 升序维护） */
export const editorNotesAtom = atom<ChartNote[]>([]);

/** 派生：完整谱面对象（导出 / 保存曲库 / 预览时使用） */
export const editorChartAtom = atom<Chart>((get) => ({
  metadata: get(editorMetadataAtom),
  notes: get(editorNotesAtom),
}));

/** 当前放置音符的类型（tap 单点 / hold 长条） */
export const editorNoteTypeAtom = atom<NoteType>('tap');

/** 长条音符的默认长度（单位：拍），放置 hold 时使用 */
export const editorHoldBeatsAtom = atom<number>(1);

/**
 * 节拍吸附精度（每拍切几格）：
 * 1 = 四分音符网格，2 = 八分音符网格，4 = 十六分音符网格。
 */
export const editorSnapDivisionAtom = atom<1 | 2 | 4>(2);

/** 时间轴缩放倍率（1 = 基准 0.12px/ms，范围 0.25 ~ 4） */
export const editorZoomAtom = atom<number>(1);

/** 播放头位置（毫秒）：预览播放与点击标尺跳转都会更新它 */
export const editorPlayheadMsAtom = atom<number>(0);

/** 预览是否正在播放 */
export const editorIsPlayingAtom = atom<boolean>(false);

/** 随机生成参数：音符密度（平均每拍音符数） */
export const editorDensityAtom = atom<number>(1);

/** 随机生成参数：生成拍数（决定谱面长度） */
export const editorGenerateBeatsAtom = atom<number>(64);

/** 当前选中的音符 id（Delete 键删除、高亮显示用） */
export const editorSelectedNoteIdAtom = atom<string | null>(null);

/** 状态栏提示消息（导入成功 / 导出成功 / 错误信息等），空串表示无消息 */
export const editorStatusAtom = atom<string>('');
