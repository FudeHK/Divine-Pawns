/**
 * ステータス計算。
 * 計算順: 基本値 × ★倍率 → 装備の固定値を加算 → 割合補正の合計を乗算 (1 + Σ%)
 */

import { DEFAULT_CONFIG, type BattleConfig } from './config';
import type {
  BlessingDef,
  BuildMod,
  Element,
  EquipmentDef,
  Myth,
  Role,
  Star,
  StatKey,
  Stats,
} from './types';
import { STAT_KEYS } from './types';

/** ★倍率が乗るステータス（HP・攻撃力） */
export const STAR_SCALED_STATS: readonly StatKey[] = ['maxHp', 'atk'];

export function emptyStats(): Stats {
  return {
    maxHp: 0,
    atk: 0,
    def: 0,
    atkSpeed: 0,
    range: 0,
    maxMana: 0,
    moveSpeed: 0,
  };
}

export function cloneStats(s: Stats): Stats {
  return { ...s };
}

/** 役割ごとの基本ステータスの目安 */
export const ROLE_BASE: Readonly<Record<Role, Stats>> = {
  tank: { maxHp: 1400, atk: 40, def: 40, atkSpeed: 0.6, range: 1, maxMana: 100, moveSpeed: 1.6 },
  melee: { maxHp: 900, atk: 78, def: 20, atkSpeed: 0.9, range: 1, maxMana: 100, moveSpeed: 2.0 },
  ranged: { maxHp: 640, atk: 88, def: 12, atkSpeed: 0.8, range: 4, maxMana: 100, moveSpeed: 1.8 },
  mage: { maxHp: 600, atk: 96, def: 10, atkSpeed: 0.7, range: 3, maxMana: 100, moveSpeed: 1.6 },
  healer: { maxHp: 700, atk: 54, def: 12, atkSpeed: 0.7, range: 3, maxMana: 100, moveSpeed: 1.6 },
  support: { maxHp: 760, atk: 60, def: 16, atkSpeed: 0.75, range: 3, maxMana: 100, moveSpeed: 1.8 },
};

/** 役割とティアから基本ステータスを作る（データ定義用のヘルパー） */
export function makeBase(
  role: Role,
  tier: 1 | 2 | 3,
  override: Partial<Stats> = {},
  cfg: BattleConfig = DEFAULT_CONFIG,
): Stats {
  const m = cfg.tierMul[tier];
  const b = ROLE_BASE[role];
  const out: Stats = {
    maxHp: Math.round(b.maxHp * m),
    atk: Math.round(b.atk * m),
    def: Math.round(b.def * m),
    atkSpeed: b.atkSpeed,
    range: b.range,
    maxMana: b.maxMana,
    moveSpeed: b.moveSpeed,
  };
  return { ...out, ...override };
}

/** 編成上の1人分の素性（BuildMod のフィルタ判定に使う） */
export interface BuildIdentity {
  element: Element;
  role: Role;
  myth: Myth;
}

export interface BuildContext {
  /** 編成全員（前衛＋サポート）の素性 */
  roster: readonly BuildIdentity[];
}

function matchesFilter(id: BuildIdentity, f: BuildMod['filter']): boolean {
  if (!f) return true;
  if (f.element !== undefined && f.element !== id.element) return false;
  if (f.role !== undefined && f.role !== id.role) return false;
  if (f.myth !== undefined && f.myth !== id.myth) return false;
  return true;
}

function requireOk(req: BuildMod['require'], ctx: BuildContext): boolean {
  if (!req) return true;
  if (req === 'allDistinctElements') {
    const set = new Set(ctx.roster.map((r) => r.element));
    return set.size === ctx.roster.length;
  }
  return true;
}

/** 加護から、その1人に効く BuildMod を集める */
export function collectBlessingMods(
  blessings: readonly BlessingDef[],
  id: BuildIdentity,
  ctx: BuildContext,
): BuildMod[] {
  const out: BuildMod[] = [];
  for (const b of blessings) {
    for (const m of b.buildMods ?? []) {
      if (!requireOk(m.require, ctx)) continue;
      if (!matchesFilter(id, m.filter)) continue;
      out.push(m);
    }
  }
  return out;
}

export interface BuildStatsInput {
  base: Stats;
  star: Star;
  equipment: readonly EquipmentDef[];
  /** 加護などの追加補正 */
  extraMods?: readonly BuildMod[];
  cfg?: BattleConfig;
}

/**
 * 最終ステータスを計算する。
 * 1. 基本値 × ★倍率（HP・攻撃力のみ）
 * 2. 装備／加護の固定値を加算
 * 3. 割合補正の合計を乗算（1 + Σ%）
 */
export function buildStats(input: BuildStatsInput): Stats {
  const cfg = input.cfg ?? DEFAULT_CONFIG;
  const starMul = cfg.starStatMul[input.star];

  // 1. ★倍率
  const s: Stats = cloneStats(input.base);
  for (const k of STAR_SCALED_STATS) {
    s[k] = s[k] * starMul;
  }

  // 2. 固定値の加算
  for (const eq of input.equipment) {
    if (!eq.flat) continue;
    for (const k of STAT_KEYS) {
      const v = eq.flat[k];
      if (v !== undefined) s[k] += v;
    }
  }
  for (const m of input.extraMods ?? []) {
    if (m.mode === 'flat') s[m.stat] += m.value;
  }

  // 3. 割合補正の合計を乗算
  const pctSum: Record<StatKey, number> = {
    maxHp: 0,
    atk: 0,
    def: 0,
    atkSpeed: 0,
    range: 0,
    maxMana: 0,
    moveSpeed: 0,
  };
  for (const eq of input.equipment) {
    if (!eq.pct) continue;
    for (const k of STAT_KEYS) {
      const v = eq.pct[k];
      if (v !== undefined) pctSum[k] += v;
    }
  }
  for (const m of input.extraMods ?? []) {
    if (m.mode === 'pct') pctSum[m.stat] += m.value;
  }
  for (const k of STAT_KEYS) {
    if (pctSum[k] !== 0) s[k] = s[k] * (1 + pctSum[k]);
  }

  return s;
}

/** ★によるスキル係数の倍率 */
export function skillStarMul(star: Star, cfg: BattleConfig = DEFAULT_CONFIG): number {
  return cfg.starSkillMul[star];
}

/** 通常ダメージ = 攻撃力 × K ÷ (K + 防御) */
export function normalDamage(
  atk: number,
  def: number,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  const K = cfg.defenseConstant;
  return (atk * K) / (K + Math.max(0, def));
}

/** 攻撃間隔（秒） */
export function attackInterval(atkSpeed: number): number {
  if (!(atkSpeed > 0)) return Number.POSITIVE_INFINITY;
  return 1 / atkSpeed;
}
