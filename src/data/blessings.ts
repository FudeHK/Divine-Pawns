/**
 * 加護。チーム効果（TeamEffect）または編成時の補正（buildMods）で働く。
 * desc は一覧に出す1行の説明、summary は［説明］で開く短い文（倍率は書かない）。
 */

import type { BlessingDef, Element, GlobalModKey } from '../engine/types';
import { validateAll, zBlessingDef } from './schema';

/** 「○属性の前衛の攻撃力 +X%」型の加護を作る */
function elementAtk(
  id: string,
  name: string,
  element: Element,
  value: number,
  rarity: 'common' | 'rare' | 'epic',
  elementLabel: string,
): BlessingDef {
  return {
    id,
    name,
    desc: `${elementLabel}属性の味方の攻撃力 +${Math.round(value * 100)}%`,
    summary: `${elementLabel}属性の味方を強くする`,
    rarity,
    buildMods: [{ filter: { element }, stat: 'atk', mode: 'pct', value }],
  };
}

/** 属性デバフの効き目を強める加護 */
function debuffBoost(
  id: string,
  name: string,
  desc: string,
  summary: string,
  key: GlobalModKey,
  mode: 'add' | 'mul',
  value: number,
  rarity: 'common' | 'rare' | 'epic',
): BlessingDef {
  return {
    id,
    name,
    desc,
    summary,
    rarity,
    effects: [
      {
        id: `${id}_e`,
        name,
        summary,
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key, mode, value }],
      },
    ],
  };
}

const raw: BlessingDef[] = [
  // ------------------------------------------------ 属性ごと（攻撃力）
  elementAtk('bl_thunder', '雷の加護', 'lightning', 0.1, 'common', '雷'),
  elementAtk('bl_ember', '焔の加護', 'fire', 0.1, 'common', '炎'),
  elementAtk('bl_frost', '氷雪の加護', 'ice', 0.1, 'common', '氷'),
  elementAtk('bl_verdure', '若芽の加護', 'wood', 0.1, 'common', '木'),

  // ------------------------------------------------ 属性ごと（デバフ強化）
  debuffBoost(
    'bl_inferno',
    '業火の加護',
    '燃焼係数 ×2',
    '燃焼の威力を大きく引き上げる',
    'burnCoefMul',
    'mul',
    2,
    'epic',
  ),
  debuffBoost(
    'bl_deeproot',
    '深根の加護',
    '猛毒の効果時間 +2秒',
    '猛毒が長く続くようになる',
    'poisonDurationAdd',
    'add',
    2,
    'rare',
  ),

  // ------------------------------------------------ 属性を問わない
  {
    // 戦闘中ずっと効く、割合のチーム効果
    id: 'bl_storm',
    name: '嵐の加護',
    desc: '戦闘中、雷属性の前衛の攻撃力 +15%',
    summary: '戦闘の間、雷属性の前衛を強くする',
    rarity: 'rare',
    effects: [
      {
        id: 'bl_storm_e',
        name: '嵐の加護',
        summary: '戦闘の間、雷属性の前衛を強くする',
        trigger: { kind: 'always' },
        effects: [
          {
            kind: 'statMod',
            target: 'frontlineAllies',
            filter: { element: 'lightning' },
            stat: 'atk',
            mode: 'pct',
            value: 0.15,
          },
        ],
      },
    ],
  },
  {
    id: 'bl_variety',
    name: '多彩な加護',
    desc: '属性がすべて異なる時、全体のHP +15%',
    summary: '属性がばらけた編成のHPを上げる',
    rarity: 'rare',
    buildMods: [{ require: 'allDistinctElements', stat: 'maxHp', mode: 'pct', value: 0.15 }],
  },
  {
    id: 'bl_bulwark',
    name: '盾衛の加護',
    desc: '前衛全体の防御 +20%',
    summary: '前衛の守りを固くする',
    rarity: 'common',
    effects: [
      {
        id: 'bl_bulwark_e',
        name: '盾衛の加護',
        summary: '前衛の守りを固くする',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'statMod', target: 'frontlineAllies', stat: 'def', mode: 'pct', value: 0.2 },
        ],
      },
    ],
  },
  {
    id: 'bl_haste',
    name: '疾走の加護',
    desc: '前衛全体の攻撃速度 +10%',
    summary: '前衛の手数を増やす',
    rarity: 'rare',
    effects: [
      {
        id: 'bl_haste_e',
        name: '疾走の加護',
        summary: '前衛の手数を増やす',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'statMod', target: 'frontlineAllies', stat: 'atkSpeed', mode: 'pct', value: 0.1 },
        ],
      },
    ],
  },
  {
    id: 'bl_vigor',
    name: '生命の加護',
    desc: '編成全体のHP +12%',
    summary: '仲間全員の体力を底上げする',
    rarity: 'epic',
    buildMods: [{ stat: 'maxHp', mode: 'pct', value: 0.12 }],
  },
];

export const BLESSINGS: readonly BlessingDef[] = validateAll(
  zBlessingDef,
  raw,
  'BLESSINGS',
);

export const BLESSING_BY_ID: ReadonlyMap<string, BlessingDef> = new Map(
  BLESSINGS.map((b) => [b.id, b]),
);

export function getBlessing(id: string): BlessingDef {
  const b = BLESSING_BY_ID.get(id);
  if (!b) throw new Error(`未知の加護ID: ${id}`);
  return b;
}
