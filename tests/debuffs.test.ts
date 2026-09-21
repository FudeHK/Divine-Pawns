import { describe, expect, it } from 'vitest';

import { Battle, type BattleUnitSpec } from '../src/engine/battle';
import { DEFAULT_CONFIG } from '../src/engine/config';
import {
  applyBurn,
  applyPoison,
  burnCoefFromAtk,
  burnTickDamage,
  effectiveStacks,
  frostbiteAtkSpeedMul,
  newDebuffState,
  paralysisBlockChance,
  poisonCoefFromAtk,
  poisonTickDamage,
} from '../src/engine/debuffs';
import type { DebuffKind, EffectDef, Stats } from '../src/engine/types';

// ---------------------------------------------------------------------------
// 単体の数式
// ---------------------------------------------------------------------------

describe('凍傷（氷）', () => {
  it('攻撃速度 × 1 ÷ (1 + 0.05 × 有効ストック)', () => {
    // 10ストックで約66.7%
    expect(frostbiteAtkSpeedMul(10, 0)).toBeCloseTo(0.6667, 4);
    // 100ストックで約16.7%
    expect(frostbiteAtkSpeedMul(100, 0)).toBeCloseTo(0.1667, 4);
    expect(frostbiteAtkSpeedMul(0, 0)).toBe(1);
  });

  it('耐性は有効ストックを減らす', () => {
    expect(effectiveStacks(20, 0.2)).toBeCloseTo(16, 10);
    expect(frostbiteAtkSpeedMul(10, 0.5)).toBeCloseTo(frostbiteAtkSpeedMul(5, 0), 10);
  });

  it('ストック数に上限はない', () => {
    expect(frostbiteAtkSpeedMul(10000, 0)).toBeGreaterThan(0);
    expect(frostbiteAtkSpeedMul(10000, 0)).toBeLessThan(0.01);
  });
});

describe('麻痺（雷）', () => {
  it('阻止確率 = 有効ストック ÷ (有効ストック + 20)', () => {
    expect(paralysisBlockChance(5, 0)).toBeCloseTo(0.2, 10);
    expect(paralysisBlockChance(20, 0)).toBeCloseTo(0.5, 10);
    expect(paralysisBlockChance(80, 0)).toBeCloseTo(0.8, 10);
  });

  it('耐性20%・20ストックで約44.4%', () => {
    expect(paralysisBlockChance(20, 0.2)).toBeCloseTo(0.4444, 4);
  });

  it('ストック0なら阻止しない', () => {
    expect(paralysisBlockChance(0, 0)).toBe(0);
  });
});

describe('燃焼（炎）', () => {
  it('燃焼係数 = 付与者の攻撃力 × 0.02', () => {
    expect(burnCoefFromAtk(100)).toBeCloseTo(2, 10);
    expect(burnCoefFromAtk(350)).toBeCloseTo(7, 10);
  });

  it('毎秒のダメージ = ストック数 × 燃焼係数', () => {
    const s = newDebuffState().burn;
    applyBurn(s, 5, 2, 'A00');
    expect(burnTickDamage(s)).toBeCloseTo(10, 10);
  });

  it('付与者が複数なら係数は高い方', () => {
    const s = newDebuffState().burn;
    applyBurn(s, 3, 2, 'A00');
    applyBurn(s, 2, 5, 'A01');
    expect(s.stacks).toBe(5);
    expect(s.coef).toBe(5);
    expect(s.sourceId).toBe('A01');
    applyBurn(s, 1, 1, 'A02');
    expect(s.coef).toBe(5);
  });
});

describe('猛毒（木）', () => {
  it('猛毒係数 = 付与者の攻撃力 × 0.02', () => {
    expect(poisonCoefFromAtk(100)).toBeCloseTo(2, 10);
  });

  it('付与のたびに効果時間が延長される', () => {
    const s = newDebuffState().poison;
    applyPoison(s, 2, 3, 'A00');
    expect(s.remaining).toBe(3);
    applyPoison(s, 2, 3, 'A00');
    expect(s.remaining).toBe(6);
  });

  it('20秒続いた時の秒間ダメージは係数の5倍', () => {
    const s = newDebuffState().poison;
    applyPoison(s, 3, 30, 'A00');
    s.elapsed = 20;
    expect(poisonTickDamage(s)).toBeCloseTo(3 * 5, 10);
    // 0秒・4秒はまだ1倍、5秒で2倍
    s.elapsed = 0;
    expect(poisonTickDamage(s)).toBeCloseTo(3, 10);
    s.elapsed = 4;
    expect(poisonTickDamage(s)).toBeCloseTo(3, 10);
    s.elapsed = 5;
    expect(poisonTickDamage(s)).toBeCloseTo(6, 10);
  });
});

// ---------------------------------------------------------------------------
// 戦闘ループの中での挙動
// ---------------------------------------------------------------------------

const dummyStats: Stats = {
  maxHp: 100000,
  atk: 0,
  def: 0,
  atkSpeed: 0.1,
  range: 1,
  maxMana: 100,
  moveSpeed: 0.1,
};

function applierEffect(debuff: DebuffKind, stacks: number): EffectDef {
  return {
    id: `test_${debuff}`,
    name: `テスト${debuff}`,
    trigger: { kind: 'battleStart' },
    effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff, stacks }],
  };
}

