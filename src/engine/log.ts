/**
 * 戦闘イベントログ。画面はこれを再生するだけにする。
 */

import type { DebuffKind, Hex, Side } from './types';

export type BattleEventType =
  | 'battleStart'
  | 'spawn'
  | 'move'
  | 'attack'
  | 'damage'
  | 'heal'
  | 'shield'
  | 'debuff'
  | 'debuffTick'
  | 'skill'
  | 'skillBlocked'
  | 'statMod'
  | 'taunt'
  | 'mana'
  | 'death'
  | 'timeoutTick'
  | 'battleEnd';

export interface BattleEvent {
  /** 時刻（秒、0.1刻み） */
  t: number;
  type: BattleEventType;
  /** 行動者のユニットID */
  actor?: string;
  /** 対象のユニットID */
  target?: string;
  /** 数値（ダメージ量・回復量・ストック数など） */
  value?: number;
  /** 付随情報 */
  note?: string;
  debuff?: DebuffKind;
  pos?: Hex;
  side?: Side;
}

export class BattleLog {
  readonly events: BattleEvent[] = [];

  push(e: BattleEvent): void {
    // 浮動小数の誤差が時刻に乗らないよう丸める
    this.events.push({ ...e, t: Math.round(e.t * 10) / 10 });
  }

  get length(): number {
    return this.events.length;
  }
}

/** 数値を決定論的な文字列にする（-0 や指数表記のブレを潰す） */
function num(v: number | undefined): string {
  if (v === undefined) return '';
  if (!Number.isFinite(v)) return String(v);
  // 小数6桁で丸めて正規化
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}

export function serializeEvent(e: BattleEvent): string {
  return [
    num(e.t),
    e.type,
    e.actor ?? '',
    e.target ?? '',
    num(e.value),
    e.note ?? '',
    e.debuff ?? '',
    e.pos ? `${e.pos.x},${e.pos.y}` : '',
    e.side ?? '',
  ].join('|');
}

/**
 * ログのハッシュ（FNV-1a 64bit 相当を 2×32bit で計算）。
 * 決定論の検証用。
 */
export function hashLog(log: BattleLog | readonly BattleEvent[]): string {
  const events = Array.isArray(log) ? (log as readonly BattleEvent[]) : (log as BattleLog).events;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const e of events) {
    const s = serializeEvent(e);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + Math.imul(h1 ^ c, 0x85ebca6b)) >>> 0;
    }
    h1 ^= 10;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  );
}
