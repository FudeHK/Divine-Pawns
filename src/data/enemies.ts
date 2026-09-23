/**
 * 敵8種＋ボス1体（＋秒間ダメージ計測用の的）。名前はすべて仮。
 * 基本値は「通常戦の標準的な強さ」に合わせてあり、
 * 遭遇ごとの細かい強弱は EncounterDef.scale で調整する。
 * shortName は naming.ts の決め方に従う。
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
    shortName: '迷い火',
    role: 'melee',
    element: 'wood',
    base: st({ maxHp: 150, atk: 10, def: 0, atkSpeed: 0.6, range: 1, moveSpeed: 1.2 }),
    resist: 0,
  },
  // 秒間ダメージ計測用の的（攻撃してこない・とても硬い）
  {
    id: 'en_dummy',
    name: '計測用の的（仮）',
    shortName: '計測用の',
    role: 'tank',
    element: 'wood',
    base: st({ maxHp: 5_000_000, atk: 0, def: 0, atkSpeed: 0.1, range: 1, moveSpeed: 0.1 }),
    resist: 0,
  },
  // 近接
  {
    id: 'en_soldier',
    name: '朽ちた兵士（仮）',
    shortName: '朽ちた',
    role: 'melee',
    element: 'fire',
    base: st({ maxHp: 1060, atk: 87, def: 18, atkSpeed: 0.85, range: 1, moveSpeed: 1.9 }),
    resist: 0.1,
    active: {
      id: 'en_soldier_active',
      name: '重ねた斬撃',
      summary: '単体に強めの一撃を与える',
      trigger: { kind: 'onSkill' },
      effects: [{ kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 1.8 } }],
    },
  },
  // 遠隔
  {
    id: 'en_archer',
    name: '氷輪の射手（仮）',
    shortName: '氷輪の',
    role: 'ranged',
    element: 'ice',
    base: st({ maxHp: 730, atk: 92, def: 10, atkSpeed: 0.75, range: 3, moveSpeed: 1.7 }),
    resist: 0.15,
    active: {
      id: 'en_archer_active',
      name: '凍える矢',
      summary: '単体にダメージと凍傷を与える',
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
    shortName: '影渡り',
    role: 'melee',
    element: 'lightning',
    base: st({ maxHp: 640, atk: 110, def: 8, atkSpeed: 1.0, range: 1, moveSpeed: 2.6 }),
    resist: 0.05,
    targeting: 'backline',
    active: {
      id: 'en_stalker_active',
      name: '背後の刃',
      summary: '単体に大ダメージと麻痺を与える',
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
    shortName: '石塊の',
    role: 'tank',
    element: 'ice',
    base: st({ maxHp: 2100, atk: 60, def: 36, atkSpeed: 0.55, range: 1, moveSpeed: 1.3 }),
    resist: 0.2,
    active: {
      id: 'en_bulwark_active',
      name: '地響き',
      summary: '周囲を殴りつけ、自分に挑発',
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
    shortName: '霜呼びの',
    role: 'support',
    element: 'ice',
    base: st({ maxHp: 760, atk: 70, def: 12, atkSpeed: 0.7, range: 3, moveSpeed: 1.6 }),
    resist: 0.15,
    active: {
      id: 'en_shaman_active',
      name: '凍土の呪い',
      summary: '敵全体に凍傷を与える',
      trigger: { kind: 'onSkill' },
      effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 3 }],
    },
  },
  // デバフ持ち（猛毒）
  {
    id: 'en_venomancer',
    name: '毒蔦使い（仮）',
    shortName: '毒蔦使',
    role: 'mage',
    element: 'wood',
    base: st({ maxHp: 700, atk: 80, def: 10, atkSpeed: 0.7, range: 3, moveSpeed: 1.6 }),
    resist: 0.1,
    active: {
      id: 'en_venomancer_active',
      name: '蝕みの霧',
      summary: '対象の周囲に猛毒を与える',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'applyDebuff', target: 'enemiesAroundTarget', radius: 1, debuff: 'poison', stacks: 2 },
      ],
    },
    passives: [
      {
        id: 'en_venomancer_p1',
        name: '毒牙',
        summary: '攻撃するたびに猛毒を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'poison', stacks: 1 }],
      },
    ],
  },
  // デバフ持ち（麻痺）
  {
    id: 'en_sparker',
    name: '帯電獣（仮）',
    shortName: '帯電獣',
    role: 'ranged',
    element: 'lightning',
    base: st({ maxHp: 780, atk: 85, def: 12, atkSpeed: 0.85, range: 2, moveSpeed: 1.9 }),
    resist: 0.2,
    active: {
      id: 'en_sparker_active',
      name: '放電',
      summary: '対象の周囲にダメージと麻痺',
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
    shortName: '灰塵の',
    role: 'tank',
    element: 'fire',
    base: st({ maxHp: 3200, atk: 68, def: 45, atkSpeed: 0.55, range: 1, moveSpeed: 1.2 }),
    resist: 0.5,
    isBoss: true,
    active: {
      id: 'boss_colossus_active',
      name: '灼熱の掌',
      summary: '周囲に大ダメージと燃焼を与える',
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
        summary: '開幕に敵の最前列へ強打する',
        trigger: { kind: 'battleStart' },
        effects: [
          { kind: 'damage', target: 'enemyFrontRow', amount: { stat: 'atk', coef: 1.4 } },
        ],
      },
      {
        id: 'boss_colossus_sweep',
        name: '列薙ぎ',
        summary: '一定間隔で列ごと薙ぎ払う',
        trigger: { kind: 'everyN', seconds: 9 },
        effects: [
          { kind: 'damage', target: 'enemyDensestRow', amount: { stat: 'atk', coef: 1.5 } },
          { kind: 'applyDebuff', target: 'enemyDensestRow', debuff: 'burn', stacks: 2 },
        ],
      },
    ],
  },
  // 2章ボス：凍てつく霧の女王（仮）。凍傷を重ねて味方の手数を奪う
  {
    id: 'boss_rime',
    name: '氷霧の女王（仮）',
    shortName: '氷霧の',
    role: 'mage',
    element: 'ice',
    base: st({ maxHp: 2600, atk: 74, def: 32, atkSpeed: 0.7, range: 3, moveSpeed: 1.2 }),
    resist: 0.5,
    isBoss: true,
    active: {
      id: 'boss_rime_active',
      name: '氷霧の帳',
      summary: '敵全体に凍傷を重ね、ダメージを与える',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'allEnemies', amount: { stat: 'atk', coef: 0.9 } },
        { kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 4 },
      ],
    },
    passives: [
      {
        id: 'boss_rime_chill',
        name: '絶えぬ吹雪',
        summary: '一定間隔で最も密集した列を凍てつかせる',
        trigger: { kind: 'everyN', seconds: 6 },
        effects: [
          { kind: 'applyDebuff', target: 'enemyDensestRow', debuff: 'frostbite', stacks: 3 },
          { kind: 'damage', target: 'enemyDensestRow', amount: { stat: 'atk', coef: 0.8 } },
        ],
      },
      {
        id: 'boss_rime_focus',
        name: '氷刃',
        summary: '攻撃した相手に凍傷を重ねる',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'frostbite', stacks: 1 }],
      },
    ],
  },
  // 3章ボス：最終章。HPが減るほど手が変わる
  {
    id: 'boss_eclipse',
    name: '蝕の王（仮）',
    shortName: '蝕の',
    role: 'melee',
    element: 'lightning',
    base: st({ maxHp: 4200, atk: 92, def: 48, atkSpeed: 0.75, range: 1, moveSpeed: 1.6 }),
    resist: 0.6,
    isBoss: true,
    active: {
      id: 'boss_eclipse_active',
      name: '雷撃の断罪',
      summary: '対象の周囲に大ダメージと麻痺を与える',
      trigger: { kind: 'onSkill' },
      effects: [
        {
          kind: 'damage',
          target: 'enemiesAroundTarget',
          radius: 1,
          amount: { stat: 'atk', coef: 1.5 },
        },
        {
          kind: 'applyDebuff',
          target: 'enemiesAroundTarget',
          radius: 1,
          debuff: 'paralysis',
          stacks: 4,
        },
      ],
    },
    passives: [
      {
        id: 'boss_eclipse_open',
        name: '蝕の宣告',
        summary: '開幕に敵の最後列を撃つ',
        trigger: { kind: 'battleStart' },
        effects: [
          { kind: 'damage', target: 'allEnemies', amount: { stat: 'atk', coef: 0.8 } },
          { kind: 'applyDebuff', target: 'allEnemies', debuff: 'paralysis', stacks: 2 },
        ],
      },
      {
        id: 'boss_eclipse_storm',
        name: '雷の檻',
        summary: '一定間隔で敵全体に雷を落とす',
        trigger: { kind: 'everyN', seconds: 8 },
        effects: [
          { kind: 'damage', target: 'allEnemies', amount: { stat: 'atk', coef: 0.9 } },
          { kind: 'applyDebuff', target: 'allEnemies', debuff: 'paralysis', stacks: 2 },
        ],
      },
      {
        id: 'boss_eclipse_rage',
        name: '第二相・暴走',
        summary: 'HPが半分を切ると攻撃力と攻撃速度が上がる',
        trigger: { kind: 'hpBelow', pct: 50 },
        effects: [
          { kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.35 },
          { kind: 'statMod', target: 'self', stat: 'atkSpeed', mode: 'pct', value: 0.3 },
        ],
      },
      {
        id: 'boss_eclipse_last',
        name: '第三相・断末',
        summary: '瀕死になると全体に強烈な雷を落とす',
        trigger: { kind: 'hpBelow', pct: 20 },
        effects: [
          { kind: 'damage', target: 'allEnemies', amount: { stat: 'atk', coef: 1.6 } },
          { kind: 'applyDebuff', target: 'allEnemies', debuff: 'paralysis', stacks: 5 },
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
