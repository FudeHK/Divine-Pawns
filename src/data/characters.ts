/**
 * テスト用キャラ（8体・4神話×2体）。名前はすべて仮。
 */

import { makeBase } from '../engine/stats';
import type { CharacterDef } from '../engine/types';
import { perAdjacentAlly } from './effectHelpers';
import { validateAll, zCharacterDef } from './schema';

const raw: CharacterDef[] = [
  // ---------------------------------------------------------------- ギリシャ
  {
    id: 'GRE_A',
    name: '青銅の守り手（仮）',
    myth: 'greek',
    role: 'tank',
    element: 'ice',
    tier: 3,
    base: makeBase('tank', 3),
    active: {
      id: 'GRE_A_active',
      name: '凍てつく咆哮',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'frostbite', stacks: 5 },
        { kind: 'taunt', duration: 4 },
      ],
    },
    passives: [
      {
        id: 'GRE_A_p1',
        name: '最前線の構え',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inFrontRow' }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'def', mode: 'pct', value: 0.2 }],
      },
    ],
    support: [
      {
        id: 'GRE_A_s1',
        name: '開幕の護り',
        trigger: { kind: 'battleStart' },
        effects: [
          {
            kind: 'shield',
            target: 'frontlineAllies',
            amount: { stat: 'maxHp', coef: 0.1, ref: 'self' },
          },
        ],
      },
    ],
  },
  {
    id: 'GRE_B',
    name: '遠雷の射手（仮）',
    myth: 'greek',
    role: 'ranged',
    element: 'lightning',
    tier: 2,
    base: makeBase('ranged', 2, { range: 4 }),
    active: {
      id: 'GRE_B_active',
      name: '貫雷の矢',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.6 } },
        { kind: 'applyDebuff', target: 'current', debuff: 'paralysis', stacks: 6 },
      ],
    },
    passives: [
      {
        id: 'GRE_B_p1',
        name: '後衛の狙撃',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inBackRow' }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.3 }],
      },
    ],
    support: [
      {
        id: 'GRE_B_s1',
        name: '進軍の号令',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'statMod', target: 'frontlineAllies', stat: 'atkSpeed', mode: 'pct', value: 0.08 },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 北欧
  {
    id: 'NOR_A',
    name: '灼炎の戦士（仮）',
    myth: 'norse',
    role: 'melee',
    element: 'fire',
    tier: 3,
    base: makeBase('melee', 3),
    active: {
      id: 'NOR_A_active',
      name: '燃え盛る一撃',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.4 } },
        { kind: 'applyDebuff', target: 'current', debuff: 'burn', stacks: 6 },
      ],
    },
    passives: perAdjacentAlly('NOR_A_p1', '共闘の熱', 'atk', 0.05),
    support: [
      {
        id: 'NOR_A_s1',
        name: '炎の加勢',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'globalMod', key: 'burnCoefPct', mode: 'add', value: 0.2, element: 'fire' },
        ],
      },
    ],
  },
  {
    id: 'NOR_B',
    name: '霜の語り部（仮）',
    myth: 'norse',
    role: 'support',
    element: 'ice',
    tier: 1,
    base: makeBase('support', 1),
    active: {
      id: 'NOR_B_active',
      name: '凍える息吹',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 3 },
      ],
    },
    passives: [
      {
        id: 'NOR_B_p1',
        name: '痛みの糧',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'mana', target: 'self', value: 5 }],
      },
    ],
    support: [
      {
        id: 'NOR_B_s1',
        name: '遠吠えの霜',
        trigger: { kind: 'everyN', seconds: 15 },
        effects: [
          { kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 4 },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 日本
  {
    id: 'JPN_A',
    name: '毒沼の鬼（仮）',
    myth: 'japanese',
    role: 'melee',
    element: 'wood',
    tier: 2,
    base: makeBase('melee', 2),
    active: {
      id: 'JPN_A_active',
      name: '瘴気の薙ぎ払い',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'poison', stacks: 2 },
        { kind: 'damage', target: 'enemiesInRadius', radius: 1, amount: { stat: 'atk', coef: 1.1 } },
      ],
    },
    passives: [
      {
        id: 'JPN_A_p1',
        name: '手負いの猛り',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'selfHpBelow', pct: 50 }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atkSpeed', mode: 'pct', value: 0.3 }],
      },
    ],
    support: [
      {
        id: 'JPN_A_s1',
        name: '根深き毒',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'poisonDurationAdd', mode: 'add', value: 1 }],
      },
    ],
  },
  {
    id: 'JPN_B',
    name: '鳴神の巫女（仮）',
    myth: 'japanese',
    role: 'healer',
    element: 'lightning',
    tier: 2,
    base: makeBase('healer', 2),
    active: {
      id: 'JPN_B_active',
      name: '癒しの祝詞',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'heal', target: 'lowestHpAlly', amount: { stat: 'atk', coef: 2 } },
      ],
    },
    passives: [
      {
        id: 'JPN_B_p1',
        name: '痺れの一矢（仮）',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'paralysis', stacks: 1 }],
      },
    ],
    support: [
      {
        id: 'JPN_B_s1',
        name: '遅れて届く祈り',
        trigger: { kind: 'atTime', seconds: 15 },
        effects: [
          { kind: 'heal', target: 'frontlineAllies', amount: { stat: 'atk', coef: 1.5, ref: 'self' } },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- エジプト
  {
    id: 'EGY_A',
    name: '陽炎の術師（仮）',
    myth: 'egyptian',
    role: 'mage',
    element: 'fire',
    tier: 3,
    base: makeBase('mage', 3),
    active: {
      id: 'EGY_A_active',
      name: '灼熱の爆炎',
      trigger: { kind: 'onSkill' },
      effects: [
        {
          kind: 'damage',
          target: 'enemiesAroundTarget',
          radius: 1,
          amount: { stat: 'atk', coef: 1.8 },
        },
        {
          kind: 'applyDebuff',
          target: 'enemiesAroundTarget',
          radius: 1,
          debuff: 'burn',
          stacks: 3,
        },
      ],
    },
    passives: [
      {
        id: 'EGY_A_p1',
        name: '後衛の集中',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inBackRow' }],
        effects: [{ kind: 'skillPower', value: 0.2 }],
      },
    ],
    support: [
      {
        id: 'EGY_A_s1',
        name: '灰の残り火',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'burnDamagePct', mode: 'add', value: 0.1 }],
      },
    ],
  },
  {
    id: 'EGY_B',
    name: '砂蛇の番人（仮）',
    myth: 'egyptian',
    role: 'tank',
    element: 'wood',
    tier: 1,
    base: makeBase('tank', 1),
    active: {
      id: 'EGY_B_active',
      name: '砂塵の盾',
      trigger: { kind: 'onSkill' },
      effects: [
        { kind: 'shield', target: 'self', amount: { stat: 'maxHp', coef: 0.25 } },
        { kind: 'taunt', duration: 5 },
      ],
    },
    passives: [
      {
        id: 'EGY_B_p1',
        name: '返し毒',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'applyDebuff', target: 'attacker', debuff: 'poison', stacks: 1 }],
      },
    ],
    support: [
      {
        id: 'EGY_B_s1',
        name: '守護の砂嵐',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'allyHpBelow', pct: 50 }],
        maxUses: 1,
        effects: [
          { kind: 'damageReduction', target: 'frontlineAllies', pct: 0.3, duration: 5 },
        ],
      },
    ],
  },
];

export const CHARACTERS: readonly CharacterDef[] = validateAll(
  zCharacterDef,
  raw,
  'CHARACTERS',
);

export const CHARACTER_BY_ID: ReadonlyMap<string, CharacterDef> = new Map(
  CHARACTERS.map((c) => [c.id, c]),
);

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTER_BY_ID.get(id);
  if (!c) throw new Error(`未知のキャラID: ${id}`);
  return c;
}
