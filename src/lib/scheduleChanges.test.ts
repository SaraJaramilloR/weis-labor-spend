// Scheduling Changes formulas on synthetic data (logic only; no reconciliation with Weis figures).
import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX, addDays} from '../data/calendar';
import {PROJECTION_LAST_WEEK, WEEK_TARGETS, reportWeekDates} from '../data/dailyReport';
import {STORES} from '../data/org';
import {CHANGE_DAYS, SCHEDULE_WEEKS, captureDates, reportRunDate} from '../data/scheduleChanges';
import {storeAhead} from './dailyReport';
import {fmt} from './format';
import {captureState, scheduleRollup, storeSchedule, type ScheduleSection} from './scheduleChanges';

const W = LAST_WEEK_IDX;
const all = new Set(STORES.map(s => s.id));
const SAT = 6;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sections: ScheduleSection[] = ['next', 'future'];
const missingStores = (w: number) => [...SCHEDULE_WEEKS.values()].filter(s => s.w === w && s.original === null).map(s => s.store);

describe('Capture calendar (as in the reference run)', () => {
  it('original schedule on the Friday nine days before the week starts, then eight daily change captures to the Saturday before', () => {
    const {start} = reportWeekDates(W + 1);
    const c = captureDates(W + 1);
    expect(new Date(`${c.original}T00:00:00Z`).getUTCDay()).toBe(5);
    expect(c.original).toBe(addDays(start, -9));
    expect(c.changes).toHaveLength(CHANGE_DAYS);
    expect(c.changes[CHANGE_DAYS - 1]).toBe(addDays(start, -1));
  });
  it('the report runs the day after Data through (reference: data through Sunday, last capture Monday, three next-week changes)', () => {
    expect(reportRunDate(W, 0)).toBe(addDays(reportWeekDates(W).start, 1));
    const st = captureState(W, 0, 'next');
    expect(st.originalCaptured).toBe(true);
    expect(st.captured.filter(Boolean)).toHaveLength(3);
  });
  it('next week: every change day is captured with data through Saturday', () => {
    expect(captureState(W, SAT, 'next').captured.every(Boolean)).toBe(true);
  });
  it('future week: original schedule captured only with data through Thursday or later; then 0, 1, 2 change days', () => {
    for (const k of [0, 1, 2, 3]) expect(captureState(W, k, 'future').originalCaptured).toBe(false);
    expect([4, 5, 6].map(k => captureState(W, k, 'future').captured.filter(Boolean).length)).toEqual([0, 1, 2]);
  });
});

describe('Store values', () => {
  const S = STORES.find(s => !missingStores(W + 1).includes(s.id))!.id;
  it('original + all changes = Store Projected hours of the week (the final capture), for both weeks', () => {
    for (const w of [W + 1, W + 2]) {
      const s = SCHEDULE_WEEKS.get(`${S}|${w}`)!;
      expect(s.original! + sum(s.changes)).toBeCloseTo(WEEK_TARGETS.get(`${S}|${w}`)!.projHours, 6);
    }
  });
  it('next week with data through Saturday: Updated schedule = Store Projected hours of the report table', () => {
    expect(storeSchedule(S, W, SAT, 'next')!.updated).toBeCloseTo(storeAhead(S, W + 1)!.projHours, 6);
  });
  it('Total Changes = sum of the captured daily changes = Updated − Original; days not captured are null, not 0', () => {
    const t = storeSchedule(S, W, 1, 'next')!;
    const captured = captureState(W, 1, 'next').captured;
    expect(t.changes.filter((_, i) => !captured[i]).every(c => c === null)).toBe(true);
    expect(t.total).toBeCloseTo(sum(t.changes.map(c => c ?? 0)), 9);
    expect(t.updated! - t.original!).toBeCloseTo(t.total!, 9);
  });
  it('changes are quarter hours with both signs, and captured days without a change are exactly 0', () => {
    const changes = [...SCHEDULE_WEEKS.values()].flatMap(s => s.changes);
    expect(changes.every(c => Number.isInteger(c * 4))).toBe(true);
    expect(changes.some(c => c > 0) && changes.some(c => c < 0)).toBe(true);
    expect(changes.filter(c => c === 0).length).toBeGreaterThan(changes.length * 0.3);
  });
  it('before the original capture nothing is shown as 0: original, changes, total and updated are null', () => {
    const t = storeSchedule(S, W, 2, 'future')!;
    expect([t.original, t.total, t.updated]).toEqual([null, null, null]);
    expect(t.changes.every(c => c === null)).toBe(true);
    expect(t.posted).toBeNull();
  });
  it('is deterministic', () => {
    expect(storeSchedule(S, W, SAT, 'next')).toEqual(storeSchedule(S, W, SAT, 'next'));
  });
});

