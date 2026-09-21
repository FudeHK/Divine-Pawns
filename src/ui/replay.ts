/**
 * 戦闘を「フレーム列＋イベントログ」に変換する。
 * 画面はこの結果を再生するだけで、ゲームのルールを一切持たない。
 */

import { Battle, type BattleOutcome, type BattleSetup } from '../engine/battle';
import type { BattleEvent } from '../engine/log';
import type { DebuffKind, Element, Hex, Role, Side } from '../engine/types';

export interface ReplayUnit {
  id: string;
  defId: string;
  name: string;
  side: Side;
  role: Role;
  element: Element;
  onField: boolean;
  maxHp: number;
  maxMana: number;
}

export interface ReplayUnitFrame {
  id: string;
  pos: Hex;
  hp: number;
  mana: number;
  shield: number;
  alive: boolean;
  debuffs: Record<DebuffKind, number>;
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
      .filter((u) => !u.isCarrier)
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
      })),
  };
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

  return {
    units: b.units
      .filter((u) => !u.isCarrier)
      .map((u) => ({
        id: u.id,
        defId: u.defId,
        name: u.name,
        side: u.side,
        role: u.role,
        element: u.element,
        onField: u.onField,
        maxHp: u.base.maxHp,
        maxMana: u.base.maxMana,
      })),
    frames,
    events: b.log.events,
    outcome: r.outcome,
    duration: r.duration,
    logHash: r.logHash,
    seed: setup.seed,
  };
}
