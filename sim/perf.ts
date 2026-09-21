/**
 * 性能計測：戦闘10,000件の実行時間を測る。合格条件なし。
 */

import { Rng } from '../src/engine/rng';
import { ENCOUNTERS, fight, isMain, randomLoadout, round, writeJson } from './common';

export interface PerfReport {
  battles: number;
  seconds: number;
  battlesPerSecond: number;
  avgTicksPerBattle: number;
  avgDuration: number;
  logging: boolean;
}

export function runPerf(battles = 10000, logging = true): PerfReport {
  // 編成の生成コストを計測に混ぜないよう、先に作っておく
  const loadouts = [];
  for (let i = 0; i < 200; i++) {
    loadouts.push(randomLoadout(new Rng(`perf-${i}::gen`), { maxStar: 3, equipChance: 0.5 }));
  }

  let durSum = 0;
  const t0 = performance.now();
  for (let i = 0; i < battles; i++) {
    const lo = loadouts[i % loadouts.length]!;
    const enc = ENCOUNTERS[i % ENCOUNTERS.length]!;
    const r = fight(lo, enc, { seed: `perf-${i}`, logging });
    durSum += r.duration;
  }
  const seconds = (performance.now() - t0) / 1000;

  return {
    battles,
    seconds: round(seconds, 2),
    battlesPerSecond: round(battles / seconds, 1),
    avgTicksPerBattle: round(durSum / battles / 0.1, 1),
    avgDuration: round(durSum / battles, 2),
    logging,
  };
}

function main(): void {
  const rep = runPerf(10000, true);
  console.log(
    `[perf] ${rep.battles}戦 を ${rep.seconds}s（${rep.battlesPerSecond} 戦/秒、平均 ${rep.avgDuration}s／戦、ログ記録あり）`,
  );
  writeJson('sim-perf.json', rep);
}

if (isMain(import.meta.url)) main();
