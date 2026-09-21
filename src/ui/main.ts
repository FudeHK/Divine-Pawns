/**
 * フェーズ1の検証用の最小画面。
 * 縦画面（幅360〜430px）で、遭遇を選ぶ → 前衛／サポートに割り当てる → 配置 → 開始 → 再生。
 */

import './style.css';

import { BLESSINGS } from '../data/blessings';
import { CHARACTERS, getCharacter } from '../data/characters';
import { ENCOUNTERS, getEncounter } from '../data/encounters';
import { getEnemy } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { buildBattleSetup } from '../engine/build';
import { DEFAULT_CONFIG } from '../engine/config';
import { ALLY_CELLS, ALL_CELLS, isCellOfSide } from '../engine/hex';
import type { DebuffKind, Element, Hex, Loadout, Star } from '../engine/types';
import { formatNumber } from '../util/format';
import { buildReplay, type Replay } from './replay';

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

type Slot = 'none' | 'frontline' | 'support';

interface Assignment {
  slot: Slot;
  star: Star;
  equipment: string;
  pos: Hex | null;
}

const team = DEFAULT_CONFIG.team;

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
};

for (const c of CHARACTERS) {
  state.assign.set(c.id, { slot: 'none', star: 1, equipment: '', pos: null });
}
// 初期編成（前衛3・サポート2）
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
const ROLE_LABEL: Record<string, string> = {
  tank: 'タンク',
  melee: '近接',
  ranged: '遠隔',
  mage: 'メイジ',
  healer: 'ヒーラー',
  support: 'サポーター',
};
const DEBUFF_LABEL: Record<DebuffKind, string> = {
  burn: '燃',
  frostbite: '凍',
  poison: '毒',
  paralysis: '麻',
};
const DEBUFF_COLOR: Record<DebuffKind, string> = {
  burn: '#ff7a45',
  frostbite: '#6fd2ff',
  poison: '#7ed957',
  paralysis: '#d29bff',
};

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
      equipment: a.equipment ? [a.equipment] : [],
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

const R = 10;
const SQ3 = Math.sqrt(3);
const BOARD_W = SQ3 * R * 5.5 + 2;
const BOARD_H = 1.5 * R * 5 + 2 * R + 2;

