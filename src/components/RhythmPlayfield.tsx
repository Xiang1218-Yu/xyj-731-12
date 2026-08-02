/**
 * RhythmPlayfield —— 下落式音符游戏场地。
 *
 * 渲染策略：
 *  - 9 条轨道竖直排列，底部为判定线；
 *  - 每个音符用一个绝对定位的 div 表示，通过 rAF 直接修改其 style.transform
 *    （不经过 React state），保证高刷新率下依然流畅；
 *  - 通过 useRhythmGame 提供的 subscribeFrame 订阅每帧数据。
 */

import { useEffect, useRef } from 'react';
import { LANE_COUNT } from '../types/chart';
import type { FrameData } from '../lib/rhythmEngine';

interface Props {
  subscribeFrame: (cb: (data: FrameData) => void) => () => void;
}

/** 轨道按键标签 */
const LANE_LABELS = ['A', 'S', 'D', 'F', 'SPACE', 'J', 'K', 'L', ';'];

/** 判定线距离场地底部的比例（0~1） */
const JUDGE_LINE_RATIO = 0.88;

function RhythmPlayfield({ subscribeFrame }: Props) {
  // 场地根元素，用于按 lane 索引访问音符 DOM
  const fieldRef = useRef<HTMLDivElement>(null);
  // 存放每个音符的 DOM 节点（key=RenderNote.id）
  const noteElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // 当前可见音符 id 集合，用于移除离开屏幕的音符
  const visibleIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeFrame((data) => {
      const field = fieldRef.current;
      if (!field) return;
      const fieldHeight = field.clientHeight;
      // 判定线在场地中的 y 坐标（像素）
      const judgeY = fieldHeight * JUDGE_LINE_RATIO;
      // 音符从顶部下落到判定线经过的像素距离
      const travel = judgeY;

      const nextVisible = new Set<number>();

      for (const rn of data.notes) {
        nextVisible.add(rn.id);
        let el = noteElsRef.current.get(rn.id);
        if (!el) {
          // 首次出现：创建 DOM
          el = document.createElement('div');
          el.className =
            'absolute w-[8%] rounded-md bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)] pointer-events-none';
          if (rn.type === 'hold') {
            el.style.height = '8px';
            el.style.background = 'linear-gradient(to bottom,#67e8f9,#06b6d4)';
          } else {
            el.style.height = '20px';
          }
          field.appendChild(el);
          noteElsRef.current.set(rn.id, el);
        }

        // headY: 0=顶部, 1=判定线
        const headY = rn.headY;
        // 头部像素 y = (1-headY) 在顶部之上为负
        const y = judgeY - headY * travel;
        // 轨道水平位置
        const laneWidth = 100 / LANE_COUNT;
        el.style.left = `${rn.lane * laneWidth + laneWidth * 0.15}%`;
        el.style.width = `${laneWidth * 0.7}%`;
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        el.style.opacity = rn.judged ? '0.25' : '1';

        // hold 音符：用高度表示从 head 到 tail 的长条
        if (rn.type === 'hold') {
          const tailY = rn.tailY;
          // tail 一般在 head 上方（更小 y），所以高度 = (headY - tailY) * travel
          const holdHeight = Math.max(8, (headY - tailY) * travel);
          el.style.height = `${holdHeight}px`;
        }
      }

      // 移除不可见的音符 DOM
      for (const id of visibleIdsRef.current) {
        if (!nextVisible.has(id)) {
          const el = noteElsRef.current.get(id);
          if (el && el.parentNode) el.parentNode.removeChild(el);
          noteElsRef.current.delete(id);
        }
      }
      visibleIdsRef.current = nextVisible;

      // 更新按键高亮
      const laneEls = field.querySelectorAll<HTMLDivElement>('[data-lane-key]');
      laneEls.forEach((node, idx) => {
        if (data.pressedLanes[idx]) {
          node.classList.add('bg-white/30');
        } else {
          node.classList.remove('bg-white/30');
        }
      });
    });
    return unsubscribe;
  }, [subscribeFrame]);

  return (
    <div
      ref={fieldRef}
      className="relative w-full h-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-900/80 to-slate-800/60 border border-white/10"
    >
      {/* 轨道分隔线 */}
      {Array.from({ length: LANE_COUNT }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-l border-white/5"
          style={{ left: `${(i / LANE_COUNT) * 100}%` }}
        />
      ))}

      {/* 判定线 */}
      <div
        className="absolute left-0 right-0 h-1 bg-cyan-300/80 shadow-[0_0_16px_rgba(103,232,249,0.8)]"
        style={{ top: `${JUDGE_LINE_RATIO * 100}%` }}
      />

      {/* 底部按键区 */}
      <div className="absolute bottom-0 left-0 right-0 flex" style={{ height: '12%' }}>
        {LANE_LABELS.map((label, i) => (
          <div
            key={label}
            data-lane-key={i}
            className={`flex-1 flex items-end justify-center pb-1 text-xs font-bold text-white/40 border-r border-white/10 last:border-r-0 transition-colors ${
              i === 4 ? 'text-[10px]' : ''
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RhythmPlayfield;
