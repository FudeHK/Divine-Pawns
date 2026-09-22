/**
 * 装備。
 * tier はレア度（★1〜★3相当）、element を持つものはその属性の味方向けの特化装備。
 * 効果は「きっかけ・条件・効果」の共通スキーマで書く。
 */

import type { EquipmentDef } from '../engine/types';
import { perAdjacentAlly } from './effectHelpers';
import { validateAll, zEquipmentDef } from './schema';

const raw: EquipmentDef[] = [
  // ------------------------------------------------ ★1：素直な底上げ
  {
    id: 'eq_power',
    name: '力の腕輪（仮）',
    desc: '攻撃力 +25',
    tier: 1,
    flat: { atk: 25 },
  },
  {
    id: 'eq_tough',
    name: '堅牢の胸当て（仮）',
    desc: 'HP +350',
    tier: 1,
    flat: { maxHp: 350 },
  },
  {
    id: 'eq_guard',
    name: '鉄片の当て布（仮）',
    desc: '防御 +14',
    tier: 1,
    flat: { def: 14 },
  },
  {
    id: 'eq_swift',
    name: '軽駆けの靴（仮）',
    desc: '攻撃速度 +10%・移動速度 +15%',
    tier: 1,
    pct: { atkSpeed: 0.1, moveSpeed: 0.15 },
  },
  {
    id: 'eq_focus',
    name: '集いの護符（仮）',
    desc: '最大マナ −20（スキルが早く回る）',
    tier: 1,
    flat: { maxMana: -20 },
  },
  {
    id: 'eq_spark',
    name: '火打ちの小石（仮）',
    desc: '攻撃するたびにマナ +3',
    tier: 1,
    effects: [
      {
        id: 'eq_spark_e',
        name: '火打ちの小石',
        summary: '攻撃するたびにマナが増える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'mana', target: 'self', value: 3 }],
      },
    ],
  },

  // ------------------------------------------------ ★2：条件つき・組み合わせ
  {
    id: 'eq_synergy',
    name: '連携の紋章（仮）',
    desc: '隣接する味方1体につき攻撃速度 +5%',
    tier: 2,
    effects: perAdjacentAlly(
      'eq_synergy_e',
      '連携の紋章',
      '隣にいる味方の数だけ攻撃速度が上がる',
      'atkSpeed',
      0.05,
    ),
  },
  {
    id: 'eq_vanguard',
    name: '先陣の旗（仮）',
    desc: '最前列にいる間、攻撃力 +18%',
    tier: 2,
    effects: [
      {
        id: 'eq_vanguard_e',
        name: '先陣の旗',
        summary: '最前列にいる間、攻撃力が上がる',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inFrontRow' }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.18 }],
      },
    ],
  },
  {
    id: 'eq_longsight',
    name: '遠見の眼鏡（仮）',
    desc: '最後列にいる間、攻撃速度 +20%',
    tier: 2,
    effects: [
      {
        id: 'eq_longsight_e',
        name: '遠見の眼鏡',
        summary: '最後列にいる間、攻撃速度が上がる',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inBackRow' }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atkSpeed', mode: 'pct', value: 0.2 }],
      },
    ],
  },
  {
    id: 'eq_bulwark',
    name: '重ね盾（仮）',
    desc: '開幕、自分に最大HPの12%のシールド',
    tier: 2,
    effects: [
      {
        id: 'eq_bulwark_e',
        name: '重ね盾',
        summary: '開幕に自分へシールドを張る',
        trigger: { kind: 'battleStart' },
        effects: [
          { kind: 'shield', target: 'self', amount: { stat: 'maxHp', coef: 0.12, ref: 'self' } },
        ],
      },
    ],
  },
  {
    id: 'eq_lastwill',
    name: '窮鼠の牙（仮）',
    desc: 'HPが40%を下回ると攻撃力 +30%',
    tier: 2,
    effects: [
      {
        id: 'eq_lastwill_e',
        name: '窮鼠の牙',
        summary: 'HPが減ると攻撃力が上がる',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'selfHpBelow', pct: 40 }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.3 }],
      },
    ],
  },
  {
    id: 'eq_battery',
    name: '導きの数珠（仮）',
    desc: '被弾するたびにマナ +6',
    tier: 2,
    effects: [
      {
        id: 'eq_battery_e',
        name: '導きの数珠',
        summary: '被弾するたびにマナが増える',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'mana', target: 'self', value: 6 }],
      },
    ],
  },

  // ------------------------------------------------ ★3：強い
  {
    id: 'eq_greatpower',
    name: '巨人の手甲（仮）',
    desc: '攻撃力 +40・攻撃力 +12%',
    tier: 3,
    flat: { atk: 40 },
    pct: { atk: 0.12 },
  },
  {
    id: 'eq_aegis',
    name: '不動の胸甲（仮）',
    desc: 'HP +500・防御 +20%',
    tier: 3,
    flat: { maxHp: 500 },
    pct: { def: 0.2 },
  },
  {
    id: 'eq_secondwind',
    name: '巡りの香炉（仮）',
    desc: '10秒ごとに、味方全体を自分の攻撃力ぶん回復',
    tier: 3,
    effects: [
      {
        id: 'eq_secondwind_e',
        name: '巡りの香炉',
        summary: '一定間隔で味方全体を回復する',
        trigger: { kind: 'everyN', seconds: 10 },
        effects: [
          { kind: 'heal', target: 'allAllies', amount: { stat: 'atk', coef: 1.0, ref: 'self' } },
        ],
      },
    ],
  },
  {
    id: 'eq_executioner',
    name: '討ち取りの刻印（仮）',
    desc: '撃破するたびに攻撃力 +8%（重複・戦闘中ずっと）',
    tier: 3,
    effects: [
      {
        id: 'eq_executioner_e',
        name: '討ち取りの刻印',
        summary: '敵を倒すたびに攻撃力が上がる',
        trigger: { kind: 'onKill' },
        effects: [{ kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.08 }],
      },
    ],
  },

  // ------------------------------------------------ 属性特化
  {
    id: 'eq_emberfang',
    name: '燠火の牙（仮）',
    desc: '炎：攻撃するたびに燃焼を1付与',
    tier: 2,
    element: 'fire',
    effects: [
      {
        id: 'eq_emberfang_e',
        name: '燠火の牙',
        summary: '攻撃するたびに燃焼を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'burn', stacks: 1 }],
      },
    ],
  },
  {
    id: 'eq_frostedge',
    name: '霜刃の飾り（仮）',
    desc: '氷：攻撃するたびに凍傷を1付与',
    tier: 2,
    element: 'ice',
    effects: [
      {
        id: 'eq_frostedge_e',
        name: '霜刃の飾り',
        summary: '攻撃するたびに凍傷を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'frostbite', stacks: 1 }],
      },
    ],
  },
  {
    id: 'eq_thornband',
    name: '棘蔦の帯（仮）',
    desc: '木：被弾すると攻撃者に猛毒を1付与',
    tier: 2,
    element: 'wood',
    effects: [
      {
        id: 'eq_thornband_e',
        name: '棘蔦の帯',
        summary: '被弾すると相手に猛毒を与える',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'applyDebuff', target: 'attacker', debuff: 'poison', stacks: 1 }],
      },
    ],
  },
  {
    id: 'eq_stormcoil',
    name: '雷紋の環（仮）',
    desc: '雷：スキルを撃つと対象の周囲に麻痺を2付与',
    tier: 2,
    element: 'lightning',
    effects: [
      {
        id: 'eq_stormcoil_e',
        name: '雷紋の環',
        summary: 'スキルを撃つと周りの敵に麻痺を与える',
        trigger: { kind: 'onSkill' },
        effects: [
          {
            kind: 'applyDebuff',
            target: 'enemiesAroundTarget',
            radius: 1,
            debuff: 'paralysis',
            stacks: 2,
          },
        ],
      },
    ],
  },
  {
    id: 'eq_pyreheart',
    name: '劫火の心臓（仮）',
    desc: '炎：燃焼のダメージ +25%',
    tier: 3,
    element: 'fire',
    effects: [
      {
        id: 'eq_pyreheart_e',
        name: '劫火の心臓',
        summary: '燃焼のダメージを上げる',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'burnDamagePct', mode: 'add', value: 0.25 }],
      },
    ],
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

/** レア度で絞る（ショップの品揃え用） */
export function equipmentOfTier(tier: 1 | 2 | 3): readonly EquipmentDef[] {
  return EQUIPMENT.filter((e) => e.tier === tier);
}
