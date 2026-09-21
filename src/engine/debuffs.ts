/**
 * 属性デバフ（燃焼・凍傷・猛毒・麻痺）。
 * ストック・効果時間・秒間ダメージに上限はない。係数はすべて設定値。
 */

import { DEFAULT_CONFIG, type BattleConfig } from './config';
import type { DebuffKind } from './types';

export interface BurnState {
  stacks: number;
  /** 付与時点で確定する燃焼係数（付与者が複数なら高い方） */
  coef: number;
  /** 係数を決めた付与者のユニットID（ダメージの帰属に使う） */
  sourceId: string | null;
}

export interface FrostbiteState {
  stacks: number;
}

export interface PoisonState {
  /** 残り効果時間（秒） */
  remaining: number;
  /** 効果が続いている経過秒数 */
  elapsed: number;
  /** 付与時点で確定する猛毒係数（付与者が複数なら高い方） */
  coef: number;
  /** 係数を決めた付与者のユニットID（ダメージの帰属に使う） */
  sourceId: string | null;
}

export interface ParalysisState {
  stacks: number;
}

export interface DebuffState {
  burn: BurnState;
  frostbite: FrostbiteState;
  poison: PoisonState;
  paralysis: ParalysisState;
}

export function newDebuffState(): DebuffState {
  return {
    burn: { stacks: 0, coef: 0, sourceId: null },
    frostbite: { stacks: 0 },
    poison: { remaining: 0, elapsed: 0, coef: 0, sourceId: null },
    paralysis: { stacks: 0 },
  };
}

/** 表示用：デバフのストック数 */
export function debuffStacks(d: DebuffState, kind: DebuffKind): number {
  switch (kind) {
    case 'burn':
      return d.burn.stacks;
    case 'frostbite':
      return d.frostbite.stacks;
    case 'poison':
      return d.poison.remaining;
    case 'paralysis':
      return d.paralysis.stacks;
  }
}

// ---------------------------------------------------------------------------
// 有効ストック
// ---------------------------------------------------------------------------

/**
 * 凍傷と麻痺は、有効ストック = ストック数 × (1 − 耐性)。
 * 燃焼と猛毒は防御を無視し、耐性もない。
 */
export function effectiveStacks(stacks: number, resist: number): number {
  return stacks * (1 - resist);
}

// ---------------------------------------------------------------------------
// 燃焼（炎）
// ---------------------------------------------------------------------------

/** 燃焼係数 = 付与者の攻撃力 × 係数（付与時点の値） */
export function burnCoefFromAtk(
  atk: number,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  return atk * cfg.debuff.burn.coefPerAtk;
}

/** 毎秒のダメージ = ストック数 × 燃焼係数 */
export function burnTickDamage(s: BurnState): number {
  return s.stacks * s.coef;
}

/** 燃焼の付与（係数は高い方を採用） */
export function applyBurn(
  s: BurnState,
  stacks: number,
  coef: number,
  sourceId: string | null = null,
): void {
  s.stacks += stacks;
  if (coef > s.coef || s.sourceId === null) {
    s.coef = Math.max(s.coef, coef);
    s.sourceId = sourceId;
  }
}

// ---------------------------------------------------------------------------
// 凍傷（氷）
// ---------------------------------------------------------------------------

/** 攻撃速度 × 1 ÷ (1 + k × 有効ストック) */
export function frostbiteAtkSpeedMul(
  stacks: number,
  resist: number,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  const eff = effectiveStacks(stacks, resist);
  return 1 / (1 + cfg.debuff.frostbite.slowPerStack * eff);
}

// ---------------------------------------------------------------------------
// 猛毒（木）
// ---------------------------------------------------------------------------

export function poisonCoefFromAtk(
  atk: number,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  return atk * cfg.debuff.poison.coefPerAtk;
}

/** 付与のたびに効果時間を延長（係数は高い方を採用） */
export function applyPoison(
  s: PoisonState,
  coef: number,
  durationAdd: number,
  sourceId: string | null = null,
): void {
  if (s.remaining <= 0) s.elapsed = 0;
  s.remaining += durationAdd;
  if (coef > s.coef || s.sourceId === null) {
    s.coef = Math.max(s.coef, coef);
    s.sourceId = sourceId;
  }
}

/** 毎秒のダメージ = 係数 × (1 + floor(経過秒数 / rampInterval)) */
export function poisonTickDamage(
  s: PoisonState,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  if (s.remaining <= 0) return 0;
  const ramp = 1 + Math.floor(s.elapsed / cfg.debuff.poison.rampInterval);
  return s.coef * ramp;
}

// ---------------------------------------------------------------------------
// 麻痺（雷）
// ---------------------------------------------------------------------------

/** 阻止確率 = 有効ストック ÷ (有効ストック + C) */
export function paralysisBlockChance(
  stacks: number,
  resist: number,
  cfg: BattleConfig = DEFAULT_CONFIG,
): number {
  const eff = effectiveStacks(stacks, resist);
  if (eff <= 0) return 0;
  return eff / (eff + cfg.debuff.paralysis.resistConstant);
}
