/**
 * @vitest-environment jsdom
 *
 * 検証用画面の描画テスト。
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

function findButton(label: string): HTMLButtonElement | undefined {
  return [...app().querySelectorAll('button')].find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
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

beforeEach(async () => {
  // 画面の状態は module スコープに持っているので、テストごとに読み込み直す
  vi.resetModules();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/ui/main');
});

describe('盤面アイコン', () => {
  it('準備中の盤面に、味方と敵の shortName が出る', () => {
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

    // 「霜呼びの」は4文字なので12pxに縮む（E4 に登場）
    findButton('E4')!.click();
    const four = findToken('霜呼びの')!;
    const fourLabel = [...four.querySelectorAll('text')].find((t) => t.textContent === '霜呼びの')!;
    expect(fourLabel.getAttribute('font-size')).toBe('12');
  });

  it('同じ種類の敵が複数いる遭遇では、アイコンに通し番号が付く', () => {
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
    const archerTexts = [...findToken(archer)!.querySelectorAll('text')].map((t) => t.textContent);
    expect(archerTexts).toEqual([archer]);
  });
});

describe('キャラ一覧の行', () => {
  it('名前は1回だけ、IDは別に表示される（全8キャラ）', () => {
    const cards = [...app().querySelectorAll('.char')];
    expect(cards.length).toBe(CHARACTERS.length);
    for (const c of CHARACTERS) {
      const card = cards.find((x) => x.querySelector('.char-name')?.textContent === c.name);
      expect(card, c.id).toBeTruthy();

      // 名前は .char-name にちょうど1回
      const nameEls = [...card!.querySelectorAll('.char-name')];
      expect(nameEls.length, c.id).toBe(1);
      expect(nameEls[0]!.textContent, c.id).toBe(c.name);

      // shortName と正式名が並んでいない
      expect(nameEls[0]!.textContent!.startsWith(c.shortName + ' '), c.id).toBe(false);

      // 行全体で名前の出現は1回だけ
      const whole = card!.textContent ?? '';
      expect(whole.split(c.name).length - 1, c.id).toBe(1);

      // ID は別の要素に
      const idEl = card!.querySelector('.char-id');
      expect(idEl?.textContent, c.id).toBe(c.id);
    }
  });

  it('装備ボタンには選択中の装備名（なければ「装備なし」）が出る', () => {
    const card = [...app().querySelectorAll('.char')].find(
      (x) => x.querySelector('.char-id')?.textContent === 'GRE_A',
    )!;
    const eqBtn = [...card.querySelectorAll('button')].find((b) => b.textContent === '装備なし');
    expect(eqBtn).toBeTruthy();

    eqBtn!.click();
    expect(sheetTitle()).toContain('装備');
    // シートから「力の腕輪（仮）」を選ぶ
    const item = [...app().querySelectorAll('.sheet-list-item')].find((n) =>
      (n.textContent ?? '').includes('力の腕輪'),
    ) as HTMLButtonElement;
    item.click();
    expect(sheet()).toBeNull();

    const card2 = [...app().querySelectorAll('.char')].find(
      (x) => x.querySelector('.char-id')?.textContent === 'GRE_A',
    )!;
    expect([...card2.querySelectorAll('button')].some((b) => b.textContent === '力の腕輪（仮）')).toBe(
      true,
    );
  });
});

describe('詳細シート', () => {
  it('味方アイコンのタップで開き、必要な項目がそろっている', () => {
    expect(sheet()).toBeNull();
    tap(findToken('青銅の')!);

    const panel = detailSheet()!;
    expect(panel).toBeTruthy();
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

    const labels = [...panel.querySelectorAll('.skill-label')].map((n) => n.textContent);
    expect(labels).toEqual(['装備', 'チーム全体', 'アクティブ', 'パッシブ', 'サポート効果']);

    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('スキルの［説明］ボタンで小さなポップアップが開き、倍率は書かれていない', () => {
    tap(findToken('青銅の')!);
    const active = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();

    const text = [...app().querySelectorAll('.sheet-text')].map((n) => n.textContent).join('\n');
    expect(text).toBe('周囲の敵を凍傷にし、自分に挑発');
    expect(text).not.toMatch(/[0-9０-９]|％|%|×/);

    // 閉じると詳細シートに戻る
    closeSheet();
    expect(detailSheet()).toBeTruthy();
  });

  it('背景タップと Escape でも閉じられる', () => {
    tap(findToken('青銅の')!);
    tap(app().querySelector('.sheet-backdrop')!);
    expect(sheet()).toBeNull();

    tap(findToken('青銅の')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet()).toBeNull();
  });

  it('敵アイコンのタップでも開く', () => {
    tap(findToken(getEnemy('en_bulwark').shortName)!);
    expect(sheetTitle()).toContain('石塊の壁');
    expect(detailSheet()!.textContent).toContain('タンク');
  });
});

describe('再生の一時停止と再開', () => {
  it('シートを開くと一時停止し、閉じると再開する', () => {
    findButton('▶ 戦闘開始')!.click();
    expect(findButton('⏸ 一時停止')).toBeTruthy();

    tap(findToken('青銅の')!);
    expect(detailSheet()).toBeTruthy();
    expect(findButton('▶ 再生')).toBeTruthy();
    expect(detailSheet()!.textContent).toContain('デバフ');

    closeSheet();
    expect(sheet()).toBeNull();
    expect(findButton('⏸ 一時停止')).toBeTruthy();
  });

  it('一時停止中に開いて閉じても、再生は始まらない', () => {
    findButton('▶ 戦闘開始')!.click();
    findButton('⏸ 一時停止')!.click();
    tap(findToken('青銅の')!);
    closeSheet();
    expect(findButton('▶ 再生')).toBeTruthy();
  });
});

describe('画面下部の固定バー', () => {
  it('準備中は開始ボタン、再生中は倍速とスキップが並ぶ', () => {
    const bar = () => app().querySelector('.bottom-bar')!;
    expect(bar().textContent).toContain('戦闘開始');

    findButton('▶ 戦闘開始')!.click();
    const t = bar().textContent ?? '';
    for (const s of ['1倍', '2倍', '4倍', 'スキップ']) expect(t).toContain(s);
  });
});

describe('キャラを選んでいる間の配置', () => {
  it('アイコンのタップは配置になり、詳細は開かない', () => {
    const nameEl = [...app().querySelectorAll('.char-name')].find(
      (n) => n.textContent === '霜の語り部（仮）',
    )!;
    tap(nameEl);
    tap(findToken('青銅の')!);
    expect(sheet()).toBeNull();
    expect(findToken('霜の')).toBeTruthy();
  });
});

describe('加護の表示', () => {
  it('準備画面に加護セクションがあり、全加護が 名前・1行の説明・レア度 で並ぶ', () => {
    const rows = [...app().querySelectorAll('.blessing-row')];
    expect(rows.length).toBe(BLESSINGS.length);
    for (const b of BLESSINGS) {
      const row = rows.find((r) => r.querySelector('.blessing-name')?.textContent === b.name);
      expect(row, b.id).toBeTruthy();
      expect(row!.querySelector('.blessing-desc')?.textContent, b.id).toBe(b.desc);
      expect(row!.querySelector('.tag')?.textContent, b.id).toBeTruthy();
      expect(row!.querySelector('.tag')!.className, b.id).toContain(`rarity-${b.rarity}`);
      expect([...row!.querySelectorAll('button')].some((x) => x.textContent === '説明'), b.id).toBe(
        true,
      );
    }
  });

  it('加護の［説明］で summary がポップアップに出る', () => {
    const row = [...app().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
    )!;
    ([...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement).click();
    expect(sheetTitle()).toBe('嵐の加護');
    const text = [...app().querySelectorAll('.sheet-text')].map((n) => n.textContent).join('\n');
    expect(text).toBe(getBlessing('bl_storm').summary);
  });

  it('詳細シートの一覧に「チーム全体」があり、開くと加護がすべて並ぶ', () => {
    // 加護を2つ所持させる
    for (const id of ['bl_storm', 'bl_inferno']) {
      const row = [...app().querySelectorAll('.blessing-row')].find(
        (r) => r.querySelector('.blessing-name')?.textContent === getBlessing(id).name,
      )!;
      ([...row.querySelectorAll('button')].find((b) => b.textContent === '入手') as HTMLButtonElement).click();
    }

    tap(findToken('青銅の')!);
    const labels = [...detailSheet()!.querySelectorAll('.skill-label')].map((n) => n.textContent);
    expect(labels).toContain('チーム全体');

    const teamRow = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'チーム全体',
    )!;
    (teamRow.querySelector('button') as HTMLButtonElement).click();

    expect(sheetTitle()).toBe('チーム全体の加護');
    const names = [...app().querySelectorAll('.sheet .blessing-name')].map((n) => n.textContent);
    expect(names.sort()).toEqual([getBlessing('bl_inferno').name, getBlessing('bl_storm').name].sort());
  });
});

describe('ポップアップの階層', () => {
  function openTeamSheet(): void {
    const row = [...app().querySelectorAll('.blessing-row')].find(
      (r) => r.querySelector('.blessing-name')?.textContent === '嵐の加護',
    )!;
    ([...row.querySelectorAll('button')].find((b) => b.textContent === '入手') as HTMLButtonElement).click();
    tap(findToken('青銅の')!);
    const teamRow = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'チーム全体',
    )!;
    (teamRow.querySelector('button') as HTMLButtonElement).click();
  }

  it('詳細シート → スキル説明 と閉じると1つ上に戻る', () => {
    tap(findToken('青銅の')!);
    expect(detailSheet()).toBeTruthy();
    const active = [...detailSheet()!.querySelectorAll('.skill')].find(
      (s) => s.querySelector('.skill-label')?.textContent === 'アクティブ',
    )!;
    (active.querySelector('button') as HTMLButtonElement).click();
    expect(sheetTitle()).toContain('アクティブ');

    closeSheet();
    expect(detailSheet()).toBeTruthy(); // 詳細に戻る
    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('詳細シート → 加護一覧 → 加護説明 と3段重なり、閉じるたびに1つ上に戻る', () => {
    openTeamSheet();
    expect(sheetTitle()).toBe('チーム全体の加護');

    const row = [...app().querySelectorAll('.sheet .blessing-row')][0]!;
    ([...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement).click();
    expect(sheetTitle()).toBe('嵐の加護');

    closeSheet();
    expect(sheetTitle()).toBe('チーム全体の加護');
    closeSheet();
    expect(detailSheet()).toBeTruthy();
    closeSheet();
    expect(sheet()).toBeNull();
  });

  it('背景タップと Escape でも1つ上の階層に戻る', () => {
    openTeamSheet();
    const row = [...app().querySelectorAll('.sheet .blessing-row')][0]!;
    ([...row.querySelectorAll('button')].find((b) => b.textContent === '説明') as HTMLButtonElement).click();
    expect(sheetTitle()).toBe('嵐の加護');

    tap(app().querySelector('.sheet-backdrop')!);
    expect(sheetTitle()).toBe('チーム全体の加護');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(detailSheet()).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet()).toBeNull();
  });
});
