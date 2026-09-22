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
  appPadding: 8,
  /** #app の子要素どうしの隙間 */
  appGap: 6,
  /** 画面上部の見出し行 */
  headerHeight: 30,
  /**
   * 下部バーの高さ（px・固定）。
   * 「編成」タブ（いちばん縦を要する）の実コンテンツ高さ＋余白から決めている。
   * どのタブでもこの高さで、余る分は中身の余白、足りない分は内部スクロールで吸収する。
   */
  barHeight: 292,
  /** 下部バーの内側の余白（上下それぞれ） */
  barPadding: 8,
  /** 盤面が潰れないための最小の高さ */
  boardMinHeight: 160,

  /** キャラカードの内側の余白（上下それぞれ） */
  cardPadding: 6,
  /** キャラカードの枠線（上下合わせて） */
  cardBorder: 2,
  /** カード内の行どうしの隙間 */
  cardRowGap: 4,

  /** 1行目: 名前＋属性・役割チップ（タップ対象ではないので低くてよい） */
  rowNameHeight: 30,
  /** 2行目: 状態表示＋簡易ステータス */
  rowStateHeight: 26,
  /** 3行目: 操作ボタン（タップ領域） */
  rowActionHeight: 44,

  /** 編成状況＋「3 / 8」の1行 */
  summaryHeight: 22,
  /** ヒントの1行 */
  hintHeight: 20,
} as const;

/** キャラカード1枚の高さ（名前 / 状態＋ステータス / 操作 の3行） */
export function teamCardHeight(): number {
  const rows =
    LAYOUT.rowNameHeight + LAYOUT.rowStateHeight + LAYOUT.rowActionHeight + LAYOUT.cardRowGap * 2;
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

/** 盤面に残る高さ */
export function boardHeight(viewportHeight: number): number {
  return (
    viewportHeight -
    LAYOUT.appPadding * 2 -
    LAYOUT.headerHeight -
    barHeight(viewportHeight) -
    LAYOUT.appGap * 2
  );
}

/** テストで確かめる想定の画面高さ */
export const TEST_VIEWPORT_HEIGHTS = [667, 736, 812, 932] as const;
