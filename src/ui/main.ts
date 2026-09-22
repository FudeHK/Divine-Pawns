/**
 * Divine Pawns（仮題）の画面。
 *
 * 画面は2層。
 *   上: 盤面（常に見える。残りの高さいっぱい）
 *   下: タブ付きの操作バー（編成 / 加護 / ラン / 操作）＋ いつでも押せる実行ボタン
 *
 * 「ラン」タブを使っていない間は、単発の戦闘を試すサンドボックスとして動く。
 */

import './style.css';

import { BLESSINGS, getBlessing } from '../data/blessings';
import { CHARACTERS, getCharacter, getSkill } from '../data/characters';
import { ENCOUNTERS, getEncounter } from '../data/encounters';
import { getEnemy } from '../data/enemies';
import { EQUIPMENT, getEquipment } from '../data/equipment';
import { getEvent } from '../data/events';
import { buildBattleSetup, resolveMembers } from '../engine/build';
import { DEFAULT_CONFIG } from '../engine/config';
import { ALLY_CELLS, ALL_CELLS, isCellOfSide } from '../engine/hex';
import { equipmentSlots } from '../engine/stats';
import type {
  CharacterDef,
  DebuffKind,
  EffectDef,
  Element,
  EnemyDef,
  Hex,
  Loadout,
  Myth,
  Rarity,
  Role,
  Star,
  Stats,
} from '../engine/types';
import { DEFAULT_RUN_CONFIG } from '../game/config';
import {
  advanceNode,
  applyBattleResult,
  buyShopItem,
  chooseEvent,
  chooseSkill,
  createRun,
  currentNode,
  currentSkillChoice,
  learnedSkillIds,
  progressMap,
  rerollShop,
  runEncounter,
  resolveEventBattle,
  runLoadout,
} from '../game/run';
import { clearRun, loadRun, saveRun } from '../game/save';
import type { RunState, ShopItem } from '../game/types';
import { formatNumber } from '../util/format';
import { buildReplay, type Replay } from './replay';

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

type Slot = 'none' | 'frontline' | 'support';
type Tab = 'team' | 'blessing' | 'run' | 'control';

interface Assignment {
  slot: Slot;
  star: Star;
  /** 装備。添字がスロット番号。空きは '' */
  equipment: string[];
  pos: Hex | null;
}

/** 編成に出す1人分（サンドボックスとランの両方をこの形で扱う） */
interface Member {
  /** サンドボックスはキャラID、ランは所持個体のUID */
  key: string;
  charId: string;
  star: Star;
  /** 覚えているスキルID */
  skills: string[];
  /** 装備（★の数だけ。空きは ''） */
  equipment: string[];
  slot: Slot;
  pos: Hex | null;
}

/** 詳細シートで見せる対象 */
type DetailTarget =
  | { kind: 'member'; key: string }
  | { kind: 'enemySlot'; index: number }
  | { kind: 'unit'; unitId: string };

/** 画面下から開くシート。重ねて開ける（閉じると1つ上の階層に戻る） */
type Sheet =
  | { kind: 'detail'; target: DetailTarget }
  | { kind: 'skillChoice' }
  | { kind: 'equip'; key: string; slot: number }
  | { kind: 'blessings' }
  | { kind: 'explain'; title: string; text: string };

/** 戦闘が終わったあと、どう扱うか */
type BattleContext = 'sandbox' | 'runNode' | 'runEvent';

/**
 * メイン画面に何を出すか。
 * 盤面を出すのは「戦闘準備中」と「戦闘実行中」だけ。
 */
type ScreenMode = 'prep' | 'battle' | 'result' | 'shop' | 'event';

/** 盤面を出す画面かどうか */
function showsBoard(mode: ScreenMode): boolean {
  return mode === 'prep' || mode === 'battle';
}

const team = DEFAULT_CONFIG.team;
const runCfg = DEFAULT_RUN_CONFIG;

const TABS: { id: Tab; label: string }[] = [
  { id: 'team', label: '編成' },
  { id: 'blessing', label: '加護' },
  { id: 'run', label: 'ラン' },
  { id: 'control', label: '操作' },
];

const state = {
  seed: 'seed-1',
  encounterId: 'E1',
  assign: new Map<string, Assignment>(),
  blessings: new Set<string>(),
  /** 配置モードで選んでいるメンバーの key */
  selected: null as string | null,
  message: '',
  replay: null as Replay | null,
  battleContext: 'sandbox' as BattleContext,
  /** 戦闘の結果をまだラン側に反映していない */
  pendingResult: false,
  frame: 0,
  playing: false,
  speed: 1 as 1 | 2 | 4,
  tab: 'team' as Tab,
  /** メイン画面のモード */
  screen: 'prep' as ScreenMode,
  /** リザルト画面に出す内容（戦闘・イベント共通） */
  resultInfo: null as {
    tone: 'win' | 'lose' | 'neutral';
    title: string;
    lines: string[];
  } | null,
  /** 「編成」タブで今表示しているメンバーの番号 */
  cardIndex: 0,
  sheets: [] as Sheet[],
  resumeAfterSheet: false,

  /** 進行中のラン */
  run: null as RunState | null,
  /** 保存されたランを見つけた（再開するか聞く） */
  savedRun: null as RunState | null,
  runMessage: '',
};

for (const c of CHARACTERS) {
  state.assign.set(c.id, { slot: 'none', star: 1, equipment: [], pos: null });
}
const initial: [string, Slot, Hex | null][] = [
  ['GRE_A', 'frontline', { x: 2, y: 3 }],
  ['NOR_A', 'frontline', { x: 1, y: 3 }],
  ['GRE_B', 'frontline', { x: 2, y: 5 }],
  ['JPN_B', 'support', null],
  ['EGY_A', 'support', null],
];
for (const [id, slot, pos] of initial) {
  const a = state.assign.get(id)!;
  a.slot = slot;
  a.pos = pos;
}

const ELEMENT_LABEL: Record<Element, string> = {
  fire: '炎',
  ice: '氷',
  wood: '木',
  lightning: '雷',
};
const ROLE_LABEL: Record<Role, string> = {
  tank: 'タンク',
  melee: '近接',
  ranged: '遠隔',
  mage: 'メイジ',
  healer: 'ヒーラー',
  support: 'サポーター',
};
const MYTH_LABEL: Record<Myth, string> = {
  greek: 'ギリシャ',
  norse: '北欧',
  japanese: '日本',
  egyptian: 'エジプト',
};
const DEBUFF_LABEL: Record<DebuffKind, string> = {
  burn: '燃',
  frostbite: '凍',
  poison: '毒',
  paralysis: '麻',
};
const DEBUFF_FULL: Record<DebuffKind, string> = {
  burn: '燃焼',
  frostbite: '凍傷',
  poison: '猛毒',
  paralysis: '麻痺',
};
const DEBUFF_COLOR: Record<DebuffKind, string> = {
  burn: '#ff7a45',
  frostbite: '#6fd2ff',
  poison: '#7ed957',
  paralysis: '#d29bff',
};
const DEBUFF_ORDER: DebuffKind[] = ['burn', 'frostbite', 'poison', 'paralysis'];
const RARITY_LABEL: Record<Rarity, string> = {
  common: 'コモン',
  rare: 'レア',
  epic: 'エピック',
};
const NODE_LABEL: Record<string, string> = {
  battle: '戦闘',
  shop: 'ショップ',
  event: 'イベント',
  boss: '章ボス',
  bossShop: 'ボスショップ',
};

// ---------------------------------------------------------------------------
// 参照ヘルパー
// ---------------------------------------------------------------------------

function charOf(defId: string): CharacterDef | null {
  return CHARACTERS.find((c) => c.id === defId) ?? null;
}

function enemyOf(defId: string): EnemyDef | null {
  try {
    return getEnemy(defId);
  } catch {
    return null;
  }
}

function shortNameOf(defId: string): string {
  return charOf(defId)?.shortName ?? enemyOf(defId)?.shortName ?? defId.slice(0, 4);
}

/** 今の遭遇（ラン中はノードの遭遇を使う） */
function activeEncounterId(): string {
  const run = state.run;
  if (run && run.phase === 'node') {
    const n = currentNode(run, runCfg);
    if (n?.encounterId) return n.encounterId;
  }
  return state.encounterId;
}

