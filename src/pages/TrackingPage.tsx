// Workbook view R63 "Turnover, Overtime & Call-off Tracking" (User Story 2). Oct 28 review: a store row expands to its
// departments. Each measure keeps its own department attribution: people measures and attendance incidents by the
// associate's home department; hours, overtime, call-off hours and vacation by the department where the hours were
// recorded (Ops 100 store × department rows). The home-versus-worked department rule is an assumption (D06).
import {useMemo} from 'react';
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, IllustrativeChip, InfoTip, PageHeading} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DEPARTMENTS, districtById, storeById, storeHasDept, type DeptId} from '../data/org';
import {INCIDENT_TYPES} from '../data/people';
import {ATTENDANCE_SOURCE_NOTE, INCIDENT_LABEL} from '../config/attendance';
import {emptyLabor, rollup, type LaborTotals} from '../lib/aggregate';
import {ALL} from '../lib/filters';
import {benchmarkValue, perStoreAverage} from '../lib/benchmark';
import {attendanceRollup, averageProHours, averageProHoursBy, laborForPeople, peopleFilterActive} from '../lib/laborPeople';
import {fmt} from '../lib/format';
import {headcountShare, otRate, turnoverRate, variancePct} from '../lib/metrics';
import {emptyPeople, peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, TipBox} from '../visuals/chartTheme';

const META = pageById.get('tracking')!;

/** Card and column tooltips: full name, meaning, formula, unit, time frame and limitations. */
const HELP = {
  turnover: 'Turnover rate, % = Terminations / average headcount, average headcount = (beginning + ending headcount) / 2, for the selected time frame. Draft until OPS 201 is reviewed (D12).',
  terms: 'Terminations: number of associates whose employment ended in the time frame (count of events).',
  hires: 'Hires: number of associates hired in the time frame (count of events). Independent of terminations; not a ratio.',
  begin: 'Beginning headcount: active associates the day before the time frame starts (snapshot).',
  end: 'Ending headcount: active associates on the last day of the time frame (snapshot). Ending = Beginning + Hires − Terminations for the same population.',
  ft: 'Full-time share of ending headcount, % = FT associates / (FT + PT associates). Headcount based, not hours. The part-time share is 100 % minus this value.',
  otPay: 'Overtime (OT) $: overtime pay, excluding Pharmacy (RX). Whether the source field is the full overtime pay or only the premium is open (D04).',
  otHrs: 'Overtime (OT) hours worked, excluding Pharmacy (RX).',
  otRate: 'Overtime rate, % of payroll dollars. Numerator: overtime $ of all departments except Pharmacy (RX). Denominator: total payroll $ (labor spend) of the same departments, also excluding Pharmacy. Both are dollars, not hours. Ops 100 "OT Less RX Rate" = OT Less RX OT $ / OT Less RX Pay. No 0.5 % status rule is applied (D03).',
  callHrs: 'Call-off hours (draft) = actual hours − projected (scheduled) hours. Ops 100 "Hours vs Proj Ct (Call Off)". A negative value means fewer hours were worked than projected. It is an hours variance, not a count of call-offs or an absence rate (D05).',
  proj: 'Call-off % (draft) = (actual hours − projected hours) / projected hours. Ops 100 "Hours vs Proj % (Call Off)". Not an attendance-based absence rate; the 2 % opportunity flag is not applied (D05).',
  inc: 'Attendance incidents: count of illustrative associate-level events of the six incident categories listed in workbook R41 (late arrivals "Late In >15", more than half of shift not worked, unpaid absence timecard / exception, no call no show, unpaid sick time). Counted toward the associate home department (D06). The calculation is open (D22); availability after the move to Workday is open (D35).',
  avgFt: 'Average weekly hours per full-time associate. Calculated as in the workbook draft (Ops 100 "UKG FT Average Pro Hours"): for each store × department × week, FT hours / active FT associates; then the simple average of those row values (positive values only). Rows are not weighted by headcount, so it is not exactly total FT hours / FT associates (D23).',
  avgPt: 'Average weekly hours per part-time associate. Same method as FT: simple average of store × department × week averages, positive values only (D23).',
  avgCard: 'Workbook "Average hours per employee", calculated as the Ops 100 draft (UKG FT / PT Average Pro Hours): for each store × department × week, hours of the employment type / its active associates; then the simple average of those row values, positive values only. Unit: hours per associate per week, for the weeks in the time frame. Not weighted by headcount (D23).',
  vac: 'Vacation hours: total in the time frame for the stores, departments and associates in scope; shown separately from actual hours (D17). Weekly data: a custom range is reported as whole weeks.',
} as const;

