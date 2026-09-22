/**
 * 編成（Loadout）と遭遇（Encounter）から、戦闘のセットアップを組み立てる。
 */

import { getBlessing } from '../data/blessings';
import { defaultSkills, expandSkillEffects, getCharacter, getSkill } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { getEquipment } from '../data/equipment';
import type { BattleSetup, BattleUnitSpec, TeamEffect } from './battle';
import { DEFAULT_CONFIG, type BattleConfig } from './config';
import {
  buildStats,
  collectBlessingMods,
  equipmentSlots,
  type BuildContext,
  type BuildIdentity,
} from './stats';
import type {
  EffectDef,
  EncounterDef,
  EquipmentDef,
  Loadout,
  LoadoutEntry,
  Stats,
} from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** そのメンバーが覚えているスキルID（未指定なら★に応じた既定の構成） */
export function learnedSkills(entry: LoadoutEntry): string[] {
  return entry.skills && entry.skills.length > 0
    ? entry.skills
    : defaultSkills(entry.charId, entry.star);
}

/**
 * 実際に効く装備を返す。
 * 装備スロットは★の数と同じなので、それを超える分は無視する。
 */
export function effectiveEquipment(entry: LoadoutEntry): EquipmentDef[] {
  return entry.equipment
    .slice(0, equipmentSlots(entry.star))
    .filter((id) => id !== '')
    .map(getEquipment);
}

export interface BuildOptions {
  seed: string;
  config?: BattleConfig;
  logging?: boolean;
}

/** 編成上の1人分の最終ステータス（UI の表示にも使う） */
export interface ResolvedMember {
  entry: LoadoutEntry;
  identity: BuildIdentity;
  stats: Stats;
  slot: 'frontline' | 'support';
}

export function resolveMembers(loadout: Loadout, cfg: BattleConfig = DEFAULT_CONFIG): ResolvedMember[] {
  const all: { entry: LoadoutEntry; slot: 'frontline' | 'support' }[] = [
    ...loadout.frontline.map((e) => ({ entry: e, slot: 'frontline' as const })),
    ...loadout.support.map((e) => ({ entry: e, slot: 'support' as const })),
  ];

  const roster: BuildIdentity[] = all.map(({ entry }) => {
    const c = getCharacter(entry.charId);
    return { element: c.element, role: c.role, myth: c.myth };
  });
  const ctx: BuildContext = { roster };
  const blessings = loadout.blessings.map(getBlessing);

  return all.map(({ entry, slot }, i) => {
    const c = getCharacter(entry.charId);
    const identity = roster[i]!;
    const equipment = effectiveEquipment(entry);
    const extraMods = collectBlessingMods(blessings, identity, ctx);
    const stats = buildStats({
      base: c.base,
      star: entry.star,
      equipment,
      extraMods,
      cfg,
    });
    return { entry, identity, stats, slot };
  });
}

export function buildBattleSetup(
  loadout: Loadout,
  encounter: EncounterDef,
  opts: BuildOptions,
): BattleSetup {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const members = resolveMembers(loadout, cfg);
  const units: BattleUnitSpec[] = [];

  let frontIdx = 0;
  let supIdx = 0;
  for (const m of members) {
    const c = getCharacter(m.entry.charId);
    const equipment = effectiveEquipment(m.entry);
    const effects: { def: EffectDef; origin: string }[] = [];

    // 覚えているスキルだけが働く。盤上ではアクティブ＋パッシブ、サポート枠ではサポートだけ
    for (const skillId of learnedSkills(m.entry)) {
      const sk = getSkill(c.id, skillId);
      const onField = m.slot === 'frontline';
      if (onField ? sk.kind === 'support' : sk.kind !== 'support') continue;
      for (const def of expandSkillEffects(c.id, skillId)) {
        effects.push({ def, origin: sk.kind });
      }
    }
    for (const eq of equipment) {
      for (const e of eq.effects ?? []) effects.push({ def: e, origin: 'equipment' });
    }

    const id =
      m.slot === 'frontline' ? `A${pad(frontIdx++)}` : `S${pad(supIdx++)}`;

    units.push({
      id,
      defId: c.id,
      name: c.name,
      side: 'ally',
      role: c.role,
      element: c.element,
      myth: c.myth,
      star: m.entry.star,
      onField: m.slot === 'frontline',
      pos: m.entry.pos ?? { x: 2, y: 3 },
      stats: m.stats,
      resist: 0,
      effects,
    });
  }

  // 加護の戦闘中効果は「チーム効果」として持つ（ユニットにはしない）
  const teamEffects: TeamEffect[] = [];
  for (const bid of loadout.blessings) {
    const b = getBlessing(bid);
    for (const e of b.effects ?? []) {
      teamEffects.push({ side: 'ally', def: e, source: { kind: 'blessing', id: b.id } });
    }
  }

  // 敵
  let enemyIdx = 0;
  for (const eu of encounter.units) {
    const def = getEnemy(eu.enemyId);
    const scale = eu.scale ?? 1;
    const stats: Stats = {
      ...def.base,
      maxHp: def.base.maxHp * scale,
      atk: def.base.atk * scale,
    };
    const effects: { def: EffectDef; origin: string }[] = [];
    if (def.active) effects.push({ def: def.active, origin: 'active' });
    for (const p of def.passives ?? []) effects.push({ def: p, origin: 'passive' });

    units.push({
      id: `E${pad(enemyIdx++)}`,
      defId: def.id,
      name: def.name,
      side: 'enemy',
      role: def.role,
      element: def.element,
      myth: null,
      star: 1,
      onField: true,
      pos: eu.pos,
      stats,
      resist: def.resist,
      isBoss: def.isBoss ?? false,
      targeting: def.targeting ?? 'nearest',
      effects,
    });
  }

  return {
    seed: opts.seed,
    units,
    teamEffects,
    config: cfg,
    logging: opts.logging ?? true,
  };
}
