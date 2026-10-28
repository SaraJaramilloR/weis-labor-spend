import {useMemo} from 'react';
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, IllustrativeChip, PageHeading} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {districtById, storeById} from '../data/org';
import {INCIDENT_TYPES} from '../data/people';
import {emptyLabor, rollup, type LaborTotals} from '../lib/aggregate';
import {benchmarkValue, perStoreAverage} from '../lib/benchmark';
import {attendanceRollup, averageProHours, laborForPeople, peopleFilterActive} from '../lib/laborPeople';
import {fmt} from '../lib/format';
import {headcountShare, otRate, turnoverRate, variancePct} from '../lib/metrics';
import {emptyPeople, peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, TipBox} from '../visuals/chartTheme';

const META = pageById.get('tracking')!;

type StoreRow = {id: string; name: string; district: string; p: PeopleTotals; hcAll: PeopleTotals; l: LaborTotals; incidents: number; pro: {ft: number | null; pt: number | null}};

const turnover = (r: StoreRow) => turnoverRate(r.p.terms, r.p.begin, r.p.end);
const ftShare = (r: StoreRow) => headcountShare(r.p.ftEnd, r.p.ftEnd, r.p.ptEnd);
const ot = (r: StoreRow) => otRate(r.l.otPay, r.l.otBasePay);
const vsProj = (r: StoreRow) => variancePct(r.l.hours, r.l.hoursProj);

