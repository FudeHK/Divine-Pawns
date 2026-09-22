/**
 * データ定義の zod スキーマ。
 * キャラ・敵・遭遇・装備・加護はすべてここで検証してから使う。
 */

import { z } from 'zod';
import type {
  BlessingDef,
  CharacterDef,
  EffectDef,
  EncounterDef,
  EnemyDef,
  EquipmentDef,
} from '../engine/types';

export const zElement = z.enum(['fire', 'ice', 'wood', 'lightning']);
export const zRole = z.enum(['tank', 'melee', 'ranged', 'mage', 'healer', 'support']);
export const zRarity = z.enum(['common', 'rare', 'epic']);
export const zMyth = z.enum(['greek', 'norse', 'japanese', 'egyptian']);
export const zDebuffKind = z.enum(['burn', 'frostbite', 'poison', 'paralysis']);
export const zStatKey = z.enum([
  'maxHp',
  'atk',
  'def',
  'atkSpeed',
  'range',
  'maxMana',
  'moveSpeed',
]);

export const zStats = z.object({
  maxHp: z.number().positive(),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  atkSpeed: z.number().positive(),
  range: z.number().int().min(1).max(8),
  maxMana: z.number().positive(),
  moveSpeed: z.number().positive(),
});

export const zHex = z.object({
  x: z.number().int().min(0).max(4),
  y: z.number().int().min(0).max(5),
});

export const zTrigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('battleStart') }),
  z.object({ kind: z.literal('onAttack') }),
  z.object({ kind: z.literal('onHit') }),
  z.object({ kind: z.literal('onSkill') }),
  z.object({ kind: z.literal('everyN'), seconds: z.number().positive() }),
  z.object({ kind: z.literal('atTime'), seconds: z.number().nonnegative() }),
  z.object({ kind: z.literal('hpBelow'), pct: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('onKill') }),
  z.object({ kind: z.literal('always') }),
]);

export const zCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inFrontRow') }),
  z.object({ kind: z.literal('inBackRow') }),
  z.object({
    kind: z.literal('adjacentAllies'),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('countAllies'),
    by: z.enum(['element', 'role', 'myth']),
    value: z.string(),
    min: z.number().int().nonnegative(),
    includeSupport: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('allDistinctElements') }),
  z.object({ kind: z.literal('allyHpBelow'), pct: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('selfHpBelow'), pct: z.number().min(0).max(100) }),
]);

export const zTargetSpec = z.enum([
  'self',
  'current',
  'attacker',
  'nearestEnemy',
  'allEnemies',
  'enemiesInRadius',
  'enemiesAroundTarget',
  'enemyFrontRow',
  'enemyDensestRow',
  'allAllies',
  'frontlineAllies',
  'lowestHpAlly',
]);

export const zAmount = z.object({
  stat: zStatKey,
  coef: z.number(),
  ref: z.enum(['self', 'target']).optional(),
  scaleWithStar: z.boolean().optional(),
  flat: z.number().optional(),
});

export const zGlobalModKey = z.enum([
  'burnCoefPct',
  'burnCoefMul',
  'burnDamagePct',
  'poisonDurationAdd',
]);

export const zUnitFilter = z.object({
  element: zElement.optional(),
  role: zRole.optional(),
  myth: zMyth.optional(),
});

