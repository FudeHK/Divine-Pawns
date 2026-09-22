/**
 * 戦闘ループ本体。UI・描画に依存しない純粋な TypeScript。
 * 0.1秒刻みの固定タイムステップで、同じ入力なら必ず同じログを出す。
 */

import { DEFAULT_CONFIG, type BattleConfig } from './config';
import {
  applyBurn,
  applyPoison,
  burnCoefFromAtk,
  burnTickDamage,
  frostbiteAtkSpeedMul,
  paralysisBlockChance,
  poisonCoefFromAtk,
  poisonTickDamage,
} from './debuffs';
import {
  backRowY,
  bfsPath,
  cellKey,
  frontRowY,
  hexDistance,
  isValidCell,
  neighbors,
} from './hex';
import { BattleLog, hashLog, type BattleEvent } from './log';
import { Rng } from './rng';
import { attackInterval, cloneStats, normalDamage } from './stats';
import {
  createUnit,
  newGlobalMods,
  type GlobalMods,
  type RuntimeEffect,
  type TimedMod,
  type Unit,
} from './unit';
import {
  ELEMENTS,
  ROLE_PRIORITY,
  STAT_KEYS,
  type Amount,
  type Condition,
  type DebuffKind,
  type Effect,
  type EffectDef,
  type Element,
  type GlobalModKey,
  type Hex,
  type Myth,
  type Role,
  type Side,
  type Star,
  type Stats,
  type TargetSpec,
} from './types';

const EPS = 1e-9;

export type BattleOutcome = 'win' | 'lose' | 'timeout' | 'draw';

export interface BattleUnitSpec {
  id: string;
  defId: string;
  name: string;
  side: Side;
  role: Role;
  element: Element;
  myth: Myth | null;
  star: Star;
  onField: boolean;
  pos: Hex;
  /** 装備・加護込みの最終ステータス */
  stats: Stats;
  resist: number;
  isBoss?: boolean;
  targeting?: 'nearest' | 'backline';
  /** 最初の攻撃までの待ち時間（秒）。省略時は設定値 initialAttackDelay */
  initialAttackDelay?: number;
  /** この個体に付く効果定義（パッシブ・サポート・装備・加護・アクティブ） */
  effects: { def: EffectDef; origin: string }[];
}

/** 効果の出どころ */
export interface EffectSource {
  kind: 'blessing' | 'character' | 'equipment' | 'enemy';
  id: string;
}

/**
 * チーム単位の効果（加護など）。
 * ユニットとしては生成しないので、編成人数・シナジーの数え上げ・
 * ターゲット選び・ログの集計には一切混ざらない。
 */
export interface TeamEffect {
  side: Side;
  def: EffectDef;
  source: EffectSource;
}

/** チーム効果の実行時状態 */
export interface RuntimeTeamEffect extends TeamEffect {
  uses: number;
  timer: number;
  fired: boolean;
  active: boolean;
}

export interface BattleSetup {
  seed: string;
  units: BattleUnitSpec[];
  /** チーム単位の効果（加護など）。ユニットにはしない */
  teamEffects?: TeamEffect[];
  config?: BattleConfig;
  /** ログを記録するか（性能計測時に false にできる） */
  logging?: boolean;
}

export interface ElementDamage {
  fire: number;
  ice: number;
  wood: number;
  lightning: number;
}

export interface BattleResult {
  outcome: BattleOutcome;
  /** 味方の勝ちか */
  win: boolean;
  /** 戦闘時間（秒） */
  duration: number;
  log: BattleLog;
  logHash: string;
  /** 味方の生存数 */
  allySurvivors: number;
  enemySurvivors: number;
  /** 味方側の総与ダメージ */
  allyDamage: number;
  /** 属性別の味方与ダメージ */
  allyDamageByElement: ElementDamage;
  /** 味方側の秒間ダメージ */
  allyDps: number;
  /** 敵側の総与ダメージ */
  enemyDamage: number;
  /** 味方ユニット別の秒間ダメージ */
  perUnitDps: { id: string; defId: string; element: Element; dps: number }[];
}

interface SideGlobals {
  all: GlobalMods;
  byElement: Record<Element, GlobalMods>;
}

function newSideGlobals(): SideGlobals {
  return {
    all: newGlobalMods(),
    byElement: {
      fire: newGlobalMods(),
      ice: newGlobalMods(),
      wood: newGlobalMods(),
      lightning: newGlobalMods(),
    },
  };
}

function resetSideGlobals(g: SideGlobals): void {
  const reset = (m: GlobalMods) => {
    m.burnCoefPct = 0;
    m.burnCoefMul = 1;
    m.burnDamagePct = 0;
    m.poisonDurationAdd = 0;
  };
  reset(g.all);
  for (const e of ELEMENTS) reset(g.byElement[e]);
}

function mergeGlobals(g: SideGlobals, element: Element): GlobalMods {
  const a = g.all;
  const b = g.byElement[element];
  return {
    burnCoefPct: a.burnCoefPct + b.burnCoefPct,
    burnCoefMul: a.burnCoefMul * b.burnCoefMul,
    burnDamagePct: a.burnDamagePct + b.burnDamagePct,
    poisonDurationAdd: a.poisonDurationAdd + b.poisonDurationAdd,
  };
}

/** 効果の分類：常時系（毎フレーム再適用）か、瞬間系か */
function isContinuous(e: Effect): boolean {
  if (e.kind === 'statMod') return e.duration === undefined;
  if (e.kind === 'skillPower') return true;
  if (e.kind === 'globalMod') return true;
  return false;
}

