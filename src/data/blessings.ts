/**
 * 検証用の加護3種。
 */

import type { BlessingDef } from '../engine/types';
import { validateAll, zBlessingDef } from './schema';

const raw: BlessingDef[] = [
  {
    id: 'bl_thunder',
    name: '雷の加護',
    desc: '雷属性の味方の攻撃力 +10%',
    buildMods: [
      { filter: { element: 'lightning' }, stat: 'atk', mode: 'pct', value: 0.1 },
    ],
  },
  {
    id: 'bl_inferno',
    name: '業火の加護',
    desc: '燃焼係数 ×2',
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
    desc: '前衛とサポートの属性がすべて異なる時、全体のHP +15%',
    buildMods: [
      { require: 'allDistinctElements', stat: 'maxHp', mode: 'pct', value: 0.15 },
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
