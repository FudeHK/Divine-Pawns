/**
 * テーマカラーの検証。
 * - CSS 変数（src/ui/theme.css）と TypeScript 側（src/ui/palette.ts）の値が一致していること
 * - 文字と背景のコントラスト比が WCAG AA（本文 4.5:1）を満たすこと
 * - 主要コンポーネントが直書きの色ではなく変数を参照していること
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ELEMENT_COLOR, PALETTE, RARITY_COLOR, contrastRatio } from '../src/ui/palette';

const THEME = readFileSync(resolve(__dirname, '../src/ui/theme.css'), 'utf8');
const STYLE = readFileSync(resolve(__dirname, '../src/ui/style.css'), 'utf8');

function cssVar(name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(THEME);
  return m ? m[1]!.trim() : null;
}

const SPECIFIED = {
  main: '#eaebad',
  sub1: '#ebcdad',
  sub2: '#cbebad',
};

describe('指定の3色を起点にしている', () => {
  it('メイン・サブ1・サブ2 がそのまま入っている', () => {
    expect(cssVar('--main')).toBe(SPECIFIED.main);
    expect(cssVar('--accent-peach')).toBe(SPECIFIED.sub1);
    expect(cssVar('--accent-green')).toBe(SPECIFIED.sub2);
    expect(PALETTE.base).toBe(SPECIFIED.main);
    expect(PALETTE.accentPeach).toBe(SPECIFIED.sub1);
    expect(PALETTE.accentGreen).toBe(SPECIFIED.sub2);
  });

  it('パネルはメインの明度違い（明るい / 暗い の3段）', () => {
    expect(cssVar('--panel')).toBe(PALETTE.panel);
    expect(cssVar('--panel2')).toBe(PALETTE.panel2);
    expect(PALETTE.panel).not.toBe(PALETTE.base);
    expect(PALETTE.panel2).not.toBe(PALETTE.base);
  });
});

describe('CSS と TypeScript の色が一致している', () => {
  const pairs: [string, string][] = [
    ['--bg', PALETTE.base],
    ['--panel', PALETTE.panel],
    ['--panel2', PALETTE.panel2],
    ['--line', PALETTE.line],
    ['--text', PALETTE.text],
    ['--muted', PALETTE.muted],
    ['--fire', PALETTE.fire],
    ['--ice', PALETTE.ice],
    ['--wood', PALETTE.wood],
    ['--lightning', PALETTE.lightning],
    ['--rarity-1', PALETTE.rarity1],
    ['--rarity-2', PALETTE.rarity2],
    ['--rarity-3', PALETTE.rarity3],
    ['--life', PALETTE.life],
    ['--coin', PALETTE.coin],
    ['--ok', PALETTE.ok],
    ['--ally', PALETTE.ally],
    ['--enemy', PALETTE.enemy],
    ['--focus', PALETTE.focus],
    ['--board-bg', PALETTE.boardBg],
  ];

  it.each(pairs)('%s', (name, value) => {
    expect(cssVar(name)).toBe(value);
  });
});

describe('コントラスト比（WCAG AA 目安 4.5:1）', () => {
  const surfaces: [string, string][] = [
    ['ベース', PALETTE.base],
    ['パネル', PALETTE.panel],
    ['パネル2', PALETTE.panel2],
    ['ピーチ', PALETTE.accentPeach],
    ['黄緑', PALETTE.accentGreen],
  ];

  it.each(surfaces)('本文の色は %s の上で 7:1 以上', (_name, bg) => {
    expect(contrastRatio(PALETTE.text, bg)).toBeGreaterThanOrEqual(7);
  });

  it.each(surfaces)('補足の色は %s の上で 4.5:1 以上', (_name, bg) => {
    expect(contrastRatio(PALETTE.muted, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('属性・レア度・状態の色は、標準の面（パネル）の上で 4.5:1 以上', () => {
    const colored = [
      ...Object.values(ELEMENT_COLOR),
      ...Object.values(RARITY_COLOR),
      PALETTE.life,
      PALETTE.coin,
      PALETTE.ok,
      PALETTE.danger,
      PALETTE.ally,
      PALETTE.focus,
      PALETTE.accentPeachDeep,
      PALETTE.accentGreenDeep,
    ];
    for (const c of colored) {
      expect(contrastRatio(c, PALETTE.panel), c).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('濃い面（ボタンの選択中など）の上では明るい文字を使う', () => {
    expect(contrastRatio(PALETTE.textOnDark, PALETTE.coin)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PALETTE.text, PALETTE.accentPeach)).toBeGreaterThanOrEqual(7);
  });

  it('コインの色はメインカラーと十分に違う（紛らわしくない）', () => {
    expect(contrastRatio(PALETTE.coin, PALETTE.base)).toBeGreaterThanOrEqual(3);
  });
});

describe('色は変数に集約されている', () => {
  it('style.css に生の16進カラーを書かない', () => {
    const withoutComments = STYLE.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('主要コンポーネントが変数を参照している', () => {
    const rules = [
      '.bottom-bar',
      '.char',
      '.shop-row',
      '.screen-panel',
      'button',
      '.board',
    ];
    for (const sel of rules) {
      const re = new RegExp(`(^|\\})\\s*${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm');
      const m = re.exec(STYLE);
      expect(m, sel).not.toBeNull();
      expect(m![2], sel).toMatch(/var\(--/);
    }
  });

  it('theme.css を読み込んでいる', () => {
    expect(STYLE.startsWith("@import './theme.css';")).toBe(true);
  });
});
