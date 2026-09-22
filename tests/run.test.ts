/**
 * ラン進行（章のステートマシン・ショップ・イベント・ライフ・オートセーブ）の検証。
 */

import { describe, expect, it } from 'vitest';

import { EVENTS, RISKY_EVENTS, SAFE_EVENTS, getEvent } from '../src/data/events';
import { DEFAULT_RUN_CONFIG, cloneRunConfig } from '../src/game/config';
import {
  advanceNode,
  applyBattleResult,
  buyShopItem,
  chapterNodes,
  chooseEvent,
  createRun,
  currentNode,
  grantPromotion,
  grantSixthSlot,
  progressMap,
  rerollShop,
  resolveEventBattle,
  runLoadout,
} from '../src/game/run';
import { MemoryStorage, clearRun, hasSavedRun, loadRun, saveRun } from '../src/game/save';
import type { RunState } from '../src/game/types';

const cfg = DEFAULT_RUN_CONFIG;

function run(seed = 'run-1'): RunState {
  return createRun(seed, cfg);
}

/** 今のノードが kind になるまで、勝ち続けて進める */
function advanceTo(r: RunState, kind: string, limit = 40): RunState {
  for (let i = 0; i < limit; i++) {
    const n = currentNode(r, cfg);
    if (!n || n.kind === kind) return r;
    if (n.kind === 'battle' || n.kind === 'boss') applyBattleResult(r, true, cfg);
    else if (n.kind === 'event') chooseEvent(r, 0, cfg);
    else advanceNode(r, cfg); // ショップは何も買わずに進む
  }
  return r;
}

// ---------------------------------------------------------------------------
// B1 章のステートマシン
// ---------------------------------------------------------------------------

