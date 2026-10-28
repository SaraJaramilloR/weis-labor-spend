import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX, WEEKS_PER_YEAR} from '../data/calendar';
import {DAILY_FACTS, DAILY_FIRST_WEEK_IDX, LABOR_FACTS} from '../data/generate';
import {STORES, deptById} from '../data/org';
import {dailyRollup, laborKpis, rollup, total} from './aggregate';
import {aiv} from './metrics';

const all = new Set(STORES.map(s => s.id));
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(Math.max(1e-6, Math.abs(b) * 1e-9));

describe('reconciliation', () => {
  const from = LAST_WEEK_IDX - 12;
  const t = total(all, 'All', from, LAST_WEEK_IDX);

  it('store, district, region and department rollups sum to the total', () => {
    for (const group of ['store', 'district', 'region', 'dept'] as const) {
      const parts = [...rollup(all, 'All', from, LAST_WEEK_IDX, group).values()];
      close(parts.reduce((s, p) => s + p.labor.pay, 0), t.labor.pay);
      close(parts.reduce((s, p) => s + p.labor.hours, 0), t.labor.hours);
      close(parts.reduce((s, p) => s + p.labor.sales, 0), t.labor.sales);
    }
  });

  it('labor totals equal the raw facts: no adjustment is added on top of the source', () => {
    const raw = LABOR_FACTS.filter(f => f.w >= from && f.w <= LAST_WEEK_IDX);
    close(t.labor.pay, raw.reduce((s, f) => s + f.pay, 0));
    close(t.labor.hours, raw.reduce((s, f) => s + f.hours, 0));
    // Starbucks is a department in the source and is counted exactly once.
    const sb = total(all, 'starbucks', from, LAST_WEEK_IDX);
    close(sb.labor.pay, raw.filter(f => f.dept === 'starbucks').reduce((s, f) => s + f.pay, 0));
  });

  it('weeks reconcile with the time-frame total', () => {
    const weeks = [...rollup(all, 'All', from, LAST_WEEK_IDX, 'week').values()];
    close(weeks.reduce((s, w) => s + w.labor.pay, 0), t.labor.pay);
    close(weeks.reduce((s, w) => s + w.store.tx, 0), t.store.tx);
  });

  it('ratios are ratios of totals, not averages of store ratios', () => {
    const k = laborKpis(t.labor, 'budget');
    close(k.iplh!, t.labor.items / t.labor.hours);
    close(k.laborRate!, t.labor.pay / t.labor.sales);
  });

  it('daily facts reconcile with the weekly facts', () => {
    const w = LAST_WEEK_IDX;
    const daily = [...dailyRollup(all, 'All', w, 'all', () => 'x').values()][0];
    const weekly = total(all, 'All', w, w).labor;
    close(daily.hours, weekly.hours);
    close(daily.pay, weekly.pay);
    close(daily.hoursBud, weekly.hoursBud);
    expect(DAILY_FACTS.every(f => f.w >= DAILY_FIRST_WEEK_IDX)).toBe(true);
  });

  it('FY2026 last-year values equal FY2025 actuals of the same week', () => {
    const f26 = total(all, 'All', WEEKS_PER_YEAR + 5, WEEKS_PER_YEAR + 5).labor;
    const f25 = total(all, 'All', 5, 5).labor;
    close(f26.payLY, f25.pay);
    close(f26.salesLY, f25.sales);
  });
});

describe('scope exclusions', () => {
  const t = total(all, 'All', 60, 70);
  it('Clean Sales excludes Fuel, Pharmacy and Front End', () => {
    const excluded = (['fuel', 'rx', 'frontend'] as const).reduce((s, d) => s + total(all, d, 60, 70).labor.sales, 0);
    close(t.store.cleanSales, t.store.storeSales - excluded);
  });
  it('overtime excludes Pharmacy (RX)', () => {
    const rx = total(all, 'rx', 60, 70);
    expect(rx.labor.otPay).toBe(0);
    expect(rx.labor.otBasePay).toBe(0);
    const raw = LABOR_FACTS.filter(f => f.w >= 60 && f.w <= 70 && !deptById.get(f.dept)!.otExcluded);
    close(t.labor.otPay, raw.reduce((s, f) => s + f.otPay, 0));
  });
  it('store-level measures do not change with the Department filter', () => {
    const g = total(all, 'grocery', 60, 70);
    close(g.store.tx, t.store.tx);
    close(g.store.cleanSales, t.store.cleanSales);
  });
  it('inflation (AIV) is independent of labor calculations', () => {
    const k = laborKpis(t.labor, 'budget');
    const shifted = {...t.labor, sales: t.labor.sales};
    expect(aiv(t.labor.sales, t.labor.items)).not.toBeNull();
    expect(laborKpis(shifted, 'budget').spend).toBe(k.spend);
    expect(Object.keys(k).some(key => key.toLowerCase().includes('aiv') || key.toLowerCase().includes('inflation'))).toBe(false);
  });
  it('an empty scope returns zero totals and null ratios', () => {
    const empty = total(new Set(), 'All', 60, 70);
    const k = laborKpis(empty.labor, 'budget');
    expect(empty.labor.rows).toBe(0);
    expect(k.iplh).toBeNull();
    expect(k.laborRate).toBeNull();
    expect(k.spendVarPct).toBeNull();
  });
  it('references stay distinct; MDoc has no Labor Rate and Budget has no IPLH', () => {
    const k = laborKpis(t.labor, 'mdoc');
    expect(k.laborRateRef).toBeNull();
    expect(laborKpis(t.labor, 'budget').iplhRef).toBeNull();
    expect(t.labor.payBud).not.toBe(t.labor.payMdoc);
    expect(t.labor.hoursBud).not.toBe(t.labor.hoursProj);
  });
});
