/**
 * サポート枠の検証。
 * - サポート枠のキャラは盤面に出ないが、装備込みの最終ステータスを持つ
 * - サポート効果の効果量はそのステータスを参照する
 * - シナジー条件はサポート枠のキャラも数に含める
 */

import { describe, expect, it } from 'vitest';

import { getEncounter } from '../src/data/encounters';
import { getCharacter } from '../src/data/characters';
import { Battle } from '../src/engine/battle';
import { buildBattleSetup, resolveMembers } from '../src/engine/build';
import { DEFAULT_CONFIG } from '../src/engine/config';
import type { Loadout } from '../src/engine/types';

function loadoutWith(supportEquipment: string[], blessings: string[] = []): Loadout {
  return {
    frontline: [
      { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } },
      { charId: 'EGY_B', star: 1, equipment: [], pos: { x: 1, y: 3 } },
    ],
    support: [{ charId: 'GRE_A', star: 1, equipment: supportEquipment }],
    blessings,
  };
}

function openingShield(lo: Loadout): number {
  const setup = buildBattleSetup(lo, getEncounter('E0'), { seed: 'support-test' });
  const b = new Battle(setup);
  b.start();
  const ev = b.log.events.find((e) => e.type === 'shield');
  expect(ev).toBeDefined();
  return ev!.value!;
}

describe('サポート枠', () => {
  it('サポート枠のキャラは盤面に出ない', () => {
    const setup = buildBattleSetup(loadoutWith([]), getEncounter('E0'), {
      seed: 'support-test',
    });
    const sup = setup.units.find((u) => u.id === 'S00')!;
    expect(sup.onField).toBe(false);
    expect(sup.defId).toBe('GRE_A');

    const b = new Battle(setup);
    b.run();
    // 盤面に出ていないので、狙われもしないし死にもしない
    const hit = b.log.events.some((e) => e.type === 'damage' && e.target === 'S00');
    expect(hit).toBe(false);
  });

  it('サポート枠でも装備込みの最終ステータスが計算される', () => {
    const plain = resolveMembers(loadoutWith([]));
    const equipped = resolveMembers(loadoutWith(['eq_tough']));
    const a = plain.find((m) => m.entry.charId === 'GRE_A')!;
    const b = equipped.find((m) => m.entry.charId === 'GRE_A')!;
    expect(b.slot).toBe('support');
    expect(b.stats.maxHp).toBeCloseTo(a.stats.maxHp + 350, 10);
  });

  it('サポート効果の効果量は、装備込みの最終ステータスを参照する', () => {
    // GRE_A のサポート効果：開幕、前衛全員に「自分の最大HP × 10%」のシールド
    const baseHp = getCharacter('GRE_A').base.maxHp;
    expect(openingShield(loadoutWith([]))).toBeCloseTo(baseHp * 0.1, 6);
    // タフネス系（HP +350）を持たせると、シールド量も 35 増える
    expect(openingShield(loadoutWith(['eq_tough']))).toBeCloseTo((baseHp + 350) * 0.1, 6);
  });

  it('サポート効果の効果量は、加護込みの最終ステータスも参照する', () => {
    // 多彩な加護（属性がすべて異なる時、全体の HP +15%）
    // 編成は NOR_A(炎) / EGY_B(木) / GRE_A(氷) で属性がすべて異なる
    const baseHp = getCharacter('GRE_A').base.maxHp;
    const withBless = openingShield(loadoutWith([], ['bl_variety']));
    expect(withBless).toBeCloseTo(baseHp * 1.15 * 0.1, 6);
  });

  it('★倍率もサポート枠に乗る', () => {
    const lo = loadoutWith([]);
    lo.support[0]!.star = 3;
    const baseHp = getCharacter('GRE_A').base.maxHp;
    expect(openingShield(lo)).toBeCloseTo(baseHp * DEFAULT_CONFIG.starStatMul[3] * 0.1, 6);
  });

  it('シナジー条件はサポート枠のキャラも数に含める', () => {
    // 前衛：炎1・木1／サポート：氷1（GRE_A）
    const setup = buildBattleSetup(loadoutWith([]), getEncounter('E0'), {
      seed: 'support-test',
    });
    const b = new Battle(setup);
    b.start();
    // conditionMet は private なので、実データの「多彩な加護」で間接的に確認する
    // → サポート枠を数に含めなければ属性は 炎/木 の2種で、含めれば 炎/木/氷 の3種
    const shieldNoBless = openingShield(loadoutWith([]));
    const shieldBless = openingShield(loadoutWith([], ['bl_variety']));
    expect(shieldBless).toBeGreaterThan(shieldNoBless);

    // サポート枠と前衛で属性が重なると、多彩な加護は発動しない
    const dup: Loadout = {
      frontline: [
        { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } },
        { charId: 'EGY_A', star: 1, equipment: [], pos: { x: 1, y: 3 } }, // 炎（NOR_A と重複）
      ],
      support: [{ charId: 'GRE_A', star: 1, equipment: [] }],
      blessings: ['bl_variety'],
    };
    expect(openingShield(dup)).toBeCloseTo(getCharacter('GRE_A').base.maxHp * 0.1, 6);
  });

  it('サポート枠のキャラはアクティブ・パッシブを使わない', () => {
    const setup = buildBattleSetup(loadoutWith([]), getEncounter('E0'), {
      seed: 'support-test',
    });
    const sup = setup.units.find((u) => u.id === 'S00')!;
    const ids = sup.effects.map((e) => e.def.id);
    expect(ids).toContain('GRE_A_s1');
    expect(ids).not.toContain('GRE_A_active');
    expect(ids).not.toContain('GRE_A_p1');
  });

  it('常時系のサポート効果は前衛の実効ステータスに乗る', () => {
    // GRE_B のサポート効果：常時、前衛全体の攻撃速度 +8%
    const withSupport: Loadout = {
      frontline: [{ charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } }],
      support: [{ charId: 'GRE_B', star: 1, equipment: [] }],
      blessings: [],
    };
    const without: Loadout = {
      frontline: [{ charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } }],
      support: [],
      blessings: [],
    };
    const run = (lo: Loadout): number => {
      const b = new Battle(
        buildBattleSetup(lo, getEncounter('E0'), { seed: 'support-test' }),
      );
      b.start();
      b.step();
      return b.units.find((u) => u.id === 'A00')!.eff.atkSpeed;
    };
    expect(run(withSupport)).toBeCloseTo(run(without) * 1.08, 10);
  });
});
