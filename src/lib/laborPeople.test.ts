import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {STORES} from '../data/org';
import {POSITIONS, TENURE_BANDS} from '../data/people';
import {customerBase, total} from './aggregate';
import {attendanceRollup, averageProHours, laborForPeople} from './laborPeople';
import type {PeopleFilter} from './peopleMetrics';

const all = new Set(STORES.map(s => s.id));
const from = LAST_WEEK_IDX - 3;
const none: PeopleFilter = {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};

describe('department transactions (Ops 100 department rows)', () => {
  const t = total(all, 'All', from, LAST_WEEK_IDX);
  it('all departments use the store total, never the sum of departments', () => {
    expect(customerBase(t, 'All').tx).toBe(t.store.tx);
    expect(t.labor.tx).toBeGreaterThan(t.store.tx); // departments overlap inside a basket
  });
  it('one department uses its own transactions and items', () => {
    const g = total(all, 'grocery', from, LAST_WEEK_IDX);
    const c = customerBase(g, 'grocery');
    expect(c.tx).toBe(g.labor.tx);
    expect(c.tx).toBeLessThan(t.store.tx);
    expect(c.items / c.tx).toBeGreaterThan(1);
  });
});

describe('labor by associate attributes', () => {
  const base = total(all, 'All', from, LAST_WEEK_IDX).labor;
  it('hours of all positions add up to the total hours', () => {
    const sum = POSITIONS.reduce((s, p) => s + (laborForPeople(all, 'All', from, LAST_WEEK_IDX, {...none, position: p}).totals.get('all')?.hours ?? 0), 0);
    expect(Math.abs(sum - base.hours) / base.hours).toBeLessThan(1e-6);
  });
  it('hours of all tenure bands add up to the total hours', () => {
    const sum = TENURE_BANDS.reduce((s, b) => s + (laborForPeople(all, 'All', from, LAST_WEEK_IDX, {...none, tenure: b}).totals.get('all')?.hours ?? 0), 0);
    expect(Math.abs(sum - base.hours) / base.hours).toBeLessThan(1e-6);
  });
  it('budget, sales and items are not attributed to a position', () => {
    const c = laborForPeople(all, 'All', from, LAST_WEEK_IDX, {...none, position: 'Cashier'}).totals.get('all')!;
    expect(c.payBud).toBe(0);
    expect(c.sales).toBe(0);
    expect(c.items).toBe(0);
    expect(c.hours).toBeGreaterThan(0);
  });
  it('last year by associate is unavailable before FY2026', () => {
    expect(laborForPeople(all, 'All', 10, 12, {...none, position: 'Clerk'}).lyAvailable).toBe(false);
    expect(laborForPeople(all, 'All', 60, 62, {...none, position: 'Clerk'}).lyAvailable).toBe(true);
  });
});

describe('Average Hours (workbook R31: average of positive row-level average productive hours)', () => {
  it('produces plausible full-time and part-time weekly hours', () => {
    const a = averageProHours(all, 'All', from, LAST_WEEK_IDX);
    expect(a.ft).toBeGreaterThan(25);
    expect(a.ft).toBeLessThan(45);
    expect(a.pt).toBeGreaterThan(10);
    expect(a.pt!).toBeLessThan(a.ft!);
  });
  it('returns null (not 0) when no rows qualify', () => {
    const a = averageProHours(new Set(), 'All', from, LAST_WEEK_IDX);
    expect(a.ft).toBeNull();
    expect(a.pt).toBeNull();
  });
});

describe('illustrative attendance events (associate level)', () => {
  const total = (f: PeopleFilter) => [...attendanceRollup(all, f, from, LAST_WEEK_IDX, 'store').values()].reduce((a, b) => a + b, 0);
  it('departments add up to the all-department total', () => {
    const t = total(none);
    const byDept = [...new Set(STORES.flatMap(() => ['grocery', 'dairy', 'frozen', 'hbc', 'gm', 'beer', 'meat', 'seafood', 'produce', 'floral', 'deli', 'bakery', 'starbucks', 'rx', 'fuel', 'frontend', 'online']))].reduce((s, d) => s + total({...none, dept: d as never}), 0);
    expect(t).toBeGreaterThan(0);
    expect(byDept).toBe(t);
  });
  it('positions add up to the total and a filter reduces the count', () => {
    const t = total(none);
    expect(POSITIONS.reduce((s, p) => s + total({...none, position: p}), 0)).toBe(t);
    expect(total({...none, position: 'Cashier'})).toBeLessThan(t);
  });
  it('by type equals by store', () => {
    const byType = [...attendanceRollup(all, none, from, LAST_WEEK_IDX, 'type').values()].reduce((a, b) => a + b, 0);
    expect(byType).toBe(total(none));
  });
});
