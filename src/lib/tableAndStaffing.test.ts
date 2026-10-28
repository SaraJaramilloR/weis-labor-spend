import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {DAILY_FACTS, STAFF_TREND} from '../data/generate';
import {STORES} from '../data/org';
import {customerBase, rollup, total} from './aggregate';
import {DEFAULT_TIME, resolveTime} from './filters';
import {aiv, iplh, laborRate} from './metrics';
import {peopleRollup, peopleTotal, type PeopleFilter} from './peopleMetrics';
import {filterTree, sortRows} from './tableRows';

const all = new Set(STORES.map(s => s.id));
const none: PeopleFilter = {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};

describe('table search and sort', () => {
  type R = {name: string; kids?: R[]; v: number | null};
  const rows: R[] = [
    {name: 'Store 101 District 01', v: 3, kids: [{name: 'Meat', v: 1}, {name: 'Deli', v: 2}]},
    {name: 'Store 102 District 01', v: null, kids: [{name: 'Bakery', v: 5}]},
  ];
  const text = (r: R) => r.name;
  const kids = (r: R) => r.kids ?? [];

  it('a parent that matches keeps all its children', () => {
    const out = filterTree(rows, 'store 101', text, kids);
    expect(out).toHaveLength(1);
    expect(out[0].children).toHaveLength(2);
    expect(out[0].openForSearch).toBe(false);
  });
  it('a child match keeps its parent with only the matching children, opened', () => {
    const out = filterTree(rows, 'deli', text, kids);
    expect(out.map(o => o.row.name)).toEqual(['Store 101 District 01']);
    expect(out[0].children.map(c => c.name)).toEqual(['Deli']);
    expect(out[0].openForSearch).toBe(true);
  });
  it('terms combine parent and child text', () => {
    expect(filterTree(rows, '102 bakery', text, kids)[0].children.map(c => c.name)).toEqual(['Bakery']);
    expect(filterTree(rows, '101 bakery', text, kids)).toHaveLength(0);
  });
  it('terms match the start of a word, not any substring', () => {
    expect(filterTree(rows, '01', text, kids)).toHaveLength(2);
    expect(filterTree(rows, '1', text, kids).map(o => o.row.name)).toEqual(['Store 101 District 01', 'Store 102 District 01']);
    expect(filterTree(rows, '02', text, kids)).toHaveLength(0);
  });
  it('no match returns no rows; an empty query returns every row', () => {
    expect(filterTree(rows, 'zzz', text, kids)).toHaveLength(0);
    expect(filterTree(rows, '   ', text, kids)).toHaveLength(2);
  });
  it('n/a values sort last in both directions', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.v)).toEqual([3, null]);
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.v)).toEqual([3, null]);
  });
});

describe('store → department rows', () => {
  const from = LAST_WEEK_IDX - 3;
  const stores = rollup(all, 'All', from, LAST_WEEK_IDX, 'store');
  const depts = rollup(all, 'All', from, LAST_WEEK_IDX, 'storeDept');
  const deptsOf = (id: string) => [...depts.entries()].filter(([k]) => k.startsWith(`${id}|`)).map(([, r]) => r.labor);

  it('additive measures of the department rows add up to the store row', () => {
    for (const [id, s] of stores) {
      const d = deptsOf(id);
      expect(Math.abs(d.reduce((a, x) => a + x.hours, 0) - s.labor.hours)).toBeLessThan(1e-6);
      expect(Math.abs(d.reduce((a, x) => a + x.pay, 0) - s.labor.pay)).toBeLessThan(1e-6);
      expect(Math.abs(d.reduce((a, x) => a + x.items, 0) - s.labor.items)).toBeLessThan(1e-6);
    }
  });
  it('store ratios are ratios of store totals, not averages of department ratios', () => {
    const [id, s] = [...stores.entries()][0];
    const d = deptsOf(id);
    const avgOfRates = d.reduce((a, x) => a + (laborRate(x.pay, x.sales) ?? 0), 0) / d.length;
    expect(laborRate(s.labor.pay, s.labor.sales)).not.toBeCloseTo(avgOfRates, 4);
    expect(iplh(s.labor.items, s.labor.hours)).toBeCloseTo(d.reduce((a, x) => a + x.items, 0) / d.reduce((a, x) => a + x.hours, 0), 9);
    expect(aiv(s.labor.sales, s.labor.items)).not.toBeNull();
  });
  it('store customer count is store transactions, below the sum of overlapping department transactions', () => {
    for (const [id, s] of [...stores.entries()].slice(0, 10)) {
      const deptTx = deptsOf(id).reduce((a, x) => a + x.tx, 0);
      expect(customerBase(s, 'All').tx).toBe(s.store.tx);
      expect(s.store.tx).toBeLessThan(deptTx);
    }
  });
});

