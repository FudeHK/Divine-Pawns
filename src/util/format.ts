/**
 * 数値の短縮表記。
 * 1,000未満は整数。以上は 1.2K / 3.4M / 5.6B / 7.8T。1e15 以上は 1.2e15。
 * 計算は倍精度の浮動小数で行い、極端な値でも止まらないこと。
 */

const UNITS: readonly { value: number; suffix: string }[] = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

const EXP_THRESHOLD = 1e15;

/** 小数第1位で切り捨て（表示が実値を超えないようにする） */
function trunc1(v: number): string {
  const t = Math.floor(v * 10) / 10;
  // 1.0 → "1"、1.2 → "1.2"
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

export function formatNumber(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';

  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);

  if (a < 1000) {
    return sign + String(Math.floor(a));
  }

  if (a >= EXP_THRESHOLD) {
    const exp = Math.floor(Math.log10(a));
    const mant = a / Math.pow(10, exp);
    return `${sign}${trunc1(mant)}e${exp}`;
  }

  for (const u of UNITS) {
    if (a >= u.value) {
      return `${sign}${trunc1(a / u.value)}${u.suffix}`;
    }
  }
  return sign + String(Math.floor(a));
}

/** 割合を % 表記に */
export function formatPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '-';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** 秒を "12.3s" 形式に */
export function formatSeconds(s: number): string {
  return `${s.toFixed(1)}s`;
}
