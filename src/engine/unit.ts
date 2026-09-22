/**
 * 戦闘中のユニット。
 */

import { newDebuffState, type DebuffState } from './debuffs';
import { cloneStats, emptyStats } from './stats';
import type {
  EffectDef,
  Element,
  GlobalModKey,
  Hex,
  Myth,
  Role,
  Side,
  Star,
  StatKey,
  Stats,
} from './types';

/** 時限つきのステータス補正 */
export interface TimedMod {
  stat: StatKey;
  mode: 'flat' | 'pct';
  value: number;
  /** 残り時間（秒）。Infinity なら永続 */
  remaining: number;
  sourceId: string;
}

/** 時限つきの被ダメージ軽減 */
export interface DamageReduction {
  pct: number;
  remaining: number;
  sourceId: string;
}

/** 効果定義の実行時状態 */
export interface RuntimeEffect {
  def: EffectDef;
  /** 発動回数 */
  uses: number;
  /** everyN 用のタイマー */
  timer: number;
  /** hpBelow / atTime 用の発動済みフラグ */
  fired: boolean;
  /** always 系の statMod を今フレーム適用したか */
  active: boolean;
  /** 効果の出どころ（'passive' | 'support' | 'equipment' | 'blessing' | 'active' | 'enemy'） */
  origin: string;
}

export interface Unit {
  id: string;
  defId: string;
  name: string;
  side: Side;
  role: Role;
  element: Element;
  myth: Myth | null;
  star: Star;
  isBoss: boolean;
  /** 盤面に出ているか（false = サポート枠） */
  onField: boolean;
  /** 盤面位置（onField のときのみ意味を持つ） */
  pos: Hex;

  /** 装備・加護込みの最終ステータス（戦闘中は変わらない基準値） */
  base: Stats;
  /** そのフレームでの実効ステータス */
  eff: Stats;

  hp: number;
  shield: number;
  mana: number;

  /** 次の攻撃までの残り時間 */
  attackTimer: number;
  /** 1マス移動するまでの進捗（0〜1） */
  moveProgress: number;

  alive: boolean;
  /** 凍傷・麻痺の耐性 */
  resist: number;
  targeting: 'nearest' | 'backline';

  debuffs: DebuffState;
  timedMods: TimedMod[];
  /** 常時効果による補正（毎フレーム作り直す） */
  auraMods: TimedMod[];
  reductions: DamageReduction[];

  /** 挑発の残り時間（>0 の間、敵から優先して狙われる） */
  tauntRemaining: number;
  /** スキル係数への加算%（毎フレーム再計算） */
  skillPowerBonus: number;

  effects: RuntimeEffect[];

  /** 直近の攻撃者 */
  lastAttacker: Unit | null;
  /** 現在の行動対象 */
  currentTarget: Unit | null;

  /** 累計与ダメージ（統計用） */
  damageDealt: number;
  /** 属性別の累計与ダメージ（統計用） */
  damageByElement: Record<Element, number>;
}

export type GlobalMods = Record<GlobalModKey, number>;

export function newGlobalMods(): GlobalMods {
  return {
    burnCoefPct: 0,
    burnCoefMul: 1,
    burnDamagePct: 0,
    poisonDurationAdd: 0,
  };
}

export interface CreateUnitInput {
  id: string;
  defId: string;
  name: string;
  side: Side;
  role: Role;
  element: Element;
  myth: Myth | null;
  star: Star;
  onField: boolean;
  pos: Hex;
  base: Stats;
  resist: number;
  isBoss?: boolean;
  targeting?: 'nearest' | 'backline';
  /** 最初の攻撃までの待ち時間（秒） */
  initialAttackDelay?: number;
}

export function createUnit(i: CreateUnitInput): Unit {
  return {
    id: i.id,
    defId: i.defId,
    name: i.name,
    side: i.side,
    role: i.role,
    element: i.element,
    myth: i.myth,
    star: i.star,
    isBoss: i.isBoss ?? false,
    onField: i.onField,
    pos: { ...i.pos },
    base: cloneStats(i.base),
    eff: cloneStats(i.base),
    hp: i.base.maxHp,
    shield: 0,
    mana: 0,
    attackTimer: Math.max(0, i.initialAttackDelay ?? 0),
    moveProgress: 0,
    alive: true,
    resist: i.resist,
    targeting: i.targeting ?? 'nearest',
    debuffs: newDebuffState(),
    timedMods: [],
    auraMods: [],
    reductions: [],
    tauntRemaining: 0,
    skillPowerBonus: 0,
    effects: [],
    lastAttacker: null,
    currentTarget: null,
    damageDealt: 0,
    damageByElement: { fire: 0, ice: 0, wood: 0, lightning: 0 },
  };
}

/**
 * ユニットを「定義どおりの初期値」に戻す。
 * 戦闘開始時に必ず呼び、前の戦闘の状態（HP・マナ・デバフ・バフ・
 * クールダウン・位置・効果の使用回数）を一切引き継がないようにする。
 */
export function resetUnit(u: Unit, initialPos: Hex, initialAttackDelay = 0): void {
  u.pos = { ...initialPos };
  u.eff = cloneStats(u.base);
  u.hp = u.base.maxHp;
  u.shield = 0;
  u.mana = 0;
  u.attackTimer = Math.max(0, initialAttackDelay);
  u.moveProgress = 0;
  u.alive = true;
  u.debuffs = newDebuffState();
  u.timedMods = [];
  u.auraMods = [];
  u.reductions = [];
  u.tauntRemaining = 0;
  u.skillPowerBonus = 0;
  u.lastAttacker = null;
  u.currentTarget = null;
  u.damageDealt = 0;
  u.damageByElement = { fire: 0, ice: 0, wood: 0, lightning: 0 };
  for (const re of u.effects) {
    re.uses = 0;
    re.timer = 0;
    re.fired = false;
    re.active = false;
  }
}

export function emptyUnitStats(): Stats {
  return emptyStats();
}

export function hpRatio(u: Unit): number {
  return u.base.maxHp > 0 ? u.hp / u.base.maxHp : 0;
}

/** 戦闘に参加している（盤上かつ生存） */
export function isActive(u: Unit): boolean {
  return u.alive && u.onField;
}
