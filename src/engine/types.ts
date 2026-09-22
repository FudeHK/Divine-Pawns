/**
 * 戦闘エンジンの共通型定義。
 * UI・描画には一切依存しない純粋な TypeScript。
 */

export type Side = 'ally' | 'enemy';

/** 属性（炎・氷・木・雷） */
export type Element = 'fire' | 'ice' | 'wood' | 'lightning';
export const ELEMENTS: readonly Element[] = ['fire', 'ice', 'wood', 'lightning'];

/** 役割。ターゲット優先度もこの並び順（先頭ほど優先して狙われる）。 */
export type Role = 'tank' | 'melee' | 'ranged' | 'mage' | 'healer' | 'support';
export const ROLE_PRIORITY: readonly Role[] = [
  'tank',
  'melee',
  'ranged',
  'mage',
  'healer',
  'support',
];

/** 神話圏 */
export type Myth = 'greek' | 'norse' | 'japanese' | 'egyptian';
export const MYTHS: readonly Myth[] = ['greek', 'norse', 'japanese', 'egyptian'];

/** ステータス種別 */
export type StatKey =
  | 'maxHp'
  | 'atk'
  | 'def'
  | 'atkSpeed'
  | 'range'
  | 'maxMana'
  | 'moveSpeed';

export const STAT_KEYS: readonly StatKey[] = [
  'maxHp',
  'atk',
  'def',
  'atkSpeed',
  'range',
  'maxMana',
  'moveSpeed',
];

export interface Stats {
  /** HP */
  maxHp: number;
  /** 攻撃力 */
  atk: number;
  /** 防御 */
  def: number;
  /** 攻撃速度（回/秒） */
  atkSpeed: number;
  /** 射程（マス） */
  range: number;
  /** 最大マナ */
  maxMana: number;
  /** 移動速度（マス/秒） */
  moveSpeed: number;
}

/** 属性デバフ種別 */
export type DebuffKind = 'burn' | 'frostbite' | 'poison' | 'paralysis';
export const DEBUFF_KINDS: readonly DebuffKind[] = [
  'burn',
  'frostbite',
  'poison',
  'paralysis',
];

/** 属性 → その属性が付与するデバフ */
export const ELEMENT_DEBUFF: Readonly<Record<Element, DebuffKind>> = {
  fire: 'burn',
  ice: 'frostbite',
  wood: 'poison',
  lightning: 'paralysis',
};

/** 六角グリッド上の位置（odd-r オフセット座標） */
export interface Hex {
  x: number;
  y: number;
}

/** ★（1〜3） */
export type Star = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// 効果システム（きっかけ・条件・効果）
// ---------------------------------------------------------------------------

/** きっかけ */
export type Trigger =
  /** 戦闘開始 */
  | { kind: 'battleStart' }
  /** 攻撃時 */
  | { kind: 'onAttack' }
  /** 被弾時 */
  | { kind: 'onHit' }
  /** スキル使用時（＝アクティブスキル本体） */
  | { kind: 'onSkill' }
  /** N秒ごと */
  | { kind: 'everyN'; seconds: number }
  /** 戦闘開始から N 秒後（1回だけ） */
  | { kind: 'atTime'; seconds: number }
  /** HP が X% を下回った時 */
  | { kind: 'hpBelow'; pct: number }
  /** 撃破時 */
  | { kind: 'onKill' }
  /** 常時 */
  | { kind: 'always' };

export type CountScope = 'element' | 'role' | 'myth';

/** 条件 */
export type Condition =
  /** 最前列にいる */
  | { kind: 'inFrontRow' }
  /** 最後列にいる */
  | { kind: 'inBackRow' }
  /** 隣接する味方の数 */
  | { kind: 'adjacentAllies'; min?: number; max?: number }
  /** 属性・役割・神話圏ごとの味方の数（既定でサポート枠を含む） */
  | {
      kind: 'countAllies';
      by: CountScope;
      value: string;
      min: number;
      includeSupport?: boolean;
    }
  /** 前衛＋サポートの属性がすべて異なる */
  | { kind: 'allDistinctElements' }
  /** 盤上の味方に HP が pct% を下回っている者がいる */
  | { kind: 'allyHpBelow'; pct: number }
  /** 自分の HP が pct% を下回っている */
  | { kind: 'selfHpBelow'; pct: number };