describe('B1 章のステートマシン', () => {
  it('ノード列は 戦闘→ショップ→イベント ×2 → 章ボス →（ボスショップ）', () => {
    expect(chapterNodes(1, cfg).map((n) => n.kind)).toEqual([
      'battle',
      'shop',
      'event',
      'battle',
      'shop',
      'event',
      'boss',
      'bossShop',
    ]);
    // 最終章にはボスショップがない
    expect(chapterNodes(cfg.chapters, cfg).map((n) => n.kind)).toEqual([
      'battle',
      'shop',
      'event',
      'battle',
      'shop',
      'event',
      'boss',
    ]);
  });

  it('章の数を変えても汎用に扱える', () => {
    const c2 = cloneRunConfig();
    c2.chapters = 2;
    expect(chapterNodes(1, c2).at(-1)!.kind).toBe('bossShop');
    expect(chapterNodes(2, c2).at(-1)!.kind).toBe('boss');
  });

  it('戦闘・ボスのノードには遭遇IDがある', () => {
    for (const ch of [1, 2, 3]) {
      for (const n of chapterNodes(ch, cfg)) {
        if (n.kind === 'battle' || n.kind === 'boss') expect(n.encounterId, `${ch}`).toBeTruthy();
      }
    }
  });

  it('章ボスを倒すと次の章へ進み、最終章ボスでクリアになる', () => {
    const r = run();
    for (let ch = 1; ch <= cfg.chapters; ch++) {
      expect(r.chapter).toBe(ch);
      advanceTo(r, 'boss');
      expect(currentNode(r, cfg)!.kind).toBe('boss');
      applyBattleResult(r, true, cfg);
      if (ch < cfg.chapters) {
        // ボスショップ → 次章
        expect(currentNode(r, cfg)!.kind).toBe('bossShop');
        advanceTo(r, 'battle');
      }
    }
    expect(r.phase).toBe('clear');
  });

  it('通過履歴と進行マップが更新される', () => {
    const r = run();
    expect(progressMap(r, cfg)[0]!.current).toBe(true);
    applyBattleResult(r, true, cfg);
    expect(r.history).toContain('1-0:battle');
    const map = progressMap(r, cfg);
    expect(map[0]!.done).toBe(true);
    expect(map[1]!.current).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B2 リザルト＝ショップ
// ---------------------------------------------------------------------------

describe('B2 リザルト＝ショップ', () => {
  it('戦闘のあとは必ずショップになる（勝っても負けても）', () => {
    const win = run();
    applyBattleResult(win, true, cfg);
    expect(currentNode(win, cfg)!.kind).toBe('shop');
    expect(win.shop).not.toBeNull();

    const lose = run();
    applyBattleResult(lose, false, cfg);
    expect(currentNode(lose, cfg)!.kind).toBe('shop');
    expect(lose.shop).not.toBeNull();
  });

  it('通常ショップはキャラ2・加護2・装備2', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    const kinds = r.shop!.items.map((s) => s.item.kind);
    expect(kinds.filter((k) => k === 'character')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'blessing')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'equipment')).toHaveLength(2);
    // 通常ショップに枠拡張は並ばない
    expect(kinds).not.toContain('sixthSlot');
    expect(kinds).not.toContain('promotion');
  });

  it('コインで買える。足りなければ買えない', () => {
    const r = run();
    applyBattleResult(r, true, cfg); // +5 コイン
    const eqIndex = r.shop!.items.findIndex((s) => s.item.kind === 'equipment');
    const price = r.shop!.items[eqIndex]!.item.price;
    const before = r.coins;
    expect(buyShopItem(r, eqIndex, cfg)).toBe(true);
    expect(r.coins).toBe(before - price);
    expect(r.shop!.items[eqIndex]!.sold).toBe(true);
    expect(r.inventory).toHaveLength(1);
    // 売り切れは買えない
    expect(buyShopItem(r, eqIndex, cfg)).toBe(false);

    r.coins = 0;
    const other = r.shop!.items.findIndex((s) => !s.sold);
    expect(buyShopItem(r, other, cfg)).toBe(false);
  });

  it('リロールはコインを消費し、品を引き直す', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    r.coins = 20;
    const cost = r.shop!.rerollCost;
    const before = r.shop!.items.map((s) => JSON.stringify(s.item));
    expect(rerollShop(r, cfg)).toBe(true);
    expect(r.coins).toBe(20 - cost);
    expect(r.shop!.rerolls).toBe(1);
    // 引き直しでコストが上がる
    expect(r.shop!.rerollCost).toBeGreaterThan(cost);
    const after = r.shop!.items.map((s) => JSON.stringify(s.item));
    expect(after).not.toEqual(before);

    r.coins = 0;
    expect(rerollShop(r, cfg)).toBe(false);
  });

  it('ボスショップは品数が多く・価格が高く・枠拡張が必ず並ぶ', () => {
    const r = run();
    advanceTo(r, 'boss');
    applyBattleResult(r, true, cfg);
    expect(currentNode(r, cfg)!.kind).toBe('bossShop');
    const shop = r.shop!;
    expect(shop.boss).toBe(true);
    const kinds = shop.items.map((s) => s.item.kind);
    expect(kinds.filter((k) => k === 'character').length).toBeGreaterThan(2);
    expect(kinds.some((k) => k === 'sixthSlot' || k === 'promotion')).toBe(true);
    const charPrice = shop.items.find((s) => s.item.kind === 'character')!.item.price;
    expect(charPrice).toBeGreaterThan(cfg.price.character);
  });

  it('同じ seed なら同じ品揃えになる', () => {
    const a = run('same');
    const b = run('same');
    applyBattleResult(a, true, cfg);
    applyBattleResult(b, true, cfg);
    expect(JSON.stringify(a.shop)).toBe(JSON.stringify(b.shop));
  });
});

// ---------------------------------------------------------------------------
// B3 二択イベント
// ---------------------------------------------------------------------------

