import { useCallback, useRef, useState } from 'react';

/**
 * 通用的撤销/重做（Undo/Redo）状态管理 Hook。
 *
 * 维护三段式历史：past（历史栈）/ present（当前值）/ future（重做栈）。
 * - set：提交一个新值，将旧的 present 压入 past，并清空 future（产生新分支）。
 * - undo：回退到上一状态（present 压入 future）。
 * - redo：前进到下一状态（present 压入 past）。
 * - reset：用一个新值重置全部历史（如导入谱面时）。
 *
 * 为避免连续微小改动（例如拖拽过程中每帧都变化）产生过多历史项，
 * set 支持 `coalesce` 选项：为 true 时不新增历史项，只替换当前 present。
 *
 * @param initial 初始值
 * @param limit   历史最大深度（防止内存无限增长），默认 100
 */
export function useHistory<T>(initial: T, limit = 100) {
  const [present, setPresent] = useState<T>(initial);
  // past/future 用 ref 存储，避免每次修改都触发额外渲染；
  // canUndo/canRedo 用独立 state 暴露给 UI。
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  /**
   * 提交新值。
   * @param updater 新值，或基于当前值计算新值的函数
   * @param coalesce 为 true 时合并到当前历史项（不新增撤销点），用于拖拽等连续操作
   */
  const set = useCallback(
    (updater: T | ((prev: T) => T), coalesce = false) => {
      setPresent((prev) => {
        const next =
          typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        if (next === prev) return prev; // 无变化，不记录历史。
        if (!coalesce) {
          past.current.push(prev);
          if (past.current.length > limit) past.current.shift();
          future.current = []; // 新操作会清空重做栈。
        }
        return next;
      });
      // 在下一微任务同步标志，确保 past/future 已更新。
      queueMicrotask(syncFlags);
    },
    [limit, syncFlags]
  );

  /** 撤销：回退到上一状态。 */
  const undo = useCallback(() => {
    setPresent((prev) => {
      if (past.current.length === 0) return prev;
      const previous = past.current.pop()!;
      future.current.unshift(prev);
      return previous;
    });
    queueMicrotask(syncFlags);
  }, [syncFlags]);

  /** 重做：前进到下一状态。 */
  const redo = useCallback(() => {
    setPresent((prev) => {
      if (future.current.length === 0) return prev;
      const next = future.current.shift()!;
      past.current.push(prev);
      return next;
    });
    queueMicrotask(syncFlags);
  }, [syncFlags]);

  /** 重置全部历史（丢弃所有撤销/重做记录）。 */
  const reset = useCallback(
    (value: T) => {
      past.current = [];
      future.current = [];
      setPresent(value);
      queueMicrotask(syncFlags);
    },
    [syncFlags]
  );

  return { state: present, set, undo, redo, reset, canUndo, canRedo };
}
