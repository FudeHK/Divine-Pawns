/**
 * シード付き乱数（sfc32）。系列を「戦闘」「ショップ」「イベント」に分ける。
 */

export type RngStream = 'battle' | 'shop' | 'event';
export const RNG_STREAMS: readonly RngStream[] = ['battle', 'shop', 'event'];

/** 文字列 → 32bit シード（xmur3） */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  /** 呼び出し回数（決定論の検証に使える） */
  calls = 0;

  constructor(seed: string) {
    const h = xmur3(seed);
    this.a = h();
    this.b = h();
    this.c = h();
    this.d = h();
    // 初期状態のばらつきを出すため空回し
    for (let i = 0; i < 12; i++) this.nextFloat();
    this.calls = 0;
  }

  /** [0, 1) */
  nextFloat(): number {
    this.calls++;
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** [0, n) の整数 */
  nextInt(n: number): number {
    return Math.floor(this.nextFloat() * n);
  }

  /** [min, max] の整数 */
  range(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)]!;
  }

  /** Fisher-Yates（元配列は変更しない） */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }
}

/** 系列ごとに独立した Rng をまとめて持つ */
export class RngSet {
  readonly seed: string;
  readonly battle: Rng;
  readonly shop: Rng;
  readonly event: Rng;

  constructor(seed: string) {
    this.seed = seed;
    this.battle = new Rng(`${seed}::battle`);
    this.shop = new Rng(`${seed}::shop`);
    this.event = new Rng(`${seed}::event`);
  }

  get(stream: RngStream): Rng {
    return this[stream];
  }
}
