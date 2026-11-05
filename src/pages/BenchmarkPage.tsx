// Workbook view R64 "Turnover & Retention Benchmark" (User Story 3): turnover rate, retention rate, terminations,
// hires and beginning / ending headcount by store over time, with chain-wide and region-wide averages.
//
// Layout (Sara's approved extension of the hierarchy pattern the client asked for in Allocation, review 17:45–19:08):
// a Chain → Region → District → Store matrix, then five trends for one analysis scope (the filtered scope by default,
// or the row whose name is selected), then an optional store ranking. Expanding a row never selects it.
//
// Actual values and benchmarks are kept apart. Row values are the row's own totals: event counts, snapshots added store
// by store at the same date, and rates recalculated from those components. Benchmarks use the documented rules
// (lib/peopleBenchmark.ts, D13 open): rates weighted by default, counts as averages per store; population = chain (or a
// region within it), ignoring location filters and table search (assumption, D13). The global Store filter limits the
// page like any other location filter.
import {useMemo, useState, type ReactNode} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope, type Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {TURNOVER_DRAFT_HELP, TURNOVER_DRAFT_NOTE, TURNOVER_TAG} from '../config/turnover';
import {regionById} from '../data/org';
import {fmt} from '../lib/format';
import {ppDiff, ratio} from '../lib/metrics';
import {buildOrgTree, onlyChildIds, scopeLabel, type OrgNode} from '../lib/orgTree';
import {benchmarks, referenceSeries, retentionOf, sameStores, scopeTrend, singleRegion, totalsOf, trendBuckets, turnoverOf, type Benchmark} from '../lib/peopleBenchmark';
import {emptyPeople, peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';
import type {TreeRow} from '../lib/tableRows';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('benchmark')!;
const RANK_LIMIT = 10;
/** Series styling shared by the trend charts: selected scope dark solid, region blue-grey solid, chain grey dashed. */
const S = {scope: C.actual, region: '#4f7a96', chain: C.benchmark} as const;
const PP = 'pp (percentage points): the arithmetic difference between two percentages, not a relative percentage change.';

type Level = 'chain' | 'region' | 'district' | 'store';
/** One matrix row: the filtered chain scope, a region, a district or a store, with its own people totals. */
type Row = {id: string; level: Level; name: string; sub: string; search: string; ancestors: {id: string; name: string}[]; storeIds: string[]; p: PeopleTotals; children: Row[]};
type TableGroup = 'movements' | 'turnover' | 'retention';
type Kpi = 'turnover' | 'retention';

const LEVEL_NAME: Record<Level, string> = {chain: 'Chain', region: 'Region', district: 'District', store: 'Store'};
const NA_SPANS = 'This row spans several regions, so there is no single regional benchmark.';
// Self-comparisons: a row that is the whole benchmark population of its region (or of the chain) is compared with
// itself, so the reference is the row's own rate and the difference is 0.0 pp instead of an n/a that reads as missing.
const SELF_REGION = "This row is the region itself (its whole benchmark population): the region reference is the row's own rate, so the difference is 0.0 pp.";
const SELF_CHAIN = "This row is the whole chain benchmark population: the chain reference is the row's own rate, so the difference is 0.0 pp.";

const diffHelp = (kpi: Kpi, vs: 'Region' | 'Chain') =>
  `Row ${kpi} rate minus the ${vs === 'Region' ? "row's regional" : 'chain'} ${kpi} reference, in percentage points (pp), calculated from unrounded rates and shown to one decimal. A positive value means higher ${kpi} than the ${vs === 'Region' ? 'region' : 'chain'}. Example: ${kpi === 'turnover' ? `Store turnover of 5.0% minus ${vs === 'Region' ? 'regional' : 'chain'} turnover of 3.4% equals +1.6 percentage points.` : `Store retention of 92.0% minus ${vs === 'Region' ? 'regional' : 'chain'} retention of 90.5% equals +1.5 percentage points.`} ${PP} ${vs === 'Region' ? `0.0 pp on a Region row: ${SELF_REGION} n/a on the Chain row: ${NA_SPANS}` : `0.0 pp on the Chain row: ${SELF_CHAIN}`} n/a also when a rate is undefined (no headcount).`;

export default function BenchmarkPage() {
  const scope = useScope('benchmark');
  const {filters} = useReport();
  const method = filters.benchmark;
  const methodLabel = method === 'weighted' ? 'weighted' : 'simple store average';
  const [group, setGroup] = useState<TableGroup>('turnover');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Per-store totals for the selected time frame: stores in scope and the benchmark population.
  const byStore = useMemo(() => peopleRollup(new Set([...scope.chain, ...scope.stores]), scope.people, scope.from, scope.to, 'store'), [scope]);
  const bench = useMemo(() => benchmarks(new Map([...scope.chain].map(id => [id, byStore.get(id) ?? emptyPeople()])), method), [byStore, scope.chain, method]);
  const unfiltered = sameStores(scope.stores, scope.chain);
  const chainName = unfiltered ? 'Chain' : 'Filtered scope';

  const {chainRow, rowsById, autoOpen} = useMemo(() => {
    const org = buildOrgTree(scope.stores, {region: id => id, district: id => id, store: id => id});
    const map = (n: OrgNode<string>, ancestors: Row['ancestors']): Row => ({
      id: n.id,
      level: n.level as Level,
      name: n.name,
      sub: n.sub,
      search: n.search,
      ancestors,
      storeIds: n.storeIds,
      p: totalsOf(byStore, n.storeIds),
      children: n.children.map(c => map(c, [...ancestors, {id: n.id, name: n.name}])),
    });
    const ids = [...scope.stores];
    const chain: Row = {id: 'chain', level: 'chain', name: chainName, sub: unfiltered ? `${ids.length} stores` : scopeLabel(scope.stores), search: chainName, ancestors: [], storeIds: ids, p: totalsOf(byStore, ids), children: []};
    chain.children = org.map(n => map(n, [{id: 'chain', name: chainName}]));
    const all = new Map<string, Row>();
    const walk = (r: Row) => (all.set(r.id, r), r.children.forEach(walk));
    walk(chain);
    return {chainRow: chain, rowsById: all, autoOpen: onlyChildIds(org)};
  }, [scope.stores, byStore, chainName, unfiltered]);

  // A selection the filters no longer include falls back to the filtered scope.
  if (selectedId !== null && !rowsById.has(selectedId)) setSelectedId(null);
  const selRow = (selectedId && rowsById.get(selectedId)) || chainRow;
  const selAncestors = new Set(selRow.ancestors.map(a => a.id));
  const scopeTitle = selRow.level === 'chain' ? (unfiltered ? 'Chain' : `Filtered selection: ${scopeLabel(scope.stores).replace(/ · \d+ stores?$/, '')}`) : [...selRow.ancestors.slice(1).map(a => a.name), selRow.name].join(' › ');
  const select = (r: Row) => setSelectedId(r.level === 'chain' || r.id === selectedId ? null : r.id);

  const refFor = (r: Row) => referenceSeries(r.storeIds, scope.chain);
  const regionBench = (r: Row): {b: Benchmark | null; why: string} => {
    const ref = refFor(r);
    if (ref.regionId) return {b: bench.region.get(ref.regionId) ?? null, why: ''};
    return {b: null, why: singleRegion(r.storeIds) ? SELF_REGION : NA_SPANS};
  };

  const benchNote = `Benchmarks: chain = all stores in the benchmark population; region = the stores of the row's region. They ignore Region / District / Store filters and the table search, and keep the time frame and people filters (assumption, D13). Rates: ${methodLabel}; counts: average per store.`;
  const treeOptions = {
    children: (r: Row) => r.children,
    levels: ['Chain', 'Region', 'District', 'Store'],
    name: (r: Row) => r.name,
    defaultOpen: (r: Row) => r.level === 'chain' || autoOpen.has(r.id) || selAncestors.has(r.id),
    path: (r: Row) => r.ancestors.map(a => a.name).join(' › '),
  };
  const countStores = (nodes: TreeRow<Row>[]): number => nodes.reduce((n, t) => n + (t.row.level === 'store' ? 1 : countStores(t.children)), 0);

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question}>
        <span className="heading-label">Benchmark</span>
        <span className="heading-value">{method === 'weighted' ? 'Weighted (chain totals)' : 'Simple store average · exploratory'}</span>
        <DecisionChip ids={['D13', 'D28']} label="Benchmark rule open" />
      </PageHeading>
      <ScopeLine scope={scope} />
      {scope.stores.size === 0 ? (
        <EmptyState>No stores in this selection. Use Reset filters.</EmptyState>
      ) : (
        <>
          <div className="selection-bar" role="status">
            <span>
              <b>Analysis scope: {scopeTitle}</b> · {selRow.storeIds.length} {selRow.storeIds.length === 1 ? 'store' : 'stores'} ·{' '}
              {selRow.level === 'chain' ? 'the scope set by the filters. Select a row name in the table to analyze a region, district or store.' : `selected in the table (${LEVEL_NAME[selRow.level].toLowerCase()}), within the filters.`}
            </span>
            <button type="button" className="btn-secondary" onClick={() => setSelectedId(null)} disabled={selRow.level === 'chain'}>
              Reset to filtered scope
            </button>
          </div>
          <BenchmarkReference chain={bench.chain} regionId={refFor(selRow).regionId} region={refFor(selRow).regionId ? (bench.region.get(refFor(selRow).regionId!) ?? null) : null} methodLabel={methodLabel} />

          <VisualCard
            title="People Metrics & Benchmarks by Chain, Region, District and Store"
            subtitle="Select + to show the regions, districts and stores below a row; select a row name to analyze it in the trends below. Each row shows its own totals; benchmark columns compare it with its region and the chain."
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  benchNote,
                  'Row values: hires and terminations are event counts of the row; beginning and ending headcount are snapshots of the row, adding its stores at the same date (each associate belongs to one store); turnover and retention are recalculated from those components, never averaged across rows.',
                  'Search keeps the region and district of matching rows. Export writes the visible rows with their level and parent path.',
                ]}
              />
            }
            actions={
              <Segmented
                label="Column group"
                value={group}
                options={[
                  {id: 'movements', label: 'Headcount & Movements'},
                  {id: 'turnover', label: 'Turnover Comparison'},
                  {id: 'retention', label: 'Retention Comparison'},
                ]}
                onChange={setGroup}
                size="sm"
              />
            }
          >
            <DataTable
              rows={[chainRow]}
              columns={tableColumns(group, bench, regionBench, refFor, methodLabel)}
              rowKey={r => r.id}
              label="People metrics and benchmarks by chain, region, district and store"
              searchText={r => r.search}
              searchPlaceholder="Search region, district or store"
              tree={treeOptions}
              countLabel={v => `${countStores(v)} of ${scope.stores.size} stores`}
              onRowClick={select}
              selectedKey={selRow.id}
              exportName={`people-metrics-${group}`}
              stickyFirst
              maxHeight={560}
            />
          </VisualCard>

          <TrendSection scope={scope} row={selRow} scopeTitle={scopeTitle} method={method} benchNote={benchNote} />

          <details className="bench-ranking">
            <summary>Store ranking by turnover rate (optional)</summary>
            <Ranking stores={[...rowsById.values()].filter(r => r.level === 'store')} selectedId={selRow.level === 'store' ? selRow.id : null} onSelect={id => select(rowsById.get(id)!)} chain={bench.chain.turnover} regionOf={id => bench.region.get(id) ?? null} uniqueRegion={singleRegion(scope.stores)} scope={scope} benchNote={benchNote} />
          </details>
        </>
      )}
    </div>
  );
}