/** 効果量の参照先 */
export type AmountRef = 'self' | 'target';

/** 効果量 = 参照ステータス × 係数 */
export interface Amount {
  stat: StatKey;
  coef: number;
  /** 既定 'self'（＝効果の持ち主の最終ステータス） */
  ref?: AmountRef;
  /** ★倍率（スキル係数）を適用するか。既定 false */
  scaleWithStar?: boolean;
  /** 参照なしの固定値を足す */
  flat?: number;
}

/** 対象をさらに絞り込む条件（属性・役割・神話圏） */
export interface UnitFilter {
  element?: Element;
  role?: Role;
  myth?: Myth;
}

/** 効果の対象 */
export type TargetSpec =
  | 'self'
  /** 現在の行動対象（攻撃対象／スキル対象） */
  | 'current'
  /** 自分を攻撃してきた相手 */
  | 'attacker'
  /** 最も近い敵 */
  | 'nearestEnemy'
  /** 敵全体 */
  | 'allEnemies'
  /** 自分の周囲 radius マス以内の敵 */
  | 'enemiesInRadius'
  /** 対象を中心とした radius マス以内の敵（範囲攻撃） */
  | 'enemiesAroundTarget'
  /** 敵の最前列（1行まるごと） */
  | 'enemyFrontRow'
  /** 敵のうち最も密集している1行 */
  | 'enemyDensestRow'
  /** 味方全体（盤上のみ） */
  | 'allAllies'
  /** 前衛全員（盤上の味方） */
  | 'frontlineAllies'
  /** HP 割合が最も低い味方 */
  | 'lowestHpAlly';

export type GlobalModKey =
  /** 燃焼係数への加算% */
  | 'burnCoefPct'
  /** 燃焼係数への乗算倍率 */
  | 'burnCoefMul'
  /** 燃焼ダメージへの加算% */
  | 'burnDamagePct'
  /** 猛毒の効果時間への加算（秒） */
  | 'poisonDurationAdd';

/** 効果 */
export type Effect =
  | {
      kind: 'damage';
      target: TargetSpec;
      radius?: number;
      amount: Amount;
      ignoreDef?: boolean;
    }
  | { kind: 'heal'; target: TargetSpec; radius?: number; amount: Amount }
  | {
      kind: 'shield';
      target: TargetSpec;
      radius?: number;
      amount: Amount;
      duration?: number;
    }
  | {
      kind: 'applyDebuff';
      target: TargetSpec;
      radius?: number;
      debuff: DebuffKind;
      stacks: number;
    }
  | {
      kind: 'statMod';
      target: TargetSpec;
      radius?: number;
      /** 対象の絞り込み（属性・役割・神話圏）。省略すると全員 */
      filter?: UnitFilter;
      stat: StatKey;
      mode: 'flat' | 'pct';
      value: number;
      /** 持続時間（秒）。省略時は条件が満たされる間ずっと（常時系） */
      duration?: number;
    }
  | { kind: 'taunt'; duration: number }
  | { kind: 'mana'; target: TargetSpec; value: number }
  /** スキル係数への加算%（自分） */
  | { kind: 'skillPower'; value: number }
  | {
      kind: 'damageReduction';
      target: TargetSpec;
      pct: number;
      duration: number;
    }
  /** 陣営全体のグローバル補正（燃焼係数・猛毒効果時間など） */
  | {
      kind: 'globalMod';
      key: GlobalModKey;
      mode: 'add' | 'mul';
      value: number;
      /** 指定するとその属性の味方にだけ効く */
      element?: Element;
    };

