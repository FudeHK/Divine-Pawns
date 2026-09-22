/**
 * フェーズ1.5 で入れ替えた仕組みの検証。
 * - 加護はチーム効果として扱い、ユニットにしない
 * - 攻撃の初期遅延（initialAttackDelay）
 * - 同時全滅の扱い（simultaneousWipe）
 */

import { describe, expect, it } from 'vitest';

import { getEncounter } from '../src/data/encounters';
import { Battle, runBattle, type BattleUnitSpec } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { DEFAULT_CONFIG, cloneConfig } from '../src/engine/config';
import type { Hex, Loadout, Stats } from '../src/engine/types';

function loadout(blessings: string[]): Loadout {
  return {
    frontline: [
      { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 3 } },
      { charId: 'GRE_A', star: 1, equipment: [], pos: { x: 1, y: 3 } },
      { charId: 'EGY_A', star: 1, equipment: [], pos: { x: 2, y: 5 } },
    ],
    support: [
      { charId: 'JPN_B', star: 1, equipment: [] },
      { charId: 'GRE_B', star: 1, equipment: [] },
    ],
    blessings,
  };
}

describe('加護はチーム効果（ユニットではない）', () => {
  it('加護キャリアのユニットが作られない', () => {
    const plain = buildBattleSetup(loadout([]), getEncounter('E1'), { seed: 'te' });
    const withBless = buildBattleSetup(loadout(['bl_inferno']), getEncounter('E1'), { seed: 'te' });

    expect(withBless.units.length).toBe(plain.units.length);
    expect(withBless.units.map((u) => u.id)).toEqual(plain.units.map((u) => u.id));
    expect(withBless.units.some((u) => u.defId === 'blessing_carrier')).toBe(false);

    expect(plain.teamEffects ?? []).toHaveLength(0);
    expect(withBless.teamEffects).toHaveLength(1);
    expect(withBless.teamEffects![0]!.source).toEqual({ kind: 'blessing', id: 'bl_inferno' });
    expect(withBless.teamEffects![0]!.side).toBe('ally');
  });

  it('編成人数・ターゲット候補・ユニット数の集計が変わらない', () => {
    const a = new Battle(buildBattleSetup(loadout([]), getEncounter('E1'), { seed: 'te' }));
    const b = new Battle(
      buildBattleSetup(loadout(['bl_inferno', 'bl_thunder', 'bl_variety']), getEncounter('E1'), {
        seed: 'te',
      }),
    );
    a.start();
    b.start();

    expect(b.units.length).toBe(a.units.length);
    expect(b.units.map((u) => u.id)).toEqual(a.units.map((u) => u.id));

    // 盤上のユニット（＝ターゲット候補）が一致する
    const fielded = (x: Battle, side: string): string[] =>
      x.units.filter((u) => u.side === side && u.alive && u.onField).map((u) => u.id);
    expect(fielded(b, 'ally')).toEqual(fielded(a, 'ally'));
    expect(fielded(b, 'enemy')).toEqual(fielded(a, 'enemy'));

    // 敵から見たターゲット選択も同じ相手になる
    a.step();
    b.step();
    const targetOf = (x: Battle, id: string): string | undefined =>
      x.units.find((u) => u.id === id)!.currentTarget?.id;
    for (const u of a.units) {
      expect(targetOf(b, u.id), u.id).toBe(targetOf(a, u.id));
    }

    // ログの集計（ユニットの数）も同じ
    const spawns = (x: Battle): number => x.log.events.filter((e) => e.type === 'spawn').length;
    expect(spawns(b)).toBe(spawns(a));
  });

  it('加護の出どころがログに残る', () => {
    const b = new Battle(
      buildBattleSetup(loadout(['bl_inferno']), getEncounter('E1'), { seed: 'te' }),
    );
    b.start();
    const ev = b.log.events.find((e) => e.type === 'teamEffect');
    expect(ev).toBeTruthy();
    expect(ev!.note).toContain('blessing:bl_inferno');
    expect(ev!.side).toBe('ally');
  });

  it('業火の加護の効果量は従来どおり（燃焼係数が2倍）', () => {
    // 1章1戦目（E1）は一瞬で終わるので、燃焼が乗る長さの戦闘で見る
    const run = (bless: string[]): number => {
      const b = new Battle(buildBattleSetup(loadout(bless), getEncounter('E4'), { seed: 'te' }));
      b.run();
      // NOR_A（炎）が付けた燃焼の係数を、燃焼ダメージの合計で見る
      return b.log.events
        .filter((e) => e.type === 'debuffTick' && e.debuff === 'burn')
        .reduce((s, e) => s + (e.value ?? 0), 0);
    };
    const plain = run([]);
    const inferno = run(['bl_inferno']);
    expect(plain).toBeGreaterThan(0);
    expect(inferno).toBeGreaterThan(plain);
  });

  it('燃焼係数そのものが2倍になる', () => {
    const coefOf = (bless: string[]): number => {
      const b = new Battle(buildBattleSetup(loadout(bless), getEncounter('E4'), { seed: 'te' }));
      b.start();
      for (let i = 0; i < 400 && !b.finished; i++) {
        b.step();
        const hit = b.units.find((u) => u.side === 'enemy' && u.debuffs.burn.coef > 0);
        if (hit) return hit.debuffs.burn.coef;
      }
      return 0;
    };
    const plain = coefOf([]);
    const inferno = coefOf(['bl_inferno']);
    expect(plain).toBeGreaterThan(0);
    expect(inferno).toBeCloseTo(plain * 2, 6);
  });

  it('編成の割合補正（雷の加護・多彩な加護）も従来どおり効く', () => {
    const setup = buildBattleSetup(loadout(['bl_thunder']), getEncounter('E1'), { seed: 'te' });
    const plain = buildBattleSetup(loadout([]), getEncounter('E1'), { seed: 'te' });
    const atk = (s: typeof setup, defId: string): number =>
      s.units.find((u) => u.defId === defId)!.stats.atk;
    // GRE_B（雷）だけ攻撃力 +10%
    expect(atk(setup, 'GRE_B')).toBeCloseTo(atk(plain, 'GRE_B') * 1.1, 6);
    expect(atk(setup, 'NOR_A')).toBeCloseTo(atk(plain, 'NOR_A'), 6);
  });
});

