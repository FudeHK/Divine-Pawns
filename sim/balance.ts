/**
 * バランス観測：ランダム編成1,000件で各遭遇に挑む。
 * 合格条件なし。平均戦闘時間・時間切れ率・遭遇別の勝率・属性別の秒間ダメージを報告する。
 */

import { ELEMENTS, type Element } from '../src/engine/types';
import { Rng } from '../src/engine/rng';
import {
  ENCOUNTERS,
  fight,
  isMain,
  mean,
  pct,
  randomLoadout,
  round,
  writeJson,
} from './common';

export interface BalanceReport {
  loadouts: number;
  battles: number;
  avgDuration: number;
  timeoutRate: number;
  overallWinRate: number;
  perEncounter: {
    encounter: string;
    battles: number;
    winRate: number;
    avgDuration: number;
    timeoutRate: number;
    avgAllyDps: number;
  }[];
  dpsByElement: { element: Element; avgDps: number; share: number }[];
}

export function runBalance(loadoutCount = 1000): BalanceReport {
  const durations: number[] = [];
  let timeouts = 0;
  let wins = 0;
  let battles = 0;

  const perEnc = new Map<
    string,
    { battles: number; wins: number; dur: number[]; timeouts: number; dps: number[] }
  >();
  for (const e of ENCOUNTERS) {
    perEnc.set(e.id, { battles: 0, wins: 0, dur: [], timeouts: 0, dps: [] });
  }

  const elementDps: Record<Element, number[]> = {
    fire: [],
    ice: [],
    wood: [],
    lightning: [],
  };

  for (let i = 0; i < loadoutCount; i++) {
    const lo = randomLoadout(new Rng(`bal-${i}::gen`), {
      maxStar: 2,
      equipChance: 0.4,
      blessingChance: 0.3,
    });
    for (const enc of ENCOUNTERS) {
      const r = fight(lo, enc, { seed: `bal-${i}-${enc.id}`, logging: false });
      battles++;
      durations.push(r.duration);
      if (r.outcome === 'timeout') timeouts++;
      if (r.win) wins++;

      const slot = perEnc.get(enc.id)!;
      slot.battles++;
      slot.dur.push(r.duration);
      slot.dps.push(r.allyDps);
      if (r.win) slot.wins++;
      if (r.outcome === 'timeout') slot.timeouts++;

      const d = Math.max(0.1, r.duration);
      for (const el of ELEMENTS) {
        const v = r.allyDamageByElement[el];
        if (v > 0) elementDps[el].push(v / d);
      }
    }
  }

  const totalElementDps = ELEMENTS.reduce(
    (s, el) => s + elementDps[el].reduce((a, b) => a + b, 0),
    0,
  );

  return {
    loadouts: loadoutCount,
    battles,
    avgDuration: round(mean(durations), 2),
    timeoutRate: round(pct(timeouts, battles), 2),
    overallWinRate: round(pct(wins, battles), 2),
    perEncounter: ENCOUNTERS.map((e) => {
      const s = perEnc.get(e.id)!;
      return {
        encounter: e.id,
        battles: s.battles,
        winRate: round(pct(s.wins, s.battles), 1),
        avgDuration: round(mean(s.dur), 2),
        timeoutRate: round(pct(s.timeouts, s.battles), 2),
        avgAllyDps: round(mean(s.dps), 1),
      };
    }),
    dpsByElement: ELEMENTS.map((el) => {
      const sum = elementDps[el].reduce((a, b) => a + b, 0);
      return {
        element: el,
        avgDps: round(mean(elementDps[el]), 1),
        share: round(pct(sum, totalElementDps), 1),
      };
    }),
  };
}

function main(): void {
  const t0 = performance.now();
  const rep = runBalance(1000);
  const ms = performance.now() - t0;
  console.log(
    `[balance] ${rep.battles}戦  平均 ${rep.avgDuration}s  時間切れ率 ${rep.timeoutRate}%  全体勝率 ${rep.overallWinRate}%  (${(ms / 1000).toFixed(1)}s)`,
  );
  for (const e of rep.perEncounter) {
    console.log(
      `  ${e.encounter}  勝率 ${e.winRate}%  平均 ${e.avgDuration}s  時間切れ ${e.timeoutRate}%  味方DPS ${e.avgAllyDps}`,
    );
  }
  for (const e of rep.dpsByElement) {
    console.log(`  ${e.element.padEnd(9)} 平均DPS ${e.avgDps}  シェア ${e.share}%`);
  }
  writeJson('sim-balance.json', rep);
}

if (isMain(import.meta.url)) main();
