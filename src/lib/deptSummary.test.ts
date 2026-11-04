import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {DEPARTMENTS, DEPT_GROUPS, STORES, UNGROUPED_DEPTS, type DeptId} from '../data/org';
import {customerBase, emptyLabor, rollup, total, type LaborTotals} from './aggregate';
import {addLabor, deptRows, groupRows, sumDepts} from './deptSummary';
import {laborForPeople} from './laborPeople';
import {iplh, laborRate, otRate, variancePct} from './metrics';
import type {PeopleFilter} from './peopleMetrics';

const all = new Set(STORES.map(s => s.id));
const region2 = new Set(STORES.filter(s => s.regionId === 'R2').map(s => s.id));
const oneStore = new Set([STORES[7].id]);
const from = LAST_WEEK_IDX - 3;
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ADDITIVE = ['sales', 'salesLY', 'salesBud', 'items', 'itemsBud', 'itemsMdoc', 'pay', 'payBud', 'hours', 'hoursBud', 'hoursMdoc', 'otPay', 'otBasePay', 'vacHours'] as const;
const getter = (stores: Set<string>, dept: 'All' | DeptId, a = from, b = LAST_WEEK_IDX) => {
  const m = rollup(stores, dept, a, b, 'dept');
  return (d: DeptId) => m.get(d)?.labor;
};