function enemyDupIndexes(): (number | null)[] {
  const units = getEncounter(activeEncounterId()).units;
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.enemyId, (counts.get(u.enemyId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return units.map((u) => {
    if ((counts.get(u.enemyId) ?? 0) <= 1) return null;
    const n = (seen.get(u.enemyId) ?? 0) + 1;
    seen.set(u.enemyId, n);
    return n;
  });
}

/** 装備スロットの一覧（★の数だけ。空きは ''） */
function padSlots(equipment: string[], star: Star): string[] {
  const n = equipmentSlots(star);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(equipment[i] ?? '');
  return out;
}

// ---------------------------------------------------------------------------
// 編成（サンドボックス／ラン を同じ形で扱う）
// ---------------------------------------------------------------------------

function inRun(): boolean {
  return state.run !== null && state.run.phase === 'node';
}

function party(): Member[] {
  const run = state.run;
  if (run) {
    return run.roster.map((o) => ({
      key: o.uid,
      charId: o.charId,
      star: o.star,
      skills: [...o.skills],
      equipment: padSlots(o.equipment, o.star),
      slot: o.slot,
      pos: o.pos ?? null,
    }));
  }
  return CHARACTERS.map((c) => {
    const a = state.assign.get(c.id)!;
    return {
      key: c.id,
      charId: c.id,
      star: a.star,
      skills: learnedSkillIds({ charId: c.id, star: a.star, equipment: [] }),
      equipment: padSlots(a.equipment, a.star),
      slot: a.slot,
      pos: a.pos,
    };
  });
}

function memberOf(key: string): Member | undefined {
  return party().find((m) => m.key === key);
}

interface MemberBox {
  star: Star;
  equipment: string[];
  slot: Slot;
  pos: Hex | null;
}

function updateMember(key: string, fn: (m: MemberBox) => void): void {
  const run = state.run;
  if (run) {
    const o = run.roster.find((x) => x.uid === key);
    if (!o) return;
    const box: MemberBox = {
      star: o.star,
      equipment: padSlots(o.equipment, o.star),
      slot: o.slot,
      pos: o.pos ?? null,
    };
    fn(box);
    o.star = box.star;
    o.equipment = box.equipment;
    o.slot = box.slot;
    o.pos = box.pos ?? undefined;
    autoSave();
    return;
  }
  const a = state.assign.get(key);
  if (!a) return;
  const box: MemberBox = {
    star: a.star,
    equipment: padSlots(a.equipment, a.star),
    slot: a.slot,
    pos: a.pos,
  };
  fn(box);
  a.star = box.star;
  a.equipment = box.equipment;
  a.slot = box.slot;
  a.pos = box.pos;
}

/** 枠の上限（ラン中はランの枠数） */
function slotLimits(): { frontline: number; support: number } {
  const run = state.run;
  if (run) return { frontline: run.frontlineSlots, support: run.supportSlots };
  return { frontline: team.frontlineSlotsDefault, support: team.supportSlotsDefault };
}

function countSlot(slot: Slot): number {
  return party().filter((m) => m.slot === slot).length;
}

function currentLoadout(): Loadout {
  if (state.run) return runLoadout(state.run);
  const frontline = [];
  const support = [];
  for (const m of party()) {
    if (m.slot === 'none') continue;
    const e = {
      charId: m.charId,
      star: m.star,
      skills: m.skills,
      equipment: m.equipment.filter((x) => x !== ''),
      pos: m.pos ?? undefined,
    };
    if (m.slot === 'frontline') frontline.push(e);
    else support.push(e);
  }
  return { frontline, support, blessings: [...state.blessings] };
}

function validateLoadout(): string | null {
  const lo = currentLoadout();
  const lim = slotLimits();
  if (lo.frontline.length === 0) return '前衛を1体以上入れてください';
  if (lo.frontline.length > lim.frontline) return `前衛は最大 ${lim.frontline} 体です`;
  if (lo.support.length > lim.support) return `サポートは最大 ${lim.support} 体です`;
  const keys = new Set<string>();
  for (const e of lo.frontline) {
    if (!e.pos) return '配置されていない前衛がいます';
    if (!isCellOfSide(e.pos, 'ally')) return '味方のマス以外には置けません';
    const k = `${e.pos.x},${e.pos.y}`;
    if (keys.has(k)) return '同じマスに重ねて置けません';
    keys.add(k);
  }
  return null;
}

function occupiedBy(cell: Hex): string | null {
  for (const m of party()) {
    if (m.slot === 'frontline' && m.pos && m.pos.x === cell.x && m.pos.y === cell.y) return m.key;
  }
  return null;
}

function freeCell(): Hex | null {
  const c = ALLY_CELLS.find((x) => !occupiedBy(x));
  return c ? { ...c } : null;
}

// ---------------------------------------------------------------------------
// 盤面の描画
// ---------------------------------------------------------------------------

const BOARD_W = 360;
const SQ3 = Math.sqrt(3);
const R = (BOARD_W - 4) / (SQ3 * 5.5);
const BOARD_H = 1.5 * R * 5 + 2 * R + 4;

/** 「編成」タブで表示中のキャラを示す色（戦闘中の表示とは別色） */
const FOCUS_COLOR = '#ff7ae0';

/** 盤面アイコンの表示名。4文字で収まらない時だけ12pxまで縮める */
function labelFontSize(label: string): number {
  return label.length >= 4 ? 12 : 14;
}

function hexCenter(hex: Hex): { cx: number; cy: number } {
  const off = (hex.y & 1) === 1 ? 0.5 : 0;
  return {
    cx: 2 + SQ3 * R * (hex.x + off) + (SQ3 * R) / 2,
    cy: 2 + 1.5 * R * hex.y + R,
  };
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(
      `${(cx + r * Math.sin(a + Math.PI / 2)).toFixed(2)},${(cy - r * Math.cos(a + Math.PI / 2)).toFixed(2)}`,
    );
  }
  return pts.join(' ');
}

function el(tag: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function drawToken(
  svg: SVGSVGElement,
  cx: number,
  cy: number,
  label: string,
  color: string,
  opts: {
    star?: Star | null;
    dupIndex?: number | null;
    /** 「編成」タブで表示中のキャラ */
    focused?: boolean;
    onTap?: () => void;
  } = {},
): void {
  const g = el('g');
  if (opts.focused) g.setAttribute('class', 'token focused');
  if (opts.onTap) {
    g.setAttribute('style', 'cursor:pointer');
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      opts.onTap!();
    });
  }
  if (opts.focused) {
    g.appendChild(
      el('circle', { cx, cy, r: R * 0.86, fill: 'none', stroke: FOCUS_COLOR, 'stroke-width': 3 }),
    );
  }
  g.appendChild(el('circle', { cx, cy, r: R * 0.74, fill: color, opacity: 0.94 }));
  g.appendChild(
    el(
      'text',
      {
        x: cx,
        y: cy + 5,
        'text-anchor': 'middle',
        'font-size': labelFontSize(label),
        'font-weight': 700,
        fill: '#0b1119',
      },
      label,
    ),
  );
  if (opts.star) {
    g.appendChild(
      el(
        'text',
        { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#0b1119' },
        `★${opts.star}`,
      ),
    );
  }
  if (opts.dupIndex) {
    const nx = cx + R * 0.58;
    const ny = cy + R * 0.58;
    g.appendChild(el('circle', { cx: nx, cy: ny, r: 9, fill: '#0b1119', opacity: 0.92 }));
    g.appendChild(
      el(
        'text',
        {
          x: nx,
          y: ny + 4,
          'text-anchor': 'middle',
          'font-size': 12,
          'font-weight': 700,
          fill: '#ffffff',
        },
        String(opts.dupIndex),
      ),
    );
  }
  svg.appendChild(g);
}

function renderBoard(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${BOARD_W.toFixed(2)} ${BOARD_H.toFixed(2)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'board');

  const rep = state.replay;
  const frame = rep ? rep.frames[Math.min(state.frame, rep.frames.length - 1)]! : null;

  for (const cell of ALL_CELLS) {
    const { cx, cy } = hexCenter(cell);
    const isAlly = cell.y >= 3;
    const occ = occupiedBy(cell);
    const focus = !rep ? currentCardMember() : null;
    const placing = !rep && focus !== null && focus.slot === 'frontline' && isAlly;
    const p = el('polygon', {
      points: hexPoints(cx, cy, R * 0.95),
      fill: isAlly ? (placing ? '#1d3149' : '#182231') : '#291a1d',
      stroke: placing ? '#ffcc52' : occ && !rep ? '#ffcc52' : '#3a3f52',
      'stroke-width': placing ? 2 : 1.5,
    });
    // 置ける状態（前衛のカードを表示中）の時だけ、マスをタップできる
    if (placing) {
      p.setAttribute('style', 'cursor:pointer');
      p.addEventListener('click', () => onCellTap(cell));
    }
    svg.appendChild(p);
  }

  if (!rep) {
    // いま「編成」タブのカードに出ているキャラの居場所を強調する
    const focus = currentCardMember();
    if (focus && focus.slot === 'frontline' && focus.pos) {
      const { cx, cy } = hexCenter(focus.pos);
      svg.appendChild(
        el('polygon', {
          class: 'focus-ring',
          points: hexPoints(cx, cy, R * 0.99),
          fill: 'none',
          stroke: FOCUS_COLOR,
          'stroke-width': 4,
          'stroke-dasharray': '10 6',
        }),
      );
    }

    for (const m of party()) {
      if (m.slot !== 'frontline' || !m.pos) continue;
      const { cx, cy } = hexCenter(m.pos);
      const cell = m.pos;
      drawToken(svg, cx, cy, getCharacter(m.charId).shortName, '#4aa3ff', {
        star: m.star,
        focused: focus ? m.key === focus.key : false,
        onTap: () => onCellTap(cell),
      });
    }
    const dup = enemyDupIndexes();
    getEncounter(activeEncounterId()).units.forEach((eu, i) => {
      const { cx, cy } = hexCenter(eu.pos);
      drawToken(svg, cx, cy, getEnemy(eu.enemyId).shortName, '#ff6b6b', {
        dupIndex: dup[i] ?? null,
        onTap: () => openSheet({ kind: 'detail', target: { kind: 'enemySlot', index: i } }),
      });
    });
    return svg;
  }

  const byId = new Map(rep.units.map((u) => [u.id, u]));
  for (const uf of frame!.units) {
    const u = byId.get(uf.id)!;
    if (!u.onField || !uf.alive) continue;
    const { cx, cy } = hexCenter(uf.pos);
    drawToken(svg, cx, cy, shortNameOf(u.defId), u.side === 'ally' ? '#4aa3ff' : '#ff6b6b', {
      star: u.side === 'ally' ? u.star : null,
      dupIndex: u.dupIndex,
      onTap: () => openSheet({ kind: 'detail', target: { kind: 'unit', unitId: u.id } }),
    });

    const bw = R * 1.4;
    const bx = cx - bw / 2;
    const by = cy - R * 0.98;
    const hpRatio = Math.max(0, Math.min(1, uf.hp / u.maxHp));
    svg.appendChild(el('rect', { x: bx, y: by, width: bw, height: 6, fill: '#000', opacity: 0.6, rx: 2 }));
    svg.appendChild(
      el('rect', {
        x: bx,
        y: by,
        width: bw * hpRatio,
        height: 6,
        fill: u.side === 'ally' ? '#57d9a3' : '#ff8f6b',
        rx: 2,
      }),
    );
    if (uf.shield > 0) {
      const sr = Math.min(1, uf.shield / u.maxHp);
      svg.appendChild(
        el('rect', { x: bx, y: by, width: bw * sr, height: 6, fill: '#e6edf7', opacity: 0.85, rx: 2 }),
      );
    }
    const manaRatio = Math.max(0, Math.min(1, uf.mana / u.maxMana));
    svg.appendChild(el('rect', { x: bx, y: by + 7, width: bw, height: 4, fill: '#000', opacity: 0.6, rx: 2 }));
    svg.appendChild(
      el('rect', { x: bx, y: by + 7, width: bw * manaRatio, height: 4, fill: '#7fb6ff', rx: 2 }),
    );

    let dx = bx;
    for (const k of DEBUFF_ORDER) {
      const v = uf.debuffs[k];
      if (v <= 0) continue;
      svg.appendChild(
        el(
          'text',
          { x: dx, y: cy + R * 0.98, 'font-size': 12, fill: DEBUFF_COLOR[k], 'font-weight': 700 },
          `${DEBUFF_LABEL[k]}${formatNumber(v)}`,
        ),
      );
      dx += 22;
    }
  }

  const t = frame!.t;
  const posOf = new Map(frame!.units.map((u) => [u.id, u.pos]));
  let idx = 0;
  for (const ev of rep.events) {
    if (Math.abs(ev.t - t) > 1e-6) continue;
    if (ev.type !== 'damage' && ev.type !== 'heal') continue;
    if (!ev.target || (ev.value ?? 0) <= 0) continue;
    const p = posOf.get(ev.target);
    if (!p) continue;
    const { cx, cy } = hexCenter(p);
    svg.appendChild(
      el(
        'text',
        {
          x: cx + ((idx % 2) * 16 - 8),
          y: cy - R * 1.05 - Math.floor(idx / 2) * 14,
          'text-anchor': 'middle',
          'font-size': 16,
          'font-weight': 700,
          fill: ev.type === 'heal' ? '#57d9a3' : '#ffe08a',
          stroke: '#000',
          'stroke-width': 1.2,
          'paint-order': 'stroke',
        },
        (ev.type === 'heal' ? '+' : '') + formatNumber(ev.value!),
      ),
    );
    idx++;
  }

  return svg;
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

/**
 * 盤面のマスをタップした時。
 * いま編成タブのカードに出ているキャラ（前衛）を、そのマスへ置く。
 *   - 空きマス   → そこへ移動（1タップ）
 *   - 他の味方   → その味方と位置を入れ替える（1タップ）
 */
function onCellTap(cell: Hex): void {
  const me = currentCardMember();
  if (!me) return;

  if (me.slot !== 'frontline') {
    state.message = 'このキャラは前衛ではありません（「前衛」を押すと置けます）';
    render();
    return;
  }

  const occ = occupiedBy(cell);
  if (occ === me.key) {
    state.message = 'すでにこのマスにいます';
    render();
    return;
  }

  const from = me.pos;
  if (occ) {
    // 入れ替え。自分がまだ盤上にいないなら、相手を空きマスへ移す
    const dest = from ?? freeCellExcept(cell);
    if (!dest) {
      state.message = '空いているマスがありません';
      render();
      return;
    }
    updateMember(occ, (o) => (o.pos = { ...dest }));
  }
  updateMember(me.key, (o) => {
    o.slot = 'frontline';
    o.pos = { ...cell };
  });
  state.message = `${getCharacter(me.charId).shortName} を (${cell.x},${cell.y}) に置いた`;
  render();
}

/** 指定マス以外の空きマス */
function freeCellExcept(except: Hex): Hex | null {
  const c = ALLY_CELLS.find(
    (x) => !(x.x === except.x && x.y === except.y) && !occupiedBy(x),
  );
  return c ? { ...c } : null;
}

function setSlot(key: string, slot: Slot): void {
  const me = memberOf(key);
  if (!me) return;
  const lim = slotLimits();
  if (me.slot === slot) {
    updateMember(key, (o) => {
      o.slot = 'none';
      o.pos = null;
    });
    if (state.selected === key) state.selected = null;
  } else {
    if (slot === 'frontline' && countSlot('frontline') >= lim.frontline) {
      state.message = `前衛は最大 ${lim.frontline} 体です`;
      render();
      return;
    }
    if (slot === 'support' && countSlot('support') >= lim.support) {
      state.message = `サポートは最大 ${lim.support} 体です`;
      render();
      return;
    }
    const cell = slot === 'frontline' && !me.pos ? freeCell() : me.pos;
    updateMember(key, (o) => {
      o.slot = slot;
      o.pos = slot === 'frontline' ? cell : null;
    });
    if (slot === 'support' && state.selected === key) state.selected = null;
  }
  state.message = '';
  render();
}

// --- シートの開閉（重ねて開く。閉じると1つ上の階層に戻る） ---

function openSheet(s: Sheet): void {
  if (state.sheets.length === 0) {
    state.resumeAfterSheet = state.playing;
    state.playing = false;
  }
  state.sheets.push(s);
  state.message = '';
  render();
}

/** 同じ階層のまま中身だけ差し替える（装備スロットの切り替えなど） */
function replaceSheet(s: Sheet): void {
  if (state.sheets.length === 0) state.sheets.push(s);
  else state.sheets[state.sheets.length - 1] = s;
  render();
}

function closeTopSheet(): void {
  state.sheets.pop();
  if (state.sheets.length === 0) {
    if (state.replay && state.resumeAfterSheet) state.playing = true;
    state.resumeAfterSheet = false;
  }
  render();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheets.length > 0) closeTopSheet();
});

