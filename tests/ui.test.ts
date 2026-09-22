/**
 * @vitest-environment jsdom
 *
 * 画面の描画テスト。
 * 上＝盤面、下＝タブ付きの操作バー（編成 / 加護 / ラン / 操作）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BLESSINGS, getBlessing } from '../src/data/blessings';
import { CHARACTERS } from '../src/data/characters';
import { getEncounter } from '../src/data/encounters';
import { getEnemy } from '../src/data/enemies';

type TabId = 'team' | 'blessing' | 'run' | 'control';

function app(): HTMLElement {
  return document.getElementById('app')!;
}

function boardTexts(): string[] {
  return [...app().querySelectorAll('svg.board text')].map((n) => n.textContent ?? '');
}

function buttons(): HTMLButtonElement[] {
  return [...app().querySelectorAll('button')] as HTMLButtonElement[];
}

function findButton(label: string): HTMLButtonElement | undefined {
  return buttons().find((b) => b.textContent === label);
}

function tabButton(id: TabId): HTMLButtonElement {
  return app().querySelector(`.tab-row button[data-tab="${id}"]`) as HTMLButtonElement;
}

function openTab(id: TabId): void {
  tabButton(id).click();
}

function tabBody(): HTMLElement {
  return app().querySelector('.tab-body')!;
}

/** スタックされたシート（DOM順＝下から上） */
function sheets(): HTMLElement[] {
  return [...app().querySelectorAll('.sheet')] as HTMLElement[];
}

function topSheet(): HTMLElement | null {
  const all = sheets();
  return all.length > 0 ? all[all.length - 1]! : null;
}

function topTitle(): string {
  return topSheet()?.querySelector('.sheet-title')?.textContent ?? '';
}

function closeTop(): void {
  const closers = [...app().querySelectorAll('.sheet-close')] as HTMLButtonElement[];
  closers[closers.length - 1]!.click();
}

function topBackdrop(): HTMLElement {
  const all = [...app().querySelectorAll('.sheet-backdrop')] as HTMLElement[];
  return all[all.length - 1]!;
}

function findToken(short: string): SVGGElement | undefined {
  return [...app().querySelectorAll('svg.board g')].find((g) =>
    [...g.querySelectorAll('text')].some((t) => t.textContent === short),
  ) as SVGGElement | undefined;
}

function tap(node: Element): void {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// --- 「編成」タブのカード操作 ---

function card(): HTMLElement {
  openTab('team');
  return app().querySelector('.char')!;
}

function cardId(): string {
  return card().querySelector('.char-id')?.textContent ?? '';
}

function cardButton(startsWith: string): HTMLButtonElement {
  return [...card().querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').startsWith(startsWith),
  ) as HTMLButtonElement;
}

function next(): void {
  (app().querySelector('.pager-next') as HTMLButtonElement).click();
}

function prev(): void {
  (app().querySelector('.pager-prev') as HTMLButtonElement).click();
}

function pageTo(charId: string): void {
  openTab('team');
  for (let i = 0; i < CHARACTERS.length; i++) {
    if (cardId() === charId) return;
    next();
  }
  throw new Error(`カードが見つからない: ${charId}`);
}

function setStar(star: number): void {
  const sel = card().querySelector('select') as HTMLSelectElement;
  sel.value = String(star);
  sel.dispatchEvent(new Event('change'));
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/ui/main');
});

// ---------------------------------------------------------------------------

describe('画面構成', () => {
  it('盤面と下部バーが常に同時にある', () => {
    expect(app().querySelector('.board-area svg.board')).toBeTruthy();
    expect(app().querySelector('.bottom-bar')).toBeTruthy();
  });

  it('タブは 編成・加護・ラン・操作 の4つ', () => {
    expect([...app().querySelectorAll('.tab-row button')].map((b) => b.textContent)).toEqual([
      '編成',
      '加護',
      'ラン',
      '操作',
    ]);
  });

  it('タブを切り替えると中身が入れ替わる', () => {
    openTab('team');
    expect(tabBody().querySelector('.char-pager')).toBeTruthy();
    openTab('blessing');
    expect(tabBody().querySelector('.blessing-row')).toBeTruthy();
    expect(tabBody().querySelector('.char-pager')).toBeNull();
    openTab('run');
    expect(tabBody().textContent).toContain('ラン');
    expect(tabBody().querySelector('.blessing-row')).toBeNull();
    openTab('control');
    expect(tabBody().querySelector("input[type='text']")).toBeTruthy();
    expect(findButton('1倍')).toBeTruthy();
  });

  it('実行ボタンはどのタブでも見える', () => {
    for (const t of ['team', 'blessing', 'run', 'control'] as TabId[]) {
      openTab(t);
      expect(app().querySelector('.action-row')!.textContent, t).toContain('戦闘');
    }
  });
});

