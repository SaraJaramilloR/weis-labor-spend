import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX, WEEKS, periodRange} from '../data/calendar';
import {DAILY_FACTS} from '../data/generate';
import {STORES} from '../data/org';
import {rollup, total} from './aggregate';
import {aivActual, aivRef, historyRange, inflationPct, inflationValue, scopeRange} from './aivHistory';
import {otRate} from './metrics';

const all = new Set(STORES.map(s => s.id));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('AIV history (OPS111 measures)', () => {
  const [from, to] = historyRange(LAST_WEEK_IDX);
  const weekly = rollup(all, 'All', from, to, 'week');

  it('uses a rolling 52-week window of weekly points ending at the anchor week', () => {
    expect(to - from + 1).toBe(52);
    expect(weekly.size).toBe(52);
    expect(historyRange(10)).toEqual([0, 10]);
  });
  it('summary scopes reconcile with the weekly history: LW is the last point, PTD / QTD / YTD add up the weeks', () => {
    const lw = rollup(all, 'All', ...scopeRange('LW', to), 'none').get('all')!.labor;
    expect(aivActual(lw)).toBeCloseTo(aivActual(weekly.get(String(to))!.labor)!, 12);
    for (const sc of ['PTD', 'QTD', 'YTD'] as const) {
      const [a, b] = scopeRange(sc, to);
      const s = rollup(all, 'All', a, b, 'none').get('all')!.labor;
      const weeks = [...weekly].filter(([w]) => Number(w) >= a && Number(w) <= b).map(([, r]) => r.labor);
      expect(s.sales).toBeCloseTo(sum(weeks.map(x => x.sales)), 4);
      expect(s.items).toBe(sum(weeks.map(x => x.items)));
      // A scope AIV is a ratio of totals, not an average of weekly AIVs.
      expect(aivActual(s)).toBeCloseTo(sum(weeks.map(x => x.sales)) / sum(weeks.map(x => x.items)), 12);
    }
    expect(scopeRange('PTD', to)[0]).toBe(periodRange(WEEKS[to].fy, WEEKS[to].period)[0]);
    expect(WEEKS[scopeRange('YTD', to)[0]].week).toBe(1);
  });
  it('estimated inflation % and $ follow OPS111 against LY and Budget', () => {
    const t = total(all, 'meat', from, to).labor;
    const a = t.sales / t.items;
    const ly = t.salesLY / t.itemsLY;
    const bud = t.salesBud / t.itemsBud;
    expect(aivRef(t, 'ly')).toBeCloseTo(ly, 12);
    expect(inflationPct(t, 'ly')).toBeCloseTo((a - ly) / ly, 12);
    expect(inflationValue(t, 'ly')).toBeCloseTo((a - ly) * t.items, 6);
    expect(inflationPct(t, 'budget')).toBeCloseTo((a - bud) / bud, 12);
    expect(inflationValue(t, 'budget')).toBeCloseTo((a - bud) * t.items, 6);
  });
  it('a department history uses only that department', () => {
    const meat = rollup(all, 'meat', from, to, 'week');
    expect(meat.get(String(to))!.labor.sales).toBeLessThan(weekly.get(String(to))!.labor.sales);
  });
});

describe('hours references and overtime rate', () => {
  it('daily MDoc and Budget hours both reconcile with the week and stay distinct', () => {
    const w = LAST_WEEK_IDX;
    const days = DAILY_FACTS.filter(f => f.w === w);
    const week = total(all, 'All', w, w).labor;
    expect(sum(days.map(f => f.hoursBud))).toBeCloseTo(week.hoursBud, 2);
    expect(sum(days.map(f => f.hoursMdoc))).toBeCloseTo(week.hoursMdoc, 2);
    expect(week.hoursMdoc).not.toBeCloseTo(week.hoursBud, 0);
  });
  it('overtime rate keeps the payroll denominator and excludes Pharmacy on both sides', () => {
    const t = total(all, 'All', LAST_WEEK_IDX - 3, LAST_WEEK_IDX).labor;
    const rx = total(all, 'rx', LAST_WEEK_IDX - 3, LAST_WEEK_IDX).labor;
    expect(t.otBasePay).toBeCloseTo(t.pay - rx.pay, 4);
    expect(otRate(t.otPay, t.otBasePay)).toBeCloseTo(t.otPay / (t.pay - rx.pay), 12);
    expect(otRate(t.otPay, t.otBasePay)).not.toBeCloseTo(t.otPay / t.payBud, 6);
  });
});