// --- 画面モード ---

function setScreen(mode: ScreenMode): void {
  state.screen = mode;
}

/** いまのランのノードから、次に出すべき画面を決める */
function screenForNode(): ScreenMode {
  const run = state.run;
  if (!run || run.phase !== 'node') return 'prep';
  const node = currentNode(run, runCfg);
  if (!node) return 'prep';
  if (node.kind === 'shop' || node.kind === 'bossShop') return 'shop';
  if (node.kind === 'event') return run.lastEvent?.battleEncounterId ? 'event' : 'event';
  return 'prep';
}

// --- 戦闘 ---

function startBattle(context: BattleContext = 'sandbox', encounterId?: string): void {
  const err = validateLoadout();
  if (err) {
    state.message = err;
    state.runMessage = err;
    render();
    return;
  }
  const run = state.run;
  const encId = encounterId ?? activeEncounterId();
  const setup = buildBattleSetup(
    currentLoadout(),
    run ? runEncounter(run, encId, runCfg) : getEncounter(encId),
    {
      seed: `${state.seed}::${run ? `${run.chapter}-${run.nodeIndex}-${run.bossRetries}` : 'sandbox'}`,
      config: DEFAULT_CONFIG,
      logging: true,
    },
  );
  state.replay = buildReplay(setup);
  state.battleContext = context;
  state.pendingResult = context !== 'sandbox';
  state.frame = 0;
  state.playing = true;
  state.selected = null;
  state.sheets.length = 0;
  state.resumeAfterSheet = false;
  state.message = '';
  state.tab = 'control';
  setScreen('battle');
  state.tab = 'control';
  render();
}

function backToSetup(): void {
  state.replay = null;
  state.playing = false;
  state.frame = 0;
  state.sheets.length = 0;
  state.resumeAfterSheet = false;
  state.pendingResult = false;
  state.resultInfo = null;
  state.tab = 'team';
  setScreen(state.run ? screenForNode() : 'prep');
  if (state.screen === 'prep') state.tab = 'team';
  render();
}

/** 戦闘の結果をラン側に反映する */
function applyRunBattleResult(): void {
  const run = state.run;
  const rep = state.replay;
  if (!run || !rep) return;
  const won = rep.outcome === 'win';
  if (state.battleContext === 'runEvent') {
    const out = resolveEventBattle(run, won, runCfg);
    state.runMessage = `${out.text} ${out.changes.join(' / ')}`;
  } else {
    const res = applyBattleResult(run, won, runCfg);
    state.runMessage = won
      ? `勝利。コイン +${res.coinsGained}`
      : res.gameOver
        ? 'ライフが尽きた……'
        : res.bossRetry
          ? '敗北。ライフ -1。章ボスに再挑戦できる'
          : `敗北。ライフ -1・救援コイン +${res.coinsGained}`;
  }
  autoSave();
  state.pendingResult = false;
  state.replay = null;
  state.playing = false;
  state.frame = 0;
  showResult(won ? 'win' : 'lose', won ? '勝利！' : '敗北…', [state.runMessage]);
}