// ---------------------------------------------------------------------------
// A2 1体ずつのカード表示
// ---------------------------------------------------------------------------

describe('A2 キャラを1体ずつ表示する', () => {
  it('カードは常に1枚だけ', () => {
    openTab('team');
    expect(app().querySelectorAll('.char').length).toBe(1);
  });

  it('前へ／次へで全キャラを順送りできる', () => {
    openTab('team');
    const seen: string[] = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      seen.push(cardId());
      next();
    }
    expect(new Set(seen).size).toBe(CHARACTERS.length);
    // 一周して戻る
    expect(cardId()).toBe(seen[0]);
    prev();
    expect(cardId()).toBe(seen[CHARACTERS.length - 1]);
  });

  it('「3 / 8」のような現在位置の表示がある', () => {
    openTab('team');
    expect(app().querySelector('.char-page-indicator')!.textContent).toBe(`1 / ${CHARACTERS.length}`);
    next();
    next();
    expect(app().querySelector('.char-page-indicator')!.textContent).toBe(`3 / ${CHARACTERS.length}`);
  });

  it('カードに必要な要素がそろっている', () => {
    openTab('team');
    const c = card();
    expect(c.querySelector('.char-name')?.textContent).toBeTruthy();
    expect(c.querySelector('.char-id')?.textContent).toBeTruthy();
    expect(c.querySelector('select')).toBeTruthy();
    expect(c.querySelector('.char-slot-state')).toBeTruthy();
    expect(c.querySelectorAll('.char-quick .quick-cell').length).toBe(4);
    expect(c.querySelectorAll('.skill-icon').length).toBe(3);
    expect(c.querySelectorAll('.equip-chip').length).toBeGreaterThan(0);
    const labels = [...c.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('前衛');
    expect(labels).toContain('サポート');
    expect(labels).toContain('詳細');
    // 名前は1回だけ
    const name = c.querySelector('.char-name')!.textContent!;
    expect((c.textContent ?? '').split(name).length - 1).toBe(1);
  });

  it('編成状況はページを送っても出ている', () => {
    openTab('team');
    for (let i = 0; i < 3; i++) {
      expect(tabBody().querySelector('.team-summary')!.textContent).toMatch(/前衛 \d+\/\d+/);
      next();
    }
  });

  it('前衛・サポート・未配置が状態表示に出る', () => {
    pageTo('GRE_A');
    expect(card().querySelector('.char-slot-state')!.textContent).toContain('前衛');
    pageTo('JPN_B');
    expect(card().querySelector('.char-slot-state')!.textContent).toContain(
      'サポート配置中（盤面には配置されません）',
    );
    pageTo('EGY_B');
    expect(card().querySelector('.char-slot-state')!.textContent).toBe('未配置');
  });
});

// ---------------------------------------------------------------------------
// A3 盤面ハイライト
// ---------------------------------------------------------------------------

describe('A3 表示中キャラの盤面ハイライト', () => {
  const FOCUS = '#ff7ae0';

  function focusRing(): Element | null {
    return app().querySelector('svg.board .focus-ring');
  }

  function focusedToken(): Element | null {
    return app().querySelector('svg.board g.focused');
  }

  it('前衛のカードを出すと、そのマスがハイライトされる', () => {
    pageTo('GRE_A');
    const ring = focusRing();
    expect(ring).toBeTruthy();
    expect(ring!.getAttribute('stroke')).toBe(FOCUS);
    const token = focusedToken();
    expect(token).toBeTruthy();
    expect([...token!.querySelectorAll('text')].some((t) => t.textContent === '青銅の')).toBe(true);
  });

  it('ページ送りでハイライト対象が切り替わる', () => {
    pageTo('GRE_A');
    expect(
      [...focusedToken()!.querySelectorAll('text')].some((t) => t.textContent === '青銅の'),
    ).toBe(true);
    pageTo('NOR_A');
    expect(
      [...focusedToken()!.querySelectorAll('text')].some((t) => t.textContent === '灼炎の'),
    ).toBe(true);
  });

  it('サポート枠・未配置ではハイライトしない（カードに状態を出す）', () => {
    pageTo('JPN_B');
    expect(focusRing()).toBeNull();
    expect(focusedToken()).toBeNull();
    expect(card().querySelector('.char-slot-state')!.textContent).toContain('サポート');

    pageTo('EGY_B');
    expect(focusRing()).toBeNull();
    expect(card().querySelector('.char-slot-state')!.textContent).toBe('未配置');
  });

  it('戦闘の色（味方の青・敵の赤）とは別の色を使う', () => {
    pageTo('GRE_A');
    expect(focusRing()!.getAttribute('stroke')).not.toBe('#4aa3ff');
    expect(focusRing()!.getAttribute('stroke')).not.toBe('#ff6b6b');
  });
});