function hexCenter(h: Hex): { cx: number; cy: number } {
  const off = (h.y & 1) === 1 ? 0.5 : 0;
  return {
    cx: 1 + SQ3 * R * (h.x + off) + (SQ3 * R) / 2,
    cy: 1 + 1.5 * R * h.y + R,
  };
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.sin(a + Math.PI / 2)).toFixed(2)},${(cy - r * Math.cos(a + Math.PI / 2)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function el(tag: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderBoard(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${BOARD_W.toFixed(2)} ${BOARD_H.toFixed(2)}`);
  svg.setAttribute('class', 'board');

  const rep = state.replay;
  const frame = rep ? rep.frames[Math.min(state.frame, rep.frames.length - 1)]! : null;

  // マス
  for (const cell of ALL_CELLS) {
    const { cx, cy } = hexCenter(cell);
    const isAlly = cell.y >= 3;
    const occ = occupiedBy(cell);
    const p = el('polygon', {
      points: hexPoints(cx, cy, R * 0.95),
      fill: isAlly ? '#182231' : '#291a1d',
      stroke: occ && !rep ? '#ffcc52' : '#3a3f52',
      'stroke-width': 0.5,
    });
    if (!rep && isAlly) {
      p.setAttribute('style', 'cursor:pointer');
      p.addEventListener('click', () => onCellTap(cell));
    }
    svg.appendChild(p);
  }

  if (!rep) {
    // 編成中：配置済みの前衛を表示
    for (const c of CHARACTERS) {
      const a = state.assign.get(c.id)!;
      if (a.slot !== 'frontline' || !a.pos) continue;
      const { cx, cy } = hexCenter(a.pos);
      svg.appendChild(
        el('circle', { cx, cy, r: R * 0.62, fill: '#4aa3ff', opacity: 0.9 }),
      );
      svg.appendChild(
        el(
          'text',
          {
            x: cx,
            y: cy + 1.6,
            'text-anchor': 'middle',
            'font-size': 4.6,
            fill: '#06121f',
            'font-weight': 700,
          },
          c.id.slice(0, 3),
        ),
      );
      svg.appendChild(
        el(
          'text',
          { x: cx, y: cy + 6.5, 'text-anchor': 'middle', 'font-size': 3.4, fill: '#cfe4ff' },
          `★${a.star}`,
        ),
      );
    }
    // 敵の下見
    for (const eu of getEncounter(state.encounterId).units) {
      const { cx, cy } = hexCenter(eu.pos);
      const def = getEnemy(eu.enemyId);
      svg.appendChild(el('circle', { cx, cy, r: R * 0.62, fill: '#ff6b6b', opacity: 0.85 }));
      svg.appendChild(
        el(
          'text',
          {
            x: cx,
            y: cy + 1.6,
            'text-anchor': 'middle',
            'font-size': 3.6,
            fill: '#2a0b0b',
            'font-weight': 700,
          },
          def.name.slice(0, 3),
        ),
      );
    }
    return svg;
  }

  // 再生中
  const byId = new Map(rep.units.map((u) => [u.id, u]));
  for (const uf of frame!.units) {
    const u = byId.get(uf.id)!;
    if (!u.onField || !uf.alive) continue;
    const { cx, cy } = hexCenter(uf.pos);
    const color = u.side === 'ally' ? '#4aa3ff' : '#ff6b6b';
    svg.appendChild(el('circle', { cx, cy, r: R * 0.6, fill: color, opacity: 0.92 }));
    svg.appendChild(
      el(
        'text',
        {
          x: cx,
          y: cy + 1.3,
          'text-anchor': 'middle',
          'font-size': 3.6,
          fill: '#0b1119',
          'font-weight': 700,
        },
        u.side === 'ally' ? u.defId.slice(0, 5) : u.name.slice(0, 3),
      ),
    );

    // HP バー
    const bw = R * 1.3;
    const hpRatio = Math.max(0, Math.min(1, uf.hp / u.maxHp));
    svg.appendChild(
      el('rect', { x: cx - bw / 2, y: cy - R * 0.95, width: bw, height: 1.5, fill: '#000', opacity: 0.6, rx: 0.5 }),
    );
    svg.appendChild(
      el('rect', {
        x: cx - bw / 2,
        y: cy - R * 0.95,
        width: bw * hpRatio,
        height: 1.5,
        fill: u.side === 'ally' ? '#57d9a3' : '#ff8f6b',
        rx: 0.5,
      }),
    );
    if (uf.shield > 0) {
      const sr = Math.min(1, uf.shield / u.maxHp);
      svg.appendChild(
        el('rect', {
          x: cx - bw / 2,
          y: cy - R * 0.95,
          width: bw * sr,
          height: 1.5,
          fill: '#e6edf7',
          opacity: 0.85,
          rx: 0.5,
        }),
      );
    }
    // マナ バー
    const manaRatio = Math.max(0, Math.min(1, uf.mana / u.maxMana));
    svg.appendChild(
      el('rect', { x: cx - bw / 2, y: cy - R * 0.95 + 1.8, width: bw, height: 1, fill: '#000', opacity: 0.6, rx: 0.4 }),
    );
    svg.appendChild(
      el('rect', {
        x: cx - bw / 2,
        y: cy - R * 0.95 + 1.8,
        width: bw * manaRatio,
        height: 1,
        fill: '#7fb6ff',
        rx: 0.4,
      }),
    );

    // デバフのストック数
    let dx = cx - bw / 2;
    for (const k of ['burn', 'frostbite', 'poison', 'paralysis'] as DebuffKind[]) {
      const v = uf.debuffs[k];
      if (v <= 0) continue;
      svg.appendChild(
        el(
          'text',
          {
            x: dx,
            y: cy + R * 0.95,
            'font-size': 3,
            fill: DEBUFF_COLOR[k],
            'font-weight': 700,
          },
          `${DEBUFF_LABEL[k]}${formatNumber(v)}`,
        ),
      );
      dx += 5;
    }
  }

  // そのフレームのダメージ・回復の数字
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
          x: cx + ((idx % 2) * 4 - 2),
          y: cy - R * 1.1 - Math.floor(idx / 2) * 3.4,
          'text-anchor': 'middle',
          'font-size': 4.2,
          'font-weight': 700,
          fill: ev.type === 'heal' ? '#57d9a3' : '#ffe08a',
          stroke: '#000',
          'stroke-width': 0.35,
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
    if (occ) {
      state.selected = occ;
      state.message = `${getCharacter(occ).name} を選択中。置きたいマスをタップ`;
    } else {
      state.message = '先にキャラを選んでください';
    }
    render();
    return;
  }
  const a = state.assign.get(state.selected)!;
  if (a.slot !== 'frontline') {
    a.slot = 'frontline';
  }
  const occ = occupiedBy(cell);
  if (occ && occ !== state.selected) {
    // 入れ替え
    const other = state.assign.get(occ)!;
    other.pos = a.pos;
  }
  a.pos = { ...cell };
  state.message = `${getCharacter(state.selected).name} を (${cell.x},${cell.y}) に配置`;
  state.selected = null;
  render();
}

function setSlot(charId: string, slot: Slot): void {
  const a = state.assign.get(charId)!;
  if (a.slot === slot) {
    a.slot = 'none';
    a.pos = null;
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
    if (slot === 'support') a.pos = null;
  }
  state.message = '';
  render();
}

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
  state.message = '';
  render();
}

function backToSetup(): void {
  state.replay = null;
  state.playing = false;
  state.frame = 0;
  render();
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
// 画面
// ---------------------------------------------------------------------------

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function btn(label: string, on: boolean, fn: () => void, small = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = (on ? 'on ' : '') + (small ? 'small' : '');
  b.addEventListener('click', fn);
  return b;
}

function renderSetup(root: HTMLElement): void {
  // シード
  const seedPanel = h('div', 'panel');
  seedPanel.appendChild(h('h2', undefined, 'シード'));
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = state.seed;
  seedInput.addEventListener('input', () => {
    state.seed = seedInput.value;
  });
  seedPanel.appendChild(seedInput);
  root.appendChild(seedPanel);

  // 遭遇
  root.appendChild(h('h2', undefined, '遭遇'));
  const encRow = h('div', 'row');
  for (const e of ENCOUNTERS) {
    encRow.appendChild(
      btn(e.id, state.encounterId === e.id, () => {
        state.encounterId = e.id;
        render();
      }),
    );
  }
  root.appendChild(encRow);
  root.appendChild(
    h('div', 'hint', getEncounter(state.encounterId).name),
  );

  // 盤面
  root.appendChild(h('h2', undefined, `配置（前衛 ${countSlot('frontline')}/${team.frontlineSlotsDefault}・サポート ${countSlot('support')}/${team.supportSlotsDefault}）`));
  root.appendChild(renderBoard());
  root.appendChild(
    h(
      'div',
      'hint' + (validateLoadout() ? ' err' : ''),
      state.message || validateLoadout() || 'キャラをタップして選び、盤面のマスをタップして置く',
    ),
  );

  // キャラ一覧
  root.appendChild(h('h2', undefined, 'キャラ'));
  for (const c of CHARACTERS) {
    const a = state.assign.get(c.id)!;
    const card = h('div', 'char' + (state.selected === c.id ? ' selected' : ''));
    const head = h('div', 'char-head');
    const name = h('div', 'char-name', `${c.id} ${c.name}`);
    name.addEventListener('click', () => {
      state.selected = state.selected === c.id ? null : c.id;
      state.message = state.selected ? '置きたいマスをタップ' : '';
      render();
    });
    head.appendChild(name);
    head.appendChild(h('span', `tag el-${c.element}`, ELEMENT_LABEL[c.element]));
    head.appendChild(h('span', 'tag', ROLE_LABEL[c.role] ?? c.role));
    card.appendChild(head);

    const sub = h('div', 'char-sub');
    sub.appendChild(btn('前衛', a.slot === 'frontline', () => setSlot(c.id, 'frontline'), true));
    sub.appendChild(btn('サポート', a.slot === 'support', () => setSlot(c.id, 'support'), true));

    const starSel = document.createElement('select');
    for (const s of [1, 2, 3]) {
      const o = document.createElement('option');
      o.value = String(s);
      o.textContent = `★${s}`;
      if (a.star === s) o.selected = true;
      starSel.appendChild(o);
    }
    starSel.addEventListener('change', () => {
      a.star = Number(starSel.value) as Star;
      render();
    });
    sub.appendChild(starSel);

    const eqSel = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '装備なし';
    eqSel.appendChild(none);
    for (const e of EQUIPMENT) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.name;
      if (a.equipment === e.id) o.selected = true;
      eqSel.appendChild(o);
    }
    eqSel.addEventListener('change', () => {
      a.equipment = eqSel.value;
      render();
    });
    sub.appendChild(eqSel);

    if (a.slot === 'frontline' && a.pos) {
      sub.appendChild(h('span', 'stat', `(${a.pos.x},${a.pos.y})`));
    }
    card.appendChild(sub);
    root.appendChild(card);
  }

  // 加護
  root.appendChild(h('h2', undefined, '加護'));
  const blRow = h('div', 'row');
  for (const b of BLESSINGS) {
    blRow.appendChild(
      btn(b.name, state.blessings.has(b.id), () => {
        if (state.blessings.has(b.id)) state.blessings.delete(b.id);
        else state.blessings.add(b.id);
        render();
      }, true),
    );
  }
  root.appendChild(blRow);

  const startRow = h('div', 'row');
  startRow.style.marginTop = '12px';
  const start = btn('▶ 戦闘開始', true, startBattle);
  start.style.flex = '1';
  start.style.minHeight = '44px';
  startRow.appendChild(start);
  root.appendChild(startRow);
}

function renderBattle(root: HTMLElement): void {
  const rep = state.replay!;
  const frame = rep.frames[Math.min(state.frame, rep.frames.length - 1)]!;
  const atEnd = state.frame >= rep.frames.length - 1;

  const top = h('div', 'row');
  top.appendChild(btn('← 編成に戻る', false, backToSetup, true));
  top.appendChild(h('span', 'stat', `${state.encounterId} / seed: ${state.seed}`));
  root.appendChild(top);

  root.appendChild(h('div', 'hint', `t = ${frame.t.toFixed(1)}s`));
  root.appendChild(renderBoard());

  const ctrl = h('div', 'row');
  ctrl.style.marginTop = '8px';
  ctrl.appendChild(
    btn(state.playing ? '⏸ 一時停止' : '▶ 再生', state.playing, () => {
      if (atEnd) state.frame = 0;
      state.playing = !state.playing;
      render();
    }),
  );
  for (const s of [1, 2, 4] as const) {
    ctrl.appendChild(
      btn(`${s}倍`, state.speed === s, () => {
        state.speed = s;
        render();
      }, true),
    );
  }
  ctrl.appendChild(
    btn('⏭ スキップ', false, () => {
      state.frame = rep.frames.length - 1;
      state.playing = false;
      render();
    }, true),
  );
  ctrl.appendChild(
    btn('⟲ 最初から', false, () => {
      state.frame = 0;
      state.playing = true;
      render();
    }, true),
  );
  root.appendChild(ctrl);

  if (atEnd) {
    const label =
      rep.outcome === 'win' ? '勝利' : rep.outcome === 'lose' ? '敗北' : '時間切れ（敗北扱い）';
    root.appendChild(h('div', `result ${rep.outcome}`, `${label} ／ ${rep.duration.toFixed(1)}s`));
  }

  // ユニット一覧（HP・マナ・デバフ）
  root.appendChild(h('h2', undefined, 'ユニット'));
  const byId = new Map(rep.units.map((u) => [u.id, u]));
  for (const uf of frame.units) {
    const u = byId.get(uf.id)!;
    const line = h('div', 'stat');
    const debuffs = (['burn', 'frostbite', 'poison', 'paralysis'] as DebuffKind[])
      .filter((k) => uf.debuffs[k] > 0)
      .map((k) => `${DEBUFF_LABEL[k]}${formatNumber(uf.debuffs[k])}`)
      .join(' ');
    const slot = u.onField ? '' : '[サポート]';
    line.textContent =
      `${u.side === 'ally' ? '味' : '敵'} ${u.defId} ${slot} ` +
      `HP ${formatNumber(uf.hp)}/${formatNumber(u.maxHp)} ` +
      `MP ${formatNumber(uf.mana)}/${formatNumber(u.maxMana)}` +
      (uf.shield > 0 ? ` 盾 ${formatNumber(uf.shield)}` : '') +
      (debuffs ? ` ${debuffs}` : '') +
      (uf.alive ? '' : ' 戦闘不能');
    line.style.color = uf.alive ? (u.side === 'ally' ? '#9fc8ff' : '#ffb0b0') : '#6b7086';
    root.appendChild(line);
  }

  // ログ
  root.appendChild(h('h2', undefined, `ログ（${rep.events.length} 件・hash ${rep.logHash}）`));
  const logBox = h('div', 'log');
  const shown = rep.events.filter((e) => e.t <= frame.t + 1e-6);
  for (const e of shown.slice(-400)) {
    const d = h('div');
    const parts: string[] = [];
    parts.push(e.type);
    if (e.actor) parts.push(`${e.actor}`);
    if (e.target) parts.push(`→${e.target}`);
    if (e.value !== undefined) parts.push(formatNumber(e.value));
    if (e.debuff) parts.push(DEBUFF_LABEL[e.debuff]);
    if (e.note) parts.push(e.note);
    if (e.pos) parts.push(`(${e.pos.x},${e.pos.y})`);
    d.innerHTML =
      `<span class="t">${e.t.toFixed(1)}</span> ` +
      `<span class="${e.actor?.startsWith('E') ? 'e' : 'a'}">${parts.join(' ')}</span>`;
    logBox.appendChild(d);
  }
  root.appendChild(logBox);
  logBox.scrollTop = logBox.scrollHeight;
}

function render(): void {
  const root = document.getElementById('app')!;
  root.textContent = '';
  root.appendChild(h('h1', undefined, 'フェーズ1 戦闘検証（仮）'));
  if (state.replay) renderBattle(root);
  else renderSetup(root);
}

render();
