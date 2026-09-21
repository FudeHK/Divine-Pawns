/**
 * 戦闘の設定値。仕様（2章）を変えずに数値だけ差し替えられるよう、ここに集約する。
 */

export interface BattleConfig {
  /** 固定タイムステップ（秒） */
  tick: number;
  /** 戦闘の上限時間（秒）。超えたら敗北扱い */
  maxDuration: number;

  /** ★倍率（HP・攻撃力） */
  starStatMul: Record<1 | 2 | 3, number>;
  /** ★倍率（スキル係数） */
  starSkillMul: Record<1 | 2 | 3, number>;

  /** 通常ダメージ式の防御定数: atk * K / (K + def) */
  defenseConstant: number;

  /** 攻撃1回あたりのマナ獲得 */
  manaOnAttack: number;
  /** 被弾1回あたりのマナ獲得 */
  manaOnHit: number;

  debuff: {
    burn: {
      /** 燃焼係数 = 付与者の攻撃力 × これ */
      coefPerAtk: number;
      /** 1秒ごとに減るストック数 */
      decayPerSecond: number;
    };
    frostbite: {
      /** 攻撃速度 × 1 / (1 + k × 有効ストック) */
      slowPerStack: number;
      /** 1秒ごとに自然減衰するストック数（既定 0） */
      decayPerSecond: number;
    };
    poison: {
      /** 猛毒係数 = 付与者の攻撃力 × これ */
      coefPerAtk: number;
      /** 付与のたびに延長される効果時間（秒） */
      durationPerApply: number;
      /** 秒間ダメージ = 係数 × (1 + floor(経過秒 / これ)) */
      rampInterval: number;
    };
    paralysis: {
      /** 阻止確率 = 有効ストック / (有効ストック + これ) */
      resistConstant: number;
      /** 阻止時に戻るマナの割合（最大マナに対して） */
      manaOnBlock: number;
      decayPerSecond: number;
    };
  };

  /** 時間切れ（サドンデス） */
  timeout: {
    /** この秒数を超えたら毎秒ダメージが入り始める */
    startSeconds: number;
    /** 初回の最大HP割合 */
    basePct: number;
    /** 1秒ごとの増加量（最大HP割合） */
    stepPct: number;
  };

  /** 編成枠 */
  team: {
    frontlineSlotsDefault: number;
    frontlineSlotsMax: number;
    supportSlotsDefault: number;
    supportSlotsMax: number;
  };

  /** ティア（キャラのレア度）ごとの基本値倍率 */
  tierMul: Record<1 | 2 | 3, number>;
}

export const DEFAULT_CONFIG: BattleConfig = {
  tick: 0.1,
  maxDuration: 90,

  starStatMul: { 1: 1, 2: 1.8, 3: 3.24 },
  starSkillMul: { 1: 1, 2: 1.5, 3: 2.25 },

  defenseConstant: 100,

  manaOnAttack: 10,
  manaOnHit: 5,

  debuff: {
    burn: { coefPerAtk: 0.02, decayPerSecond: 1 },
    frostbite: { slowPerStack: 0.05, decayPerSecond: 0 },
    poison: { coefPerAtk: 0.02, durationPerApply: 3, rampInterval: 5 },
    paralysis: { resistConstant: 20, manaOnBlock: 0.5, decayPerSecond: 0 },
  },

  timeout: { startSeconds: 40, basePct: 0.01, stepPct: 0.01 },

  team: {
    frontlineSlotsDefault: 3,
    frontlineSlotsMax: 6,
    supportSlotsDefault: 2,
    supportSlotsMax: 3,
  },

  tierMul: { 1: 1, 2: 1.1, 3: 1.2 },
};

export function cloneConfig(base: BattleConfig = DEFAULT_CONFIG): BattleConfig {
  return JSON.parse(JSON.stringify(base)) as BattleConfig;
}
