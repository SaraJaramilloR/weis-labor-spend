// Workbook view R64 "Turnover & Retention Benchmark" (User Story 3): turnover rate, retention rate, terminations,
// hires and beginning / ending headcount by store over time, with chain-wide and region-wide averages.
//
// Store values, region benchmarks and chain benchmarks are kept apart. Benchmarks use the documented rules
// (lib/peopleBenchmark.ts, D13 open): rates weighted by default, counts as averages per store; population = chain
// (or the store's own region), ignoring location filters and table search (assumption, D13).
// The Store control selects the store for the trend charts; the ranking and the table list the stores of the
// Region / District selection, so selecting a store never reduces them to one row.
import {useMemo, useState, type ReactNode} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {locationText, useScope, type Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {regionById, storeById} from '../data/org';
import {ALL, storeScope} from '../lib/filters';
import {fmt} from '../lib/format';
import {ppDiff} from '../lib/metrics';
import {benchmarks, retentionOf, trendBuckets, turnoverOf, type Benchmark} from '../lib/peopleBenchmark';
import {emptyPeople, peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('benchmark')!;
const RANK_LIMIT = 10;
const PAGE_SIZE = 20;
/** Series styling shared by the five trend charts: store dark solid, region blue-grey solid, chain grey dashed. */
const S = {store: C.actual, region: '#4f7a96', chain: C.benchmark} as const;
const PP = 'pp (percentage points): the arithmetic difference between two percentages, not a relative percentage change.';

type Row = {id: string; name: string; number: number; regionId: string; region: string; p: PeopleTotals; turnover: number | null; retention: number | null};
type TableGroup = 'movements' | 'turnover' | 'retention';
type HcBench = 'region' | 'chain';

const diffHelp = (kpi: 'turnover' | 'retention', vs: 'Region' | 'Chain') =>
  kpi === 'turnover'
    ? `Store turnover rate minus the ${vs === 'Region' ? "store's region" : 'chain'} turnover rate, in percentage points (pp). A positive value means higher turnover than the ${vs.toLowerCase()} benchmark. Example: 7.5% − 3.7% = +3.8 percentage points. ${PP}`
    : `Store retention rate minus the ${vs === 'Region' ? "store's region" : 'chain'} retention rate, in percentage points (pp). A positive value means higher retention than the ${vs.toLowerCase()} benchmark. Example: 97.5% − 93.7% = +3.8 percentage points. ${PP}`;

export default function BenchmarkPage() {
  const scope = useScope('benchmark');
  const {filters, role, update} = useReport();
  const method = filters.benchmark;
  const methodLabel = method === 'weighted' ? 'weighted' : 'simple store average';
  const [group, setGroup] = useState<TableGroup>('turnover');
  const [hcBench, setHcBench] = useState<HcBench>('region');

  // Store list (ranking and table): Region / District / State / Geography, not the trend store.
  const listStores = useMemo(() => storeScope({...scope.filters, store: ALL}, role, scope.from), [scope, role]);
  const selectedId = filters.store !== ALL && scope.chain.has(filters.store) ? filters.store : null;
  const selected = selectedId ? storeById.get(selectedId)! : null;
  const select = (id: string | null) => update({store: id ?? ALL});
  const toggle = (id: string) => select(selectedId === id ? null : id);

  // Per-store totals of the benchmark population for the selected time frame.
  const byStore = useMemo(() => peopleRollup(scope.chain, scope.people, scope.from, scope.to, 'store'), [scope]);
  const bench = useMemo(() => benchmarks(new Map([...scope.chain].map(id => [id, byStore.get(id) ?? emptyPeople()])), method), [byStore, scope.chain, method]);
  const rows: Row[] = useMemo(
    () =>
      [...listStores].map(id => {
        const s = storeById.get(id)!;
        const p = byStore.get(id) ?? emptyPeople();
        return {id, name: s.name, number: s.number, regionId: s.regionId, region: regionById.get(s.regionId)?.name ?? '', p, turnover: turnoverOf(p), retention: retentionOf(p)};
      }),
    [listStores, byStore],
  );
  const regionsInList = [...new Set(rows.map(r => r.regionId))];
  const uniqueRegion = regionsInList.length === 1 ? regionsInList[0] : null;
  const regionOf = (regionId: string) => bench.region.get(regionId) ?? null;

  const listScope: Scope = {
    ...scope,
    stores: listStores,
    applied: scope.applied.map(a => (a.startsWith('Store: ') ? locationText({...filters, store: ALL}) : a)).concat(selected ? [`Trend store: ${selected.name}`] : []),
  };
  const benchNote = `Benchmarks: chain = all stores in the benchmark population; region = the stores of each store's own region. They ignore Region / District / Store filters and the table search, and keep the time frame and people filters (assumption, D13). Rates: ${methodLabel}; counts: average per store.`;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question}>
        <span className="heading-label">Benchmark</span>
        <span className="heading-value">{method === 'weighted' ? 'Weighted (chain totals)' : 'Simple store average · exploratory'}</span>
        <DecisionChip ids={['D13', 'D28']} label="Benchmark rule open" />
      </PageHeading>
      <ScopeLine scope={listScope} />
      {rows.length === 0 ? (
        <EmptyState>No stores in this selection. Use Reset filters.</EmptyState>
      ) : (
        <>
          <div className="selection-bar" role="status">
            {selected ? (
              <>
                <span>
                  <b>Trend store: {selected.name}</b> · {regionById.get(selected.regionId)?.name}. The five trend charts show this store with its region and the chain.
                </span>
                <button type="button" className="btn-secondary" onClick={() => select(null)}>
                  Clear store selection
                </button>
              </>
            ) : (
              <span>No store selected. Select a store in the Store filter, the ranking or the table to see its trends.</span>
            )}
          </div>

          <BenchmarkSummary selected={selected ? {name: selected.name, p: byStore.get(selected.id) ?? emptyPeople()} : null} regionId={selected?.regionId ?? uniqueRegion} region={regionOf(selected?.regionId ?? uniqueRegion ?? '')} chain={bench.chain} methodLabel={methodLabel} />

          <Ranking rows={rows} selectedId={selectedId} onSelect={toggle} chain={bench.chain.turnover} uniqueRegion={uniqueRegion} regionOf={regionOf} scope={listScope} benchNote={benchNote} />

          <TrendSection scope={scope} selectedId={selectedId} method={method} hcBench={hcBench} setHcBench={setHcBench} benchNote={benchNote} />

          <VisualCard
            title="Store People Metrics & Benchmarks"
            subtitle="One row per store in the Region / District selection. Region values refer to each store's own region. Select a store name to show its trends."
            filters={<VisualFilters scope={listScope} notes={[benchNote, 'Search filters the listed stores only; it does not change the benchmarks. Export includes every matching store for the selected column group.']} />}
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
              rows={rows}
              columns={tableColumns(group, bench.chain, regionOf)}
              rowKey={r => r.id}
              label="Store People Metrics & Benchmarks"
              searchText={r => `${r.name} ${r.number}`}
              searchPlaceholder="Search store number or name"
              countNoun="stores"
              onRowClick={r => toggle(r.id)}
              selectedKey={selectedId}
              initialSort={{key: 'name', dir: 'asc'}}
              exportName={`store-people-metrics-${group}`}
              pageSize={PAGE_SIZE}
              maxHeight={620}
            />
          </VisualCard>
        </>
      )}
    </div>
  );
}

