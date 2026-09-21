/**
 * 決定論の検証：ランダムな戦闘1,000件を2回ずつ実行し、ログのハッシュを比べる。
 * 合格条件：1,000/1,000 一致。
 */

import { ENCOUNTERS, fight, isMain, randomLoadout, writeJson } from './common';
import { Rng } from '../src/engine/rng';

export interface DeterminismReport {
  total: number;
  matched: number;
  mismatches: { index: number; seed: string; encounter: string; a: string; b: string }[];
  pass: boolean;
}

export function runDeterminism(count = 1000): DeterminismReport {
  const mismatches: DeterminismReport['mismatches'] = [];
  let matched = 0;

  for (let i = 0; i < count; i++) {
    const seed = `det-${i}`;
    // 編成生成も同じシードから2回作り、完全に同じ入力にする
    const loA = randomLoadout(new Rng(`${seed}::gen`), { maxStar: 3, equipChance: 0.5 });
    const loB = randomLoadout(new Rng(`${seed}::gen`), { maxStar: 3, equipChance: 0.5 });
    const enc = ENCOUNTERS[new Rng(`${seed}::enc`).nextInt(ENCOUNTERS.length)]!;

    const a = fight(loA, enc, { seed });
    const b = fight(loB, enc, { seed });

    if (a.logHash === b.logHash) matched++;
    else
      mismatches.push({
        index: i,
        seed,
        encounter: enc.id,
        a: a.logHash,
        b: b.logHash,
      });
  }

  return { total: count, matched, mismatches, pass: matched === count };
}

function main(): void {
  const t0 = performance.now();
  const rep = runDeterminism(1000);
  const ms = performance.now() - t0;
  console.log(`[determinism] ${rep.matched}/${rep.total} 一致  (${(ms / 1000).toFixed(1)}s)`);
  if (!rep.pass) {
    console.log('不一致:', JSON.stringify(rep.mismatches.slice(0, 5), null, 2));
  }
  writeJson('sim-determinism.json', rep);
  if (!rep.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
