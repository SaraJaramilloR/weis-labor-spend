import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {DEPARTMENTS, STORES, storeById} from '../data/org';
import {customerBase, rollup, total} from './aggregate';
import {INCIDENT_TYPES} from '../data/people';
import {INCIDENT_LABEL} from '../config/attendance';
import {attendanceRollup, averageProHours, averageProHoursBy} from './laborPeople';
import {basketSize, iplh, laborRate, ratio, yoyPct} from './metrics';
import {buildOrgTree, onlyChildIds, scopeLabel} from './orgTree';
import {peopleRollup, type PeopleFilter} from './peopleMetrics';

const all = new Set(STORES.map(s => s.id));
const none: PeopleFilter = {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};
const from = LAST_WEEK_IDX - 3;
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Region → District → Store → Department hierarchy', () => {
  const lv = {region: rollup(all, 'All', from, LAST_WEEK_IDX, 'region'), district: rollup(all, 'All', from, LAST_WEEK_IDX, 'district'), store: rollup(all, 'All', from, LAST_WEEK_IDX, 'store'), storeDept: rollup(all, 'All', from, LAST_WEEK_IDX, 'storeDept')};
  const tree = buildOrgTree(all, {
    region: id => lv.region.get(id),
    district: id => lv.district.get(id),
    store: id => lv.store.get(id),
    depts: sid => DEPARTMENTS.flatMap(d => (lv.storeDept.get(`${sid}|${d.id}`) ? [{id: d.id, name: d.name, data: lv.storeDept.get(`${sid}|${d.id}`)!}] : [])),
  });
  const t = total(all, 'All', from, LAST_WEEK_IDX);

  it('has 3 regions, 12 districts, 60 stores and department rows under each store', () => {
    expect(tree).toHaveLength(3);
    expect(tree.flatMap(r => r.children)).toHaveLength(12);
    expect(tree.flatMap(r => r.children.flatMap(d => d.children))).toHaveLength(60);
    expect(tree[0].children[0].children[0].children.length).toBeGreaterThan(10);
  });
  it('hours, dollars, sales and items add up at every level', () => {
    for (const reg of tree) {
      for (const k of ['hours', 'pay', 'sales', 'items', 'hoursBud', 'hoursMdoc', 'salesBud', 'itemsBud'] as const) {
        expect(sumOf(reg.children.map(d => d.data.labor[k]))).toBeCloseTo(reg.data.labor[k], 4);
        for (const d of reg.children) expect(sumOf(d.children.map(s => s.data.labor[k]))).toBeCloseTo(d.data.labor[k], 4);
      }
    }
    expect(sumOf(tree.map(r => r.data.labor.pay))).toBeCloseTo(t.labor.pay, 4);
  });
  it('ratios are recalculated from each level totals, never averaged across rows', () => {
    const reg = tree[0];
    const avgOfDistricts = sumOf(reg.children.map(d => laborRate(d.data.labor.pay, d.data.labor.sales)!)) / reg.children.length;
    expect(laborRate(reg.data.labor.pay, reg.data.labor.sales)).toBeCloseTo(sumOf(reg.children.map(d => d.data.labor.pay)) / sumOf(reg.children.map(d => d.data.labor.sales)), 12);
    expect(laborRate(reg.data.labor.pay, reg.data.labor.sales)).not.toBeCloseTo(avgOfDistricts, 6);
    expect(iplh(reg.data.labor.items, reg.data.labor.hours)).toBeCloseTo(sumOf(reg.children.map(d => d.data.labor.items)) / sumOf(reg.children.map(d => d.data.labor.hours)), 12);
  });
  it('region and district customer count add up store transactions, never overlapping department transactions', () => {
    for (const reg of tree) {
      const stores = reg.children.flatMap(d => d.children);
      expect(customerBase(reg.data, 'All').tx).toBe(sumOf(stores.map(s => s.data.store.tx)));
      const deptTx = sumOf(stores.flatMap(s => s.children.map(x => x.data.labor.tx)));
      expect(customerBase(reg.data, 'All').tx).toBeLessThan(deptTx);
    }
  });
  it('one department selected: every level uses that department transactions, items and sales', () => {
    const meat = rollup(all, 'meat', from, LAST_WEEK_IDX, 'region').get('R1')!;
    const c = customerBase(meat, 'meat');
    expect(c.tx).toBe(meat.labor.tx);
    expect(basketSize(c.items, c.tx)).toBeCloseTo(meat.labor.items / meat.labor.tx, 12);
    expect(yoyPct(basketSize(c.items, c.tx), basketSize(c.itemsLY, c.txLY))).not.toBeNull();
  });
  it('sales per square foot keeps store scope: all-department sales over the square feet of the stores', () => {
    const d = tree[1].children[0];
    const stores = d.children;
    expect(ratio(d.data.store.storeSales, d.data.store.sqft)).toBeCloseTo(sumOf(stores.map(s => s.data.store.storeSales)) / sumOf(stores.map(s => storeById.get(s.id)!.sqft)), 9);
  });
  it('a filter that leaves one region and one district opens them; the scope label names them', () => {
    const one = new Set(STORES.filter(s => s.districtId === 'D05').map(s => s.id));
    const small = buildOrgTree(one, {region: () => 1, district: () => 1, store: () => 1});
    expect([...onlyChildIds(small)]).toEqual(['R2', 'D05']);
    expect(scopeLabel(one)).toBe('Region 2 › District 05 · 5 stores');
    expect(scopeLabel(all)).toBe('3 regions · 60 stores');
  });
});

