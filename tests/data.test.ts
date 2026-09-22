/**
 * データ定義の zod 検証。
 */

import { describe, expect, it } from 'vitest';

import { BLESSINGS } from '../src/data/blessings';
import { CHARACTERS } from '../src/data/characters';
import { ENCOUNTERS, PLACEMENT_ENCOUNTER_IDS } from '../src/data/encounters';
import { ENEMIES } from '../src/data/enemies';
import { EQUIPMENT } from '../src/data/equipment';
import {
  validateAll,
  zBlessingDef,
  zCharacterDef,
  zEncounterDef,
  zEnemyDef,
  zEquipmentDef,
} from '../src/data/schema';
import { isCellOfSide } from '../src/engine/hex';
import { MYTHS } from '../src/engine/types';

describe('データ定義の検証', () => {
  it('キャラ8体が zod を通る', () => {
    expect(CHARACTERS).toHaveLength(8);
    expect(() => validateAll(zCharacterDef, [...CHARACTERS], 'CHARACTERS')).not.toThrow();
  });

  it('敵とボスが zod を通る', () => {
    expect(() => validateAll(zEnemyDef, [...ENEMIES], 'ENEMIES')).not.toThrow();
    // 通常敵8種＋ボス1体＋計測用の的
    expect(ENEMIES.filter((e) => e.isBoss)).toHaveLength(1);
    expect(ENEMIES.length).toBeGreaterThanOrEqual(10);
  });

  it('装備・加護・遭遇が zod を通る', () => {
    expect(() => validateAll(zEquipmentDef, [...EQUIPMENT], 'EQUIPMENT')).not.toThrow();
    expect(() => validateAll(zBlessingDef, [...BLESSINGS], 'BLESSINGS')).not.toThrow();
    expect(() => validateAll(zEncounterDef, [...ENCOUNTERS], 'ENCOUNTERS')).not.toThrow();
    expect(EQUIPMENT).toHaveLength(3);
    expect(BLESSINGS.length).toBeGreaterThanOrEqual(3);
  });

  it('壊れたデータは弾かれる', () => {
    expect(() =>
      validateAll(zCharacterDef, [{ id: 'bad', name: '' }], 'BAD'),
    ).toThrow();
    // 敵を味方側のマスに置こうとしたら弾かれる
    expect(() =>
      validateAll(
        zEncounterDef,
        [{ id: 'X', name: 'X', units: [{ enemyId: 'en_wisp', pos: { x: 2, y: 4 } }] }],
        'BAD',
      ),
    ).toThrow();
  });

  it('4神話 × 2体で、ID は一意', () => {
    const ids = new Set(CHARACTERS.map((c) => c.id));
    expect(ids.size).toBe(CHARACTERS.length);
    for (const m of MYTHS) {
      expect(CHARACTERS.filter((c) => c.myth === m)).toHaveLength(2);
    }
  });

  it('キャラはアクティブ1つ・パッシブ1つ以上・サポート効果1つ以上を持つ', () => {
    for (const c of CHARACTERS) {
      expect(c.active.trigger.kind).toBe('onSkill');
      expect(c.passives.length).toBeGreaterThan(0);
      expect(c.support.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(c.tier);
    }
  });

  it('遭遇の敵はすべて敵側のマスに置かれている', () => {
    for (const e of ENCOUNTERS) {
      for (const u of e.units) {
        expect(isCellOfSide(u.pos, 'enemy')).toBe(true);
      }
      // 同じマスに重なっていない
      const keys = e.units.map((u) => `${u.pos.x},${u.pos.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('遭遇 E0・E1〜E4・B1 がそろっている', () => {
    const ids = ENCOUNTERS.map((e) => e.id);
    expect(ids).toEqual(['E0', 'E1', 'E2', 'E3', 'E4', 'B1']);
    expect(PLACEMENT_ENCOUNTER_IDS).toEqual(['E1', 'E2', 'E3', 'E4', 'B1']);
    // E0 は弱い敵1体
    expect(ENCOUNTERS[0]!.units).toHaveLength(1);
    // E1〜E4 は 2〜4 体
    for (const id of ['E1', 'E2', 'E3', 'E4']) {
      const e = ENCOUNTERS.find((x) => x.id === id)!;
      expect(e.units.length).toBeGreaterThanOrEqual(2);
      expect(e.units.length).toBeLessThanOrEqual(4);
    }
    // B1 はボス＋取り巻き
    const b1 = ENCOUNTERS.find((e) => e.id === 'B1')!;
    expect(b1.units.some((u) => u.enemyId === 'boss_colossus')).toBe(true);
    expect(b1.units.length).toBeGreaterThan(1);
  });

  it('敵の耐性は 通常敵 0〜20%・ボス 40〜60%', () => {
    for (const e of ENEMIES) {
      if (e.isBoss) {
        expect(e.resist).toBeGreaterThanOrEqual(0.4);
        expect(e.resist).toBeLessThanOrEqual(0.6);
      } else {
        expect(e.resist).toBeGreaterThanOrEqual(0);
        expect(e.resist).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('敵には近接・遠隔・暗殺型・タンク・デバフ持ちがそろっている', () => {
    expect(ENEMIES.some((e) => e.role === 'melee')).toBe(true);
    expect(ENEMIES.some((e) => e.role === 'ranged')).toBe(true);
    expect(ENEMIES.some((e) => e.targeting === 'backline')).toBe(true);
    expect(ENEMIES.some((e) => e.role === 'tank')).toBe(true);
    const hasDebuff = (e: (typeof ENEMIES)[number]): boolean =>
      [...(e.active ? [e.active] : []), ...(e.passives ?? [])].some((d) =>
        d.effects.some((x) => x.kind === 'applyDebuff'),
      );
    expect(ENEMIES.filter(hasDebuff).length).toBeGreaterThanOrEqual(3);
  });
});
