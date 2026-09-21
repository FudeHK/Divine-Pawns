/**
 * 盤面アイコンの短い名前（shortName）と、効果の短い説明文（summary）の検証。
 */

import { describe, expect, it } from 'vitest';

import { BLESSINGS } from '../src/data/blessings';
import { CHARACTERS } from '../src/data/characters';
import { ENEMIES } from '../src/data/enemies';
import { EQUIPMENT } from '../src/data/equipment';
import { SHORT_NAME_MAX, deriveShortName } from '../src/data/naming';
import { ENCOUNTERS } from '../src/data/encounters';
import type { EffectDef } from '../src/engine/types';

describe('shortName の決め方', () => {
  it('「（仮）」を除き、最初の「の」までを取る', () => {
    expect(deriveShortName('青銅の守り手（仮）')).toBe('青銅の');
    expect(deriveShortName('霜の語り部（仮）')).toBe('霜の');
    expect(deriveShortName('灰塵の巨像（仮）')).toBe('灰塵の');
    expect(deriveShortName('計測用の的（仮）')).toBe('計測用の');
  });

  it('「の」がなければ先頭3文字', () => {
    expect(deriveShortName('朽ちた兵士（仮）')).toBe('朽ちた');
    expect(deriveShortName('影渡り（仮）')).toBe('影渡り');
    expect(deriveShortName('帯電獣（仮）')).toBe('帯電獣');
    expect(deriveShortName('毒蔦使い（仮）')).toBe('毒蔦使');
  });

  it('どんな名前でも最大4文字に収まる', () => {
    expect(deriveShortName('あいうえおのかきくけこ').length).toBeLessThanOrEqual(SHORT_NAME_MAX);
    expect(deriveShortName('ながいながいなまえ').length).toBeLessThanOrEqual(SHORT_NAME_MAX);
  });
});

describe('shortName', () => {
  it('全キャラに存在し、4文字以内で、決め方どおり', () => {
    for (const c of CHARACTERS) {
      expect(c.shortName, c.id).toBeTruthy();
      expect(c.shortName.length, c.id).toBeGreaterThan(0);
      expect(c.shortName.length, c.id).toBeLessThanOrEqual(SHORT_NAME_MAX);
      expect(c.shortName, c.id).toBe(deriveShortName(c.name));
    }
  });

  it('全敵に存在し、4文字以内で、決め方どおり', () => {
    for (const e of ENEMIES) {
      expect(e.shortName, e.id).toBeTruthy();
      expect(e.shortName.length, e.id).toBeGreaterThan(0);
      expect(e.shortName.length, e.id).toBeLessThanOrEqual(SHORT_NAME_MAX);
      expect(e.shortName, e.id).toBe(deriveShortName(e.name));
    }
  });

  it('味方8体の shortName は互いに重ならない', () => {
    const names = CHARACTERS.map((c) => c.shortName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('summary', () => {
  const allCharEffects = (): EffectDef[] =>
    CHARACTERS.flatMap((c) => [c.active, ...c.passives, ...c.support]);
  const allEnemyEffects = (): EffectDef[] =>
    ENEMIES.flatMap((e) => [...(e.active ? [e.active] : []), ...(e.passives ?? [])]);

  it('全キャラのアクティブ・パッシブ・サポート効果に説明文がある', () => {
    for (const c of CHARACTERS) {
      expect(c.active.summary, `${c.id} active`).toBeTruthy();
      expect(c.passives.length, `${c.id} passives`).toBeGreaterThan(0);
      expect(c.support.length, `${c.id} support`).toBeGreaterThan(0);
      for (const d of [...c.passives, ...c.support]) {
        expect(d.summary, `${c.id} ${d.id}`).toBeTruthy();
      }
    }
  });

  it('全敵の効果に説明文がある', () => {
    for (const d of allEnemyEffects()) {
      expect(d.summary, d.id).toBeTruthy();
    }
  });

  it('装備・加護の効果にも説明文がある', () => {
    for (const eq of EQUIPMENT) {
      for (const d of eq.effects ?? []) expect(d.summary, d.id).toBeTruthy();
    }
    for (const b of BLESSINGS) {
      for (const d of b.effects ?? []) expect(d.summary, d.id).toBeTruthy();
    }
  });

  it('説明文は簡潔（1行20字程度・上限は少し余裕を見て30字）で、倍率や係数を書かない', () => {
    for (const d of [...allCharEffects(), ...allEnemyEffects()]) {
      expect(d.summary.length, `${d.id}: ${d.summary}`).toBeLessThanOrEqual(30);
      expect(d.summary, `${d.id}: ${d.summary}`).not.toMatch(/[0-9０-９]|％|%|×/);
    }
  });
});

describe('盤面での重複表示', () => {
  it('同じ種類の敵が複数いる遭遇がある（通し番号の対象）', () => {
    const hasDup = ENCOUNTERS.some((enc) => {
      const counts = new Map<string, number>();
      for (const u of enc.units) counts.set(u.enemyId, (counts.get(u.enemyId) ?? 0) + 1);
      return [...counts.values()].some((n) => n > 1);
    });
    expect(hasDup).toBe(true);
  });

  it('通し番号の付け方（同じ種類が2体以上なら 1・2…、1体だけなら付けない）', () => {
    const indexes = (enemyIds: string[]): (number | null)[] => {
      const counts = new Map<string, number>();
      for (const id of enemyIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      const seen = new Map<string, number>();
      return enemyIds.map((id) => {
        if ((counts.get(id) ?? 0) <= 1) return null;
        const n = (seen.get(id) ?? 0) + 1;
        seen.set(id, n);
        return n;
      });
    };
    expect(indexes(['a', 'b', 'a', 'c'])).toEqual([1, null, 2, null]);
    expect(indexes(['a'])).toEqual([null]);
    expect(indexes(['a', 'a', 'a'])).toEqual([1, 2, 3]);
  });
});
