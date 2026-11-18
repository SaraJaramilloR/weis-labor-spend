// Next-week scheduling changes · rolling 13 weeks, on synthetic data (logic only; the measure was checked against the
// reference workbook locally, see docs/scheduling-changes-source-trace.md § 5.4; no Weis figures are used here).
import {describe, expect, it} from 'vitest';
import {addDays} from '../data/calendar';
import {REPORT_FIRST_WEEK, REPORT_LAST_WEEK, reportWeekDates} from '../data/dailyReport';
import {DISTRICTS, REGIONS, STORES} from '../data/org';
import {CHANGE_DAYS, SCHEDULE_FIRST_WEEK, SCHEDULE_WEEKS, TREND_WEEKS} from '../data/scheduleChanges';
import {ALL, DEFAULT_FILTERS, storeScope, type AccessRole} from './filters';
import {captureState, scheduleRollup} from './scheduleChanges';
import {scheduleTrend, trendScopeName, trendWeeks} from './scheduleTrend';

const W = REPORT_LAST_WEEK;
const all = new Set(STORES.map(s => s.id));
const regional: AccessRole = {kind: 'regional'};
const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const totals = (stores: Set<string>, w = W, c = 6) => scheduleTrend(stores, w, c).map(p => p.total);
const sumOf = (sets: Set<string>[], w = W, c = 6) => trendWeeks(w).map((_, i) => sets.reduce((a, s) => a + (scheduleTrend(s, w, c)[i].total ?? 0), 0));

describe('Window and dates', () => {
  const pts = scheduleTrend(all, W, 6);
  it('13 consecutive schedule weeks in chronological order, ending at the next week of the report week', () => {
    expect(pts).toHaveLength(TREND_WEEKS);
    expect(pts.map(p => p.w)).toEqual(Array.from({length: 13}, (_, i) => W - 11 + i));
    expect(pts[12].w).toBe(W + 1);
    expect(pts.filter(p => p.current).map(p => p.w)).toEqual([W + 1]);
    for (let i = 1; i < pts.length; i++) expect(pts[i].weekEnding).toBe(addDays(pts[i - 1].weekEnding, 7));
  });
  it('as in CRD: Week Ending (Data Week) is a Saturday; weekly file date = Week Ending − 7 (Saturday before the week); original capture = Friday S − 9', () => {
    for (const p of pts) {
      expect(dayOfWeek(p.weekEnding)).toBe(6);
      expect(p.weekEnding).toBe(reportWeekDates(p.w).end);
      expect(p.fileDate).toBe(addDays(p.weekEnding, -7));
      expect(dayOfWeek(p.fileDate)).toBe(6);
      expect(p.originalCapture).toBe(addDays(reportWeekDates(p.w).start, -9));
      expect(dayOfWeek(p.originalCapture)).toBe(5);
    }
  });
  it('every report week has 13 weeks of chain data (history reaches back far enough)', () => {
    for (let w = REPORT_FIRST_WEEK; w <= REPORT_LAST_WEEK; w++) expect(scheduleTrend(all, w, 6).every(p => p.status === 'final' && p.total !== null)).toBe(true);
    expect(SCHEDULE_FIRST_WEEK).toBe(REPORT_FIRST_WEEK - 11);
  });
});