export class Battle {
  readonly cfg: BattleConfig;
  readonly rng: Rng;
  readonly log = new BattleLog();
  readonly units: Unit[] = [];
  readonly logging: boolean;

  t = 0;
  tickCount = 0;
  finished = false;
  outcome: BattleOutcome = 'timeout';

  private readonly globals: Record<Side, SideGlobals> = {
    ally: newSideGlobals(),
    enemy: newSideGlobals(),
  };

  /** 秒単位のサドンデス段階 */
  private suddenDeathStep = 0;

  /** チーム単位の効果（加護など）。ユニットではない */
  readonly teamEffects: RuntimeTeamEffect[] = [];

  constructor(setup: BattleSetup) {
    this.cfg = setup.config ?? DEFAULT_CONFIG;
    this.rng = new Rng(`${setup.seed}::battle`);
    this.logging = setup.logging ?? true;

    for (const spec of setup.units) {
      const u = createUnit({
        id: spec.id,
        defId: spec.defId,
        name: spec.name,
        side: spec.side,
        role: spec.role,
        element: spec.element,
        myth: spec.myth,
        star: spec.star,
        onField: spec.onField,
        pos: spec.pos,
        base: spec.stats,
        resist: spec.resist,
        isBoss: spec.isBoss ?? false,
        targeting: spec.targeting ?? 'nearest',
        initialAttackDelay: spec.initialAttackDelay ?? this.cfg.initialAttackDelay,
      });
      u.effects = spec.effects.map<RuntimeEffect>((e) => ({
        def: e.def,
        uses: 0,
        timer: 0,
        fired: false,
        active: false,
        origin: e.origin,
      }));
      this.units.push(u);
    }
    // ユニットIDで安定ソート（決定論）
    this.units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    for (const te of setup.teamEffects ?? []) {
      this.teamEffects.push({
        side: te.side,
        def: te.def,
        source: te.source,
        uses: 0,
        timer: 0,
        fired: false,
        active: false,
      });
    }
    // 出どころで安定ソート（決定論）
    const key = (t: TeamEffect): string =>
      t.side + ':' + t.source.kind + ':' + t.source.id + ':' + t.def.id;
    this.teamEffects.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }

  // -------------------------------------------------------------------------
  // ログ
  // -------------------------------------------------------------------------

  private emit(e: Omit<BattleEvent, 't'>): void {
    if (!this.logging) return;
    this.log.push({ ...e, t: this.t });
  }

  // -------------------------------------------------------------------------
  // 問い合わせ
  // -------------------------------------------------------------------------

  /** 盤上で生きている、指定陣営のユニット */
  private fielded(side: Side): Unit[] {
    return this.units.filter((u) => u.side === side && u.alive && u.onField);
  }

  /** 編成上の味方全員（サポート枠を含む・生死を問わない） */
  private roster(side: Side): Unit[] {
    return this.units.filter((u) => u.side === side);
  }

  /** ユニットIDから引く（デバフの帰属に使う） */
  private byId(id: string | null): Unit | null {
    if (!id) return null;
    return this.units.find((u) => u.id === id) ?? null;
  }

  private opposite(side: Side): Side {
    return side === 'ally' ? 'enemy' : 'ally';
  }

  private occupancy(): Set<number> {
    const s = new Set<number>();
    for (const u of this.units) {
      if (u.alive && u.onField) s.add(cellKey(u.pos));
    }
    return s;
  }

