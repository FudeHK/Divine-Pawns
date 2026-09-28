/**
 * キャラクターのSD立ち絵（プレースホルダー）。
 *
 * 本物のイラストが用意できるまでの仮絵を、コードだけで作る。
 * - 同じキャラIDなら必ず同じ見た目（IDのハッシュから形を選ぶ）
 * - 色は属性（テーマカラー）から、装飾は役割と神話圏から決める
 * - 将来は画像に差し替えられるよう、入口を `getCharacterPortrait()` に一本化する
 *
 * 外部の画像素材や既存作品のモチーフは使わない（幾何学的な図形だけで描く）。
 */

import { getCharacter } from '../data/characters';
import type { Myth, Role } from '../engine/types';
import { ELEMENT_COLOR, PALETTE } from './palette';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 立ち絵の基準サイズ（viewBox） */
export const PORTRAIT_VIEWBOX = 100;

export interface PortraitOptions {
  /** 表示サイズ（px）。省略時は CSS 側に任せる */
  size?: number;
  /** ★の数（1〜3）。多いほど装飾が増える */
  star?: number;
  /** 背景（カードの地）を描くか */
  background?: boolean;
}

/** 将来、画像ファイルに差し替えられるようにした戻り値 */
export type Portrait =
  | { kind: 'svg'; element: SVGSVGElement }
  | { kind: 'image'; url: string };

/** 文字列 → 32bit ハッシュ（FNV-1a）。同じIDなら必ず同じ値 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 立ち絵の見た目を決めるパラメータ（IDから決定論的に導く） */
export interface PortraitParams {
  charId: string;
  element: keyof typeof ELEMENT_COLOR;
  role: Role;
  myth: Myth;
  /** 髪型（0〜3） */
  hair: number;
  /** 輪郭の丸み（0〜2） */
  face: number;
  /** 体型（0〜2。0=細い 1=標準 2=がっしり） */
  body: number;
  /** 表情（0〜2） */
  mood: number;
}