export default function TrackingPage() {
  const scope = useScope('tracking');
  const {filters, update} = useReport();
  const noPeopleFilters = {dept: scope.dept, position: 'All', tenure: 'All', age: 'All', recruiter: 'All'};

  const peopleActive = peopleFilterActive(scope.people);
  const build = (stores: Set<string>): StoreRow[] => {
    const people = peopleRollup(stores, scope.people, scope.from, scope.to, 'store');
    const hcAll = peopleRollup(stores, noPeopleFilters, scope.from, scope.to, 'store');
    // People filters also apply to labor actuals (overtime, vacation, call-offs) through associate hours.
    const labor = peopleActive ? laborForPeople(stores, scope.dept, scope.from, scope.to, scope.people, 'store').totals : new Map([...rollup(stores, scope.dept, scope.from, scope.to, 'store')].map(([k, v]) => [k, v.labor]));
    const inc = attendanceRollup(stores, scope.people, scope.from, scope.to, 'store');
    return [...stores].map(id => {
      const s = storeById.get(id)!;
      const pro = averageProHours(new Set([id]), scope.dept, scope.from, scope.to, scope.people);
      return {id, name: s.name, district: districtById.get(s.districtId)?.name ?? '', p: people.get(id) ?? emptyPeople(), hcAll: hcAll.get(id) ?? emptyPeople(), l: labor.get(id) ?? emptyLabor(), incidents: inc.get(id) ?? 0, pro: {ft: pro.ft, pt: pro.pt}};
    });
  };
  const rows = useMemo(() => build(scope.stores), [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const chainRows = useMemo(() => build(scope.chain), [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (rs: StoreRow[]): StoreRow => {
    const p = emptyPeople();
    const h = emptyPeople();
    const l = emptyLabor();
    let incidents = 0;
    for (const r of rs) {
      (Object.keys(p) as (keyof PeopleTotals)[]).forEach(k => {
        p[k] += r.p[k];
        h[k] += r.hcAll[k];
      });
      (Object.keys(l) as (keyof LaborTotals)[]).forEach(k => (l[k] += r.l[k]));
      incidents += r.incidents;
    }
    return {id: 'sum', name: 'Total', district: '', p, hcAll: h, l, incidents, pro: {ft: null, pt: null}};
  };
  const tot = sum(rows);
  const chainTot = sum(chainRows);
  // Average Hours (workbook R31): average of row-level average productive hours, positive values only.
  const proTot = useMemo(() => averageProHours(scope.stores, scope.dept, scope.from, scope.to, scope.people), [scope]);
  const proChain = useMemo(() => averageProHours(scope.chain, scope.dept, scope.from, scope.to, scope.people), [scope]);
  tot.pro = {ft: proTot.ft, pt: proTot.pt};
  chainTot.pro = {ft: proChain.ft, pt: proChain.pt};
  const m = filters.benchmark;
  const bench = (kpi: (r: StoreRow) => number | null) => benchmarkValue(m, chainTot, chainRows, kpi);
  const perStore = (v: (r: StoreRow) => number) => perStoreAverage(v(chainTot), chainRows.length);
  const avgFt = (r: StoreRow) => r.pro.ft;
  const avgPt = (r: StoreRow) => r.pro.pt;
  const byType = useMemo(() => attendanceRollup(scope.stores, scope.people, scope.from, scope.to, 'type'), [scope]);
  const typeRows = INCIDENT_TYPES.map(t => ({type: t, count: byType.get(t) ?? 0}));
  const single = rows.length === 1;
  // Rates and shares: chain value. Counts and hours: chain average per store.
  const chainLine = (v: string) => ({label: 'Chain avg', value: v});
  const chainCount = (v: string) => ({label: single ? 'Chain avg' : 'Chain avg per store', value: v});

  const columns: Column<StoreRow>[] = [
    {key: 'name', header: 'Store', value: r => r.name, align: 'left'},
    {key: 'district', header: 'District', value: r => r.district, align: 'left'},
    {key: 'turnover', header: 'Turnover', value: turnover, render: r => fmt.pct(turnover(r)), group: 'People (Workday)'},
    {key: 'terms', header: 'Terms', value: r => r.p.terms, render: r => fmt.int(r.p.terms), group: 'People (Workday)'},
    {key: 'hires', header: 'Hires', value: r => r.p.hires, render: r => fmt.int(r.p.hires), group: 'People (Workday)'},
    {key: 'begin', header: 'Begin HC', value: r => r.p.begin, render: r => fmt.int(r.p.begin), group: 'People (Workday)'},
    {key: 'end', header: 'End HC', value: r => r.p.end, render: r => fmt.int(r.p.end), group: 'People (Workday)'},
    {key: 'ft', header: 'FT share', value: ftShare, render: r => fmt.pct(ftShare(r), 0), group: 'People (Workday)'},
    {key: 'otPay', header: 'OT $', value: r => r.l.otPay, render: r => fmt.money(r.l.otPay), group: 'Time & attendance (UKG)'},
    {key: 'otHrs', header: 'OT hrs', value: r => r.l.otHours, render: r => fmt.int(r.l.otHours), group: 'Time & attendance (UKG)'},
    {key: 'otRate', header: 'OT rate', sub: 'excl. RX', value: ot, render: r => fmt.pct(ot(r), 2), group: 'Time & attendance (UKG)'},
    {key: 'callHrs', header: 'Call-off hrs', sub: 'draft', value: r => r.l.hours - r.l.hoursProj, render: r => fmt.signedInt(r.l.hours - r.l.hoursProj), group: 'Time & attendance (UKG)'},
    {key: 'proj', header: 'Call-off %', sub: 'draft', value: vsProj, render: r => fmt.signedPct(vsProj(r)), group: 'Time & attendance (UKG)'},
    {key: 'inc', header: 'Incidents', sub: 'illustrative', value: r => r.incidents, render: r => fmt.int(r.incidents), group: 'Time & attendance (UKG)'},
    {key: 'avgFt', header: 'Avg hrs FT', sub: 'avg pro hours', value: avgFt, render: r => fmt.dec1(avgFt(r)), group: 'Time & attendance (UKG)'},
    {key: 'avgPt', header: 'Avg hrs PT', sub: 'avg pro hours', value: avgPt, render: r => fmt.dec1(avgPt(r)), group: 'Time & attendance (UKG)'},
    {key: 'vac', header: 'Vacation hrs', value: r => r.l.vacHours, render: r => fmt.int(r.l.vacHours), group: 'Time & attendance (UKG)'},
  ];
  const benchRow: StoreRow = chainTot;
  const benchColumns: Column<StoreRow>[] = columns.map(c => {
    const perStoreCols: Record<string, () => number | null> = {
      turnover: () => bench(turnover),
      terms: () => perStore(r => r.p.terms),
      hires: () => perStore(r => r.p.hires),
      begin: () => perStore(r => r.p.begin),
      end: () => perStore(r => r.p.end),
      ft: () => bench(ftShare),
      otPay: () => perStore(r => r.l.otPay),
      otHrs: () => perStore(r => r.l.otHours),
      otRate: () => bench(ot),
      proj: () => bench(vsProj),
      callHrs: () => perStore(r => r.l.hours - r.l.hoursProj),
      inc: () => perStore(r => r.incidents),
      avgFt: () => bench(avgFt),
      avgPt: () => bench(avgPt),
      vac: () => perStore(r => r.l.vacHours),
    };
    const f = perStoreCols[c.key];
    if (!f) return c;
    return {...c, value: (r: StoreRow) => (r.id === 'sum' ? f() : c.value(r)), render: (r: StoreRow) => (r.id === 'sum' ? fmtFor(c.key, f()) : c.render ? c.render(r) : null)};
  });

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question}>
        <span className="heading-label">Chain benchmark</span>
        <span className="heading-value">{m === 'weighted' ? 'Weighted (chain totals)' : 'Simple store average · exploratory'}</span>
        <DecisionChip ids={['D13', 'D28']} label="Benchmark rule open" />
      </PageHeading>
      <ScopeLine scope={scope} />
      {rows.length === 0 ? (
        <EmptyState>No stores in this selection. Use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid six" aria-label="People and attendance summary">
            <KpiCard level="primary" label="Turnover rate" value={fmt.pct(turnover(tot))} hint="Terminations / average headcount ((beginning + ending) / 2). Must match today's OPS 201 logic, still to be reviewed." decisions={['D12']} lines={[chainLine(fmt.pct(bench(turnover)))]} />
            <KpiCard level="primary" label="Terminations / hires" value={`${fmt.int(tot.p.terms)} / ${fmt.int(tot.p.hires)}`} lines={[chainCount(`${fmt.dec1(perStore(r => r.p.terms))} / ${fmt.dec1(perStore(r => r.p.hires))}`)]} />
            <KpiCard level="primary" label="Headcount begin → end" value={`${fmt.int(tot.p.begin)} → ${fmt.int(tot.p.end)}`} hint="Snapshots at the start and end of the time frame; never summed across weeks." lines={[chainCount(`${fmt.dec1(perStore(r => r.p.begin))} → ${fmt.dec1(perStore(r => r.p.end))}`)]} />
            <KpiCard label="FT / PT share" value={`${fmt.pct(ftShare(tot), 0)} / ${fmt.pct(headcountShare(tot.p.ptEnd, tot.p.ftEnd, tot.p.ptEnd), 0)}`} hint="Share of ending headcount (not hours)." lines={[chainLine(`${fmt.pct(bench(ftShare), 0)} FT`)]} />
            <KpiCard label="Average hours FT / PT" value={`${fmt.dec1(avgFt(tot))} / ${fmt.dec1(avgPt(tot))}`} hint="Workbook R31 (Ops 100 UKG FT / PT Average Pro Hours): average of the row-level average productive hours per associate (row = store × department × week), positive values only. Weekly hours per associate." decisions={['D23']} lines={[chainLine(`${fmt.dec1(bench(avgFt))} / ${fmt.dec1(bench(avgPt))}`)]} />
            <KpiCard label="Vacation hours" value={fmt.int(tot.l.vacHours)} decisions={['D17']} lines={[chainCount(fmt.int(perStore(r => r.l.vacHours)))]} />
            <KpiCard level="primary" label="Overtime $ (excl. RX)" value={fmt.compactMoney(tot.l.otPay)} decisions={['D03', 'D04']} lines={[{label: 'Hours', value: fmt.int(tot.l.otHours)}, chainCount(fmt.compactMoney(perStore(r => r.l.otPay)))]} />
            <KpiCard level="primary" label="Overtime rate (excl. RX)" value={fmt.pct(ot(tot), 2)} hint="OT $ / payroll $, both excluding Pharmacy. The OPS 102 0.5% criterion is not applied as a status." decisions={['D03']} lines={[chainLine(fmt.pct(bench(ot), 2))]} />
            <KpiCard level="primary" label="Call-off hours (draft)" value={fmt.signedInt(tot.l.hours - tot.l.hoursProj)} hint="Workbook draft (Ops 100 'Hours vs Proj Ct (Call Off)'): actual hours − projected (scheduled) hours. This hours variance is not an attendance-based absence rate: call-off events and partial absences are not identified." decisions={['D05']} lines={[chainCount(fmt.signedInt(perStore(r => r.l.hours - r.l.hoursProj)))]} />
            <KpiCard label="Attendance incidents" value={fmt.int(tot.incidents)} tag="Illustrative" decisions={['D22']} lines={[chainCount(fmt.dec1(perStore(r => r.incidents)))]} hint="Illustrative associate-level incident events (synthetic). All view filters apply; incidents count toward the associate's home department (D06). The incident calculation is still to be confirmed (D22)." />
            <KpiCard level="primary" label="Call-off % (draft)" value={fmt.signedPct(vsProj(tot))} hint="Workbook draft (Ops 100 'Hours vs Proj % (Call Off)'): (actual − projected hours) / projected hours. Not an attendance-based absence rate. The workbook's 2% opportunity flag is not applied as a rule." decisions={['D05']} lines={[chainLine(fmt.signedPct(bench(vsProj)))]} />
          </section>

          <VisualCard
            title="Store tracking with chain average"
            subtitle={`First row: chain ${m === 'weighted' ? 'value from chain totals' : 'simple average of store values'}; counts are averages per store. Select a store to filter the report.`}
            filters={<VisualFilters scope={scope} notes={['Position, Tenure, Age Range and Recruiter apply to people measures, to labor actuals (overtime, vacation, call-offs) through associate hours, and to the illustrative attendance events.', 'The chain benchmark ignores location filters and keeps the time frame, department, people filters and ID Stores toggle.']} />}
          >
            <DataTable rows={rows} columns={benchColumns} rowKey={r => r.id} label="Store tracking" searchText={r => `${r.name} ${r.district}`} pinned={[benchRow]} pinnedLabel={() => `Chain average · ${m === 'weighted' ? 'weighted' : 'simple'}`} onRowClick={r => update({store: r.id})} selectedKey={filters.store} initialSort={{key: 'turnover', dir: 'desc'}} exportName="turnover-overtime-calloff-by-store" />
          </VisualCard>

          <VisualCard title="Attendance incidents by type" subtitle="Illustrative associate-level events; all view filters apply (home-department attribution)." actions={<><IllustrativeChip /><DecisionChip ids={['D22']} label="Calculation open" /></>} filters={<VisualFilters scope={scope} notes={['Illustrative associate-level events. Department uses the associate home department (D06); Tenure is evaluated at the event week. The incident calculation is open (D22).']} />}>
            <div className="chart-h220">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeRows} layout="vertical" margin={{top: 4, right: 16, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="type" tick={AXIS} width={190} interval={0} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.type} rows={[{label: 'Incidents', value: fmt.int(payload[0].payload.count)}]} /> : null)} />
                  <Bar dataKey="count" fill={C.above} isAnimationActive={ANIMATE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </VisualCard>
        </>
      )}
    </div>
  );
}

function fmtFor(key: string, v: number | null): string {
  if (key === 'turnover') return fmt.pct(v);
  if (key === 'ft') return fmt.pct(v, 0);
  if (key === 'otRate') return fmt.pct(v, 2);
  if (key === 'proj') return fmt.signedPct(v);
  if (key === 'callHrs') return fmt.signedDec1(v);
  if (key === 'otPay') return fmt.money(v);
  return fmt.dec1(v);
}