function tableColumns(group: TableGroup, chain: Benchmark, regionOf: (id: string) => Benchmark | null): Column<Row>[] {
  const base: Column<Row>[] = [
    {key: 'name', header: 'Store', value: r => r.name, align: 'left'},
    {key: 'region', header: 'Region', value: r => r.region, align: 'left'},
  ];
  if (group === 'movements')
    return [
      ...base,
      {key: 'begin', header: 'Beginning Headcount', help: 'Active associates the day before the time frame starts (snapshot).', value: r => r.p.begin, render: r => fmt.int(r.p.begin), group: 'Headcount & movements'},
      {key: 'end', header: 'Ending Headcount', help: 'Active associates on the last day of the time frame (snapshot). Ending = Beginning + Hires − Terminations for the same population.', value: r => r.p.end, render: r => fmt.int(r.p.end), group: 'Headcount & movements'},
      {key: 'hires', header: 'Hires', help: 'Count of associates hired in the time frame.', value: r => r.p.hires, render: r => fmt.int(r.p.hires), group: 'Headcount & movements'},
      {key: 'terms', header: 'Terminations', help: 'Count of associates whose employment ended in the time frame.', value: r => r.p.terms, render: r => fmt.int(r.p.terms), group: 'Headcount & movements'},
    ];
  const kpi = group;
  const name = kpi === 'turnover' ? 'Turnover' : 'Retention';
  const store = (r: Row) => (kpi === 'turnover' ? r.turnover : r.retention);
  const region = (r: Row) => regionOf(r.regionId)?.[kpi] ?? null;
  const g = `${name} rate`;
  return [
    ...base,
    {key: `store-${kpi}`, header: `Store ${name} (%)`, help: kpi === 'turnover' ? 'Terminations / average headcount ((beginning + ending) / 2) for the store in the time frame. Not annualized. Draft until OPS 201 is reviewed (D12).' : '(Beginning headcount − terminations of those associates) / beginning headcount for the store. Workbook draft (D27).', value: store, render: r => fmt.pct(store(r)), group: g},
    {key: `region-${kpi}`, header: `Region ${name} (%)`, help: `${name} rate of the store's own region (benchmark; rule open, D13).`, value: region, render: r => fmt.pct(region(r)), group: g},
    {key: `chain-${kpi}`, header: `Chain ${name} (%)`, help: `${name} rate of the chain (benchmark; rule open, D13). Same value on every row.`, value: () => chain[kpi], render: () => fmt.pct(chain[kpi]), group: g},
    {key: `diffRegion-${kpi}`, header: 'Difference vs Region (pp)', help: diffHelp(kpi, 'Region'), value: r => ppDiff(store(r), region(r)), render: r => fmt.pp(ppDiff(store(r), region(r)), 1), group: g},
    {key: `diffChain-${kpi}`, header: 'Difference vs Chain (pp)', help: diffHelp(kpi, 'Chain'), value: r => ppDiff(store(r), chain[kpi]), render: r => fmt.pp(ppDiff(store(r), chain[kpi]), 1), group: g},
  ];
}