  private adjacentAllyCount(u: Unit): number {
    if (!u.onField) return 0;
    let n = 0;
    for (const nb of neighbors(u.pos)) {
      for (const o of this.units) {
        if (o === u || !o.alive || !o.onField) continue;
        if (o.side !== u.side) continue;
        if (o.pos.x === nb.x && o.pos.y === nb.y) n++;
      }
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // ステータス再計算
  // -------------------------------------------------------------------------

  /** 常時効果を評価して aura / global / skillPower を作り直す */
  private recomputeAuras(): void {
    for (const u of this.units) {
      u.auraMods.length = 0;
      u.skillPowerBonus = 0;
    }
    resetSideGlobals(this.globals.ally);
    resetSideGlobals(this.globals.enemy);

    for (const u of this.units) {
      if (!u.alive) continue;
      for (const re of u.effects) {
        if (re.def.trigger.kind !== 'always') continue;
        const met = this.conditionsMet(u, re.def.conditions);
        if (met) {
          for (const eff of re.def.effects) {
            if (isContinuous(eff)) this.applyContinuous(u, eff, re.def.id);
          }
          if (!re.active) {
            // 条件が満たされた瞬間だけ、瞬間系の効果を発動
            const inst = re.def.effects.filter((e) => !isContinuous(e));
            if (inst.length > 0 && this.canUse(re)) {
              re.uses++;
              this.emit({ type: 'skill', actor: u.id, note: re.def.name });
              for (const eff of inst) this.applyEffect(u, eff, re.def, false);
            }
          }
        }
        re.active = met;
      }
    }

    this.recomputeTeamAuras();
  }

  /** チーム効果のうち「常時」のものを評価する */
  private recomputeTeamAuras(): void {
    for (const te of this.teamEffects) {
      if (te.def.trigger.kind !== 'always') continue;
      const met = this.teamConditionsMet(te.side, te.def.conditions);
      if (met) {
        for (const eff of te.def.effects) {
          if (isContinuous(eff)) this.applyTeamContinuous(te, eff);
        }
        if (!te.active) {
          const inst = te.def.effects.filter((e) => !isContinuous(e));
          if (inst.length > 0 && this.canUseTeam(te)) {
            te.uses++;
            this.emitTeamEffect(te);
            for (const eff of inst) this.applyTeamInstant(te, eff);
          }
        }
      }
      te.active = met;
    }
  }

  private canUseTeam(te: RuntimeTeamEffect): boolean {
    return te.def.maxUses === undefined || te.uses < te.def.maxUses;
  }

  private emitTeamEffect(te: RuntimeTeamEffect): void {
    this.emit({
      type: 'teamEffect',
      side: te.side,
      note: te.source.kind + ':' + te.source.id + ':' + te.def.id,
    });
  }

  /** everyN / atTime / battleStart のチーム効果を発動する */
  private tryFireTeam(te: RuntimeTeamEffect): void {
    if (!this.canUseTeam(te)) return;
    if (!this.teamConditionsMet(te.side, te.def.conditions)) return;
    te.uses++;
    this.emitTeamEffect(te);
    for (const eff of te.def.effects) {
      if (isContinuous(eff)) this.applyTeamContinuous(te, eff);
      else this.applyTeamInstant(te, eff);
    }
  }

  private fireTeamTrigger(kind: 'battleStart'): void {
    for (const te of this.teamEffects) {
      if (te.def.trigger.kind !== kind) continue;
      this.tryFireTeam(te);
    }
  }

  /**
   * チーム効果の条件。チームには盤面上の位置がないので、
   * 位置に依存する条件（最前列・最後列・隣接）は満たさないものとして扱う。
   */
  private teamConditionsMet(side: Side, conds: readonly Condition[] | undefined): boolean {
    if (!conds || conds.length === 0) return true;
    for (const c of conds) {
      switch (c.kind) {
        case 'countAllies': {
          const includeSupport = c.includeSupport ?? true;
          const list = this.roster(side).filter((o) => o.alive && (includeSupport || o.onField));
          let n = 0;
          for (const o of list) {
            const v = c.by === 'element' ? o.element : c.by === 'role' ? o.role : o.myth;
            if (v === c.value) n++;
          }
          if (n < c.min) return false;
          break;
        }
        case 'allDistinctElements': {
          const list = this.roster(side);
          if (new Set(list.map((o) => o.element)).size !== list.length) return false;
          break;
        }
        case 'allyHpBelow': {
          const list = this.fielded(side);
          if (!list.some((o) => o.hp / Math.max(1, o.base.maxHp) < c.pct / 100)) return false;
          break;
        }
        default:
          // 位置に依存する条件はチームには適用できない
          return false;
      }
    }
    return true;
  }

  /** チーム効果の対象（位置に依存しないものだけ） */
  private teamTargets(side: Side, spec: TargetSpec): Unit[] {
    const foe = this.opposite(side);
    switch (spec) {
      case 'self':
      case 'allAllies':
      case 'frontlineAllies':
        return this.fielded(side);
      case 'allEnemies':
      case 'nearestEnemy':
        return this.fielded(foe);
      case 'lowestHpAlly': {
        const allies = this.fielded(side);
        if (allies.length === 0) return [];
        let best = allies[0]!;
        for (const o of allies) {
          const ro = o.hp / Math.max(1, o.base.maxHp);
          const rb = best.hp / Math.max(1, best.base.maxHp);
          if (ro < rb || (ro === rb && o.id < best.id)) best = o;
        }
        return [best];
      }
      default:
        return [];
    }
  }

  /** チーム効果の常時系（グローバル補正・恒常のステータス補正） */
  private applyTeamContinuous(te: RuntimeTeamEffect, eff: Effect): void {
    if (eff.kind === 'globalMod') {
      const g = this.globals[te.side];
      const bucket = eff.element ? g.byElement[eff.element] : g.all;
      this.applyGlobalMod(bucket, eff.key, eff.mode, eff.value);
      return;
    }
    if (eff.kind === 'statMod') {
      for (const tg of this.teamTargets(te.side, eff.target)) {
        tg.auraMods.push({
          stat: eff.stat,
          mode: eff.mode,
          value: eff.value,
          remaining: Number.POSITIVE_INFINITY,
          sourceId: te.def.id,
        });
      }
    }
  }

  /**
   * チーム効果の瞬間系。
   * チームには参照ステータスがないので、効果量は Amount.flat（固定値）だけを使う。
   */
  private applyTeamInstant(te: RuntimeTeamEffect, eff: Effect): void {
    switch (eff.kind) {
      case 'statMod': {
        for (const tg of this.teamTargets(te.side, eff.target)) {
          tg.timedMods.push({
            stat: eff.stat,
            mode: eff.mode,
            value: eff.value,
            remaining: eff.duration ?? Number.POSITIVE_INFINITY,
            sourceId: te.def.id,
          });
        }
        break;
      }
      case 'damageReduction': {
        for (const tg of this.teamTargets(te.side, eff.target)) {
          tg.reductions.push({ pct: eff.pct, remaining: eff.duration, sourceId: te.def.id });
        }
        break;
      }
      case 'applyDebuff': {
        for (const tg of this.teamTargets(te.side, eff.target)) {
          if (eff.debuff === 'frostbite') tg.debuffs.frostbite.stacks += eff.stacks;
          else if (eff.debuff === 'paralysis') tg.debuffs.paralysis.stacks += eff.stacks;
          this.emit({
            type: 'debuff',
            target: tg.id,
            value: eff.stacks,
            debuff: eff.debuff,
            note: te.def.name,
          });
        }
        break;
      }
      case 'mana': {
        for (const tg of this.teamTargets(te.side, eff.target)) this.addMana(tg, eff.value);
        break;
      }
      case 'shield': {
        const v = eff.amount.flat ?? 0;
        if (v > 0) for (const tg of this.teamTargets(te.side, eff.target)) tg.shield += v;
        break;
      }
      case 'damage': {
        const v = eff.amount.flat ?? 0;
        for (const tg of this.teamTargets(te.side, eff.target)) {
          this.dealDamage(null, tg, v, te.def.name, null);
        }
        break;
      }
      default:
        break;
    }
  }

  private canUse(re: RuntimeEffect): boolean {
    return re.def.maxUses === undefined || re.uses < re.def.maxUses;
  }

  private applyContinuous(source: Unit, eff: Effect, sourceId: string): void {
    switch (eff.kind) {
      case 'statMod': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          tg.auraMods.push({
            stat: eff.stat,
            mode: eff.mode,
            value: eff.value,
            remaining: Number.POSITIVE_INFINITY,
            sourceId,
          });
        }
        break;
      }
      case 'skillPower':
        source.skillPowerBonus += eff.value;
        break;
      case 'globalMod': {
        const g = this.globals[source.side];
        const bucket = eff.element ? g.byElement[eff.element] : g.all;
        this.applyGlobalMod(bucket, eff.key, eff.mode, eff.value);
        break;
      }
      default:
        break;
    }
  }

