/**
 * ラン全体を自動で遊ぶ（ビルドの成立性をみるため）。
 *
 * 「少数精鋭」と「多キャラ」の2つの方針で、どちらもクリアを狙えるかを測る。
 */

import { DEFAULT_RUN_CONFIG, type RunConfig } from '../src/game/config';
import {
  advanceNode,
  applyBattleResult,
  buyShopItem,
  chooseEvent,
  chooseSkill,
  createRun,
  currentNode,
  currentSkillChoice,
  equipItem,
  reclaimOverflowEquipment,
  resolveEventBattle,
  runEncounter,
  runLoadout,
} from '../src/game/run';
import type { RunState } from '../src/game/types';
import { runBattle } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { ALLY_CELLS } from '../src/engine/hex';
import { equipmentSlots } from '../src/engine/stats';
import { getEquipment } from '../src/data/equipment';

/** 編成の方針 */
export type BuildStyle = 'elite' | 'wide';

export interface AutoRunResult {
  cleared: boolean;
  chaptersDone: number;
  /** たどり着いた章（1始まり） */
  reachedChapter: number;
  battles: number;
  wins: number;
  lifeLeft: number;
  roster: number;
  maxStar: number;
}

/** 方針ごとの上限（少数精鋭は人数を絞る） */
function limits(style: BuildStyle, run: RunState): { front: number; support: number } {
  if (style === 'elite') return { front: 2, support: 1 };
  return { front: run.frontlineSlots, support: run.supportSlots };
}

/** 強い順（★→装備数）に並べる */
function byPower(run: RunState): RunState['roster'] {
  return [...run.roster].sort((a, b) => {
    if (a.star !== b.star) return b.star - a.star;
    const ae = a.equipment.filter((x) => x !== '').length;
    const be = b.equipment.filter((x) => x !== '').length;
    if (ae !== be) return be - ae;
    return a.uid < b.uid ? -1 : 1;
  });
}

/** 編成を組み直して盤面に並べる */
function arrange(run: RunState, style: BuildStyle): void {
  const lim = limits(style, run);
  const order = byPower(run);
  const cells = ALLY_CELLS;
  let ci = 0;
  order.forEach((o, i) => {
    if (i < lim.front) {
      o.slot = 'frontline';
      o.pos = { ...cells[ci % cells.length]! };
      ci += 1;
    } else if (i < lim.front + lim.support) {
      o.slot = 'support';
      o.pos = undefined;
    } else {
      o.slot = 'none';
      o.pos = undefined;
    }
  });
}

/** 在庫の装備を、方針に沿って配る（在庫の個数はきちんと消費する） */
function equip(run: RunState, style: BuildStyle): void {
  reclaimOverflowEquipment(run);
  const order = byPower(run);
  // 少数精鋭は先頭に寄せ、多キャラは順番に配る
  const targets = style === 'elite' ? order.slice(0, 2) : order;
  let guard = 0;
  while (run.inventory.length > 0 && guard < 60) {
    guard += 1;
    let placed = false;
    for (const o of targets) {
      const slots = equipmentSlots(o.star);
      const cur = o.equipment.slice(0, slots);
      while (cur.length < slots) cur.push('');
      const i = cur.findIndex((x) => x === '');
      if (i < 0) continue;
      // 手持ちの中で、いちばんレア度の高いものから着ける
      const best = [...new Set(run.inventory)].sort(
        (a, b) => getEquipment(b).tier - getEquipment(a).tier,
      )[0];
      if (!best) break;
      if (equipItem(run, o.uid, i, best) !== 'ok') break;
      placed = true;
      if (run.inventory.length === 0) break;
    }
    if (!placed) break;
  }
}

/** ショップでの買い方 */
function shop(run: RunState, style: BuildStyle, cfg: RunConfig): void {
  const offer = run.shop;
  if (!offer) return;
  for (let pass = 0; pass < 2; pass++) {
    offer.items.forEach((slot, i) => {
      if (slot.sold || run.coins < slot.item.price) return;
      const k = slot.item.kind;
      if (style === 'elite') {
        // 装備と加護、そして★が上がるキャラを優先。
        // 余ったコインで新しいキャラも取る（次に引いた時に★が上がるため）
        if (slot.item.kind === 'character') {
          const charId = slot.item.charId;
          const dup = run.roster.some((o) => o.charId === charId && o.star < 3);
          if (dup || pass === 1) buyShopItem(run, i, cfg);
        } else if (k === 'equipment' || k === 'blessing') {
          buyShopItem(run, i, cfg);
        }
      } else {
        // 人数と枠を優先
        if (k === 'character' || k === 'sixthSlot' || k === 'promotion' || k === 'blessing') {
          buyShopItem(run, i, cfg);
        } else if (k === 'equipment') buyShopItem(run, i, cfg);
      }
      drainSkillChoices(run);
    });
  }
}