describe('Department summary', () => {
  it('Center Store and Fresh follow the workbook memberships, matched to department ids, with no overlap', () => {
    const names = (id: string) => DEPT_GROUPS.find(g => g.id === id)!.depts.map(d => DEPARTMENTS.find(x => x.id === d)!.name);
    expect(names('center')).toEqual(['Grocery', 'Dairy', 'Frozen', 'HBC', 'General Merchandise', 'Beer & Wine']);
    expect(names('fresh')).toEqual(['Meat', 'Produce', 'Deli', 'Bakery', 'Seafood', 'Floral', 'Starbucks']);
    const members = DEPT_GROUPS.flatMap(g => g.depts);
    expect(new Set(members).size).toBe(members.length);
    // No membership is invented for the remaining departments.
    expect(UNGROUPED_DEPTS).toEqual(['rx', 'fuel', 'frontend', 'online']);
    expect(members.length + UNGROUPED_DEPTS.length).toBe(DEPARTMENTS.length);
  });

  for (const [label, stores] of [['chain', all], ['one region', region2], ['one store', oneStore]] as const) {
    it(`department rows add up to the selected scope total (${label})`, () => {
      const rows = deptRows(getter(stores, 'All'));
      const t = total(stores, 'All', from, LAST_WEEK_IDX).labor;
      for (const k of ADDITIVE) expect(sumOf(rows.map(r => r.labor[k]))).toBeCloseTo(t[k], 4);
      expect(rows.every(r => r.labor.rows > 0)).toBe(true);
    });
    it(`Center Store + Fresh + not grouped add up to the total, each department counted once (${label})`, () => {
      const groups = groupRows(getter(stores, 'All'));
      const t = total(stores, 'All', from, LAST_WEEK_IDX).labor;
      for (const k of ADDITIVE) expect(sumOf(groups.map(g => g.labor[k]))).toBeCloseTo(t[k], 4);
      const seen = groups.flatMap(g => g.depts);
      expect(new Set(seen).size).toBe(seen.length);
    });
  }

  it('a store without Fuel, Pharmacy or Starbucks shows only the departments it has', () => {
    const s = STORES.find(x => !x.hasFuel && !x.hasPharmacy)!;
    const ids = deptRows(getter(new Set([s.id]), 'All')).map(r => r.id);
    expect(ids).not.toContain('fuel');
    expect(ids).not.toContain('rx');
  });

  it('group ratios are recalculated from group totals, never averaged across departments', () => {
    const fresh = groupRows(getter(all, 'All')).find(g => g.id === 'fresh')!;
    const members = deptRows(getter(all, 'All')).filter(r => fresh.depts.includes(r.id as DeptId));
    const rate = laborRate(fresh.labor.pay, fresh.labor.sales)!;
    expect(rate).toBeCloseTo(sumOf(members.map(m => m.labor.pay)) / sumOf(members.map(m => m.labor.sales)), 12);
    expect(rate).not.toBeCloseTo(sumOf(members.map(m => laborRate(m.labor.pay, m.labor.sales)!)) / members.length, 4);
    expect(iplh(fresh.labor.items, fresh.labor.hours)).toBeCloseTo(sumOf(members.map(m => m.labor.items)) / sumOf(members.map(m => m.labor.hours)), 12);
    expect(variancePct(fresh.labor.hours, fresh.labor.hoursMdoc)).toBeCloseTo((fresh.labor.hours - fresh.labor.hoursMdoc) / fresh.labor.hoursMdoc, 12);
    // Budget and MDoc stay distinct at group level.
    expect(fresh.labor.hoursBud).not.toBeCloseTo(fresh.labor.hoursMdoc, 0);
  });

  it('department transactions are never added up to the store total', () => {
    const rows = deptRows(getter(all, 'All'));
    const t = total(all, 'All', from, LAST_WEEK_IDX);
    expect(customerBase(t, 'All').tx).toBe(t.store.tx);
    expect(sumOf(rows.map(r => r.labor.tx))).toBeGreaterThan(t.store.tx);
  });

  it('the Department filter leaves one department row and one group row', () => {
    const rows = deptRows(getter(region2, 'meat'));
    expect(rows.map(r => r.id)).toEqual(['meat']);
    expect(rows[0].labor.pay).toBeCloseTo(total(region2, 'meat', from, LAST_WEEK_IDX).labor.pay, 4);
    expect(groupRows(getter(region2, 'meat')).map(g => g.id)).toEqual(['fresh']);
    expect(groupRows(getter(region2, 'rx')).map(g => g.id)).toEqual(['ungrouped']);
  });

  it('the time frame changes the rows (one week vs four weeks)', () => {
    const week = deptRows(getter(all, 'All', LAST_WEEK_IDX, LAST_WEEK_IDX)).find(r => r.id === 'grocery')!;
    const four = deptRows(getter(all, 'All')).find(r => r.id === 'grocery')!;
    expect(four.labor.hours).toBeGreaterThan(week.labor.hours * 3);
    expect(week.labor.hours).toBeCloseTo(total(all, 'grocery', LAST_WEEK_IDX, LAST_WEEK_IDX).labor.hours, 4);
  });

  it('Pharmacy stays outside the overtime scope inside the not-grouped row', () => {
    const g = groupRows(getter(all, 'All')).find(x => x.id === 'ungrouped')!;
    const rx = getter(all, 'All')('rx')!;
    expect(g.labor.otBasePay).toBeCloseTo(g.labor.pay - rx.pay, 4);
    expect(otRate(g.labor.otPay, g.labor.otBasePay)).not.toBeNull();
  });

  it('Position / Tenure: labor actuals by department add up; sales, items and budgets stay 0 (shown as n/a)', () => {
    const f: PeopleFilter = {dept: 'All', position: 'Cashier', tenure: 'All', age: 'All', recruiter: 'All'};
    const byDept = laborForPeople(all, 'All', from, LAST_WEEK_IDX, f, 'dept').totals;
    const tot = laborForPeople(all, 'All', from, LAST_WEEK_IDX, f, 'none').totals.get('all')!;
    const center = sumDepts(DEPT_GROUPS[0].depts, d => byDept.get(d));
    const rest = sumDepts([...DEPT_GROUPS[1].depts, ...UNGROUPED_DEPTS], d => byDept.get(d));
    expect(center.hours + rest.hours).toBeCloseTo(tot.hours, 4);
    expect(center.sales + center.items + center.hoursBud + center.payBud).toBe(0);
  });

  it('addLabor sums every field', () => {
    const a = emptyLabor();
    const b: LaborTotals = {...emptyLabor(), pay: 5, hours: 2, rows: 1};
    addLabor(addLabor(a, b), b);
    expect([a.pay, a.hours, a.rows]).toEqual([10, 4, 2]);
  });
});
