/**
 * 判定策略 selectJudgeTargets 的逻辑自测脚本（node 直接运行，非项目源码）。
 * 运行方式：node --experimental-strip-types scripts/test-judgment.ts
 * （Node 24 已默认支持类型擦除，无需额外依赖）
 */
import { selectJudgeTargets, judgeDeviation, GOOD_WINDOW_MS } from '../src/lib/judgment.ts';

/** 构造测试音符 */
function note(id: string, time: number, lane: number, judged = false) {
  return { id, time, lane, judged, type: 'tap' as const, duration: 0 };
}

let passed = 0;
let failed = 0;

function assert(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}\n        期望: ${e}\n        实际: ${a}`);
  }
}

// --- 场景 1：同轨道两个时间接近的音符，最早的一个优先消耗 ---
{
  const notes = [note('a', 1000, 3), note('b', 1080, 3)];
  // 在 1085ms 按下：旧策略（偏差最小）会选 b，新策略应选最早的 a
  const targets = selectJudgeTargets(notes, 3, 1085);
  assert('同轨接近音符选最早', targets.map((n) => n.id), ['a']);
  // a 被判定后，下一次按键应选中 b
  targets[0].judged = true;
  const next = selectJudgeTargets(notes, 3, 1100);
  assert('第二次按键选中下一个', next.map((n) => n.id), ['b']);
}

// --- 场景 2：同时间戳同轨簇（同轨双押）一次按键一并判定 ---
{
  const notes = [note('a', 2000, 5), note('b', 2000, 5), note('c', 2100, 5)];
  const targets = selectJudgeTargets(notes, 5, 2010);
  assert('同轨同时间戳簇一并返回', targets.map((n) => n.id), ['a', 'b']);
}

// --- 场景 3：超出窗口的旧音符不被按键消耗（留给自动 Miss） ---
{
  const notes = [note('a', 1000, 0), note('b', 1200, 0)];
  // 按键时刻 1200ms：a 已晚 200ms（> Good 窗口 100ms），只能选 b
  const targets = selectJudgeTargets(notes, 0, 1200);
  assert('超窗旧音符不消耗按键', targets.map((n) => n.id), ['b']);
}

// --- 场景 4：无候选（空按）返回空数组 ---
{
  const notes = [note('a', 5000, 2)];
  assert('空按无候选', selectJudgeTargets(notes, 2, 1000), []);
  assert('按错轨道无候选', selectJudgeTargets(notes, 4, 5000), []);
}

// --- 场景 5：已判定音符跳过 ---
{
  const notes = [note('a', 1000, 1, true), note('b', 1030, 1)];
  const targets = selectJudgeTargets(notes, 1, 1035);
  assert('跳过已判定音符', targets.map((n) => n.id), ['b']);
}

// --- 场景 6：窗口边界（Good 窗口 ±100ms） ---
{
  const notes = [note('a', 1000, 6)];
  assert('早 100ms 边界可选中', selectJudgeTargets(notes, 6, 900).map((n) => n.id), ['a']);
  assert('晚 100ms 边界可选中', selectJudgeTargets(notes, 6, 1100).map((n) => n.id), ['a']);
  assert('早 101ms 超出窗口', selectJudgeTargets(notes, 6, 899), []);
}

// --- 场景 7：判定等级映射 ---
{
  assert('45ms = Perfect', judgeDeviation(45), 'perfect');
  assert('46ms = Good', judgeDeviation(46), 'good');
  assert('100ms = Good', judgeDeviation(100), 'good');
  assert('101ms = null', judgeDeviation(101), null);
  assert('Good 窗口常量 = 100', GOOD_WINDOW_MS, 100);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
