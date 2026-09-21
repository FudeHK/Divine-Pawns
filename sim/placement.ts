/**
 * 配置の検証：E1〜E4 と B1 のそれぞれで、同じ編成の配置を全通り試す。
 * 合格条件：5遭遇のうち3以上で、勝てる配置の割合が 20〜80% に収まる。
 */

import { PLACEMENT_ENCOUNTER_IDS } from '../src/data/encounters';
import type { Hex, Loadout } from '../src/engine/types';
import {
  ALLY_CELLS,
  entry,
  fight,
  getEncounter,
  isMain,
  loadout,
  pct,
  permutations,
  round,
  writeJson,
} from './common';

/** 配置検証に使う固定編成（前衛3・サポート2） */
export const REFERENCE_FRONTLINE = ['GRE_A', 'NOR_A', 'GRE_B'] as const;
export const REFERENCE_SUPPORT = ['JPN_B', 'EGY_A'] as const;

export function referenceLoadout(cells: readonly Hex[]): Loadout {
  return loadout(
    REFERENCE_FRONTLINE.map((id, i) => entry(id, { ...cells[i]! }, 1, [])),
    REFERENCE_SUPPORT.map((id) => entry(id)),
    [],
  );
}

export interface PlacementEncounterResult {
  encounter: string;
  placements: number;
  wins: number;
  winRate: number;
  inBand: boolean;
  bestPlacement: string | null;
  worstPlacement: string | null;
  avgDuration: number;
}

export interface PlacementReport {
  frontline: string[];
  support: string[];
  perEncounter: PlacementEncounterResult[];
  encountersInBand: number;
  pass: boolean;
}

const BAND_MIN = 20;
const BAND_MAX = 80;

export function runPlacement(): PlacementReport {
  const allPlacements = permutations(ALLY_CELLS, REFERENCE_FRONTLINE.length);
  const perEncounter: PlacementEncounterResult[] = [];

  for (const eid of PLACEMENT_ENCOUNTER_IDS) {
    const enc = getEncounter(eid);
    let wins = 0;
    let best: { key: string; dur: number } | null = null;
    let worst: { key: string; dur: number } | null = null;
    let durSum = 0;

    for (const cells of allPlacements) {
      const lo = referenceLoadout(cells);
      const key = cells.map((c) => `${c.x},${c.y}`).join(' / ');
      const r = fight(lo, enc, { seed: `place-${eid}`, logging: false });
      durSum += r.duration;
      if (r.win) {
        wins++;
        if (!best || r.duration < best.dur) best = { key, dur: r.duration };
      } else if (!worst) {
        worst = { key, dur: r.duration };
      }
    }

    const rate = pct(wins, allPlacements.length);
    perEncounter.push({
      encounter: eid,
      placements: allPlacements.length,
      wins,
      winRate: round(rate, 1),
      inBand: rate >= BAND_MIN && rate <= BAND_MAX,
      bestPlacement: best?.key ?? null,
      worstPlacement: worst?.key ?? null,
      avgDuration: round(durSum / allPlacements.length, 2),
    });
  }

  const encountersInBand = perEncounter.filter((e) => e.inBand).length;
  return {
    frontline: [...REFERENCE_FRONTLINE],
    support: [...REFERENCE_SUPPORT],
    perEncounter,
    encountersInBand,
    pass: encountersInBand >= 3,
  };
}

function main(): void {
  const t0 = performance.now();
  const rep = runPlacement();
  const ms = performance.now() - t0;
  console.log(
    `[placement] 配置で勝敗が変わった遭遇: ${rep.encountersInBand}/5  (${(ms / 1000).toFixed(1)}s)`,
  );
  for (const e of rep.perEncounter) {
    console.log(
      `  ${e.inBand ? 'OK' : '--'} ${e.encounter}  勝率 ${e.winRate}% (${e.wins}/${e.placements})  平均 ${e.avgDuration}s`,
    );
  }
  writeJson('sim-placement.json', rep);
  if (!rep.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