/** Count cell with the row's average per store and the benchmark averages per store in its hover title. */
function CountCell({value, stores, region, chain, label}: {value: number; stores: number; region: number | null; chain: number | null; label: string}) {
  const perStore = ratio(value, stores);
  const title = `${label}: ${fmt.int(value)} for ${stores} ${stores === 1 ? 'store' : 'stores'} (${fmt.dec1(perStore)} per store). Benchmarks, average per store: ${region !== null ? `region ${fmt.dec1(region)}, ` : ''}chain ${fmt.dec1(chain)}.`;
  return <span title={title}>{fmt.int(value)}</span>;
}

function tableColumns(group: TableGroup, bench: {chain: Benchmark; region: Map<string, Benchmark>}, regionBench: (r: Row) => {b: Benchmark | null; why: string}, refFor: (r: Row) => {regionId: string | null; showChain: boolean}, methodName: string): Column<Row>[] {
  const nameCol: Column<Row> = {key: 'name', header: 'Chain › Region › District › Store', value: r => r.name, render: r => <>{r.name}<span className="cell-sub">{r.sub}</span></>, align: 'left'};
  if (group === 'movements') {
    const count = (k: 'begin' | 'end' | 'hires' | 'terms', label: string) => (r: Row) => <CountCell value={r.p[k]} stores={r.storeIds.length} region={regionBench(r).b?.[k] ?? null} chain={bench.chain[k]} label={label} />;
    const g = 'Headcount & movements · row totals';
    return [
      nameCol,
      {key: 'stores', header: 'Stores', help: 'Stores in the row, within the filters.', value: r => r.storeIds.length, render: r => fmt.int(r.storeIds.length), group: g},
      {key: 'begin', header: 'Beginning Headcount', help: 'Active associates of the row the day before the time frame starts (snapshot; stores added at the same date, never summed across weeks). Hover a value for its average per store and the benchmark averages per store.', value: r => r.p.begin, render: count('begin', 'Beginning headcount'), group: g},
      {key: 'end', header: 'Ending Headcount', help: 'Active associates of the row on the last day of the time frame (snapshot). Ending = Beginning + Hires − Terminations for the same population.', value: r => r.p.end, render: count('end', 'Ending headcount'), group: g},
      {key: 'hires', header: 'Hires', help: 'Count of associates hired in the time frame in the row (events). Hover for the average per store and the benchmarks.', value: r => r.p.hires, render: count('hires', 'Hires'), group: g},
      {key: 'terms', header: 'Terminations', help: 'Count of associates whose employment ended in the time frame in the row (events). Hover for the average per store and the benchmarks.', value: r => r.p.terms, render: count('terms', 'Terminations'), group: g},
    ];
  }
  const kpi: Kpi = group;
  const name = kpi === 'turnover' ? 'Turnover' : 'Retention';
  const own = (r: Row) => (kpi === 'turnover' ? turnoverOf(r.p) : retentionOf(r.p));
  const chainV = bench.chain[kpi];
  // Regional reference: the region benchmark; the row's own rate when the row is the region itself; null (n/a) when
  // the row spans several regions. Chain reference: the chain benchmark, or the row's own rate on the chain row.
  const regionSelf = (r: Row) => !regionBench(r).b && singleRegion(r.storeIds) !== null;
  const chainSelf = (r: Row) => !refFor(r).showChain;
  const reg = (r: Row) => (regionSelf(r) ? own(r) : (regionBench(r).b?.[kpi] ?? null));
  const chn = (r: Row) => (chainSelf(r) ? own(r) : chainV);
  const self = (why: string, text: string) => <span title={why}>{text}</span>;
  const na = (why: string) => (
    <span className="na" title={why}>
      n/a<span className="sr-only"> ({why})</span>
    </span>
  );
  const g = kpi === 'turnover' ? `${name} rate · ${TURNOVER_TAG}` : `${name} rate`;
  const rate2 = (v: number | null) => fmt.pct(v, 2);
  return [
    nameCol,
    {key: `own-${kpi}`, header: `${name} (%)`, help: `${kpi === 'turnover' ? `The row's own rate, recalculated from the row's totals. ${TURNOVER_DRAFT_HELP}` : "The row's own rate: (beginning headcount − terminations of those associates) / beginning headcount, recalculated from the row's totals. Cohort-based draft; not 1 − turnover (D27)."} Shown to two decimals.`, value: own, render: r => rate2(own(r)), group: g},
    {key: `region-${kpi}`, header: `Region ${name} (%)`, help: `Regional reference: the ${kpi} benchmark of the row's region (${methodName}; rule open, D13), shown to two decimals. On a Region row: ${SELF_REGION} On the Chain row: n/a. ${NA_SPANS}`, value: reg, render: r => (regionSelf(r) ? self(SELF_REGION, rate2(reg(r))) : regionBench(r).b ? rate2(reg(r)) : na(regionBench(r).why)), group: g},
    {key: `chain-${kpi}`, header: `Chain ${name} (%)`, help: `Chain reference: the ${kpi} benchmark of the chain (${methodName}; rule open, D13), shown to two decimals. Same value on every row; on the Chain row: ${SELF_CHAIN}`, value: chn, render: r => (chainSelf(r) ? self(SELF_CHAIN, rate2(chn(r))) : rate2(chn(r))), group: g},
    {key: `diffRegion-${kpi}`, header: 'Difference vs Region (pp)', help: diffHelp(kpi, 'Region'), value: r => ppDiff(own(r), reg(r)), render: r => (regionSelf(r) ? self(SELF_REGION, fmt.pp(ppDiff(own(r), reg(r)), 1)) : regionBench(r).b ? fmt.pp(ppDiff(own(r), reg(r)), 1) : na(regionBench(r).why)), group: g},
    {key: `diffChain-${kpi}`, header: 'Difference vs Chain (pp)', help: diffHelp(kpi, 'Chain'), value: r => ppDiff(own(r), chn(r)), render: r => (chainSelf(r) ? self(SELF_CHAIN, fmt.pp(ppDiff(own(r), chn(r)), 1)) : fmt.pp(ppDiff(own(r), chn(r)), 1)), group: g},
  ];
}