// ---------------------------------------------------------------------------
// A1 ポップアップの重ね表示
// ---------------------------------------------------------------------------

describe('A1 ポップアップは重ねて開く', () => {
  function openDetail(): void {
    pageTo('GRE_A');
    cardButton('詳細').click();
  }

  it('キャラ詳細 → スキル説明 が重なり、閉じると1段階戻る', () => {
    openDetail();
    expect(sheets()).toHaveLength(1);
    expect(topTitle()).toBe('青銅の守り手（仮）');

    const active = [...topSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();

    // 下のシートが消えずに残っている（重ね表示）
    expect(sheets()).toHaveLength(2);
    expect(sheets()[0]!.classList.contains('detail')).toBe(true);
    expect(topTitle()).toContain('アクティブ');

    closeTop();
    expect(sheets()).toHaveLength(1);
    expect(topSheet()!.classList.contains('detail')).toBe(true);
    closeTop();
    expect(sheets()).toHaveLength(0);
  });

  it('キャラ詳細 → 装備詳細 も同じように重なる', () => {
    pageTo('GRE_A');
    // 装備を1つ着ける
    (card().querySelector('.equip-chip') as HTMLButtonElement).click();
    (
      [...app().querySelectorAll('.sheet-list-item')].find((n) =>
        (n.textContent ?? '').includes('力の腕輪'),
      ) as HTMLButtonElement
    ).click();

    cardButton('詳細').click();
    const equipRow = [...topSheet()!.querySelectorAll('.equip-row')].find((r) =>
      (r.querySelector('.equip-name')?.textContent ?? '').includes('力の腕輪'),
    )!;
    (equipRow.querySelector('button') as HTMLButtonElement).click();

    expect(sheets()).toHaveLength(2);
    expect(topTitle()).toBe('力の腕輪（仮）');
    closeTop();
    expect(sheets()).toHaveLength(1);
    expect(topSheet()!.classList.contains('detail')).toBe(true);
  });

  it('加護一覧 → 加護詳細 も同じ機構で重なる', () => {
    openTab('blessing');
    const row = [...tabBody().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
    )!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '入手') as HTMLButtonElement
    ).click();

    openDetail();
    const teamRow = [...topSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'チーム全体',
    )!;
    (teamRow.querySelector('button') as HTMLButtonElement).click();
    expect(sheets()).toHaveLength(2);
    expect(topTitle()).toBe('チーム全体の加護');

    const b = [...app().querySelectorAll('.sheet .blessing-row')][0]!;
    (
      [...b.querySelectorAll('button')].find((x) => x.textContent === '説明') as HTMLButtonElement
    ).click();
    expect(sheets()).toHaveLength(3);
    expect(topTitle()).toBe('嵐の加護');

    closeTop();
    expect(topTitle()).toBe('チーム全体の加護');
    closeTop();
    expect(topSheet()!.classList.contains('detail')).toBe(true);
    closeTop();
    expect(sheets()).toHaveLength(0);
  });

  it('背面のシートは操作できない（最前面だけ操作できる）', () => {
    openDetail();
    const active = [...topSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();

    const all = sheets();
    expect(all[0]!.classList.contains('behind')).toBe(true);
    expect(all[1]!.classList.contains('behind')).toBe(false);
    // 背面の閉じるボタンは押せない
    const closers = [...app().querySelectorAll('.sheet-close')] as HTMLButtonElement[];
    expect(closers[0]!.disabled).toBe(true);
    expect(closers[1]!.disabled).toBe(false);
    // 重なり順も前面が上
    expect(Number(all[1]!.style.zIndex)).toBeGreaterThan(Number(all[0]!.style.zIndex));
  });

  it('背景タップと Escape でも1段階だけ戻る', () => {
    openDetail();
    const active = [...topSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();
    expect(sheets()).toHaveLength(2);

    tap(topBackdrop());
    expect(sheets()).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheets()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 盤面・装備スロット（既存機能の維持）
// ---------------------------------------------------------------------------

describe('盤面アイコン', () => {
  it('味方と敵の shortName が出る', () => {
    const labels = boardTexts();
    for (const id of ['GRE_A', 'NOR_A', 'GRE_B']) {
      expect(labels, id).toContain(CHARACTERS.find((x) => x.id === id)!.shortName);
    }
    for (const eu of getEncounter('E1').units) {
      expect(labels, eu.enemyId).toContain(getEnemy(eu.enemyId).shortName);
    }
  });

  it('同じ種類の敵が複数いる遭遇では通し番号が付く', () => {
    openTab('control');
    findButton('E2')!.click();
    const short = getEnemy('en_soldier').shortName;
    const tokens = [...app().querySelectorAll('svg.board g')].filter((g) =>
      [...g.querySelectorAll('text')].some((t) => t.textContent === short),
    );
    expect(tokens.length).toBe(2);
  });

  it('前衛カードの「配置」から盤面のマスに置ける', () => {
    pageTo('GRE_A');
    cardButton('配置').click();
    expect(card().className).toContain('selected');
    const cells = [...app().querySelectorAll('svg.board polygon')].filter(
      (p) => p.getAttribute('style') === 'cursor:pointer',
    );
    tap(cells[cells.length - 1]!);
    expect(sheets()).toHaveLength(0);
    expect(card().className).not.toContain('selected');
    expect(findToken('青銅の')).toBeTruthy();
  });
});

describe('装備スロット（★の数と同じ）', () => {
  it('★1・★2・★3 でスロットが 1・2・3 になる', () => {
    pageTo('GRE_A');
    for (const [star, n] of [
      [1, 1],
      [2, 2],
      [3, 3],
    ] as const) {
      setStar(star);
      expect(card().querySelectorAll('.equip-chip').length, `★${star}`).toBe(n);
      (card().querySelector('.equip-chip') as HTMLButtonElement).click();
      expect(app().querySelectorAll('.equip-slot').length, `★${star}`).toBe(n);
      closeTop();
    }
  });

  it('★が上がっても既存の装備は残り、増えたスロットに追加できる', () => {
    pageTo('GRE_A');
    setStar(1);
    (card().querySelector('.equip-chip') as HTMLButtonElement).click();
    (
      [...app().querySelectorAll('.sheet-list-item')].find((n) =>
        (n.textContent ?? '').includes('力の腕輪'),
      ) as HTMLButtonElement
    ).click();

    setStar(2);
    (card().querySelector('.equip-chip') as HTMLButtonElement).click();
    expect([...app().querySelectorAll('.equip-slot')].map((b) => b.textContent)).toEqual([
      '1. 力の腕輪（仮）',
      '2. 装備なし',
    ]);
    (app().querySelectorAll('.equip-slot')[1] as HTMLButtonElement).click();
    (
      [...app().querySelectorAll('.sheet-list-item')].find((n) =>
        (n.textContent ?? '').includes('堅牢の胸当て'),
      ) as HTMLButtonElement
    ).click();

    (card().querySelector('.equip-chip') as HTMLButtonElement).click();
    expect([...app().querySelectorAll('.equip-slot')].map((b) => b.textContent)).toEqual([
      '1. 力の腕輪（仮）',
      '2. 堅牢の胸当て（仮）',
    ]);
  });
});

describe('「加護」タブ', () => {
  it('全加護が 名前・レア度・1行説明・［説明］ で並ぶ', () => {
    openTab('blessing');
    const rows = [...tabBody().querySelectorAll('.blessing-row')];
    expect(rows.length).toBe(BLESSINGS.length);
    for (const b of BLESSINGS) {
      const row = rows.find((r) => r.querySelector('.blessing-name')?.textContent === b.name)!;
      expect(row.querySelector('.blessing-desc')?.textContent, b.id).toBe(b.desc);
      expect(row.querySelector('.tag')!.className, b.id).toContain(`rarity-${b.rarity}`);
      expect(
        [...row.querySelectorAll('button')].map((x) => x.textContent),
        b.id,
      ).toContain('説明');
    }
  });

  it('［説明］で summary がポップアップに出る', () => {
    openTab('blessing');
    const row = [...tabBody().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
    )!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement
    ).click();
    expect(topTitle()).toBe('嵐の加護');
    expect([...app().querySelectorAll('.sheet-text')].map((n) => n.textContent).join('\n')).toBe(
      getBlessing('bl_storm').summary,
    );
  });
});

// ---------------------------------------------------------------------------
// ラン進行（UI）
// ---------------------------------------------------------------------------

describe('「ラン」タブ', () => {
  function startRun(): void {
    openTab('run');
    findButton('▶ 新しいランを始める')!.click();
  }

  it('ランを始めると、状態と進行マップが出る', () => {
    startRun();
    expect(tabBody().querySelector('.run-status')!.textContent).toContain('1章');
    expect(tabBody().querySelector('.run-status')!.textContent).toContain('♥ 3');
    const nodes = [...tabBody().querySelectorAll('.run-node')].map((n) => n.textContent);
    expect(nodes).toEqual([
      '戦闘',
      'ショップ',
      'イベント',
      '戦闘',
      'ショップ',
      'イベント',
      '章ボス',
      'ボスショップ',
    ]);
    expect(tabBody().querySelector('.run-node.current')!.textContent).toBe('戦闘');
  });

  it('ラン中は編成が「所持キャラ1体」になる', () => {
    startRun();
    openTab('team');
    expect(app().querySelector('.char-page-indicator')!.textContent).toBe('1 / 1');
    expect(card().querySelector('.char-slot-state')!.textContent).toContain('前衛');
  });

  it('戦闘 → 結果を反映 → ショップへ進む', () => {
    startRun();
    findButton('▶ この戦闘に挑む')!.click();
    // スキップして決着まで進める
    openTab('control');
    findButton('⏭ スキップ')!.click();
    findButton('結果を反映して進む')!.click();

    openTab('run');
    expect(tabBody().querySelector('.run-node.current')!.textContent).toBe('ショップ');
    expect(tabBody().querySelectorAll('.shop-row').length).toBe(6);
    expect(findButton('次へ進む')).toBeTruthy();
  });

  it('ショップから次へ進むとイベントになり、2択が出る', () => {
    startRun();
    findButton('▶ この戦闘に挑む')!.click();
    openTab('control');
    findButton('⏭ スキップ')!.click();
    findButton('結果を反映して進む')!.click();
    openTab('run');
    findButton('次へ進む')!.click();

    expect(tabBody().querySelector('.run-node.current')!.textContent).toBe('イベント');
    expect(tabBody().querySelector('.event-title')).toBeTruthy();
    expect(tabBody().querySelectorAll('.shop-row').length).toBe(2);
    const choose = [...tabBody().querySelectorAll('button')].filter((b) => b.textContent === '選ぶ');
    expect(choose).toHaveLength(2);
    choose[0]!.click();
    expect(tabBody().querySelector('.run-node.current')!.textContent).toBe('戦闘');
  });

  it('オートセーブされ、読み込み直すと再開を聞かれる', async () => {
    startRun();
    expect(localStorage.getItem('divine-pawns.run.v1')).toBeTruthy();

    // タブを閉じて開き直した想定
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/main');
    expect(tabBody().textContent).toContain('保存されたランがあります');
    findButton('再開する')!.click();
    expect(tabBody().querySelector('.run-status')!.textContent).toContain('1章');
  });

  it('壊れた保存データは捨てて、新規から始められる', async () => {
    localStorage.setItem('divine-pawns.run.v1', '{壊れている');
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/main');
    openTab('run');
    expect(tabBody().textContent).not.toContain('保存されたランがあります');
    expect(findButton('▶ 新しいランを始める')).toBeTruthy();
  });
});

describe('戦闘再生中', () => {
  it('「編成」「加護」「ラン」タブが無効になり、「操作」だけ使える', () => {
    findButton('▶ 戦闘開始')!.click();
    expect(tabButton('team').disabled).toBe(true);
    expect(tabButton('blessing').disabled).toBe(true);
    expect(tabButton('run').disabled).toBe(true);
    expect(tabButton('control').disabled).toBe(false);
    expect(tabButton('control').className).toContain('on');
  });

  it('倍速とスキップは戦闘中も操作できる', () => {
    findButton('▶ 戦闘開始')!.click();
    findButton('4倍')!.click();
    expect(findButton('4倍')!.className).toContain('on');
    findButton('⏭ スキップ')!.click();
    expect(tabBody().textContent).toMatch(/勝利|敗北|引き分け|時間切れ/);
  });

  it('シートを開くと一時停止し、閉じると再開する', () => {
    findButton('▶ 戦闘開始')!.click();
    expect(findButton('⏸ 一時停止')).toBeTruthy();
    tap(findToken('青銅の')!);
    expect(findButton('▶ 再生')).toBeTruthy();
    closeTop();
    expect(findButton('⏸ 一時停止')).toBeTruthy();
  });
});