/** Compact expandable benchmark values for the selected store's region and the chain. */
function BenchmarkSummary({selected, regionId, region, chain, methodLabel}: {selected: {name: string; p: PeopleTotals} | null; regionId: string | null; region: Benchmark | null; chain: Benchmark; methodLabel: string}) {
  const regionName = regionId ? regionById.get(regionId)?.name : null;
  const lines: {label: string; store: (p: PeopleTotals) => string; bench: (b: Benchmark) => string; count: boolean}[] = [
    {label: 'Beginning Headcount', store: p => fmt.int(p.begin), bench: b => fmt.dec1(b.begin), count: true},
    {label: 'Ending Headcount', store: p => fmt.int(p.end), bench: b => fmt.dec1(b.end), count: true},
    {label: 'Hires', store: p => fmt.int(p.hires), bench: b => fmt.dec1(b.hires), count: true},
    {label: 'Terminations', store: p => fmt.int(p.terms), bench: b => fmt.dec1(b.terms), count: true},
    {label: 'Turnover rate', store: p => fmt.pct(turnoverOf(p)), bench: b => fmt.pct(b.turnover), count: false},
    {label: 'Retention rate', store: p => fmt.pct(retentionOf(p)), bench: b => fmt.pct(b.retention), count: false},
  ];
  return (
    <details className="bench-summary">
      <summary>
        Benchmark summary <span className="note">· {selected ? `${selected.name}, ${regionName} and chain` : regionName ? `${regionName} and chain` : 'chain'}</span>
      </summary>
      <table aria-label="Benchmark summary">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {selected ? <th scope="col">{selected.name} · store value</th> : null}
            {region && regionName ? <th scope="col">{regionName} benchmark</th> : null}
            <th scope="col">Chain benchmark</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(l => (
            <tr key={l.label}>
              <th scope="row" className="txt">
                {l.label}
                <span className="cell-sub">{l.count ? 'Benchmarks: average per store' : `Benchmarks: ${methodLabel}`}</span>
              </th>
              {selected ? <td>{l.store(selected.p)}</td> : null}
              {region && regionName ? <td>{l.bench(region)}</td> : null}
              <td>{l.bench(chain)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!region || !regionName ? <p className="note">Several regions are in scope: select a region or a store to add its region benchmark.</p> : null}
      <p className="note">
        Store values are counts and rates of one store. Benchmark counts are averages per store ({region && regionName ? `${region.stores} stores in ${regionName}, ` : ''}
        {chain.stores} in the chain), not organization totals. Selected time frame.
      </p>
    </details>
  );
}

type Point = {label: string; partial: boolean; store: Record<string, number | null>; region: Record<string, number | null>; chain: Record<string, number | null>};

function TrendSection({scope, selectedId, method, hcBench, setHcBench, benchNote}: {scope: Scope; selectedId: string | null; method: 'weighted' | 'simple'; hcBench: HcBench; setHcBench: (v: HcBench) => void; benchNote: string}) {
  const {unit, buckets} = useMemo(() => trendBuckets(scope.from, scope.to), [scope.from, scope.to]);
  const store = selectedId ? storeById.get(selectedId)! : null;
  const data: Point[] = useMemo(() => {
    if (!store) return [];
    return buckets.map(b => {
      const byStore = peopleRollup(scope.chain, scope.people, b.from, b.to, 'store');
      const all = new Map([...scope.chain].map(id => [id, byStore.get(id) ?? emptyPeople()]));
      const bm = benchmarks(all, method);
      const p = all.get(store.id) ?? emptyPeople();
      const reg = bm.region.get(store.regionId)!;
      const pick = (x: {turnover: number | null; retention: number | null; begin: number | null; end: number | null; hires: number | null; terms: number | null}) => ({turnover: x.turnover, retention: x.retention, begin: x.begin, end: x.end, hires: x.hires, terms: x.terms});
      return {label: b.label, partial: b.partial, store: pick({turnover: turnoverOf(p), retention: retentionOf(p), begin: p.begin, end: p.end, hires: p.hires, terms: p.terms}), region: pick(reg), chain: pick(bm.chain)};
    });
  }, [buckets, scope.chain, scope.people, store, method]);

  const unitText = unit === 'period' ? 'fiscal period (4-4-5)' : 'week';
  const partialNote = buckets.some(b => b.partial) ? ' * Partial period: only the weeks inside the time frame.' : '';
  const timeNote = `One point per ${unitText} of the selected time frame (${buckets.length} ${unit === 'period' ? 'periods' : 'weeks'}). Rates are per ${unit}, not annualized.${partialNote}`;
  if (!store)
    return (
      <VisualCard title="Store trends vs region and chain" filters={<VisualFilters scope={scope} notes={[benchNote]} />}>
        <EmptyState>Select a store to see its turnover, retention, hires, terminations and headcount over time against its region and the chain. Use the Store filter, a ranking bar or a store name in the table.</EmptyState>
      </VisualCard>
    );
  const regionName = regionById.get(store.regionId)?.name ?? 'Region';
  const flat = (k: keyof Point['store']) => data.map(d => ({label: d.label, partial: d.partial, store: d.store[k], region: d.region[k], chain: d.chain[k]}));
  const filtersInfo = <VisualFilters scope={scope} notes={[benchNote, timeNote]} />;
  const rateKey = [
    {label: store.name, color: S.store, kind: 'line' as const},
    {label: `${regionName} benchmark`, color: S.region, kind: 'line' as const},
    {label: 'Chain benchmark', color: S.chain, kind: 'dash' as const},
  ];
  const countKey = [
    {label: `${store.name} · count`, color: S.store},
    {label: `${regionName} · average per store`, color: S.region, kind: 'line' as const},
    {label: 'Chain · average per store', color: S.chain, kind: 'dash' as const},
  ];
  const hb = hcBench === 'region' ? {name: regionName, color: S.region} : {name: 'Chain', color: S.chain};
  const hc = data.map(d => ({label: d.label, sb: d.store.begin, se: d.store.end, bb: (hcBench === 'region' ? d.region : d.chain).begin, be: (hcBench === 'region' ? d.region : d.chain).end}));

  return (
    <section aria-label="Store trends" className="trend-grid">
      <RateChart title="Turnover Rate over Time" help={`Terminations / average headcount per ${unit}, for ${store.name}, ${regionName} and the chain. ${timeNote}`} data={flat('turnover')} keys={rateKey} names={[store.name, regionName]} filters={filtersInfo} fromZero />
      <RateChart title="Retention Rate over Time" help={`(Beginning headcount − terminations of those associates) / beginning headcount per ${unit}. Workbook draft (D27). ${timeNote}`} data={flat('retention')} keys={rateKey} names={[store.name, regionName]} filters={filtersInfo} />
      <CountChart title="Hires over Time" help={`${store.name}: number of hires per ${unit} (event count). ${regionName} and chain: average hires per store, so one store is never compared with a whole region's total. ${timeNote}`} data={flat('hires')} keys={countKey} names={[store.name, regionName]} filters={filtersInfo} />
      <CountChart title="Terminations over Time" help={`${store.name}: number of terminations per ${unit} (event count). ${regionName} and chain: average terminations per store. ${timeNote}`} data={flat('terms')} keys={countKey} names={[store.name, regionName]} filters={filtersInfo} />
      <VisualCard
        title="Beginning & Ending Headcount over Time"
        className="span-2"
        subtitle={`${store.name} (counts) vs ${hb.name} (average per store). Beginning = active the day before each ${unit} starts; ending = active on its last day.`}
        filters={filtersInfo}
        actions={<Segmented label="Headcount benchmark" value={hcBench} options={[{id: 'region', label: `${regionName} benchmark`}, {id: 'chain', label: 'Chain benchmark'}]} onChange={setHcBench} size="sm" />}
      >
        <ChartKey
          items={[
            {label: `${store.name} · ending`, color: S.store, kind: 'line'},
            {label: `${store.name} · beginning`, color: S.store, kind: 'dash'},
            {label: `${hb.name} · ending (avg per store)`, color: hb.color, kind: 'line'},
            {label: `${hb.name} · beginning (avg per store)`, color: hb.color, kind: 'dash'},
          ]}
        />
        <div className="chart-h260">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hc} margin={{top: 8, right: 16, left: 8, bottom: 0}} accessibilityLayer>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
              <YAxis tick={AXIS} width={52} tickFormatter={v => fmt.int(v)} domain={['auto', 'auto']} label={{value: 'Associates', angle: -90, position: 'insideLeft', fontSize: 11, fill: C.axis}} />
              <Tooltip
                content={({active, payload}) => {
                  const p = active && payload?.[0]?.payload;
                  if (!p) return null;
                  return (
                    <TipBox
                      title={p.label}
                      rows={[
                        {label: `${store.name} · beginning`, value: fmt.int(p.sb), swatch: S.store},
                        {label: `${store.name} · ending`, value: fmt.int(p.se), swatch: S.store},
                        {label: `${hb.name} · beginning (avg per store)`, value: fmt.dec1(p.bb), swatch: hb.color},
                        {label: `${hb.name} · ending (avg per store)`, value: fmt.dec1(p.be), swatch: hb.color},
                      ]}
                    />
                  );
                }}
              />
              <Line dataKey="se" name={`${store.name} ending`} stroke={S.store} strokeWidth={2.5} dot={{r: 2}} isAnimationActive={ANIMATE} />
              <Line dataKey="sb" name={`${store.name} beginning`} stroke={S.store} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={ANIMATE} />
              <Line dataKey="be" name={`${hb.name} ending`} stroke={hb.color} strokeWidth={2} dot={{r: 2}} isAnimationActive={ANIMATE} />
              <Line dataKey="bb" name={`${hb.name} beginning`} stroke={hb.color} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={ANIMATE} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-note">The axis starts near the data range, not at zero. {timeNote}</p>
      </VisualCard>
    </section>
  );
}

type Flat = {label: string; partial: boolean; store: number | null; region: number | null; chain: number | null};

function ChartTitle({children, help}: {children: string; help: ReactNode}) {
  return (
    <>
      {children} <InfoTip text={help} label={`About ${children}`} align="left" />
    </>
  );
}

function RateChart({title, help, data, keys, names, filters, fromZero = false}: {title: string; help: string; data: Flat[]; keys: {label: string; color: string; kind?: 'line' | 'dash'}[]; names: [string, string]; filters: ReactNode; fromZero?: boolean}) {
  return (
    <VisualCard title={title} subtitle={<ChartTitle help={help}>{fromZero ? 'Rate per time bucket; axis starts at 0%.' : 'Rate per time bucket; axis starts near the data range, not at 0%.'}</ChartTitle>} filters={filters}>
      <ChartKey items={keys} />
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
                    rows={[
                      {label: names[0], value: fmt.pct(p.store), swatch: S.store},
                      {label: `${names[1]} benchmark`, value: `${fmt.pct(p.region)} (store ${fmt.pp(ppDiff(p.store, p.region), 1)})`, swatch: S.region},
                      {label: 'Chain benchmark', value: `${fmt.pct(p.chain)} (store ${fmt.pp(ppDiff(p.store, p.chain), 1)})`, swatch: S.chain},
                    ]}
                    note="pp = arithmetic difference between two percentages."
                  />
                );
              }}
            />
            <Line dataKey="store" name={names[0]} stroke={S.store} strokeWidth={2.5} dot={{r: 2.5}} isAnimationActive={ANIMATE} />
            <Line dataKey="region" name={`${names[1]} benchmark`} stroke={S.region} strokeWidth={2} dot={{r: 1.5}} isAnimationActive={ANIMATE} />
            <Line dataKey="chain" name="Chain benchmark" stroke={S.chain} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={ANIMATE} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </VisualCard>
  );
}