/** A store row (dept = null) or one department of a store. `children`: department rows of a store in scope. */
type StoreRow = {id: string; name: string; district: string; dept: DeptId | null; p: PeopleTotals; l: LaborTotals; incidents: number; pro: {ft: number | null; pt: number | null}; children: StoreRow[]};

const turnover = (r: StoreRow) => turnoverRate(r.p.terms, r.p.begin, r.p.end);
const ftShare = (r: StoreRow) => headcountShare(r.p.ftEnd, r.p.ftEnd, r.p.ptEnd);
const ot = (r: StoreRow) => otRate(r.l.otPay, r.l.otBasePay);
const vsProj = (r: StoreRow) => variancePct(r.l.hours, r.l.hoursProj);
/** Pharmacy is outside the overtime scope: its department row shows "Out of OT scope", not 0. */
const noOt = (r: StoreRow) => r.dept === 'rx';

export default function TrackingPage() {
  const scope = useScope('tracking');
  const {filters, update} = useReport();
  const peopleActive = peopleFilterActive(scope.people);
  const laborBy = (stores: Set<string>, g: 'store' | 'storeDept') =>
    peopleActive ? laborForPeople(stores, scope.dept, scope.from, scope.to, scope.people, g).totals : new Map([...rollup(stores, scope.dept, scope.from, scope.to, g)].map(([k, v]) => [k, v.labor]));
  /** Store rows; with `withDepts`, each store also gets its department rows (only departments with activity). */
  const build = (stores: Set<string>, withDepts: boolean): StoreRow[] => {
    const people = peopleRollup(stores, scope.people, scope.from, scope.to, 'store');
    // People filters also apply to labor actuals (overtime, vacation, call-offs) through associate hours.
    const labor = laborBy(stores, 'store');
    const inc = attendanceRollup(stores, scope.people, scope.from, scope.to, 'store');
    const pro = averageProHoursBy(stores, scope.dept, scope.from, scope.to, scope.people, 'store');
    const d = withDepts
      ? {people: peopleRollup(stores, scope.people, scope.from, scope.to, 'storeDept'), labor: laborBy(stores, 'storeDept'), inc: attendanceRollup(stores, scope.people, scope.from, scope.to, 'storeDept'), pro: averageProHoursBy(stores, scope.dept, scope.from, scope.to, scope.people, 'storeDept')}
      : null;
    return [...stores].map(id => {
      const s = storeById.get(id)!;
      const children: StoreRow[] = d
        ? DEPARTMENTS.filter(x => storeHasDept(s, x.id) && (scope.dept === ALL || x.id === scope.dept)).flatMap(x => {
            const k = `${id}|${x.id}`;
            const p = d.people.get(k) ?? emptyPeople();
            const l = d.labor.get(k);
            if (!l && p.begin + p.end + p.hires + p.terms === 0) return [];
            const pr = d.pro.get(k);
            return [{id: k, name: x.name, district: '', dept: x.id, p, l: l ?? emptyLabor(), incidents: d.inc.get(k) ?? 0, pro: {ft: pr?.ft ?? null, pt: pr?.pt ?? null}, children: []}];
          })
        : [];
      const pr = pro.get(id);
      return {id, name: s.name, district: districtById.get(s.districtId)?.name ?? '', dept: null, p: people.get(id) ?? emptyPeople(), l: labor.get(id) ?? emptyLabor(), incidents: inc.get(id) ?? 0, pro: {ft: pr?.ft ?? null, pt: pr?.pt ?? null}, children};
    });
  };
  const rows = useMemo(() => build(scope.stores, true), [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const chainRows = useMemo(() => build(scope.chain, false), [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (rs: StoreRow[]): StoreRow => {
    const p = emptyPeople();
    const l = emptyLabor();
    let incidents = 0;
    for (const r of rs) {
      (Object.keys(p) as (keyof PeopleTotals)[]).forEach(k => (p[k] += r.p[k]));
      (Object.keys(l) as (keyof LaborTotals)[]).forEach(k => (l[k] += r.l[k]));
      incidents += r.incidents;
    }
    return {id: 'sum', name: 'Total', district: '', dept: null, p, l, incidents, pro: {ft: null, pt: null}, children: []};
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
  const typeRows = INCIDENT_TYPES.map(t => ({type: t, label: INCIDENT_LABEL[t].label, help: INCIDENT_LABEL[t].help, count: byType.get(t) ?? 0}));
  const single = rows.length === 1;
  // Rates and shares: chain value. Counts and hours: chain average per store.
  const chainLine = (v: string) => ({label: 'Chain avg', value: v});
  const chainCount = (v: string) => ({label: single ? 'Chain avg' : 'Chain avg per store', value: v});

  const columns: Column<StoreRow>[] = [
    {key: 'name', header: 'Store / Department', value: r => r.name, render: r => (r.dept ? r.name : <>{r.name}<span className="cell-sub">{r.district}</span></>), align: 'left'},
    {key: 'turnover', header: 'Turnover rate', sub: '%', help: HELP.turnover, value: turnover, render: r => fmt.pct(turnover(r)), group: 'People (Workday)'},
    {key: 'terms', header: 'Terminations', sub: 'count', help: HELP.terms, value: r => r.p.terms, render: r => fmt.int(r.p.terms), group: 'People (Workday)'},
    {key: 'hires', header: 'Hires', sub: 'count', help: HELP.hires, value: r => r.p.hires, render: r => fmt.int(r.p.hires), group: 'People (Workday)'},
    {key: 'begin', header: 'Beginning headcount', help: HELP.begin, value: r => r.p.begin, render: r => fmt.int(r.p.begin), group: 'People (Workday)'},
    {key: 'end', header: 'Ending headcount', help: HELP.end, value: r => r.p.end, render: r => fmt.int(r.p.end), group: 'People (Workday)'},
    {key: 'ft', header: 'Full-time (%)', sub: 'of ending headcount', help: HELP.ft, value: ftShare, render: r => fmt.pct(ftShare(r), 0), group: 'People (Workday)'},
    {key: 'otPay', header: 'Overtime $', help: HELP.otPay, value: r => (noOt(r) ? null : r.l.otPay), render: r => (noOt(r) ? <span className="na">Out of OT scope</span> : fmt.money(r.l.otPay)), group: 'Time & attendance (UKG)'},
    {key: 'otHrs', header: 'Overtime hours', help: HELP.otHrs, value: r => (noOt(r) ? null : r.l.otHours), render: r => (noOt(r) ? <span className="na">—</span> : fmt.int(r.l.otHours)), group: 'Time & attendance (UKG)'},
    {key: 'otRate', header: 'Overtime rate', sub: '% of payroll $, excl. Pharmacy', help: HELP.otRate, value: r => (noOt(r) ? null : ot(r)), render: r => (noOt(r) ? <span className="na">—</span> : fmt.pct(ot(r), 2)), group: 'Time & attendance (UKG)'},
    {key: 'callHrs', header: 'Call-off hours', sub: 'draft · vs projected', help: HELP.callHrs, value: r => r.l.hours - r.l.hoursProj, render: r => fmt.signedInt(r.l.hours - r.l.hoursProj), group: 'Time & attendance (UKG)'},
    {key: 'proj', header: 'Call-off %', sub: 'draft · vs projected', help: HELP.proj, value: vsProj, render: r => fmt.signedPct(vsProj(r)), group: 'Time & attendance (UKG)'},
    {key: 'inc', header: 'Attendance incidents', sub: 'illustrative', help: HELP.inc, value: r => r.incidents, render: r => fmt.int(r.incidents), group: 'Time & attendance (UKG)'},
    {key: 'avgFt', header: 'Avg weekly hours FT', sub: 'per associate · row avg', help: HELP.avgFt, value: avgFt, render: r => fmt.dec1(avgFt(r)), group: 'Time & attendance (UKG)'},
    {key: 'avgPt', header: 'Avg weekly hours PT', sub: 'per associate · row avg', help: HELP.avgPt, value: avgPt, render: r => fmt.dec1(avgPt(r)), group: 'Time & attendance (UKG)'},
    {key: 'vac', header: 'Vacation hours', help: HELP.vac, value: r => r.l.vacHours, render: r => fmt.int(r.l.vacHours), group: 'Time & attendance (UKG)'},
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
            <KpiCard level="primary" label="Turnover rate" value={fmt.pct(turnover(tot))} hint="Terminations / average headcount, where average headcount = (beginning + ending headcount) / 2, for the time frame. Must match today's OPS 201 logic, still to be reviewed." decisions={['D12']} lines={[chainLine(fmt.pct(bench(turnover)))]} />
            <KpiCard
              level="primary"
              label="Terminations & hires"
              value={
                <span className="dual-value">
                  <span className="nowrap">
                    {fmt.int(tot.p.terms)} <small>Terminations</small>
                  </span>{' '}
                  ·{' '}
                  <span className="nowrap">
                    {fmt.int(tot.p.hires)} <small>Hires</small>
                  </span>
                </span>
              }
              hint="Two independent counts of events in the time frame, not a ratio: associates who left (terminations) and associates who joined (hires). In a stable store hires replace leavers, so the two counts are close; they differ when a store is growing or reducing staff."
              lines={[{label: 'Net change (hires − terminations)', value: fmt.signedInt(tot.p.hires - tot.p.terms)}, {label: single ? 'Chain avg terminations' : 'Chain avg terminations per store', value: fmt.dec1(perStore(r => r.p.terms))}, {label: single ? 'Chain avg hires' : 'Chain avg hires per store', value: fmt.dec1(perStore(r => r.p.hires))}]}
            />
            <KpiCard
              level="primary"
              label="Beginning → ending headcount"
              value={`${fmt.int(tot.p.begin)} → ${fmt.int(tot.p.end)}`}
              hint="Active associates the day before the time frame starts and on its last day (snapshots, never summed across weeks). For the same population, Ending = Beginning + Hires − Terminations. With a Tenure filter, associates move between tenure bands during the time frame, shown as other movements."
              lines={[{label: 'Beginning + hires − terminations', value: fmt.int(tot.p.begin + tot.p.hires - tot.p.terms)}, {label: 'Other movements', value: fmt.signedInt(tot.p.end - (tot.p.begin + tot.p.hires - tot.p.terms))}, chainCount(`${fmt.dec1(perStore(r => r.p.begin))} → ${fmt.dec1(perStore(r => r.p.end))}`)]}
            />
            <KpiCard label="FT / PT Ratio" value={`${fmt.pct(ftShare(tot), 0)} / ${fmt.pct(headcountShare(tot.p.ptEnd, tot.p.ftEnd, tot.p.ptEnd), 0)}`} hint="Share of ending headcount (not hours)." lines={[chainLine(`${fmt.pct(bench(ftShare), 0)} FT`)]} />
            <KpiCard
              label="Average hours per employee (FT / PT)"
              tag="Weekly · average of row averages"
              value={`${fmt.dec1(avgFt(tot))} / ${fmt.dec1(avgPt(tot))}`}
              hint={HELP.avgCard}
              decisions={['D23']}
              lines={[chainLine(`${fmt.dec1(bench(avgFt))} / ${fmt.dec1(bench(avgPt))}`)]}
            />
            <KpiCard label="Vacation hours" value={fmt.int(tot.l.vacHours)} hint={HELP.vac} decisions={['D17']} lines={[chainCount(fmt.int(perStore(r => r.l.vacHours)))]} />
            <KpiCard level="primary" label="Overtime $ (excl. Pharmacy)" value={fmt.compactMoney(tot.l.otPay)} hint={HELP.otPay} decisions={['D03', 'D04']} lines={[{label: 'Overtime hours', value: fmt.int(tot.l.otHours)}, chainCount(fmt.compactMoney(perStore(r => r.l.otPay)))]} />
            <KpiCard level="primary" label="Overtime Rate (% of Payroll $, excl. Pharmacy)" value={fmt.pct(ot(tot), 2)} hint={HELP.otRate} decisions={['D03', 'D04', 'D33']} lines={[chainLine(fmt.pct(bench(ot), 2))]} />
            <KpiCard level="primary" label="Call-off hours (draft)" value={fmt.signedInt(tot.l.hours - tot.l.hoursProj)} hint={HELP.callHrs} decisions={['D05']} lines={[chainCount(fmt.signedInt(perStore(r => r.l.hours - r.l.hoursProj)))]} />
            <KpiCard label="Attendance incidents" value={fmt.int(tot.incidents)} tag="Illustrative" decisions={['D22', 'D35']} lines={[chainCount(fmt.dec1(perStore(r => r.incidents)))]} hint={HELP.inc} />
            <KpiCard level="primary" label="Call-off % (draft)" value={fmt.signedPct(vsProj(tot))} hint={HELP.proj} decisions={['D05']} lines={[chainLine(fmt.signedPct(bench(vsProj)))]} />
          </section>

          <VisualCard
            title="Store tracking with chain average"
            subtitle={`First row: chain benchmark (${m === 'weighted' ? 'value from chain totals' : 'simple average of store values'}; counts are averages per store), not a total. Select + to see a store's departments; select a store name to filter the report.`}
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  'Position, Tenure, Age Range and Recruiter apply to people measures, to labor actuals (overtime, vacation, call-offs) through associate hours, and to the illustrative attendance events.',
                  'The chain benchmark ignores location filters and keeps the time frame, department, people filters and ID Stores toggle. It compares stores: department rows have no benchmark.',
                  `Department rows: ${DEPT_NOTE}`,
                ]}
              />
            }
          >
            <p className="table-scope">
              <b>Department rows:</b> {DEPT_NOTE} <DecisionChip ids={['D06']} label="Open" align="left" />
            </p>
            <DataTable
              rows={rows}
              columns={benchColumns}
              rowKey={r => r.id}
              label="Store tracking"
              searchText={r => (r.dept ? r.name : `${r.name} ${r.district}`)}
              searchPlaceholder="Search store, district or department…"
              countNoun="stores"
              tree={TREE}
              pinned={[benchRow]}
              pinnedLabel={() => `Chain benchmark · ${m === 'weighted' ? 'weighted' : 'simple'} · not a total`}
              onRowClick={r => update({store: r.id})}
              rowClickable={r => r.dept === null}
              selectedKey={filters.store}
              initialSort={{key: 'turnover', dir: 'desc'}}
              exportName="turnover-overtime-calloff-by-store"
            />
          </VisualCard>

          <VisualCard title="Attendance incidents by type" subtitle="Illustrative associate-level events; all view filters apply (home-department attribution)." actions={
              <>
                <IllustrativeChip />
                <DecisionChip ids={['D22', 'D35']} label="Calculation open" />
                <InfoTip
                  align="right"
                  label="About the attendance categories"
                  text={
                    <>
                      {INCIDENT_TYPES.map(t => (
                        <span key={t} className="tip-line">
                          <b>{INCIDENT_LABEL[t].label}.</b> {INCIDENT_LABEL[t].help}
                        </span>
                      ))}
                      <span className="tip-line tip-muted">{ATTENDANCE_SOURCE_NOTE}</span>
                    </>
                  }
                />
              </>
            }
            filters={<VisualFilters scope={scope} notes={['Illustrative associate-level events. Department uses the associate home department (D06); Tenure is evaluated at the event week. The incident calculation is open (D22).', ATTENDANCE_SOURCE_NOTE]} />}
          >
            <div className="chart-h220">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeRows} layout="vertical" margin={{top: 4, right: 16, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="label" tick={AXIS} width={220} interval={0} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.label} rows={[{label: 'Incidents', value: fmt.int(payload[0].payload.count)}, {label: 'Source category', value: payload[0].payload.type}]} note={payload[0].payload.help} /> : null)} />
                  <Bar dataKey="count" fill={C.above} isAnimationActive={ANIMATE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">Illustrative incident counts by attendance category. Source categories and pending definitions are available in the tooltips.</p>
          </VisualCard>
        </>
      )}
    </div>
  );
}

const DEPT_NOTE = 'people measures (turnover, terminations, hires, headcount, full-time %) and attendance incidents count associates in their home department; hours, overtime, call-off hours, average weekly hours and vacation use the department where the hours were recorded. This home-versus-worked attribution is an assumption to confirm. Pharmacy shows "Out of OT scope" for overtime.';
const TREE = {children: (r: StoreRow) => r.children, levels: ['Store', 'Department'], name: (r: StoreRow) => r.name};

function fmtFor(key: string, v: number | null): string {
  if (key === 'turnover') return fmt.pct(v);
  if (key === 'ft') return fmt.pct(v, 0);
  if (key === 'otRate') return fmt.pct(v, 2);
  if (key === 'proj') return fmt.signedPct(v);
  if (key === 'callHrs') return fmt.signedDec1(v);
  if (key === 'otPay') return fmt.money(v);
  return fmt.dec1(v);
}