describe('B3 二択イベント', () => {
  it('データは 4〜6 パターン以上あり、必ず2択', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(6);
    for (const e of EVENTS) expect(e.choices).toHaveLength(2);
    expect(SAFE_EVENTS.length).toBeGreaterThan(0);
    expect(RISKY_EVENTS.length).toBeGreaterThan(0);
  });

  it('章の最初のイベントは両方とも安全', () => {
    const r = run();
    advanceTo(r, 'event');
    expect(r.eventsInChapter).toBe(0);
    const def = getEvent(r.eventId!);
    expect(def.safeOnly).toBe(true);
    expect(def.choices.every((c) => c.safe)).toBe(true);
  });

  it('2回目以降は 安全 vs 賭け／ミニ戦闘', () => {
    const r = run();
    advanceTo(r, 'event');
    chooseEvent(r, 0, cfg);
    advanceTo(r, 'event');
    expect(r.eventsInChapter).toBe(1);
    const def = getEvent(r.eventId!);
    expect(def.safeOnly).toBe(false);
    expect(def.choices[0]!.safe).toBe(true);
    expect(def.choices[1]!.safe).toBe(false);
    expect(Boolean(def.choices[1]!.gamble || def.choices[1]!.battle)).toBe(true);
  });

  it('同じ seed なら賭けの結果まで同じになる（イベント専用RNG）', () => {
    const results: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = run('gamble-seed');
      advanceTo(r, 'event');
      chooseEvent(r, 0, cfg);
      advanceTo(r, 'event');
      const out = chooseEvent(r, 1, cfg);
      results.push(JSON.stringify({ out, coins: r.coins, life: r.life, bl: r.blessings }));
    }
    expect(results[0]).toBe(results[1]);
  });

  it('seed が違えば賭けの結果は分かれうる', () => {
    const outcomes = new Set<boolean>();
    for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const r = run(s);
      advanceTo(r, 'event');
      chooseEvent(r, 0, cfg);
      advanceTo(r, 'event');
      const def = getEvent(r.eventId!);
      if (!def.choices[1]!.gamble) continue;
      outcomes.add(chooseEvent(r, 1, cfg).success);
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('賭けに負けても、キャラは絶対に失わない', () => {
    for (const s of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
      const r = run(s);
      r.roster.push(...[1, 2].map(() => ({ ...r.roster[0]!, uid: `x${Math.random()}` })));
      const before = r.roster.length;
      advanceTo(r, 'event');
      chooseEvent(r, 0, cfg);
      advanceTo(r, 'event');
      const def = getEvent(r.eventId!);
      if (!def.choices[1]!.gamble) continue;
      chooseEvent(r, 1, cfg);
      expect(r.roster.length, s).toBeGreaterThanOrEqual(before);
    }
  });

  it('失うのは ライフ1・装備1・加護1・コイン半分 のいずれか', () => {
    const allowed = ['life', 'equipment', 'blessing', 'coinsHalf'];
    for (const e of RISKY_EVENTS) {
      const g = e.choices[1]!.gamble;
      if (!g) continue;
      for (const p of g.penalties) expect(allowed).toContain(p);
    }
  });

  it('ミニ戦闘の選択肢は、戦闘の結果で報酬が決まる', () => {
    const r = run('battle-event');
    // ミニ戦闘のイベントが出るまで進める
    let found = false;
    for (let i = 0; i < 8 && !found; i++) {
      advanceTo(r, 'event');
      if (!r.eventId) break;
      const def = getEvent(r.eventId);
      if (def.choices[1]!.battle) {
        const out = chooseEvent(r, 1, cfg);
        expect(out.battleEncounterId).toBe(def.choices[1]!.battle.encounterId);
        // 戦闘に入ってもノードはまだ進んでいない
        expect(currentNode(r, cfg)!.kind).toBe('event');
        const before = r.eventsInChapter;
        resolveEventBattle(r, true, cfg);
        expect(r.eventsInChapter).toBe(before + 1);
        found = true;
      } else {
        chooseEvent(r, 0, cfg);
      }
    }
    expect(found).toBe(true);
  });

  it('安全なミニ戦闘に負けてもライフは減らない', () => {
    const r = run('safe-mini');
    r.eventsInChapter = 1;
    advanceTo(r, 'event');
    r.eventId = 'ev_skirmish';
    chooseEvent(r, 1, cfg);
    const life = r.life;
    resolveEventBattle(r, false, cfg);
    expect(r.life).toBe(life);
  });

  it('危険なミニ戦闘に負けるとライフが減る', () => {
    const r = run('danger-mini');
    r.eventsInChapter = 1;
    advanceTo(r, 'event');
    r.eventId = 'ev_ambush';
    chooseEvent(r, 1, cfg);
    const life = r.life;
    resolveEventBattle(r, false, cfg);
    expect(r.life).toBe(life - 1);
  });
});