/** Compact benchmark values (the information of the former Benchmark summary): chain and, when the analysis scope
 *  lies in one region, that region. Counts are averages per store, never organization totals. */
function BenchmarkReference({chain, regionId, region, methodLabel}: {chain: Benchmark; regionId: string | null; region: Benchmark | null; methodLabel: string}) {
  const line = (name: string, b: Benchmark) => (
    <span className="bench-ref-line">
      <b>{name} benchmark</b> ({b.stores} stores): turnover {fmt.pct(b.turnover)} · retention {fmt.pct(b.retention)} ({methodLabel}) · average per store: beginning {fmt.dec1(b.begin)}, ending {fmt.dec1(b.end)}, hires {fmt.dec1(b.hires)}, terminations {fmt.dec1(b.terms)}
    </span>
  );
  return (
    <p className="bench-ref">
      {line('Chain', chain)}
      {region && regionId ? line(regionById.get(regionId)?.name ?? 'Region', region) : null}
      <InfoTip text="Benchmarks for the selected time frame. Rates follow the benchmark method; counts are averages per store, so they are compared with a row's own average per store (shown when hovering a count), never with its total." label="About the benchmark values" align="left" />
    </p>
  );
}

type Flat = {label: string; scope: number | null; region: number | null; chain: number | null};
type Series = {key: 'scope' | 'region' | 'chain'; label: string; color: string; dash?: boolean};

