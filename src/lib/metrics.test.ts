import {describe, expect, it} from 'vitest';
import {ahr, aiv, basketSize, iplh, laborRate, otRate, ppDiff, ratio, retentionRate, simpleAverage, turnoverRate, variancePct, yoyChange, yoyPct} from './metrics';
import {fmt} from './format';

describe('centralized formulas', () => {
  it('computes ratios of totals', () => {
    expect(iplh(4200, 100)).toBe(42);
    expect(laborRate(9, 100)).toBe(0.09);
    expect(ahr(1900, 100)).toBe(19);
    expect(basketSize(90, 10)).toBe(9);
    expect(aiv(450, 100)).toBe(4.5);
    expect(otRate(6, 1000)).toBe(0.006);
  });
  it('YoY change and % follow Current − Prior Year', () => {
    expect(yoyChange(110, 100)).toBe(10);
    expect(yoyPct(110, 100)).toBeCloseTo(0.1);
  });
  it('rate differences are percentage points, not relative %', () => {
    expect(ppDiff(0.098, 0.096)).toBeCloseTo(0.002);
    expect(fmt.pp(0.002)).toBe('+0.20 pp');
  });
  it('turnover and retention follow the workbook drafts', () => {
    expect(turnoverRate(10, 100, 100)).toBe(0.1);
    expect(retentionRate(100, 8)).toBe(0.92);
  });
});

describe('zero denominators fail safely (null, never 0)', () => {
  it('returns null instead of 0 or Infinity', () => {
    expect(ratio(5, 0)).toBeNull();
    expect(iplh(100, 0)).toBeNull();
    expect(laborRate(100, 0)).toBeNull();
    expect(basketSize(10, 0)).toBeNull();
    expect(yoyPct(10, 0)).toBeNull();
    expect(yoyChange(10, 0)).toBeNull();
    expect(variancePct(10, null)).toBeNull();
    expect(turnoverRate(3, 0, 0)).toBeNull();
    expect(retentionRate(0, 0)).toBeNull();
    expect(ratio(Number.NaN, 2)).toBeNull();
    expect(ratio(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('formats null as n/a', () => {
    expect(fmt.pct(null)).toBe('n/a');
    expect(fmt.money(undefined)).toBe('n/a');
  });
  it('simple average ignores missing values and is null when empty', () => {
    expect(simpleAverage([0.1, null, 0.3])).toBeCloseTo(0.2);
    expect(simpleAverage([null])).toBeNull();
  });
});