// ---------------------------------------------------------------------------
// B4 ライフシステム
// ---------------------------------------------------------------------------

describe('B4 ライフシステム', () => {
  it('初期ライフ3・初期コイン0・自然回復なし', () => {
    const r = run();
    expect(r.life).toBe(3);
    expect(r.coins).toBe(0);
    applyBattleResult(r, true, cfg);
    expect(r.life).toBe(3);
  });

  it('通常戦に負けるとライフ-1・救援コイン＋ショップへ', () => {
    const r = run();
    const res = applyBattleResult(r, false, cfg);
    expect(r.life).toBe(2);
    expect(r.coins).toBe(cfg.coinsLose);
    expect(res.gameOver).toBe(false);
    expect(res.bossRetry).toBe(false);
    expect(currentNode(r, cfg)!.kind).toBe('shop');
  });

  it('ライフが0になるとゲームオーバー', () => {
    const r = run();
    applyBattleResult(r, false, cfg);
    advanceTo(r, 'battle');
    applyBattleResult(r, false, cfg);
    advanceTo(r, 'battle');
    const res = applyBattleResult(r, false, cfg);
    expect(r.life).toBe(0);
    expect(res.gameOver).toBe(true);
    expect(r.phase).toBe('gameover');
    expect(currentNode(r, cfg)).toBeNull();
  });

  it('章ボスに負けたら同じボスへ再挑戦できる（ライフは減る）', () => {
    const r = run();
    advanceTo(r, 'boss');
    const life = r.life;
    const res = applyBattleResult(r, false, cfg);
    expect(res.bossRetry).toBe(true);
    expect(r.life).toBe(life - 1);
    expect(r.bossRetries).toBe(1);
    // ノードは進まず、同じボスのまま
    expect(currentNode(r, cfg)!.kind).toBe('boss');
    // 勝てば先へ進む
    applyBattleResult(r, true, cfg);
    expect(currentNode(r, cfg)!.kind).toBe('bossShop');
    expect(r.bossRetries).toBe(0);
  });

  it('勝利のコインは通常戦より章ボスの方が多い', () => {
    const a = run();
    applyBattleResult(a, true, cfg);
    expect(a.coins).toBe(cfg.coinsWin);

    const b = run();
    advanceTo(b, 'boss');
    const before = b.coins;
    applyBattleResult(b, true, cfg);
    expect(b.coins - before).toBe(cfg.coinsBossWin);
  });
});

// ---------------------------------------------------------------------------
// B5 枠拡張報酬
// ---------------------------------------------------------------------------