describe('Missing original schedule', () => {
  const missing = missingStores(W + 1);
  it('some stores are missing from the original capture in the synthetic data', () => {
    expect(missing.length).toBeGreaterThan(0);
  });
  it('the store shows original, changes and total as unavailable (null, never 0) and keeps its latest schedule', () => {
    const t = storeSchedule(missing[0], W, SAT, 'next')!;
    expect(t.original).toBeNull();
    expect(t.total).toBeNull();
    expect(t.changes.every(c => c === null)).toBe(true);
    expect(t.missingOriginal).toBe(1);
    expect(t.updated).toBeCloseTo(WEEK_TARGETS.get(`${missing[0]}|${W + 1}`)!.projHours, 6);
    expect(t.posted === 'no' || t.posted === 'none').toBe(true);
  });
  it('totals exclude it and count it', () => {
    const tot = scheduleRollup(all, W, SAT, 'next', 'none').get('all')!;
    const withOriginal = [...all].map(id => storeSchedule(id, W, SAT, 'next')!).filter(t => t.original !== null);
    expect(tot.missingOriginal).toBe(missing.length);
    expect(tot.withOriginal).toBe(withOriginal.length);
    expect(tot.original).toBeCloseTo(sum(withOriginal.map(t => t.original!)), 6);
  });
});

describe('Totals and location filters', () => {
  for (const section of sections) {
    it(`${section}: district and region rows add their stores; Updated = Original + Total Changes at every level`, () => {
      const stores = scheduleRollup(all, W, SAT, section, 'store');
      const districts = scheduleRollup(all, W, SAT, section, 'district');
      const regions = scheduleRollup(all, W, SAT, section, 'region');
      const tot = scheduleRollup(all, W, SAT, section, 'none').get('all')!;
      for (const [d, t] of districts) {
        const mine = STORES.filter(s => s.districtId === d).map(s => stores.get(s.id)!).filter(x => x.original !== null);
        expect(t.total).toBeCloseTo(sum(mine.map(x => x.total!)), 6);
        t.changes.forEach((c, i) => expect(c).toBeCloseTo(sum(mine.map(x => x.changes[i]!)), 6));
        expect(t.postedYes).toBe(STORES.filter(s => s.districtId === d && stores.get(s.id)!.posted === 'yes').length);
      }
      expect(tot.total).toBeCloseTo(sum([...regions.values()].map(r => r.total!)), 6);
      for (const t of [...districts.values(), ...regions.values(), tot]) expect(t.updated! - t.original!).toBeCloseTo(t.total!, 6);
      expect(tot.netUp + tot.netDown + tot.netZero).toBe(tot.withOriginal);
      expect(tot.stores).toBe(STORES.length);
    });
  }
  it('a location filter keeps only its stores', () => {
    const d01 = new Set(STORES.filter(s => s.districtId === 'D01').map(s => s.id));
    const tot = scheduleRollup(d01, W, SAT, 'next', 'none').get('all')!;
    expect(tot.stores).toBe(d01.size);
    expect([...scheduleRollup(d01, W, SAT, 'next', 'district').keys()]).toEqual(['D01']);
  });
});

describe('Fails safely', () => {
  it('unknown store or a week without projections returns undefined', () => {
    expect(storeSchedule('S999', W, SAT, 'next')).toBeUndefined();
    expect(storeSchedule(STORES[0].id, PROJECTION_LAST_WEEK, SAT, 'future')).toBeUndefined();
  });
  it('an empty scope has no rows', () => {
    expect(scheduleRollup(new Set(), W, SAT, 'next', 'none').size).toBe(0);
  });
  it('signed hours keep quarter hours and never show −0', () => {
    expect(fmt.signedHours2(302.25)).toBe('+302.25');
    expect(fmt.signedHours2(-18)).toBe('−18');
    expect(fmt.signedHours2(-0.001)).toBe('0');
    expect(fmt.signedHours2(null)).toBe('n/a');
  });
});
