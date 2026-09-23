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
  TEST_VIEWPORTS,
  TEST_VIEWPORT_HEIGHTS,
  barHeight,
  barHeightAt,
  boardAreaWidth,
  boardHeight,
  boardRenderedHeight,
  boardVerticalSlack,
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
  it('下部バーの高さ（px）が同じ', () => {
    expect(cssVar('--bar-h-fixed')).toBe(`${LAYOUT.barHeight}px`);
    expect(ruleBody('.bottom-bar')).toContain('var(--bar-h-fixed)');
  });

  it('タップ領域・隙間・盤面の最小高さが同じ', () => {
    expect(cssVar('--tap')).toBe(`${LAYOUT.tap}px`);
    expect(cssVar('--gap')).toBe(`${LAYOUT.gap}px`);
    expect(cssVar('--board-min')).toBe(`${LAYOUT.boardMinHeight}px`);
  });

  it('カードの各行の高さが同じ', () => {
    expect(pxOf('.char-head', 'height')).toBe(LAYOUT.rowNameHeight);
    expect(pxOf('.char-tags', 'height')).toBe(LAYOUT.rowTagsHeight);
    expect(pxOf('.char-line2', 'height')).toBe(LAYOUT.rowStateHeight);
    expect(pxOf('.char-sub', 'min-height')).toBe(null); // var(--tap) を使う
    expect(ruleBody('.char-sub')).toContain('min-height: var(--tap)');
    expect(pxOf('.char', 'padding')).toBe(LAYOUT.cardPadding);
    expect(pxOf('.team-summary', 'height')).toBe(LAYOUT.summaryHeight);
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
    // 名前 / チップ / 状態＋ステータス / 操作 の4行
    expect(teamCardHeight()).toBe(
      LAYOUT.rowNameHeight +
        LAYOUT.rowTagsHeight +
        LAYOUT.rowStateHeight +
        LAYOUT.rowActionHeight +
        LAYOUT.cardRowGap * 3 +
        LAYOUT.cardPadding * 2 +
        LAYOUT.cardBorder,
    );
    expect(teamCardHeight()).toBeLessThanOrEqual(150);
  });

  it('いちばん低い画面でも余白が残る（詰めすぎていない）', () => {
    const vh = Math.min(...TEST_VIEWPORT_HEIGHTS);
    expect(tabBodyHeight(vh) - teamTabContentHeight()).toBeGreaterThanOrEqual(0);
  });
});

describe('フェーズ2.5: 盤面まわりの余白を詰めてバーに回した', () => {
  it('#app の余白と隙間が CSS と同じ', () => {
    expect(pxOf('#app', 'padding')).toBe(LAYOUT.appPadding);
    expect(pxOf('#app', 'gap')).toBe(LAYOUT.appGap);
  });

  it('想定画面（375x667 / 390x844 / 428x926）で中身が収まる', () => {
    for (const vh of [667, 844, 926]) {
      expect(teamTabContentHeight(), `vh=${vh}`).toBeLessThanOrEqual(tabBodyHeight(vh));
      expect(boardHeight(vh), `vh=${vh}`).toBeGreaterThanOrEqual(LAYOUT.boardMinHeight);
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

describe('盤面が潰れない', () => {
  it.each([...TEST_VIEWPORT_HEIGHTS])('画面高さ %ipx で盤面に十分な高さが残る', (vh) => {
    const board = boardHeight(vh);
    expect(board, `board=${board}`).toBeGreaterThanOrEqual(LAYOUT.boardMinHeight);
    // フェーズ2.2（バー56vh）より盤面が広がっていること
    expect(board, `board=${board}`).toBeGreaterThan(vh - Math.floor((vh * 56) / 100) - 60);
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
  it('CSS で下部バーの最小高さを固定し、余った高さはバーが吸う', () => {
    const decls = new Map(
      ruleBody('.bottom-bar')
        .split(';')
        .map((d) => d.split(':'))
        .filter((kv) => kv.length >= 2)
        .map((kv) => [kv[0]!.trim(), kv.slice(1).join(':').trim()]),
    );
    expect(decls.get('min-height')).toBe('var(--bar-h-fixed)');
    expect(decls.get('flex')).toBe('1 1 var(--bar-h-fixed)');
    // どのタブでも中身の量では高さが変わらない（画面サイズだけで決まる）
    expect(decls.get('height')).toBeUndefined();
  });

  it('中身が多いタブでも内部スクロールで吸収する（外枠は変えない）', () => {
    expect(ruleBody('.tab-body')).toContain('overflow-y: auto');
    expect(ruleBody('.tab-body')).toContain('flex: 1 1 auto');
  });
});

// ---------------------------------------------------------------------------
// フェーズ2.7: 盤面の上下に余白を残さない
// ---------------------------------------------------------------------------

describe('盤面の上下に余白が出ない', () => {
  it('盤面の入れ物は伸びない（余った高さは下部バーが吸う）', () => {
    const decls = new Map(
      ruleBody('.board-area')
        .split(';')
        .map((d) => d.split(':'))
        .filter((kv) => kv.length >= 2)
        .map((kv) => [kv[0]!.trim(), kv.slice(1).join(':').trim()]),
    );
    expect(decls.get('flex')).toBe('0 1 auto');
    expect(decls.get('align-items')).toBe('stretch');
    // 盤面自体は縦横比で高さが決まる（レターボックスの余白が出ない）
    expect(ruleBody('.board')).toContain('aspect-ratio');
    expect(ruleBody('.board')).not.toContain('max-height');
  });

  it.each([...TEST_VIEWPORTS])('%ix%i で盤面の上下余白が 0', (vw, vh) => {
    expect(boardVerticalSlack(vw, vh)).toBe(0);
  });

  it.each([...TEST_VIEWPORTS])('%ix%i で画面ぴったりに収まる', (vw, vh) => {
    const total =
      LAYOUT.appPadding * 2 +
      LAYOUT.headerHeight +
      LAYOUT.appGap * 2 +
      boardRenderedHeight(vw, vh) +
      barHeightAt(vw, vh);
    expect(Math.round(total)).toBe(vh);
  });

  it.each([...TEST_VIEWPORTS])('%ix%i で盤面が潰れない', (vw, vh) => {
    expect(boardRenderedHeight(vw, vh)).toBeGreaterThanOrEqual(LAYOUT.boardMinHeight);
    // 盤面の1マスがつぶれない目安（横幅の 1/6 以上）
    expect(boardAreaWidth(vw) / 6).toBeGreaterThan(40);
  });

  it.each([...TEST_VIEWPORTS])('%ix%i で下部バーは最小高さ以上', (vw, vh) => {
    expect(barHeightAt(vw, vh)).toBeGreaterThanOrEqual(LAYOUT.barHeight);
    expect(tabBodyHeight(vh)).toBeGreaterThanOrEqual(teamTabContentHeight());
  });

  it('フェーズ2.6（padding 6 / gap 4 / ヘッダー30）より縦の余白が減っている', () => {
    const before = 6 * 2 + 4 * 2 + 30;
    const after = LAYOUT.appPadding * 2 + LAYOUT.appGap * 2 + LAYOUT.headerHeight;
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(12);
  });
});