  private applyGlobalMod(
    m: GlobalMods,
    key: GlobalModKey,
    mode: 'add' | 'mul',
    value: number,
  ): void {
    if (mode === 'add') m[key] += value;
    else m[key] *= value;
  }

  /** base + aura + timed + 凍傷 から実効ステータスを作る */
  private recomputeEffective(): void {
    for (const u of this.units) {
      const s = cloneStats(u.base);
      const pct: Record<string, number> = {};
      for (const k of STAT_KEYS) pct[k] = 0;

      const applyMods = (mods: readonly TimedMod[]) => {
        for (const m of mods) {
          if (m.mode === 'flat') s[m.stat] += m.value;
          else pct[m.stat]! += m.value;
        }
      };
      applyMods(u.auraMods);
      applyMods(u.timedMods);

      for (const k of STAT_KEYS) {
        if (pct[k] !== 0) s[k] = s[k] * (1 + pct[k]!);
      }

      // 凍傷は攻撃速度に乗算で効く
      if (u.debuffs.frostbite.stacks > 0) {
        s.atkSpeed *= frostbiteAtkSpeedMul(
          u.debuffs.frostbite.stacks,
          u.resist,
          this.cfg,
        );
      }

      s.maxHp = Math.max(1, s.maxHp);
      s.atkSpeed = Math.max(0, s.atkSpeed);
      s.moveSpeed = Math.max(0, s.moveSpeed);
      s.range = Math.max(0, s.range);
      s.def = Math.max(0, s.def);
      u.eff = s;
    }
  }

  // -------------------------------------------------------------------------
  // 条件
  // -------------------------------------------------------------------------

  private conditionsMet(u: Unit, conds: readonly Condition[] | undefined): boolean {
    if (!conds || conds.length === 0) return true;
    for (const c of conds) {
      if (!this.conditionMet(u, c)) return false;
    }
    return true;
  }

  private conditionMet(u: Unit, c: Condition): boolean {
    switch (c.kind) {
      case 'inFrontRow':
        return u.onField && u.pos.y === frontRowY(u.side);
      case 'inBackRow':
        return u.onField && u.pos.y === backRowY(u.side);
      case 'adjacentAllies': {
        const n = this.adjacentAllyCount(u);
        if (c.min !== undefined && n < c.min) return false;
        if (c.max !== undefined && n > c.max) return false;
        return true;
      }
      case 'countAllies': {
        const includeSupport = c.includeSupport ?? true;
        const list = this.roster(u.side).filter(
          (o) => o.alive && (includeSupport || o.onField),
        );
        let n = 0;
        for (const o of list) {
          const v =
            c.by === 'element' ? o.element : c.by === 'role' ? o.role : o.myth;
          if (v === c.value) n++;
        }
        return n >= c.min;
      }
      case 'allDistinctElements': {
        const list = this.roster(u.side);
        const set = new Set(list.map((o) => o.element));
        return set.size === list.length;
      }
      case 'allyHpBelow': {
        const list = this.fielded(u.side);
        return list.some((o) => o.hp / Math.max(1, o.base.maxHp) < c.pct / 100);
      }
      case 'selfHpBelow':
        return u.hp / Math.max(1, u.base.maxHp) < c.pct / 100;
    }
  }

  // -------------------------------------------------------------------------
  // ターゲット選択
  // -------------------------------------------------------------------------