export const zEffect = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage'),
    target: zTargetSpec,
    radius: z.number().int().nonnegative().optional(),
    amount: zAmount,
    ignoreDef: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('heal'),
    target: zTargetSpec,
    radius: z.number().int().nonnegative().optional(),
    amount: zAmount,
  }),
  z.object({
    kind: z.literal('shield'),
    target: zTargetSpec,
    radius: z.number().int().nonnegative().optional(),
    amount: zAmount,
    duration: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('applyDebuff'),
    target: zTargetSpec,
    radius: z.number().int().nonnegative().optional(),
    debuff: zDebuffKind,
    stacks: z.number().positive(),
  }),
  z.object({
    kind: z.literal('statMod'),
    target: zTargetSpec,
    radius: z.number().int().nonnegative().optional(),
    filter: zUnitFilter.optional(),
    stat: zStatKey,
    mode: z.enum(['flat', 'pct']),
    value: z.number(),
    duration: z.number().positive().optional(),
  }),
  z.object({ kind: z.literal('taunt'), duration: z.number().positive() }),
  z.object({ kind: z.literal('mana'), target: zTargetSpec, value: z.number() }),
  z.object({ kind: z.literal('skillPower'), value: z.number() }),
  z.object({
    kind: z.literal('damageReduction'),
    target: zTargetSpec,
    pct: z.number().min(0).max(1),
    duration: z.number().positive(),
  }),
  z.object({
    kind: z.literal('globalMod'),
    key: zGlobalModKey,
    mode: z.enum(['add', 'mul']),
    value: z.number(),
    element: zElement.optional(),
  }),
]);

export const zShortName = z.string().min(1).max(4);

export const zEffectDef: z.ZodType<EffectDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1).max(40),
  trigger: zTrigger,
  conditions: z.array(zCondition).optional(),
  effects: z.array(zEffect).min(1),
  maxUses: z.number().int().positive().optional(),
}) as z.ZodType<EffectDef>;

export const zCharacterDef: z.ZodType<CharacterDef> = z.object({
  id: z.string().regex(/^[A-Z]{3}_[A-Z]$/),
  name: z.string().min(1),
  shortName: zShortName,
  myth: zMyth,
  role: zRole,
  element: zElement,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  base: zStats,
  active: zEffectDef,
  passives: z.array(zEffectDef),
  support: z.array(zEffectDef),
}) as z.ZodType<CharacterDef>;

export const zEnemyDef: z.ZodType<EnemyDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: zShortName,
  role: zRole,
  element: zElement,
  base: zStats,
  resist: z.number().min(0).max(1),
  isBoss: z.boolean().optional(),
  targeting: z.enum(['nearest', 'backline']).optional(),
  active: zEffectDef.optional(),
  passives: z.array(zEffectDef).optional(),
}) as z.ZodType<EnemyDef>;

export const zBuildMod = z.object({
  filter: z
    .object({
      element: zElement.optional(),
      role: zRole.optional(),
      myth: zMyth.optional(),
    })
    .optional(),
  require: z.literal('allDistinctElements').optional(),
  stat: zStatKey,
  mode: z.enum(['flat', 'pct']),
  value: z.number(),
});

export const zEquipmentDef: z.ZodType<EquipmentDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  flat: zStats.partial().optional(),
  pct: zStats.partial().optional(),
  effects: z.array(zEffectDef).optional(),
}) as z.ZodType<EquipmentDef>;

export const zBlessingDef: z.ZodType<BlessingDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1).max(40),
  summary: z.string().min(1).max(40),
  rarity: zRarity,
  buildMods: z.array(zBuildMod).optional(),
  effects: z.array(zEffectDef).optional(),
}) as z.ZodType<BlessingDef>;

export const zEncounterDef: z.ZodType<EncounterDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  units: z
    .array(
      z.object({
        enemyId: z.string().min(1),
        pos: zHex.refine((h) => h.y <= 2, {
          message: '敵は y=0〜2 にしか置けない',
        }),
        scale: z.number().positive().optional(),
      }),
    )
    .min(1),
}) as z.ZodType<EncounterDef>;

/** 配列をまとめて検証して返す */
export function validateAll<T>(schema: z.ZodType<T>, items: unknown[], label: string): T[] {
  return items.map((it, i) => {
    const r = schema.safeParse(it);
    if (!r.success) {
      throw new Error(
        `${label}[${i}] のデータ検証に失敗: ${JSON.stringify(r.error.issues, null, 2)}`,
      );
    }
    return r.data;
  });
}
