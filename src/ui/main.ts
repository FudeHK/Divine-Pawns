/**
 * Divine Pawns（仮題）の検証用画面。
 *
 * 画面は2層。
 *   上: 盤面（常に見える。残りの高さいっぱい）
 *   下: タブ付きの操作バー（編成 / 加護 / 操作）＋ いつでも押せる実行ボタン
 */

import './style.css';

import { BLESSINGS } from '../data/blessings';
import { CHARACTERS, getCharacter } from '../data/characters';
import { ENCOUNTERS, getEncounter } from '../data/encounters';
import { getEnemy } from '../data/enemies';
import { EQUIPMENT, getEquipment } from '../data/equipment';
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
import { formatNumber } from '../util/format';
import { buildReplay, type Replay } from './replay';

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

type Slot = 'none' | 'frontline' | 'support';
type Tab = 'team' | 'blessing' | 'control';

interface Assignment {
  slot: Slot;
  star: Star;
  /** 装備。添字がスロット番号。空きは '' */
  equipment: string[];
  pos: Hex | null;
}

/** 詳細シートで見せる対象 */
type DetailTarget =
  | { kind: 'char'; charId: string }
  | { kind: 'enemySlot'; index: number }
  | { kind: 'unit'; unitId: string };

/** 画面下から開くシート。重ねて開ける（閉じると1つ上の階層に戻る） */
type Sheet =
  | { kind: 'detail'; target: DetailTarget }
  | { kind: 'equip'; charId: string; slot: number }
  | { kind: 'blessings' }
  | { kind: 'explain'; title: string; text: string };

const team = DEFAULT_CONFIG.team;

const TABS: { id: Tab; label: string }[] = [
  { id: 'team', label: '編成' },
  { id: 'blessing', label: '加護' },
  { id: 'control', label: '操作' },
];

