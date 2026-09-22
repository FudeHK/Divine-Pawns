/**
 * 戦闘ループ・ターゲット選択・決定論・ログの検証。
 */

import { describe, expect, it } from 'vitest';

import { getEncounter } from '../src/data/encounters';
import { Battle, runBattle, type BattleUnitSpec } from '../src/engine/battle';
import { buildBattleSetup } from '../src/engine/build';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { hashLog } from '../src/engine/log';
import { Rng, RngSet } from '../src/engine/rng';
import type { Hex, Loadout, Role, Stats } from '../src/engine/types';

const baseStats: Stats = {
  maxHp: 1000,
  atk: 50,
  def: 10,
  atkSpeed: 0.8,
  range: 1,
  maxMana: 100,
  moveSpeed: 2,
};

function enemyAt(id: string, pos: Hex, role: Role, over: Partial<Stats> = {}): BattleUnitSpec {
  return {
    id,
    defId: id,
    name: id,
    side: 'enemy',
    role,
    element: 'wood',
    myth: null,
    star: 1,
    onField: true,
    pos,
    stats: { ...baseStats, ...over },
    resist: 0,
    effects: [],
  };
}

function ally(pos: Hex, over: Partial<Stats> = {}): BattleUnitSpec {
  return {
    id: 'A00',
    defId: 'hero',
    name: 'hero',
    side: 'ally',
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

describe('ターゲット選択', () => {
  it('最も近い敵を狙う', () => {
    const b = new Battle({
      seed: 't',
      units: [
        ally({ x: 2, y: 3 }, { range: 5 }),
        enemyAt('E00', { x: 2, y: 0 }, 'melee'),
        enemyAt('E01', { x: 2, y: 2 }, 'melee'),
      ],
    });
    b.start();
    b.step();
    expect(b.units.find((u) => u.id === 'A00')!.currentTarget!.id).toBe('E01');
  });

  it('同距離なら役割の優先度（タンク > 近接 > 遠隔 > メイジ > ヒーラー > サポーター）', () => {
    const b = new Battle({
      seed: 't',
      units: [
        ally({ x: 2, y: 3 }, { range: 5 }),
        enemyAt('E00', { x: 1, y: 2 }, 'healer'),
        enemyAt('E01', { x: 2, y: 2 }, 'melee'),
        enemyAt('E02', { x: 3, y: 2 }, 'tank'),
      ],
    });
    b.start();
    b.step();
    expect(b.units.find((u) => u.id === 'A00')!.currentTarget!.id).toBe('E02');
  });

  it('同距離・同役割なら残りHPが少ない方', () => {
    const b = new Battle({
      seed: 't',
      units: [
        ally({ x: 2, y: 3 }, { range: 5 }),
        enemyAt('E00', { x: 1, y: 2 }, 'melee', { maxHp: 1000 }),
        enemyAt('E01', { x: 2, y: 2 }, 'melee', { maxHp: 300 }),
      ],
    });
    b.start();
    b.step();
    expect(b.units.find((u) => u.id === 'A00')!.currentTarget!.id).toBe('E01');
  });

  it('暗殺型は最後列を狙う', () => {
    const units: BattleUnitSpec[] = [
      {
        ...enemyAt('E00', { x: 2, y: 2 }, 'melee'),
        targeting: 'backline',
        side: 'enemy',
      },
      { ...ally({ x: 2, y: 3 }), id: 'A00' },
      { ...ally({ x: 2, y: 5 }), id: 'A01' },
    ];
    const b = new Battle({ seed: 't', units });
    b.start();
    b.step();
    expect(b.units.find((u) => u.id === 'E00')!.currentTarget!.id).toBe('A01');
  });
});

describe('戦闘ループ', () => {
  it('射程外なら移動し、射程内なら攻撃する', () => {
    const b = new Battle({
      seed: 't',
      units: [ally({ x: 2, y: 5 }, { range: 1, moveSpeed: 2 }), enemyAt('E00', { x: 2, y: 2 }, 'melee')],
    });
    b.start();
    for (let i = 0; i < 5; i++) b.step();
    const moves = b.log.events.filter((e) => e.type === 'move');
    expect(moves.length).toBeGreaterThan(0);
    b.run();
    expect(b.log.events.some((e) => e.type === 'attack')).toBe(true);
  });

  it('敵全滅で勝利、味方全滅で敗北', () => {
    const win = runBattle({
      seed: 't',
      units: [ally({ x: 2, y: 3 }, { range: 5, atk: 5000 }), enemyAt('E00', { x: 2, y: 2 }, 'melee')],
    });
    expect(win.outcome).toBe('win');

    const lose = runBattle({
      seed: 't',
      units: [
        ally({ x: 2, y: 3 }, { maxHp: 10, atk: 0 }),
        enemyAt('E00', { x: 2, y: 2 }, 'melee', { atk: 5000 }),
      ],
    });
    expect(lose.outcome).toBe('lose');
  });

  it('90秒で決着しなければ時間切れ（ただし40秒からサドンデスが入る）', () => {
    expect(DEFAULT_CONFIG.maxDuration).toBe(90);
    expect(DEFAULT_CONFIG.timeout.startSeconds).toBe(40);
    // 互いにダメージを与えられない2体 → サドンデスで決着する
    const r = runBattle({
      seed: 't',
      units: [
        ally({ x: 2, y: 3 }, { atk: 0, maxHp: 1000 }),
        enemyAt('E00', { x: 2, y: 2 }, 'melee', { atk: 0, maxHp: 100000 }),
      ],
    });
    expect(r.duration).toBeGreaterThan(40);
    expect(r.log.events.some((e) => e.type === 'timeoutTick')).toBe(true);
  });

  it('マナが最大になるとアクティブスキルを使う', () => {
    const lo: Loadout = {
      frontline: [
        { charId: 'GRE_A', star: 1, equipment: [], pos: { x: 2, y: 3 } },
        { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 1, y: 3 } },
        { charId: 'EGY_A', star: 1, equipment: [], pos: { x: 2, y: 5 } },
      ],
      support: [],
      blessings: [],
    };
    const r = runBattle(buildBattleSetup(lo, getEncounter('E2'), { seed: 'skill' }));
    const skills = r.log.events.filter(
      (e) => e.type === 'skill' && e.actor?.startsWith('A'),
    );
    expect(skills.length).toBeGreaterThan(0);
    // マナが貯まるまでは撃たない
    expect(skills[0]!.t).toBeGreaterThan(0);
    // 攻撃で +10、被弾で +5
    expect(DEFAULT_CONFIG.manaOnAttack).toBe(10);
    expect(DEFAULT_CONFIG.manaOnHit).toBe(5);
  });

  it('占有マスには入れない（重ならない）', () => {
    const lo: Loadout = {
      frontline: [
        { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 2, y: 5 } },
        { charId: 'JPN_A', star: 1, equipment: [], pos: { x: 1, y: 5 } },
        { charId: 'GRE_A', star: 1, equipment: [], pos: { x: 3, y: 5 } },
      ],
      support: [],
      blessings: [],
    };
    const b = new Battle(buildBattleSetup(lo, getEncounter('E2'), { seed: 'occ' }));
    b.start();
    for (let i = 0; i < 300 && !b.finished; i++) {
      b.step();
      const live = b.units.filter((u) => u.alive && u.onField);
      const keys = live.map((u) => `${u.pos.x},${u.pos.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('決定論', () => {
  it('同じ入力なら、ログまで完全に一致する', () => {
    const lo: Loadout = {
      frontline: [
        { charId: 'GRE_A', star: 2, equipment: ['eq_synergy'], pos: { x: 2, y: 3 } },
        { charId: 'GRE_B', star: 1, equipment: ['eq_power'], pos: { x: 2, y: 5 } },
        { charId: 'JPN_A', star: 3, equipment: [], pos: { x: 1, y: 3 } },
      ],
      support: [
        { charId: 'JPN_B', star: 1, equipment: ['eq_tough'] },
        { charId: 'EGY_A', star: 2, equipment: [] },
      ],
      blessings: ['bl_inferno', 'bl_thunder'],
    };
    for (const encId of ['E1', 'E2', 'E3', 'E4', 'B1']) {
      const a = runBattle(buildBattleSetup(lo, getEncounter(encId), { seed: 'det-1' }));
      const b = runBattle(buildBattleSetup(lo, getEncounter(encId), { seed: 'det-1' }));
      expect(a.logHash).toBe(b.logHash);
      expect(a.log.events).toEqual(b.log.events);
    }
  });

  it('シードが違えば（麻痺の判定が絡む戦闘では）結果が変わりうる', () => {
    const lo: Loadout = {
      frontline: [
        { charId: 'GRE_B', star: 1, equipment: [], pos: { x: 2, y: 5 } },
        { charId: 'JPN_B', star: 1, equipment: [], pos: { x: 2, y: 4 } },
        { charId: 'GRE_A', star: 1, equipment: [], pos: { x: 2, y: 3 } },
      ],
      support: [],
      blessings: [],
    };
    const hashes = new Set<string>();
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      hashes.add(runBattle(buildBattleSetup(lo, getEncounter('B1'), { seed })).logHash);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('ログのハッシュは内容が変われば変わる', () => {
    const a = runBattle({
      seed: 't',
      units: [ally({ x: 2, y: 3 }, { range: 5 }), enemyAt('E00', { x: 2, y: 2 }, 'melee')],
    });
    expect(hashLog(a.log)).toBe(a.logHash);
    expect(hashLog([])).not.toBe(a.logHash);
    expect(hashLog([...a.log.events.slice(0, -1)])).not.toBe(a.logHash);
  });
});

describe('乱数', () => {
  it('同じシードなら同じ系列', () => {
    const a = new Rng('abc');
    const b = new Rng('abc');
    for (let i = 0; i < 100; i++) expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('系列（戦闘・ショップ・イベント）は独立している', () => {
    const s = new RngSet('seed');
    const battle = Array.from({ length: 10 }, () => s.battle.nextFloat());
    const shop = Array.from({ length: 10 }, () => s.shop.nextFloat());
    const event = Array.from({ length: 10 }, () => s.event.nextFloat());
    expect(battle).not.toEqual(shop);
    expect(shop).not.toEqual(event);

    // 戦闘系列を進めても、ショップ系列は影響を受けない
    const s2 = new RngSet('seed');
    for (let i = 0; i < 100; i++) s2.battle.nextFloat();
    const shop2 = Array.from({ length: 10 }, () => s2.shop.nextFloat());
    expect(shop2).toEqual(shop);
  });

  it('[0,1) の範囲に収まる', () => {
    const r = new Rng('range');
    for (let i = 0; i < 10000; i++) {
      const v = r.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('戦闘開始時のリセット', () => {
  it('同じ設定で2回続けて実行すると、初期状態がぴったり一致する', () => {
    const lo: Loadout = {
      frontline: [
        { charId: 'GRE_A', star: 2, equipment: ['eq_power'], pos: { x: 2, y: 3 } },
        { charId: 'NOR_A', star: 1, equipment: [], pos: { x: 1, y: 3 } },
      ],
      support: [{ charId: 'EGY_A', star: 1, equipment: [] }],
      blessings: ['bl_inferno'],
    };
    const snapshot = (): string => {
      const b = new Battle(buildBattleSetup(lo, getEncounter('B1'), { seed: 'reset' }));
      b.start();
      return b.units
        .map(
          (u) =>
            `${u.id}:${u.hp}/${u.base.maxHp} mp=${u.mana} sh=${u.shield} at=${u.attackTimer} ` +
            `pos=${u.pos.x},${u.pos.y} burn=${u.debuffs.burn.stacks} fr=${u.debuffs.frostbite.stacks} ` +
            `po=${u.debuffs.poison.remaining} pa=${u.debuffs.paralysis.stacks} ` +
            `mods=${u.timedMods.length}/${u.auraMods.length} red=${u.reductions.length} taunt=${u.tauntRemaining}`,
        )
        .join('|');
    };
    expect(snapshot()).toBe(snapshot());
  });

  it('同じ Battle を撃ち直しても、敵のHPは満タンから始まる', () => {
    const lo: Loadout = {
      frontline: [{ charId: 'GRE_A', star: 1, equipment: [], pos: { x: 2, y: 3 } }],
      support: [],
      blessings: [],
    };
    const b = new Battle(buildBattleSetup(lo, getEncounter('B1'), { seed: 'retry' }));
    const first = b.run();
    const afterFirst = b.units.map((u) => u.hp);
    // 1回目で敵はHPが減っている（or 倒れている）
    expect(afterFirst.some((hp) => hp === 0)).toBe(true);

    // 撃ち直すと、いったん全員が定義どおりの初期値に戻る
    b.resetAll();
    for (const u of b.units) {
      expect(u.hp, u.id).toBe(u.base.maxHp);
      expect(u.alive, u.id).toBe(true);
      expect(u.mana, u.id).toBe(0);
      expect(u.shield, u.id).toBe(0);
      expect(u.attackTimer, u.id).toBe(0);
      expect(u.debuffs.burn.stacks, u.id).toBe(0);
      expect(u.debuffs.frostbite.stacks, u.id).toBe(0);
      expect(u.debuffs.poison.remaining, u.id).toBe(0);
      expect(u.debuffs.paralysis.stacks, u.id).toBe(0);
      expect(u.timedMods.length, u.id).toBe(0);
      expect(u.effects.every((re) => re.uses === 0 && !re.fired), u.id).toBe(true);
    }

    // start() をやり直すと、まっさらな Battle と同じ状態から始まる
    b.finished = false;
    b.tickCount = 0;
    b.t = 0;
    b.start();
    const fresh = new Battle(buildBattleSetup(lo, getEncounter('B1'), { seed: 'retry' }));
    fresh.start();
    const dump = (x: Battle): string =>
      x.units.map((u) => `${u.id}:${u.hp}/${u.mana}/${u.alive}`).join('|');
    expect(dump(b)).toBe(dump(fresh));
    expect(first.outcome).toBeTruthy();
  });

  it('章ボスに負けて再挑戦しても、敵のHPは前回を引き継がない', () => {
    const lo: Loadout = {
      frontline: [{ charId: 'JPN_B', star: 1, equipment: [], pos: { x: 2, y: 5 } }],
      support: [],
      blessings: [],
    };
    const enemyHpAtStart = (): number[] => {
      const b = new Battle(buildBattleSetup(lo, getEncounter('B1'), { seed: 'boss-retry' }));
      b.start();
      return b.units.filter((u) => u.side === 'enemy').map((u) => u.hp);
    };
    const a = enemyHpAtStart();
    // 1回まるごと戦ってから、もう一度作り直す
    runBattle(buildBattleSetup(lo, getEncounter('B1'), { seed: 'boss-retry' }));
    const c = enemyHpAtStart();
    expect(c).toEqual(a);
    expect(a.every((hp) => hp > 0)).toBe(true);
  });
});
