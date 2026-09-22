/**
 * 縦のレイアウト予算の検証。
 * 「編成」タブのキャラカードが、想定する画面高さで縦スクロールなしに収まることを確かめる。
 * src/ui/layout.ts の定数と src/ui/style.css の値が食い違っていないかも見る。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  LAYOUT,
  TEST_VIEWPORT_HEIGHTS,
  barHeight,
  boardHeight,
  tabBodyHeight,
  teamCardHeight,
  teamTabContentHeight,
} from '../src/ui/layout';

const CSS = readFileSync(resolve(__dirname, '../src/ui/style.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function cssVar(name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(CSS);
  return m ? m[1]!.trim() : null;
}

function ruleBody(selector: string): string {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const hit = rules.find((r) => r[1]!.trim().replace(/\s+/g, ' ') === selector);
  if (!hit) throw new Error(`CSS ルールが見つからない: ${selector}`);
  return hit[2]!;
}

function pxOf(selector: string, prop: string): number | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(ruleBody(selector));
  return m ? Number(m[1]) : null;
}

describe('レイアウト定数と CSS が一致している', () => {
  it('下部バーの上限（vh）が同じ', () => {
    expect(cssVar('--bar-max-vh')).toBe(String(LAYOUT.barMaxVh));
    expect(ruleBody('.bottom-bar')).toContain('calc(var(--bar-max-vh) * 1vh)');
  });

  it('タップ領域・隙間・盤面の最小高さが同じ', () => {
    expect(cssVar('--tap')).toBe(`${LAYOUT.tap}px`);
    expect(cssVar('--gap')).toBe(`${LAYOUT.gap}px`);
    expect(cssVar('--board-min')).toBe(`${LAYOUT.boardMinHeight}px`);
  });

  it('カードの各行の高さが同じ', () => {
    expect(pxOf('.char-head', 'height')).toBe(LAYOUT.rowNameHeight);
    expect(pxOf('.char-line2', 'height')).toBe(LAYOUT.rowStateHeight);
    expect(pxOf('.char-sub', 'min-height')).toBe(null); // var(--tap) を使う
    expect(ruleBody('.char-sub')).toContain('min-height: var(--tap)');
    expect(pxOf('.char', 'padding')).toBe(LAYOUT.cardPadding);
    expect(pxOf('.team-summary', 'height')).toBe(LAYOUT.summaryHeight);
    expect(pxOf('.char-page-indicator', 'height')).toBe(LAYOUT.indicatorHeight);
    expect(pxOf('.hint', 'min-height')).toBe(LAYOUT.hintHeight);
  });
});

describe('キャラカードが縦スクロールなしに収まる', () => {
  it.each([...TEST_VIEWPORT_HEIGHTS])('画面高さ %ipx', (vh) => {
    const content = teamTabContentHeight();
    const body = tabBodyHeight(vh);
    expect(content, `content=${content} body=${body}`).toBeLessThanOrEqual(body);
  });

  it('カード1枚の高さは4行ぶんに収まる', () => {
    // 名前 / 状態＋ステータス / 操作 / 操作 の4行
    expect(teamCardHeight()).toBe(
      LAYOUT.rowNameHeight +
        LAYOUT.rowStateHeight +
        LAYOUT.rowActionHeight +
        LAYOUT.rowAction2Height +
        LAYOUT.cardRowGap * 3 +
        LAYOUT.cardPadding * 2 +
        LAYOUT.cardBorder,
    );
    expect(teamCardHeight()).toBeLessThanOrEqual(200);
  });

  it('いちばん低い画面でも余白が残る（詰めすぎていない）', () => {
    const vh = Math.min(...TEST_VIEWPORT_HEIGHTS);
    expect(tabBodyHeight(vh) - teamTabContentHeight()).toBeGreaterThanOrEqual(0);
  });
});

describe('盤面が潰れない', () => {
  it.each([...TEST_VIEWPORT_HEIGHTS])('画面高さ %ipx で盤面に十分な高さが残る', (vh) => {
    const board = boardHeight(vh);
    expect(board, `board=${board}`).toBeGreaterThanOrEqual(LAYOUT.boardMinHeight);
  });

  it('下部バーと盤面を足しても画面からはみ出さない', () => {
    for (const vh of TEST_VIEWPORT_HEIGHTS) {
      const total =
        LAYOUT.appPadding * 2 +
        LAYOUT.headerHeight +
        LAYOUT.appGap * 2 +
        barHeight(vh) +
        boardHeight(vh);
      expect(total, `vh=${vh}`).toBeLessThanOrEqual(vh);
    }
  });
});

describe('B6 下部バーの高さは固定', () => {
  it('CSS で height / min-height / max-height をすべて同じ値に固定している', () => {
    const decls = new Map(
      ruleBody('.bottom-bar')
        .split(';')
        .map((d) => d.split(':'))
        .filter((kv) => kv.length >= 2)
        .map((kv) => [kv[0]!.trim(), kv.slice(1).join(':').trim()]),
    );
    const want = 'calc(var(--bar-max-vh) * 1vh)';
    for (const prop of ['height', 'min-height', 'max-height']) {
      expect(decls.get(prop), prop).toBe(want);
    }
  });

  it('中身が多いタブでも内部スクロールで吸収する（外枠は変えない）', () => {
    expect(ruleBody('.tab-body')).toContain('overflow-y: auto');
    expect(ruleBody('.tab-body')).toContain('flex: 1 1 auto');
  });
});