/** 結果を1画面にまとめて出す（戦闘・イベント共通） */
function showResult(tone: 'win' | 'lose' | 'neutral', title: string, lines: string[]): void {
  const run = state.run;
  let next = '';
  if (run && run.phase === 'node') {
    const node = currentNode(run, runCfg);
    next = node ? `次は「${NODE_LABEL[node.kind]}」` : '';
  } else if (run?.phase === 'clear') next = 'ランをクリアした';
  else if (run?.phase === 'gameover') next = 'ランはここまで';
  state.resultInfo = { tone, title, lines: [...lines.filter(Boolean), next].filter(Boolean) };
  setScreen('result');
  render();
}

/** リザルトを閉じて、次のノードの画面へ（進行演出は同じ画面にまとめた） */
function afterResult(): void {
  const run = state.run;
  state.resultInfo = null;
  state.runMessage = '';
  if (!run || run.phase !== 'node') {
    backToSetup();
    return;
  }
  setScreen(screenForNode());
  if (state.screen === 'prep') state.tab = 'team';
  render();
}

// ---------------------------------------------------------------------------
// ラン（セーブ）
// ---------------------------------------------------------------------------

function autoSave(): void {
  if (state.run) saveRun(state.run);
}

/**
 * ★が上がった直後のスキル3択を、待ち行列の先頭から1件ずつ出す。
 * 選び終わるまで他の操作には進ませない。
 */
function pumpSkillChoice(): boolean {
  const run = state.run;
  if (!run || run.pendingSkills.length === 0) return false;
  const top = state.sheets[state.sheets.length - 1];
  if (top?.kind !== 'skillChoice') state.sheets.push({ kind: 'skillChoice' });
  return true;
}

function startRun(): void {
  state.run = createRun(state.seed, runCfg);
  state.savedRun = null;
  state.cardIndex = 0;
  state.runMessage = 'ランを始めた。';
  state.resultInfo = null;
  state.replay = null;
  autoSave();
  setScreen(screenForNode());
  state.tab = state.screen === 'prep' ? 'team' : 'run';
  render();
}

function resumeRun(r: RunState): void {
  state.run = r;
  state.savedRun = null;
  state.cardIndex = 0;
  state.seed = r.seed;
  state.runMessage = 'ランを再開した。';
  setScreen(screenForNode());
  state.tab = state.screen === 'prep' ? 'team' : 'run';
  render();
}

function abandonRun(): void {
  state.run = null;
  state.savedRun = null;
  clearRun();
  state.cardIndex = 0;
  state.runMessage = 'ランをやめた。';
  state.resultInfo = null;
  setScreen('prep');
  state.tab = 'run';
  render();
}

// ---------------------------------------------------------------------------
// 詳細の組み立て
// ---------------------------------------------------------------------------

interface SkillRow {
  label: string;
  name: string;
  summary: string;
}

interface DetailView {
  title: string;
  id: string;
  tags: { text: string; cls?: string }[];
  rows: [string, string][];
  /** 装備スロット（★の数だけ。空きは ''） */
  equipment: string[];
  skills: SkillRow[];
}

function statRows(s: Stats, hpNow: number | null, manaNow: number | null): [string, string][] {
  return [
    ['HP', hpNow === null ? formatNumber(s.maxHp) : `${formatNumber(hpNow)} / ${formatNumber(s.maxHp)}`],
    ['攻撃力', formatNumber(s.atk)],
    ['防御', formatNumber(s.def)],
    ['攻撃速度', `${s.atkSpeed.toFixed(2)} 回/秒`],
    ['射程', `${formatNumber(s.range)} マス`],
    ['マナ', manaNow === null ? formatNumber(s.maxMana) : `${formatNumber(manaNow)} / ${formatNumber(s.maxMana)}`],
  ];
}

function baseEffectName(name: string): string {
  return name.replace(/\(\d+\)$/, '');
}

function mergeDefs(label: string, defs: readonly EffectDef[]): SkillRow {
  const seen = new Set<string>();
  const uniq: EffectDef[] = [];
  for (const d of defs) {
    if (seen.has(d.summary)) continue;
    seen.add(d.summary);
    uniq.push(d);
  }
  if (uniq.length === 0) return { label, name: 'なし', summary: 'この枠の効果はありません' };
  return {
    label,
    name: uniq.map((d) => baseEffectName(d.name)).join(' ／ '),
    summary: uniq.map((d) => d.summary).join('\n'),
  };
}

/** 覚えているスキルを種類ごとに並べる */
function memberSkillRows(m: Member): SkillRow[] {
  const byKind = (kind: string, label: string): SkillRow =>
    mergeDefs(
      label,
      m.skills
        .map((id) => getSkill(m.charId, id))
        .filter((sk) => sk.kind === kind)
        .map((sk) => sk.def),
    );
  return [byKind('active', 'アクティブ'), byKind('passive', 'パッシブ'), byKind('support', 'サポート効果')];
}

function enemySkills(e: EnemyDef): SkillRow[] {
  return [
    e.active
      ? { label: 'アクティブ', name: baseEffectName(e.active.name), summary: e.active.summary }
      : { label: 'アクティブ', name: 'なし', summary: 'この枠の効果はありません' },
    mergeDefs('パッシブ', e.passives ?? []),
    { label: 'サポート効果', name: 'なし', summary: 'この枠の効果はありません' },
  ];
}

function debuffRow(debuffs: Record<DebuffKind, number>): string {
  const parts = DEBUFF_ORDER.filter((k) => debuffs[k] > 0).map(
    (k) => `${DEBUFF_FULL[k]} ${formatNumber(debuffs[k])}`,
  );
  return parts.length > 0 ? parts.join('・') : 'なし';
}

function memberStats(m: Member): Stats {
  return resolveMembers({
    frontline: [
      {
        charId: m.charId,
        star: m.star,
        skills: m.skills,
        equipment: m.equipment.filter((x) => x !== ''),
        pos: { x: 2, y: 3 },
      },
    ],
    support: [],
    blessings: [],
  })[0]!.stats;
}

function buildDetailView(target: DetailTarget): DetailView | null {
  if (target.kind === 'member') {
    const m = memberOf(target.key);
    if (!m) return null;
    const c = getCharacter(m.charId);
    return {
      title: c.name,
      id: c.id,
      tags: [
        { text: ROLE_LABEL[c.role] },
        { text: ELEMENT_LABEL[c.element], cls: `el-${c.element}` },
        { text: MYTH_LABEL[c.myth] },
        { text: `★${m.star}` },
        { text: m.slot === 'frontline' ? '前衛' : m.slot === 'support' ? 'サポート' : '未編成' },
      ],
      rows: statRows(memberStats(m), null, null),
      equipment: m.equipment,
      skills: memberSkillRows(m),
    };
  }

  if (target.kind === 'enemySlot') {
    const units = getEncounter(activeEncounterId()).units;
    const eu = units[target.index];
    if (!eu) return null;
    const def = getEnemy(eu.enemyId);
    const scale = eu.scale ?? 1;
    const stats: Stats = { ...def.base, maxHp: def.base.maxHp * scale, atk: def.base.atk * scale };
    const dup = enemyDupIndexes()[target.index];
    return {
      title: `${def.name}${dup ? ` ${dup}` : ''}`,
      id: def.id,
      tags: [
        { text: ROLE_LABEL[def.role] },
        { text: ELEMENT_LABEL[def.element], cls: `el-${def.element}` },
        { text: def.isBoss ? 'ボス' : '敵' },
      ],
      rows: [...statRows(stats, null, null), ['耐性', `${Math.round(def.resist * 100)}%`]],
      equipment: [],
      skills: enemySkills(def),
    };
  }

  const rep = state.replay;
  if (!rep) return null;
  const u = rep.units.find((x) => x.id === target.unitId);
  if (!u) return null;
  const frame = rep.frames[Math.min(state.frame, rep.frames.length - 1)]!;
  const uf = frame.units.find((x) => x.id === u.id);
  if (!uf) return null;

  const c = charOf(u.defId);
  const e = c ? null : enemyOf(u.defId);

  return {
    title: `${u.name}${u.dupIndex ? ` ${u.dupIndex}` : ''}`,
    id: u.defId,
    tags: [
      { text: ROLE_LABEL[u.role] },
      { text: ELEMENT_LABEL[u.element], cls: `el-${u.element}` },
      { text: u.myth ? MYTH_LABEL[u.myth] : e?.isBoss ? 'ボス' : '敵' },
      { text: u.side === 'ally' ? `★${u.star}` : '敵' },
      ...(u.onField ? [] : [{ text: 'サポート枠' }]),
      ...(uf.alive ? [] : [{ text: '戦闘不能' }]),
    ],
    rows: [
      ...statRows({ ...uf.stats, maxHp: u.maxHp, maxMana: u.maxMana }, uf.hp, uf.mana),
      ...(uf.shield > 0 ? ([['シールド', formatNumber(uf.shield)]] as [string, string][]) : []),
      ['デバフ', debuffRow(uf.debuffs)],
    ],
    equipment: [],
    skills: c ? enemyOrMemberSkills(u.defId) : e ? enemySkills(e) : [],
  };
}