function CountChart({title, help, data, keys, names, filters}: {title: string; help: string; data: Flat[]; keys: {label: string; color: string; kind?: 'line' | 'dash'}[]; names: [string, string]; filters: ReactNode}) {
  return (
    <VisualCard title={title} subtitle={<ChartTitle help={help}>Bars: store event count. Lines: region and chain average per store.</ChartTitle>} filters={filters}>
      <ChartKey items={keys} />
      <div className="chart-h220">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{top: 8, right: 16, left: 8, bottom: 0}} accessibilityLayer>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
            <YAxis tick={AXIS} width={40} allowDecimals={false} domain={[0, 'auto']} />
            <Tooltip
              cursor={{fill: '#f3f2f1'}}
              content={({active, payload}) => {
                const p = active && (payload?.[0]?.payload as Flat | undefined);
                if (!p) return null;
                return (
                  <TipBox
                    title={p.label}
                    rows={[
                      {label: `${names[0]} · count`, value: fmt.int(p.store), swatch: S.store},
                      {label: `${names[1]} · average per store`, value: fmt.dec1(p.region), swatch: S.region},
                      {label: 'Chain · average per store', value: fmt.dec1(p.chain), swatch: S.chain},
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="store" name={`${names[0]} count`} fill={S.store} maxBarSize={22} isAnimationActive={ANIMATE} />
            <Line dataKey="region" name={`${names[1]} average per store`} stroke={S.region} strokeWidth={2} dot={{r: 1.5}} isAnimationActive={ANIMATE} />
            <Line dataKey="chain" name="Chain average per store" stroke={S.chain} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={ANIMATE} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </VisualCard>
  );
}

function Ranking({rows, selectedId, onSelect, chain, uniqueRegion, regionOf, scope, benchNote}: {rows: Row[]; selectedId: string | null; onSelect: (id: string) => void; chain: number | null; uniqueRegion: string | null; regionOf: (id: string) => Benchmark | null; scope: Scope; benchNote: string}) {
  const ranked = rows.filter(r => r.turnover !== null).sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0) || a.number - b.number);
  const top = ranked.slice(0, RANK_LIMIT).map(r => ({id: r.id, name: r.name, v: r.turnover, region: r.region, regionV: regionOf(r.regionId)?.turnover ?? null}));
  const rank = selectedId ? ranked.findIndex(r => r.id === selectedId) + 1 : 0;
  const regionV = uniqueRegion ? (regionOf(uniqueRegion)?.turnover ?? null) : null;
  const regionName = uniqueRegion ? regionById.get(uniqueRegion)?.name : null;
  return (
    <VisualCard
      title="Store ranking by turnover rate"
      subtitle={`Showing ${top.length} of ${ranked.length} stores, highest turnover first. All stores are in the table below. A ranking for investigation, not a store rating: no thresholds are applied.`}
      filters={<VisualFilters scope={scope} notes={[benchNote, 'Select a bar to show the store in the trend charts; select it again to clear.']} />}
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
                    note="Select the bar to show this store's trends."
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
        Turnover is per selected time frame, not annualized. <DecisionChip ids={['D12', 'D13']} label="Rules open" align="left" />
      </p>
    </VisualCard>
  );
}