// ---------------------------------------------------------------------------

const baseStats: Stats = {
  maxHp: 1000,
  atk: 50,
  def: 0,
  atkSpeed: 1,
  range: 5,
  maxMana: 1000,
  moveSpeed: 2,
};

function unit(id: string, side: 'ally' | 'enemy', pos: Hex, over: Partial<Stats> = {}): BattleUnitSpec {
  return {
    id,
    defId: id,
    name: id,
    side,
    role: 'ranged',
    element: 'fire',
    myth: null,
    star: 1,
    onField: true,
    pos,
    stats: { ...baseStats, ...over },
    resist: 0,
    effects: [],
  };
}

describe('攻撃の初期遅延（initialAttackDelay）', () => {
  it('既定値は0で、従来どおり開幕から攻撃する', () => {
    expect(DEFAULT_CONFIG.initialAttackDelay).toBe(0);
    const r = runBattle({
      seed: 'd',
      units: [unit('A00', 'ally', { x: 2, y: 3 }), unit('E00', 'enemy', { x: 2, y: 2 })],
    });
    const first = r.log.events.find((e) => e.type === 'attack')!;
    expect(first.t).toBeCloseTo(0.1, 6);
  });

  it('既定値ではログのハッシュが変わらない', () => {
    const lo = loadout(['bl_inferno']);
    const a = runBattle(buildBattleSetup(lo, getEncounter('E3'), { seed: 'delay' }));
    const cfg = cloneConfig();
    cfg.initialAttackDelay = 0;
    const b = runBattle(buildBattleSetup(lo, getEncounter('E3'), { seed: 'delay', config: cfg }));
    expect(b.logHash).toBe(a.logHash);
  });

  it('1.0秒にすると最初の攻撃が1.0秒後になる', () => {
    const cfg = cloneConfig();
    cfg.initialAttackDelay = 1.0;
    const r = runBattle({
      seed: 'd',
      config: cfg,
      units: [unit('A00', 'ally', { x: 2, y: 3 }), unit('E00', 'enemy', { x: 2, y: 2 })],
    });
    const first = r.log.events.find((e) => e.type === 'attack')!;
    expect(first.t).toBeCloseTo(1.0, 6);
  });

  it('個体ごとに上書きできる', () => {
    const units = [unit('A00', 'ally', { x: 2, y: 3 }), unit('E00', 'enemy', { x: 2, y: 2 })];
    units[1]!.initialAttackDelay = 2.0;
    const r = runBattle({ seed: 'd', units });
    const firstAlly = r.log.events.find((e) => e.type === 'attack' && e.actor === 'A00')!;
    const firstFoe = r.log.events.find((e) => e.type === 'attack' && e.actor === 'E00')!;
    expect(firstAlly.t).toBeCloseTo(0.1, 6);
    expect(firstFoe.t).toBeCloseTo(2.0, 6);
  });
});

describe('同時全滅の扱い（simultaneousWipe）', () => {
  /**
   * 互いに傷つけられない同じ強さの2体。
   * 時間切れのサドンデスで、同じティックに両方が倒れる。
   */
  function wipeSetup(rule: 'lose' | 'win' | 'draw') {
    const cfg = cloneConfig();
    cfg.simultaneousWipe = rule;
    return {
      seed: 'w',
      config: cfg,
      units: [
        unit('A00', 'ally', { x: 2, y: 3 }, { maxHp: 1000, atk: 0 }),
        unit('E00', 'enemy', { x: 2, y: 2 }, { maxHp: 1000, atk: 0 }),
      ],
    };
  }

  it('既定は敗北', () => {
    expect(DEFAULT_CONFIG.simultaneousWipe).toBe('lose');
    const r = runBattle(wipeSetup('lose'));
    expect(r.allySurvivors).toBe(0);
    expect(r.enemySurvivors).toBe(0);
    expect(r.outcome).toBe('lose');
    expect(r.win).toBe(false);
  });

  it('「勝利」にすると勝利になる', () => {
    const r = runBattle(wipeSetup('win'));
    expect(r.outcome).toBe('win');
    expect(r.win).toBe(true);
  });

  it('「引き分け」にすると引き分けになる', () => {
    const r = runBattle(wipeSetup('draw'));
    expect(r.outcome).toBe('draw');
    expect(r.win).toBe(false);
  });
});
