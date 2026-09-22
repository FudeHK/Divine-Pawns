/**
 * ラン進行（章のステートマシン・ショップ・イベント・ライフ）。
 * UI に依存しない純粋な関数だけで構成する。
 *
 * 乱数は seed から「ノードごとに」導出するので、同じ seed なら必ず同じ結果になる。
 */

import { BLESSINGS } from '../data/blessings';
import { CHARACTERS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import {
  RISKY_EVENTS,
  SAFE_EVENTS,
  getEvent,
  type EventDef,
  type Penalty,
  type Reward,
} from '../data/events';
import { Rng } from '../engine/rng';
import { equipmentSlots } from '../engine/stats';
import type { Loadout, Star } from '../engine/types';
import { DEFAULT_RUN_CONFIG, type RunConfig } from './config';
import type { EventOutcome, OwnedChar, RunNode, RunState, ShopItem, ShopOffer } from './types';

export const RUN_VERSION = 1;

/** 章ごとの通常戦の遭遇（仮） */
const CHAPTER_BATTLES: Record<number, string[]> = {
  1: ['E1', 'E2'],
  2: ['E3', 'E4'],
  3: ['E4', 'B1'],
};
const BOSS_ENCOUNTER = 'B1';

// ---------------------------------------------------------------------------
// ノード列
// ---------------------------------------------------------------------------

/**
 * 章のノード列。
 * 戦闘 → ショップ → イベント を loopsPerChapter 回くり返し、章ボス、
 * 最終章以外はボスショップで締める。
 */
export function chapterNodes(chapter: number, cfg: RunConfig = DEFAULT_RUN_CONFIG): RunNode[] {
  const battles = CHAPTER_BATTLES[chapter] ?? CHAPTER_BATTLES[3]!;
  const nodes: RunNode[] = [];
  for (let i = 0; i < cfg.loopsPerChapter; i++) {
    nodes.push({ kind: 'battle', encounterId: battles[i % battles.length]! });
    nodes.push({ kind: 'shop' });
    nodes.push({ kind: 'event' });
  }
  nodes.push({ kind: 'boss', encounterId: BOSS_ENCOUNTER });
  if (chapter < cfg.chapters) nodes.push({ kind: 'bossShop' });
  return nodes;
}

export function currentNode(run: RunState, cfg: RunConfig = DEFAULT_RUN_CONFIG): RunNode | null {
  if (run.phase !== 'node') return null;
  return chapterNodes(run.chapter, cfg)[run.nodeIndex] ?? null;
}

function nodeKey(run: RunState, node: RunNode): string {
  return `${run.chapter}-${run.nodeIndex}:${node.kind}`;
}

// ---------------------------------------------------------------------------
// 乱数（ノードごとに seed から導出する）
// ---------------------------------------------------------------------------

function shopRng(run: RunState, rerolls: number): Rng {
  return new Rng(`${run.seed}::shop::${run.chapter}-${run.nodeIndex}-${rerolls}`);
}

function eventRng(run: RunState, tag: string): Rng {
  return new Rng(`${run.seed}::event::${run.chapter}-${run.nodeIndex}-${tag}`);
}

// ---------------------------------------------------------------------------
// ラン生成
// ---------------------------------------------------------------------------

let uidCounter = 0;
function newUid(charId: string): string {
  uidCounter += 1;
  return `${charId}#${uidCounter}`;
}

export function makeOwnedChar(charId: string, star: Star = 1): OwnedChar {
  return { uid: newUid(charId), charId, star, equipment: [], slot: 'none' };
}

export function createRun(seed: string, cfg: RunConfig = DEFAULT_RUN_CONFIG): RunState {
  // 開始はランダムな1体、ショップなし、初期コイン0
  const rng = new Rng(`${seed}::start`);
  const first = makeOwnedChar(rng.pick(CHARACTERS).id, 1);
  first.slot = 'frontline';
  first.pos = { x: 2, y: 3 };

  const run: RunState = {
    version: RUN_VERSION,
    seed,
    chapter: 1,
    nodeIndex: 0,
    phase: 'node',
    life: cfg.startLife,
    coins: cfg.startCoins,
    roster: [first],
    blessings: [],
    inventory: [],
    frontlineSlots: cfg.frontlineSlotsBase,
    supportSlots: cfg.supportSlotsBase,
    sixthSlot: false,
    promotions: 0,
    history: [],
    eventsInChapter: 0,
    lastBattleWon: null,
    bossRetries: 0,
    shop: null,
    eventId: null,
    lastEvent: null,
  };
  prepareNode(run, cfg);
  return run;
}

/** ノードに入るときの準備（ショップを並べる・イベントを決める） */
export function prepareNode(run: RunState, cfg: RunConfig = DEFAULT_RUN_CONFIG): void {
  run.shop = null;
  run.eventId = null;
  const node = currentNode(run, cfg);
  if (!node) return;
  if (node.kind === 'shop' || node.kind === 'bossShop') {
    run.shop = rollShop(run, node.kind === 'bossShop', 0, cfg);
  } else if (node.kind === 'event') {
    run.eventId = pickEvent(run).id;
  }
}

/** 次のノードへ進む（章の終わりなら次章、最終章の終わりならクリア） */
export function advanceNode(run: RunState, cfg: RunConfig = DEFAULT_RUN_CONFIG): RunState {
  if (run.phase !== 'node') return run;
  const node = currentNode(run, cfg);
  if (node) run.history.push(nodeKey(run, node));

  const nodes = chapterNodes(run.chapter, cfg);
  run.nodeIndex += 1;
  if (run.nodeIndex >= nodes.length) {
    run.chapter += 1;
    run.nodeIndex = 0;
    run.eventsInChapter = 0;
    run.bossRetries = 0;
    if (run.chapter > cfg.chapters) {
      run.phase = 'clear';
      run.shop = null;
      run.eventId = null;
      return run;
    }
  }
  prepareNode(run, cfg);
  return run;
}

// ---------------------------------------------------------------------------
// 戦闘の結果（B4 ライフシステム）
// ---------------------------------------------------------------------------

export interface BattleResolution {
  /** 章ボスに負けて、同じボスに再挑戦できる状態か */
  bossRetry: boolean;
  gameOver: boolean;
  coinsGained: number;
  lifeLost: number;
}

/**
 * 戦闘の勝敗を反映する。
 * - 勝ち: コインを得て、次のノード（リザルト兼ショップ）へ
 * - 負け: ライフ-1・救援コイン。ライフ0でゲームオーバー。
 *   章ボスに負けた時だけ、同じボスへの再挑戦になる（ライフは消費する）
 */
export function applyBattleResult(
  run: RunState,
  won: boolean,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): BattleResolution {
  const node = currentNode(run, cfg);
  const isBoss = node?.kind === 'boss';
  run.lastBattleWon = won;

  if (won) {
    const gain = isBoss ? cfg.coinsBossWin : cfg.coinsWin;
    run.coins += gain;
    run.bossRetries = 0;
    advanceNode(run, cfg);
    return { bossRetry: false, gameOver: false, coinsGained: gain, lifeLost: 0 };
  }

  run.life -= 1;
  run.coins += cfg.coinsLose;
  if (run.life <= 0) {
    run.life = 0;
    run.phase = 'gameover';
    run.shop = null;
    run.eventId = null;
    return { bossRetry: false, gameOver: true, coinsGained: cfg.coinsLose, lifeLost: 1 };
  }
  if (isBoss) {
    // 同じボスに再挑戦（ノードは進めない）
    run.bossRetries += 1;
    return { bossRetry: true, gameOver: false, coinsGained: cfg.coinsLose, lifeLost: 1 };
  }
  // 通常戦の敗北でもショップは使える
  advanceNode(run, cfg);
  return { bossRetry: false, gameOver: false, coinsGained: cfg.coinsLose, lifeLost: 1 };
}

// ---------------------------------------------------------------------------
// ショップ（B2）
// ---------------------------------------------------------------------------

function priceOf(base: number, boss: boolean, cfg: RunConfig): number {
  return boss ? Math.round(base * cfg.bossPriceMul) : base;
}

/** 枠拡張の品（6体目枠 → 昇格 の順に出す。どちらも取り切っていたら null） */
function slotItem(run: RunState, boss: boolean, cfg: RunConfig): ShopItem | null {
  if (!run.sixthSlot) return { kind: 'sixthSlot', price: priceOf(cfg.price.sixthSlot, boss, cfg) };
  if (run.promotions < cfg.maxPromotions)
    return { kind: 'promotion', price: priceOf(cfg.price.promotion, boss, cfg) };
  return null;
}

export function rollShop(
  run: RunState,
  boss: boolean,
  rerolls: number,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): ShopOffer {
  const rng = shopRng(run, rerolls);
  const perKind = 2 + (boss ? cfg.bossExtraPerKind : 0);
  const items: ShopItem[] = [];

  for (let i = 0; i < perKind; i++) {
    items.push({
      kind: 'character',
      charId: rng.pick(CHARACTERS).id,
      price: priceOf(cfg.price.character, boss, cfg),
    });
  }
  for (let i = 0; i < perKind; i++) {
    // ボスショップは上位（rare / epic）が出やすい
    const pool =
      boss && rng.chance(cfg.bossHighRarityChance)
        ? BLESSINGS.filter((b) => b.rarity !== 'common')
        : BLESSINGS;
    items.push({
      kind: 'blessing',
      blessingId: rng.pick(pool.length > 0 ? pool : BLESSINGS).id,
      price: priceOf(cfg.price.blessing, boss, cfg),
    });
  }
  for (let i = 0; i < perKind; i++) {
    items.push({
      kind: 'equipment',
      equipmentId: rng.pick(EQUIPMENT).id,
      price: priceOf(cfg.price.equipment, boss, cfg),
    });
  }

  // ボスショップには 6体目枠か昇格が必ず1つ並ぶ
  if (boss) {
    const si = slotItem(run, boss, cfg);
    if (si) items.push(si);
  }

  return {
    items: items.map((item) => ({ item, sold: false })),
    rerolls,
    rerollCost: cfg.price.reroll + cfg.price.rerollStep * rerolls,
    boss,
  };
}

export function rerollShop(run: RunState, cfg: RunConfig = DEFAULT_RUN_CONFIG): boolean {
  const shop = run.shop;
  if (!shop) return false;
  if (run.coins < shop.rerollCost) return false;
  run.coins -= shop.rerollCost;
  run.shop = rollShop(run, shop.boss, shop.rerolls + 1, cfg);
  return true;
}

/** ショップの品を買う。買えたら true */
export function buyShopItem(
  run: RunState,
  index: number,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): boolean {
  const shop = run.shop;
  if (!shop) return false;
  const slot = shop.items[index];
  if (!slot || slot.sold) return false;
  if (run.coins < slot.item.price) return false;

  const it = slot.item;
  switch (it.kind) {
    case 'character':
      run.roster.push(makeOwnedChar(it.charId));
      break;
    case 'blessing':
      if (run.blessings.includes(it.blessingId)) return false;
      run.blessings.push(it.blessingId);
      break;
    case 'equipment':
      run.inventory.push(it.equipmentId);
      break;
    case 'sixthSlot':
      if (run.sixthSlot) return false;
      grantSixthSlot(run);
      break;
    case 'promotion':
      if (!grantPromotion(run, cfg)) return false;
      break;
  }
  run.coins -= it.price;
  slot.sold = true;
  return true;
}

// ---------------------------------------------------------------------------
// 枠拡張（B5）
// ---------------------------------------------------------------------------

/** 6体目枠。イベント報酬とボスショップからのみ手に入る */
export function grantSixthSlot(run: RunState): boolean {
  if (run.sixthSlot) return false;
  run.sixthSlot = true;
  run.supportSlots += 1;
  return true;
}

/** 昇格（サポート枠 → 前衛枠）。最大3回 */
export function grantPromotion(run: RunState, cfg: RunConfig = DEFAULT_RUN_CONFIG): boolean {
  if (run.promotions >= cfg.maxPromotions) return false;
  if (run.supportSlots <= 0) return false;
  run.promotions += 1;
  run.supportSlots -= 1;
  run.frontlineSlots += 1;
  return true;
}

// ---------------------------------------------------------------------------
// イベント（B3）
// ---------------------------------------------------------------------------

/** 章の最初のイベントは必ず「両方安全」 */
export function pickEvent(run: RunState): EventDef {
  const pool = run.eventsInChapter === 0 ? SAFE_EVENTS : RISKY_EVENTS;
  const rng = eventRng(run, 'pick');
  return rng.pick(pool.length > 0 ? pool : SAFE_EVENTS);
}

function randomEquipmentId(rng: Rng): string {
  return rng.pick(EQUIPMENT).id;
}

function applyReward(
  run: RunState,
  reward: Reward,
  rng: Rng,
  cfg: RunConfig,
): string[] {
  switch (reward.kind) {
    case 'none':
      return [];
    case 'coins':
      run.coins += reward.amount;
      return [`コイン +${reward.amount}`];
    case 'life':
      run.life += reward.amount;
      return [`ライフ +${reward.amount}`];
    case 'equipment': {
      const id = randomEquipmentId(rng);
      run.inventory.push(id);
      return [`装備を入手: ${EQUIPMENT.find((e) => e.id === id)!.name}`];
    }
    case 'blessing': {
      const pool = BLESSINGS.filter((b) => !run.blessings.includes(b.id));
      if (pool.length === 0) {
        run.coins += 5;
        return ['加護はすべて持っていた（コイン +5）'];
      }
      const b = rng.pick(pool);
      run.blessings.push(b.id);
      return [`加護を入手: ${b.name}`];
    }
    case 'character': {
      const c = rng.pick(CHARACTERS);
      run.roster.push(makeOwnedChar(c.id));
      return [`仲間が増えた: ${c.name}`];
    }
    case 'star': {
      const pool = run.roster.filter((o) => o.star < 3);
      if (pool.length === 0) {
        run.coins += 5;
        return ['全員★3だった（コイン +5）'];
      }
      const o = rng.pick(pool);
      o.star = (o.star + 1) as Star;
      const name = CHARACTERS.find((c) => c.id === o.charId)!.name;
      return [`${name} が ★${o.star} になった`];
    }
    case 'sixthSlot':
      return grantSixthSlot(run) ? ['6体目枠を獲得'] : ['6体目枠はすでに持っていた'];
    case 'promotion':
      return grantPromotion(run, cfg) ? ['昇格（サポート枠→前衛枠）'] : ['これ以上は昇格できない'];
  }
}

/** 賭けに負けた時。キャラは絶対に失わない */
function applyPenalty(run: RunState, p: Penalty, rng: Rng): string[] {
  switch (p) {
    case 'life':
      run.life -= 1;
      if (run.life <= 0) {
        run.life = 0;
        run.phase = 'gameover';
      }
      return ['ライフ -1'];
    case 'equipment': {
      // 未装備 → 装備中 の順に1つ失う
      if (run.inventory.length > 0) {
        const i = rng.nextInt(run.inventory.length);
        const [lost] = run.inventory.splice(i, 1);
        return [`装備を失った: ${EQUIPMENT.find((e) => e.id === lost)!.name}`];
      }
      const withEquip = run.roster.filter((o) => o.equipment.some((x) => x !== ''));
      if (withEquip.length === 0) return ['失う装備がなかった'];
      const o = rng.pick(withEquip);
      const idx = o.equipment.findIndex((x) => x !== '');
      const lost = o.equipment[idx]!;
      o.equipment[idx] = '';
      return [`装備を失った: ${EQUIPMENT.find((e) => e.id === lost)!.name}`];
    }
    case 'blessing': {
      if (run.blessings.length === 0) return ['失う加護がなかった'];
      const i = rng.nextInt(run.blessings.length);
      const [lost] = run.blessings.splice(i, 1);
      return [`加護を失った: ${BLESSINGS.find((b) => b.id === lost)!.name}`];
    }
    case 'coinsHalf': {
      const lost = Math.floor(run.coins * 0.5);
      run.coins -= lost;
      return [`コインを半分失った（-${lost}）`];
    }
  }
}

/**
 * 二択の選択。
 * ミニ戦闘の選択肢を選んだ場合は、まだ結果を確定させず battleEncounterId を返す。
 * 戦闘のあとに resolveEventBattle() を呼ぶ。
 */
export function chooseEvent(
  run: RunState,
  choiceIndex: 0 | 1,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): EventOutcome {
  const def = getEvent(run.eventId!);
  const choice = def.choices[choiceIndex]!;
  const rng = eventRng(run, `choice-${choice.id}`);

  if (choice.battle) {
    const outcome: EventOutcome = {
      eventId: def.id,
      choiceId: choice.id,
      success: false,
      text: '',
      changes: [],
      battleEncounterId: choice.battle.encounterId,
    };
    run.lastEvent = outcome;
    return outcome;
  }

  let success = true;
  const changes: string[] = [];
  if (choice.gamble) {
    success = rng.chance(choice.gamble.chance);
    if (success) {
      changes.push(...applyReward(run, choice.reward, rng, cfg));
    } else {
      const p = rng.pick(choice.gamble.penalties);
      changes.push(...applyPenalty(run, p, rng));
    }
  } else {
    changes.push(...applyReward(run, choice.reward, rng, cfg));
  }

  const outcome: EventOutcome = {
    eventId: def.id,
    choiceId: choice.id,
    success,
    text: success ? choice.successText : (choice.failText ?? ''),
    changes,
  };
  run.lastEvent = outcome;
  run.eventsInChapter += 1;
  if (run.phase === 'node') advanceNode(run, cfg);
  return outcome;
}

/** ミニ戦闘の結果を反映する */
export function resolveEventBattle(
  run: RunState,
  won: boolean,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): EventOutcome {
  const def = getEvent(run.eventId!);
  const choice = def.choices.find((c) => c.id === run.lastEvent?.choiceId) ?? def.choices[1];
  const rng = eventRng(run, `battle-${choice.id}`);
  const changes: string[] = [];

  if (won) {
    changes.push(...applyReward(run, choice.reward, rng, cfg));
  } else if (choice.battle?.dangerous) {
    // 危険なミニ戦闘の敗北はライフを消費する（安全なミニバトルは減らない）
    changes.push(...applyPenalty(run, 'life', rng));
  } else {
    changes.push('報酬なし');
  }

  const outcome: EventOutcome = {
    eventId: def.id,
    choiceId: choice.id,
    success: won,
    text: won ? choice.successText : (choice.failText ?? ''),
    changes,
  };
  run.lastEvent = outcome;
  run.eventsInChapter += 1;
  if (run.phase === 'node') advanceNode(run, cfg);
  return outcome;
}

// ---------------------------------------------------------------------------
// 編成
// ---------------------------------------------------------------------------

/** ラン中の編成を、戦闘エンジンが使う Loadout に変換する */
export function runLoadout(run: RunState): Loadout {
  const frontline = run.roster
    .filter((o) => o.slot === 'frontline')
    .map((o) => ({
      charId: o.charId,
      star: o.star,
      equipment: o.equipment.slice(0, equipmentSlots(o.star)).filter((x) => x !== ''),
      pos: o.pos,
    }));
  const support = run.roster
    .filter((o) => o.slot === 'support')
    .map((o) => ({
      charId: o.charId,
      star: o.star,
      equipment: o.equipment.slice(0, equipmentSlots(o.star)).filter((x) => x !== ''),
    }));
  return { frontline, support, blessings: [...run.blessings] };
}

/** 進行マップの表示用 */
export function progressMap(
  run: RunState,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): { kind: string; label: string; done: boolean; current: boolean }[] {
  const label: Record<string, string> = {
    battle: '戦闘',
    shop: 'ショップ',
    event: 'イベント',
    boss: '章ボス',
    bossShop: 'ボスショップ',
  };
  return chapterNodes(run.chapter, cfg).map((n, i) => ({
    kind: n.kind,
    label: label[n.kind] ?? n.kind,
    done: i < run.nodeIndex,
    current: i === run.nodeIndex && run.phase === 'node',
  }));
}
