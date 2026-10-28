// Workbook view R64 "Turnover & Retention Benchmark" (User Story 3): turnover rate, retention rate, terminations,
// hires and beginning / ending headcount by store over time, with chain-wide and region-wide averages.
import {useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {RateVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {LAST_WEEK_IDX, WEEKS} from '../data/calendar';
import {REGIONS, regionById, storeById} from '../data/org';
import {benchmarkValue, perStoreAverage} from '../lib/benchmark';
import {fmt} from '../lib/format';
import {ppDiff, retentionRate, turnoverRate} from '../lib/metrics';
import {emptyPeople, peopleRollup, periodsIn, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('benchmark')!;
const turnover = (p: PeopleTotals) => turnoverRate(p.terms, p.begin, p.end);
const retention = (p: PeopleTotals) => retentionRate(p.begin, p.termsOfBeginning);
const sumPeople = (list: PeopleTotals[]) =>
  list.reduce((a, b) => {
    const out = {...a};
    (Object.keys(out) as (keyof PeopleTotals)[]).forEach(k => (out[k] += b[k]));
    return out;
  }, emptyPeople());

type Row = {id: string; name: string; region: string; regionId: string; p: PeopleTotals};
type Measure = 'turnover' | 'retention' | 'terms' | 'hires' | 'begin' | 'end';
const MEASURES: {id: Measure; label: string; rate: boolean}[] = [
  {id: 'turnover', label: 'Turnover rate', rate: true},
  {id: 'retention', label: 'Retention rate', rate: true},
  {id: 'terms', label: 'Terminations', rate: false},
  {id: 'hires', label: 'Hires', rate: false},
  {id: 'begin', label: 'Beginning headcount', rate: false},
  {id: 'end', label: 'Ending headcount', rate: false},
];
const COLORS_REGION = ['#b79a76', '#7a8f99', '#a07aa5'];

/** Value of a measure for a group of stores: rates from totals (or simple average); counts as per-store averages. */
function groupValue(m: Measure, method: 'weighted' | 'simple', list: PeopleTotals[]): number | null {
  if (m === 'turnover') return benchmarkValue(method, sumPeople(list), list, turnover);
  if (m === 'retention') return benchmarkValue(method, sumPeople(list), list, retention);
  return perStoreAverage(list.reduce((s, p) => s + p[m], 0), list.length);
}
const fmtMeasure = (m: Measure, v: number | null) => (m === 'turnover' || m === 'retention' ? fmt.pct(v) : fmt.dec1(v));
const storeValue = (ms: Measure, p: PeopleTotals) => (ms === 'turnover' ? turnover(p) : ms === 'retention' ? retention(p) : p[ms]);

export default function BenchmarkPage() {
  const scope = useScope('benchmark');
  const {filters} = useReport();
  const m = filters.benchmark;
  const [highlight, setHighlight] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>('turnover');
  const measureMeta = MEASURES.find(x => x.id === measure)!;

  const storeTotals = useMemo(() => peopleRollup(scope.chain, scope.people, scope.from, scope.to, 'store'), [scope]);
  const chainRows: Row[] = [...scope.chain].map(id => {
    const s = storeById.get(id)!;
    return {id, name: s.name, region: regionById.get(s.regionId)?.name ?? '', regionId: s.regionId, p: storeTotals.get(id) ?? emptyPeople()};
  });
  const rows = chainRows.filter(r => scope.stores.has(r.id));
  const sel = sumPeople(rows.map(r => r.p));
  const chainList = chainRows.map(r => r.p);
  const regionList = (regionId: string) => chainRows.filter(r => r.regionId === regionId).map(r => r.p);
  const regionIds = REGIONS.map(r => r.id).filter(id => rows.some(r => r.regionId === id));
  const chainTurnover = groupValue('turnover', m, chainList);
  const chainRetention = groupValue('retention', m, chainList);
  const regionValue = (regionId: string, ms: Measure) => groupValue(ms, m, regionList(regionId));

  // Benchmark rows (chain and each region in scope) for every view KPI. Counts are averages per store.
  const benchRows: Row[] = [
    {id: 'chain', name: `Chain average · ${m}`, region: '', regionId: '', p: emptyPeople()},
    ...regionIds.map(id => ({id: `region-${id}`, name: `${regionById.get(id)?.name} average · ${m}`, region: regionById.get(id)?.name ?? '', regionId: id, p: emptyPeople()})),
  ];
  const isBench = (r: Row) => r.id === 'chain' || r.id.startsWith('region-');
  const valueOf = (r: Row, ms: Measure) => (r.id === 'chain' ? groupValue(ms, m, chainList) : isBench(r) ? regionValue(r.regionId, ms) : storeValue(ms, r.p));

  // Trend: the 13 reporting periods that end with the selected time frame.
  const trendTo = scope.to;
  const trendFrom = Math.max(0, periodStartBack(trendTo, 13));
  const trend = useMemo(() => {
    return periodsIn(trendFrom, trendTo).map(p => {
      const byStore = peopleRollup(scope.chain, scope.people, p.from, p.to, 'store');
      const list = (pred: (id: string) => boolean) => [...byStore.entries()].filter(([id]) => pred(id)).map(([, v]) => v);
      const point: Record<string, number | string | null> = {
        label: p.label,
        selection: groupValue(measure, 'weighted', list(id => scope.stores.has(id))),
        chain: groupValue(measure, m, list(() => true)),
      };
      for (const r of regionIds) point[r] = groupValue(measure, m, list(id => storeById.get(id)?.regionId === r));
      if (highlight && scope.chain.has(highlight)) point.store = groupValue(measure, 'weighted', list(id => id === highlight));
      return point;
    });
  }, [scope, m, highlight, measure, trendFrom, trendTo, regionIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = [...rows].map(r => ({id: r.id, name: r.name, v: turnover(r.p)})).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
  const countColumn = (key: Measure, header: string): Column<Row> => ({key, header, value: r => valueOf(r, key), render: r => (isBench(r) ? fmt.dec1(valueOf(r, key)) : fmt.int(valueOf(r, key)))});
  const rateColumn = (key: Measure, header: string): Column<Row> => ({key, header, value: r => valueOf(r, key), render: r => fmt.pct(valueOf(r, key))});
  const diffColumn = (key: string, ms: Measure, target: (r: Row) => number | null): Column<Row> => ({key, header: key.endsWith('Region') ? 'vs region' : 'vs chain', value: r => (isBench(r) ? null : ppDiff(storeValue(ms, r.p), target(r))), render: r => (isBench(r) ? '' : <RateVar actual={storeValue(ms, r.p)} target={target(r)} />)});
  const columns: Column<Row>[] = [
    {key: 'name', header: 'Store', value: r => r.name, align: 'left'},
    {key: 'region', header: 'Region', value: r => r.region, align: 'left'},
    countColumn('begin', 'Begin HC'),
    countColumn('end', 'End HC'),
    countColumn('hires', 'Hires'),
    countColumn('terms', 'Terms'),
    rateColumn('turnover', 'Turnover'),
    diffColumn('turnoverVsChain', 'turnover', () => chainTurnover),
    diffColumn('turnoverVsRegion', 'turnover', r => regionValue(r.regionId, 'turnover')),
    rateColumn('retention', 'Retention'),
    diffColumn('retentionVsChain', 'retention', () => chainRetention),
    diffColumn('retentionVsRegion', 'retention', r => regionValue(r.regionId, 'retention')),
  ];
  const singleRegion = regionIds.length === 1 ? regionIds[0] : null;
  const regionLine = (ms: Measure) => (singleRegion ? [{label: `${regionById.get(singleRegion)?.name}${measureIsRate(ms) || rows.length === 1 ? '' : ' per store'}`, value: fmtMeasure(ms, regionValue(singleRegion, ms))}] : []);
  const per = rows.length === 1 ? '' : ' per store';

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question}>
        <span className="heading-label">Benchmark</span>
        <span className="heading-value">{m === 'weighted' ? 'Weighted (chain totals)' : 'Simple store average · exploratory'}</span>
        <DecisionChip ids={['D13', 'D28']} label="Benchmark rule open" />
      </PageHeading>
      <ScopeLine scope={scope} />
      {rows.length === 0 ? (
        <EmptyState>No stores in this selection. Use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid six" aria-label="Turnover and retention summary">
            <KpiCard level="primary" label="Turnover rate" value={fmt.pct(turnover(sel))} decisions={['D12']} hint="Terminations / average headcount for the time frame (not annualized)." lines={[{label: 'Chain', value: fmt.pct(chainTurnover)}, ...regionLine('turnover'), {label: 'vs chain', value: <RateVar actual={turnover(sel)} target={chainTurnover} />}]} />
            <KpiCard level="primary" label="Retention rate" value={fmt.pct(retention(sel))} decisions={['D27']} hint="(Beginning headcount − terminations of those associates) / beginning headcount. Workbook draft; business definition needed." lines={[{label: 'Chain', value: fmt.pct(chainRetention)}, ...regionLine('retention'), {label: 'vs chain', value: <RateVar actual={retention(sel)} target={chainRetention} />}]} />
            <KpiCard label="Terminations" value={fmt.int(sel.terms)} lines={[{label: `Chain avg${per}`, value: fmt.dec1(groupValue('terms', m, chainList))}, ...regionLine('terms')]} />
            <KpiCard label="Hires" value={fmt.int(sel.hires)} lines={[{label: `Chain avg${per}`, value: fmt.dec1(groupValue('hires', m, chainList))}, ...regionLine('hires')]} />
            <KpiCard label="Beginning headcount" value={fmt.int(sel.begin)} hint="Snapshot on the day before the time frame starts." lines={[{label: `Chain avg${per}`, value: fmt.dec1(groupValue('begin', m, chainList))}, ...regionLine('begin')]} />
            <KpiCard label="Ending headcount" value={fmt.int(sel.end)} hint="Snapshot on the last day of the time frame." lines={[{label: `Chain avg${per}`, value: fmt.dec1(groupValue('end', m, chainList))}, ...regionLine('end')]} />
          </section>
          <p className="note">Region averages appear on the cards when one region is in scope. The trend and the table show the chain and every region in scope.</p>

          <VisualCard
            title={`${measureMeta.label} by period vs chain and region`}
            subtitle={`13 reporting periods ending ${fmtWeekEnd(trendTo)}. ${measureMeta.rate ? 'Rates are per period (not annualized).' : 'Counts are averages per store, so groups of different size compare fairly.'}`}
            actions={<Segmented label="Measure over time" value={measure} options={MEASURES.map(x => ({id: x.id, label: x.label}))} onChange={setMeasure} size="sm" />}
            filters={<VisualFilters scope={scope} notes={['Benchmarks ignore location filters and keep the time frame, people filters and ID Stores toggle.', highlight ? `Highlighted store: ${storeById.get(highlight)?.name}.` : 'Select a store bar or table row to add its line.']} />}
          >
            <ChartKey items={[{label: rows.length === 1 ? rows[0].name : 'Selection', color: C.actual, kind: 'line'}, {label: `Chain (${m})`, color: C.reference, kind: 'line'}, ...regionIds.map((r, i) => ({label: `${regionById.get(r)?.name} (${m})`, color: COLORS_REGION[i % 3], kind: 'line' as const})), ...(highlight ? [{label: storeById.get(highlight)?.name ?? '', color: C.sales, kind: 'line' as const}] : [])]} />
            <div className="chart-h280">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{top: 8, right: 36, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} interval={0} />
                  <YAxis tick={AXIS} width={56} tickFormatter={v => (measureMeta.rate ? fmt.pct(v, 1) : fmt.dec1(v))} domain={measure === 'retention' || measure === 'begin' || measure === 'end' ? ['auto', 'auto'] : [0, 'auto']} />
                  <Tooltip
                    content={({active, payload}) => {
                      const p = active && payload?.[0]?.payload;
                      if (!p) return null;
                      const f = (v: unknown) => fmtMeasure(measure, typeof v === 'number' ? v : null);
                      return <TipBox title={String(p.label)} rows={[{label: 'Selection', value: f(p.selection), swatch: C.actual}, {label: 'Chain', value: f(p.chain), swatch: C.reference}, ...regionIds.map((r, i) => ({label: regionById.get(r)?.name ?? r, value: f(p[r]), swatch: COLORS_REGION[i % 3]})), ...(p.store !== undefined ? [{label: storeById.get(highlight ?? '')?.name ?? 'Store', value: f(p.store), swatch: C.sales}] : [])]} />;
                    }}
                  />
                  <Line dataKey="selection" stroke={C.actual} strokeWidth={2.5} dot={{r: 2}} isAnimationActive={ANIMATE} />
                  <Line dataKey="chain" stroke={C.reference} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                  {regionIds.map((r, i) => (
                    <Line key={r} dataKey={r} stroke={COLORS_REGION[i % 3]} strokeWidth={1.5} dot={false} isAnimationActive={ANIMATE} />
                  ))}
                  {highlight ? <Line dataKey="store" stroke={C.sales} strokeWidth={2} dot={{r: 2}} isAnimationActive={ANIMATE} /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </VisualCard>

          <VisualCard title="Turnover by store vs chain" subtitle="Select a bar to highlight the store in the trend; select it again to clear." filters={<VisualFilters scope={scope} />}>
            <div className="chart-h280">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="name" tick={false} label={{value: `${bars.length} stores, highest turnover first`, position: 'insideBottom', fontSize: 11, fill: C.axis}} height={24} />
                  <YAxis tick={AXIS} width={52} tickFormatter={v => fmt.pct(v, 1)} />
                  <ReferenceLine y={chainTurnover ?? 0} stroke={C.benchmark} strokeDasharray="4 3" label={{value: `Chain ${fmt.pct(chainTurnover)}`, position: 'insideTopRight', fontSize: 11, fill: C.axis}} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.name} rows={[{label: 'Turnover', value: fmt.pct(payload[0].payload.v)}, {label: 'vs chain', value: fmt.pp(ppDiff(payload[0].payload.v, chainTurnover))}]} /> : null)} />
                  <Bar dataKey="v" isAnimationActive={ANIMATE} cursor="pointer" onClick={(d: {id?: string}) => d?.id && setHighlight(h => (h === d.id ? null : d.id!))}>
                    {bars.map(b => (
                      <Cell key={b.id} fill={highlight === b.id ? C.highlight : C.comparison} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </VisualCard>

          <VisualCard title="Store benchmark table" subtitle="First rows: chain and region averages (counts are per store). Rate differences are in percentage points." filters={<VisualFilters scope={scope} />}>
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="Store turnover and retention benchmark" searchText={r => `${r.name} ${r.region}`} pinned={benchRows} pinnedLabel={r => r.name} onRowClick={r => setHighlight(h => (h === r.id ? null : r.id))} selectedKey={highlight} initialSort={{key: 'turnover', dir: 'desc'}} exportName="turnover-retention-benchmark" />
          </VisualCard>
        </>
      )}
    </div>
  );
}

const measureIsRate = (m: Measure) => m === 'turnover' || m === 'retention';

/** Week index where the period `n` periods back (inclusive of the current one) starts. */
function periodStartBack(to: number, n: number): number {
  let count = 0;
  let w = to;
  let current = `${WEEKS[to].fy}-${WEEKS[to].period}`;
  while (w > 0) {
    const key = `${WEEKS[w - 1].fy}-${WEEKS[w - 1].period}`;
    if (key !== current) {
      count++;
      if (count >= n) return w;
      current = key;
    }
    w--;
  }
  return 0;
}

const fmtWeekEnd = (idx: number) => {
  const w = WEEKS[Math.min(idx, LAST_WEEK_IDX)];
  return `FY${w.fy} W${String(w.week).padStart(2, '0')}`;
};