/** 戦闘中のユニット詳細：味方はその個体が覚えているスキル、敵は定義のスキル */
function enemyOrMemberSkills(defId: string): SkillRow[] {
  const m = party().find((x) => x.charId === defId);
  if (m) return memberSkillRows(m);
  const c = charOf(defId);
  if (!c) return [];
  return memberSkillRows({
    key: c.id,
    charId: c.id,
    star: 1,
    skills: c.initialSkills,
    equipment: [],
    slot: 'none',
    pos: null,
  });
}

// ---------------------------------------------------------------------------
// 再生ループ
// ---------------------------------------------------------------------------

let lastTs = 0;
let acc = 0;
function loop(ts: number): void {
  const dt = lastTs === 0 ? 0 : (ts - lastTs) / 1000;
  lastTs = ts;
  const rep = state.replay;
  if (rep && state.playing) {
    acc += dt * state.speed;
    const step = DEFAULT_CONFIG.tick;
    let advanced = false;
    while (acc >= step) {
      acc -= step;
      if (state.frame < rep.frames.length - 1) {
        state.frame++;
        advanced = true;
      } else {
        state.playing = false;
        advanced = true;
        break;
      }
    }
    if (advanced) render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function btn(label: string, on: boolean, fn: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = [on ? 'on' : '', cls].filter(Boolean).join(' ');
  b.addEventListener('click', fn);
  return b;
}

// ---------------------------------------------------------------------------
// 「編成」タブ（1体ずつのカード表示）
// ---------------------------------------------------------------------------

/** いま下部バーに出ているメンバー */
export function currentCardMember(): Member | null {
  const list = party();
  if (list.length === 0) return null;
  const i = ((state.cardIndex % list.length) + list.length) % list.length;
  return list[i]!;
}

function pageBy(delta: number): void {
  const n = party().length;
  if (n === 0) return;
  state.cardIndex = (((state.cardIndex + delta) % n) + n) % n;
  state.message = '';
  render();
}

function slotLabel(m: Member): string {
  if (m.slot === 'frontline') return m.pos ? `前衛（${m.pos.x},${m.pos.y}）` : '前衛（未配置）';
  if (m.slot === 'support') return 'サポート配置中（盤面には配置されません）';
  return '未配置';
}

function renderTeamTab(body: HTMLElement): void {
  const list = party();
  const lim = slotLimits();
  const summary = h('div', 'team-summary');
  summary.appendChild(
    h(
      'span',
      undefined,
      `前衛 ${countSlot('frontline')}/${lim.frontline}・サポート ${countSlot('support')}/${lim.support}`,
    ),
  );
  summary.appendChild(
    h('span', 'char-page-indicator', `${state.cardIndex + 1} / ${list.length}`),
  );
  body.appendChild(summary);
  body.appendChild(
    h(
      'div',
      'hint' + (validateLoadout() ? ' err' : ''),
      state.message || validateLoadout() || '盤面のマスをタップすると、このキャラを置ける',
    ),
  );

  const m = currentCardMember();
  if (!m) {
    body.appendChild(h('div', 'hint', '所持しているキャラがいません'));
    return;
  }
  const c = getCharacter(m.charId);
  const stats = memberStats(m);

  const pager = h('div', 'char-pager');
  pager.appendChild(btn('◀', false, () => pageBy(-1), 'pager-prev'));

  const card = h(
    'div',
    ['char', `slot-${m.slot}`, state.selected === m.key ? 'selected' : ''].filter(Boolean).join(' '),
  );

  // 1行目: 名前・属性・役割・ID・★（タップ対象ではないので低い）
  const head = h('div', 'char-head');
  head.appendChild(h('div', 'char-name', c.name));
  head.appendChild(h('span', 'tag star-tag', `★${m.star}`));
  head.appendChild(h('span', `tag el-${c.element}`, ELEMENT_LABEL[c.element]));
  head.appendChild(h('span', 'tag', ROLE_LABEL[c.role]));
  head.appendChild(h('span', 'char-id', c.id));
  card.appendChild(head);

  // 2行目: 配置状態＋簡易ステータス
  const line2 = h('div', 'char-line2');
  line2.appendChild(h('span', `char-slot-state state-${m.slot}`, slotLabel(m)));
  const quick = h('span', 'char-quick');
  for (const [k, v] of [
    ['HP', formatNumber(stats.maxHp)],
    ['攻', formatNumber(stats.atk)],
    ['防', formatNumber(stats.def)],
    ['射', formatNumber(stats.range)],
  ] as [string, string][]) {
    const cell = h('span', 'quick-cell');
    cell.appendChild(h('span', 'quick-k', k));
    cell.appendChild(h('span', 'quick-v', v));
    quick.appendChild(cell);
  }
  line2.appendChild(quick);
  card.appendChild(line2);

  // 3行目: 操作（★はラン外だけ／前衛・サポート・装備・詳細）
  const sub = h('div', 'char-sub');
  if (!state.run) {
    // ラン外のサンドボックス（動作確認用）でだけ★を直接変えられる
    const starSel = document.createElement('select');
    starSel.className = 'sandbox-star';
    for (const st of [1, 2, 3]) {
      const o = document.createElement('option');
      o.value = String(st);
      o.textContent = `★${st}`;
      if (m.star === st) o.selected = true;
      starSel.appendChild(o);
    }
    starSel.addEventListener('change', () => {
      updateMember(m.key, (o) => (o.star = Number(starSel.value) as Star));
      render();
    });
    sub.appendChild(starSel);
  }
  sub.appendChild(btn('前衛', m.slot === 'frontline', () => setSlot(m.key, 'frontline')));
  sub.appendChild(btn('サポ', m.slot === 'support', () => setSlot(m.key, 'support')));
  sub.appendChild(
    btn(`装備 ${m.equipment.filter((x) => x !== '').length}/${m.equipment.length}`, false, () =>
      openSheet({ kind: 'equip', key: m.key, slot: firstOpenSlot(m) }),
    ),
  );
  sub.appendChild(
    btn('詳細', false, () => openSheet({ kind: 'detail', target: { kind: 'member', key: m.key } })),
  );
  card.appendChild(sub);

  pager.appendChild(card);
  pager.appendChild(btn('▶', false, () => pageBy(1), 'pager-next'));
  body.appendChild(pager);
}

/** 空いている装備スロット（なければ0番） */
function firstOpenSlot(m: Member): number {
  const i = m.equipment.findIndex((x) => x === '');
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// 「加護」タブ
// ---------------------------------------------------------------------------

function ownedBlessings(): string[] {
  return state.run ? state.run.blessings : [...state.blessings];
}

function blessingRow(id: string, withToggle: boolean): HTMLElement {
  const b = getBlessing(id);
  const owned = ownedBlessings().includes(b.id);
  const row = h('div', 'blessing-row' + (owned ? ' owned' : ''));
  const col = h('div', 'blessing-main');
  const head = h('div', 'blessing-head');
  head.appendChild(h('span', 'blessing-name', b.name));
  head.appendChild(h('span', `tag rarity-${b.rarity}`, RARITY_LABEL[b.rarity]));
  col.appendChild(head);
  col.appendChild(h('div', 'blessing-desc', b.desc));
  row.appendChild(col);
  if (withToggle) {
    row.appendChild(
      btn(owned ? '所持' : '入手', owned, () => {
        if (state.run) {
          // ラン中はショップ／イベントからしか手に入らない
          state.message = 'ラン中の加護は、ショップとイベントから手に入ります';
          render();
          return;
        }
        if (state.blessings.has(b.id)) state.blessings.delete(b.id);
        else state.blessings.add(b.id);
        render();
      }),
    );
  }
  row.appendChild(
    btn('説明', false, () => openSheet({ kind: 'explain', title: b.name, text: b.summary })),
  );
  return row;
}

function renderBlessingTab(body: HTMLElement): void {
  const owned = ownedBlessings();
  const section = h('div', 'blessings');

  if (state.run) {
    // ラン中は所持している加護だけを見せる
    body.appendChild(h('div', 'hint', `所持している加護 ${owned.length}`));
    if (owned.length === 0) {
      body.appendChild(h('div', 'hint', 'まだ加護を持っていません（ショップとイベントで手に入ります）'));
    }
    for (const id of owned) section.appendChild(blessingRow(id, false));
    body.appendChild(section);
    renderInventory(body);
    return;
  }

  body.appendChild(h('div', 'hint', `所持 ${owned.length} / ${BLESSINGS.length}`));
  const sorted = [...BLESSINGS].sort(
    (a, b) => (owned.includes(a.id) ? 0 : 1) - (owned.includes(b.id) ? 0 : 1),
  );
  for (const b of sorted) section.appendChild(blessingRow(b.id, true));
  body.appendChild(section);
}

/** ラン中の所持装備（同じものは「×2」とまとめる） */
function renderInventory(body: HTMLElement): void {
  const run = state.run;
  if (!run) return;
  body.appendChild(h('div', 'hint', '持っている装備'));
  const counts = new Map<string, number>();
  for (const id of run.inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (counts.size === 0) {
    body.appendChild(h('div', 'hint', 'まだ装備を持っていません'));
    return;
  }
  const list = h('div', 'blessings');
  for (const [id, n] of counts) {
    const e = getEquipment(id);
    const row = h('div', 'blessing-row inventory-row');
    const col = h('div', 'blessing-main');
    const head = h('div', 'blessing-head');
    head.appendChild(h('span', 'blessing-name', n > 1 ? `${e.name} ×${n}` : e.name));
    head.appendChild(h('span', `tag equip-tier-${e.tier}`, `★${e.tier}`));
    col.appendChild(head);
    col.appendChild(h('div', 'blessing-desc', e.desc));
    row.appendChild(col);
    row.appendChild(
      btn('説明', false, () => openSheet({ kind: 'explain', title: e.name, text: e.desc })),
    );
    list.appendChild(row);
  }
  body.appendChild(list);
}

// ---------------------------------------------------------------------------
// ラン関連の画面（メイン画面に出す）
// ---------------------------------------------------------------------------

function shopItemLabel(item: ShopItem): { name: string; desc: string } {
  switch (item.kind) {
    case 'character': {
      const c = getCharacter(item.charId);
      return { name: c.name, desc: `${ROLE_LABEL[c.role]}・${ELEMENT_LABEL[c.element]}` };
    }
    case 'blessing': {
      const b = getBlessing(item.blessingId);
      return { name: b.name, desc: `${RARITY_LABEL[b.rarity]}｜${b.desc}` };
    }
    case 'equipment': {
      const e = getEquipment(item.equipmentId);
      return { name: e.name, desc: e.desc };
    }
    case 'sixthSlot':
      return { name: '6体目枠', desc: 'サポート枠がひとつ増える' };
    case 'promotion':
      return { name: '昇格', desc: 'サポート枠がひとつ前衛枠になる' };
  }
}

/** 進行マップ（メイン画面・ランタブの両方で使う） */
function progressMapEl(run: RunState, animate = false): HTMLElement {
  const map = h('div', 'run-map' + (animate ? ' moving' : ''));
  for (const n of progressMap(run, runCfg)) {
    map.appendChild(
      h('span', 'run-node' + (n.done ? ' done' : '') + (n.current ? ' current' : ''), n.label),
    );
  }
  return map;
}

function runHeader(run: RunState): HTMLElement {
  return h(
    'div',
    'run-status',
    `${run.chapter}章 ／ ♥ ${run.life} ／ ${run.coins}c ／ 前衛${run.frontlineSlots}・サポ${run.supportSlots}`,
  );
}

/** リザルト画面（戦闘結果・イベント結果を1画面にまとめる） */
function renderResultScreen(main: HTMLElement): void {
  const run = state.run;
  const info = state.resultInfo;
  const panel = h('div', 'screen-panel result-screen');

  if (run && run.phase === 'clear') {
    panel.appendChild(h('div', 'screen-title win', 'クリア！'));
    panel.appendChild(h('div', 'screen-text', '最終章のボスを倒した。'));
    panel.appendChild(btn('新しいランを始める', true, startRun, 'next-btn'));
    main.appendChild(panel);
    return;
  }
  if (run && run.phase === 'gameover') {
    panel.appendChild(h('div', 'screen-title lose', 'ゲームオーバー'));
    panel.appendChild(h('div', 'screen-text', 'ライフが尽きた。'));
    panel.appendChild(btn('新しいランを始める', true, startRun, 'next-btn'));
    main.appendChild(panel);
    return;
  }

  const tone = info?.tone ?? 'neutral';
  panel.appendChild(h('div', `screen-title ${tone}`, info?.title ?? '結果'));
  const block = h('div', 'result-block');
  for (const line of info?.lines ?? []) block.appendChild(h('div', 'screen-text', line));
  panel.appendChild(block);
  if (run) panel.appendChild(runHeader(run));
  panel.appendChild(btn('次へ', false, afterResult, 'next-btn'));
  main.appendChild(panel);
}

/** ショップ画面 */
function renderShopScreen(main: HTMLElement): void {
  const run = state.run!;
  const shop = run.shop!;
  const panel = h('div', 'screen-panel shop-screen');
  panel.appendChild(
    h('div', 'screen-title', shop.boss ? 'ボスショップ' : 'リザルト ＆ ショップ'),
  );
  panel.appendChild(runHeader(run));
  if (state.runMessage) panel.appendChild(h('div', 'hint', state.runMessage));

  const list = h('div', 'shop-list');
  shop.items.forEach((slot, i) => {
    const { name, desc } = shopItemLabel(slot.item);
    const row = h('div', 'shop-row' + (slot.sold ? ' sold' : ''));
    const col = h('div', 'shop-main');
    col.appendChild(h('div', 'shop-name', name));
    col.appendChild(h('div', 'shop-desc', desc));
    row.appendChild(col);
    const b = btn(slot.sold ? '売切' : `${slot.item.price}c`, false, () => {
      if (buyShopItem(run, i, runCfg)) {
        state.runMessage = `${name} を購入`;
        autoSave();
      } else {
        state.runMessage = 'コインが足りないか、もう買えません';
      }
      render();
    });
    b.disabled = slot.sold || run.coins < slot.item.price;
    row.appendChild(b);
    list.appendChild(row);
  });
  panel.appendChild(list);

  const row = h('div', 'row');
  const rb = btn(`リロール ${shop.rerollCost}c`, false, () => {
    if (rerollShop(run, runCfg)) {
      state.runMessage = '品を引き直した';
      autoSave();
    } else state.runMessage = 'コインが足りません';
    render();
  });
  rb.disabled = run.coins < shop.rerollCost;
  row.appendChild(rb);
  row.appendChild(
    btn('次へ進む', true, () => {
      advanceNode(run, runCfg);
      autoSave();
      state.runMessage = '';
      showResult('neutral', 'ショップを後にした', []);
    }),
  );
  panel.appendChild(row);
  main.appendChild(panel);
}

/** 選択前に「大まかに何が起こりうるか」を示す */
function rewardLabel(r: { kind: string; amount?: number }): string {
  switch (r.kind) {
    case 'coins':
      return 'コイン';
    case 'equipment':
      return '装備';
    case 'blessing':
      return '加護';
    case 'character':
      return '仲間';
    case 'star':
      return 'ランクアップ';
    case 'life':
      return 'ライフ';
    case 'sixthSlot':
      return '6体目枠';
    case 'promotion':
      return '昇格';
    default:
      return '何も';
  }
}

const PENALTY_LABEL: Record<string, string> = {
  life: 'ライフ1',
  equipment: '装備1つ',
  blessing: '加護1つ',
  coinsHalf: 'コインの半分',
};

function choiceOutlook(c: {
  safe: boolean;
  reward: { kind: string; amount?: number };
  gamble?: { chance: number; penalties: string[] };
  battle?: { encounterId: string; dangerous: boolean };
}): string {
  const gain = rewardLabel(c.reward);
  if (c.safe) return `〈安全〉${gain}を得る`;
  if (c.battle) {
    return c.battle.dangerous
      ? `〈危険な戦闘〉勝てば${gain}、負ければライフ1を失う`
      : `〈ミニ戦闘〉勝てば${gain}、負けても失うものはない`;
  }
  const lose = (c.gamble?.penalties ?? []).map((p) => PENALTY_LABEL[p] ?? p).join('か');
  return `〈賭け〉成功で${gain}、失敗で${lose}を失う`;
}

/** イベント画面 */
function renderEventScreen(main: HTMLElement): void {
  const run = state.run!;
  const def = getEvent(run.eventId!);
  const pending = Boolean(run.lastEvent?.battleEncounterId);
  const panel = h('div', 'screen-panel event-screen');
  panel.appendChild(h('div', 'screen-title', def.name));
  panel.appendChild(h('div', 'event-text', def.text));
  if (state.runMessage) panel.appendChild(h('div', 'hint', state.runMessage));

  if (pending) {
    panel.appendChild(
      btn(
        '▶ ミニ戦闘へ',
        true,
        () => startBattle('runEvent', run.lastEvent!.battleEncounterId!),
        'wide',
      ),
    );
    main.appendChild(panel);
    return;
  }

  def.choices.forEach((c, i) => {
    const row = h('div', 'shop-row');
    const col = h('div', 'shop-main');
    col.appendChild(h('div', 'shop-name', c.label));
    col.appendChild(
      h(
        'div',
        'shop-desc',
        choiceOutlook(c),
      ),
    );
    row.appendChild(col);
    row.appendChild(
      btn('選ぶ', false, () => {
        const out = chooseEvent(run, i as 0 | 1, runCfg);
        autoSave();
        if (out.battleEncounterId) {
          state.runMessage = 'ミニ戦闘に挑む';
          render();
          return;
        }
        state.runMessage = '';
        showResult(
          out.success ? 'win' : 'lose',
          out.success ? '成功！' : '失敗…',
          [out.text, ...out.changes],
        );
      }),
    );
    panel.appendChild(row);
  });
  main.appendChild(panel);
}

/** 「ラン」タブ：進行状況の確認だけ */
function renderRunTab(body: HTMLElement): void {
  const run = state.run;

  if (!run) {
    if (state.savedRun) {
      const sv = state.savedRun;
      body.appendChild(h('div', 'hint', '保存されたランがあります。再開しますか？'));
      body.appendChild(
        h('div', 'run-status', `${sv.chapter}章 / ライフ ${sv.life} / コイン ${sv.coins}`),
      );
      const row = h('div', 'row');
      row.appendChild(btn('再開する', true, () => resumeRun(sv)));
      row.appendChild(btn('破棄して新規', false, abandonRun));
      body.appendChild(row);
      return;
    }
    body.appendChild(
      h('div', 'hint', 'ランを始めると、章の進行（戦闘→ショップ→イベント）が動きます'),
    );
    body.appendChild(btn('▶ 新しいランを始める', true, startRun));
    if (state.runMessage) body.appendChild(h('div', 'hint', state.runMessage));
    return;
  }

  body.appendChild(runHeader(run));
  if (run.phase === 'node') {
    body.appendChild(progressMapEl(run));
    const node = currentNode(run, runCfg)!;
    body.appendChild(h('div', 'hint', `いまのノード: ${NODE_LABEL[node.kind]}`));
    if (run.bossRetries > 0) {
      body.appendChild(h('div', 'hint err', `章ボスに再挑戦（${run.bossRetries}回目）`));
    }
  } else {
    body.appendChild(h('div', 'hint', run.phase === 'clear' ? 'クリア済み' : 'ゲームオーバー'));
  }
  const foot = h('div', 'row');
  foot.appendChild(btn('ランをやめる', false, abandonRun));
  body.appendChild(foot);
}

// ---------------------------------------------------------------------------
// 「操作」タブ
// ---------------------------------------------------------------------------

function renderControlTab(body: HTMLElement): void {
  const rep = state.replay;

  body.appendChild(h('div', 'hint', '再生'));
  const play = h('div', 'row');
  for (const s of [1, 2, 4] as const) {
    play.appendChild(
      btn(`${s}倍`, state.speed === s, () => {
        state.speed = s;
        render();
      }),
    );
  }
  const skip = btn('⏭ スキップ', false, () => {
    if (!rep) return;
    state.frame = rep.frames.length - 1;
    state.playing = false;
    state.resumeAfterSheet = false;
    render();
  });
  skip.disabled = !rep;
  play.appendChild(skip);
  body.appendChild(play);

  body.appendChild(h('div', 'hint', '遭遇'));
  const encRow = h('div', 'row');
  for (const e of ENCOUNTERS) {
    const b = btn(e.id, activeEncounterId() === e.id, () => {
      state.encounterId = e.id;
      state.sheets.length = 0;
      render();
    });
    if (rep || inRun()) b.disabled = true;
    encRow.appendChild(b);
  }
  body.appendChild(encRow);
  body.appendChild(h('div', 'hint', getEncounter(activeEncounterId()).name));

  body.appendChild(h('div', 'hint', 'シード'));
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = state.seed;
  seedInput.disabled = rep !== null || inRun();
  seedInput.addEventListener('input', () => {
    state.seed = seedInput.value;
  });
  body.appendChild(seedInput);

  if (!rep) return;

  const frame = rep.frames[Math.min(state.frame, rep.frames.length - 1)]!;
  const atEnd = state.frame >= rep.frames.length - 1;
  if (atEnd) {
    const label =
      rep.outcome === 'win'
        ? '勝利'
        : rep.outcome === 'lose'
          ? '敗北'
          : rep.outcome === 'draw'
            ? '引き分け'
            : '時間切れ（敗北扱い）';
    body.appendChild(h('div', `result ${rep.outcome}`, `${label} ／ ${rep.duration.toFixed(1)}s`));
  }

  body.appendChild(h('div', 'hint', 'ユニット（タップで詳細）'));
  const byId = new Map(rep.units.map((u) => [u.id, u]));
  for (const uf of frame.units) {
    const u = byId.get(uf.id)!;
    const line = h('div', 'unit-line');
    const debuffs = DEBUFF_ORDER.filter((k) => uf.debuffs[k] > 0)
      .map((k) => `${DEBUFF_LABEL[k]}${formatNumber(uf.debuffs[k])}`)
      .join(' ');
    const dup = u.dupIndex ? `${u.dupIndex}` : '';
    line.textContent =
      `${u.side === 'ally' ? '味' : '敵'} ${shortNameOf(u.defId)}${dup}${u.onField ? '' : '[サポート]'} ` +
      `HP ${formatNumber(uf.hp)}/${formatNumber(u.maxHp)} ` +
      `MP ${formatNumber(uf.mana)}/${formatNumber(u.maxMana)}` +
      (uf.shield > 0 ? ` 盾 ${formatNumber(uf.shield)}` : '') +
      (debuffs ? ` ${debuffs}` : '') +
      (uf.alive ? '' : ' 戦闘不能');
    line.style.color = uf.alive ? (u.side === 'ally' ? '#9fc8ff' : '#ffb0b0') : '#6b7086';
    line.addEventListener('click', () =>
      openSheet({ kind: 'detail', target: { kind: 'unit', unitId: u.id } }),
    );
    body.appendChild(line);
  }

  body.appendChild(h('div', 'hint', `ログ ${rep.events.length} 件・hash ${rep.logHash}`));
  const logBox = h('div', 'log');
  for (const e of rep.events.filter((x) => x.t <= frame.t + 1e-6).slice(-400)) {
    const d = h('div');
    const parts: string[] = [e.type];
    if (e.actor) parts.push(e.actor);
    if (e.target) parts.push(`→${e.target}`);
    if (e.value !== undefined) parts.push(formatNumber(e.value));
    if (e.debuff) parts.push(DEBUFF_LABEL[e.debuff]);
    if (e.note) parts.push(e.note);
    if (e.pos) parts.push(`(${e.pos.x},${e.pos.y})`);
    d.appendChild(h('span', 't', e.t.toFixed(1)));
    d.appendChild(document.createTextNode(' '));
    d.appendChild(h('span', e.actor?.startsWith('E') ? 'e' : 'a', parts.join(' ')));
    logBox.appendChild(d);
  }
  body.appendChild(logBox);
  logBox.scrollTop = logBox.scrollHeight;
}

// ---------------------------------------------------------------------------
// 下部バー
// ---------------------------------------------------------------------------

function renderBottomBar(root: HTMLElement): void {
  const bar = h('div', 'bottom-bar');
  const inBattle = state.screen === 'battle';
  // 止めるのは戦闘の再生中だけ。ショップ・イベント・リザルト中もタブから編成や加護を見られる
  const tabRow = h('div', 'tab-row');
  for (const t of TABS) {
    const disabled = inBattle && t.id !== 'control';
    const b = btn(
      t.label,
      state.tab === t.id,
      () => {
        state.tab = t.id;
        render();
      },
      'tab',
    );
    b.disabled = disabled;
    b.setAttribute('data-tab', t.id);
    tabRow.appendChild(b);
  }
  bar.appendChild(tabRow);

  const body = h('div', 'tab-body');
  if (state.tab === 'team') renderTeamTab(body);
  else if (state.tab === 'blessing') renderBlessingTab(body);
  else if (state.tab === 'run') renderRunTab(body);
  else renderControlTab(body);
  bar.appendChild(body);

  const action = h('div', 'action-row');
  if (state.screen === 'prep') {
    const node = state.run && state.run.phase === 'node' ? currentNode(state.run, runCfg) : null;
    if (node && (node.kind === 'battle' || node.kind === 'boss')) {
      action.appendChild(btn('▶ この戦闘に挑む', true, () => startBattle('runNode'), 'wide'));
    } else {
      action.appendChild(btn('▶ 戦闘開始', true, () => startBattle('sandbox'), 'wide'));
    }
  } else if (state.screen === 'battle') {
    const rep = state.replay!;
    const atEnd = state.frame >= rep.frames.length - 1;
    if (state.pendingResult && atEnd) {
      action.appendChild(btn('結果へ', true, applyRunBattleResult, 'wide'));
    } else {
      action.appendChild(btn('← 編成に戻る', false, backToSetup));
      action.appendChild(
        btn(
          state.playing ? '⏸ 一時停止' : '▶ 再生',
          state.playing,
          () => {
            if (atEnd) state.frame = 0;
            state.playing = !state.playing;
            state.resumeAfterSheet = false;
            render();
          },
          'wide',
        ),
      );
    }
  } else {
    action.appendChild(h('span', 'hint', 'メイン画面の操作を進めてください'));
  }
  bar.appendChild(action);

  root.appendChild(bar);
}

// ---------------------------------------------------------------------------
// シート（重ねて開くスタック）
// ---------------------------------------------------------------------------

/**
 * シート1枚の外枠。スタックの深さ（depth）と、最前面かどうか（isTop）で挙動を変える。
 * 背面のシートは操作できない（pointer-events: none）。
 */
function sheetShell(
  title: string,
  opts: { small?: boolean; depth: number; isTop: boolean },
): { wrap: DocumentFragment; body: HTMLElement } {
  const { small = false, depth, isTop } = opts;
  const z = 40 + depth * 2;

  const wrap = document.createDocumentFragment();
  const backdrop = h('div', 'sheet-backdrop' + (isTop ? '' : ' behind'));
  backdrop.style.zIndex = String(z);
  if (isTop) backdrop.addEventListener('click', closeTopSheet);
  wrap.appendChild(backdrop);

  const sheet = h('div', 'sheet' + (small ? ' small' : '') + (isTop ? '' : ' behind'));
  sheet.style.zIndex = String(z + 1);
  sheet.dataset.depth = String(depth);
  const head = h('div', 'sheet-head');
  head.appendChild(h('div', 'sheet-title', title));
  const close = btn('✕', false, closeTopSheet, 'sheet-close');
  close.disabled = !isTop;
  head.appendChild(close);
  sheet.appendChild(head);
  wrap.appendChild(sheet);
  return { wrap, body: sheet };
}

function renderDetailSheet(
  root: HTMLElement,
  target: DetailTarget,
  depth: number,
  isTop: boolean,
): void {
  const view = buildDetailView(target);
  if (!view) {
    state.sheets.pop();
    return;
  }
  const { wrap, body } = sheetShell(view.title, { depth, isTop });
  body.classList.add('detail');
  body.querySelector('.sheet-title')!.classList.add('detail-title');

  body.appendChild(h('div', 'char-id', view.id));

  const tagRow = h('div', 'row');
  for (const t of view.tags) tagRow.appendChild(h('span', `tag ${t.cls ?? ''}`.trim(), t.text));
  body.appendChild(tagRow);

  const grid = h('div', 'detail-grid');
  for (const [k, v] of view.rows) {
    grid.appendChild(h('div', 'dk', k));
    grid.appendChild(h('div', 'dv', v));
  }
  body.appendChild(grid);

  if (view.equipment.length === 0) {
    const row = h('div', 'equip-row');
    row.appendChild(h('span', 'equip-label', '装備'));
    row.appendChild(h('span', 'equip-name', 'なし'));
    body.appendChild(row);
  } else {
    view.equipment.forEach((id, i) => {
      const row = h('div', 'equip-row');
      row.appendChild(h('span', 'equip-label', `装備${i + 1}`));
      const def = id ? getEquipment(id) : null;
      row.appendChild(h('span', 'equip-name', def ? def.name : '装備なし'));
      if (def) {
        row.appendChild(
          btn('説明', false, () => openSheet({ kind: 'explain', title: def.name, text: def.desc })),
        );
      }
      body.appendChild(row);
    });
  }

  const teamRow = h('div', 'skill team-row');
  teamRow.appendChild(h('span', 'skill-label', 'チーム全体'));
  const owned = ownedBlessings();
  teamRow.appendChild(
    h('span', 'skill-name', owned.length > 0 ? `加護 ${owned.length} 個` : '加護なし'),
  );
  teamRow.appendChild(btn('一覧', false, () => openSheet({ kind: 'blessings' })));
  body.appendChild(teamRow);

  for (const s of view.skills) {
    const line = h('div', 'skill');
    line.appendChild(h('span', 'skill-label', s.label));
    line.appendChild(h('span', 'skill-name', s.name));
    line.appendChild(
      btn('説明', false, () =>
        openSheet({ kind: 'explain', title: `${s.label}：${s.name}`, text: s.summary }),
      ),
    );
    body.appendChild(line);
  }

  root.appendChild(wrap);
}

function renderEquipSheet(
  root: HTMLElement,
  key: string,
  slot: number,
  depth: number,
  isTop: boolean,
): void {
  const m = memberOf(key);
  if (!m) {
    state.sheets.pop();
    return;
  }
  const c = getCharacter(m.charId);
  const slots = m.equipment;
  const cur = Math.min(Math.max(0, slot), slots.length - 1);
  const { wrap, body } = sheetShell(`${c.name} の装備`, { depth, isTop });
  body.classList.add('equip');

  const slotRow = h('div', 'equip-slots');
  slots.forEach((id, i) => {
    const label = id ? getEquipment(id).name : '装備なし';
    const b = btn(`${i + 1}. ${label}`, i === cur, () => replaceSheet({ kind: 'equip', key, slot: i }));
    b.classList.add('equip-slot');
    slotRow.appendChild(b);
  });
  body.appendChild(slotRow);
  body.appendChild(
    h('div', 'hint', `スロット ${cur + 1} に着ける装備を選ぶ（★${m.star} → ${slots.length}枠）`),
  );

  const choose = (id: string): void => {
    updateMember(key, (o) => {
      const next = padSlots(o.equipment, o.star);
      next[cur] = id;
      o.equipment = next;
    });
    closeTopSheet();
  };

  const none = h('button', 'sheet-list-item' + (slots[cur] === '' ? ' on' : ''));
  none.appendChild(h('span', 'li-name', '装備なし'));
  none.addEventListener('click', () => choose(''));
  body.appendChild(none);

  // ラン中は所持している装備だけ選べる
  const run = state.run;
  const pool = run
    ? EQUIPMENT.filter((e) => run.inventory.includes(e.id) || slots.includes(e.id))
    : EQUIPMENT;
  for (const e of pool) {
    const item = h('button', 'sheet-list-item' + (slots[cur] === e.id ? ' on' : ''));
    const col = h('div');
    col.appendChild(h('div', 'li-name', e.name));
    col.appendChild(h('div', 'li-desc', e.desc));
    item.appendChild(col);
    item.addEventListener('click', () => choose(e.id));
    body.appendChild(item);
  }
  if (pool.length === 0) body.appendChild(h('div', 'hint', '持っている装備がありません'));
  root.appendChild(wrap);
}

function renderBlessingsSheet(root: HTMLElement, depth: number, isTop: boolean): void {
  const { wrap, body } = sheetShell('チーム全体の加護', { depth, isTop });
  body.classList.add('blessings');
  const owned = ownedBlessings();
  if (owned.length === 0) body.appendChild(h('div', 'hint', '加護をまだ持っていません'));
  for (const id of owned) body.appendChild(blessingRow(id, false));
  root.appendChild(wrap);
}

/** 合成でランクアップした時の、スキル3択 */
function renderSkillChoiceSheet(root: HTMLElement, depth: number, isTop: boolean): void {
  const run = state.run;
  const pending = run ? currentSkillChoice(run) : null;
  if (!run || !pending) {
    state.sheets.pop();
    return;
  }
  const c = getCharacter(pending.charId);
  const { wrap, body } = sheetShell(`${c.name} のスキル選択`, { depth, isTop });
  body.classList.add('skill-choice');
  const queued = run.pendingSkills.length;
  body.appendChild(
    h(
      'div',
      'hint',
      queued > 1
        ? `1つ選んで覚える（あと ${queued} 件）`
        : '1つ選んで覚える（選ばなかったものは今回は失う）',
    ),
  );

  const KIND_LABEL: Record<string, string> = {
    active: 'アクティブ',
    passive: 'パッシブ',
    support: 'サポート',
  };
  for (const id of pending.options) {
    const sk = getSkill(c.id, id);
    const item = h('button', 'sheet-list-item');
    const col = h('div');
    const head = h('div', 'li-name');
    head.textContent = sk.def.name;
    col.appendChild(head);
    col.appendChild(h('div', 'li-desc', `${KIND_LABEL[sk.kind]}｜${sk.def.summary}`));
    item.appendChild(col);
    item.addEventListener('click', () => {
      chooseSkill(run, id);
      autoSave();
      state.sheets.pop();
      // まだ待っている3択があれば、続けて次を出す
      if (!pumpSkillChoice() && state.sheets.length === 0) {
        if (state.replay && state.resumeAfterSheet) state.playing = true;
        state.resumeAfterSheet = false;
      }
      render();
    });
    body.appendChild(item);
  }
  root.appendChild(wrap);
}

function renderExplainSheet(
  root: HTMLElement,
  title: string,
  text: string,
  depth: number,
  isTop: boolean,
): void {
  const { wrap, body } = sheetShell(title, { small: true, depth, isTop });
  for (const line of text.split('\n')) body.appendChild(h('div', 'sheet-text', line));
  root.appendChild(wrap);
}

/** スタックを下から順にすべて描く。最前面のシートだけが操作できる */
function renderSheets(root: HTMLElement): void {
  state.sheets.forEach((s, i) => {
    const isTop = i === state.sheets.length - 1;
    if (s.kind === 'detail') renderDetailSheet(root, s.target, i, isTop);
    else if (s.kind === 'equip') renderEquipSheet(root, s.key, s.slot, i, isTop);
    else if (s.kind === 'blessings') renderBlessingsSheet(root, i, isTop);
    else if (s.kind === 'skillChoice') renderSkillChoiceSheet(root, i, isTop);
    else renderExplainSheet(root, s.title, s.text, i, isTop);
  });
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

function render(): void {
  // ★が上がったら、その場でスキル3択を出す（選ぶまで先に進ませない）
  pumpSkillChoice();

  const root = document.getElementById('app')!;
  root.textContent = '';
  root.dataset.screen = state.screen;

  const header = h('div', 'app-head');
  header.appendChild(h('h1', undefined, 'Divine Pawns（仮題）'));
  const rep = state.replay;
  const run = state.run;
  header.appendChild(
    h(
      'span',
      'stat',
      rep
        ? `${activeEncounterId()} t=${rep.frames[Math.min(state.frame, rep.frames.length - 1)]!.t.toFixed(1)}s`
        : run
          ? `${run.chapter}章 ♥${run.life} ${run.coins}c`
          : `${activeEncounterId()} / ${state.seed}`,
    ),
  );
  root.appendChild(header);

  // メイン画面。盤面を出すのは「戦闘準備中」と「戦闘実行中」だけ
  const main = h('div', 'board-area');
  main.dataset.screen = state.screen;
  if (showsBoard(state.screen)) {
    main.appendChild(renderBoard());
  } else if (state.screen === 'result') {
    renderResultScreen(main);
  } else if (state.screen === 'shop') {
    renderShopScreen(main);
  } else if (state.screen === 'event') {
    renderEventScreen(main);
  }
  root.appendChild(main);

  renderBottomBar(root);
  renderSheets(root);
}

// 保存されたランがあれば、再開するか聞く
state.savedRun = loadRun();
if (state.savedRun) state.tab = 'run';

render();
