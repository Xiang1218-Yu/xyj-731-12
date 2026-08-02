/**
 * 成绩记录存储模块 v2（localStorage）。
 *
 * 完整的「防 localStorage 空间溢出」方案：
 *
 * 1.【分片存储】记录按 100 条一个分片拆到多个 key 中
 *    （index 分片目录 + shard.0 ~ shard.N），避免单个 key 的 JSON 无限膨胀、
 *    读写全量反序列化开销过大；淘汰时按分片整体丢弃，高效简单。
 *
 * 2.【数据压缩】记录以「位置数组（元组）」而非对象存储，
 *    每条记录省去 11 个重复字段名（约节省 40% 体积），
 *    准确率等浮点数只保留两位小数。
 *
 * 3.【容量上限】最多保留 500 条（5 个分片，约 60KB，远低于 5MB 配额），
 *    超出时自动淘汰最旧的记录。
 *
 * 4.【配额兜底】写入捕获 QuotaExceededError：砍掉一半历史后重试一次，
 *    仍失败则静默放弃，游戏流程不被存储异常打断。
 *
 * 5.【版本迁移】自动检测并迁移 v1 格式（单 key 对象数组）的历史成绩。
 */

/** 单条成绩记录（内存中的完整对象结构） */
export interface ScoreRecord {
  /** 唯一 id（时间戳 + 随机后缀） */
  id: string;
  /** 歌曲名（谱面标题） */
  songTitle: string;
  /** 难度等级 1~10 */
  difficulty: number;
  /** 总分（含连击加成） */
  score: number;
  /** 准确率百分比 0~100（存储时保留两位小数） */
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

// ---------------------------------------------------------------------------
// 存储结构定义
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'finger-dance:scores';
/** v1 旧格式 key（单 key 对象数组），仅用于迁移 */
const LEGACY_V1_KEY = `${KEY_PREFIX}:v1`;
/** v2 分片目录 key */
const INDEX_KEY = `${KEY_PREFIX}:v2:index`;
/** v2 分片 key（n 从 0 开始，0 号分片存放最新记录） */
const shardKey = (n: number) => `${KEY_PREFIX}:v2:shard.${n}`;

/** 每个分片的记录条数 */
const SHARD_SIZE = 100;
/** 记录总条数上限：500 条 * ~120B ≈ 60KB */
const MAX_RECORDS = 500;

/**
 * 压缩元组：与 ScoreRecord 字段的位置对应关系。
 * 用数组替代对象，省去每条记录重复的字段名开销。
 * （用常量对象而非 enum：项目 tsconfig 开启了 erasableSyntaxOnly，不允许枚举语法）
 */
const Field = {
  Id: 0,
  SongTitle: 1,
  Difficulty: 2,
  Score: 3,
  Accuracy: 4,
  MaxCombo: 5,
  Perfect: 6,
  Good: 7,
  Miss: 8,
  PlayedAt: 9,
  DurationMs: 10,
} as const;
/** 磁盘上的单条记录结构（位置数组） */
type CompactRecord = [string, string, number, number, number, number, number, number, number, number, number];

/** v2 分片目录结构 */
interface IndexShape {
  v: 2;
  count: number;
  shards: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// 压缩 / 解压
// ---------------------------------------------------------------------------

/** 对象 → 压缩元组（准确率保留两位小数，进一步控制体积） */
function pack(r: ScoreRecord): CompactRecord {
  return [
    r.id,
    r.songTitle,
    r.difficulty,
    r.score,
    Math.round(r.accuracy * 100) / 100,
    r.maxCombo,
    r.perfect,
    r.good,
    r.miss,
    r.playedAt,
    r.durationMs,
  ];
}

/** 压缩元组 → 对象（字段缺失时容忍跳过，返回 null） */
function unpack(t: unknown): ScoreRecord | null {
  if (!Array.isArray(t) || t.length !== 11) return null;
  const rec = t as CompactRecord;
  if (typeof rec[Field.Id] !== 'string' || typeof rec[Field.SongTitle] !== 'string') return null;
  return {
    id: rec[Field.Id],
    songTitle: rec[Field.SongTitle],
    difficulty: Number(rec[Field.Difficulty]) || 0,
    score: Number(rec[Field.Score]) || 0,
    accuracy: Number(rec[Field.Accuracy]) || 0,
    maxCombo: Number(rec[Field.MaxCombo]) || 0,
    perfect: Number(rec[Field.Perfect]) || 0,
    good: Number(rec[Field.Good]) || 0,
    miss: Number(rec[Field.Miss]) || 0,
    playedAt: Number(rec[Field.PlayedAt]) || 0,
    durationMs: Number(rec[Field.DurationMs]) || 0,
  };
}

// ---------------------------------------------------------------------------
// 底层读写（分片）
// ---------------------------------------------------------------------------

/** 读取分片目录；不存在或损坏时返回 null */
function readIndex(): IndexShape | null {
  try {
    const text = localStorage.getItem(INDEX_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as IndexShape;
    if (parsed?.v !== 2 || typeof parsed.shards !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 将记录列表按分片大小切片后整体落盘（含目录），返回是否成功 */
function writeShards(records: ScoreRecord[]): boolean {
  const trimmed = records.slice(0, MAX_RECORDS);
  const shardCount = Math.max(1, Math.ceil(trimmed.length / SHARD_SIZE));
  try {
    for (let i = 0; i < shardCount; i++) {
      const slice = trimmed.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE).map(pack);
      localStorage.setItem(shardKey(i), JSON.stringify(slice));
    }
    // 清理可能残留的旧分片（记录变少时）
    const prev = readIndex();
    if (prev) {
      for (let i = shardCount; i < prev.shards; i++) {
        localStorage.removeItem(shardKey(i));
      }
    }
    const index: IndexShape = { v: 2, count: trimmed.length, shards: shardCount, updatedAt: Date.now() };
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    // 配额已满：砍掉一半历史记录后重试一次
    try {
      const halved = trimmed.slice(0, Math.ceil(trimmed.length / 2));
      const halvedShards = Math.max(1, Math.ceil(halved.length / SHARD_SIZE));
      for (let i = 0; i < halvedShards; i++) {
        const slice = halved.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE).map(pack);
        localStorage.setItem(shardKey(i), JSON.stringify(slice));
      }
      const index: IndexShape = { v: 2, count: halved.length, shards: halvedShards, updatedAt: Date.now() };
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      return true;
    } catch {
      return false; // 存储彻底不可用（如隐私模式），放弃保存
    }
  }
}

/** 读取全部分片并拼成记录列表（单个分片损坏时跳过该分片） */
function readShards(): ScoreRecord[] {
  const index = readIndex();
  if (!index) return [];
  const records: ScoreRecord[] = [];
  for (let i = 0; i < index.shards; i++) {
    try {
      const text = localStorage.getItem(shardKey(i));
      if (!text) continue;
      const parsed = JSON.parse(text) as unknown[];
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        const rec = unpack(item);
        if (rec) records.push(rec);
      }
    } catch {
      continue; // 跳过损坏分片
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// v1 → v2 迁移
// ---------------------------------------------------------------------------

/**
 * 检测并迁移 v1 历史成绩：
 * v1 为单 key 的对象数组格式，读取后改写为 v2 分片格式并删除旧 key。
 */
function migrateV1IfNeeded(): void {
  if (readIndex()) return; // 已是 v2
  try {
    const text = localStorage.getItem(LEGACY_V1_KEY);
    if (!text) return;
    const parsed = JSON.parse(text) as { version: number; records: ScoreRecord[] };
    if (!parsed || !Array.isArray(parsed.records)) return;
    // 简单校验字段后迁移（倒序：最新的在前）
    const records = parsed.records
      .filter((r) => r && typeof r.id === 'string' && typeof r.songTitle === 'string')
      .sort((a, b) => b.playedAt - a.playedAt);
    if (writeShards(records)) {
      localStorage.removeItem(LEGACY_V1_KEY);
    }
  } catch {
    /* 旧数据损坏则放弃迁移，不影响新数据写入 */
  }
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

/** 读取全部成绩（按游玩时间倒序；自动完成 v1 迁移；数据损坏时安全返回空数组） */
export function loadScores(): ScoreRecord[] {
  try {
    migrateV1IfNeeded();
    const records = readShards();
    // 倒序：最新的成绩排在最前面
    return records.sort((a, b) => b.playedAt - a.playedAt);
  } catch {
    return [];
  }
}

/** 生成记录唯一 id */
function makeRecordId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 保存一条新成绩。
 * @param data 不含 id 的成绩字段，id 由本模块生成
 * @returns 完整记录；存储失败时返回 null
 */
export function saveScore(data: Omit<ScoreRecord, 'id'>): ScoreRecord | null {
  const record: ScoreRecord = { ...data, id: makeRecordId() };
  const records = [record, ...loadScores()];
  return writeShards(records) ? record : null;
}

/** 删除单条成绩；返回是否删除成功 */
export function deleteScore(id: string): boolean {
  const records = loadScores();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false; // 目标不存在
  return writeShards(next);
}

/** 清空全部成绩（目录 + 所有分片 + v1 残留） */
export function clearScores(): void {
  try {
    const index = readIndex();
    if (index) {
      for (let i = 0; i < index.shards; i++) {
        localStorage.removeItem(shardKey(i));
      }
    }
    localStorage.removeItem(INDEX_KEY);
    localStorage.removeItem(LEGACY_V1_KEY);
  } catch {
    /* 存储不可用时静默失败 */
  }
}
