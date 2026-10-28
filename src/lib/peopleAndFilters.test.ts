import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX} from '../data/calendar';
import {STORES} from '../data/org';
import {csvCell, toCsv} from './csv';
import {DEFAULT_FILTERS, firstCompWeek, isIdStore, resolveTime, sanitizeFilters, storeScope, storesForRole, type Filters} from './filters';
import {peopleRollup, peopleTotal, type PeopleFilter} from './peopleMetrics';

const all = new Set(STORES.map(s => s.id));
const none: PeopleFilter = {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};
const regional = {kind: 'regional'} as const;

describe('headcount snapshots', () => {
  it('ending headcount of one time frame is the beginning of the next (never summed)', () => {
    const a = peopleTotal(all, none, 60, 63);
    const b = peopleTotal(all, none, 64, 67);
    expect(b.begin).toBe(a.end);
  });
  it('begin + hires − terminations = end', () => {
    const t = peopleTotal(all, none, 52, LAST_WEEK_IDX);
    expect(t.begin + t.hires - t.terms).toBe(t.end);
  });
  it('a longer time frame does not inflate headcount', () => {
    const short = peopleTotal(all, none, LAST_WEEK_IDX, LAST_WEEK_IDX);
    const long = peopleTotal(all, none, 0, LAST_WEEK_IDX);
    expect(long.end).toBe(short.end);
  });
  it('store groups add up to the total for snapshots and events', () => {
    const t = peopleTotal(all, none, 60, 70);
    const parts = [...peopleRollup(all, none, 60, 70, 'store').values()];
    expect(parts.reduce((s, p) => s + p.end, 0)).toBe(t.end);
    expect(parts.reduce((s, p) => s + p.terms, 0)).toBe(t.terms);
  });
  it('FT / PT shares are headcount based and sum to the ending headcount', () => {
    const t = peopleTotal(all, none, 60, 70);
    expect(t.ftEnd + t.ptEnd).toBe(t.end);
  });
});

describe('filters fail safely', () => {
  const prev = DEFAULT_FILTERS;
  it('rejects unknown values and keeps the previous ones', () => {
    const bad = {...prev, region: 'R9', store: '<script>', dept: 'payroll', reference: 'forecast', state: 'ZZ'} as unknown as Filters;
    const out = sanitizeFilters(bad, prev, regional);
    expect(out.region).toBe(prev.region);
    expect(out.store).toBe(prev.store);
    expect(out.dept).toBe(prev.dept);
    expect(out.reference).toBe(prev.reference);
    expect(out.state).toBe(prev.state);
  });
  it('rejects malformed time selections', () => {
    const bad = {...prev, time: {...prev.time, mode: 'eval', rolling: 999}} as unknown as Filters;
    expect(sanitizeFilters(bad, prev, regional).time).toEqual(prev.time);
  });
  it('clears a district that does not belong to the region', () => {
    const out = sanitizeFilters({...prev, region: 'R1', district: 'D12'}, prev, regional);
    expect(out.district).toBe('All');
  });
  it('simulated access limits the stores and clears selections outside the role', () => {
    const role = {kind: 'district', id: 'D05'} as const;
    expect(storesForRole(role).every(s => s.districtId === 'D05')).toBe(true);
    const out = sanitizeFilters({...prev, store: 'S101'}, prev, role);
    expect(out.store).toBe('All');
    expect([...storeScope(prev, role, 0)].every(id => STORES.find(s => s.id === id)!.districtId === 'D05')).toBe(true);
  });
  it('reports invalid date ranges instead of applying them', () => {
    expect(resolveTime({...prev.time, mode: 'custom', from: '2026-10-10', to: '2026-01-01'}).ok).toBe(false);
    expect(resolveTime({...prev.time, mode: 'custom', from: '2030-01-01', to: '2030-02-01'}).ok).toBe(false);
    expect(resolveTime({...prev.time, mode: 'calendar', fy: 2026, unit: 'P12'}).ok).toBe(false);
  });
  it('ID stores exclude stores without a full prior year', () => {
    const newStores = STORES.filter(s => s.openWeekIdx > 0);
    expect(newStores.length).toBeGreaterThan(0);
    expect(newStores.every(s => !isIdStore(s, 60))).toBe(true);
    expect(storeScope({...prev, idOnly: true}, regional, 60).size).toBe(STORES.length - newStores.length);
  });
});

describe('ID stores reuse the UC1 rule (five full fiscal quarters)', () => {
  it('a store opening on a quarter start is comparable five quarters later', () => {
    expect(firstCompWeek(13)).toBe(13 + 5 * 13);
  });
  it('a store opening mid-quarter waits for the next full quarter', () => {
    expect(firstCompWeek(49)).toBe((4 + 5) * 13);
    expect(firstCompWeek(61)).toBe((5 + 5) * 13);
  });
  it('a store is not comparable one week before its first comparable week', () => {
    const s = {...STORES[0], openWeekIdx: 13};
    expect(isIdStore(s, firstCompWeek(13) - 1)).toBe(false);
    expect(isIdStore(s, firstCompWeek(13))).toBe(true);
  });
});

describe('CSV export', () => {
  it('neutralizes spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('Store 101')).toBe('Store 101');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
  it('keeps negative numbers as numbers', () => {
    expect(toCsv(['a'], [[-5]])).toBe('a\r\n-5');
  });
});
