/**
 * スケーリング観測：基準の編成と、燃焼を積んだ編成（業火の加護・★3・装備あり）を比べる。
 * 合格条件なし。最大秒間ダメージの倍率を報告する。
 *
 * 秒間ダメージは「計測用の的（反撃してこない硬い敵）」に対して、
 * サドンデスが始まる前の 0〜30 秒の窓で測る。
 */

import { DPS_DUMMY_ENCOUNTER } from '../src/data/encounters';
import { runBattle } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { DEFAULT_CONFIG } from '../src/engine/config';
import type { Element, Hex, Loadout } from '../src/engine/types';
import { ELEMENTS } from '../src/engine/types';
import { ENCOUNTERS, fight, isMain, round, writeJson } from './common';

const WINDOW = 30;

const FRONT_CELLS: Hex[] = [
  { x: 2, y: 3 },
  { x: 1, y: 3 },
  { x: 2, y: 5 },
];

/** 基準編成：★1・装備なし・加護なし */
export function baselineLoadout(): Loadout {
  return {
    frontline: [
      { charId: 'NOR_A', star: 1, equipment: [], pos: FRONT_CELLS[0]! },
      { charId: 'GRE_A', star: 1, equipment: [], pos: FRONT_CELLS[1]! },
      { charId: 'EGY_A', star: 1, equipment: [], pos: FRONT_CELLS[2]! },
    ],
    support: [
      { charId: 'GRE_B', star: 1, equipment: [] },
      { charId: 'JPN_B', star: 1, equipment: [] },
    ],
    blessings: [],
  };
}

/**
 * 燃焼ビルド：同じ前衛を ★3・装備ありにしたうえで、
 * サポートを炎シナジー（燃焼係数+20% / 燃焼ダメージ+10%）に寄せ、業火の加護（燃焼係数×2）を積む。
 */
export function burnLoadout(): Loadout {
  return {
    frontline: [
      { charId: 'NOR_A', star: 3, equipment: ['eq_power'], pos: FRONT_CELLS[0]! },
      { charId: 'GRE_A', star: 3, equipment: ['eq_tough'], pos: FRONT_CELLS[1]! },
      { charId: 'EGY_A', star: 3, equipment: ['eq_power'], pos: FRONT_CELLS[2]! },
    ],
    support: [
      { charId: 'NOR_B', star: 3, equipment: ['eq_power'] },
      { charId: 'JPN_B', star: 3, equipment: ['eq_power'] },
    ],
    blessings: ['bl_inferno'],
  };
}

interface WindowDps {
  total: number;
  byElement: Record<Element, number>;
}

/** 計測用の的に挑み、0〜WINDOW 秒の与ダメージから秒間ダメージを出す */
function measureDps(lo: Loadout): WindowDps {
  const setup = buildBattleSetup(lo, DPS_DUMMY_ENCOUNTER, {
    seed: 'scale-dps',
    config: DEFAULT_CONFIG,
    logging: true,
  });
  const elementOf = new Map<string, Element>();
  for (const u of setup.units) elementOf.set(u.id, u.element);

  const r = runBattle(setup);
  const byElement: Record<Element, number> = { fire: 0, ice: 0, wood: 0, lightning: 0 };
  let total = 0;
  for (const ev of r.log.events) {
    if (ev.type !== 'damage') continue;
    if (ev.t > WINDOW) continue;
    if (!ev.actor || !(ev.actor.startsWith('A') || ev.actor.startsWith('S'))) continue;
    const v = ev.value ?? 0;
    total += v;
    // 燃焼は炎、猛毒は木として数える
    const el: Element =
      ev.note === 'burn' ? 'fire' : ev.note === 'poison' ? 'wood' : elementOf.get(ev.actor)!;
    byElement[el] += v;
  }
  return {
    total: total / WINDOW,
    byElement: {
      fire: byElement.fire / WINDOW,
      ice: byElement.ice / WINDOW,
      wood: byElement.wood / WINDOW,
      lightning: byElement.lightning / WINDOW,
    },
  };
}

export interface ScalingBuildStat {
  name: string;
  /** 計測用の的に対する 0〜30秒の秒間ダメージ */
  dummyDps: number;
  dummyFireDps: number;
  dummyDpsByElement: Record<Element, number>;
  /** 実戦（E0〜B1）の勝率と平均秒間ダメージ */
  winRate: number;
  perEncounter: { encounter: string; dps: number; win: boolean; duration: number }[];
}

export interface ScalingReport {
  window: number;
  builds: ScalingBuildStat[];
  /** 燃焼ビルド ÷ 基準編成 の最大秒間ダメージ倍率 */
  maxDpsRatio: number;
  /** 燃焼（炎）分だけの倍率 */
  fireDpsRatio: number;
}

function measure(name: string, lo: Loadout): ScalingBuildStat {
  const dummy = measureDps(lo);
  const per: ScalingBuildStat['perEncounter'] = [];
  let wins = 0;
  for (const enc of ENCOUNTERS) {
    const r = fight(lo, enc, { seed: `scale-${enc.id}`, logging: false });
    per.push({
      encounter: enc.id,
      dps: round(r.allyDps, 1),
      win: r.win,
      duration: r.duration,
    });
    if (r.win) wins++;
  }
  return {
    name,
    dummyDps: round(dummy.total, 1),
    dummyFireDps: round(dummy.byElement.fire, 1),
    dummyDpsByElement: Object.fromEntries(
      ELEMENTS.map((e) => [e, round(dummy.byElement[e], 1)]),
    ) as Record<Element, number>,
    winRate: round((wins / per.length) * 100, 1),
    perEncounter: per,
  };
}

export function runScaling(): ScalingReport {
  const base = measure('基準（★1・装備なし・加護なし）', baselineLoadout());
  const burn = measure('燃焼ビルド（★3・装備あり・業火の加護・炎サポート）', burnLoadout());
  return {
    window: WINDOW,
    builds: [base, burn],
    maxDpsRatio: round(burn.dummyDps / Math.max(0.001, base.dummyDps), 2),
    fireDpsRatio: round(burn.dummyFireDps / Math.max(0.001, base.dummyFireDps), 2),
  };
}

function main(): void {
  const rep = runScaling();
  console.log(`[scaling] 計測窓 0〜${rep.window}s（計測用の的）`);
  for (const b of rep.builds) {
    console.log(
      `  ${b.name}\n    秒間ダメージ ${b.dummyDps}（炎 ${b.dummyFireDps}）  実戦勝率 ${b.winRate}%`,
    );
  }
  console.log(
    `  最大秒間ダメージ倍率: ${rep.maxDpsRatio}倍（炎分だけなら ${rep.fireDpsRatio}倍）`,
  );
  writeJson('sim-scaling.json', rep);
}

if (isMain(import.meta.url)) main();