describe('Measure', () => {
  it('a store point is the signed sum of its 8 daily net changes (not absolute, not gross)', () => {
    const negatives = [...SCHEDULE_WEEKS.values()].filter(s => s.original !== null && s.w >= W - 11 && s.w <= W + 1 && s.changes.reduce((a, b) => a + b, 0) < 0);
    expect(negatives.length).toBeGreaterThan(0);
    const s = negatives[0];
    const p = scheduleTrend(new Set([s.store]), W, 6).find(x => x.w === s.w)!;
    expect(p.total).toBeCloseTo(s.changes.reduce((a, b) => a + b, 0), 9);
    expect(p.total!).toBeLessThan(0);
  });
  it('the last point equals Total Changes of the Scheduling Changes table for the same scope and Data through', () => {
    for (let c = 0; c <= 6; c++) {
      const table = scheduleRollup(all, W, c, 'next', 'none').get('all')!;
      const last = scheduleTrend(all, W, c)[12];
      expect(last.total).toBeCloseTo(table.total!, 9);
      expect(last.original).toBeCloseTo(table.original!, 9);
      expect(last.counted).toBe(table.withOriginal);
    }
  });
  it('a past week equals the table of its own report week read at its last capture', () => {
    const pts = scheduleTrend(all, W, 0);
    for (let i = 0; i < 12; i++) expect(pts[i].total).toBeCloseTo(scheduleRollup(all, pts[i].w - 1, 6, 'next', 'none').get('all')!.total!, 9);
  });
});

describe('Time rule', () => {
  it('Data through does not move earlier weeks: history is identical for every cutoff', () => {
    const ref = scheduleTrend(all, W, 6).slice(0, 12);
    for (let c = 0; c <= 5; c++) expect(scheduleTrend(all, W, c).slice(0, 12)).toEqual(ref);
  });
  it('the last point is partial before Friday (cutoff + 3 change days) and final from Friday on', () => {
    for (let c = 0; c <= 4; c++) {
      const last = scheduleTrend(all, W, c)[12];
      expect(last.status).toBe('partial');
      expect(last.capturedDays).toBe(c + 3);
      expect(last.asOf).toBe(addDays(last.fileDate, -(CHANGE_DAYS - last.capturedDays)));
    }
    for (const c of [5, 6]) expect(scheduleTrend(all, W, c)[12]).toMatchObject({status: 'final', capturedDays: CHANGE_DAYS, asOf: scheduleTrend(all, W, c)[12].fileDate});
  });
  it('Final if and only if all 8 change captures required by the report are available (not tied to a weekday)', () => {
    for (let c = 0; c <= 6; c++) {
      const last = scheduleTrend(all, W, c)[12];
      const st = captureState(W, c, 'next');
      expect(last.status === 'final').toBe(st.captured.every(Boolean));
      expect(last.capturedDays).toBe(st.captured.filter(Boolean).length);
    }
  });
  it('Thursday: partial, 7 of 8, last capture Friday; Friday and Saturday: final, 8 of 8, last capture Saturday; value = table Total Changes', () => {
    const {start} = reportWeekDates(W);
    const got = [4, 5, 6].map(c => {
      const p = scheduleTrend(all, W, c)[12];
      return {status: p.status, n: p.capturedDays, asOf: p.asOf, same: Math.abs(p.total! - scheduleRollup(all, W, c, 'next', 'none').get('all')!.total!) < 1e-9};
    });
    expect(got).toEqual([
      {status: 'partial', n: 7, asOf: addDays(start, 5), same: true},
      {status: 'final', n: 8, asOf: addDays(start, 6), same: true},
      {status: 'final', n: 8, asOf: addDays(start, 6), same: true},
    ]);
  });
  it('only the last point can be partial', () => {
    for (let c = 0; c <= 6; c++) expect(scheduleTrend(all, W, c).slice(0, 12).every(p => p.status === 'final')).toBe(true);
  });
  it('the window rolls: a week keeps its value when it moves one position back', () => {
    const a = scheduleTrend(all, W - 1, 6);
    const b = scheduleTrend(all, W, 6);
    for (let i = 1; i < 13; i++) expect(b[i - 1].total).toBeCloseTo(a[i].total!, 9);
  });
});