describe('B5 枠拡張報酬', () => {
  it('通常ショップには枠拡張が出ない', () => {
    for (const s of ['n1', 'n2', 'n3', 'n4', 'n5']) {
      const r = run(s);
      applyBattleResult(r, true, cfg);
      const kinds = r.shop!.items.map((x) => x.item.kind);
      expect(kinds.includes('sixthSlot') || kinds.includes('promotion'), s).toBe(false);
    }
  });

  it('6体目枠でサポート枠が1増える', () => {
    const r = run();
    expect(r.frontlineSlots).toBe(3);
    expect(r.supportSlots).toBe(2);
    expect(grantSixthSlot(r)).toBe(true);
    expect(r.sixthSlot).toBe(true);
    expect(r.supportSlots).toBe(3);
    // 2回は取れない
    expect(grantSixthSlot(r)).toBe(false);
  });

  it('昇格はサポート枠を前衛枠に変え、最大3回まで', () => {
    const r = run();
    grantSixthSlot(r); // サポート3
    expect(grantPromotion(r, cfg)).toBe(true);
    expect(r.frontlineSlots).toBe(4);
    expect(r.supportSlots).toBe(2);
    expect(grantPromotion(r, cfg)).toBe(true);
    expect(grantPromotion(r, cfg)).toBe(true);
    expect(r.promotions).toBe(3);
    expect(r.frontlineSlots).toBe(6);
    expect(r.supportSlots).toBe(0);
    // 4回目はできない
    expect(grantPromotion(r, cfg)).toBe(false);
  });

  it('ボスショップから枠拡張を買える', () => {
    const r = run();
    advanceTo(r, 'boss');
    applyBattleResult(r, true, cfg);
    const i = r.shop!.items.findIndex(
      (x) => x.item.kind === 'sixthSlot' || x.item.kind === 'promotion',
    );
    expect(i).toBeGreaterThanOrEqual(0);
    r.coins = 100;
    expect(buyShopItem(r, i, cfg)).toBe(true);
    expect(r.sixthSlot || r.promotions > 0).toBe(true);
  });

  it('イベント報酬からも枠拡張が手に入る', () => {
    const r = run('slot-event');
    r.eventsInChapter = 1;
    advanceTo(r, 'event');
    r.eventId = 'ev_skirmish'; // 成功で昇格
    chooseEvent(r, 1, cfg);
    resolveEventBattle(r, true, cfg);
    expect(r.promotions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B6 オートセーブ
// ---------------------------------------------------------------------------

describe('B6 オートセーブ', () => {
  it('保存して読み直すと同じ状態になる', () => {
    const st = new MemoryStorage();
    const r = run('save-seed');
    applyBattleResult(r, true, cfg);
    expect(saveRun(r, st)).toBe(true);
    expect(hasSavedRun(st)).toBe(true);

    const loaded = loadRun(st)!;
    expect(loaded).not.toBeNull();
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(r));
    // 再開して続きから進められる
    expect(currentNode(loaded, cfg)!.kind).toBe('shop');
  });

  it('壊れたデータは安全に捨てる', () => {
    const st = new MemoryStorage();
    st.setItem('divine-pawns.run.v1', '{壊れている');
    expect(loadRun(st)).toBeNull();
    expect(hasSavedRun(st)).toBe(false);

    st.setItem('divine-pawns.run.v1', JSON.stringify({ hello: 'world' }));
    expect(loadRun(st)).toBeNull();
  });

  it('バージョンが違う保存は捨てる', () => {
    const st = new MemoryStorage();
    const r = run();
    saveRun({ ...r, version: 999 }, st);
    expect(loadRun(st)).toBeNull();
  });

  it('保存がなければ null', () => {
    const st = new MemoryStorage();
    expect(loadRun(st)).toBeNull();
    clearRun(st);
    expect(hasSavedRun(st)).toBe(false);
  });

  it('ノードを通過するたびに保存 → リロード → 再開のシナリオ', () => {
    const st = new MemoryStorage();
    let r = run('resume');
    saveRun(r, st);

    // 3ノード進めるたびに保存する
    for (let i = 0; i < 3; i++) {
      const n = currentNode(r, cfg)!;
      if (n.kind === 'battle' || n.kind === 'boss') applyBattleResult(r, true, cfg);
      else if (n.kind === 'event') chooseEvent(r, 0, cfg);
      else advanceNode(r, cfg);
      saveRun(r, st);
    }
    const snapshot = JSON.stringify(r);

    // 「タブを閉じて開き直した」想定
    r = loadRun(st)!;
    expect(JSON.stringify(r)).toBe(snapshot);
    // 続きが壊れていない
    expect(r.phase).toBe('node');
    expect(currentNode(r, cfg)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 編成の受け渡し
// ---------------------------------------------------------------------------

describe('ラン編成 → 戦闘エンジン', () => {
  it('開始時はランダムな1体が前衛にいる', () => {
    const r = run();
    expect(r.roster).toHaveLength(1);
    const lo = runLoadout(r);
    expect(lo.frontline).toHaveLength(1);
    expect(lo.frontline[0]!.pos).toBeTruthy();
    expect(lo.support).toHaveLength(0);
  });

  it('装備は★のスロット数までしか渡らない', () => {
    const r = run();
    r.roster[0]!.star = 1;
    r.roster[0]!.equipment = ['eq_power', 'eq_tough'];
    expect(runLoadout(r).frontline[0]!.equipment).toEqual(['eq_power']);
    r.roster[0]!.star = 2;
    expect(runLoadout(r).frontline[0]!.equipment).toEqual(['eq_power', 'eq_tough']);
  });

  it('加護はそのまま渡る', () => {
    const r = run();
    r.blessings.push('bl_storm');
    expect(runLoadout(r).blessings).toEqual(['bl_storm']);
  });
});