function TrendSection({scope, row, scopeTitle, method, benchNote}: {scope: Scope; row: Row; scopeTitle: string; method: 'weighted' | 'simple'; benchNote: string}) {
  const {unit, buckets} = useMemo(() => trendBuckets(scope.from, scope.to), [scope.from, scope.to]);
  const ref = referenceSeries(row.storeIds, scope.chain);
  const ids = useMemo(() => new Set(row.storeIds), [row.storeIds]);
  const points = useMemo(() => scopeTrend(ids, scope.chain, scope.people, buckets, method, ref.regionId), [ids, scope.chain, scope.people, buckets, method, ref.regionId]);
  const regionName = ref.regionId ? (regionById.get(ref.regionId)?.name ?? 'Region') : null;
  const wholeChain = !ref.showChain && !ref.regionId;
  const short = wholeChain ? 'Chain' : row.level === 'chain' ? 'Filtered selection' : row.name;
  const series: Series[] = [{key: 'scope', label: short, color: S.scope}, ...(regionName ? [{key: 'region' as const, label: `${regionName} benchmark`, color: S.region}] : []), ...(ref.showChain ? [{key: 'chain' as const, label: 'Chain benchmark', color: S.chain, dash: true}] : [])];

  const unitText = unit === 'period' ? 'fiscal period (4-4-5)' : 'week';
  const partialNote = buckets.some(b => b.partial) ? ' * Partial period: only the weeks inside the time frame.' : '';
  const timeNote = `One point per ${unitText} of the selected time frame (${buckets.length} ${unit === 'period' ? 'periods' : 'weeks'}). Rates are per ${unit}, not annualized.${partialNote}`;
  // Headcount is a snapshot count, not a rate: its note keeps the time points but not the rate wording.
  const hcNote = `One point per ${unitText} of the selected time frame (${buckets.length} ${unit === 'period' ? 'periods' : 'weeks'}); each point shows the snapshots at the start and end of that ${unit}.${partialNote}`;
  const filtersInfo = <VisualFilters scope={scope} notes={[benchNote, timeNote, `Analysis scope: ${scopeTitle} (${row.storeIds.length} stores).`]} />;
  const rate = (k: Kpi): Flat[] => points.map(p => ({label: p.label, scope: k === 'turnover' ? turnoverOf(p.scope) : retentionOf(p.scope), region: p.region?.[k] ?? null, chain: p.chain[k]}));
  const counts = (k: 'hires' | 'terms') => points.map(p => ({label: p.label, value: p.scope[k], stores: p.stores, region: p.region?.[k] ?? null, chain: p.chain[k]}));
  const hc = points.map(p => ({label: p.label, begin: p.scope.begin, end: p.scope.end, stores: p.stores, rb: p.region?.begin ?? null, re: p.region?.end ?? null, cb: p.chain.begin, ce: p.chain.end}));

  return (
    <section aria-label={`Trends for ${scopeTitle}`}>
      <h2 className="section-heading">
        Trends · {scopeTitle} <span className="note">({row.storeIds.length} {row.storeIds.length === 1 ? 'store' : 'stores'})</span>
      </h2>
      <div className="trend-grid">
        <RateChart title="Turnover Rate over Time" subtitle={`${TURNOVER_TAG}. ${short}: terminations / average headcount per ${unit}.`} help={`Recalculated from the scope's terminations and headcount for each ${unit}; benchmark lines follow the documented draft (D12, D13). Provisional: per period of the trend, not the confirmed rolling 52-week OPS 200 calculation (D40). ${timeNote}`} data={rate('turnover')} series={series} filters={filtersInfo} fromZero />
        <RateChart title="Retention Rate over Time" subtitle={`${short}: cohort retention per ${unit} (draft, D27).`} help={`(Beginning headcount − terminations of those associates) / beginning headcount for each ${unit}, recalculated from the scope's totals. Not 1 − turnover. ${timeNote}`} data={rate('retention')} series={series} filters={filtersInfo} />
        <CountChart title="Hires over Time" scopeName={short} measure="Hires" help={`Number of hires of ${short} per ${unit} (event count). Benchmarks are averages per store and appear only in the tooltip, next to the scope's own average per store. ${timeNote}`} data={counts('hires')} regionName={regionName} filters={filtersInfo} />
        <CountChart title="Terminations over Time" scopeName={short} measure="Terminations" help={`Number of terminations of ${short} per ${unit} (event count). Benchmarks are averages per store, in the tooltip only. ${timeNote}`} data={counts('terms')} regionName={regionName} filters={filtersInfo} />
        <VisualCard title="Beginning & Ending Headcount over Time" className="span-2" subtitle={`${short}: active associates the day before each ${unit} starts (beginning) and on its last day (ending). Counts of the scope; benchmark averages per store in the tooltip.`} filters={<VisualFilters scope={scope} notes={[benchNote, hcNote, `Analysis scope: ${scopeTitle} (${row.storeIds.length} stores).`]} />}>
          <ChartKey
            items={[
              {label: `${short} · ending`, color: S.scope, kind: 'line'},
              {label: `${short} · beginning`, color: S.scope, kind: 'dash'},
            ]}
          />
          <div className="chart-h260">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hc} margin={{top: 8, right: 16, left: 8, bottom: 0}} accessibilityLayer>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
                <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.int(v)} domain={['auto', 'auto']} label={{value: 'Associates', angle: -90, position: 'insideLeft', fontSize: 11, fill: C.axis}} />
                <Tooltip
                  content={({active, payload}) => {
                    const p = active && payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <TipBox
                        title={p.label}
                        rows={[
                          {label: `${short} · beginning`, value: fmt.int(p.begin), swatch: S.scope},
                          {label: `${short} · ending`, value: fmt.int(p.end), swatch: S.scope},
                          {label: `${short} · ending per store`, value: fmt.dec1(ratio(p.end, p.stores))},
                          ...(regionName ? [{label: `${regionName} · ending, average per store`, value: fmt.dec1(p.re)}] : []),
                          {label: 'Chain · ending, average per store', value: fmt.dec1(p.ce)},
                        ]}
                        note="Benchmarks are averages per store, compared with the scope's own average per store."
                      />
                    );
                  }}
                />
                <Line dataKey="end" name={`${short} ending`} stroke={S.scope} strokeWidth={2.5} dot={{r: 2}} isAnimationActive={ANIMATE} />
                <Line dataKey="begin" name={`${short} beginning`} stroke={S.scope} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={ANIMATE} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-note">The axis starts near the data range, not at zero. {hcNote}</p>
        </VisualCard>
      </div>
    </section>
  );
}

