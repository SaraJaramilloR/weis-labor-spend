import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {STORES, type DeptId} from '../data/org';
import {total} from './aggregate';
import {laborForPeople} from './laborPeople';
import {otRate} from './metrics';
import {operationalLabor} from './overtime';
import type {PeopleFilter} from './peopleMetrics';

const all = new Set(STORES.map(s => s.id));
const region2 = new Set(STORES.filter(s => s.regionId === 'R2').map(s => s.id));
const from = LAST_WEEK_IDX - 3;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const opOf = (stores: Set<string>, a = from, b = LAST_WEEK_IDX) => operationalLabor(stores, a, b, 'none', null).get('all')!;

describe('Operational overtime (Ops 100 OT_Less_RX_*)', () => {
  it('replaces only the Department selection: the same value whatever department is selected', () => {
    const op = opOf(region2);
    const meat = total(region2, 'meat', from, LAST_WEEK_IDX).labor;
    const allDepts = total(region2, 'All', from, LAST_WEEK_IDX).labor;
    expect(op.otPay).toBeCloseTo(allDepts.otPay, 6);
    expect(otRate(op.otPay, op.otBasePay)).toBeCloseTo(otRate(allDepts.otPay, allDepts.otBasePay)!, 12);
    expect(otRate(meat.otPay, meat.otBasePay)).not.toBeCloseTo(otRate(op.otPay, op.otBasePay)!, 6);
  });
  it('keeps location and time filters', () => {
    expect(opOf(region2).otPay).toBeLessThan(opOf(all).otPay);
    expect(opOf(all, LAST_WEEK_IDX, LAST_WEEK_IDX).otPay).toBeLessThan(opOf(all).otPay);
  });
  it('numerator and denominator exclude Pharmacy', () => {
    const op = opOf(all);
    const rx = total(all, 'rx', from, LAST_WEEK_IDX).labor;
    expect(op.otBasePay).toBeCloseTo(op.pay - rx.pay, 4);
    expect(rx.otPay).toBe(0);
    expect(rx.otBasePay).toBe(0);
  });
  it('keeps associate (Position) filters, as the other labor actuals', () => {
    const f: PeopleFilter = {dept: 'All', position: 'Cashier', tenure: 'All', age: 'All', recruiter: 'All'};
    const op = operationalLabor(all, from, LAST_WEEK_IDX, 'none', f).get('all')!;
    const direct = laborForPeople(all, 'All', from, LAST_WEEK_IDX, f, 'none').totals.get('all')!;
    expect(op.otPay).toBeCloseTo(direct.otPay, 6);
    expect(op.otPay).toBeLessThan(opOf(all).otPay);
  });
  it('store rows add their components up to the total; the rate is recalculated, not summed', () => {
    const byStore = [...operationalLabor(region2, from, LAST_WEEK_IDX, 'store', null).values()];
    const op = opOf(region2);
    expect(sum(byStore.map(s => s.otPay))).toBeCloseTo(op.otPay, 4);
    expect(sum(byStore.map(s => s.otBasePay))).toBeCloseTo(op.otBasePay, 4);
    expect(otRate(op.otPay, op.otBasePay)).not.toBeCloseTo(sum(byStore.map(s => otRate(s.otPay, s.otBasePay)!)), 4);
  });
});

describe('Department overtime (department context)', () => {
  it('department OT $ / department actual payroll; Pharmacy has no overtime scope', () => {
    for (const d of ['meat', 'grocery', 'frontend'] as DeptId[]) {
      const t = total(all, d, from, LAST_WEEK_IDX).labor;
      expect(otRate(t.otPay, t.otBasePay)).toBeCloseTo(t.otPay / t.pay, 12);
    }
    const rx = total(all, 'rx', from, LAST_WEEK_IDX).labor;
    expect(otRate(rx.otPay, rx.otBasePay)).toBeNull();
  });
  it('with all departments in context it equals the operational value; departments add up to it', () => {
    const t = total(all, 'All', from, LAST_WEEK_IDX).labor;
    const op = opOf(all);
    expect(otRate(t.otPay, t.otBasePay)).toBeCloseTo(otRate(op.otPay, op.otBasePay)!, 12);
    const depts = (['grocery', 'dairy', 'frozen', 'hbc', 'gm', 'beer', 'meat', 'seafood', 'produce', 'floral', 'deli', 'bakery', 'starbucks', 'fuel', 'frontend', 'online'] as DeptId[]).map(d => total(all, d, from, LAST_WEEK_IDX).labor);
    expect(sum(depts.map(x => x.otPay))).toBeCloseTo(op.otPay, 4);
    expect(sum(depts.map(x => x.otBasePay))).toBeCloseTo(op.otBasePay, 4);
  });
});
