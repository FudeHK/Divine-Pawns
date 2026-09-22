/**
 * テスト用キャラ（8体・4神話×2体）。名前はすべて仮。
 *
 * スキルは「覚えられるプール（skills）」と「最初から持っているもの（initialSkills）」に分かれる。
 * 初期は『アクティブ or パッシブ から1つ』＋『サポート1つ』だけを持ち、
 * ★が上がる（＝合成する）たびに、まだ覚えていないスキルの中から3択で1つ覚える。
 */

import { makeBase } from '../engine/stats';
import type { CharacterDef, EffectDef, SkillDef, SkillKind, StatKey } from '../engine/types';
import { perAdjacentAlly } from './effectHelpers';
import { validateAll, zCharacterDef } from './schema';

function skill(id: string, kind: SkillKind, def: EffectDef): SkillDef {
  return { id, kind, def };
}

/** 「〜の間、ステータス+X%」のパッシブを作る */
function conditionalStat(
  id: string,
  name: string,
  summary: string,
  where: 'inFrontRow' | 'inBackRow',
  stat: StatKey,
  value: number,
): EffectDef {
  return {
    id,
    name,
    summary,
    trigger: { kind: 'always' },
    conditions: [{ kind: where }],
    effects: [{ kind: 'statMod', target: 'self', stat, mode: 'pct', value }],
  };
}

