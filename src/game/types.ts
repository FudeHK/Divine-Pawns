/**
 * ラン（1回のプレイ）の状態。
 * UI に依存しない純粋なデータと関数だけで組み立てる。
 */

import type { Hex, Star } from '../engine/types';

/** ノードの種類 */
export type NodeKind =
  /** 通常戦闘 */
  | 'battle'
  /** リザルト兼ショップ */
  | 'shop'
  /** 二択イベント */
  | 'event'
  /** 章ボス */
  | 'boss'
  /** ボスショップ（1〜2章のみ） */
  | 'bossShop';

export interface RunNode {
  kind: NodeKind;
  /** 戦闘・ボスで使う遭遇ID */
  encounterId?: string;
}

/** 所持しているキャラ1体 */
export interface OwnedChar {
  /** 所持個体の一意なID（同じキャラを複数持てる） */
  uid: string;
  charId: string;
  star: Star;
  /** 覚えているスキルID */
  skills: string[];
  /** 装備。添字がスロット番号。空きは '' */
  equipment: string[];
  slot: 'frontline' | 'support' | 'none';
  pos?: Hex;
}

/** ランクアップした直後の、3択のスキル選択 */
export interface PendingSkillChoice {
  uid: string;
  charId: string;
  /** 選べるスキルID（最大3つ） */
  options: string[];
}

/** ショップに並ぶ品 */
export type ShopItem =
  | { kind: 'character'; charId: string; price: number }
  | { kind: 'blessing'; blessingId: string; price: number }
  | { kind: 'equipment'; equipmentId: string; price: number }
  /** 6体目枠 */
  | { kind: 'sixthSlot'; price: number }
  /** 昇格（サポート枠 → 前衛枠） */
  | { kind: 'promotion'; price: number };

export interface ShopOffer {
  /** 並んでいる品（購入済みは sold=true） */
  items: { item: ShopItem; sold: boolean }[];
  /** これまでのリロール回数 */
  rerolls: number;
  /** 次のリロールにかかるコイン */
  rerollCost: number;
  /** ボスショップか */
  boss: boolean;
}

/** イベントの結果 */
export interface EventOutcome {
  eventId: string;
  choiceId: string;
  success: boolean;
  text: string;
  /** 実際に起きたこと（表示用） */
  changes: string[];
  /** ミニ戦闘に入る場合の遭遇ID */
  battleEncounterId?: string;
}

export type RunPhase = 'node' | 'clear' | 'gameover';

export interface RunState {
  version: number;
  seed: string;
  /** 1始まりの章番号 */
  chapter: number;
  /** 章の中のノード番号（0始まり） */
  nodeIndex: number;
  phase: RunPhase;

  life: number;
  coins: number;

  roster: OwnedChar[];
  blessings: string[];
  /** 未装備の装備 */
  inventory: string[];

  /** 前衛枠（3〜6） */
  frontlineSlots: number;
  /** サポート枠（0〜3） */
  supportSlots: number;
  /** 6体目枠を取ったか */
  sixthSlot: boolean;
  /** 昇格の回数（最大3） */
  promotions: number;

  /** 通過したノードのキー（"1-0:battle" など） */
  history: string[];
  /** 章内で消化したイベント数（1回目は必ず安全な二択） */
  eventsInChapter: number;
  /** 直前の戦闘に勝ったか（リザルト表示用） */
  lastBattleWon: boolean | null;
  /** 章ボスに負けた回数（リトライ表示用） */
  bossRetries: number;

  /** そのノードのショップ（shop / bossShop のときだけ） */
  shop: ShopOffer | null;
  /** そのノードのイベントID（event のときだけ） */
  eventId: string | null;
  /** 直近のイベント結果 */
  lastEvent: EventOutcome | null;

/**
   * ランクアップ直後のスキル3択の待ち行列。
   * 連続でランクアップしても、先頭から1件ずつ選ばせる。
   */
  pendingSkills: PendingSkillChoice[];
}