const state = {
  seed: 'seed-1',
  encounterId: 'E1',
  assign: new Map<string, Assignment>(),
  blessings: new Set<string>(),
  selected: null as string | null,
  message: '',
  replay: null as Replay | null,
  frame: 0,
  playing: false,
  speed: 1 as 1 | 2 | 4,
  tab: 'team' as Tab,
  sheets: [] as Sheet[],
  resumeAfterSheet: false,
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

function enemyDupIndexes(): (number | null)[] {
  const units = getEncounter(state.encounterId).units;
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
function slotsOf(a: Assignment): string[] {
  const n = equipmentSlots(a.star);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(a.equipment[i] ?? '');
  return out;
}

/** 実際に着けている装備の数 */
function equippedCount(a: Assignment): number {
  return slotsOf(a).filter((x) => x !== '').length;
}

// ---------------------------------------------------------------------------
// 編成の組み立て
// ---------------------------------------------------------------------------

function currentLoadout(): Loadout {
  const frontline = [];
  const support = [];
  for (const c of CHARACTERS) {
    const a = state.assign.get(c.id)!;
    if (a.slot === 'none') continue;
    const e = {
      charId: c.id,
      star: a.star,
      equipment: slotsOf(a).filter((x) => x !== ''),
      pos: a.pos ?? undefined,
    };
    if (a.slot === 'frontline') frontline.push(e);
    else support.push(e);
  }
  return { frontline, support, blessings: [...state.blessings] };
}

function validateLoadout(): string | null {
  const lo = currentLoadout();
  if (lo.frontline.length === 0) return '前衛を1体以上入れてください';
  if (lo.frontline.length > team.frontlineSlotsMax)
    return `前衛は最大 ${team.frontlineSlotsMax} 体です`;
  if (lo.support.length > team.supportSlotsMax)
    return `サポートは最大 ${team.supportSlotsMax} 体です`;
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
  for (const c of CHARACTERS) {
    const a = state.assign.get(c.id)!;
    if (a.slot === 'frontline' && a.pos && a.pos.x === cell.x && a.pos.y === cell.y) {
      return c.id;
    }
  }
  return null;
}

function countSlot(slot: Slot): number {
  let n = 0;
  for (const a of state.assign.values()) if (a.slot === slot) n++;
  return n;
}

// ---------------------------------------------------------------------------
// 盤面の描画
// ---------------------------------------------------------------------------

/**
 * 盤面は viewBox の幅を 360 にして横幅いっぱいに広げる。
 * 基準の幅360pxでは 1ユーザー単位 = 1px なので、文字サイズをそのまま px として指定できる。
 */
const BOARD_W = 360;
const SQ3 = Math.sqrt(3);
const R = (BOARD_W - 4) / (SQ3 * 5.5);
const BOARD_H = 1.5 * R * 5 + 2 * R + 4;

/** 盤面アイコンの表示名。4文字で収まらない時だけ12pxまで縮める */
function labelFontSize(label: string): number {
  return label.length >= 4 ? 12 : 14;
}

function hexCenter(h: Hex): { cx: number; cy: number } {
  const off = (h.y & 1) === 1 ? 0.5 : 0;
  return {
    cx: 2 + SQ3 * R * (h.x + off) + (SQ3 * R) / 2,
    cy: 2 + 1.5 * R * h.y + R,
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
  opts: { star?: Star | null; dupIndex?: number | null; onTap?: () => void } = {},
): void {
  const g = el('g');
  if (opts.onTap) {
    g.setAttribute('style', 'cursor:pointer');
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      opts.onTap!();
    });
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
    const placing = !rep && state.selected !== null && isAlly;
    const p = el('polygon', {
      points: hexPoints(cx, cy, R * 0.95),
      fill: isAlly ? (placing ? '#1d3149' : '#182231') : '#291a1d',
      stroke: placing ? '#ffcc52' : occ && !rep ? '#ffcc52' : '#3a3f52',
      'stroke-width': placing ? 2 : 1.5,
    });
    if (!rep && isAlly) {
      p.setAttribute('style', 'cursor:pointer');
      p.addEventListener('click', () => onCellTap(cell));
    }
    svg.appendChild(p);
  }

  if (!rep) {
    for (const c of CHARACTERS) {
      const a = state.assign.get(c.id)!;
      if (a.slot !== 'frontline' || !a.pos) continue;
      const { cx, cy } = hexCenter(a.pos);
      const cell = a.pos;
      drawToken(svg, cx, cy, c.shortName, '#4aa3ff', {
        star: a.star,
        onTap: () => {
          if (state.selected) onCellTap(cell);
          else openSheet({ kind: 'detail', target: { kind: 'char', charId: c.id } });
        },
      });
    }
    const dup = enemyDupIndexes();
    getEncounter(state.encounterId).units.forEach((eu, i) => {
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

function onCellTap(cell: Hex): void {
  if (!state.selected) {
    const occ = occupiedBy(cell);
    if (occ) openSheet({ kind: 'detail', target: { kind: 'char', charId: occ } });
    else {
      state.message = '「編成」タブでキャラを選んでから、マスをタップ';
      render();
    }
    return;
  }
  const a = state.assign.get(state.selected)!;
  if (a.slot !== 'frontline') a.slot = 'frontline';
  const occ = occupiedBy(cell);
  if (occ && occ !== state.selected) {
    state.assign.get(occ)!.pos = a.pos;
  }
  a.pos = { ...cell };
  state.message = `${getCharacter(state.selected).shortName} を (${cell.x},${cell.y}) に配置`;
  state.selected = null;
  render();
}

function setSlot(charId: string, slot: Slot): void {
  const a = state.assign.get(charId)!;
  if (a.slot === slot) {
    a.slot = 'none';
    a.pos = null;
    if (state.selected === charId) state.selected = null;
  } else {
    if (slot === 'frontline' && countSlot('frontline') >= team.frontlineSlotsMax && a.slot !== 'frontline') {
      state.message = `前衛は最大 ${team.frontlineSlotsMax} 体です`;
      render();
      return;
    }
    if (slot === 'support' && countSlot('support') >= team.supportSlotsMax && a.slot !== 'support') {
      state.message = `サポートは最大 ${team.supportSlotsMax} 体です`;
      render();
      return;
    }
    a.slot = slot;
    if (slot === 'frontline' && !a.pos) {
      const free = ALLY_CELLS.find((c) => !occupiedBy(c));
      a.pos = free ? { ...free } : null;
    }
    if (slot === 'support') {
      a.pos = null;
      if (state.selected === charId) state.selected = null;
    }
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

function startBattle(): void {
  const err = validateLoadout();
  if (err) {
    state.message = err;
    render();
    return;
  }
  const setup = buildBattleSetup(currentLoadout(), getEncounter(state.encounterId), {
    seed: state.seed,
    config: DEFAULT_CONFIG,
    logging: true,
  });
  state.replay = buildReplay(setup);
  state.frame = 0;
  state.playing = true;
  state.selected = null;
  state.sheets.length = 0;
  state.resumeAfterSheet = false;
  state.message = '';
  // 戦闘中は「編成」「加護」を触れないので、操作タブへ移す
  state.tab = 'control';
  render();
}

function backToSetup(): void {
  state.replay = null;
  state.playing = false;
  state.frame = 0;
  state.sheets.length = 0;
  state.resumeAfterSheet = false;
  state.tab = 'team';
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

function charSkills(c: CharacterDef): SkillRow[] {
  return [
    { label: 'アクティブ', name: baseEffectName(c.active.name), summary: c.active.summary },
    mergeDefs('パッシブ', c.passives),
    mergeDefs('サポート効果', c.support),
  ];
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

function buildDetailView(target: DetailTarget): DetailView | null {
  if (target.kind === 'char') {
    const c = getCharacter(target.charId);
    const a = state.assign.get(c.id)!;
    let stats: Stats;
    const members = a.slot === 'none' ? [] : resolveMembers(currentLoadout());
    const m = members.find((x) => x.entry.charId === c.id);
    if (m) stats = m.stats;
    else {
      stats = resolveMembers({
        frontline: [
          {
            charId: c.id,
            star: a.star,
            equipment: slotsOf(a).filter((x) => x !== ''),
            pos: { x: 2, y: 3 },
          },
        ],
        support: [],
        blessings: [],
      })[0]!.stats;
    }
    return {
      title: c.name,
      id: c.id,
      tags: [
        { text: ROLE_LABEL[c.role] },
        { text: ELEMENT_LABEL[c.element], cls: `el-${c.element}` },
        { text: MYTH_LABEL[c.myth] },
        { text: `★${a.star}` },
        { text: a.slot === 'frontline' ? '前衛' : a.slot === 'support' ? 'サポート' : '未編成' },
      ],
      rows: statRows(stats, null, null),
      equipment: slotsOf(a),
      skills: charSkills(c),
    };
  }

  if (target.kind === 'enemySlot') {
    const units = getEncounter(state.encounterId).units;
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
  const a = c ? state.assign.get(c.id) : null;

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
    equipment: a ? slotsOf(a) : [],
    skills: c ? charSkills(c) : e ? enemySkills(e) : [],
  };
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
// 「編成」タブ
// ---------------------------------------------------------------------------

function renderTeamTab(body: HTMLElement): void {
  body.appendChild(
    h(
      'div',
      'hint',
      state.message ||
        validateLoadout() ||
        (state.selected
          ? `${getCharacter(state.selected).name} を置くマスを盤面でタップ`
          : `前衛 ${countSlot('frontline')}/${team.frontlineSlotsDefault}・サポート ${countSlot('support')}/${team.supportSlotsDefault}`),
    ),
  );

  const list = h('div', 'char-list');
  for (const c of CHARACTERS) {
    const a = state.assign.get(c.id)!;
    const card = h(
      'div',
      ['char', `slot-${a.slot}`, state.selected === c.id ? 'selected' : ''].filter(Boolean).join(' '),
    );

    const head = h('div', 'char-head');
    const name = h('div', 'char-name', c.name);
    name.addEventListener('click', () => {
      if (a.slot === 'frontline') {
        // 前衛カードをタップ → 盤面で置く場所を選ぶモード
        state.selected = state.selected === c.id ? null : c.id;
        state.message = state.selected ? '盤面のマスをタップして配置' : '';
      } else {
        openSheet({ kind: 'detail', target: { kind: 'char', charId: c.id } });
      }
      render();
    });
    head.appendChild(name);
    card.appendChild(head);

    const tags = h('div', 'char-tags');
    tags.appendChild(h('span', `tag el-${c.element}`, ELEMENT_LABEL[c.element]));
    tags.appendChild(h('span', 'tag', ROLE_LABEL[c.role]));
    card.appendChild(tags);

    card.appendChild(h('div', 'char-id', c.id));

    const sub = h('div', 'char-sub');
    sub.appendChild(btn('前衛', a.slot === 'frontline', () => setSlot(c.id, 'frontline')));
    sub.appendChild(btn('サポート', a.slot === 'support', () => setSlot(c.id, 'support')));

    const starSel = document.createElement('select');
    for (const s of [1, 2, 3]) {
      const o = document.createElement('option');
      o.value = String(s);
      o.textContent = `★${s}`;
      if (a.star === s) o.selected = true;
      starSel.appendChild(o);
    }
    starSel.addEventListener('change', () => {
      // ★が上がってもすでに着けている装備はそのまま残す
      a.star = Number(starSel.value) as Star;
      render();
    });
    sub.appendChild(starSel);

    sub.appendChild(
      btn(`装備 ${equippedCount(a)}/${equipmentSlots(a.star)}`, equippedCount(a) > 0, () =>
        openSheet({ kind: 'equip', charId: c.id, slot: firstOpenSlot(a) }),
      ),
    );
    sub.appendChild(
      btn('詳細', false, () => openSheet({ kind: 'detail', target: { kind: 'char', charId: c.id } })),
    );
    card.appendChild(sub);

    if (a.slot === 'frontline' && a.pos) {
      card.appendChild(h('div', 'stat', `位置 (${a.pos.x},${a.pos.y})`));
    }
    list.appendChild(card);
  }
  body.appendChild(list);
}

function firstOpenSlot(a: Assignment): number {
  const s = slotsOf(a);
  const i = s.findIndex((x) => x === '');
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// 「加護」タブ
// ---------------------------------------------------------------------------

function blessingRow(id: string, withToggle: boolean): HTMLElement {
  const b = BLESSINGS.find((x) => x.id === id)!;
  const owned = state.blessings.has(b.id);
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
        if (owned) state.blessings.delete(b.id);
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
  body.appendChild(h('div', 'hint', `所持 ${state.blessings.size} / ${BLESSINGS.length}`));
  const section = h('div', 'blessings');
  const sorted = [...BLESSINGS].sort(
    (a, b) => (state.blessings.has(a.id) ? 0 : 1) - (state.blessings.has(b.id) ? 0 : 1),
  );
  for (const b of sorted) section.appendChild(blessingRow(b.id, true));
  body.appendChild(section);
}

// ---------------------------------------------------------------------------
// 「操作」タブ
// ---------------------------------------------------------------------------

function renderControlTab(body: HTMLElement): void {
  const rep = state.replay;

  // 倍速とスキップ（戦闘中も操作できる）
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
  play.appendChild(
    btn(
      '⏭ スキップ',
      false,
      () => {
        if (!rep) return;
        state.frame = rep.frames.length - 1;
        state.playing = false;
        state.resumeAfterSheet = false;
        render();
      },
      rep ? '' : 'disabled-look',
    ),
  );
  if (!rep) (play.lastChild as HTMLButtonElement).disabled = true;
  body.appendChild(play);

  // 遭遇とシード（準備中のみ変更できる）
  body.appendChild(h('div', 'hint', '遭遇'));
  const encRow = h('div', 'row');
  for (const e of ENCOUNTERS) {
    const b = btn(e.id, state.encounterId === e.id, () => {
      state.encounterId = e.id;
      state.sheets.length = 0;
      render();
    });
    if (rep) b.disabled = true;
    encRow.appendChild(b);
  }
  body.appendChild(encRow);
  body.appendChild(h('div', 'hint', getEncounter(state.encounterId).name));

  body.appendChild(h('div', 'hint', 'シード'));
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = state.seed;
  seedInput.disabled = rep !== null;
  seedInput.addEventListener('input', () => {
    state.seed = seedInput.value;
  });
  body.appendChild(seedInput);

  if (!rep) return;

  // 戦闘中は、結果・ユニット・ログもここで見る
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
  const inBattle = state.replay !== null;

  // タブ（戦闘中は「編成」「加護」を触れない）
  const tabRow = h('div', 'tab-row');
  for (const t of TABS) {
    const disabled = inBattle && t.id !== 'control';
    const b = btn(t.label, state.tab === t.id, () => {
      state.tab = t.id;
      render();
    }, 'tab');
    b.disabled = disabled;
    b.setAttribute('data-tab', t.id);
    tabRow.appendChild(b);
  }
  bar.appendChild(tabRow);

  const body = h('div', 'tab-body');
  if (state.tab === 'team') renderTeamTab(body);
  else if (state.tab === 'blessing') renderBlessingTab(body);
  else renderControlTab(body);
  bar.appendChild(body);

  // 実行ボタン（タブに関わらず常に見える）
  const action = h('div', 'action-row');
  if (!inBattle) {
    action.appendChild(btn('▶ 戦闘開始', true, startBattle, 'wide'));
  } else {
    const rep = state.replay!;
    const atEnd = state.frame >= rep.frames.length - 1;
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
  bar.appendChild(action);

  root.appendChild(bar);
}

// ---------------------------------------------------------------------------
// シート
// ---------------------------------------------------------------------------

function sheetShell(title: string, small = false): { wrap: DocumentFragment; body: HTMLElement } {
  const wrap = document.createDocumentFragment();
  const backdrop = h('div', 'sheet-backdrop');
  backdrop.addEventListener('click', closeTopSheet);
  wrap.appendChild(backdrop);

  const sheet = h('div', 'sheet' + (small ? ' small' : ''));
  const head = h('div', 'sheet-head');
  head.appendChild(h('div', 'sheet-title', title));
  head.appendChild(btn('✕', false, closeTopSheet, 'sheet-close'));
  sheet.appendChild(head);
  wrap.appendChild(sheet);
  return { wrap, body: sheet };
}

function renderDetailSheet(root: HTMLElement, target: DetailTarget): void {
  const view = buildDetailView(target);
  if (!view) {
    state.sheets.pop();
    return;
  }
  const { wrap, body } = sheetShell(view.title);
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

  // 装備（スロット数ぶん並べる）
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

  // チーム全体（所持中の加護）
  const teamRow = h('div', 'skill team-row');
  teamRow.appendChild(h('span', 'skill-label', 'チーム全体'));
  teamRow.appendChild(
    h('span', 'skill-name', state.blessings.size > 0 ? `加護 ${state.blessings.size} 個` : '加護なし'),
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

function renderEquipSheet(root: HTMLElement, charId: string, slot: number): void {
  const c = getCharacter(charId);
  const a = state.assign.get(charId)!;
  const slots = slotsOf(a);
  const cur = Math.min(Math.max(0, slot), slots.length - 1);
  const { wrap, body } = sheetShell(`${c.name} の装備`);
  body.classList.add('equip');

  // スロットを★の数だけ横並びで表示
  const slotRow = h('div', 'equip-slots');
  slots.forEach((id, i) => {
    const label = id ? getEquipment(id).name : '装備なし';
    const b = btn(`${i + 1}. ${label}`, i === cur, () =>
      replaceSheet({ kind: 'equip', charId, slot: i }),
    );
    b.classList.add('equip-slot');
    slotRow.appendChild(b);
  });
  body.appendChild(slotRow);
  body.appendChild(h('div', 'hint', `スロット ${cur + 1} に着ける装備を選ぶ（★${a.star} → ${slots.length}枠）`));

  const choose = (id: string): void => {
    const next = slotsOf(a);
    next[cur] = id;
    a.equipment = next;
    closeTopSheet();
  };

  const none = h('button', 'sheet-list-item' + (slots[cur] === '' ? ' on' : ''));
  none.appendChild(h('span', 'li-name', '装備なし'));
  none.addEventListener('click', () => choose(''));
  body.appendChild(none);

  for (const e of EQUIPMENT) {
    const item = h('button', 'sheet-list-item' + (slots[cur] === e.id ? ' on' : ''));
    const col = h('div');
    col.appendChild(h('div', 'li-name', e.name));
    col.appendChild(h('div', 'li-desc', e.desc));
    item.appendChild(col);
    item.addEventListener('click', () => choose(e.id));
    body.appendChild(item);
  }
  root.appendChild(wrap);
}

function renderBlessingsSheet(root: HTMLElement): void {
  const { wrap, body } = sheetShell('チーム全体の加護');
  body.classList.add('blessings');
  const owned = BLESSINGS.filter((b) => state.blessings.has(b.id));
  if (owned.length === 0) body.appendChild(h('div', 'hint', '加護をまだ持っていません'));
  for (const b of owned) body.appendChild(blessingRow(b.id, false));
  root.appendChild(wrap);
}

function renderExplainSheet(root: HTMLElement, title: string, text: string): void {
  const { wrap, body } = sheetShell(title, true);
  for (const line of text.split('\n')) body.appendChild(h('div', 'sheet-text', line));
  root.appendChild(wrap);
}

function renderSheets(root: HTMLElement): void {
  const top = state.sheets[state.sheets.length - 1];
  if (!top) return;
  if (top.kind === 'detail') renderDetailSheet(root, top.target);
  else if (top.kind === 'equip') renderEquipSheet(root, top.charId, top.slot);
  else if (top.kind === 'blessings') renderBlessingsSheet(root);
  else renderExplainSheet(root, top.title, top.text);
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

function render(): void {
  const root = document.getElementById('app')!;
  root.textContent = '';

  const header = h('div', 'app-head');
  header.appendChild(h('h1', undefined, 'Divine Pawns（仮題） 戦闘検証'));
  const rep = state.replay;
  header.appendChild(
    h(
      'span',
      'stat',
      rep
        ? `${state.encounterId} t=${rep.frames[Math.min(state.frame, rep.frames.length - 1)]!.t.toFixed(1)}s`
        : `${state.encounterId} / ${state.seed}`,
    ),
  );
  root.appendChild(header);

  const boardArea = h('div', 'board-area');
  boardArea.appendChild(renderBoard());
  root.appendChild(boardArea);

  renderBottomBar(root);
  renderSheets(root);
}

render();