function ChartTitle({children, help, label}: {children: ReactNode; help: ReactNode; label: string}) {
  return (
    <>
      {children} <InfoTip text={help} label={`About ${label}`} align="left" />
    </>
  );
}

function RateChart({title, subtitle, help, data, series, filters, fromZero = false}: {title: string; subtitle: string; help: string; data: Flat[]; series: Series[]; filters: ReactNode; fromZero?: boolean}) {
  return (
    <VisualCard title={title} subtitle={<ChartTitle help={help} label={title}>{`${subtitle} ${fromZero ? 'Axis starts at 0%.' : 'Axis starts near the data range.'}`}</ChartTitle>} filters={filters}>
      <ChartKey items={series.map(s => ({label: s.label, color: s.color, kind: s.dash ? ('dash' as const) : ('line' as const)}))} />
      <div className="chart-h220">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{top: 8, right: 16, left: 8, bottom: 0}} accessibilityLayer>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={AXIS} width={52} tickFormatter={v => fmt.pct(v, 1)} domain={fromZero ? [0, 'auto'] : ['auto', 'auto']} />
            <Tooltip
              content={({active, payload}) => {
                const p = active && (payload?.[0]?.payload as Flat | undefined);
                if (!p) return null;
                return (
                  <TipBox
                    title={p.label}
                    rows={series.map(s => ({label: s.label, value: s.key === 'scope' ? fmt.pct(p.scope) : `${fmt.pct(p[s.key])} (scope ${fmt.pp(ppDiff(p.scope, p[s.key]), 1)})`, swatch: s.color}))}
                    note={series.length > 1 ? 'pp = arithmetic difference between two percentages.' : undefined}
                  />
                );
              }}
            />
            {series.map(s => (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.key === 'scope' ? 2.5 : 2} strokeDasharray={s.dash ? '5 3' : undefined} dot={s.key === 'scope' ? {r: 2.5} : false} isAnimationActive={ANIMATE} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </VisualCard>
  );
}

type CountPoint = {label: string; value: number; stores: number; region: number | null; chain: number | null};

function CountChart({title, scopeName, measure, help, data, regionName, filters}: {title: string; scopeName: string; measure: string; help: string; data: CountPoint[]; regionName: string | null; filters: ReactNode}) {
  return (
    <VisualCard title={title} subtitle={<ChartTitle help={help} label={title}>{`${scopeName}: ${measure.toLowerCase()} per time bucket (count). Benchmark averages per store in the tooltip.`}</ChartTitle>} filters={filters}>
      <ChartKey items={[{label: `${scopeName} · ${measure.toLowerCase()} (count)`, color: S.scope}]} />
      <div className="chart-h220">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{top: 8, right: 16, left: 8, bottom: 0}} accessibilityLayer>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={AXIS} width={44} allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip
              cursor={{fill: '#f3f2f1'}}
              content={({active, payload}) => {
                const p = active && (payload?.[0]?.payload as CountPoint | undefined);
                if (!p) return null;
                return (
                  <TipBox
                    title={p.label}
                    rows={[
                      {label: `${scopeName} · count`, value: fmt.int(p.value), swatch: S.scope},
                      {label: `${scopeName} · per store (${p.stores} ${p.stores === 1 ? 'store' : 'stores'})`, value: fmt.dec1(ratio(p.value, p.stores))},
                      ...(regionName ? [{label: `${regionName} · average per store`, value: fmt.dec1(p.region)}] : []),
                      {label: 'Chain · average per store', value: fmt.dec1(p.chain)},
                    ]}
                    note="Benchmarks are averages per store: compare them with the scope's per-store value, not with its count."
                  />
                );
              }}
            />
            <Bar dataKey="value" name={`${scopeName} ${measure}`} fill={S.scope} maxBarSize={22} isAnimationActive={ANIMATE} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </VisualCard>
  );
}