const raw: CharacterDef[] = [
  // ---------------------------------------------------------------- ギリシャ
  {
    id: 'GRE_A',
    name: '青銅の守り手（仮）',
    shortName: '青銅の',
    myth: 'greek',
    role: 'tank',
    element: 'ice',
    tier: 3,
    base: makeBase('tank', 3),
    initialSkills: ['GRE_A_p1', 'GRE_A_s1'],
    skills: [
      skill('GRE_A_p1', 'passive', conditionalStat(
        'GRE_A_p1', '最前線の構え', '最前列にいる間、防御が上がる', 'inFrontRow', 'def', 0.2,
      )),
      skill('GRE_A_s1', 'support', {
        id: 'GRE_A_s1',
        name: '開幕の護り',
        summary: '開幕に前衛全員へシールドを張る',
        trigger: { kind: 'battleStart' },
        effects: [
          { kind: 'shield', target: 'frontlineAllies', amount: { stat: 'maxHp', coef: 0.1, ref: 'self' } },
        ],
      }),
      skill('GRE_A_a1', 'active', {
        id: 'GRE_A_a1',
        name: '凍てつく咆哮',
        summary: '周囲の敵を凍傷にし、自分に挑発',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'frostbite', stacks: 5 },
          { kind: 'taunt', duration: 4 },
        ],
      }),
      skill('GRE_A_a2', 'active', {
        id: 'GRE_A_a2',
        name: '不屈の盾',
        summary: '自分にシールドを張り、防御を固める',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'shield', target: 'self', amount: { stat: 'maxHp', coef: 0.3 } },
          { kind: 'statMod', target: 'self', stat: 'def', mode: 'pct', value: 0.4, duration: 6 },
        ],
      }),
      skill('GRE_A_p2', 'passive', {
        id: 'GRE_A_p2',
        name: '氷の反撃',
        summary: '被弾すると攻撃者を凍傷にする',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'applyDebuff', target: 'attacker', debuff: 'frostbite', stacks: 1 }],
      }),
    ],
  },
  {
    id: 'GRE_B',
    name: '遠雷の射手（仮）',
    shortName: '遠雷の',
    myth: 'greek',
    role: 'ranged',
    element: 'lightning',
    tier: 2,
    base: makeBase('ranged', 2, { range: 4 }),
    initialSkills: ['GRE_B_a1', 'GRE_B_s1'],
    skills: [
      skill('GRE_B_a1', 'active', {
        id: 'GRE_B_a1',
        name: '貫雷の矢',
        summary: '単体に大ダメージと麻痺を与える',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.6 } },
          { kind: 'applyDebuff', target: 'current', debuff: 'paralysis', stacks: 6 },
        ],
      }),
      skill('GRE_B_s1', 'support', {
        id: 'GRE_B_s1',
        name: '進軍の号令',
        summary: '前衛全体の攻撃速度を上げる',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'statMod', target: 'frontlineAllies', stat: 'atkSpeed', mode: 'pct', value: 0.08 },
        ],
      }),
      skill('GRE_B_p1', 'passive', conditionalStat(
        'GRE_B_p1', '後衛の狙撃', '最後列にいる間、攻撃力が上がる', 'inBackRow', 'atk', 0.3,
      )),
      skill('GRE_B_p2', 'passive', {
        id: 'GRE_B_p2',
        name: '追い討ち',
        summary: '敵を倒すたびに攻撃速度が上がる',
        trigger: { kind: 'onKill' },
        effects: [{ kind: 'statMod', target: 'self', stat: 'atkSpeed', mode: 'pct', value: 0.1 }],
      }),
      skill('GRE_B_s2', 'support', {
        id: 'GRE_B_s2',
        name: '遠雷の見立て',
        summary: '雷属性の前衛の攻撃力を上げる',
        trigger: { kind: 'always' },
        effects: [
          {
            kind: 'statMod',
            target: 'frontlineAllies',
            filter: { element: 'lightning' },
            stat: 'atk',
            mode: 'pct',
            value: 0.15,
          },
        ],
      }),
    ],
  },

  // ------------------------------------------------------------------ 北欧
  {
    id: 'NOR_A',
    name: '灼炎の戦士（仮）',
    shortName: '灼炎の',
    myth: 'norse',
    role: 'melee',
    element: 'fire',
    tier: 3,
    base: makeBase('melee', 3),
    initialSkills: ['NOR_A_a1', 'NOR_A_s1'],
    skills: [
      skill('NOR_A_a1', 'active', {
        id: 'NOR_A_a1',
        name: '燃え盛る一撃',
        summary: '単体に大ダメージと燃焼を与える',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.4 } },
          { kind: 'applyDebuff', target: 'current', debuff: 'burn', stacks: 6 },
        ],
      }),
      skill('NOR_A_s1', 'support', {
        id: 'NOR_A_s1',
        name: '炎の加勢',
        summary: '炎属性の味方の燃焼を強くする',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'globalMod', key: 'burnCoefPct', mode: 'add', value: 0.2, element: 'fire' },
        ],
      }),
      // 「隣接する味方1体につき攻撃力+5%」は6段の条件つき効果で表す
      skill('NOR_A_p1', 'passive', {
        id: 'NOR_A_p1',
        name: '共闘の熱',
        summary: '隣にいる味方の数だけ攻撃力が上がる',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'adjacentAllies', min: 1 }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atk', mode: 'pct', value: 0.05 }],
      }),
      skill('NOR_A_p2', 'passive', {
        id: 'NOR_A_p2',
        name: '火の粉',
        summary: '攻撃するたびに燃焼を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'burn', stacks: 1 }],
      }),
      skill('NOR_A_a2', 'active', {
        id: 'NOR_A_a2',
        name: '業炎の薙ぎ',
        summary: '周囲の敵をまとめて焼く',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'damage', target: 'enemiesInRadius', radius: 1, amount: { stat: 'atk', coef: 1.5 } },
          { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'burn', stacks: 3 },
        ],
      }),
    ],
  },
  {
    id: 'NOR_B',
    name: '霜の語り部（仮）',
    shortName: '霜の',
    myth: 'norse',
    role: 'support',
    element: 'ice',
    tier: 1,
    base: makeBase('support', 1),
    initialSkills: ['NOR_B_a1', 'NOR_B_s1'],
    skills: [
      skill('NOR_B_a1', 'active', {
        id: 'NOR_B_a1',
        name: '凍える息吹',
        summary: '敵全体に凍傷を与える',
        trigger: { kind: 'onSkill' },
        effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 3 }],
      }),
      skill('NOR_B_s1', 'support', {
        id: 'NOR_B_s1',
        name: '遠吠えの霜',
        summary: '一定間隔で敵全体に凍傷を与える',
        trigger: { kind: 'everyN', seconds: 15 },
        effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff: 'frostbite', stacks: 4 }],
      }),
      skill('NOR_B_p1', 'passive', {
        id: 'NOR_B_p1',
        name: '痛みの糧',
        summary: '被弾するたびにマナが増える',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'mana', target: 'self', value: 5 }],
      }),
      skill('NOR_B_s2', 'support', {
        id: 'NOR_B_s2',
        name: '霜の守り',
        summary: '前衛全体の防御を上げる',
        trigger: { kind: 'always' },
        effects: [
          { kind: 'statMod', target: 'frontlineAllies', stat: 'def', mode: 'pct', value: 0.15 },
        ],
      }),
      skill('NOR_B_p2', 'passive', {
        id: 'NOR_B_p2',
        name: '凍る指先',
        summary: '攻撃するたびに凍傷を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'frostbite', stacks: 1 }],
      }),
    ],
  },

  // ------------------------------------------------------------------ 日本
  {
    id: 'JPN_A',
    name: '毒沼の鬼（仮）',
    shortName: '毒沼の',
    myth: 'japanese',
    role: 'melee',
    element: 'wood',
    tier: 2,
    base: makeBase('melee', 2),
    initialSkills: ['JPN_A_a1', 'JPN_A_s1'],
    skills: [
      skill('JPN_A_a1', 'active', {
        id: 'JPN_A_a1',
        name: '瘴気の薙ぎ払い',
        summary: '周囲の敵を斬りつけ猛毒を与える',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'poison', stacks: 2 },
          { kind: 'damage', target: 'enemiesInRadius', radius: 1, amount: { stat: 'atk', coef: 1.1 } },
        ],
      }),
      skill('JPN_A_s1', 'support', {
        id: 'JPN_A_s1',
        name: '根深き毒',
        summary: '猛毒の効果時間を延ばす',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'poisonDurationAdd', mode: 'add', value: 1 }],
      }),
      skill('JPN_A_p1', 'passive', {
        id: 'JPN_A_p1',
        name: '手負いの猛り',
        summary: 'HPが減ると攻撃速度が上がる',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'selfHpBelow', pct: 50 }],
        effects: [{ kind: 'statMod', target: 'self', stat: 'atkSpeed', mode: 'pct', value: 0.3 }],
      }),
      skill('JPN_A_p2', 'passive', {
        id: 'JPN_A_p2',
        name: '毒の爪',
        summary: '攻撃するたびに猛毒を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'poison', stacks: 1 }],
      }),
      skill('JPN_A_a2', 'active', {
        id: 'JPN_A_a2',
        name: '鬼の膂力',
        summary: '単体に大きな一撃を叩き込む',
        trigger: { kind: 'onSkill' },
        effects: [{ kind: 'damage', target: 'current', amount: { stat: 'atk', coef: 2.8 } }],
      }),
    ],
  },
  {
    id: 'JPN_B',
    name: '鳴神の巫女（仮）',
    shortName: '鳴神の',
    myth: 'japanese',
    role: 'healer',
    element: 'lightning',
    tier: 2,
    base: makeBase('healer', 2),
    initialSkills: ['JPN_B_a1', 'JPN_B_s1'],
    skills: [
      skill('JPN_B_a1', 'active', {
        id: 'JPN_B_a1',
        name: '癒しの祝詞',
        summary: 'HPが最も低い味方を回復する',
        trigger: { kind: 'onSkill' },
        effects: [{ kind: 'heal', target: 'lowestHpAlly', amount: { stat: 'atk', coef: 2 } }],
      }),
      skill('JPN_B_s1', 'support', {
        id: 'JPN_B_s1',
        name: '遅れて届く祈り',
        summary: 'しばらくして前衛全員を回復する',
        trigger: { kind: 'atTime', seconds: 15 },
        effects: [
          { kind: 'heal', target: 'frontlineAllies', amount: { stat: 'atk', coef: 1.5, ref: 'self' } },
        ],
      }),
      skill('JPN_B_p1', 'passive', {
        id: 'JPN_B_p1',
        name: '痺れの一矢',
        summary: '攻撃するたびに麻痺を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'paralysis', stacks: 1 }],
      }),
      skill('JPN_B_a2', 'active', {
        id: 'JPN_B_a2',
        name: '巡りの雷',
        summary: '味方全体を少し回復する',
        trigger: { kind: 'onSkill' },
        effects: [{ kind: 'heal', target: 'allAllies', amount: { stat: 'atk', coef: 1.0 } }],
      }),
      skill('JPN_B_s2', 'support', {
        id: 'JPN_B_s2',
        name: '守り神の目',
        summary: '一定間隔で前衛全員を少し回復する',
        trigger: { kind: 'everyN', seconds: 12 },
        effects: [
          { kind: 'heal', target: 'frontlineAllies', amount: { stat: 'atk', coef: 0.8, ref: 'self' } },
        ],
      }),
    ],
  },

  // ---------------------------------------------------------------- エジプト
  {
    id: 'EGY_A',
    name: '陽炎の術師（仮）',
    shortName: '陽炎の',
    myth: 'egyptian',
    role: 'mage',
    element: 'fire',
    tier: 3,
    base: makeBase('mage', 3),
    initialSkills: ['EGY_A_a1', 'EGY_A_s1'],
    skills: [
      skill('EGY_A_a1', 'active', {
        id: 'EGY_A_a1',
        name: '灼熱の爆炎',
        summary: '対象の周囲を焼き、燃焼を与える',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'damage', target: 'enemiesAroundTarget', radius: 1, amount: { stat: 'atk', coef: 1.8 } },
          { kind: 'applyDebuff', target: 'enemiesAroundTarget', radius: 1, debuff: 'burn', stacks: 3 },
        ],
      }),
      skill('EGY_A_s1', 'support', {
        id: 'EGY_A_s1',
        name: '灰の残り火',
        summary: '燃焼のダメージを上げる',
        trigger: { kind: 'always' },
        effects: [{ kind: 'globalMod', key: 'burnDamagePct', mode: 'add', value: 0.1 }],
      }),
      skill('EGY_A_p1', 'passive', {
        id: 'EGY_A_p1',
        name: '後衛の集中',
        summary: '最後列にいる間、スキルが強い',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'inBackRow' }],
        effects: [{ kind: 'skillPower', value: 0.2 }],
      }),
      skill('EGY_A_p2', 'passive', {
        id: 'EGY_A_p2',
        name: '燃え残り',
        summary: '攻撃するたびに燃焼を与える',
        trigger: { kind: 'onAttack' },
        effects: [{ kind: 'applyDebuff', target: 'current', debuff: 'burn', stacks: 1 }],
      }),
      skill('EGY_A_a2', 'active', {
        id: 'EGY_A_a2',
        name: '陽炎の焼灼',
        summary: '敵全体に燃焼を植えつける',
        trigger: { kind: 'onSkill' },
        effects: [{ kind: 'applyDebuff', target: 'allEnemies', debuff: 'burn', stacks: 3 }],
      }),
    ],
  },
  {
    id: 'EGY_B',
    name: '砂蛇の番人（仮）',
    shortName: '砂蛇の',
    myth: 'egyptian',
    role: 'tank',
    element: 'wood',
    tier: 1,
    base: makeBase('tank', 1),
    initialSkills: ['EGY_B_p1', 'EGY_B_s1'],
    skills: [
      skill('EGY_B_p1', 'passive', {
        id: 'EGY_B_p1',
        name: '返し毒',
        summary: '被弾すると攻撃者に猛毒を与える',
        trigger: { kind: 'onHit' },
        effects: [{ kind: 'applyDebuff', target: 'attacker', debuff: 'poison', stacks: 1 }],
      }),
      skill('EGY_B_s1', 'support', {
        id: 'EGY_B_s1',
        name: '守護の砂嵐',
        summary: '味方が危うい時、一度だけ守る',
        trigger: { kind: 'always' },
        conditions: [{ kind: 'allyHpBelow', pct: 50 }],
        maxUses: 1,
        effects: [{ kind: 'damageReduction', target: 'frontlineAllies', pct: 0.3, duration: 5 }],
      }),
      skill('EGY_B_a1', 'active', {
        id: 'EGY_B_a1',
        name: '砂塵の盾',
        summary: '自分にシールドを張り挑発する',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'shield', target: 'self', amount: { stat: 'maxHp', coef: 0.25 } },
          { kind: 'taunt', duration: 5 },
        ],
      }),
      skill('EGY_B_p2', 'passive', conditionalStat(
        'EGY_B_p2', '砂の護り', '最前列にいる間、HPの減りが遅くなる', 'inFrontRow', 'def', 0.25,
      )),
      skill('EGY_B_a2', 'active', {
        id: 'EGY_B_a2',
        name: '毒砂の渦',
        summary: '周囲の敵に猛毒をまき散らす',
        trigger: { kind: 'onSkill' },
        effects: [
          { kind: 'applyDebuff', target: 'enemiesInRadius', radius: 1, debuff: 'poison', stacks: 2 },
          { kind: 'taunt', duration: 4 },
        ],
      }),
    ],
  },
];