describe('Tracking department detail', () => {
  const people = peopleRollup(all, none, from, LAST_WEEK_IDX, 'store');
  const peopleDept = peopleRollup(all, none, from, LAST_WEEK_IDX, 'storeDept');
  it('home-department people counts add up to the store', () => {
    for (const [id, p] of [...people].slice(0, 15)) {
      const rows = [...peopleDept].filter(([k]) => k.startsWith(`${id}|`)).map(([, v]) => v);
      expect(sumOf(rows.map(r => r.end))).toBe(p.end);
      expect(sumOf(rows.map(r => r.terms))).toBe(p.terms);
      expect(sumOf(rows.map(r => r.hires))).toBe(p.hires);
    }
  });
  it('attendance incidents by home department add up to the store', () => {
    const byStore = attendanceRollup(all, none, from, LAST_WEEK_IDX, 'store');
    const byDept = attendanceRollup(all, none, from, LAST_WEEK_IDX, 'storeDept');
    for (const [id, n] of [...byStore].slice(0, 15)) expect(sumOf([...byDept].filter(([k]) => k.startsWith(`${id}|`)).map(([, v]) => v))).toBe(n);
  });
  it('attendance categories are the workbook R41 incident names; counts by type add up to the store counts', () => {
    expect([...INCIDENT_TYPES]).toEqual(['Late In >15', 'More than half shift unworked', 'Absent Unpaid Timecard', 'Absent Unpaid Exception', 'No Call No Show Timecard', 'Sick Unpaid Timecard']);
    expect(Object.values(INCIDENT_LABEL).map(l => l.label).join('|')).not.toMatch(/min|early/i);
    const byType = attendanceRollup(all, none, from, LAST_WEEK_IDX, 'type');
    const byStore = attendanceRollup(all, none, from, LAST_WEEK_IDX, 'store');
    expect([...byType.keys()].every(k => (INCIDENT_TYPES as readonly string[]).includes(k))).toBe(true);
    expect(sumOf([...byType.values()])).toBe(sumOf([...byStore.values()]));
    const meat = attendanceRollup(all, {...none, dept: 'meat'}, from, LAST_WEEK_IDX, 'type');
    expect(sumOf([...meat.values()])).toBeLessThan(sumOf([...byType.values()]));
  });
  it('average hours per employee by store matches the single-store calculation', () => {
    const by = averageProHoursBy(all, 'All', from, LAST_WEEK_IDX, undefined, 'store');
    const id = STORES[3].id;
    expect(by.get(id)!.ft).toBeCloseTo(averageProHours(new Set([id]), 'All', from, LAST_WEEK_IDX).ft!, 12);
    expect(averageProHoursBy(all, 'All', from, LAST_WEEK_IDX, undefined, 'storeDept').get(`${id}|grocery`)!.ft).toBeCloseTo(averageProHours(new Set([id]), 'grocery', from, LAST_WEEK_IDX).ft!, 12);
  });
  it('Pharmacy overtime stays outside the overtime scope at department level', () => {
    const rx = [...rollup(all, 'All', from, LAST_WEEK_IDX, 'storeDept')].find(([k]) => k.endsWith('|rx'))![1];
    expect(rx.labor.otPay).toBe(0);
    expect(rx.labor.otBasePay).toBe(0);
    expect(rx.labor.hours).toBeGreaterThan(0);
  });
});
