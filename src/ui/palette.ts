/**
 * テーマカラーの一元管理（TypeScript 側）。
 *
 * 指定の3色を起点にしたパステル基調のライトテーマ。
 *   メイン   #eaebad（明るい黄緑〜クリーム）
 *   サブ1    #ebcdad（ピーチ）
 *   サブ2    #cbebad（黄緑）
 *
 * CSS 側の実体は src/ui/theme.css。値がずれていないかは tests/theme.test.ts が突き合わせる。
 * SVG（盤面・立ち絵）は CSS 変数を使えない場面があるので、ここの値を直接使う。
 */

export const PALETTE = {
  // --- ベース（メインカラーの明度違い） ---
  /** 画面のいちばん外側 */
  base: '#eaebad',
  /** パネル（1段明るい） */
  panel: '#f4f5d2',
  /** パネル2（1段暗い＝カードの地） */
  panel2: '#dfe09d',
  /** 罫線 */
  line: '#b6b77a',

  // --- アクセント（サブ1・サブ2） ---
  /** サブ1：ピーチ。選択中のタブ・強調 */
  accentPeach: '#ebcdad',
  /** サブ2：黄緑。加護・神話まわりの装飾 */
  accentGreen: '#cbebad',
  /** ピーチの濃いめ（枠線・文字） */
  accentPeachDeep: '#95602b',
  /** 黄緑の濃いめ（枠線・文字） */
  accentGreenDeep: '#4c7a2a',

  // --- 文字 ---
  /** 本文（ダークブラウン） */
  text: '#2a2416',
  /** 補足 */
  muted: '#5d5636',
  /** 濃い背景の上に載せる文字 */
  textOnDark: '#f7f8e6',

  // --- 属性 ---
  fire: '#bf3a12',
  ice: '#116f9e',
  wood: '#357220',
  lightning: '#6b3fb5',

  // --- レア度（★・装備ティア）。灰 → 銅 → 金の別軸 ---
  rarity1: '#6a6c73',
  rarity2: '#8f4f1d',
  rarity3: '#786000',

  // --- 状態 ---
  /** ライフ（赤） */
  life: '#c81e2c',
  /** コイン（はっきりした金色・オレンジ寄り。メインの黄緑と混ざらないように） */
  coin: '#a35c04',
  /** 勝利・回復 */
  ok: '#2b7449',
  /** 敗北・敵 */
  danger: '#b5261c',
  /** 味方 */
  ally: '#245f9e',
  /** 敵 */
  enemy: '#b5261c',
  /** 編成タブで見ているキャラの位置 */
  focus: '#c22a8f',

  // --- 盤面 ---
  boardBg: '#f4f5d2',
  cellAlly: '#dfe9c6',
  cellEnemy: '#f0d9cf',
  cellLine: '#b6b77a',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** 属性 → 色 */
export const ELEMENT_COLOR = {
  fire: PALETTE.fire,
  ice: PALETTE.ice,
  wood: PALETTE.wood,
  lightning: PALETTE.lightning,
} as const;

/** レア度（★・ティア）→ 色 */
export const RARITY_COLOR = {
  1: PALETTE.rarity1,
  2: PALETTE.rarity2,
  3: PALETTE.rarity3,
} as const;

/** #rrggbb → 相対輝度（WCAG） */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`色の書式が不正: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** 2色のコントラスト比（1〜21） */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
