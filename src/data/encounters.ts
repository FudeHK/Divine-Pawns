/**
 * 遭遇（E0・E1〜E4・B1）。
 * scale は遭遇ごとの難易度調整用のステータス倍率（HP・攻撃力に乗る）。
 * 暫定。敵の種類が増えたら、敵ごとの基本値で調整して scale は 1.0 に寄せる。
 */

import type { EncounterDef } from '../engine/types';
import { validateAll, zEncounterDef } from './schema';

const raw: EncounterDef[] = [
  {
    id: 'E0',
    name: '1章 最初の戦闘',
    units: [{ enemyId: 'en_wisp', pos: { x: 2, y: 2 } }],
  },
  {
    // 1章の1戦目。開幕は所持キャラ1体なので、誰ひとりでも必ず勝てる強さにする
    id: 'E1',
    name: '通常戦 1（1章の足慣らし）',
    units: [
      { enemyId: 'en_wisp', pos: { x: 1, y: 2 }, scale: 1.2 },
      { enemyId: 'en_soldier', pos: { x: 3, y: 2 }, scale: 0.28 },
    ],
  },
  {
    id: 'E2',
    name: '通常戦 2（前衛2体＋射手）',
    units: [
      { enemyId: 'en_soldier', pos: { x: 2, y: 2 }, scale: 1.12 },
      { enemyId: 'en_soldier', pos: { x: 0, y: 2 }, scale: 1.12 },
      { enemyId: 'en_archer', pos: { x: 2, y: 0 }, scale: 1.12 },
    ],
  },
  {
    id: 'E3',
    name: '通常戦 3（暗殺型入り）',
    units: [
      { enemyId: 'en_soldier', pos: { x: 1, y: 2 }, scale: 1.02 },
      { enemyId: 'en_stalker', pos: { x: 3, y: 2 }, scale: 1.02 },
      { enemyId: 'en_stalker', pos: { x: 2, y: 1 }, scale: 0.92 },
      { enemyId: 'en_archer', pos: { x: 1, y: 0 }, scale: 0.92 },
    ],
  },
  {
    id: 'E4',
    name: '通常戦 4（デバフ持ち入り）',
    units: [
      { enemyId: 'en_bulwark', pos: { x: 2, y: 2 }, scale: 0.86 },
      { enemyId: 'en_venomancer', pos: { x: 1, y: 1 }, scale: 0.9 },
      { enemyId: 'en_shaman', pos: { x: 2, y: 1 }, scale: 0.9 },
      { enemyId: 'en_sparker', pos: { x: 2, y: 0 }, scale: 0.9 },
    ],
  },
  // --- 章ごとの通常戦。章が進むほど「顔ぶれ」も変わる（数値は chapterScale で別に伸ばす） ---
  {
    // 1章2戦目。前衛2＋射手の基本形
    id: 'C1B',
    name: '1章 通常戦（兵士2＋射手）',
    units: [
      { enemyId: 'en_soldier', pos: { x: 2, y: 2 }, scale: 1.12 },
      { enemyId: 'en_soldier', pos: { x: 0, y: 2 }, scale: 1.12 },
      { enemyId: 'en_archer', pos: { x: 2, y: 0 }, scale: 1.12 },
    ],
  },
  {
    // 2章1戦目。攻撃的な顔ぶれ（暗殺型が後衛を狙ってくる）
    id: 'C2A',
    name: '2章 通常戦（暗殺型2＋射手）',
    units: [
      { enemyId: 'en_soldier', pos: { x: 1, y: 2 }, scale: 1.0 },
      { enemyId: 'en_stalker', pos: { x: 3, y: 2 }, scale: 1.0 },
      { enemyId: 'en_stalker', pos: { x: 2, y: 1 }, scale: 0.9 },
      { enemyId: 'en_archer', pos: { x: 1, y: 0 }, scale: 0.9 },
    ],
  },
  {
    // 2章2戦目。硬い前衛＋火力。長期戦になりやすい
    id: 'C2B',
    name: '2章 通常戦（重装＋射手2）',
    units: [
      { enemyId: 'en_bulwark', pos: { x: 2, y: 2 }, scale: 0.88 },
      { enemyId: 'en_soldier', pos: { x: 0, y: 2 }, scale: 0.95 },
      { enemyId: 'en_archer', pos: { x: 1, y: 0 }, scale: 0.9 },
      { enemyId: 'en_archer', pos: { x: 3, y: 0 }, scale: 0.9 },
    ],
  },
  {
    // 3章1戦目。属性デバフ持ちが揃う
    id: 'C3A',
    name: '3章 通常戦（デバフ隊）',
    units: [
      { enemyId: 'en_bulwark', pos: { x: 2, y: 2 }, scale: 0.86 },
      { enemyId: 'en_venomancer', pos: { x: 1, y: 1 }, scale: 0.9 },
      { enemyId: 'en_shaman', pos: { x: 2, y: 1 }, scale: 0.9 },
      { enemyId: 'en_sparker', pos: { x: 2, y: 0 }, scale: 0.9 },
    ],
  },
  {
    // 3章2戦目。デバフ＋暗殺型の混成（最終章らしい多面攻め）
    id: 'C3B',
    name: '3章 通常戦（混成部隊）',
    units: [
      { enemyId: 'en_bulwark', pos: { x: 2, y: 2 }, scale: 0.84 },
      { enemyId: 'en_stalker', pos: { x: 0, y: 2 }, scale: 0.88 },
      { enemyId: 'en_venomancer', pos: { x: 1, y: 1 }, scale: 0.86 },
      { enemyId: 'en_sparker', pos: { x: 1, y: 0 }, scale: 0.86 },
      { enemyId: 'en_shaman', pos: { x: 3, y: 0 }, scale: 0.86 },
    ],
  },
  {
    id: 'B1',
    name: 'ボス戦（取り巻き付き）',
    units: [
      { enemyId: 'boss_colossus', pos: { x: 2, y: 2 }, scale: 0.9 },
      { enemyId: 'en_soldier', pos: { x: 0, y: 2 }, scale: 0.5 },
      { enemyId: 'en_soldier', pos: { x: 4, y: 2 }, scale: 0.5 },
      { enemyId: 'en_shaman', pos: { x: 2, y: 0 }, scale: 0.5 },
    ],
  },
];

/** 秒間ダメージの計測専用（ENCOUNTERS には含めない） */
export const DPS_DUMMY_ENCOUNTER: EncounterDef = validateAll(
  zEncounterDef,
  [
    {
      id: 'DPS',
      name: '計測用の的',
      units: [{ enemyId: 'en_dummy', pos: { x: 2, y: 2 } }],
    },
  ],
  'DPS_DUMMY',
)[0]!;

export const ENCOUNTERS: readonly EncounterDef[] = validateAll(
  zEncounterDef,
  raw,
  'ENCOUNTERS',
);

export const ENCOUNTER_BY_ID: ReadonlyMap<string, EncounterDef> = new Map(
  ENCOUNTERS.map((e) => [e.id, e]),
);

export function getEncounter(id: string): EncounterDef {
  const e = ENCOUNTER_BY_ID.get(id);
  if (!e) throw new Error(`未知の遭遇ID: ${id}`);
  return e;
}

/** 配置検証などで使う通常戦＋ボスの並び */
export const PLACEMENT_ENCOUNTER_IDS = ['E1', 'E2', 'E3', 'E4', 'B1'] as const;
