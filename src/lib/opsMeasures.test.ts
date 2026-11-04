// Prototype calculations checked against the Ops 100 DAX expressions in "OPS100_Reports_Measures and Source to Target
// Mapping" (Measure Definations sheet). Synthetic data: these tests prove the same logic, not agreement with Weis results.
import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {laborByWeek} from '../data/generate';
import {STORES} from '../data/org';
import {laborKpis, refIplh, rollup, total} from './aggregate';
import {isIdStore} from './filters';
import {iplh, otRate} from './metrics';

const all = new Set(STORES.map(s => s.id));
const region1 = new Set(STORES.filter(s => s.regionId === 'R1').map(s => s.id));
const from = LAST_WEEK_IDX - 3;
const facts = (stores: Set<string>) => laborByWeek.slice(from, LAST_WEEK_IDX + 1).flat().filter(f => stores.has(f.store));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Overtime rate = OT_Less_RX_Rate_TY', () => {
  // OT_Less_RX_OT_Dollar_Act / OT_Less_RX_Pay_Act: SUM over department rows NOT IN {"RX", "TOTAL"} (no TOTAL rows here).
  const rows = facts(all).filter(f => f.dept !== 'rx');
  const t = total(all, 'All', from, LAST_WEEK_IDX).labor;
  it('numerator and denominator both exclude Pharmacy; the denominator is actual payroll, not budget', () => {
    expect(t.otPay).toBeCloseTo(sum(rows.map(f => f.otPay)), 4);
    expect(t.otBasePay).toBeCloseTo(sum(rows.map(f => f.pay)), 4);
    expect(otRate(t.otPay, t.otBasePay)).toBeCloseTo(sum(rows.map(f => f.otPay)) / sum(rows.map(f => f.pay)), 12);
    expect(otRate(t.otPay, t.otBasePay)).not.toBeCloseTo(t.otPay / t.payBud, 6);
    expect(t.otHours).toBeCloseTo(sum(rows.map(f => f.otHours)), 4);
  });
  it('LY uses the same exclusions (OT_Less_RX_Rate_LY)', () => {
    expect(otRate(t.otPayLY, t.otBasePayLY)).toBeCloseTo(sum(rows.map(f => f.otPayLY)) / sum(rows.map(f => f.payLY)), 12);
  });
  it('Pharmacy data is kept for other measures (hours, pay, sales)', () => {
    const rx = total(all, 'rx', from, LAST_WEEK_IDX).labor;
    expect(rx.hours).toBeGreaterThan(0);
    expect(rx.pay).toBeGreaterThan(0);
    expect(t.pay).toBeCloseTo(t.otBasePay + rx.pay, 4);
  });
});

describe('Clean Sales = Clean Sales Actual / Lyear', () => {
  // CALCULATE(SUM(Sales), FILTER(ALL(Dept[Database Name]), NOT Dept[Database Name] IN {"GAS","RX","TOTAL","FRONT END"}))
  const expected = (stores: Set<string>, k: 'sales' | 'salesLY') => sum(facts(stores).filter(f => !['fuel', 'rx', 'frontend'].includes(f.dept)).map(f => f[k]));
  it('excludes Fuel (GAS), Pharmacy (RX) and the Front End department row; LY uses the same filter', () => {
    const s = total(all, 'All', from, LAST_WEEK_IDX).store;
    expect(s.cleanSales).toBeCloseTo(expected(all, 'sales'), 4);
    expect(s.cleanSalesLY).toBeCloseTo(expected(all, 'salesLY'), 4);
    expect(s.cleanSales).toBeLessThan(s.storeSales);
  });
  it('ALL(Dept[Database Name]) replaces the Department filter only: store and time filters still apply', () => {
    const meat = total(region1, 'meat', from, LAST_WEEK_IDX).store;
    const any = total(region1, 'All', from, LAST_WEEK_IDX).store;
    expect(meat.cleanSales).toBeCloseTo(any.cleanSales, 6);
    expect(meat.cleanSales).toBeCloseTo(expected(region1, 'sales'), 4);
    expect(any.cleanSales).toBeLessThan(total(all, 'All', from, LAST_WEEK_IDX).store.cleanSales);
    expect(total(region1, 'All', LAST_WEEK_IDX, LAST_WEEK_IDX).store.cleanSales).toBeLessThan(any.cleanSales);
  });
});

describe('IPLH variants', () => {
  const t = total(all, 'All', from, LAST_WEEK_IDX).labor;
  it('IPLH Master Doc, Budget and Last Year use their own numerators and denominators', () => {
    expect(refIplh(t, 'mdoc')).toBeCloseTo(t.itemsMdoc / t.hoursMdoc, 12);
    expect(refIplh(t, 'budget')).toBeCloseTo(t.itemsBud / t.hoursBud, 12);
    expect(refIplh(t, 'ly')).toBeCloseTo(t.itemsLY / t.hoursLY, 12);
    expect(t.itemsBud).toBeGreaterThan(0);
  });
  it('ID IPLH Mdoc = ID Items Actual / ID Hours Mdoc: actual items, unlike the non-ID MDoc numerator', () => {
    const id = new Set(STORES.filter(s => isIdStore(s, from)).map(s => s.id));
    expect(id.size).toBeLessThan(all.size);
    const ti = total(id, 'All', from, LAST_WEEK_IDX).labor;
    expect(refIplh(ti, 'mdoc', true)).toBeCloseTo(ti.items / ti.hoursMdoc, 12);
    expect(refIplh(ti, 'mdoc', true)).not.toBeCloseTo(refIplh(ti, 'mdoc')!, 6);
    expect(refIplh(ti, 'ly', true)).toBeCloseTo(ti.itemsLY / ti.hoursLY, 12);
    expect(iplh(ti.items, ti.hours)).toBeCloseTo(ti.items / ti.hours, 12);
  });
});

describe('Call-off = Hours vs Proj Ct / % (Call Off)', () => {
  it('signed hours variance against projected hours, as the Ops 100 expressions', () => {
    const byStore = rollup(all, 'All', from, LAST_WEEK_IDX, 'store');
    for (const [, r] of [...byStore].slice(0, 10)) {
      const k = laborKpis(r.labor, 'budget');
      expect(k.hoursVsProj).toBeCloseTo(r.labor.hours - r.labor.hoursProj, 6);
      expect(k.hoursVsProjPct).toBeCloseTo((r.labor.hours - r.labor.hoursProj) / r.labor.hoursProj, 12);
    }
    const ks = [...byStore.values()].map(r => laborKpis(r.labor, 'budget').hoursVsProj!);
    expect(ks.some(v => v < 0) || ks.some(v => v > 0)).toBe(true);
  });
});
