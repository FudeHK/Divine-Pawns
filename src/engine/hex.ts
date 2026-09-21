/**
 * 幅5の六角グリッド（odd-r オフセット、奇数行は右に半マスずれる）。
 * 距離は cube 座標で計算する。
 */

import type { Hex, Side } from './types';

export const BOARD_WIDTH = 5;
export const BOARD_HEIGHT = 6;

/** 各行で使えるマスの x 一覧（y=0..5、合計28マス） */
export const ROW_CELLS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4], // y=0 敵3行目（最後列）
  [0, 1, 2, 3], //    y=1 敵2行目
  [0, 1, 2, 3, 4], // y=2 敵1行目（最前列）
  [0, 1, 2, 3, 4], // y=3 味方1行目（最前列）
  [1, 2, 3, 4], //    y=4 味方2行目
  [0, 1, 2, 3, 4], // y=5 味方3行目（最後列）
];

/** 全ての使えるマス（座標順：y 昇順 → x 昇順） */
export const ALL_CELLS: readonly Hex[] = ROW_CELLS.flatMap((xs, y) =>
  xs.map((x) => ({ x, y })),
);

export const ENEMY_CELLS: readonly Hex[] = ALL_CELLS.filter((c) => c.y <= 2);
export const ALLY_CELLS: readonly Hex[] = ALL_CELLS.filter((c) => c.y >= 3);

export function cellsFor(side: Side): readonly Hex[] {
  return side === 'ally' ? ALLY_CELLS : ENEMY_CELLS;
}

/** そのマスが使えるか */
export function isValidCell(h: Hex): boolean {
  if (!Number.isInteger(h.x) || !Number.isInteger(h.y)) return false;
  if (h.y < 0 || h.y >= BOARD_HEIGHT) return false;
  return ROW_CELLS[h.y]!.includes(h.x);
}

/** その陣営が置けるマスか */
export function isCellOfSide(h: Hex, side: Side): boolean {
  if (!isValidCell(h)) return false;
  return side === 'ally' ? h.y >= 3 : h.y <= 2;
}

/** 陣営の最前列 y */
export function frontRowY(side: Side): number {
  return side === 'ally' ? 3 : 2;
}

/** 陣営の最後列 y */
export function backRowY(side: Side): number {
  return side === 'ally' ? 5 : 0;
}

export interface Cube {
  q: number;
  r: number;
  s: number;
}

/** odd-r オフセット → cube 座標 */
export function toCube(h: Hex): Cube {
  const q = h.x - (h.y - (h.y & 1)) / 2;
  const r = h.y;
  return { q, r, s: -q - r };
}

/** cube 座標 → odd-r オフセット */
export function fromCube(c: Cube): Hex {
  const x = c.q + (c.r - (c.r & 1)) / 2;
  return { x, y: c.r };
}

/** 六角距離 */
export function hexDistance(a: Hex, b: Hex): number {
  const ca = toCube(a);
  const cb = toCube(b);
  return (
    (Math.abs(ca.q - cb.q) + Math.abs(ca.r - cb.r) + Math.abs(ca.s - cb.s)) / 2
  );
}

/** odd-r の隣接方向（偶数行・奇数行で異なる） */
const NEIGHBOR_EVEN: readonly [number, number][] = [
  [+1, 0],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, +1],
  [0, +1],
];
const NEIGHBOR_ODD: readonly [number, number][] = [
  [+1, 0],
  [+1, -1],
  [0, -1],
  [-1, 0],
  [0, +1],
  [+1, +1],
];

/** 隣接するマス（盤外・無効マスを除く。座標順にソート） */
export function neighbors(h: Hex): Hex[] {
  const dirs = (h.y & 1) === 1 ? NEIGHBOR_ODD : NEIGHBOR_EVEN;
  const out: Hex[] = [];
  for (const [dx, dy] of dirs) {
    const n = { x: h.x + dx, y: h.y + dy };
    if (isValidCell(n)) out.push(n);
  }
  return sortCells(out);
}

/** マスの座標順（y 昇順 → x 昇順）で並べる */
export function sortCells<T extends Hex>(cells: T[]): T[] {
  return cells.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
}

export function cellKey(h: Hex): number {
  return h.y * 16 + h.x;
}

export function sameHex(a: Hex, b: Hex): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 半径 r 以内の使えるマス */
export function cellsWithin(center: Hex, radius: number): Hex[] {
  return ALL_CELLS.filter((c) => hexDistance(center, c) <= radius).map((c) => ({
    x: c.x,
    y: c.y,
  }));
}

/**
 * BFS で最短経路を求める。占有マス（blocked）は通れない。
 * goal そのものが占有されていても、goal に「隣接する（＝距離 range 以内の）」
 * 到達可能マスを目標にできるよう、stopWithin を指定する。
 *
 * 同点はマスの座標順で決める（決定論）。
 *
 * @returns start を含まない経路。到達不能なら null。
 */
export function bfsPath(
  start: Hex,
  goal: Hex,
  blocked: ReadonlySet<number>,
  stopWithin = 0,
): Hex[] | null {
  if (hexDistance(start, goal) <= stopWithin) return [];

  const startKey = cellKey(start);
  const prev = new Map<number, number>();
  const visited = new Set<number>([startKey]);
  const coord = new Map<number, Hex>([[startKey, start]]);
  let frontier: Hex[] = [start];

  while (frontier.length > 0) {
    const next: Hex[] = [];
    // 座標順に展開することで同点の決着を決定論にする
    for (const cur of sortCells(frontier.slice())) {
      for (const n of neighbors(cur)) {
        const k = cellKey(n);
        if (visited.has(k)) continue;
        if (blocked.has(k)) continue;
        visited.add(k);
        prev.set(k, cellKey(cur));
        coord.set(k, n);
        if (hexDistance(n, goal) <= stopWithin) {
          // 経路を復元
          const path: Hex[] = [];
          let c: number | undefined = k;
          while (c !== undefined && c !== startKey) {
            path.push(coord.get(c)!);
            c = prev.get(c);
          }
          path.reverse();
          return path;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}
