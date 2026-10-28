// Chain / region benchmarks (D13 open): "weighted" = the KPI computed on chain totals (ratio of totals);
// "simple" = the plain average of store values. Count measures are expressed per store in both methods.
import {simpleAverage} from './metrics';
import type {BenchmarkMethod} from './filters';

export function benchmarkValue<T>(method: BenchmarkMethod, chainTotal: T, perStore: T[], kpi: (t: T) => number | null): number | null {
  return method === 'weighted' ? kpi(chainTotal) : simpleAverage(perStore.map(kpi));
}

/** Average per store of a count (hires, terminations, incidents...). Same for both methods. */
export const perStoreAverage = (total: number, storeCount: number) => (storeCount > 0 ? total / storeCount : null);

export const BENCHMARK_OPTIONS: {id: BenchmarkMethod; label: string}[] = [
  {id: 'weighted', label: 'Weighted (chain totals)'},
  {id: 'simple', label: 'Simple store average'},
];