/** 3択は毎回1つ目を選ぶ（自動プレイ） */
function drainSkillChoices(run: RunState): void {
  let guard = 0;
  while (currentSkillChoice(run) && guard < 20) {
    guard += 1;
    chooseSkill(run, currentSkillChoice(run)!.options[0]!);
  }
}

export function autoRun(
  seed: string,
  style: BuildStyle,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): AutoRunResult {
  const run = createRun(seed, cfg);
  let battles = 0;
  let wins = 0;
  let reached = 1;

  for (let step = 0; step < 200; step++) {
    drainSkillChoices(run);
    if (run.phase !== 'node') break;
    reached = Math.max(reached, run.chapter);
    const node = currentNode(run, cfg);
    if (!node) break;

    if (node.kind === 'battle' || node.kind === 'boss') {
      arrange(run, style);
      equip(run, style);
      arrange(run, style);
      const setup = buildBattleSetup(runLoadout(run), runEncounter(run, node.encounterId!, cfg), {
        seed: `${seed}::${run.chapter}-${run.nodeIndex}-${run.bossRetries}`,
        logging: false,
      });
      const r = runBattle(setup);
      battles += 1;
      if (r.win) wins += 1;
      applyBattleResult(run, r.win, cfg);
    } else if (node.kind === 'shop' || node.kind === 'bossShop') {
      shop(run, style, cfg);
      drainSkillChoices(run);
      advanceNode(run, cfg);
    } else {
      // イベントは安全な方（0番）を選ぶ
      const out = chooseEvent(run, 0, cfg);
      if (out.battleEncounterId) {
        arrange(run, style);
        const setup = buildBattleSetup(runLoadout(run), runEncounter(run, out.battleEncounterId, cfg), {
          seed: `${seed}::ev-${run.chapter}-${run.nodeIndex}`,
          logging: false,
        });
        resolveEventBattle(run, runBattle(setup).win, cfg);
      }
      drainSkillChoices(run);
    }
  }

  return {
    cleared: run.phase === 'clear',
    chaptersDone: run.phase === 'clear' ? cfg.chapters : reached - 1,
    reachedChapter: reached,
    battles,
    wins,
    lifeLeft: run.life,
    roster: run.roster.length,
    maxStar: run.roster.reduce((m, o) => Math.max(m, o.star), 0),
  };
}

export interface BuildScenarioReport {
  style: BuildStyle;
  label: string;
  runs: number;
  clears: number;
  clearRate: number;
  avgReachedChapter: number;
  avgBattleWinRate: number;
  avgRoster: number;
  avgMaxStar: number;
}

export function runBuildScenarios(
  count = 200,
  cfg: RunConfig = DEFAULT_RUN_CONFIG,
): BuildScenarioReport[] {
  const styles: { style: BuildStyle; label: string }[] = [
    { style: 'elite', label: '少数精鋭（前衛2・サポート1に集中投資）' },
    { style: 'wide', label: '多キャラ（枠いっぱいに広く編成）' },
  ];
  return styles.map(({ style, label }) => {
    let clears = 0;
    let reach = 0;
    let winRate = 0;
    let roster = 0;
    let star = 0;
    for (let i = 0; i < count; i++) {
      const r = autoRun(`build-${style}-${i}`, style, cfg);
      if (r.cleared) clears += 1;
      reach += r.reachedChapter;
      winRate += r.battles > 0 ? r.wins / r.battles : 0;
      roster += r.roster;
      star += r.maxStar;
    }
    const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
    return {
      style,
      label,
      runs: count,
      clears,
      clearRate: round((clears / count) * 100, 1),
      avgReachedChapter: round(reach / count),
      avgBattleWinRate: round((winRate / count) * 100, 1),
      avgRoster: round(roster / count),
      avgMaxStar: round(star / count),
    };
  });
}
