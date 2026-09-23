/**
 * 縦の取り合いを数えるためのレイアウト定数。
 * ここの数値は src/ui/style.css の :root と同じ値にしておき、
 * テスト（tests/layout.test.ts）で両者が食い違っていないか確かめる。
 *
 * 目的は「編成タブのキャラカードが、想定する画面高さで縦スクロールなしに収まる」ことの保証。
 */

export const LAYOUT = {
  /** タップ領域の最小値 */
  tap: 44,
  /** 要素間の標準の隙間 */
  gap: 8,
  /** #app の内側の余白（上下それぞれ） */
  appPadding: 4,
  /** #app の子要素どうしの隙間 */
  appGap: 2,
  /** 画面上部の見出し行 */
  headerHeight: 26,
  /**
   * 下部バーの高さ（px・固定）。
   * 「編成」タブ（いちばん縦を要する）の実コンテンツ高さ＋余白から決めている。
   * どのタブでもこの高さで、余る分は中身の余白、足りない分は内部スクロールで吸収する。
   */
  barHeight: 320,
  /** 下部バーの内側の余白（上下それぞれ） */
  barPadding: 8,
  /** 盤面が潰れないための最小の高さ */
  boardMinHeight: 140,
  /**
   * メイン画面（盤面・リザルト・ショップ・イベント共通）の固定高さ。
   * いちばん狭い想定画面（375×667）で余白を詰めたときの盤面の高さを基準にする。
   * screenMode が変わっても、画面サイズが変わっても、ここは動かさない。
   */
  mainHeight: 300,

  /** キャラカードの内側の余白（上下それぞれ） */
  cardPadding: 6,
  /** キャラカードの枠線（上下合わせて） */
  cardBorder: 2,
  /** カード内の行どうしの隙間 */
  cardRowGap: 4,

  /** 1行目: 名前だけ（省略記号を出さないために独立させた） */
  rowNameHeight: 26,
  /** 2行目: ★・属性・役割・ID のチップ行 */
  rowTagsHeight: 24,
  /** 2行目: 状態表示＋簡易ステータス */
  rowStateHeight: 26,
  /** 3行目: 操作ボタン（タップ領域） */
  rowActionHeight: 44,

  /** 編成状況＋「3 / 8」の1行 */
  summaryHeight: 22,
  /** ヒントの1行 */
  hintHeight: 20,
} as const;

/** キャラカード1枚の高さ（名前 / チップ / 状態＋ステータス / 操作 の4行） */
export function teamCardHeight(): number {
  const rows =
    LAYOUT.rowNameHeight +
    LAYOUT.rowTagsHeight +
    LAYOUT.rowStateHeight +
    LAYOUT.rowActionHeight +
    LAYOUT.cardRowGap * 3;
  return rows + LAYOUT.cardPadding * 2 + LAYOUT.cardBorder;
}

/** 「編成」タブの中身の高さ（編成状況＋ヒント＋カード） */
export function teamTabContentHeight(): number {
  return LAYOUT.summaryHeight + LAYOUT.hintHeight + teamCardHeight() + LAYOUT.cardRowGap * 2;
}

/** 下部バー全体の高さ（画面の高さによらず固定） */
export function barHeight(_viewportHeight?: number): number {
  return LAYOUT.barHeight;
}

/** 下部バーのうち、タブの中身に使える高さ */
export function tabBodyHeight(viewportHeight?: number): number {
  return (
    barHeight(viewportHeight) -
    LAYOUT.barPadding * 2 -
    LAYOUT.tap * 2 - // タブ行 + 実行ボタン行
    LAYOUT.gap * 2
  );
}

/** 盤面（六角グリッド）の縦横比。src/ui/main.ts の BOARD_W / BOARD_H と同じ */
const SQ3 = Math.sqrt(3);
const BOARD_R = (360 - 4) / (SQ3 * 5.5);
export const BOARD_ASPECT = 360 / (1.5 * BOARD_R * 5 + 2 * BOARD_R + 4);

/** #app の最大幅（style.css の #app max-width と同じ） */
export const APP_MAX_WIDTH = 430;

/** 盤面の入れ物に使える横幅 */
export function boardAreaWidth(viewportWidth: number): number {
  return Math.min(APP_MAX_WIDTH, viewportWidth) - LAYOUT.appPadding * 2;
}

/** 盤面の入れ物に使える高さ（下部バーが最小のときの上限） */
export function boardHeight(viewportHeight: number): number {
  return (
    viewportHeight -
    LAYOUT.appPadding * 2 -
    LAYOUT.headerHeight -
    barHeight(viewportHeight) -
    LAYOUT.appGap * 2
  );
}

/**
 * メイン画面の高さ。screenMode にも画面サイズにもよらず固定。
 */
export function mainHeight(): number {
  return LAYOUT.mainHeight;
}

/**
 * 実際に描かれる盤面の高さ。メイン画面の固定高さに収まる大きさになる。
 */
export function boardRenderedHeight(viewportWidth: number, _viewportHeight = 0): number {
  const byWidth = boardAreaWidth(viewportWidth) / BOARD_ASPECT;
  return Math.min(byWidth, mainHeight());
}

/**
 * 盤面の上下に残る余白。
 * 盤面の入れ物は伸び縮みせず（flex: 0 0 auto）、余りは下部バーが吸うので 0 になる。
 */
export function boardVerticalSlack(viewportWidth: number, _viewportHeight = 0): number {
  return mainHeight() - boardRenderedHeight(viewportWidth);
}

/** 実際の下部バーの高さ（余った高さはバーが吸う。最小は LAYOUT.barHeight） */
export function barHeightAt(_viewportWidth: number, viewportHeight: number): number {
  const rest =
    viewportHeight -
    LAYOUT.appPadding * 2 -
    LAYOUT.headerHeight -
    LAYOUT.appGap * 2 -
    mainHeight();
  return Math.max(LAYOUT.barHeight, rest);
}

/** テストで確かめる想定の画面高さ */
export const TEST_VIEWPORT_HEIGHTS = [667, 736, 812, 932] as const;

/** 実機の主要サイズ（幅 × 高さ） */
export const TEST_VIEWPORTS = [
  [375, 667],
  [390, 844],
  [428, 926],
] as const;
