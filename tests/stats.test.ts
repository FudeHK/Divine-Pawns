import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/engine/config';
import {
  attackInterval,
  buildStats,
  collectBlessingMods,
  equipmentSlots,
  makeBase,
  normalDamage,
  skillStarMul,
} from '../src/engine/stats';
import { effectiveEquipment, resolveMembers } from '../src/engine/build';
import type { EquipmentDef, LoadoutEntry, Star, Stats } from '../src/engine/types';
import { getEquipment } from '../src/data/equipment';
import { getBlessing } from '../src/data/blessings';

const base: Stats = {
  maxHp: 1000,
  atk: 100,
  def: 20,
  atkSpeed: 0.8,
  range: 2,
  maxMana: 100,
  moveSpeed: 2,
};

describe('ダメージ式', () => {
  it('通常ダメージ = 攻撃力 × 100 ÷ (100 + 防御)', () => {
    expect(normalDamage(100, 0)).toBeCloseTo(100, 10);
    expect(normalDamage(100, 100)).toBeCloseTo(50, 10);
    expect(normalDamage(100, 20)).toBeCloseTo(83.3333333, 6);
    expect(normalDamage(250, 50)).toBeCloseTo(166.6666667, 6);
  });

  it('防御が負でも 0 として扱う', () => {
    expect(normalDamage(100, -50)).toBeCloseTo(100, 10);
  });

  it('攻撃間隔 = 1 ÷ 攻撃速度', () => {
    expect(attackInterval(0.8)).toBeCloseTo(1.25, 10);
    expect(attackInterval(2)).toBeCloseTo(0.5, 10);
    expect(attackInterval(0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('★倍率', () => {
  it('HP・攻撃力の倍率は ★1 で ×0.95、★2 で ×2.1、★3 で ×5.0', () => {
    expect(DEFAULT_CONFIG.starStatMul[1]).toBe(0.95);
    expect(DEFAULT_CONFIG.starStatMul[2]).toBe(2.1);
    expect(DEFAULT_CONFIG.starStatMul[3]).toBe(5.0);

    expect(buildStats({ base, star: 2, equipment: [] }).atk).toBeCloseTo(210, 10);
    expect(buildStats({ base, star: 3, equipment: [] }).maxHp).toBeCloseTo(5000, 10);
  });

  it('★が上がるほど伸びが大きくなる（★1→★2 より ★2→★3）', () => {
    const m = DEFAULT_CONFIG.starStatMul;
    expect(m[2] / m[1]).toBeGreaterThan(2);
    expect(m[3] / m[2]).toBeGreaterThan(m[2] / m[1]);
    const k = DEFAULT_CONFIG.starSkillMul;
    expect(k[3] / k[2]).toBeGreaterThanOrEqual(k[2] / k[1] - 1e-9);
  });

  it('スキル係数の倍率は ★1 で ×0.9、★2 で ×1.85、★3 で ×3.9', () => {
    expect(skillStarMul(1)).toBe(0.9);
    expect(skillStarMul(2)).toBe(1.85);
    expect(skillStarMul(3)).toBe(3.9);
  });

  it('★倍率は HP と攻撃力にだけ乗る', () => {
    const s = buildStats({ base, star: 3, equipment: [] });
    expect(s.def).toBe(20);
    expect(s.atkSpeed).toBe(0.8);
    expect(s.range).toBe(2);
    expect(s.moveSpeed).toBe(2);
  });
});

describe('ステータス計算の順序', () => {
  const flatEq: EquipmentDef = {
    id: 'test_flat',
    name: '固定値',
    desc: 'テスト用',
    tier: 1,
    flat: { atk: 25 },
  };
  const pctEq: EquipmentDef = {
    id: 'test_pct',
    name: '割合',
    desc: 'テスト用',
    tier: 1,
    pct: { atk: 0.1 },
  };

  it('基本値 × ★倍率 → 固定値を加算 → 割合を乗算', () => {
    // 100 × 2.1 = 210 → +25 = 235 → × 1.1 = 258.5
    const s = buildStats({ base, star: 2, equipment: [flatEq, pctEq] });
    expect(s.atk).toBeCloseTo(258.5, 10);
  });

  it('割合補正は合計してから1回だけ乗算する（1 + Σ%）', () => {
    const pctEq2: EquipmentDef = {
      id: 'test_pct2',
      name: '割合2',
      desc: 'テスト用',
      tier: 1,
      pct: { atk: 0.2 },
    };
    // 100 × 0.95 = 95 → × (1 + 0.1 + 0.2) = 123.5（1.1 × 1.2 倍にはならない）
    const s = buildStats({ base, star: 1, equipment: [pctEq, pctEq2] });
    expect(s.atk).toBeCloseTo(123.5, 10);
    expect(s.atk).not.toBeCloseTo(95 * 1.1 * 1.2, 6);
  });

  it('装備の固定値は ★倍率のあとに足す（★倍率は装備分に乗らない）', () => {
    const s = buildStats({ base, star: 3, equipment: [flatEq] });
    // 100 × 5.0 = 500 → +25 = 525（(100+25) × 5.0 ではない）
    expect(s.atk).toBeCloseTo(525, 10);
  });

  it('実データの装備でも順序が守られる', () => {
    const power = getEquipment('eq_power');
    const tough = getEquipment('eq_tough');
    const s = buildStats({ base, star: 2, equipment: [power, tough] });
    expect(s.atk).toBeCloseTo(100 * 2.1 + 25, 10);
    expect(s.maxHp).toBeCloseTo(1000 * 2.1 + 350, 10);
  });
});

describe('加護の編成補正', () => {
  it('雷の加護は雷属性にだけ攻撃力 +10%', () => {
    const bless = [getBlessing('bl_thunder')];
    const roster = [
      { element: 'lightning' as const, role: 'ranged' as const, myth: 'greek' as const },
      { element: 'fire' as const, role: 'melee' as const, myth: 'norse' as const },
    ];
    const ctx = { roster };
    const forLightning = collectBlessingMods(bless, roster[0]!, ctx);
    const forFire = collectBlessingMods(bless, roster[1]!, ctx);
    expect(forLightning).toHaveLength(1);
    expect(forFire).toHaveLength(0);
    expect(buildStats({ base, star: 1, equipment: [], extraMods: forLightning }).atk)
      .toBeCloseTo(100 * DEFAULT_CONFIG.starStatMul[1] * 1.1, 10);
  });

  it('多彩な加護は属性がすべて異なる時だけ HP +15%', () => {
    const bless = [getBlessing('bl_variety')];
    const distinct = [
      { element: 'fire' as const, role: 'melee' as const, myth: 'norse' as const },
      { element: 'ice' as const, role: 'tank' as const, myth: 'greek' as const },
    ];
    const dup = [
      { element: 'fire' as const, role: 'melee' as const, myth: 'norse' as const },
      { element: 'fire' as const, role: 'mage' as const, myth: 'egyptian' as const },
    ];
    expect(collectBlessingMods(bless, distinct[0]!, { roster: distinct })).toHaveLength(1);
    expect(collectBlessingMods(bless, dup[0]!, { roster: dup })).toHaveLength(0);
  });
});

describe('役割ごとの基本ステータス', () => {
  it('序盤の1回の攻撃は2〜3桁、HPは3〜4桁に収まる', () => {
    for (const role of ['tank', 'melee', 'ranged', 'mage', 'healer', 'support'] as const) {
      for (const tier of [1, 2, 3] as const) {
        const b = makeBase(role, tier);
        const hit = normalDamage(b.atk, 20);
        expect(hit).toBeGreaterThanOrEqual(10);
        expect(hit).toBeLessThan(1000);
        expect(b.maxHp).toBeGreaterThanOrEqual(100);
        expect(b.maxHp).toBeLessThan(10000);
      }
    }
  });
});

describe('装備スロット（★の数と同じ）', () => {
  it('★1=1・★2=2・★3=3', () => {
    expect(equipmentSlots(1)).toBe(1);
    expect(equipmentSlots(2)).toBe(2);
    expect(equipmentSlots(3)).toBe(3);
  });

  it('スロット数を超えた装備は効かない', () => {
    const power = getEquipment('eq_power'); // 攻撃力 +25
    const tough = getEquipment('eq_tough'); // HP +350
    const entry = (star: Star, ids: string[]): LoadoutEntry => ({
      charId: 'GRE_A',
      star,
      equipment: ids,
      pos: { x: 2, y: 3 },
    });

    // ★1 は1つだけ効く
    expect(effectiveEquipment(entry(1, ['eq_power', 'eq_tough'])).map((e) => e.id)).toEqual([
      power.id,
    ]);
    // ★2 は2つとも効く
    expect(effectiveEquipment(entry(2, ['eq_power', 'eq_tough'])).map((e) => e.id)).toEqual([
      power.id,
      tough.id,
    ]);
    // 空きスロット（''）は無視される
    expect(effectiveEquipment(entry(3, ['', 'eq_tough', ''])).map((e) => e.id)).toEqual([tough.id]);
  });

  it('★を上げるとスロットが増え、追加した装備がステータスに乗る', () => {
    const base2 = resolveMembers({
      frontline: [{ charId: 'GRE_A', star: 2, equipment: ['eq_power'], pos: { x: 2, y: 3 } }],
      support: [],
      blessings: [],
    })[0]!.stats;
    const both2 = resolveMembers({
      frontline: [
        { charId: 'GRE_A', star: 2, equipment: ['eq_power', 'eq_tough'], pos: { x: 2, y: 3 } },
      ],
      support: [],
      blessings: [],
    })[0]!.stats;
    expect(both2.maxHp).toBeCloseTo(base2.maxHp + 350, 6);
    expect(both2.atk).toBeCloseTo(base2.atk, 6);

    // ★1 だと2つ目は乗らない
    const both1 = resolveMembers({
      frontline: [
        { charId: 'GRE_A', star: 1, equipment: ['eq_power', 'eq_tough'], pos: { x: 2, y: 3 } },
      ],
      support: [],
      blessings: [],
    })[0]!.stats;
    const one1 = resolveMembers({
      frontline: [{ charId: 'GRE_A', star: 1, equipment: ['eq_power'], pos: { x: 2, y: 3 } }],
      support: [],
      blessings: [],
    })[0]!.stats;
    expect(both1.maxHp).toBeCloseTo(one1.maxHp, 6);
  });
});