describe('staffing scenarios and headcount reconciliation', () => {
  const from = LAST_WEEK_IDX - 51;
  const byStore = peopleRollup(all, none, from, LAST_WEEK_IDX, 'store');

  it('each store reconciles: Ending = Beginning + Hires − Terminations', () => {
    for (const t of byStore.values()) expect(t.begin + t.hires - t.terms).toBe(t.end);
  });
  it('reconciles under Department, Position, Age range and Recruiter filters (attributes fixed per associate)', () => {
    for (const f of [{...none, dept: 'meat' as const}, {...none, position: 'Cashier'}, {...none, age: '18–24'}, {...none, recruiter: 'Recruiter B'}]) {
      const t = peopleTotal(all, f, from, LAST_WEEK_IDX);
      expect(t.begin + t.hires - t.terms).toBe(t.end);
    }
  });
  it('growth, stable and reduction stores show different hires vs terminations', () => {
    const change = (scenario: string) =>
      [...byStore.entries()].filter(([id]) => STAFF_TREND.get(id)?.scenario === scenario && STORES.find(s => s.id === id)!.openWeekIdx === 0).map(([, t]) => (t.end - t.begin) / t.begin);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean(change('growth'))).toBeGreaterThan(0.03);
    expect(Math.abs(mean(change('stable')))).toBeLessThan(0.02);
    expect(mean(change('reduction'))).toBeLessThan(-0.02);
  });
  it('labor hours follow the staffing scenario (hours per associate stay plausible)', () => {
    const t = total(all, 'All', LAST_WEEK_IDX, LAST_WEEK_IDX).labor;
    const p = peopleTotal(all, none, LAST_WEEK_IDX, LAST_WEEK_IDX);
    const perAssociate = t.hours / p.end;
    expect(perAssociate).toBeGreaterThan(18);
    expect(perAssociate).toBeLessThan(32);
  });
});

describe('vacation hours and day-level time frames', () => {
  it('weekly vacation hours per full-time associate stay within a working week', () => {
    for (let w = LAST_WEEK_IDX - 51; w <= LAST_WEEK_IDX; w++) {
      const t = total(all, 'All', w, w).labor;
      const p = peopleTotal(all, none, w, w);
      expect(t.vacHours / p.ftEnd).toBeLessThan(4);
    }
  });
  it('a single custom day is reported as its whole week, and the widening is stated', () => {
    const r = resolveTime({...DEFAULT_TIME, mode: 'custom', from: '2026-10-24', to: '2026-10-24'});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.from).toBe(LAST_WEEK_IDX);
    expect(r.to).toBe(LAST_WEEK_IDX);
    expect(r.wholeWeeks?.note).toContain('10/18/2026 – 10/24/2026');
    expect(r.wholeWeeks?.note).toContain('7 days');
  });
  it('a custom range that already covers whole weeks has no widening note', () => {
    const r = resolveTime({...DEFAULT_TIME, mode: 'custom', from: '2026-10-18', to: '2026-10-24'});
    expect(r.ok && r.wholeWeeks).toBeFalsy();
  });
  it('daily hours add up exactly to the weekly hours', () => {
    const daily = DAILY_FACTS.filter(f => f.w === LAST_WEEK_IDX).reduce((a, f) => a + f.hours, 0);
    expect(Math.abs(daily - total(all, 'All', LAST_WEEK_IDX, LAST_WEEK_IDX).labor.hours)).toBeLessThan(1e-6);
  });
});
