/**
 * 検証用の加護4種。
 * desc は一覧に出す1行の説明、summary は［説明］で開く短い文（倍率は書かない）。
 */

import type { BlessingDef } from '../engine/types';
import { validateAll, zBlessingDef } from './schema';

const raw: BlessingDef[] = [
  {
    id: 'bl_thunder',
    name: '雷の加護',
    desc: '雷属性の味方の攻撃力 +10%',
    summary: '雷属性の味方の攻撃力を上げる',
    rarity: 'common',
    buildMods: [
      { filter: { element: 'lightning' }, stat: 'atk', mode: 'pct', value: 0.1 },
    ],
  },
  {
    id: 'bl_inferno',
    name: '業火の加護',
    desc: '燃焼係数 ×2',
    summary: '燃焼の威力を大きく引き上げる',
    rarity: 'epic',
    effects: [
      {
        id: 'bl_inferno_e',
        name: '業火の加護',
        summary: '燃焼の威力を大きく引き上げる',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'burnCoefMul', mode: 'mul', value: 2 }],
      },
    ],
  },
  {
    id: 'bl_variety',
    name: '多彩な加護',
    desc: '属性がすべて異なる時、全体のHP +15%',
    summary: '属性がばらけた編成のHPを上げる',
    rarity: 'rare',
    buildMods: [
      { require: 'allDistinctElements', stat: 'maxHp', mode: 'pct', value: 0.15 },
    ],
  },
  {
    // チーム効果として、戦闘中ずっと割合で効く加護
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