describe('Aggregation', () => {
  const byRegion = REGIONS.map(r => new Set(STORES.filter(s => s.regionId === r.id).map(s => s.id)));
  const byDistrict = DISTRICTS.map(d => new Set(STORES.filter(s => s.districtId === d.id).map(s => s.id)));
  const byStore = STORES.map(s => new Set([s.id]));
  const chain = totals(all);
  it('chain = Σ regions = Σ districts = Σ stores at every point', () => {
    for (const parts of [byRegion, byDistrict, byStore]) sumOf(parts).forEach((v, i) => expect(v).toBeCloseTo(chain[i]!, 6));
  });
  it('also for a partial last point', () => {
    expect(sumOf(byDistrict, W, 1)[12]).toBeCloseTo(scheduleTrend(all, W, 1)[12].total!, 6);
  });
});

describe('Filters and simulated access', () => {
  it('a region, district or store filter gives the total of that scope', () => {
    const f = {...DEFAULT_FILTERS, district: DISTRICTS[0].id};
    const stores = storeScope(f, regional, W);
    expect(totals(stores)).toEqual(totals(new Set(STORES.filter(s => s.districtId === DISTRICTS[0].id).map(s => s.id))));
  });
  it('State and Geography narrow the same stores as the Daily table', () => {
    const state = STORES[0].state;
    const stores = storeScope({...DEFAULT_FILTERS, state}, regional, W);
    expect([...stores].every(id => STORES.find(s => s.id === id)!.state === state)).toBe(true);
    expect(scheduleTrend(stores, W, 6)[12].total).toBeCloseTo(scheduleRollup(stores, W, 6, 'next', 'none').get('all')!.total!, 9);
  });
  it('simulated district access limits the line to that district', () => {
    const role: AccessRole = {kind: 'district', id: DISTRICTS[1].id};
    const stores = storeScope(DEFAULT_FILTERS, role, W);
    expect(totals(stores)).toEqual(totals(new Set(STORES.filter(s => s.districtId === DISTRICTS[1].id).map(s => s.id))));
    expect(trendScopeName(DEFAULT_FILTERS, role, stores)).not.toMatch(/^Chain/);
  });
  it('the line is named Chain only with no location filter and full access', () => {
    expect(trendScopeName(DEFAULT_FILTERS, regional, all)).toBe(`Chain · ${STORES.length} stores`);
    const r = REGIONS[0];
    const f = {...DEFAULT_FILTERS, region: r.id};
    expect(trendScopeName(f, regional, storeScope(f, regional, W))).toContain(r.name);
    const st = {...DEFAULT_FILTERS, state: STORES[0].state};
    expect(trendScopeName(st, regional, storeScope(st, regional, W))).toContain(`State ${STORES[0].state}`);
    expect(DEFAULT_FILTERS.region).toBe(ALL);
  });
});

describe('Missing data (never 0)', () => {
  it('a store missing from the original capture shows that week as not available', () => {
    const miss = [...SCHEDULE_WEEKS.values()].find(s => s.original === null && s.w >= W - 11 && s.w <= W)!;
    const p = scheduleTrend(new Set([miss.store]), W, 6).find(x => x.w === miss.w)!;
    expect(p).toMatchObject({status: 'unavailable', total: null, original: null, counted: 0, missingOriginal: 1});
  });
  it('weeks before the first schedule capture are not available, not 0', () => {
    const pts = scheduleTrend(all, SCHEDULE_FIRST_WEEK, 6);
    const before = pts.filter(p => p.w < SCHEDULE_FIRST_WEEK);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(p => p.status === 'unavailable' && p.total === null && p.stores === 0)).toBe(true);
    expect(pts.filter(p => p.w >= SCHEDULE_FIRST_WEEK).every(p => p.total !== null)).toBe(true);
  });
  it('an empty scope gives 13 unavailable points', () => {
    expect(scheduleTrend(new Set(), W, 6).every(p => p.status === 'unavailable' && p.total === null)).toBe(true);
  });
  it('is deterministic', () => {
    expect(scheduleTrend(all, W, 3)).toEqual(scheduleTrend(all, W, 3));
  });
});
