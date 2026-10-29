import {describe, expect, it} from 'vitest';
import {LAST_WEEK_IDX, WEEKS, periodRange} from '../data/calendar';
import {STORES} from '../data/org';
import {benchmarks, groupBenchmark, referenceSeries, retentionOf, scopeTrend, sumPeople, totalsOf, trendBuckets, turnoverOf} from './peopleBenchmark';
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

describe('benchmark hierarchy and analysis scope', () => {
  const regionIds = STORES.filter(s => s.regionId === 'R2').map(s => s.id);
  const districtIds = STORES.filter(s => s.districtId === 'D05').map(s => s.id);
  const byRegion = peopleRollup(all, none, from, LAST_WEEK_IDX, 'region');
  const byDistrict = peopleRollup(all, none, from, LAST_WEEK_IDX, 'district');

  it('a row total adds its stores: same as the rollup at that level (snapshots and events, no double counting)', () => {
    const r = totalsOf(byStore, regionIds);
    expect(r).toEqual(byRegion.get('R2'));
    expect(totalsOf(byStore, districtIds)).toEqual(byDistrict.get('D05'));
    expect(r.end).toBe(r.begin + r.hires - r.terms);
  });
  it('row rates are recalculated from the row components, not averaged from child rows', () => {
    const r = totalsOf(byStore, regionIds);
    const districts = ['D05', 'D06', 'D07', 'D08'].map(d => byDistrict.get(d)!);
    expect(turnoverOf(r)).toBeCloseTo(r.terms / ((r.begin + r.end) / 2), 12);
    expect(turnoverOf(r)).not.toBeCloseTo(simpleAverage(districts.map(turnoverOf))!, 6);
    expect(retentionOf(r)).toBeCloseTo((r.begin - r.termsOfBeginning) / r.begin, 12);
  });
  it('reference series are meaningful and non-duplicated by scope', () => {
    expect(referenceSeries(all, all)).toEqual({regionId: null, showChain: false});
    expect(referenceSeries(regionIds, all)).toEqual({regionId: null, showChain: true});
    expect(referenceSeries(districtIds, all)).toEqual({regionId: 'R2', showChain: true});
    expect(referenceSeries(['S101'], all)).toEqual({regionId: 'R1', showChain: true});
    expect(referenceSeries(['S101', 'S141'], all)).toEqual({regionId: null, showChain: true});
  });
  it('trend points: scope totals and benchmarks of each bucket; headcount is a snapshot per bucket, never summed', () => {
    const {buckets} = trendBuckets(from, LAST_WEEK_IDX);
    const pts = scopeTrend(new Set(districtIds), all, none, buckets, 'weighted', 'R2');
    expect(pts).toHaveLength(buckets.length);
    const b = buckets[1];
    const direct = peopleRollup(new Set(districtIds), none, b.from, b.to, 'none').get('all')!;
    expect(pts[1].scope).toEqual(direct);
    const bm = benchmarks(peopleRollup(all, none, b.from, b.to, 'store'), 'weighted');
    expect(pts[1].chain.turnover).toBeCloseTo(bm.chain.turnover!, 12);
    expect(pts[1].region!.hires).toBeCloseTo(bm.region.get('R2')!.hires!, 12);
    // Ending headcount of one bucket is the beginning of the next (snapshots), not an accumulation.
    expect(pts[2].scope.begin).toBe(pts[1].scope.end);
    expect(pts[1].stores).toBe(districtIds.length);
  });
});