/** きっかけ・条件・効果の1セット */
export interface EffectDef {
  id: string;
  name: string;
  /** 画面に出す短い説明文（20字程度・倍率や係数は書かない） */
  summary: string;
  trigger: Trigger;
  conditions?: Condition[];
  effects: Effect[];
  /** 発動回数の上限（省略で無制限） */
  maxUses?: number;
}

// ---------------------------------------------------------------------------
// データ定義
// ---------------------------------------------------------------------------

export interface CharacterDef {
  id: string;
  name: string;
  /** 盤面アイコンに出す短い名前（最大4文字） */
  shortName: string;
  myth: Myth;
  role: Role;
  element: Element;
  tier: 1 | 2 | 3;
  base: Stats;
  /** アクティブスキル（マナ最大で発動） */
  active: EffectDef;
  /** パッシブ（盤上にいる間） */
  passives: EffectDef[];
  /** サポート枠に置いた時だけ働く効果 */
  support: EffectDef[];
}

export interface EnemyDef {
  id: string;
  name: string;
  /** 盤面アイコンに出す短い名前（最大4文字） */
  shortName: string;
  role: Role;
  element: Element;
  base: Stats;
  /** 凍傷・麻痺の耐性（0〜1） */
  resist: number;
  isBoss?: boolean;
  /** 最後列を狙う暗殺型 */
  targeting?: 'nearest' | 'backline';
  active?: EffectDef;
  passives?: EffectDef[];
}

/** 編成が確定した時点で効く補正（装備・加護の共通形） */
export interface BuildMod {
  /** 対象の絞り込み（未指定なら編成全員） */
  filter?: { element?: Element; role?: Role; myth?: Myth };
  /** 編成全体に対する追加条件 */
  require?: 'allDistinctElements';
  stat: StatKey;
  mode: 'flat' | 'pct';
  value: number;
}

export interface EquipmentDef {
  id: string;
  name: string;
  desc: string;
  /** 固定値の加算 */
  flat?: Partial<Stats>;
  /** 割合補正（1 + Σ%） */
  pct?: Partial<Stats>;
  /** 戦闘中の動的効果（隣接数など） */
  effects?: EffectDef[];
}

/** 加護のレア度 */
export type Rarity = 'common' | 'rare' | 'epic';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic'];

export interface BlessingDef {
  id: string;
  name: string;
  /** 一覧に出す1行の説明 */
  desc: string;
  /** ［説明］で開く短い説明文（倍率は書かない） */
  summary: string;
  rarity: Rarity;
  /** 編成確定時の補正（装備とは別枠で、割合補正の Σ に合流する） */
  buildMods?: BuildMod[];
  /** 戦闘中の効果（グローバル補正など） */
  effects?: EffectDef[];
}

export interface EncounterUnitDef {
  enemyId: string;
  pos: Hex;
  /**
   * 個別のステータス倍率（HP・攻撃力に乗る）。
   * 暫定。敵の種類が増えたら、敵ごとの基本値で調整する。
   */
  scale?: number;
}

export interface EncounterDef {
  id: string;
  name: string;
  units: EncounterUnitDef[];
}

// ---------------------------------------------------------------------------
// 編成
// ---------------------------------------------------------------------------

export interface LoadoutEntry {
  charId: string;
  star: Star;
  /** 装備。スロット数は★の数と同じ（equipmentSlots(star)）。超えた分は無視される */
  equipment: string[];
  /** 前衛の場合の配置 */
  pos?: Hex;
}

export interface Loadout {
  /** 前衛（盤面に出る） */
  frontline: LoadoutEntry[];
  /** サポート枠（盤面に出ない） */
  support: LoadoutEntry[];
  /** 加護 */
  blessings: string[];
}

export interface TeamConfig {
  /** 前衛枠（既定3・最大6） */
  frontlineSlots: number;
  /** サポート枠（既定2・最大3） */
  supportSlots: number;
}
