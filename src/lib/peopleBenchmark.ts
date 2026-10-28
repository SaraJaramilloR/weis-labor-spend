// Store vs region vs chain benchmarks for the people KPIs of the Turnover & Retention Benchmark view (R64).
// Uses the documented benchmark rules (lib/benchmark.ts, D13 open): rates are "weighted" (KPI of the group totals)
// or "simple" (average of store values); counts are always averages per store. The benchmark population is the
// chain, or the stores of one region within it, never the stores listed in a table or matched by a search.
import {WEEKS, periodRange} from '../data/calendar';
import {storeById} from '../data/org';
import {benchmarkValue, perStoreAverage} from './benchmark';
import type {BenchmarkMethod} from './filters';
import {retentionRate, turnoverRate} from './metrics';
import {emptyPeople, periodsIn, type PeopleTotals} from './peopleMetrics';

export const turnoverOf = (p: PeopleTotals) => turnoverRate(p.terms, p.begin, p.end);
export const retentionOf = (p: PeopleTotals) => retentionRate(p.begin, p.termsOfBeginning);

export function sumPeople(list: PeopleTotals[]): PeopleTotals {
  const out = emptyPeople();
  for (const p of list) (Object.keys(out) as (keyof PeopleTotals)[]).forEach(k => (out[k] += p[k]));
  return out;
}

/** Benchmark values of one group of stores. Counts are averages per store; rates follow the method. */
export type Benchmark = {stores: number; turnover: number | null; retention: number | null; begin: number | null; end: number | null; hires: number | null; terms: number | null};

export function groupBenchmark(list: PeopleTotals[], method: BenchmarkMethod): Benchmark {
  const total = sumPeople(list);
  return {
    stores: list.length,
    turnover: benchmarkValue(method, total, list, turnoverOf),
    retention: benchmarkValue(method, total, list, retentionOf),
    begin: perStoreAverage(total.begin, list.length),
    end: perStoreAverage(total.end, list.length),
    hires: perStoreAverage(total.hires, list.length),
    terms: perStoreAverage(total.terms, list.length),
  };
}

/** Chain benchmark and one benchmark per region, from per-store totals of the benchmark population. */
export function benchmarks(byStore: Map<string, PeopleTotals>, method: BenchmarkMethod): {chain: Benchmark; region: Map<string, Benchmark>} {
  const regions = new Map<string, PeopleTotals[]>();
  for (const [id, p] of byStore) {
    const r = storeById.get(id)?.regionId;
    if (!r) continue;
    if (!regions.has(r)) regions.set(r, []);
    regions.get(r)!.push(p);
  }
  return {chain: groupBenchmark([...byStore.values()], method), region: new Map([...regions].map(([r, list]) => [r, groupBenchmark(list, method)]))};
}

export type TrendBucket = {key: string; label: string; from: number; to: number; partial: boolean};

/**
 * Time buckets for the trend charts, inside the selected time frame only (no extra periods are added).
 * Three or more fiscal periods → one point per period (partial first / last periods are flagged);
 * otherwise one point per week.
 */
export function trendBuckets(from: number, to: number): {unit: 'period' | 'week'; buckets: TrendBucket[]} {
  const periods = periodsIn(from, to);
  if (periods.length >= 3) {
    return {
      unit: 'period',
      buckets: periods.map(p => {
        const w = WEEKS[p.from];
        const [a, b] = periodRange(w.fy, w.period);
        const partial = p.from > a || p.to < b;
        return {key: p.key, label: `${p.label}${partial ? '*' : ''}`, from: p.from, to: p.to, partial};
      }),
    };
  }
  const buckets: TrendBucket[] = [];
  for (let i = from; i <= to; i++) buckets.push({key: String(i), label: `W${String(WEEKS[i].week).padStart(2, '0')} FY${String(WEEKS[i].fy).slice(2)}`, from: i, to: i, partial: false});
  return {unit: 'week', buckets};
}
