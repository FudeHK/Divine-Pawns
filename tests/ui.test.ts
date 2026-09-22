/**
 * @vitest-environment jsdom
 *
 * 検証用画面の描画テスト。
 * 画面は「上＝盤面」「下＝タブ付きの操作バー」の2層。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BLESSINGS, getBlessing } from '../src/data/blessings';
import { CHARACTERS } from '../src/data/characters';
import { getEncounter } from '../src/data/encounters';
import { getEnemy } from '../src/data/enemies';

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

function tabButton(id: 'team' | 'blessing' | 'control'): HTMLButtonElement {
  return app().querySelector(`.tab-row button[data-tab="${id}"]`) as HTMLButtonElement;
}

function openTab(id: 'team' | 'blessing' | 'control'): void {
  tabButton(id).click();
}

function tabBody(): HTMLElement {
  return app().querySelector('.tab-body')!;
}

function sheet(): HTMLElement | null {
  return app().querySelector('.sheet');
}

function detailSheet(): HTMLElement | null {
  return app().querySelector('.sheet.detail');
}

function sheetTitle(): string {
  return sheet()?.querySelector('.sheet-title')?.textContent ?? '';
}

function closeSheet(): void {
  (app().querySelector('.sheet-close') as HTMLButtonElement).click();
}

/** 盤面のアイコン（<g>）を短い名前で探す */
function findToken(short: string): SVGGElement | undefined {
  return [...app().querySelectorAll('svg.board g')].find((g) =>
    [...g.querySelectorAll('text')].some((t) => t.textContent === short),
  ) as SVGGElement | undefined;
}

function tap(node: Element): void {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** 「編成」タブのカードを ID で引く */
function charCard(id: string): HTMLElement {
  openTab('team');
  return [...app().querySelectorAll('.char')].find(
    (x) => x.querySelector('.char-id')?.textContent === id,
  ) as HTMLElement;
}

function cardButton(id: string, startsWith: string): HTMLButtonElement {
  return [...charCard(id).querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').startsWith(startsWith),
  ) as HTMLButtonElement;
}

function setStar(id: string, star: number): void {
  const sel = charCard(id).querySelector('select') as HTMLSelectElement;
  sel.value = String(star);
  sel.dispatchEvent(new Event('change'));
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/ui/main');
});

// ---------------------------------------------------------------------------

describe('画面構成', () => {
  it('盤面と下部バーが常に同時にある', () => {
    expect(app().querySelector('.board-area svg.board')).toBeTruthy();
    expect(app().querySelector('.bottom-bar')).toBeTruthy();
    expect(app().querySelector('.tab-row')).toBeTruthy();
    expect(app().querySelector('.tab-body')).toBeTruthy();
  });

  it('タブは 編成・加護・操作 の3つ', () => {
    const labels = [...app().querySelectorAll('.tab-row button')].map((b) => b.textContent);
    expect(labels).toEqual(['編成', '加護', '操作']);
  });

  it('タブを切り替えると中身が入れ替わる', () => {
    openTab('team');
    expect(tabBody().querySelector('.char-list')).toBeTruthy();
    expect(tabBody().querySelector('.blessing-row')).toBeNull();

    openTab('blessing');
    expect(tabBody().querySelector('.blessing-row')).toBeTruthy();
    expect(tabBody().querySelector('.char-list')).toBeNull();

    openTab('control');
    expect(tabBody().querySelector("input[type='text']")).toBeTruthy();
    expect(findButton('1倍')).toBeTruthy();
    expect(tabBody().querySelector('.char-list')).toBeNull();
    expect(tabBody().querySelector('.blessing-row')).toBeNull();
  });

  it('戦闘開始ボタンはどのタブでも見える', () => {
    for (const t of ['team', 'blessing', 'control'] as const) {
      openTab(t);
      expect(app().querySelector('.action-row')!.textContent, t).toContain('戦闘開始');
    }
  });

  it('盤面はどのタブでも見える', () => {
    for (const t of ['team', 'blessing', 'control'] as const) {
      openTab(t);
      expect(app().querySelector('svg.board'), t).toBeTruthy();
    }
  });
});

