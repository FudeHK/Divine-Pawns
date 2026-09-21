/**
 * シミュレーション共通の道具立て。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runBattle, type BattleResult } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { ALLY_CELLS } from '../src/engine/hex';
import { Rng } from '../src/engine/rng';
import type { EncounterDef, Hex, Loadout, LoadoutEntry, Star } from '../src/engine/types';

import { BLESSINGS } from '../src/data/blessings';
import { CHARACTERS } from '../src/data/characters';
import { ENCOUNTERS, getEncounter } from '../src/data/encounters';
import { EQUIPMENT } from '../src/data/equipment';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_DIR = resolve(ROOT, 'reports');

export { ALLY_CELLS, CHARACTERS, ENCOUNTERS, EQUIPMENT, BLESSINGS, getEncounter };

export function writeJson(name: string, data: unknown): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const p = resolve(REPORT_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return p;
}

export function writeText(name: string, text: string): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const p = resolve(REPORT_DIR, name);
  writeFileSync(p, text, 'utf8');
  return p;
}

export interface SimBattleOptions {
  seed: string;
  logging?: boolean;
}

export function fight(
  loadout: Loadout,
  encounter: EncounterDef,
  opts: SimBattleOptions,
): BattleResult {
  const setup = buildBattleSetup(loadout, encounter, {
    seed: opts.seed,
    config: DEFAULT_CONFIG,
    logging: opts.logging ?? true,
  });
  return runBattle(setup);
}

export function entry(
  charId: string,
  pos?: Hex,
  star: Star = 1,
  equipment: string[] = [],
): LoadoutEntry {
  return { charId, star, equipment, pos };
}

export function loadout(
  frontline: LoadoutEntry[],
  support: LoadoutEntry[] = [],
  blessings: string[] = [],
): Loadout {
  return { frontline, support, blessings };
}

/** n 個から k 個を選ぶ順列（配置の全通り） */
export function permutations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const used = new Array<boolean>(items.length).fill(false);
  const rec = (depth: number): void => {
    if (depth === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(items[i]!);
      rec(depth + 1);
      cur.pop();
      used[i] = false;
    }
  };
  rec(0);
  return out;
}

/** ランダムな編成を作る（前衛3・サポート2・装備と加護もランダム） */
export function randomLoadout(rng: Rng, opts?: {
  frontlineCount?: number;
  supportCount?: number;
  maxStar?: Star;
  equipChance?: number;
  blessingChance?: number;
}): Loadout {
  const frontCount = opts?.frontlineCount ?? 3;
  const supCount = opts?.supportCount ?? 2;
  const maxStar = opts?.maxStar ?? 1;
  const equipChance = opts?.equipChance ?? 0.35;
  const blessingChance = opts?.blessingChance ?? 0.3;

  const ids = rng.shuffle(CHARACTERS.map((c) => c.id));
  const cells = rng.shuffle(ALLY_CELLS.map((c) => ({ ...c })));

  const front: LoadoutEntry[] = [];
  for (let i = 0; i < frontCount; i++) {
    front.push({
      charId: ids[i]!,
      star: (1 + rng.nextInt(maxStar)) as Star,
      equipment: rng.chance(equipChance) ? [rng.pick(EQUIPMENT).id] : [],
      pos: cells[i]!,
    });
  }
  const sup: LoadoutEntry[] = [];
  for (let i = 0; i < supCount; i++) {
    sup.push({
      charId: ids[frontCount + i]!,
      star: (1 + rng.nextInt(maxStar)) as Star,
      equipment: rng.chance(equipChance) ? [rng.pick(EQUIPMENT).id] : [],
    });
  }
  const blessings: string[] = [];
  for (const b of BLESSINGS) {
    if (rng.chance(blessingChance)) blessings.push(b.id);
  }
  return { frontline: front, support: sup, blessings };
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : (n / d) * 100;
}

export function round(n: number, digits = 2): number {
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 見出し付きの区切り */
export function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** そのファイルが直接実行されたか（tsx 経由） */
export function isMain(metaUrl: string): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return metaUrl === pathToFileURL(arg).href;
  } catch {
    return false;
  }
}
