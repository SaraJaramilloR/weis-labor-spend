// Daily Labor Update formulas on synthetic data (logic only; no reconciliation with Weis figures).
import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {PROJECTION_LAST_WEEK, WEEK_TARGETS} from '../data/dailyReport';
import {laborByWeek} from '../data/generate';
import {STORES} from '../data/org';
import {currentWeekDays, reportRatios, reportRollup, storeAhead, storeCurrent} from './dailyReport';

const W = LAST_WEEK_IDX;
const S = STORES[5].id;
const all = new Set(STORES.map(s => s.id));
const d01 = new Set(STORES.filter(s => s.districtId === 'D01').map(s => s.id));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const weekFacts = (store: string, w: number) => laborByWeek[w].filter(f => f.store === store);

describe('Current week (week to date through the cutoff)', () => {
  it('a Saturday cutoff covers the whole week: actuals and Chain Forecast reconcile with the weekly facts', () => {
    const t = storeCurrent(S, W, 6)!;
    const f = weekFacts(S, W);
    expect(t.actSales).toBeCloseTo(sum(f.map(x => x.sales)), 2);
    expect(t.actHours).toBeCloseTo(sum(f.map(x => x.hours)), 2);
    expect(t.actItems).toBeCloseTo(sum(f.map(x => x.items)), 0);
    expect(t.cfHours).toBeCloseTo(sum(f.map(x => x.hoursMdoc)), 2);
    expect(t.cfItems).toBeCloseTo(WEEK_TARGETS.get(`${S}|${W}`)!.cfItems, 3);
    expect(t.projHours).toBeCloseTo(sum(f.map(x => x.hoursProj)), 2);
  });
  it('an earlier cutoff only adds the reported days', () => {
    const wed = storeCurrent(S, W, 3)!;
    const sat = storeCurrent(S, W, 6)!;
    expect(wed.actSales!).toBeLessThan(sat.actSales!);
    expect(wed.cfSales).toBeLessThan(sat.cfSales);
    const days = currentWeekDays(new Set([S]), W, 3);
    expect(sum(days.filter(d => d.reported).map(d => d.sales!))).toBeCloseTo(wed.actSales!, 4);
  });
  it('days after the cutoff have no actuals (null, not 0) but keep their projections', () => {
    const days = currentWeekDays(all, W, 2);
    expect(days.slice(3).every(d => d.sales === null && d.hours === null && d.pay === null)).toBe(true);
    expect(days.slice(3).every(d => d.projHours > 0)).toBe(true);
    expect(days.slice(0, 3).every(d => (d.hours ?? 0) > 0)).toBe(true);
  });
  it('Hours to hit IPLH = actual items / Chain Forecast IPLH; Store Projected items = ROUND(projected sales / CF avg unit $)', () => {
    const t = storeCurrent(S, W, 4)!;
    const wk = WEEK_TARGETS.get(`${S}|${W}`)!;
    expect(t.hoursToHit).toBeCloseTo(t.actItems! / (t.cfItems / t.cfHours), 6);
    expect(t.projItems).toBe(Math.round(t.projSales / (wk.cfSales / wk.cfItems)));
  });
});

describe('Next and future weeks (projections only)', () => {
  it('have no actuals', () => {
    const t = storeAhead(S, W + 1)!;
    expect([t.actSales, t.actItems, t.actHours, t.actPay]).toEqual([null, null, null, null]);
    const tot = reportRollup(all, 'future', W, 6, 'none').get('all')!;
    expect(tot.actSales).toBeNull();
    expect(reportRatios(tot).actIplh).toBeNull();
  });
  it('exist for every open store up to two weeks after the loaded data', () => {
    expect(PROJECTION_LAST_WEEK).toBe(W + 2);
    expect(reportRollup(all, 'future', W, 6, 'none').get('all')!.stores).toBe(STORES.length);
  });
  it('Hours to hit PRO IPLH = ROUND(projected items / CF IPLH); Var = projected hours − hours to hit', () => {
    const t = storeAhead(S, W + 1)!;
    expect(t.hoursToHit).toBe(Math.round(t.projItems / (t.cfItems / t.cfHours)));
    expect(t.projItems).toBe(Math.round(t.projSales / (t.cfSales / t.cfItems)));
  });
  it('Chain Forecast Labor Rate = budgeted labor plan $ / Chain Forecast sales; Projected = projected payroll $ / projected sales', () => {
    const t = storeAhead(S, W + 2)!;
    const r = reportRatios(t);
    expect(r.cfLaborRate).toBeCloseTo(t.budPay / t.cfSales, 12);
    expect(r.projLaborRate).toBeCloseTo(t.projPay / t.projSales, 12);
  });
});

describe('Totals', () => {
  it('district totals add their stores; IPLH and Labor Rate are recalculated, not averaged', () => {
    const byStore = [...reportRollup(d01, 'current', W, 4, 'store').values()];
    const dist = reportRollup(d01, 'current', W, 4, 'district').get('D01')!;
    expect(dist.actHours!).toBeCloseTo(sum(byStore.map(s => s.actHours!)), 4);
    expect(dist.hoursToHit).toBeCloseTo(sum(byStore.map(s => s.hoursToHit)), 4);
    const r = reportRatios(dist);
    expect(r.actIplh).toBeCloseTo(sum(byStore.map(s => s.actItems!)) / sum(byStore.map(s => s.actHours!)), 10);
    expect(r.actIplh).not.toBeCloseTo(sum(byStore.map(s => reportRatios(s).actIplh!)) / byStore.length, 4);
    expect(r.actLaborRate).toBeCloseTo(sum(byStore.map(s => s.actPay!)) / sum(byStore.map(s => s.actSales!)), 10);
  });
  it('the chain total equals the sum of regions', () => {
    const regions = [...reportRollup(all, 'next', W, 6, 'region').values()];
    const tot = reportRollup(all, 'next', W, 6, 'none').get('all')!;
    expect(tot.projHours).toBeCloseTo(sum(regions.map(r => r.projHours)), 4);
    expect(tot.cfSales).toBeCloseTo(sum(regions.map(r => r.cfSales)), 4);
  });
});