describe('盤面アイコン', () => {
  it('味方と敵の shortName が出る', () => {
    const labels = boardTexts();
    for (const id of ['GRE_A', 'NOR_A', 'GRE_B']) {
      const c = CHARACTERS.find((x) => x.id === id)!;
      expect(labels, id).toContain(c.shortName);
    }
    for (const eu of getEncounter('E1').units) {
      expect(labels, eu.enemyId).toContain(getEnemy(eu.enemyId).shortName);
    }
    expect(labels).not.toContain('GRE');
  });

  it('表示名は14px太字（4文字のときだけ12pxに縮む）', () => {
    const token = findToken('青銅の')!;
    const label = [...token.querySelectorAll('text')].find((t) => t.textContent === '青銅の')!;
    expect(label.getAttribute('font-size')).toBe('14');
    expect(label.getAttribute('font-weight')).toBe('700');

    openTab('control');
    findButton('E4')!.click();
    const four = findToken('霜呼びの')!;
    const fourLabel = [...four.querySelectorAll('text')].find((t) => t.textContent === '霜呼びの')!;
    expect(fourLabel.getAttribute('font-size')).toBe('12');
  });

  it('同じ種類の敵が複数いる遭遇では、アイコンに通し番号が付く', () => {
    openTab('control');
    findButton('E2')!.click();
    const short = getEnemy('en_soldier').shortName;
    const tokens = [...app().querySelectorAll('svg.board g')].filter((g) =>
      [...g.querySelectorAll('text')].some((t) => t.textContent === short),
    );
    expect(tokens.length).toBe(2);
    const nums = tokens.map(
      (g) => [...g.querySelectorAll('text')].map((t) => t.textContent).filter((t) => t !== short)[0],
    );
    expect(nums.sort()).toEqual(['1', '2']);

    const archer = getEnemy('en_archer').shortName;
    expect([...findToken(archer)!.querySelectorAll('text')].map((t) => t.textContent)).toEqual([
      archer,
    ]);
  });
});

describe('「編成」タブのカード', () => {
  it('名前は1回だけ、IDは別に表示される（全8キャラ）', () => {
    openTab('team');
    const cards = [...app().querySelectorAll('.char')];
    expect(cards.length).toBe(CHARACTERS.length);
    for (const c of CHARACTERS) {
      const card = cards.find((x) => x.querySelector('.char-name')?.textContent === c.name);
      expect(card, c.id).toBeTruthy();
      expect([...card!.querySelectorAll('.char-name')].length, c.id).toBe(1);
      expect(card!.querySelector('.char-id')?.textContent, c.id).toBe(c.id);
      expect((card!.textContent ?? '').split(c.name).length - 1, c.id).toBe(1);
      expect(card!.querySelectorAll('.char-tags .tag').length, c.id).toBe(2);
      expect(card!.querySelector('select'), c.id).toBeTruthy();
      const labels = [...card!.querySelectorAll('button')].map((b) => b.textContent ?? '');
      expect(labels, c.id).toContain('前衛');
      expect(labels, c.id).toContain('サポート');
      expect(labels, c.id).toContain('詳細');
      expect(
        labels.some((l) => l.startsWith('装備 ')),
        c.id,
      ).toBe(true);
    }
  });

  it('横スクロールのリストに並ぶ', () => {
    openTab('team');
    expect(app().querySelector('.char-list')).toBeTruthy();
  });

  it('前衛・サポート・未編成をカードの枠で区別できる', () => {
    expect(charCard('GRE_A').className).toContain('slot-frontline');
    expect(charCard('JPN_B').className).toContain('slot-support');
    expect(charCard('EGY_B').className).toContain('slot-none');
  });

  it('前衛カードをタップすると配置モードに入り、マスをタップで置ける', () => {
    tap(charCard('GRE_A').querySelector('.char-name')!);
    expect(charCard('GRE_A').className).toContain('selected');

    const cells = [...app().querySelectorAll('svg.board polygon')].filter(
      (p) => p.getAttribute('style') === 'cursor:pointer',
    );
    expect(cells.length).toBeGreaterThan(0);
    tap(cells[cells.length - 1]!);

    expect(sheet()).toBeNull();
    expect(charCard('GRE_A').className).not.toContain('selected');
    expect(findToken('青銅の')).toBeTruthy();
  });

  it('配置モードでないときは、アイコンのタップで詳細が開く', () => {
    tap(findToken('青銅の')!);
    expect(detailSheet()).toBeTruthy();
  });
});

