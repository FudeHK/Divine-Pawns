import { describe, expect, it } from 'vitest';

import { formatNumber, formatPct, formatSeconds } from '../src/util/format';

describe('数値の短縮表記', () => {
  it('1,000未満は整数', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(123.9)).toBe('123');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(999.9)).toBe('999');
  });

  it('K / M / B / T', () => {
    expect(formatNumber(1000)).toBe('1K');
    expect(formatNumber(1200)).toBe('1.2K');
    expect(formatNumber(3_400_000)).toBe('3.4M');
    expect(formatNumber(5_600_000_000)).toBe('5.6B');
    expect(formatNumber(7_800_000_000_000)).toBe('7.8T');
  });

  it('1e15 以上は指数表記', () => {
    expect(formatNumber(1.2e15)).toBe('1.2e15');
    expect(formatNumber(9.87e20)).toBe('9.8e20');
    expect(formatNumber(1e100)).toBe('1e100');
  });

  it('負の数', () => {
    expect(formatNumber(-42)).toBe('-42');
    expect(formatNumber(-1200)).toBe('-1.2K');
  });

  it('極端な値でも止まらない', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('-∞');
    expect(formatNumber(Number.NaN)).toBe('NaN');
    expect(formatNumber(Number.MAX_VALUE)).toMatch(/^1\.7e308$/);
    expect(formatNumber(Number.MIN_VALUE)).toBe('0');
  });

  it('表示が実値を超えない（切り捨て）', () => {
    expect(formatNumber(1999)).toBe('1.9K');
    expect(formatNumber(1_099_999)).toBe('1M');
  });
});

describe('その他の表記', () => {
  it('割合', () => {
    expect(formatPct(0.5)).toBe('50.0%');
    expect(formatPct(0.1234, 2)).toBe('12.34%');
  });
  it('秒', () => {
    expect(formatSeconds(12.34)).toBe('12.3s');
  });
});