function Ranking({stores, selectedId, onSelect, chain, regionOf, uniqueRegion, scope, benchNote}: {stores: Row[]; selectedId: string | null; onSelect: (id: string) => void; chain: number | null; regionOf: (id: string) => Benchmark | null; uniqueRegion: string | null; scope: Scope; benchNote: string}) {
  const regionIdOf = (r: Row) => r.ancestors.find(a => a.id.startsWith('R'))?.id ?? '';
  const ranked = stores
    .map(r => ({r, v: turnoverOf(r.p)}))
    .filter(x => x.v !== null)
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0) || a.r.name.localeCompare(b.r.name, 'en', {numeric: true}));
  const top = ranked.slice(0, RANK_LIMIT).map(({r, v}) => ({id: r.id, name: r.name, v, region: regionById.get(regionIdOf(r))?.name ?? '', regionV: regionOf(regionIdOf(r))?.turnover ?? null}));
  const rank = selectedId ? ranked.findIndex(x => x.r.id === selectedId) + 1 : 0;
  const regionV = uniqueRegion ? (regionOf(uniqueRegion)?.turnover ?? null) : null;
  const regionName = uniqueRegion ? regionById.get(uniqueRegion)?.name : null;
  return (
    <VisualCard
      title="Store ranking by turnover rate"
      subtitle={`${TURNOVER_TAG}. Showing ${top.length} of ${ranked.length} stores, highest turnover first. A secondary tool for investigation, not a store rating: no thresholds are applied. Selecting a bar selects that store for the trends, like a row in the table.`}
      filters={<VisualFilters scope={scope} notes={[benchNote, 'Select a bar to analyze the store in the trends; select it again to return to the filtered scope.']} />}
    >
      <ChartKey items={[{label: 'Store turnover', color: C.comparison}, {label: 'Selected store', color: C.highlight}, {label: 'Chain benchmark', color: S.chain, kind: 'dash'}, ...(regionName ? [{label: `${regionName} benchmark`, color: S.region, kind: 'dash' as const}] : [])]} />
      <div style={{height: top.length * 30 + 40}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{top: 18, right: 56, left: 8, bottom: 0}} accessibilityLayer>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" tick={AXIS} tickFormatter={v => fmt.pct(v, 1)} domain={[0, 'auto']} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={84} interval={0} />
            <ReferenceLine x={chain ?? 0} stroke={S.chain} strokeDasharray="5 3" label={{value: `Chain ${fmt.pct(chain)}`, position: 'top', fontSize: 11, fill: C.axis}} />
            {regionV !== null ? <ReferenceLine x={regionV} stroke={S.region} strokeDasharray="2 2" label={{value: `${regionName} ${fmt.pct(regionV)}`, position: 'insideTopRight', fontSize: 11, fill: S.region}} /> : null}
            <Tooltip
              cursor={{fill: '#f3f2f1'}}
              content={({active, payload}) => {
                const p = active && (payload?.[0]?.payload as (typeof top)[number] | undefined);
                if (!p) return null;
                return (
                  <TipBox
                    title={p.name}
                    rows={[
                      {label: 'Turnover rate', value: fmt.pct(p.v)},
                      {label: `${p.region} benchmark`, value: `${fmt.pct(p.regionV)} (store ${fmt.pp(ppDiff(p.v, p.regionV), 1)})`},
                      {label: 'Chain benchmark', value: `${fmt.pct(chain)} (store ${fmt.pp(ppDiff(p.v, chain), 1)})`},
                    ]}
                    note="Select the bar to analyze this store in the trends."
                  />
                );
              }}
            />
            <Bar dataKey="v" isAnimationActive={ANIMATE} cursor="pointer" onClick={(d: {id?: string}) => d?.id && onSelect(d.id)} label={{position: 'right', fontSize: 11, fill: C.axis, formatter: (v: number) => fmt.pct(v)}}>
              {top.map(b => (
                <Cell key={b.id} fill={selectedId === b.id ? C.highlight : C.comparison} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {selectedId && rank > RANK_LIMIT ? <p className="note">The selected store ranks #{rank} of {ranked.length} and is not in the top {RANK_LIMIT}.</p> : null}
      <p className="note">
        {uniqueRegion ? '' : 'Several regions are in scope: each store’s own region benchmark is in its tooltip. '}
        Turnover is per selected time frame, not annualized. {TURNOVER_DRAFT_NOTE} <DecisionChip ids={['D12', 'D13', 'D40']} label="Rules open" align="left" />
      </p>
    </VisualCard>
  );
}