describe('装備スロット（★の数と同じ）', () => {
  it('★1・★2・★3 でスロットが 1・2・3 になる', () => {
    for (const [star, n] of [
      [1, 1],
      [2, 2],
      [3, 3],
    ] as const) {
      setStar('GRE_A', star);
      expect(cardButton('GRE_A', '装備').textContent).toBe(`装備 0/${n}`);
      cardButton('GRE_A', '装備').click();
      expect(app().querySelectorAll('.equip-slot').length, `★${star}`).toBe(n);
      closeSheet();
    }
  });

  it('★が上がっても既存の装備は残り、増えたスロットにだけ追加できる', () => {
    setStar('GRE_A', 1);
    cardButton('GRE_A', '装備').click();
    (
      [...app().querySelectorAll('.sheet-list-item')].find((n) =>
        (n.textContent ?? '').includes('力の腕輪'),
      ) as HTMLButtonElement
    ).click();
    expect(cardButton('GRE_A', '装備').textContent).toBe('装備 1/1');

    setStar('GRE_A', 2);
    expect(cardButton('GRE_A', '装備').textContent).toBe('装備 1/2');
    cardButton('GRE_A', '装備').click();
    const slots = [...app().querySelectorAll('.equip-slot')].map((b) => b.textContent);
    expect(slots).toEqual(['1. 力の腕輪（仮）', '2. 装備なし']);

    (app().querySelectorAll('.equip-slot')[1] as HTMLButtonElement).click();
    (
      [...app().querySelectorAll('.sheet-list-item')].find((n) =>
        (n.textContent ?? '').includes('堅牢の胸当て'),
      ) as HTMLButtonElement
    ).click();
    expect(cardButton('GRE_A', '装備').textContent).toBe('装備 2/2');

    cardButton('GRE_A', '装備').click();
    expect([...app().querySelectorAll('.equip-slot')].map((b) => b.textContent)).toEqual([
      '1. 力の腕輪（仮）',
      '2. 堅牢の胸当て（仮）',
    ]);
  });

  it('詳細シートの装備欄はスロット数ぶん並ぶ', () => {
    setStar('GRE_A', 3);
    tap(findToken('青銅の')!);
    expect([...detailSheet()!.querySelectorAll('.equip-label')].map((n) => n.textContent)).toEqual([
      '装備1',
      '装備2',
      '装備3',
    ]);
    expect([...detailSheet()!.querySelectorAll('.equip-name')].map((n) => n.textContent)).toEqual([
      '装備なし',
      '装備なし',
      '装備なし',
    ]);
  });
});

