/**
 * 加護のデータと、割合（%）で効くチーム効果の検証。
 */

import { describe, expect, it } from 'vitest';

import { BLESSINGS, getBlessing } from '../src/data/blessings';
import { getEncounter } from '../src/data/encounters';
import { Battle } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { RARITIES, type Loadout } from '../src/engine/types';

describe('加護のデータ', () => {
  it('すべての加護に 名前・1行の説明・summary・レア度 がある', () => {
    expect(BLESSINGS.length).toBeGreaterThanOrEqual(4);
    for (const b of BLESSINGS) {
      expect(b.name, b.id).toBeTruthy();
      expect(b.desc, b.id).toBeTruthy();
      expect(b.summary, b.id).toBeTruthy();
      expect(RARITIES, b.id).toContain(b.rarity);
      // 説明文は簡潔で、倍率を書かない
      expect(b.summary.length, b.id).toBeLessThanOrEqual(30);
      expect(b.summary, `${b.id}: ${b.summary}`).not.toMatch(/[0-9０-９]|％|%|×/);
    }
  });

  it('ID は一意', () => {
    const ids = BLESSINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------

/** 前衛に雷属性（GRE_B）とそれ以外を混ぜた編成 */
function loadout(blessings: string[]): Loadout {
  return {
    frontline: [
      // 最後列の攻撃力パッシブが混ざらないよう、2行目に置く
      { charId: 'GRE_B', star: 1, equipment: [], pos: { x: 2, y: 4 } }, // 雷
      { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } }, // 炎
      { charId: 'GRE_A', star: 1, equipment: [], pos: { x: 1, y: 3 } }, // 氷
    ],
    support: [
      { charId: 'JPN_B', star: 1, equipment: [] }, // 雷（サポート枠＝盤面外）
    ],
    blessings,
  };
}

function effAtk(blessings: string[], defId: string): number {
  const b = new Battle(buildBattleSetup(loadout(blessings), getEncounter('E1'), { seed: 'bl' }));
  b.start();
  return b.units.find((u) => u.defId === defId)!.eff.atk;
}

describe('割合で効くチーム効果（嵐の加護）', () => {
  it('データが割合指定のチーム効果になっている', () => {
    const storm = getBlessing('bl_storm');
    expect(storm.buildMods ?? []).toHaveLength(0);
    const eff = storm.effects![0]!.effects[0]!;
    expect(eff.kind).toBe('statMod');
    if (eff.kind !== 'statMod') throw new Error('statMod ではない');
    expect(eff.mode).toBe('pct');
    expect(eff.value).toBeCloseTo(0.15, 10);
    expect(eff.filter).toEqual({ element: 'lightning' });
  });

  it('加護はユニットにならない（チーム効果として積まれる）', () => {
    const plain = buildBattleSetup(loadout([]), getEncounter('E1'), { seed: 'bl' });
    const storm = buildBattleSetup(loadout(['bl_storm']), getEncounter('E1'), { seed: 'bl' });
    expect(storm.units.length).toBe(plain.units.length);
    expect(storm.teamEffects).toHaveLength(1);
    expect(storm.teamEffects![0]!.source).toEqual({ kind: 'blessing', id: 'bl_storm' });
  });

  it('雷属性の前衛だけ攻撃力が 15% 上がる', () => {
    const before = effAtk([], 'GRE_B');
    const after = effAtk(['bl_storm'], 'GRE_B');
    expect(after).toBeCloseTo(before * 1.15, 6);

    // 雷でない前衛には効かない
    expect(effAtk(['bl_storm'], 'NOR_A')).toBeCloseTo(effAtk([], 'NOR_A'), 6);
    expect(effAtk(['bl_storm'], 'GRE_A')).toBeCloseTo(effAtk([], 'GRE_A'), 6);
  });

  it('盤面に出ていないサポート枠には、前衛向けのチーム効果は乗らない', () => {
    expect(effAtk(['bl_storm'], 'JPN_B')).toBeCloseTo(effAtk([], 'JPN_B'), 6);
  });

  it('敵には効かない', () => {
    const b = new Battle(
      buildBattleSetup(loadout(['bl_storm']), getEncounter('E1'), { seed: 'bl' }),
    );
    b.start();
    for (const u of b.units.filter((x) => x.side === 'enemy')) {
      expect(u.eff.atk).toBeCloseTo(u.base.atk, 6);
    }
  });

  it('編成時の割合補正（雷の加護）と重ねがけできる', () => {
    const base = effAtk([], 'GRE_B');
    const both = effAtk(['bl_thunder', 'bl_storm'], 'GRE_B');
    // 雷の加護は編成時に +10%、嵐の加護は戦闘中に +15%
    expect(both).toBeCloseTo(base * 1.1 * 1.15, 6);
  });

  it('チーム効果を外すと元に戻る（永続的に積み上がらない）', () => {
    const b = new Battle(
      buildBattleSetup(loadout(['bl_storm']), getEncounter('E1'), { seed: 'bl' }),
    );
    b.start();
    const u = b.units.find((x) => x.defId === 'GRE_B')!;
    const first = u.eff.atk;
    for (let i = 0; i < 20; i++) b.step();
    // 毎フレーム作り直しているので、同じ倍率のまま（積み上がらない）
    const later = b.units.find((x) => x.defId === 'GRE_B')!;
    expect(later.eff.atk / later.base.atk).toBeCloseTo(first / u.base.atk, 6);
  });
});
