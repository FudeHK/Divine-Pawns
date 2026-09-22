/**
 * 戦闘を「フレーム列＋イベントログ」に変換する。
 * 画面はこの結果を再生するだけで、ゲームのルールを一切持たない。
 */

import { Battle, type BattleOutcome, type BattleSetup } from '../engine/battle';
import type { BattleEvent } from '../engine/log';
import type { DebuffKind, Element, Hex, Myth, Role, Side, Star, Stats } from '../engine/types';

export interface ReplayUnit {
  id: string;
  defId: string;
  name: string;
  side: Side;
  role: Role;
  element: Element;
  myth: Myth | null;
  star: Star;
  onField: boolean;
  maxHp: number;
  maxMana: number;
  /** 同じ種類が複数いる時の通し番号（1始まり）。1体だけなら null */
  dupIndex: number | null;
}

export interface ReplayUnitFrame {
  id: string;
  pos: Hex;
  hp: number;
  mana: number;
  shield: number;
  alive: boolean;
  debuffs: Record<DebuffKind, number>;
  /** そのフレームでの実効ステータス */
  stats: Stats;
}

export interface ReplayFrame {
  t: number;
  units: ReplayUnitFrame[];
}

export interface Replay {
  units: ReplayUnit[];
  frames: ReplayFrame[];
  events: BattleEvent[];
  outcome: BattleOutcome;
  duration: number;
  logHash: string;
  seed: string;
}

function snapshot(b: Battle): ReplayFrame {
  return {
    t: b.t,
    units: b.units

      .map((u) => ({
        id: u.id,
        pos: { ...u.pos },
        hp: Math.max(0, u.hp),
        mana: u.mana,
        shield: u.shield,
        alive: u.alive,
        debuffs: {
          burn: u.debuffs.burn.stacks,
          frostbite: u.debuffs.frostbite.stacks,
          poison: u.debuffs.poison.remaining,
          paralysis: u.debuffs.paralysis.stacks,
        },
        stats: { ...u.eff },
      })),
  };
}

/** 同じ defId が複数いる陣営について、1始まりの通し番号を振る */
function assignDupIndex(units: ReplayUnit[]): void {
  const counts = new Map<string, number>();
  for (const u of units) {
    const key = `${u.side}:${u.defId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const u of units) {
    const key = `${u.side}:${u.defId}`;
    if ((counts.get(key) ?? 0) <= 1) {
      u.dupIndex = null;
      continue;
    }
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    u.dupIndex = n;
  }
}

export function buildReplay(setup: BattleSetup): Replay {
  const b = new Battle({ ...setup, logging: true });
  const frames: ReplayFrame[] = [];

  b.start();
  frames.push(snapshot(b));

  const maxTicks = Math.ceil((b.cfg.maxDuration + 1) / b.cfg.tick);
  for (let i = 0; i < maxTicks; i++) {
    const done = b.step();
    frames.push(snapshot(b));
    if (done) break;
  }
  const r = b.result();

  const units: ReplayUnit[] = b.units

    .map((u) => ({
      id: u.id,
      defId: u.defId,
      name: u.name,
      side: u.side,
      role: u.role,
      element: u.element,
      myth: u.myth,
      star: u.star,
      onField: u.onField,
      maxHp: u.base.maxHp,
      maxMana: u.base.maxMana,
      dupIndex: null,
    }));
  assignDupIndex(units);

  return {
    units,
    frames,
    events: b.log.events,
    outcome: r.outcome,
    duration: r.duration,
    logHash: r.logHash,
    seed: setup.seed,
  };
}