export function portraitParams(charId: string): PortraitParams {
  const c = getCharacter(charId);
  const h = hashId(charId);
  return {
    charId,
    element: c.element,
    role: c.role,
    myth: c.myth,
    hair: h % 4,
    face: (h >> 3) % 3,
    body: (h >> 6) % 3,
    mood: (h >> 9) % 3,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** 神話圏ごとの飾り（オリジナルの幾何モチーフ） */
function mythOrnament(myth: Myth, color: string): SVGGElement {
  const g = el('g', { class: `myth-${myth}`, fill: 'none', stroke: color, 'stroke-width': 2 });
  if (myth === 'greek') {
    // 直線を折り返した帯（雷紋ふう）
    g.appendChild(el('path', { d: 'M22 88 h8 v-6 h8 v6 h8 v-6 h8 v6 h8', 'stroke-linejoin': 'miter' }));
  } else if (myth === 'norse') {
    // 三角を組み合わせた結び
    g.appendChild(el('path', { d: 'M30 86 l10 -8 l10 8 z M50 86 l10 -8 l10 8 z' }));
  } else if (myth === 'japanese') {
    // 同心の円弧（波）
    g.appendChild(el('path', { d: 'M28 86 a12 8 0 0 1 24 0 M46 86 a12 8 0 0 1 24 0' }));
  } else {
    // エジプト：階段状の矩形
    g.appendChild(el('path', { d: 'M26 88 v-6 h8 v-6 h10 v6 h8 v6 h8' }));
  }
  return g;
}

/** 役割ごとの持ち物（近接＝刃物風、遠隔＝弓風、その他＝杖・盾） */
function roleProp(role: Role, color: string): SVGGElement {
  const g = el('g', { class: `role-${role}` });
  const stroke = { stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' };
  if (role === 'melee') {
    g.appendChild(el('line', { x1: 76, y1: 34, x2: 76, y2: 74, ...stroke }));
    g.appendChild(el('polygon', { points: '72,34 80,34 76,20', fill: color }));
  } else if (role === 'tank') {
    g.appendChild(el('path', { d: 'M74 40 h16 v18 l-8 10 l-8 -10 z', fill: color, opacity: 0.85 }));
  } else if (role === 'ranged') {
    g.appendChild(el('path', { d: 'M78 32 a20 20 0 0 1 0 40', ...stroke }));
    g.appendChild(el('line', { x1: 78, y1: 32, x2: 78, y2: 72, ...stroke, 'stroke-width': 1.5 }));
  } else if (role === 'mage') {
    g.appendChild(el('line', { x1: 76, y1: 30, x2: 76, y2: 76, ...stroke }));
    g.appendChild(el('circle', { cx: 76, cy: 26, r: 7, fill: color }));
  } else if (role === 'healer') {
    g.appendChild(el('line', { x1: 76, y1: 34, x2: 76, y2: 76, ...stroke }));
    g.appendChild(el('path', { d: 'M70 44 h12 M76 38 v12', ...stroke, 'stroke-width': 3 }));
  } else {
    // サポーター：小さな旗
    g.appendChild(el('line', { x1: 76, y1: 28, x2: 76, y2: 76, ...stroke }));
    g.appendChild(el('path', { d: 'M76 30 h16 l-5 7 l5 7 h-16 z', fill: color }));
  }
  return g;
}

/** 髪型（4種） */
function hairShape(kind: number, color: string): SVGGElement {
  const g = el('g', { class: `hair-${kind}`, fill: color });
  if (kind === 0) {
    g.appendChild(el('path', { d: 'M28 30 a22 22 0 0 1 44 0 v4 a22 14 0 0 0 -44 0 z' }));
  } else if (kind === 1) {
    g.appendChild(el('path', { d: 'M28 32 a22 22 0 0 1 44 0 l4 22 l-8 -4 l-2 -14 a18 14 0 0 0 -32 0 l-2 14 l-8 4 z' }));
  } else if (kind === 2) {
    g.appendChild(el('path', { d: 'M30 28 a20 20 0 0 1 40 0 v2 h-6 a16 10 0 0 0 -28 0 h-6 z' }));
    g.appendChild(el('circle', { cx: 50, cy: 10, r: 6 }));
  } else {
    g.appendChild(el('path', { d: 'M28 34 a22 22 0 0 1 44 0 l0 6 l-6 -2 a18 12 0 0 0 -32 0 l-6 2 z' }));
    g.appendChild(el('path', { d: 'M24 34 q-6 18 2 30 l8 -4 q-6 -12 -2 -24 z' }));
  }
  return g;
}

/**
 * SD立ち絵を作る。
 * 将来イラストに差し替えるときは、この関数の中身を画像の読み込みに置き換える。
 */
export function getCharacterPortrait(charId: string, opts: PortraitOptions = {}): Portrait {
  return { kind: 'svg', element: portraitSvg(charId, opts) };
}

/** SD立ち絵の SVG 要素 */
export function portraitSvg(charId: string, opts: PortraitOptions = {}): SVGSVGElement {
  const p = portraitParams(charId);
  const star = Math.min(3, Math.max(1, opts.star ?? 1));
  const color = ELEMENT_COLOR[p.element];

  const svg = el('svg', {
    class: `portrait portrait-${p.element} portrait-star${star}`,
    viewBox: `0 0 ${PORTRAIT_VIEWBOX} ${PORTRAIT_VIEWBOX}`,
    role: 'img',
    'aria-label': `${getCharacter(charId).name} の立ち絵`,
    'data-char': charId,
    'data-star': star,
  });
  if (opts.size) {
    svg.setAttribute('width', String(opts.size));
    svg.setAttribute('height', String(opts.size));
  }

  // 背景（カードの地。属性色に対してコントラストが出るパステル）
  if (opts.background !== false) {
    svg.appendChild(
      el('rect', {
        x: 1,
        y: 1,
        width: 98,
        height: 98,
        rx: 14,
        fill: p.role === 'support' || p.role === 'healer' ? PALETTE.accentGreen : PALETTE.accentPeach,
        stroke: PALETTE.line,
        'stroke-width': 2,
      }),
    );
  }

  // ★の後光（★2で薄い輪、★3で二重＋光条）
  if (star >= 2) {
    svg.appendChild(
      el('circle', { cx: 50, cy: 34, r: 30, fill: 'none', stroke: color, 'stroke-width': 2, opacity: 0.45 }),
    );
  }
  if (star >= 3) {
    svg.appendChild(
      el('circle', { cx: 50, cy: 34, r: 35, fill: 'none', stroke: PALETTE.rarity3, 'stroke-width': 3, opacity: 0.7 }),
    );
    const rays = el('g', { stroke: PALETTE.rarity3, 'stroke-width': 2, opacity: 0.6 });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      rays.appendChild(
        el('line', {
          x1: (50 + Math.cos(a) * 37).toFixed(1),
          y1: (34 + Math.sin(a) * 37).toFixed(1),
          x2: (50 + Math.cos(a) * 43).toFixed(1),
          y2: (34 + Math.sin(a) * 43).toFixed(1),
        }),
      );
    }
    svg.appendChild(rays);
  }

  // 体（頭身の低いシルエット。体型3種）
  const bodyW = [16, 20, 25][p.body]!;
  svg.appendChild(
    el('path', {
      d: `M${50 - bodyW} 92 q0 -26 ${bodyW} -26 q${bodyW} 0 ${bodyW} 26 z`,
      fill: color,
      opacity: 0.9,
    }),
  );
  // 襟もと（サブカラーのアクセント）
  svg.appendChild(
    el('path', { d: `M${50 - bodyW * 0.5} 70 h${bodyW} l-${bodyW * 0.5} 8 z`, fill: PALETTE.panel }),
  );

  // 役割の持ち物（体の後ろ側に置く）
  svg.appendChild(roleProp(p.role, PALETTE.accentPeachDeep));

  // 頭（輪郭の丸み3種）
  const headR = [20, 21, 22][p.face]!;
  svg.appendChild(
    el('ellipse', {
      cx: 50,
      cy: 40,
      rx: headR,
      ry: headR - p.face,
      fill: PALETTE.panel,
      stroke: PALETTE.line,
      'stroke-width': 1.5,
    }),
  );

  // 髪
  svg.appendChild(hairShape(p.hair, color));

  // 目と口（表情3種）
  const eyeY = 42;
  const eyes = el('g', { fill: PALETTE.text });
  if (p.mood === 0) {
    eyes.appendChild(el('circle', { cx: 42, cy: eyeY, r: 3 }));
    eyes.appendChild(el('circle', { cx: 58, cy: eyeY, r: 3 }));
  } else if (p.mood === 1) {
    eyes.appendChild(el('rect', { x: 39, y: eyeY - 1, width: 6, height: 2.5, rx: 1 }));
    eyes.appendChild(el('rect', { x: 55, y: eyeY - 1, width: 6, height: 2.5, rx: 1 }));
  } else {
    eyes.appendChild(el('path', { d: 'M39 43 q3 -4 6 0', fill: 'none', stroke: PALETTE.text, 'stroke-width': 2 }));
    eyes.appendChild(el('path', { d: 'M55 43 q3 -4 6 0', fill: 'none', stroke: PALETTE.text, 'stroke-width': 2 }));
  }
  eyes.appendChild(
    el('path', { d: 'M46 50 q4 3 8 0', fill: 'none', stroke: PALETTE.text, 'stroke-width': 1.5 }),
  );
  svg.appendChild(eyes);

  // 神話圏の飾り（足もと）
  svg.appendChild(mythOrnament(p.myth, PALETTE.accentGreenDeep));

  return svg;
}
