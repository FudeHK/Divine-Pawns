/**
 * 敵8種＋ボス1体。名前はすべて仮。
 * 基本値は「通常戦の標準的な強さ」に合わせてあり、
 * 遭遇ごとの細かい強弱は EncounterDef.scale で調整する。
 */

import type { EnemyDef, Stats } from '../engine/types';
import { validateAll, zEnemyDef } from './schema';

function st(o: Partial<Stats> & { maxHp: number; atk: number }): Stats {
  return {
    def: 0,
    atkSpeed: 0.8,
    range: 1,
    maxMana: 100,
    moveSpeed: 1.6,
    ...o,
  };
}

const raw: EnemyDef[] = [
  // 1章最初の戦闘用の、とても弱い敵
  {
    id: 'en_wisp',
    name: '迷い火（仮）',
    role: 'melee',
    element: 'wood',
    base: st({ maxHp: 150, atk: 10, def: 0, atkSpeed: 0.6, range: 1, moveSpeed: 1.2 }),
    resist: 0,
  },
  // 秒間ダメージ計測用の的（攻撃してこない・とても硬い）
  {
    id: 'en_dummy',
    name: '計測用の的（仮）',
    role: 'tank',
    element: 'wood',
    base: st({ maxHp: 5_000_000, atk: 0, def: 0, atkSpeed: 0.1, range: 1, moveSpeed: 0.1 }),
    resist: 0,
  },
  // 近接
  {
    id: 'en_soldier',
    name: '朽ちた兵士（仮）',
    role: 'melee',
    element: 'fire',
    base: st({ maxHp: 1060, atk: 87, def: 18, atkSpeed: 0.85, range: 1, moveSpeed: 1.9 }),
    resist: 0.1,
    active: {
      id: 'en_soldier_active',
      name: '重ねた斬撃',
      trigger: { kind: 'onSkill' },
      effects: [{ kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 1.8 } }],
    },
  },
  // 遠隔
  {
    id: 'en_archer',
    name: '氷輪の射手（仮）',
    role: 'ranged',
    element: 'ice',
    base: st({ maxHp: 730, atk: 92, def: 10, atkSpeed: 0.75, range: 3, moveSpeed: 1.7 }),
    resist: 0.15,
    active: {
      id: 'en_archer_active',
      name: '凍える矢',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 1.4 } },
        { kind: 'applyDebuff', target: 'current', debuff: 'frostbite', stacks: 3 },
      ],
    },
  },
  // 暗殺型（最後列を狙う）
  {
    id: 'en_stalker',
    name: '影渡り（仮）',
    role: 'melee',
    element: 'lightning',
    base: st({ maxHp: 640, atk: 110, def: 8, atkSpeed: 1.0, range: 1, moveSpeed: 2.6 }),
    resist: 0.05,
    targeting: 'backline',
    active: {
      id: 'en_stalker_active',
      name: '背後の刃',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.2 } },
        { kind: 'applyDebuff', target: 'current', debuff: 'paralysis', stacks: 3 },
      ],
    },
  },
  // タンク
  {
    id: 'en_bulwark',
    name: '石塊の壁（仮）',
    role: 'tank',
    element: 'ice',
    base: st({ maxHp: 2100, atk: 60, def: 36, atkSpeed: 0.55, range: 1, moveSpeed: 1.3 }),
    resist: 0.2,
    active: {
      id: 'en_bulwark_active',
      name: '地響き',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'enemiesInRadius', radius: 1, amount: { stat: 'atk', coef: 1.2 } },
        { kind: 'taunt', duration: 4 },
      ],
    },
  },
  // デバフ持ち（凍傷）
  {
    id: 'en_shaman',
    name: '霜呼びの巫（仮）',
    role: 'support',
    element: 'ice',
    base: st({ maxHp: 760, atk: 70, def: 12, atkSpeed: 0.7, range: 3, moveSpeed: 1.6 }),
    resist: 0.15,
    active: {
      id: 'en_shaman_active',
      name: '凍土の呪い',
      trigger: { kind: 'onSkill' },
      effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 3 }],
    },
  },
  // デバフ持ち（猛毒）
  {
    id: 'en_venomancer',
    name: '毒蔦使い（仮）',
    role: 'mage',
    element: 'wood',
    base: st({ maxHp: 700, atk: 80, def: 10, atkSpeed: 0.7, range: 3, moveSpeed: 1.6 }),
    resist: 0.1,
    active: {
      id: 'en_venomancer_active',
      name: '蝕みの霧',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'applyDebuff', target: 'enemiesAroundTarget', radius: 1, debuff: 'poison', stacks: 2 },
      ],
    },
    passives: [
      {
        id: 'en_venomancer_p1',
        name: '毒牙',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'poison', stacks: 1 }],
      },
    ],
  },
  // デバフ持ち（麻痺）
  {
    id: 'en_sparker',
    name: '帯電獣（仮）',
    role: 'ranged',
    element: 'lightning',
    base: st({ maxHp: 780, atk: 85, def: 12, atkSpeed: 0.85, range: 2, moveSpeed: 1.9 }),
    resist: 0.2,
    active: {
      id: 'en_sparker_active',
      name: '放電',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'enemiesAroundTarget', radius: 1, amount: { stat: 'atk', coef: 1.2 } },
        { kind: 'applyDebuff', target: 'enemiesAroundTarget', radius: 1, debuff: 'paralysis', stacks: 4 },
      ],
    },
  },
  // ボス
  {
    id: 'boss_colossus',
    name: '灰塵の巨像（仮）',
    role: 'tank',
    element: 'fire',
    base: st({ maxHp: 3200, atk: 68, def: 45, atkSpeed: 0.55, range: 1, moveSpeed: 1.2 }),
    resist: 0.5,
    isBoss: true,
    active: {
      id: 'boss_colossus_active',
      name: '灼熱の掌',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'enemiesInRadius', radius: 1, amount: { stat: 'atk', coef: 1.6 } },
        { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'burn', stacks: 3 },
      ],
    },
    passives: [
      {
        id: 'boss_colossus_open',
        name: '開幕の強打',
        trigger: { kind: 'battleStart' },
        effects: [
          { kind: 'damage', target: 'enemyFrontRow', amount: { stat: 'atk', coef: 1.4 } },
        ],
      },
      {
        id: 'boss_colossus_sweep',
        name: '列薙ぎ',
        trigger: { kind: 'everyN', seconds: 9 },
        effects: [
          { kind: 'damage', target: 'enemyDensestRow', amount: { stat: 'atk', coef: 1.5 } },
          { kind: 'applyDebuff', target: 'enemyDensestRow', debuff: 'burn', stacks: 2 },
        ],
      },
    ],
  },
];

export const ENEMIES: readonly EnemyDef[] = validateAll(zEnemyDef, raw, 'ENEMIES');

export const ENEMY_BY_ID: ReadonlyMap<string, EnemyDef> = new Map(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMY_BY_ID.get(id);
  if (!e) throw new Error(`未知の敵ID: ${id}`);
  return e;
}