export const CHARACTERS: readonly CharacterDef[] = validateAll(
  zCharacterDef,
  raw,
  'CHARACTERS',
);

export const CHARACTER_BY_ID: ReadonlyMap<string, CharacterDef> = new Map(
  CHARACTERS.map((c) => [c.id, c]),
);

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTER_BY_ID.get(id);
  if (!c) throw new Error(`未知のキャラID: ${id}`);
  return c;
}

export function getSkill(charId: string, skillId: string): SkillDef {
  const s = getCharacter(charId).skills.find((x) => x.id === skillId);
  if (!s) throw new Error(`未知のスキルID: ${charId}/${skillId}`);
  return s;
}

/**
 * ★に応じた既定のスキル構成。
 * 明示的に選んでいない場合（シミュレーションなど）に使う。
 * 初期スキル ＋ プールの並び順で (★-1) 個。
 */
export function defaultSkills(charId: string, star: 1 | 2 | 3): string[] {
  const c = getCharacter(charId);
  const out = [...c.initialSkills];
  for (const s of c.skills) {
    if (out.length >= c.initialSkills.length + (star - 1)) break;
    if (!out.includes(s.id)) out.push(s.id);
  }
  return out;
}

/** まだ覚えていないスキル */
export function unlearnedSkills(charId: string, learned: readonly string[]): SkillDef[] {
  return getCharacter(charId).skills.filter((s) => !learned.includes(s.id));
}

/** 「隣接する味方1体につき攻撃力+5%」を6段に展開する（NOR_A_p1 用） */
export function expandSkillEffects(charId: string, skillId: string): EffectDef[] {
  const s = getSkill(charId, skillId);
  if (s.id === 'NOR_A_p1') {
    return perAdjacentAlly('NOR_A_p1', '共闘の熱', s.def.summary, 'atk', 0.05);
  }
  return [s.def];
}
