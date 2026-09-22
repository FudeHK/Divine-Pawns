/**
 * 初戦の検証：8体それぞれ単独（★1・装備なし）で、味方14マスのすべての配置から挑む。
 * 対象は「E0（1章最初の戦闘）」と「1章1戦目（ランのノード）」の両方。
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

/** 初戦として必ず勝てなければならない遭遇 */
export const FIRST_BATTLE_ENCOUNTERS = ['E0', 'E1'] as const;

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
    losses: { encounter: string; pos: string; outcome: string; duration: number }[];
  }[];
  perEncounter: { encounter: string; battles: number; wins: number; winRate: number }[];
  pass: boolean;
}

export function runFirstBattle(): FirstBattleReport {
  const perCharacter: FirstBattleReport['perCharacter'] = [];
  const encStats = new Map<string, { battles: number; wins: number }>();
  for (const id of FIRST_BATTLE_ENCOUNTERS) encStats.set(id, { battles: 0, wins: 0 });
  let total = 0;
  let wins = 0;

  for (const c of CHARACTERS) {
    let cWins = 0;
    let cBattles = 0;
    const durations: number[] = [];
    const losses: FirstBattleReport['perCharacter'][number]['losses'] = [];
    for (const encId of FIRST_BATTLE_ENCOUNTERS) {
      const enc = getEncounter(encId);
      for (const cell of ALLY_CELLS) {
        const lo = loadout([entry(c.id, { ...cell }, 1, [])], [], []);
        const r = fight(lo, enc, {
          seed: `first-${encId}-${c.id}-${cell.x}-${cell.y}`,
          logging: false,
        });
        total++;
        cBattles++;
        const st = encStats.get(encId)!;
        st.battles++;
        durations.push(r.duration);
        if (r.win) {
          wins++;
          cWins++;
          st.wins++;
        } else {
          losses.push({
            encounter: encId,
            pos: `${cell.x},${cell.y}`,
            outcome: r.outcome,
            duration: r.duration,
          });
        }
      }
    }
    perCharacter.push({
      charId: c.id,
      name: c.name,
      battles: cBattles,
      wins: cWins,
      winRate: round(pct(cWins, cBattles), 1),
      avgDuration: round(durations.reduce((a, b) => a + b, 0) / durations.length, 2),
      losses,
    });
  }

  return {
    total,
    wins,
    winRate: round(pct(wins, total), 1),
    perCharacter,
    perEncounter: [...encStats.entries()].map(([encounter, st]) => ({
      encounter,
      battles: st.battles,
      wins: st.wins,
      winRate: round(pct(st.wins, st.battles), 1),
    })),
    pass: wins === total,
  };
}

function main(): void {
  const rep = runFirstBattle();
  console.log(`[first-battle] 勝率 ${rep.winRate}%  (${rep.wins}/${rep.total})`);
  for (const e of rep.perEncounter) {
    console.log(`  ${e.encounter}: ${e.wins}/${e.battles} (${e.winRate}%)`);
  }
  for (const c of rep.perCharacter) {
    const mark = c.wins === c.battles ? 'OK' : 'NG';
    console.log(
      `  ${mark} ${c.charId} ${c.wins}/${c.battles}  平均 ${c.avgDuration}s` +
        (c.losses.length > 0 ? `  失敗: ${c.losses.map((l) => `${l.encounter}@${l.pos}`).join(' ')}` : ''),
    );
  }
  writeJson('sim-first-battle.json', rep);
  if (!rep.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
