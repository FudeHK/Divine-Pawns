import { describe, expect, it } from 'vitest';

import {
  ALLY_CELLS,
  ALL_CELLS,
  ENEMY_CELLS,
  ROW_CELLS,
  backRowY,
  bfsPath,
  cellKey,
  frontRowY,
  hexDistance,
  isCellOfSide,
  isValidCell,
  neighbors,
  toCube,
} from '../src/engine/hex';

describe('盤面（六角グリッド odd-r）', () => {
  it('使えるマスは 28 マスで、形は 5・4・5 ×2', () => {
    expect(ALL_CELLS.length).toBe(28);
    expect(ROW_CELLS.map((r) => r.length)).toEqual([5, 4, 5, 5, 4, 5]);
    expect(ENEMY_CELLS.length).toBe(14);
    expect(ALLY_CELLS.length).toBe(14);
  });

  it('使えるマスの判定', () => {
    expect(isValidCell({ x: 0, y: 0 })).toBe(true);
    expect(isValidCell({ x: 4, y: 0 })).toBe(true);
    // y=1 は x=0〜3 の4マスだけ
    expect(isValidCell({ x: 3, y: 1 })).toBe(true);
    expect(isValidCell({ x: 4, y: 1 })).toBe(false);
    // y=4 は x=1〜4 の4マスだけ
    expect(isValidCell({ x: 0, y: 4 })).toBe(false);
    expect(isValidCell({ x: 1, y: 4 })).toBe(true);
    // 盤外
    expect(isValidCell({ x: 5, y: 0 })).toBe(false);
    expect(isValidCell({ x: 0, y: 6 })).toBe(false);
    expect(isValidCell({ x: -1, y: 0 })).toBe(false);
    expect(isValidCell({ x: 0.5, y: 0 })).toBe(false);
  });

  it('陣営ごとの使えるマス', () => {
    expect(isCellOfSide({ x: 2, y: 2 }, 'enemy')).toBe(true);
    expect(isCellOfSide({ x: 2, y: 2 }, 'ally')).toBe(false);
    expect(isCellOfSide({ x: 2, y: 3 }, 'ally')).toBe(true);
    expect(frontRowY('ally')).toBe(3);
    expect(backRowY('ally')).toBe(5);
    expect(frontRowY('enemy')).toBe(2);
    expect(backRowY('enemy')).toBe(0);
  });

  it('陣営ごとに左右対称（odd-r で半マスずれる）', () => {
    // 奇数行は右に半マスずれるので、行の中心を実数で見る
    const center = (y: number): number =>
      ROW_CELLS[y]!.reduce((s, x) => s + x + ((y & 1) === 1 ? 0.5 : 0), 0) /
      ROW_CELLS[y]!.length;
    expect(center(0)).toBeCloseTo(2.0, 10);
    expect(center(1)).toBeCloseTo(2.0, 10);
    expect(center(2)).toBeCloseTo(2.0, 10);
    expect(center(3)).toBeCloseTo(2.5, 10);
    expect(center(4)).toBeCloseTo(2.5, 10);
    expect(center(5)).toBeCloseTo(2.5, 10);
  });

  it('cube 座標への変換は q+r+s = 0 を満たす', () => {
    for (const c of ALL_CELLS) {
      const cb = toCube(c);
      expect(cb.q + cb.r + cb.s).toBe(0);
    }
  });

  it('六角距離', () => {
    expect(hexDistance({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(0);
    // 隣接マスはすべて距離1
    for (const n of neighbors({ x: 2, y: 3 })) {
      expect(hexDistance({ x: 2, y: 3 }, n)).toBe(1);
    }
    // 味方最後列から敵最前列
    expect(hexDistance({ x: 2, y: 5 }, { x: 2, y: 2 })).toBe(3);
    expect(hexDistance({ x: 0, y: 5 }, { x: 4, y: 0 })).toBe(6);
    // 対称性
    expect(hexDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(
      hexDistance({ x: 3, y: 4 }, { x: 0, y: 0 }),
    );
  });

  it('隣接マスは盤内の有効マスだけ（最大6）', () => {
    for (const c of ALL_CELLS) {
      const ns = neighbors(c);
      expect(ns.length).toBeGreaterThan(0);
      expect(ns.length).toBeLessThanOrEqual(6);
      for (const n of ns) expect(isValidCell(n)).toBe(true);
    }
  });

  it('BFS：まっすぐ進める時は最短経路', () => {
    const path = bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, new Set());
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
    expect(path![path!.length - 1]).toEqual({ x: 2, y: 2 });
  });

  it('BFS：stopWithin で射程ぶん手前に止まる', () => {
    const path = bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, new Set(), 1);
    expect(path!.length).toBe(2);
    expect(hexDistance(path![path!.length - 1]!, { x: 2, y: 2 })).toBe(1);

    // すでに射程内なら動かない
    expect(bfsPath({ x: 2, y: 3 }, { x: 2, y: 2 }, new Set(), 1)).toEqual([]);
  });

  it('BFS：占有マスは通れない（迂回する）', () => {
    const blocked = new Set<number>(
      [
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
      ].map(cellKey),
    );
    const path = bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, blocked);
    expect(path).not.toBeNull();
    for (const p of path!) expect(blocked.has(cellKey(p))).toBe(false);
    expect(path!.length).toBeGreaterThan(3);
  });

  it('BFS：完全に囲まれていたら到達不能', () => {
    const blocked = new Set<number>(
      neighbors({ x: 2, y: 5 }).map(cellKey),
    );
    expect(bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, blocked)).toBeNull();
  });

  it('BFS：同じ入力なら必ず同じ経路（決定論）', () => {
    const blocked = new Set<number>([cellKey({ x: 2, y: 4 })]);
    const a = bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, blocked);
    const b = bfsPath({ x: 2, y: 5 }, { x: 2, y: 2 }, blocked);
    expect(a).toEqual(b);
  });
});