  /** 2体の敵候補を比べる（負なら a を優先） */
  private compareTargets(source: Unit, a: Unit, b: Unit): number {
    if (source.targeting === 'backline') {
      const back = backRowY(a.side);
      const aBack = a.pos.y === back ? 0 : 1;
      const bBack = b.pos.y === back ? 0 : 1;
      if (aBack !== bBack) return aBack - bBack;
    }
    const da = hexDistance(source.pos, a.pos);
    const db = hexDistance(source.pos, b.pos);
    if (da !== db) return da - db;

    // 挑発
    const ta = a.tauntRemaining > 0 ? 0 : 1;
    const tb = b.tauntRemaining > 0 ? 0 : 1;
    if (ta !== tb) return ta - tb;

    // 役割の優先度
    const ra = ROLE_PRIORITY.indexOf(a.role);
    const rb = ROLE_PRIORITY.indexOf(b.role);
    if (ra !== rb) return ra - rb;

    // 残りHPが少ない
    if (a.hp !== b.hp) return a.hp - b.hp;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  private findTarget(source: Unit): Unit | null {
    const foes = this.fielded(this.opposite(source.side));
    if (foes.length === 0) return null;
    let best = foes[0]!;
    for (let i = 1; i < foes.length; i++) {
      if (this.compareTargets(source, foes[i]!, best) < 0) best = foes[i]!;
    }
    return best;
  }

  private resolveTargets(
    source: Unit,
    spec: TargetSpec,
    radius: number | undefined,
  ): Unit[] {
    const foeSide = this.opposite(source.side);
    switch (spec) {
      case 'self':
        return source.alive ? [source] : [];
      case 'current': {
        const t = source.currentTarget;
        return t && t.alive && t.onField ? [t] : [];
      }
      case 'attacker': {
        const t = source.lastAttacker;
        return t && t.alive && t.onField ? [t] : [];
      }
      case 'nearestEnemy': {
        const t = this.findTarget(source);
        return t ? [t] : [];
      }
      case 'allEnemies':
        return this.fielded(foeSide);
      case 'enemiesInRadius': {
        const r = radius ?? 1;
        if (!source.onField) return this.fielded(foeSide);
        return this.fielded(foeSide).filter(
          (o) => hexDistance(source.pos, o.pos) <= r,
        );
      }
      case 'enemiesAroundTarget': {
        const r = radius ?? 1;
        const c = source.currentTarget;
        if (!c || !c.alive) return [];
        return this.fielded(foeSide).filter((o) => hexDistance(c.pos, o.pos) <= r);
      }
      case 'enemyFrontRow': {
        const y = frontRowY(foeSide);
        const row = this.fielded(foeSide).filter((o) => o.pos.y === y);
        return row.length > 0 ? row : this.fielded(foeSide);
      }
      case 'enemyDensestRow': {
        const foes = this.fielded(foeSide);
        if (foes.length === 0) return [];
        const counts = new Map<number, number>();
        for (const o of foes) counts.set(o.pos.y, (counts.get(o.pos.y) ?? 0) + 1);
        let bestY = Number.POSITIVE_INFINITY;
        let bestN = -1;
        for (const [y, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
          if (n > bestN) {
            bestN = n;
            bestY = y;
          }
        }
        return foes.filter((o) => o.pos.y === bestY);
      }
      case 'allAllies':
      case 'frontlineAllies':
        return this.fielded(source.side);
      case 'lowestHpAlly': {
        const allies = this.fielded(source.side);
        if (allies.length === 0) return [];
        let best = allies[0]!;
        for (const o of allies) {
          const ro = o.hp / Math.max(1, o.base.maxHp);
          const rb = best.hp / Math.max(1, best.base.maxHp);
          if (ro < rb || (ro === rb && o.id < best.id)) best = o;
        }
        return [best];
      }
    }
  }

  // -------------------------------------------------------------------------
  // 効果量
  // -------------------------------------------------------------------------

  private amountValue(
    source: Unit,
    target: Unit | null,
    a: Amount,
    isSkill: boolean,
  ): number {
    const ref = a.ref ?? 'self';
    const from = ref === 'target' ? target : source;
    const statVal = from ? from.eff[a.stat] : 0;
    let coef = a.coef;
    if (a.scaleWithStar || isSkill) {
      coef *= this.cfg.starSkillMul[source.star] * (1 + source.skillPowerBonus);
    }
    return statVal * coef + (a.flat ?? 0);
  }

  // -------------------------------------------------------------------------
  // 効果の実行
  // -------------------------------------------------------------------------

  private applyEffect(
    source: Unit,
    eff: Effect,
    def: EffectDef,
    isSkill: boolean,
  ): void {
    switch (eff.kind) {
      case 'damage': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          const raw = this.amountValue(source, tg, eff.amount, isSkill);
          const dmg = eff.ignoreDef
            ? raw
            : normalDamage(raw, tg.eff.def, this.cfg);
          this.dealDamage(source, tg, dmg, def.name, source.element);
        }
        break;
      }
      case 'heal': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          const v = this.amountValue(source, tg, eff.amount, isSkill);
          this.healUnit(source, tg, v, def.name);
        }
        break;
      }
      case 'shield': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          const v = this.amountValue(source, tg, eff.amount, isSkill);
          tg.shield += v;
          this.emit({
            type: 'shield',
            actor: source.id,
            target: tg.id,
            value: v,
            note: def.name,
          });
        }
        break;
      }
      case 'applyDebuff': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          this.applyDebuffTo(source, tg, eff.debuff, eff.stacks, def.name);
        }
        break;
      }
      case 'statMod': {
        const targets = this.resolveTargets(source, eff.target, eff.radius);
        for (const tg of targets) {
          tg.timedMods.push({
            stat: eff.stat,
            mode: eff.mode,
            value: eff.value,
            remaining: eff.duration ?? Number.POSITIVE_INFINITY,
            sourceId: def.id,
          });
          this.emit({
            type: 'statMod',
            actor: source.id,
            target: tg.id,
            value: eff.value,
            note: `${def.name}:${eff.stat}`,
          });
        }
        break;
      }
      case 'taunt': {
        source.tauntRemaining = Math.max(source.tauntRemaining, eff.duration);
        this.emit({
          type: 'taunt',
          actor: source.id,
          value: eff.duration,
          note: def.name,
        });
        break;
      }
      case 'mana': {
        const targets = this.resolveTargets(source, eff.target, undefined);
        for (const tg of targets) this.addMana(tg, eff.value);
        break;
      }
      case 'damageReduction': {
        const targets = this.resolveTargets(source, eff.target, undefined);
        for (const tg of targets) {
          tg.reductions.push({
            pct: eff.pct,
            remaining: eff.duration,
            sourceId: def.id,
          });
        }
        this.emit({ type: 'statMod', actor: source.id, value: eff.pct, note: def.name });
        break;
      }
      case 'skillPower':
      case 'globalMod':
        // 常時系として recomputeAuras で扱う
        break;
    }
  }

  /** トリガーを発火させる（常時系以外） */
  private fireTrigger(
    u: Unit,
    kind: Exclude<EffectDef['trigger']['kind'], 'always'>,
  ): void {
    if (!u.alive) return;
    for (const re of u.effects) {
      if (re.def.trigger.kind !== kind) continue;
      if (!this.canUse(re)) continue;
      if (!this.conditionsMet(u, re.def.conditions)) continue;
      re.uses++;
      for (const eff of re.def.effects) this.applyEffect(u, eff, re.def, false);
    }
  }

  // -------------------------------------------------------------------------
  // ダメージ・回復・デバフ
  // -------------------------------------------------------------------------

  private dealDamage(
    source: Unit | null,
    target: Unit,
    rawAmount: number,
    note: string,
    element: Element | null,
  ): void {
    if (!target.alive || !target.onField) return;
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;

    let amount = rawAmount;
    for (const r of target.reductions) amount *= 1 - r.pct;

    // シールドで吸収
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, amount);
      target.shield -= absorbed;
      amount -= absorbed;
    }

    target.hp -= amount;
    if (source) {
      source.damageDealt += rawAmount;
      if (element) source.damageByElement[element] += rawAmount;
    }

    this.emit({
      type: 'damage',
      actor: source?.id,
      target: target.id,
      value: rawAmount,
      note,
    });

    // 被弾
    this.addMana(target, this.cfg.manaOnHit);
    if (source) target.lastAttacker = source;
    this.fireTrigger(target, 'onHit');

    if (target.hp <= 0) {
      this.killUnit(target, source);
    } else {
      this.checkHpBelow(target);
    }
  }

  private checkHpBelow(u: Unit): void {
    const ratio = u.hp / Math.max(1, u.base.maxHp);
    for (const re of u.effects) {
      const tr = re.def.trigger;
      if (tr.kind !== 'hpBelow') continue;
      if (re.fired) continue;
      if (ratio >= tr.pct / 100) continue;
      if (!this.canUse(re)) continue;
      if (!this.conditionsMet(u, re.def.conditions)) continue;
      re.fired = true;
      re.uses++;
      this.emit({ type: 'skill', actor: u.id, note: re.def.name });
      for (const eff of re.def.effects) this.applyEffect(u, eff, re.def, false);
    }
  }

  private killUnit(u: Unit, killer: Unit | null): void {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    this.emit({ type: 'death', target: u.id, actor: killer?.id, pos: u.pos });
    if (killer) this.fireTrigger(killer, 'onKill');
  }

  private healUnit(source: Unit, target: Unit, amount: number, note: string): void {
    if (!target.alive || !target.onField) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const before = target.hp;
    target.hp = Math.min(target.base.maxHp, target.hp + amount);
    this.emit({
      type: 'heal',
      actor: source.id,
      target: target.id,
      value: target.hp - before,
      note,
    });
  }

  private addMana(u: Unit, v: number): void {
    if (!u.alive) return;
    u.mana = Math.min(u.eff.maxMana, u.mana + v);
  }

  private applyDebuffTo(
    source: Unit,
    target: Unit,
    kind: DebuffKind,
    stacks: number,
    note: string,
  ): void {
    if (!target.alive || !target.onField) return;
    if (stacks <= 0) return;
    const g = mergeGlobals(this.globals[source.side], source.element);

    switch (kind) {
      case 'burn': {
        const coef =
          burnCoefFromAtk(source.eff.atk, this.cfg) *
          (1 + g.burnCoefPct) *
          g.burnCoefMul *
          (1 + g.burnDamagePct);
        applyBurn(target.debuffs.burn, stacks, coef, source.id);
        break;
      }
      case 'frostbite':
        target.debuffs.frostbite.stacks += stacks;
        break;
      case 'poison': {
        const coef = poisonCoefFromAtk(source.eff.atk, this.cfg);
        const dur =
          (this.cfg.debuff.poison.durationPerApply + g.poisonDurationAdd) * stacks;
        applyPoison(target.debuffs.poison, coef, dur, source.id);
        break;
      }
      case 'paralysis':
        target.debuffs.paralysis.stacks += stacks;
        break;
    }

    this.emit({
      type: 'debuff',
      actor: source.id,
      target: target.id,
      value: stacks,
      debuff: kind,
      note,
    });
  }

  // -------------------------------------------------------------------------
  // 行動
  // -------------------------------------------------------------------------

  private tryUseSkill(u: Unit): boolean {
    if (u.mana < u.eff.maxMana - EPS) return false;
    const active = u.effects.find((re) => re.def.trigger.kind === 'onSkill');
    if (!active) return false;

    // 麻痺の判定
    const chance = paralysisBlockChance(
      u.debuffs.paralysis.stacks,
      u.resist,
      this.cfg,
    );
    if (chance > 0 && this.rng.chance(chance)) {
      u.mana = u.eff.maxMana * this.cfg.debuff.paralysis.manaOnBlock;
      u.debuffs.paralysis.stacks = 0;
      this.emit({
        type: 'skillBlocked',
        actor: u.id,
        value: chance,
        debuff: 'paralysis',
      });
      return true;
    }

    u.mana = 0;
    this.emit({ type: 'skill', actor: u.id, target: u.currentTarget?.id, note: active.def.name });
    if (this.conditionsMet(u, active.def.conditions)) {
      active.uses++;
      for (const eff of active.def.effects) this.applyEffect(u, eff, active.def, true);
    }
    // 他の「スキル使用時」効果
    for (const re of u.effects) {
      if (re === active) continue;
      if (re.def.trigger.kind !== 'onSkill') continue;
      if (!this.canUse(re)) continue;
      if (!this.conditionsMet(u, re.def.conditions)) continue;
      re.uses++;
      for (const eff of re.def.effects) this.applyEffect(u, eff, re.def, false);
    }
    return true;
  }

  private performAttack(u: Unit, target: Unit): void {
    const dmg = normalDamage(u.eff.atk, target.eff.def, this.cfg);
    this.emit({ type: 'attack', actor: u.id, target: target.id, value: dmg });
    this.addMana(u, this.cfg.manaOnAttack);
    this.dealDamage(u, target, dmg, 'attack', u.element);
    this.fireTrigger(u, 'onAttack');
  }

  private moveToward(u: Unit, target: Unit): void {
    const dt = this.cfg.tick;
    u.moveProgress += u.eff.moveSpeed * dt;
    if (u.moveProgress < 1) return;

    const occ = this.occupancy();
    occ.delete(cellKey(u.pos));
    const range = Math.floor(u.eff.range);
    const path = bfsPath(u.pos, target.pos, occ, range);
    if (!path || path.length === 0) {
      u.moveProgress = Math.min(u.moveProgress, 1);
      return;
    }
    const next = path[0]!;
    if (!isValidCell(next)) return;
    u.moveProgress -= 1;
    u.pos = { ...next };
    this.emit({ type: 'move', actor: u.id, pos: u.pos });
  }

  private actUnit(u: Unit): void {
    if (!u.alive || !u.onField) return;

    const target = this.findTarget(u);
    u.currentTarget = target;
    if (!target) return;

    // スキル
    if (this.tryUseSkill(u)) {
      // スキルを使ったターンも攻撃判定は続行する（攻撃間隔は独立）
    }
    if (!u.alive) return;

    const dist = hexDistance(u.pos, target.pos);
    if (dist <= u.eff.range) {
      if (u.attackTimer <= EPS) {
        this.performAttack(u, target);
        u.attackTimer = attackInterval(u.eff.atkSpeed);
      }
      u.moveProgress = 0;
    } else {
      this.moveToward(u, target);
    }
  }

  // -------------------------------------------------------------------------
  // 毎秒の処理
  // -------------------------------------------------------------------------

  private tickSecond(): void {
    const c = this.cfg;

    // 燃焼・猛毒
    for (const u of this.units) {
      if (!u.alive || !u.onField) continue;
      const d = u.debuffs;

      if (d.burn.stacks > 0) {
        const dmg = burnTickDamage(d.burn);
        if (dmg > 0) {
          this.emit({
            type: 'debuffTick',
            target: u.id,
            value: dmg,
            debuff: 'burn',
          });
          this.dealDamage(this.byId(d.burn.sourceId), u, dmg, 'burn', 'fire');
        }
        d.burn.stacks = Math.max(0, d.burn.stacks - c.debuff.burn.decayPerSecond);
        if (d.burn.stacks === 0) {
          d.burn.coef = 0;
          d.burn.sourceId = null;
        }
      }

      if (!u.alive) continue;

      if (d.poison.remaining > 0) {
        const dmg = poisonTickDamage(d.poison, c);
        if (dmg > 0) {
          this.emit({
            type: 'debuffTick',
            target: u.id,
            value: dmg,
            debuff: 'poison',
          });
          this.dealDamage(this.byId(d.poison.sourceId), u, dmg, 'poison', 'wood');
        }
        d.poison.remaining -= 1;
        d.poison.elapsed += 1;
        if (d.poison.remaining <= 0) {
          d.poison.remaining = 0;
          d.poison.elapsed = 0;
          d.poison.coef = 0;
          d.poison.sourceId = null;
        }
      }

      d.frostbite.stacks = Math.max(
        0,
        d.frostbite.stacks - c.debuff.frostbite.decayPerSecond,
      );
      d.paralysis.stacks = Math.max(
        0,
        d.paralysis.stacks - c.debuff.paralysis.decayPerSecond,
      );
    }

    // 時間切れ（サドンデス）
    if (this.t > c.timeout.startSeconds + EPS) {
      this.suddenDeathStep++;
      const pct =
        c.timeout.basePct + c.timeout.stepPct * (this.suddenDeathStep - 1);
      for (const u of this.units) {
        if (!u.alive || !u.onField) continue;
        const dmg = u.base.maxHp * pct;
        this.emit({ type: 'timeoutTick', target: u.id, value: dmg });
        this.dealDamage(null, u, dmg, 'timeout', null);
      }
    }
  }

  // -------------------------------------------------------------------------
  // メインループ
  // -------------------------------------------------------------------------

  start(): void {
    this.emit({ type: 'battleStart', value: 0 });
    for (const u of this.units) {
      this.emit({
        type: 'spawn',
        actor: u.id,
        pos: u.onField ? u.pos : undefined,
        side: u.side,
        note: u.defId,
      });
    }
    for (const te of this.teamEffects) {
      this.emit({
        type: 'teamEffect',
        side: te.side,
        note: 'register ' + te.source.kind + ':' + te.source.id + ':' + te.def.id,
      });
    }
    this.recomputeAuras();
    this.recomputeEffective();
    for (const u of this.units) {
      u.hp = u.base.maxHp;
    }
    for (const u of this.units) {
      this.fireTrigger(u, 'battleStart');
    }
    this.fireTeamTrigger('battleStart');
    this.recomputeAuras();
    this.recomputeEffective();
  }

  /** 1ステップ進める。終了したら true */
  step(): boolean {
    if (this.finished) return true;
    const dt = this.cfg.tick;
    this.tickCount++;
    this.t = Math.round(this.tickCount * dt * 10) / 10;

    // タイマーの減衰
    for (const u of this.units) {
      if (!u.alive) continue;
      u.attackTimer = Math.max(0, u.attackTimer - dt);
      if (u.tauntRemaining > 0) u.tauntRemaining = Math.max(0, u.tauntRemaining - dt);
      if (u.timedMods.length > 0) {
        u.timedMods = u.timedMods.filter((m) => {
          m.remaining -= dt;
          return m.remaining > EPS;
        });
      }
      if (u.reductions.length > 0) {
        u.reductions = u.reductions.filter((r) => {
          r.remaining -= dt;
          return r.remaining > EPS;
        });
      }
    }

    this.recomputeAuras();
    this.recomputeEffective();

    // 毎秒の処理
    if (this.tickCount % Math.round(1 / dt) === 0) {
      this.tickSecond();
      this.recomputeAuras();
      this.recomputeEffective();
    }

    // everyN / atTime
    for (const u of this.units) {
      if (!u.alive) continue;
      for (const re of u.effects) {
        const tr = re.def.trigger;
        if (tr.kind === 'everyN') {
          re.timer += dt;
          if (re.timer >= tr.seconds - EPS) {
            re.timer -= tr.seconds;
            if (this.canUse(re) && this.conditionsMet(u, re.def.conditions)) {
              re.uses++;
              this.emit({ type: 'skill', actor: u.id, note: re.def.name });
              for (const eff of re.def.effects) this.applyEffect(u, eff, re.def, false);
            }
          }
        } else if (tr.kind === 'atTime') {
          if (!re.fired && this.t >= tr.seconds - EPS) {
            re.fired = true;
            if (this.canUse(re) && this.conditionsMet(u, re.def.conditions)) {
              re.uses++;
              this.emit({ type: 'skill', actor: u.id, note: re.def.name });
              for (const eff of re.def.effects) this.applyEffect(u, eff, re.def, false);
            }
          }
        }
      }
    }

    for (const te of this.teamEffects) {
      const tr = te.def.trigger;
      if (tr.kind === 'everyN') {
        te.timer += dt;
        if (te.timer >= tr.seconds - EPS) {
          te.timer -= tr.seconds;
          this.tryFireTeam(te);
        }
      } else if (tr.kind === 'atTime') {
        if (!te.fired && this.t >= tr.seconds - EPS) {
          te.fired = true;
          this.tryFireTeam(te);
        }
      }
    }

    // 行動（ユニットID順＝決定論）
    for (const u of this.units) {
      this.actUnit(u);
    }

    return this.checkEnd();
  }

  private checkEnd(): boolean {
    const allies = this.fielded('ally');
    const foes = this.fielded('enemy');
    if (foes.length === 0 && allies.length === 0) {
      // 同時全滅の扱いは設定値
      this.finished = true;
      this.outcome =
        this.cfg.simultaneousWipe === 'win'
          ? 'win'
          : this.cfg.simultaneousWipe === 'draw'
            ? 'draw'
            : 'lose';
    } else if (foes.length === 0) {
      this.finished = true;
      this.outcome = 'win';
    } else if (allies.length === 0) {
      this.finished = true;
      this.outcome = 'lose';
    } else if (this.t >= this.cfg.maxDuration - EPS) {
      this.finished = true;
      this.outcome = 'timeout';
    }
    if (this.finished) {
      this.emit({ type: 'battleEnd', note: this.outcome });
    }
    return this.finished;
  }

  run(): BattleResult {
    this.start();
    // 開幕で決着している場合に備える
    if (!this.checkEnd()) {
      const maxTicks = Math.ceil(this.cfg.maxDuration / this.cfg.tick) + 1;
      for (let i = 0; i < maxTicks; i++) {
        if (this.step()) break;
      }
    }
    if (!this.finished) {
      this.finished = true;
      this.outcome = 'timeout';
      this.emit({ type: 'battleEnd', note: this.outcome });
    }
    return this.result();
  }

  result(): BattleResult {
    const duration = this.t;
    const allyUnits = this.units.filter((u) => u.side === 'ally');
    const enemyUnits = this.units.filter((u) => u.side === 'enemy');
    const allyDamage = allyUnits.reduce((s, u) => s + u.damageDealt, 0);
    const enemyDamage = enemyUnits.reduce((s, u) => s + u.damageDealt, 0);
    const byEl: ElementDamage = { fire: 0, ice: 0, wood: 0, lightning: 0 };
    for (const u of allyUnits) {
      for (const e of ELEMENTS) byEl[e] += u.damageByElement[e];
    }
    const d = Math.max(this.cfg.tick, duration);
    return {
      outcome: this.outcome,
      win: this.outcome === 'win',
      duration,
      log: this.log,
      logHash: hashLog(this.log),
      allySurvivors: this.fielded('ally').length,
      enemySurvivors: this.fielded('enemy').length,
      allyDamage,
      allyDamageByElement: byEl,
      allyDps: allyDamage / d,
      enemyDamage,
      perUnitDps: allyUnits.map((u) => ({
        id: u.id,
        defId: u.defId,
        element: u.element,
        dps: u.damageDealt / d,
      })),
    };
  }
}

export function runBattle(setup: BattleSetup): BattleResult {
  return new Battle(setup).run();
}
