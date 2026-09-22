/**
 * ラン進行の設定値。
 * 要件定義書に価格表がないため、ここに置いた数値はすべて仮のバランス値。
 */

export interface RunConfig {
  /** 章の数（MVP は2、通しで3） */
  chapters: number;
  /** 1章あたりの「戦闘→ショップ→イベント」の繰り返し回数 */
  loopsPerChapter: number;

  /** 初期ライフ */
  startLife: number;
  /** 初期コイン */
  startCoins: number;

  /** 通常戦に勝った時のコイン */
  coinsWin: number;
  /** 章ボスに勝った時のコイン */
  coinsBossWin: number;
  /** 負けた時の救援コイン */
  coinsLose: number;

  /** 売却は購入額の何割か */
  sellRate: number;

  /** ショップの価格（仮） */
  price: {
    character: number;
    blessing: number;
    equipment: number;
    sixthSlot: number;
    promotion: number;
    /** そのショップでの1回目のリロール価格 */
    reroll: number;
    /** リロールするたびに増える額（1回目1c・2回目2c…） */
    rerollStep: number;
  };

  /** ボスショップの価格倍率 */
  bossPriceMul: number;
  /** ボスショップで増える品数（種類ごと） */
  bossExtraPerKind: number;
  /** ボスショップで高レア（rare / epic）を引く確率 */
  bossHighRarityChance: number;

  /** 枠拡張（6体目枠・昇格） */
  frontlineSlotsBase: number;
  supportSlotsBase: number;
  maxPromotions: number;

  /** イベントでの枠拡張の出現率 */
  eventSlotRewardChance: number;

  /**
   * 章ごとの敵の強さ倍率（ラン中の戦闘だけに掛かる）。
   * 遭遇データ（EncounterDef.scale）は配置検証の基準なので触らず、
   * ラン全体の難易度カーブはここで作る。
   */
  chapterScale: Record<number, number>;
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  chapters: 3,
  loopsPerChapter: 2,

  startLife: 3,
  startCoins: 0,

  coinsWin: 5,
  coinsBossWin: 12,
  coinsLose: 2,

  sellRate: 0.5,

  price: {
    character: 4,
    blessing: 5,
    equipment: 3,
    sixthSlot: 8,
    promotion: 8,
    reroll: 1,
    rerollStep: 1,
  },

  bossPriceMul: 1.3,
  bossExtraPerKind: 1,
  bossHighRarityChance: 0.7,

  frontlineSlotsBase: 3,
  supportSlotsBase: 2,
  maxPromotions: 3,

  eventSlotRewardChance: 0.25,

  chapterScale: { 1: 0.5, 2: 0.72, 3: 0.92 },
};

export function cloneRunConfig(base: RunConfig = DEFAULT_RUN_CONFIG): RunConfig {
  return JSON.parse(JSON.stringify(base)) as RunConfig;
}