/** 付与役1体 vs 硬い的1体の戦闘を作る */
function makeDebuffBattle(debuff: DebuffKind, stacks: number, atk = 100): Battle {
  const units: BattleUnitSpec[] = [
    {
      id: 'A00',
      defId: 'applier',
      name: '付与役',
      side: 'ally',
      role: 'mage',
      element: 'fire',
      myth: null,
      star: 1,
      onField: true,
      // 射程外に置き、ほぼ動かないようにして、通常攻撃が混ざらないようにする
      pos: { x: 2, y: 5 },
      stats: {
        ...dummyStats,
        maxHp: 100000,
        atk,
        atkSpeed: 0.0001,
        range: 1,
        moveSpeed: 0.0001,
      },
      resist: 0,
      effects: [{ def: applierEffect(debuff, stacks), origin: 'passive' }],
    },
    {
      id: 'E00',
      defId: 'dummy',
      name: '的',
      side: 'enemy',
      role: 'tank',
      element: 'wood',
      myth: null,
      star: 1,
      onField: true,
      pos: { x: 2, y: 2 },
      stats: dummyStats,
      resist: 0,
      effects: [],
    },
  ];
  return new Battle({ seed: 'debuff-test', units });
}

describe('戦闘ループの中のデバフ', () => {
  it('燃焼：ストックが毎秒1ずつ減る', () => {
    const b = makeDebuffBattle('burn', 5, 100);
    b.start();
    const target = b.units.find((u) => u.id === 'E00')!;
    expect(target.debuffs.burn.stacks).toBe(5);
    expect(target.debuffs.burn.coef).toBeCloseTo(2, 10);

    const seen: number[] = [];
    for (let s = 1; s <= 6; s++) {
      for (let i = 0; i < 10; i++) b.step();
      seen.push(target.debuffs.burn.stacks);
    }
    expect(seen).toEqual([4, 3, 2, 1, 0, 0]);
  });

  it('燃焼：合計ダメージは 5+4+3+2+1 ストック分', () => {
    const b = makeDebuffBattle('burn', 5, 100);
    b.start();
    const target = b.units.find((u) => u.id === 'E00')!;
    const hp0 = target.hp;
    for (let i = 0; i < 60; i++) b.step();
    // 燃焼係数2 × (5+4+3+2+1) = 30
    expect(hp0 - target.hp).toBeCloseTo(30, 6);
  });

  it('凍傷：自然には減らない（既定の減衰量は0）', () => {
    expect(DEFAULT_CONFIG.debuff.frostbite.decayPerSecond).toBe(0);
    const b = makeDebuffBattle('frostbite', 10, 100);
    b.start();
    const target = b.units.find((u) => u.id === 'E00')!;
    expect(target.debuffs.frostbite.stacks).toBe(10);
    for (let i = 0; i < 100; i++) b.step();
    expect(target.debuffs.frostbite.stacks).toBe(10);
    // 攻撃速度は 1/(1+0.5) 倍になっている
    expect(target.eff.atkSpeed).toBeCloseTo(dummyStats.atkSpeed / 1.5, 10);
  });

  it('猛毒：効果時間が切れると経過秒数は0に戻る', () => {
    const b = makeDebuffBattle('poison', 1, 100);
    b.start();
    const target = b.units.find((u) => u.id === 'E00')!;
    // 1ストック → 3秒
    expect(target.debuffs.poison.remaining).toBeCloseTo(3, 10);
    for (let i = 0; i < 30; i++) b.step();
    expect(target.debuffs.poison.remaining).toBe(0);
    expect(target.debuffs.poison.elapsed).toBe(0);
  });

  it('麻痺：スキル使用時に判定され、阻止されるとマナが半分に戻る', () => {
    // 麻痺100ストック（阻止確率 100/120 ≈ 83%）を受けた側がスキルを撃とうとする
    const skill: EffectDef = {
      id: 'test_skill',
      name: 'テストスキル',
      trigger: { kind: 'onSkill' },
      effects: [{ kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 1 } }],
    };
    const units: BattleUnitSpec[] = [
      {
        id: 'A00',
        defId: 'applier',
        name: '付与役',
        side: 'ally',
        role: 'mage',
        element: 'lightning',
        myth: null,
        star: 1,
        onField: true,
        pos: { x: 2, y: 3 },
        stats: { ...dummyStats, atk: 1, atkSpeed: 0.0001 },
        resist: 0,
        effects: [{ def: applierEffect('paralysis', 100), origin: 'passive' }],
      },
      {
        id: 'E00',
        defId: 'caster',
        name: '術者',
        side: 'enemy',
        role: 'mage',
        element: 'fire',
        myth: null,
        star: 1,
        onField: true,
        pos: { x: 2, y: 2 },
        stats: { ...dummyStats, atk: 1, atkSpeed: 2, maxMana: 10 },
        resist: 0,
        effects: [{ def: skill, origin: 'active' }],
      },
    ];
    const b = new Battle({ seed: 'paralysis-test', units });
    b.run();
    const blocked = b.log.events.filter((e) => e.type === 'skillBlocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]!.value).toBeCloseTo(100 / 120, 6);
  });

  it('麻痺：耐性が高いと阻止されにくい', () => {
    const lo = paralysisBlockChance(20, 0);
    const hi = paralysisBlockChance(20, 0.5);
    expect(hi).toBeLessThan(lo);
  });
});
