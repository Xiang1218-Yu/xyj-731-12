/**
 * 成绩记录存储模块（localStorage）。
 *
 * 结构化设计，避免 localStorage 空间溢出：
 * 1. 全部记录存放在【单个 key】下的一个 JSON 对象中（带版本号，便于未来迁移），
 *    而不是每条记录一个 key（多 key 会浪费空间且难以管理）；
 * 2. 记录条数上限 500 条，超出时自动淘汰最旧的记录；
 * 3. 写入时捕获 QuotaExceededError：先将历史记录砍掉一半再重试一次，
 *    仍失败则静默放弃，保证游戏流程不被存储异常打断。
 */

/** 单条成绩记录：一局游戏结束时产生 */
export interface ScoreRecord {
  /** 唯一 id（时间戳 + 随机后缀） */
  id: string;
  /** 歌曲名（谱面标题） */
  songTitle: string;
  /** 难度等级 1~10 */
  difficulty: number;
  /** 总分（含连击加成） */
  score: number;
  /** 准确率百分比 0~100 */
  accuracy: number;
  /** 本局最大连击数 */
  maxCombo: number;
  /** Perfect 判定数 */
  perfect: number;
  /** Good 判定数 */
  good: number;
  /** Miss 判定数 */
  miss: number;
  /** 游玩时间（记录产生时刻，Date.now() 毫秒时间戳） */
  playedAt: number;
  /** 本局时长（毫秒，从开局到结算） */
  durationMs: number;
}

/** localStorage 键名：命名空间 + 版本号 */
const STORAGE_KEY = 'finger-dance:scores:v1';
/** 记录条数上限：约 500 条 * ~150B ≈ 75KB，远低于 5MB 配额 */
const MAX_RECORDS = 500;

/** 磁盘上的整体结构 */
interface ScoreStoreShape {
  version: number;
  records: ScoreRecord[];
}

/** 生成记录唯一 id */
function makeRecordId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取全部成绩（按游玩时间倒序返回；数据损坏时安全返回空数组） */
export function loadScores(): ScoreRecord[] {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as ScoreStoreShape;
    if (!parsed || !Array.isArray(parsed.records)) return [];
    // 倒序：最新的成绩排在最前面
    return [...parsed.records].sort((a, b) => b.playedAt - a.playedAt);
  } catch {
    return [];
  }
}

/** 将记录列表整体写入（内部使用，含容量控制与配额重试） */
function persist(records: ScoreRecord[]): boolean {
  // 容量控制：records 始终维持「新的在前」，直接截掉尾部最旧的
  const trimmed = records.slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: trimmed }));
    return true;
  } catch {
    // 配额已满：清理掉一半历史记录后重试一次
    try {
      const halved = trimmed.slice(0, Math.ceil(trimmed.length / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: halved }));
      return true;
    } catch {
      return false; // 存储彻底不可用（如隐私模式），放弃保存
    }
  }
}

/**
 * 保存一条新成绩。
 * @param data 不含 id 的成绩字段，id 由本模块生成
 * @returns 完整记录；存储失败时返回 null
 */
export function saveScore(data: Omit<ScoreRecord, 'id'>): ScoreRecord | null {
  const record: ScoreRecord = { ...data, id: makeRecordId() };
  const records = [record, ...loadScores()];
  return persist(records) ? record : null;
}

/** 删除单条成绩；返回是否删除成功 */
export function deleteScore(id: string): boolean {
  const records = loadScores();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false; // 目标不存在
  return persist(next);
}

/** 清空全部成绩 */
export function clearScores(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 存储不可用时静默失败 */
  }
}