describe('詳細シート', () => {
  it('必要な項目がそろっている', () => {
    tap(findToken('青銅の')!);
    const panel = detailSheet()!;
    expect(sheetTitle()).toBe('青銅の守り手（仮）');
    expect(panel.querySelector('.char-id')!.textContent).toBe('GRE_A');

    const body = panel.textContent ?? '';
    for (const key of ['HP', '攻撃力', '防御', '攻撃速度', '射程', 'マナ', '装備']) {
      expect(body, key).toContain(key);
    }
    expect(body).toContain('タンク');
    expect(body).toContain('氷');
    expect(body).toContain('ギリシャ');
    expect(body).toContain('★1');

    expect([...panel.querySelectorAll('.skill-label')].map((n) => n.textContent)).toEqual([
      'チーム全体',
      'アクティブ',
      'パッシブ',
      'サポート効果',
    ]);

    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('スキルの［説明］で小さなポップアップが開き、倍率は書かれていない', () => {
    tap(findToken('青銅の')!);
    const active = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();
    const text = [...app().querySelectorAll('.sheet-text')].map((n) => n.textContent).join('\n');
    expect(text).toBe('周囲の敵を凍傷にし、自分に挑発');
    expect(text).not.toMatch(/[0-9０-９]|％|%|×/);
    closeSheet();
    expect(detailSheet()).toBeTruthy();
  });

  it('敵アイコンのタップでも開く', () => {
    tap(findToken(getEnemy('en_bulwark').shortName)!);
    expect(sheetTitle()).toContain('石塊の壁');
    expect(detailSheet()!.textContent).toContain('タンク');
  });
});

describe('「加護」タブ', () => {
  it('全加護が 名前・レア度・1行説明・［説明］ で並ぶ', () => {
    openTab('blessing');
    const rows = [...tabBody().querySelectorAll('.blessing-row')];
    expect(rows.length).toBe(BLESSINGS.length);
    for (const b of BLESSINGS) {
      const row = rows.find((r) => r.querySelector('.blessing-name')?.textContent === b.name)!;
      expect(row, b.id).toBeTruthy();
      expect(row.querySelector('.blessing-desc')?.textContent, b.id).toBe(b.desc);
      expect(row.querySelector('.tag')!.className, b.id).toContain(`rarity-${b.rarity}`);
      const labels = [...row.querySelectorAll('button')].map((x) => x.textContent);
      expect(labels, b.id).toContain('説明');
      expect(
        labels.some((l) => l === '入手' || l === '所持'),
        b.id,
      ).toBe(true);
    }
  });

  it('所持トグルが効く', () => {
    openTab('blessing');
    const row = (): Element =>
      [...tabBody().querySelectorAll('.blessing-row')].find(
        (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
      )!;
    (
      [...row().querySelectorAll('button')].find((b) => b.textContent === '入手') as HTMLButtonElement
    ).click();
    expect(row().className).toContain('owned');
    (
      [...row().querySelectorAll('button')].find((b) => b.textContent === '所持') as HTMLButtonElement
    ).click();
    expect(row().className).not.toContain('owned');
  });

  it('［説明］で summary がポップアップに出る', () => {
    openTab('blessing');
    const row = [...tabBody().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
    )!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement
    ).click();
    expect(sheetTitle()).toBe('嵐の加護');
    const text = [...app().querySelectorAll('.sheet-text')].map((n) => n.textContent).join('\n');
    expect(text).toBe(getBlessing('bl_storm').summary);
  });
});

describe('ポップアップの階層', () => {
  function own(id: string): void {
    openTab('blessing');
    const row = [...tabBody().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === getBlessing(id).name,
    )!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '入手') as HTMLButtonElement
    ).click();
  }

  function openTeamSheet(): void {
    tap(findToken('青銅の')!);
    const teamRow = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'チーム全体',
    )!;
    (teamRow.querySelector('button') as HTMLButtonElement).click();
  }

  it('詳細シートの「チーム全体」から所持中の加護が一覧できる', () => {
    own('bl_storm');
    own('bl_inferno');
    openTeamSheet();
    expect(sheetTitle()).toBe('チーム全体の加護');
    const names = [...app().querySelectorAll('.sheet .blessing-name')].map((n) => n.textContent);
    expect(names.sort()).toEqual(
      [getBlessing('bl_inferno').name, getBlessing('bl_storm').name].sort(),
    );
  });

  it('詳細 → スキル説明 と閉じると1つ上に戻る', () => {
    tap(findToken('青銅の')!);
    const active = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();
    expect(sheetTitle()).toContain('アクティブ');
    closeSheet();
    expect(detailSheet()).toBeTruthy();
    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('詳細 → 加護一覧 → 加護説明 の3段が、閉じるたびに1つ上に戻る', () => {
    own('bl_storm');
    openTeamSheet();
    expect(sheetTitle()).toBe('チーム全体の加護');

    const row = [...app().querySelectorAll('.sheet .blessing-row')][0]!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement
    ).click();
    expect(sheetTitle()).toBe('嵐の加護');

    closeSheet();
    expect(sheetTitle()).toBe('チーム全体の加護');
    closeSheet();
    expect(detailSheet()).toBeTruthy();
    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('背景タップと Escape でも1つ上の階層に戻る', () => {
    own('bl_storm');
    openTeamSheet();
    const row = [...app().querySelectorAll('.sheet .blessing-row')][0]!;
    (
      [...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement
    ).click();
    expect(sheetTitle()).toBe('嵐の加護');

    tap(app().querySelector('.sheet-backdrop')!);
    expect(sheetTitle()).toBe('チーム全体の加護');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(detailSheet()).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet()).toBeNull();
  });
});

describe('戦闘再生中', () => {
  function startBattle(): void {
    findButton('▶ 戦闘開始')!.click();
  }

  it('「編成」「加護」タブが無効になり、「操作」だけ使える', () => {
    startBattle();
    expect(tabButton('team').disabled).toBe(true);
    expect(tabButton('blessing').disabled).toBe(true);
    expect(tabButton('control').disabled).toBe(false);
    expect(tabButton('control').className).toContain('on');
  });

  it('倍速とスキップは戦闘中も操作できる', () => {
    startBattle();
    findButton('4倍')!.click();
    expect(findButton('4倍')!.className).toContain('on');
    const skip = findButton('⏭ スキップ')!;
    expect(skip.disabled).toBe(false);
    skip.click();
    expect(tabBody().textContent).toMatch(/勝利|敗北|引き分け|時間切れ/);
  });

  it('シートを開くと一時停止し、閉じると再開する', () => {
    startBattle();
    expect(findButton('⏸ 一時停止')).toBeTruthy();
    tap(findToken('青銅の')!);
    expect(detailSheet()).toBeTruthy();
    expect(findButton('▶ 再生')).toBeTruthy();
    expect(detailSheet()!.textContent).toContain('デバフ');
    closeSheet();
    expect(findButton('⏸ 一時停止')).toBeTruthy();
  });

  it('一時停止中に開いて閉じても、再生は始まらない', () => {
    startBattle();
    findButton('⏸ 一時停止')!.click();
    tap(findToken('青銅の')!);
    closeSheet();
    expect(findButton('▶ 再生')).toBeTruthy();
  });

  it('編成に戻るとタブが元に戻る', () => {
    startBattle();
    findButton('← 編成に戻る')!.click();
    expect(tabButton('team').disabled).toBe(false);
    expect(tabButton('team').className).toContain('on');
    expect(findButton('▶ 戦闘開始')).toBeTruthy();
  });
});
