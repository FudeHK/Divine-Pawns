/**
 * 検証用の装備3種。
 */

import type { EquipmentDef } from '../engine/types';
import { perAdjacentAlly } from './effectHelpers';
import { validateAll, zEquipmentDef } from './schema';

const raw: EquipmentDef[] = [
  {
    id: 'eq_power',
    name: '力の腕輪（仮）',
    desc: '攻撃力 +25',
    flat: { atk: 25 },
  },
  {
    id: 'eq_tough',
    name: '堅牢の胸当て（仮）',
    desc: 'HP +350',
    flat: { maxHp: 350 },
  },
  {
    id: 'eq_synergy',
    name: '連携の紋章',
    desc: '隣接する味方1体につき攻撃速度 +5%',
    effects: perAdjacentAlly('eq_synergy_e', '連携の紋章', 'atkSpeed', 0.05),
  },
];

export const EQUIPMENT: readonly EquipmentDef[] = validateAll(
  zEquipmentDef,
  raw,
  'EQUIPMENT',
);

export const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipmentDef> = new Map(
  EQUIPMENT.map((e) => [e.id, e]),
);

export function getEquipment(id: string): EquipmentDef {
  const e = EQUIPMENT_BY_ID.get(id);
  if (!e) throw new Error(`未知の装備ID: ${id}`);
  return e;
}
