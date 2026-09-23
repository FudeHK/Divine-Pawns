/**
 * ラン進行（章のステートマシン・ショップ・イベント・ライフ・オートセーブ）の検証。
 */

import { describe, expect, it } from 'vitest';

import { CHARACTERS, getSkill } from '../src/data/characters';
import { getEncounter } from '../src/data/encounters';
import { getEquipment } from '../src/data/equipment';
import { EVENTS, RISKY_EVENTS, SAFE_EVENTS, getEvent } from '../src/data/events';
import { DEFAULT_RUN_CONFIG, cloneRunConfig } from '../src/game/config';
import {
  advanceNode,
  applyBattleResult,
  buyShopItem,
  chapterNodes,
  chooseEvent,
  chooseSkill,
  createRun,
  currentSkillChoice,
  currentNode,
  runEncounter,
  equipItem,
  equippedCountOf,
  inventorySummary,
  stockOf,
  totalOwnedOf,
  unequipItem,
  availableCharacters,
  grantCharacter,
  grantPromotion,
  grantSixthSlot,
  makeOwnedChar,
  ownedChar,
  progressMap,
  rerollShop,
  resolveEventBattle,
  runLoadout,
  rollShop,
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
  it('戦闘に勝つとショップになる。負けたら同じ戦闘へ再挑戦', () => {
    const win = run();
    applyBattleResult(win, true, cfg);
    expect(currentNode(win, cfg)!.kind).toBe('shop');
    expect(win.shop).not.toBeNull();

    const lose = run();
    applyBattleResult(lose, false, cfg);
    expect(currentNode(lose, cfg)!.kind).toBe('battle');
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

  it('通常戦に負けるとライフ-1・救援コイン・同じ戦闘へ再挑戦', () => {
    const r = run();
    const res = applyBattleResult(r, false, cfg);
    expect(r.life).toBe(2);
    expect(r.coins).toBe(cfg.coinsLose);
    expect(res.gameOver).toBe(false);
    expect(res.retry).toBe(true);
    // ノードは進まず、同じ戦闘のまま
    expect(currentNode(r, cfg)!.kind).toBe('battle');
    expect(r.bossRetries).toBe(1);
    // 勝てば先へ進む
    applyBattleResult(r, true, cfg);
    expect(currentNode(r, cfg)!.kind).toBe('shop');
    expect(r.bossRetries).toBe(0);
  });

  it('救援コインは通常戦の報酬の半分以上ある', () => {
    expect(cfg.coinsLose).toBeGreaterThanOrEqual(Math.ceil(cfg.coinsWin / 2));
    expect(cfg.coinsLose).toBeLessThanOrEqual(cfg.coinsWin);
  });

  it('ライフが0になるとゲームオーバー', () => {
    const r = run();
    applyBattleResult(r, false, cfg);
    applyBattleResult(r, false, cfg);
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
    expect(res.retry).toBe(true);
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

// ---------------------------------------------------------------------------
// A4 リロール価格（1回目1c、以降+1c、ショップごとにリセット）
// ---------------------------------------------------------------------------

describe('A4 リロール価格', () => {
  it('1回目は1c、押すたびに+1c', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    r.coins = 50;
    expect(r.shop!.rerollCost).toBe(1);
    expect(rerollShop(r, cfg)).toBe(true);
    expect(r.shop!.rerollCost).toBe(2);
    expect(rerollShop(r, cfg)).toBe(true);
    expect(r.shop!.rerollCost).toBe(3);
    expect(rerollShop(r, cfg)).toBe(true);
    expect(r.shop!.rerollCost).toBe(4);
    // 1 + 2 + 3 = 6 コイン使った
    expect(r.coins).toBe(50 - 6);
  });

  it('次のショップに入ると1cに戻る', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    r.coins = 50;
    rerollShop(r, cfg);
    rerollShop(r, cfg);
    expect(r.shop!.rerollCost).toBe(3);

    advanceNode(r, cfg); // イベントへ
    advanceTo(r, 'shop');
    expect(r.shop!.rerollCost).toBe(1);
    expect(r.shop!.rerolls).toBe(0);
  });

  it('コインが足りなければリロールできない', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    r.coins = 0;
    expect(rerollShop(r, cfg)).toBe(false);
    expect(r.shop!.rerollCost).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// A3 スキル（初期1＋1、合成で3択）
// ---------------------------------------------------------------------------

describe('A3 スキルの取得と、同キャラ再獲得での★アップ', () => {
  it('初期は「アクティブ or パッシブ」1つ＋「サポート」1つだけ', () => {
    const r = run();
    const o = r.roster[0]!;
    expect(o.star).toBe(1);
    expect(o.skills).toHaveLength(2);
    const kinds = o.skills.map((id) => getSkill(o.charId, id).kind);
    expect(kinds).toContain('support');
    expect(kinds.some((k) => k === 'active' || k === 'passive')).toBe(true);
  });

  it('未所持のキャラは仲間として加わる', () => {
    const r = run();
    const other = CHARACTERS.find((c) => c.id !== r.roster[0]!.charId)!;
    expect(grantCharacter(r, other.id)).toBe('added');
    expect(r.roster).toHaveLength(2);
    expect(r.pendingSkills).toHaveLength(0);
  });

  it('同じキャラをもう一度手に入れると、2体目にはならず★が上がる', () => {
    const r = run();
    const id = r.roster[0]!.charId;
    expect(grantCharacter(r, id)).toBe('rankedUp');
    expect(r.roster).toHaveLength(1);
    expect(r.roster[0]!.star).toBe(2);
    // ★が上がった瞬間に3択が積まれる
    expect(r.pendingSkills).toHaveLength(1);
    expect(r.pendingSkills[0]!.options.length).toBeGreaterThan(0);
    expect(r.pendingSkills[0]!.options.length).toBeLessThanOrEqual(3);
  });

  it('同じキャラが2体並ぶことはない', () => {
    const r = run();
    const id = r.roster[0]!.charId;
    grantCharacter(r, id);
    chooseSkill(r, r.pendingSkills[0]!.options[0]!);
    grantCharacter(r, id);
    chooseSkill(r, r.pendingSkills[0]!.options[0]!);
    expect(r.roster.filter((o) => o.charId === id)).toHaveLength(1);
    expect(r.roster[0]!.star).toBe(3);
  });

  it('★3になったら、それ以上は手に入らず出現候補からも消える', () => {
    const r = run();
    const id = r.roster[0]!.charId;
    r.roster[0]!.star = 3;
    expect(grantCharacter(r, id)).toBe('maxed');
    expect(r.roster[0]!.star).toBe(3);
    expect(availableCharacters(r).map((c) => c.id)).not.toContain(id);
    expect(availableCharacters(r)).toHaveLength(CHARACTERS.length - 1);
  });

  it('★1・★2で所持中のキャラは、引き続き出現候補になる', () => {
    const r = run();
    const id = r.roster[0]!.charId;
    expect(availableCharacters(r).map((c) => c.id)).toContain(id);
    r.roster[0]!.star = 2;
    expect(availableCharacters(r).map((c) => c.id)).toContain(id);
  });

  it('ショップには★3で持っているキャラが並ばない', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const r = run(seed);
      // 4体を★3で持っておく
      for (const c of CHARACTERS.slice(0, 4)) {
        const o = ownedChar(r, c.id);
        if (o) o.star = 3;
        else r.roster.push({ ...makeOwnedChar(c.id, 3) });
      }
      const maxed = new Set(r.roster.filter((o) => o.star >= 3).map((o) => o.charId));
      applyBattleResult(r, true, cfg);
      for (const slot of r.shop!.items) {
        if (slot.item.kind === 'character') {
          expect(maxed.has(slot.item.charId), `${seed}:${slot.item.charId}`).toBe(false);
        }
      }
    }
  });

  it('ショップで同じキャラを買うと★が上がり、3択が出る', () => {
    const r = run();
    applyBattleResult(r, true, cfg);
    const idx = r.shop!.items.findIndex((x) => x.item.kind === 'character');
    const item = r.shop!.items[idx]!.item;
    if (item.kind !== 'character') throw new Error('character ではない');
    // その場でそのキャラを★1で所持させる
    if (!ownedChar(r, item.charId)) r.roster.push(makeOwnedChar(item.charId));
    const before = r.roster.length;
    r.coins = 99;
    expect(buyShopItem(r, idx, cfg)).toBe(true);
    expect(r.roster).toHaveLength(before);
    expect(ownedChar(r, item.charId)!.star).toBe(2);
    expect(r.pendingSkills).toHaveLength(1);
  });

  it('3択から1つ選ぶと覚え、残りは今回は失う', () => {
    const r = run();
    grantCharacter(r, r.roster[0]!.charId);
    const opts = [...r.pendingSkills[0]!.options];
    const pick = opts[0]!;
    expect(chooseSkill(r, pick)).toBe(true);
    expect(r.pendingSkills).toHaveLength(0);
    const o = r.roster[0]!;
    expect(o.skills).toContain(pick);
    for (const other of opts.slice(1)) expect(o.skills).not.toContain(other);
    expect(o.skills).toHaveLength(3);
  });

  it('3択にないスキルは選べない', () => {
    const r = run();
    grantCharacter(r, r.roster[0]!.charId);
    expect(chooseSkill(r, 'no_such_skill')).toBe(false);
    expect(r.pendingSkills).toHaveLength(1);
  });

  it('連続でランクアップしたら、待ち行列に1件ずつ積まれる', () => {
    const r = run();
    const a = r.roster[0]!.charId;
    const b = CHARACTERS.find((c) => c.id !== a)!.id;
    grantCharacter(r, b); // 加入（3択なし）
    grantCharacter(r, a); // ★2
    grantCharacter(r, b); // ★2
    expect(r.pendingSkills).toHaveLength(2);
    expect(currentSkillChoice(r)!.charId).toBe(a);
    chooseSkill(r, currentSkillChoice(r)!.options[0]!);
    expect(currentSkillChoice(r)!.charId).toBe(b);
    chooseSkill(r, currentSkillChoice(r)!.options[0]!);
    expect(currentSkillChoice(r)).toBeNull();
  });

  it('戦闘に渡る編成には、覚えているスキルだけが入る', () => {
    const r = run();
    const o = r.roster[0]!;
    expect(runLoadout(r).frontline[0]!.skills).toEqual(o.skills);
  });
});

// ---------------------------------------------------------------------------
// 装備の所持数（1個獲得＝1個しか装備できない）
// ---------------------------------------------------------------------------

describe('装備の所持数', () => {
  function twoChars(): RunState {
    const r = run('stock');
    const other = CHARACTERS.find((c) => c.id !== r.roster[0]!.charId)!;
    grantCharacter(r, other.id);
    return r;
  }

  it('1個しか持っていない装備は、2体目には着けられない', () => {
    const r = twoChars();
    r.inventory.push('eq_power');
    const [a, b] = r.roster;

    expect(equipItem(r, a!.uid, 0, 'eq_power')).toBe('ok');
    expect(stockOf(r, 'eq_power')).toBe(0);
    expect(equippedCountOf(r, 'eq_power')).toBe(1);

    // 2体目は在庫がないので失敗する
    expect(equipItem(r, b!.uid, 0, 'eq_power')).toBe('noStock');
    expect(b!.equipment.filter((x) => x !== '')).toHaveLength(0);
    expect(equippedCountOf(r, 'eq_power')).toBe(1);
  });

  it('2個持っていれば2体に着けられる', () => {
    const r = twoChars();
    r.inventory.push('eq_power', 'eq_power');
    const [a, b] = r.roster;
    expect(equipItem(r, a!.uid, 0, 'eq_power')).toBe('ok');
    expect(equipItem(r, b!.uid, 0, 'eq_power')).toBe('ok');
    expect(equippedCountOf(r, 'eq_power')).toBe(2);
    expect(stockOf(r, 'eq_power')).toBe(0);
    expect(totalOwnedOf(r, 'eq_power')).toBe(2);
  });

  it('外すと在庫に戻り、別のキャラに着け直せる', () => {
    const r = twoChars();
    r.inventory.push('eq_power');
    const [a, b] = r.roster;
    equipItem(r, a!.uid, 0, 'eq_power');
    expect(unequipItem(r, a!.uid, 0)).toBe(true);
    expect(stockOf(r, 'eq_power')).toBe(1);
    expect(equippedCountOf(r, 'eq_power')).toBe(0);
    expect(equipItem(r, b!.uid, 0, 'eq_power')).toBe('ok');
    expect(equippedCountOf(r, 'eq_power')).toBe(1);
  });

  it('着け替えると、前の装備は在庫に戻る', () => {
    const r = run('swap');
    r.inventory.push('eq_power', 'eq_tough');
    const a = r.roster[0]!;
    equipItem(r, a.uid, 0, 'eq_power');
    expect(equipItem(r, a.uid, 0, 'eq_tough')).toBe('ok');
    expect(stockOf(r, 'eq_power')).toBe(1);
    expect(stockOf(r, 'eq_tough')).toBe(0);
  });

  it('★のスロット数を超えるところには着けられない', () => {
    const r = run('slots');
    r.inventory.push('eq_power');
    const a = r.roster[0]!;
    expect(a.star).toBe(1);
    expect(equipItem(r, a.uid, 1, 'eq_power')).toBe('noSlot');
    expect(stockOf(r, 'eq_power')).toBe(1);
  });

  it('ショップで手に入れると在庫が増える', () => {
    const r = run('gain');
    applyBattleResult(r, true, cfg);
    const idx = r.shop!.items.findIndex((x) => x.item.kind === 'equipment');
    const item = r.shop!.items[idx]!.item;
    if (item.kind !== 'equipment') throw new Error('equipment ではない');
    r.coins = 99;
    const before = totalOwnedOf(r, item.equipmentId);
    expect(buyShopItem(r, idx, cfg)).toBe(true);
    expect(totalOwnedOf(r, item.equipmentId)).toBe(before + 1);
    expect(stockOf(r, item.equipmentId)).toBe(before + 1);
  });

  it('内訳（総数・装備中・空き）が出せる', () => {
    const r = twoChars();
    r.inventory.push('eq_power', 'eq_power', 'eq_tough');
    equipItem(r, r.roster[0]!.uid, 0, 'eq_power');
    const sum = inventorySummary(r);
    expect(sum.find((x) => x.equipmentId === 'eq_power')).toEqual({
      equipmentId: 'eq_power',
      total: 2,
      equipped: 1,
      free: 1,
    });
    const tough = sum.find((x) => x.equipmentId === 'eq_tough')!;
    expect(tough.total).toBe(1);
    expect(tough.equipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// セール（割引）
// ---------------------------------------------------------------------------

describe('セール（割引）', () => {
  it('セール品は 定価 × (1 - 割引率) の価格になる', () => {
    let found = 0;
    for (let i = 0; i < 60; i++) {
      const r = run(`sale-${i}`);
      applyBattleResult(r, true, cfg);
      for (const slot of r.shop!.items) {
        const sale = slot.item.sale;
        if (!sale) continue;
        found += 1;
        expect(cfg.sale.rates).toContain(sale.rate);
        expect(slot.item.price).toBe(Math.max(1, Math.round(sale.basePrice * (1 - sale.rate))));
        expect(slot.item.price).toBeLessThan(sale.basePrice);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('セールになるのは装備と加護だけ', () => {
    for (let i = 0; i < 40; i++) {
      const r = run(`sale-kind-${i}`);
      advanceTo(r, 'boss');
      applyBattleResult(r, true, cfg);
      for (const slot of r.shop!.items) {
        if (!slot.item.sale) continue;
        expect(['equipment', 'blessing']).toContain(slot.item.kind);
      }
    }
  });

  it('リロールするとセールも引き直される', () => {
    const r = run('sale-reroll');
    applyBattleResult(r, true, cfg);
    r.coins = 200;
    const snapshot = (): string =>
      r.shop!.items.map((x) => `${x.item.price}:${x.item.sale?.rate ?? '-'}`).join(',');
    const before = snapshot();
    rerollShop(r, cfg);
    expect(snapshot()).not.toBe(before);
  });

  it('同じ seed ならセールも同じ', () => {
    const a = run('same-sale');
    const b = run('same-sale');
    applyBattleResult(a, true, cfg);
    applyBattleResult(b, true, cfg);
    expect(JSON.stringify(a.shop)).toBe(JSON.stringify(b.shop));
  });
});

// ---------------------------------------------------------------------------
// 装備のレア度
// ---------------------------------------------------------------------------

describe('装備のレア度', () => {
  it('ショップの装備価格はレア度ごとに決まる', () => {
    for (let i = 0; i < 30; i++) {
      const r = run(`tier-${i}`);
      applyBattleResult(r, true, cfg);
      for (const slot of r.shop!.items) {
        if (slot.item.kind !== 'equipment') continue;
        const e = getEquipment(slot.item.equipmentId);
        const base = slot.item.sale?.basePrice ?? slot.item.price;
        expect(base).toBe(cfg.equipmentTierPrice[e.tier]);
      }
    }
  });

  it('ボスショップの方が高レア装備が出やすい', () => {
    const highRate = (boss: boolean): number => {
      let high = 0;
      let total = 0;
      for (let i = 0; i < 60; i++) {
        const r = run(`w-${boss}-${i}`);
        if (boss) advanceTo(r, 'boss');
        applyBattleResult(r, true, cfg);
        for (const slot of r.shop!.items) {
          if (slot.item.kind !== 'equipment') continue;
          total += 1;
          if (getEquipment(slot.item.equipmentId).tier >= 2) high += 1;
        }
      }
      return high / Math.max(1, total);
    };
    expect(highRate(true)).toBeGreaterThan(highRate(false));
  });

  it('レア度が高い装備ほどステータスの伸びが大きい', () => {
    const power = (id: string): number => {
      const e = getEquipment(id);
      const flat = (e.flat?.atk ?? 0) + (e.flat?.maxHp ?? 0) / 10 + (e.flat?.def ?? 0) * 2;
      const pct = ((e.pct?.atk ?? 0) + (e.pct?.def ?? 0)) * 100;
      return flat + pct;
    };
    expect(power('eq_greatpower')).toBeGreaterThan(power('eq_vanguard'));
    expect(power('eq_vanguard')).toBeGreaterThan(power('eq_power'));
    expect(power('eq_aegis')).toBeGreaterThan(power('eq_bulwark'));
    expect(power('eq_bulwark')).toBeGreaterThan(power('eq_tough'));
  });
});

// ---------------------------------------------------------------------------
// フェーズ2.5: 章ごとの難易度カーブと章ボスの上乗せ
// ---------------------------------------------------------------------------

describe('章ごとの難易度', () => {
  it('章が進むほど敵が強くなる', () => {
    const r = run('scale');
    const at = (chapter: number): number => {
      r.chapter = chapter;
      return runEncounter(r, 'E2', cfg).units[0]!.scale ?? 1;
    };
    expect(at(2)).toBeGreaterThan(at(1));
    expect(at(3)).toBeGreaterThan(at(2));
  });

  it('章ボスには追加の強さ倍率が乗る', () => {
    const r = run('boss-scale');
    r.chapter = 1;
    const boss = runEncounter(r, 'B1', cfg).units[0]!.scale ?? 1;
    const raw = (cfg.chapterScale[1] ?? 1) * 1.0;
    expect(boss).toBeCloseTo(raw * (cfg.bossScale[1] ?? 1) * 0.9, 6);
    expect(cfg.bossScale[1]).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// フェーズ2.7: 初期キャラのランダム化・章別の敵・★3時の代替報酬
// ---------------------------------------------------------------------------

describe('挑戦開始時の初期キャラ', () => {
  it('シードごとに初期キャラが変わり、偏りなくばらける', () => {
    const counts = new Map<string, number>();
    const tries = 200;
    for (let i = 0; i < tries; i++) {
      const r = createRun(`start-${i}`, cfg);
      expect(r.roster).toHaveLength(1);
      const id = r.roster[0]!.charId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // 全キャラが初期キャラになりうる
    expect(counts.size).toBe(CHARACTERS.length);
    // どれかに寄りすぎていない（期待値 1/8 の半分〜2倍に収まる）
    const expected = tries / CHARACTERS.length;
    for (const [id, n] of counts) {
      expect(n, id).toBeGreaterThan(expected * 0.5);
      expect(n, id).toBeLessThan(expected * 2);
    }
  });

  it('同じシードなら初期キャラも同じ（再現性）', () => {
    for (let i = 0; i < 20; i++) {
      const a = createRun(`same-${i}`, cfg);
      const b = createRun(`same-${i}`, cfg);
      expect(a.roster[0]!.charId).toBe(b.roster[0]!.charId);
    }
  });

  it('初期キャラは前衛に配置されている', () => {
    const r = createRun('place', cfg);
    expect(r.roster[0]!.slot).toBe('frontline');
    expect(r.roster[0]!.pos).not.toBeNull();
  });
});

describe('章ごとの敵バリエーション', () => {
  it('章が進むと通常戦の遭遇IDが変わる', () => {
    const ids = (chapter: number): string[] =>
      chapterNodes(chapter, cfg)
        .filter((n) => n.kind === 'battle')
        .map((n) => n.encounterId!);
    const c1 = ids(1);
    const c2 = ids(2);
    const c3 = ids(3);
    expect(c1).toEqual(['E1', 'C1B']);
    expect(new Set([...c1, ...c2, ...c3]).size).toBe(6);
    for (const id of [...c1, ...c2, ...c3]) expect(getEncounter(id)).toBeTruthy();
  });

  it('章が進むほど敵の数が増える（顔ぶれも変わる）', () => {
    const size = (id: string): number => getEncounter(id).units.length;
    expect(size('C1B')).toBeLessThan(size('C3B'));
    const kinds = (id: string): Set<string> =>
      new Set(getEncounter(id).units.map((u) => u.enemyId));
    expect([...kinds('C3A')].some((k) => !kinds('C1B').has(k))).toBe(true);
  });
});

describe('★3が揃った時のショップ', () => {
  function maxAll(r: RunState): void {
    for (const c of CHARACTERS) {
      const owned = ownedChar(r, c.id);
      if (owned) owned.star = 3;
      else {
        grantCharacter(r, c.id);
        grantCharacter(r, c.id);
        grantCharacter(r, c.id);
      }
    }
    r.pendingSkills = [];
  }

  it('候補がなくてもショップの品数は減らず、装備に振り替わる', () => {
    const r = run('all-star3');
    maxAll(r);
    expect(availableCharacters(r)).toHaveLength(0);

    for (const boss of [false, true]) {
      const shop = rollShop(r, boss, 0, cfg);
      const kinds = shop.items.map((x) => x.item.kind);
      expect(kinds.filter((k) => k === 'character')).toHaveLength(0);
      // キャラ2枠ぶんが装備に振り替わる（ボスは枠が1つ多い）
      const perKind = 2 + (boss ? cfg.bossExtraPerKind : 0);
      expect(kinds.filter((k) => k === 'equipment')).toHaveLength(perKind * 2);
      expect(kinds.filter((k) => k === 'blessing')).toHaveLength(perKind);
      for (const slot of shop.items) expect(slot.item.price).toBeGreaterThan(0);
    }
  });

  it('候補が1体だけなら、残り1枠が装備になる', () => {
    const r = run('one-left');
    maxAll(r);
    const target = CHARACTERS[0]!;
    ownedChar(r, target.id)!.star = 2;
    expect(availableCharacters(r)).toHaveLength(1);

    const shop = rollShop(r, false, 0, cfg);
    const kinds = shop.items.map((x) => x.item.kind);
    expect(kinds.filter((k) => k === 'character')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equipment')).toHaveLength(3);
  });

  it('同じショップに同じキャラが2回並ばない', () => {
    for (let i = 0; i < 40; i++) {
      const r = run(`dup-${i}`);
      const shop = rollShop(r, i % 2 === 0, 0, cfg);
      const chars = shop.items
        .map((x) => x.item)
        .filter((it) => it.kind === 'character')
        .map((it) => (it.kind === 'character' ? it.charId : ''));
      expect(new Set(chars).size).toBe(chars.length);
    }
  });
});
