import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX, WEEKS, periodRange} from '../data/calendar';
import {STORES} from '../data/org';
import {benchmarks, groupBenchmark, retentionOf, sumPeople, trendBuckets, turnoverOf} from './peopleBenchmark';
import {peopleRollup, type PeopleFilter} from './peopleMetrics';
import {ppDiff, simpleAverage} from './metrics';

const all = new Set(STORES.map(s => s.id));
const none: PeopleFilter = {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};
const from = LAST_WEEK_IDX - 25;
const byStore = peopleRollup(all, none, from, LAST_WEEK_IDX, 'store');

describe('store, region and chain benchmarks', () => {
  const b = benchmarks(byStore, 'weighted');

  it('count benchmarks are averages per store, not organization totals', () => {
    const t = sumPeople([...byStore.values()]);
    expect(b.chain.hires).toBeCloseTo(t.hires / byStore.size, 9);
    expect(b.chain.begin).toBeCloseTo(t.begin / byStore.size, 9);
    expect(b.chain.hires!).toBeLessThan(t.hires);
  });
  it('weighted rate benchmarks are ratios of group totals; simple ones average store values', () => {
    const t = sumPeople([...byStore.values()]);
    expect(b.chain.turnover).toBeCloseTo(turnoverOf(t)!, 12);
    const simple = groupBenchmark([...byStore.values()], 'simple');
    expect(simple.retention).toBeCloseTo(simpleAverage([...byStore.values()].map(retentionOf))!, 12);
  });
  it('a store is compared with its own region', () => {
    const store = STORES.find(s => s.regionId === 'R2')!;
    const regionStores = [...byStore].filter(([id]) => STORES.find(s => s.id === id)!.regionId === 'R2').map(([, p]) => p);
    expect(b.region.get(store.regionId)!.turnover).toBeCloseTo(turnoverOf(sumPeople(regionStores))!, 12);
    expect(b.region.get(store.regionId)!.stores).toBe(regionStores.length);
  });
  it('does not assume three regions or 60 stores', () => {
    const subset = new Map([...byStore].filter(([id]) => STORES.find(s => s.id === id)!.regionId !== 'R3').slice(0, 7));
    const s = benchmarks(subset, 'weighted');
    expect(s.chain.stores).toBe(7);
    expect([...s.region.values()].reduce((a, r) => a + r.stores, 0)).toBe(7);
  });
  it('differences are percentage points: 7.5% − 3.7% = +3.8 pp', () => {
    expect(ppDiff(0.075, 0.037)).toBeCloseTo(0.038, 12);
  });
});

describe('trend buckets follow the selected time frame', () => {
  it('uses fiscal periods inside the time frame, without extra periods', () => {
    const {unit, buckets} = trendBuckets(from, LAST_WEEK_IDX);
    expect(unit).toBe('period');
    expect(buckets[0].from).toBe(from);
    expect(buckets[buckets.length - 1].to).toBe(LAST_WEEK_IDX);
    for (let i = 1; i < buckets.length; i++) expect(buckets[i].from).toBe(buckets[i - 1].to + 1);
  });
  it('flags partial periods', () => {
    const w = WEEKS[LAST_WEEK_IDX - 20];
    const [a] = periodRange(w.fy, w.period);
    const {unit, buckets} = trendBuckets(a + 1, LAST_WEEK_IDX);
    expect(unit).toBe('period');
    expect(buckets[0].partial).toBe(true);
    expect(buckets[1].partial).toBe(false);
    expect(buckets[0].label.endsWith('*')).toBe(true);
  });
  it('short time frames use weeks (one point per week)', () => {
    expect(trendBuckets(LAST_WEEK_IDX, LAST_WEEK_IDX)).toMatchObject({unit: 'week', buckets: [{from: LAST_WEEK_IDX, to: LAST_WEEK_IDX}]});
    expect(trendBuckets(LAST_WEEK_IDX - 3, LAST_WEEK_IDX).buckets).toHaveLength(4);
  });
});
