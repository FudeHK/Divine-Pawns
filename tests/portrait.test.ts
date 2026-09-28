/**
 * @vitest-environment jsdom
 *
 * SD立ち絵（プレースホルダー）の検証。
 * 同じキャラIDなら必ず同じ見た目になること（決定論）と、
 * 属性・役割・神話・★が絵に反映されることを見る。
 */

import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '../src/data/characters';
import { ELEMENT_COLOR } from '../src/ui/palette';
import {
  getCharacterPortrait,
  hashId,
  portraitParams,
  portraitSvg,
} from '../src/ui/portrait';

function svgText(charId: string, star = 1): string {
  return portraitSvg(charId, { star }).outerHTML;
}

describe('SD立ち絵は決定論的', () => {
  it('同じキャラIDなら、何度作っても同じSVGになる', () => {
    for (const c of CHARACTERS) {
      expect(svgText(c.id)).toBe(svgText(c.id));
      expect(portraitParams(c.id)).toEqual(portraitParams(c.id));
    }
  });

  it('キャラが違えば見た目も違う', () => {
    const seen = new Set(CHARACTERS.map((c) => svgText(c.id)));
    expect(seen.size).toBe(CHARACTERS.length);
  });

  it('形のパラメータはIDのハッシュから決まる（範囲内）', () => {
    for (const c of CHARACTERS) {
      const p = portraitParams(c.id);
      expect(p.hair).toBeGreaterThanOrEqual(0);
      expect(p.hair).toBeLessThanOrEqual(3);
      expect(p.face).toBeLessThanOrEqual(2);
      expect(p.body).toBeLessThanOrEqual(2);
      expect(p.mood).toBeLessThanOrEqual(2);
      expect(p.element).toBe(c.element);
      expect(p.role).toBe(c.role);
      expect(p.myth).toBe(c.myth);
    }
    expect(hashId('GRE_A')).toBe(hashId('GRE_A'));
    expect(hashId('GRE_A')).not.toBe(hashId('GRE_B'));
  });
});

describe('SD立ち絵の中身', () => {
  it('属性の色を使い、神話と役割の飾りが入る', () => {
    for (const c of CHARACTERS) {
      const svg = portraitSvg(c.id);
      expect(svg.outerHTML).toContain(ELEMENT_COLOR[c.element]);
      expect(svg.querySelector(`.myth-${c.myth}`)).toBeTruthy();
      expect(svg.querySelector(`.role-${c.role}`)).toBeTruthy();
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(svg.getAttribute('data-char')).toBe(c.id);
    }
  });

  it('★が上がると装飾が増える', () => {
    const id = CHARACTERS[0]!.id;
    const s1 = portraitSvg(id, { star: 1 });
    const s2 = portraitSvg(id, { star: 2 });
    const s3 = portraitSvg(id, { star: 3 });
    const circles = (svg: SVGSVGElement): number => svg.querySelectorAll('circle, line').length;
    expect(circles(s2)).toBeGreaterThan(circles(s1));
    expect(circles(s3)).toBeGreaterThan(circles(s2));
    expect(s3.getAttribute('data-star')).toBe('3');
  });

  it('背景なし（盤面のコマ用）も作れる', () => {
    const id = CHARACTERS[0]!.id;
    const withBg = portraitSvg(id, { background: true }).querySelectorAll('rect').length;
    const noBg = portraitSvg(id, { background: false }).querySelectorAll('rect').length;
    expect(noBg).toBeLessThan(withBg);
  });
});

describe('差し替えできる入口', () => {
  it('getCharacterPortrait は SVG か画像URLを返す形', () => {
    const p = getCharacterPortrait(CHARACTERS[0]!.id, { size: 64 });
    expect(p.kind).toBe('svg');
    if (p.kind !== 'svg') throw new Error('svg ではない');
    expect(p.element.getAttribute('width')).toBe('64');
    expect(p.element.tagName.toLowerCase()).toBe('svg');
  });
});
