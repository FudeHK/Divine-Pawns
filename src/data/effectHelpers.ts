/**
 * 効果定義を書くための小さなヘルパー。
 */

import type { EffectDef, StatKey, TargetSpec } from '../engine/types';

/**
 * 「隣接する味方1体につき +X%」を、条件つき効果の積み重ねで表現する。
 * 六角グリッドの隣接は最大6なので、6段に分ける。
 */
export function perAdjacentAlly(
  idBase: string,
  name: string,
  stat: StatKey,
  valuePerAlly: number,
  target: TargetSpec = 'self',
): EffectDef[] {
  const out: EffectDef[] = [];
  for (let n = 1; n <= 6; n++) {
    out.push({
      id: `${idBase}_${n}`,
      name: `${name}(${n})`,
      trigger: { kind: 'always' },
      conditions: [{ kind: 'adjacentAllies', min: n }],
      effects: [{ kind: 'statMod', target, stat, mode: 'pct', value: valuePerAlly }],
    });
  }
  return out;
}
