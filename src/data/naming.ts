/**
 * 盤面アイコン用の短い名前の決め方。
 *
 * 仮名から「（仮）」を除き、最初の「の」までを取る。
 * 「の」がなければ先頭3文字。いずれの場合も最大4文字に収める。
 */

export const SHORT_NAME_MAX = 4;

export function deriveShortName(name: string): string {
  const base = name.replace(/（仮）/g, '').trim();
  const i = base.indexOf('の');
  const picked = i >= 0 ? base.slice(0, i + 1) : base.slice(0, 3);
  return picked.slice(0, SHORT_NAME_MAX);
}
