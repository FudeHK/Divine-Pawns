/**
 * @vitest-environment jsdom
 *
 * 検証用画面の描画テスト。
 * - 盤面アイコンに shortName が出ること
 * - 同じ種類の敵が複数いる時に通し番号が付くこと
 * - アイコンのタップで詳細パネルが開き、再生中は一時停止／閉じると再開すること
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTERS } from '../src/data/characters';
import { getEncounter } from '../src/data/encounters';
import { getEnemy } from '../src/data/enemies';

function app(): HTMLElement {
  return document.getElementById('app')!;
}

function texts(sel: string): string[] {
  return [...app().querySelectorAll(sel)].map((n) => n.textContent ?? '');
}

function boardTexts(): string[] {
  return [...app().querySelectorAll('svg.board text')].map((n) => n.textContent ?? '');
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...app().querySelectorAll('button')].find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
}

function detailPanel(): HTMLElement | null {
  return app().querySelector('.detail');
}

function detailTitle(): string {
  return detailPanel()?.querySelector('.detail-title')?.textContent ?? '';
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
  // 再生ループ（requestAnimationFrame）は止めておく。再生位置は操作で直接確かめる
  vi.stubGlobal('requestAnimationFrame', () => 0);
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/ui/main');
});

describe('検証用画面', () => {
  it('準備中の盤面に、味方と敵の shortName が出る', async () => {
    const labels = boardTexts();
    // 初期編成の前衛3体
    for (const id of ['GRE_A', 'NOR_A', 'GRE_B']) {
      const c = CHARACTERS.find((x) => x.id === id)!;
      expect(labels, id).toContain(c.shortName);
    }
    // 初期遭遇 E1 の敵
    for (const eu of getEncounter('E1').units) {
      expect(labels, eu.enemyId).toContain(getEnemy(eu.enemyId).shortName);
    }
    // ID そのままの表示は残っていない
    expect(labels).not.toContain('GRE');
  });

  it('同じ種類の敵が複数いる遭遇では、アイコンに通し番号が付く', async () => {
    // E2 は「朽ちた兵士」が2体
    findButton('E2')!.click();
    const enc = getEncounter('E2');
    const soldiers = enc.units.filter((u) => u.enemyId === 'en_soldier');
    expect(soldiers.length).toBe(2);

    const short = getEnemy('en_soldier').shortName;
    const tokens = [...app().querySelectorAll('svg.board g')].filter((g) =>
      [...g.querySelectorAll('text')].some((t) => t.textContent === short),
    );
    expect(tokens.length).toBe(2);
    const nums = tokens.map(
      (g) => [...g.querySelectorAll('text')].map((t) => t.textContent).filter((t) => t !== short)[0],
    );
    expect(nums.sort()).toEqual(['1', '2']);

    // 1体しかいない敵には番号が付かない
    const archer = getEnemy('en_archer').shortName;
    const archerToken = findToken(archer)!;
    const archerTexts = [...archerToken.querySelectorAll('text')].map((t) => t.textContent);
    expect(archerTexts).toEqual([archer]);
  });

  it('準備中：味方アイコンのタップで詳細パネルが開く', async () => {
    expect(detailPanel()).toBeNull();
    tap(findToken('青銅の')!);

    const panel = detailPanel();
    expect(panel).not.toBeNull();
    expect(detailTitle()).toContain('青銅の');

    const body = panel!.textContent ?? '';
    for (const key of ['HP', '攻撃力', '防御', '攻撃速度', '射程', 'マナ', '装備']) {
      expect(body, key).toContain(key);
    }
    expect(body).toContain('タンク');
    expect(body).toContain('氷');
    expect(body).toContain('ギリシャ');
    expect(body).toContain('★1');

    // スキルは3行（アクティブ・パッシブ・サポート効果）
    const skills = [...panel!.querySelectorAll('.skill')];
    expect(skills.length).toBe(3);
    expect(texts('.skill-label')).toEqual(['アクティブ', 'パッシブ', 'サポート効果']);
    const skillTexts = texts('.skill-text');
    expect(skillTexts[0]).toBe('周囲の敵を凍傷にし、自分に挑発');
    for (const s of skillTexts) expect(s.length).toBeLessThanOrEqual(30);

    // 閉じられる
    findButton('✕ 閉じる')!.click();
    expect(detailPanel()).toBeNull();
  });

  it('準備中：敵アイコンのタップでも詳細パネルが開く', async () => {
    tap(findToken(getEnemy('en_bulwark').shortName)!);
    expect(detailTitle()).toContain('石塊の');
    const body = detailPanel()!.textContent ?? '';
    expect(body).toContain('タンク');
    expect(body).toContain('周囲を殴りつけ、自分に挑発');
  });


  it('キャラを選んでいる間は、アイコンのタップは配置になる（詳細は開かない）', () => {
    // キャラ一覧の名前をタップして選択状態にする
    const nameEl = [...app().querySelectorAll('.char-name')].find((n) =>
      (n.textContent ?? '').startsWith('霜の'),
    )!;
    tap(nameEl);
    // 未編成のキャラは盤面にいないので、配置済みアイコンをタップして置き換える
    tap(findToken('青銅の')!);
    expect(detailPanel()).toBeNull();
    expect(findToken('霜の')).toBeTruthy();
  });
  it('再生中：アイコンをタップすると一時停止し、閉じると再開する', async () => {
    findButton('▶ 戦闘開始')!.click();
    // 再生中は「⏸ 一時停止」ボタンが出ている
    expect(findButton('⏸ 一時停止')).toBeTruthy();

    tap(findToken('青銅の')!);
    expect(detailPanel()).not.toBeNull();
    // 一時停止された
    expect(findButton('▶ 再生')).toBeTruthy();
    expect(findButton('⏸ 一時停止')).toBeFalsy();

    // 戦闘中はデバフ欄も出る
    expect(detailPanel()!.textContent).toContain('デバフ');

    findButton('✕ 閉じる')!.click();
    expect(detailPanel()).toBeNull();
    // 再開した
    expect(findButton('⏸ 一時停止')).toBeTruthy();
  });

  it('再生中：一時停止中に開いて閉じても、再生は始まらない', async () => {
    findButton('▶ 戦闘開始')!.click();
    findButton('⏸ 一時停止')!.click();
    expect(findButton('▶ 再生')).toBeTruthy();

    tap(findToken('青銅の')!);
    findButton('✕ 閉じる')!.click();
    expect(findButton('▶ 再生')).toBeTruthy();
  });

  it('再生中：敵アイコンのタップでも詳細が開く', async () => {
    findButton('▶ 戦闘開始')!.click();
    tap(findToken(getEnemy('en_bulwark').shortName)!);
    expect(detailTitle()).toContain('石塊の');
    expect(detailPanel()!.textContent).toContain('デバフ');
  });
});
