/**
 * 初戦の検証：8体それぞれ単独（★1・装備なし）で、味方14マスのすべての配置から E0 に挑む。
 * 合格条件：全体の勝率 100%。
 */

import {
  ALLY_CELLS,
  CHARACTERS,
  entry,
  fight,
  getEncounter,
  isMain,
  loadout,
  pct,
  round,
  writeJson,
} from './common';

export interface FirstBattleReport {
  total: number;
  wins: number;
  winRate: number;
  perCharacter: {
    charId: string;
    name: string;
    battles: number;
    wins: number;
    winRate: number;
    avgDuration: number;
    losses: { pos: string; outcome: string; duration: number }[];
  }[];
  pass: boolean;
}

export function runFirstBattle(): FirstBattleReport {
  const enc = getEncounter('E0');
  const perCharacter: FirstBattleReport['perCharacter'] = [];
  let total = 0;
  let wins = 0;

  for (const c of CHARACTERS) {
    let cWins = 0;
    const durations: number[] = [];
    const losses: { pos: string; outcome: string; duration: number }[] = [];
    for (const cell of ALLY_CELLS) {
      const lo = loadout([entry(c.id, { ...cell }, 1, [])], [], []);
      const r = fight(lo, enc, { seed: `first-${c.id}-${cell.x}-${cell.y}`, logging: false });
      total++;
      durations.push(r.duration);
      if (r.win) {
        wins++;
        cWins++;
      } else {
        losses.push({ pos: `${cell.x},${cell.y}`, outcome: r.outcome, duration: r.duration });
      }
    }
    perCharacter.push({
      charId: c.id,
      name: c.name,
      battles: ALLY_CELLS.length,
      wins: cWins,
      winRate: round(pct(cWins, ALLY_CELLS.length), 1),
      avgDuration: round(durations.reduce((a, b) => a + b, 0) / durations.length, 2),
      losses,
    });
  }

  return {
    total,
    wins,
    winRate: round(pct(wins, total), 1),
    perCharacter,
    pass: wins === total,
  };
}

function main(): void {
  const rep = runFirstBattle();
  console.log(`[first-battle] 勝率 ${rep.winRate}%  (${rep.wins}/${rep.total})`);
  for (const c of rep.perCharacter) {
    const mark = c.wins === c.battles ? 'OK' : 'NG';
    console.log(
      `  ${mark} ${c.charId} ${c.wins}/${c.battles}  平均 ${c.avgDuration}s` +
        (c.losses.length > 0 ? `  失敗: ${c.losses.map((l) => l.pos).join(' ')}` : ''),
    );
  }
  writeJson('sim-first-battle.json', rep);
  if (!rep.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
