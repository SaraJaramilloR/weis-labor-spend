import {useId, useMemo, useState} from 'react';
import {Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, PctVar} from '../components/kpiLines';
import {VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {HOURS_REF_HELP, HOURS_REF_OPTIONS, hoursRefName, type HoursRef} from '../config/references';
import {DAY_NAMES, LAST_WEEK_IDX, WEEKS, addDays} from '../data/calendar';
import {DAILY_FIRST_WEEK_IDX, type DailyFact} from '../data/generate';
import {deptById, storeById} from '../data/org';
import {dailyRollup, type DailyTotals} from '../lib/aggregate';
import {storeScope} from '../lib/filters';
import {fmt, shortDay, usDate} from '../lib/format';
import {variance, variancePct} from '../lib/metrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('daily')!;
type GroupBy = 'day' | 'store' | 'dept' | 'storeDept';
const WEEK_OPTIONS = WEEKS.slice(DAILY_FIRST_WEEK_IDX, LAST_WEEK_IDX + 1).reverse();

/** Two-line day tick (weekday, then MM/DD/YYYY) so all seven days stay labeled at narrow widths. */
function DayTick({x, y, payload}: {x?: number; y?: number; payload?: {value: string}}) {
  const [weekday, date] = (payload?.value ?? '').split(' ');
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={AXIS.fontSize} fill={AXIS.fill} className="recharts-cartesian-axis-tick-value">
      <tspan x={x} dy="0.9em">
        {weekday}
      </tspan>
      <tspan x={x} dy="1.2em">
        {date}
      </tspan>
    </text>
  );
}

export default function DailyPage() {
  const scope = useScope('daily');
  const {filters, role} = useReport();
  const [week, setWeek] = useState(LAST_WEEK_IDX);
  const [day, setDay] = useState<number | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const weekId = useId();
  const dayId = useId();
  // Daily targets exist for Budget and MDoc (MDoc is day-level, confirmed). Prior-year daily values are not loaded.
  // Budget is the primary comparison. Hours can also be compared directly with the MDoc operational target (review,
  // 23:44); the synthetic daily MDoc hours follow the same planned day curve as daily Budget (data/generate.ts).
  // MDoc spend stays an exploratory comparison in Discovery options.
  const refName = 'Budget';
  const [hoursRef, setHoursRef] = useState<HoursRef>('budget');
  const hRef = hoursRefName(hoursRef);
  const hoursRefId = useId();
  const altMdoc = filters.reference === 'mdoc';
  const stores = useMemo(() => storeScope(scope.filters, role, week), [scope.filters, role, week]);
  const info = WEEKS[week];

  const keyFn = (f: DailyFact) => (groupBy === 'day' ? String(f.day) : groupBy === 'store' ? f.store : groupBy === 'dept' ? f.dept : `${f.store}|${f.dept}`);
  const grouped = useMemo(() => dailyRollup(stores, scope.dept, week, day, keyFn), [stores, scope.dept, week, day, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => dailyRollup(stores, scope.dept, week, 'all', f => String(f.day)), [stores, scope.dept, week]);
  const totalT = [...grouped.values()].reduce<DailyTotals>((a, b) => ({sales: a.sales + b.sales, hours: a.hours + b.hours, pay: a.pay + b.pay, hoursBud: a.hoursBud + b.hoursBud, payBud: a.payBud + b.payBud, hoursMdoc: a.hoursMdoc + b.hoursMdoc, payMdoc: a.payMdoc + b.payMdoc}), {sales: 0, hours: 0, pay: 0, hoursBud: 0, payBud: 0, hoursMdoc: 0, payMdoc: 0});
  const rh = (t: DailyTotals) => (hoursRef === 'mdoc' ? t.hoursMdoc : t.hoursBud);
  const rp = (t: DailyTotals) => t.payBud;

  type Row = {id: string; name: string; t: DailyTotals};
  const nameOf = (id: string) => {
    if (groupBy === 'day') return `${DAY_NAMES[Number(id)]} ${usDate(addDays(info.start, Number(id)))}`;
    if (groupBy === 'store') return storeById.get(id)?.name ?? id;
    if (groupBy === 'dept') return deptById.get(id as never)?.name ?? id;
    const [store, dept] = id.split('|');
    return `${storeById.get(store)?.name ?? store} · ${deptById.get(dept as never)?.name ?? dept}`;
  };
  const hoursGroup = hoursRef === 'mdoc' ? 'Labor hours vs MDoc (operational target)' : 'Labor hours vs Budget';
  const rows: Row[] = [...grouped.entries()].map(([id, t]) => ({id, name: nameOf(id), t}));
  const columns: Column<Row>[] = [
    {key: 'name', header: groupBy === 'day' ? 'Day' : groupBy === 'store' ? 'Store' : groupBy === 'dept' ? 'Department' : 'Store · Department', value: r => (groupBy === 'day' ? Number(r.id) : r.name), ...(groupBy === 'day' ? {exportValue: (r: Row) => (r.id === 'total' ? 'Total' : usDate(addDays(info.start, Number(r.id))))} : {}), render: r => r.name, align: 'left'},
    {key: 'hours', header: 'Actual', value: r => r.t.hours, render: r => fmt.int(r.t.hours), group: hoursGroup},
    {key: 'hoursRef', header: hRef, value: r => rh(r.t), render: r => fmt.int(rh(r.t)), group: hoursGroup},
    {key: 'hoursVar', header: 'Variance', sub: 'hrs (%)', value: r => variance(r.t.hours, rh(r.t)), render: r => <HoursVar actual={r.t.hours} target={rh(r.t)} />, group: hoursGroup},
    {key: 'pay', header: 'Actual', value: r => r.t.pay, render: r => fmt.money(r.t.pay), group: 'Labor spend'},
    {key: 'payRef', header: refName, value: r => rp(r.t), render: r => fmt.money(rp(r.t)), group: 'Labor spend'},
    {key: 'payVar', header: 'Variance', value: r => variance(r.t.pay, rp(r.t)), render: r => <MoneyVar actual={r.t.pay} target={rp(r.t)} />, group: 'Labor spend'},
    ...(altMdoc
      ? [
          {key: 'payMdocVar', header: 'Spend var %', value: (r: Row) => variancePct(r.t.pay, r.t.payMdoc), render: (r: Row) => <PctVar actual={r.t.pay} target={r.t.payMdoc} />, group: 'vs MDoc (exploratory)'},
        ]
      : []),
    {key: 'sales', header: 'Sales', value: r => r.t.sales, render: r => fmt.money(r.t.sales), group: 'Context'},
  ];

  const chartRows = [...byDay.entries()].map(([d, t]) => ({day: Number(d), label: shortDay(addDays(info.start, Number(d))), hours: t.hours, ref: rh(t), pay: t.pay, payRef: rp(t)})).sort((a, b) => a.day - b.day);
  const dayLabel = day === 'all' ? `Week Ending ${usDate(info.end)}` : `${DAY_NAMES[day]} ${usDate(addDays(info.start, day))}`;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <div className="local-controls" role="group" aria-label="Day selection">
        <div className="fb-field">
          <label htmlFor={weekId}>Week Ending</label>
          <select id={weekId} value={week} onChange={e => setWeek(Number(e.target.value))}>
            {WEEK_OPTIONS.map(w => (
              <option key={w.idx} value={w.idx}>
                {usDate(w.end)} · FY{w.fy} W{String(w.week).padStart(2, '0')}
                {w.idx === LAST_WEEK_IDX ? ' · last completed week' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="fb-field">
          <label htmlFor={dayId}>Day</label>
          <select id={dayId} value={day} onChange={e => setDay(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All days of the week</option>
            {DAY_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n} {usDate(addDays(info.start, i))}
              </option>
            ))}
          </select>
        </div>
        <div className="fb-field">
          <span className="fb-label" id={hoursRefId}>
            Compare hours with <InfoTip text={HOURS_REF_HELP} label="About the hours reference" align="left" />
          </span>
          <Segmented label="Compare labor hours with" value={hoursRef} options={HOURS_REF_OPTIONS} onChange={setHoursRef} size="sm" />
        </div>
        <p className="note">
          Defaults to the last completed week; the 7 earlier weeks stay available. Primary comparison: Budget. <DecisionChip ids={['D01']} label="Open" align="left" /> Intended to reflect the Daily Labor Report (Payroll Update); its full layout is pending the reference report. Synthetic data, not refreshed daily. <DecisionChip ids={['D38']} label="Open" align="left" />
          {filters.reference === 'mdoc' ? ' Exploratory: spend vs MDoc (day-level target dollars).' : filters.reference === 'ly' ? ' The exploratory prior-year comparison is not available at day level.' : ''}
        </p>
      </div>
      <p className="scope-line">
        <span className="scope-title">Showing</span>
        <span className="scope-part">{dayLabel}</span>
        {scope.applied.filter(a => !a.startsWith('Time frame') && !a.startsWith('Compared')).map(a => (
          <span key={a} className="scope-part">
            {a}
          </span>
        ))}
        <span className="scope-part">
          Compared with: hours vs {hoursRef === 'mdoc' ? 'MDoc (operational target)' : 'Budget'} · spend vs {refName}
        </span>
        <span className="scope-count">{stores.size} stores</span>
      </p>
      {totalT.hours === 0 ? (
        <EmptyState>No daily data for this selection. Try another week, location or department, or use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid primary" aria-label="Daily summary">
            <KpiCard level="primary" label="Labor hours" value={fmt.compactHours(totalT.hours)} decisions={['D01']} lines={[{label: hoursRef === 'mdoc' ? 'MDoc hours' : 'Budgeted hours', value: fmt.compactHours(rh(totalT))}, {label: `vs ${hRef}`, value: <HoursVar actual={totalT.hours} target={rh(totalT)} />}]} />
            <KpiCard level="primary" label="Labor spend" value={fmt.compactMoney(totalT.pay)} decisions={['D01']} lines={[{label: 'Budgeted spend', value: fmt.compactMoney(rp(totalT))}, {label: 'vs Budget', value: <MoneyVar actual={totalT.pay} target={rp(totalT)} />}, ...(altMdoc ? [{label: 'vs MDoc (exploratory)', value: <MoneyVar actual={totalT.pay} target={totalT.payMdoc} />}] : [])]} />
            <KpiCard label="Sales" value={fmt.compactMoney(totalT.sales)} hint="Total Sales of the departments in scope for the selected day(s)." decisions={['D08']} />
            <KpiCard label={`Hours variance % vs ${hRef}`} value={fmt.signedPct(variancePct(totalT.hours, rh(totalT)))} lines={[{label: 'Spend variance % vs Budget', value: <PctVar actual={totalT.pay} target={rp(totalT)} />}]} />
          </section>

          <VisualCard title={`Daily labor hours vs ${hRef}`} filters={<VisualFilters scope={scope} notes={[`Week Ending ${usDate(info.end)} (${usDate(info.start)} – ${usDate(info.end)}). The Day selector filters the table and cards; this chart always shows the full week.`]} />}>
            <ChartKey items={[{label: 'Actual hours', color: C.actual}, {label: hoursRef === 'mdoc' ? 'MDoc hours (operational target)' : 'Budget hours', color: C.reference, kind: 'line'}]} />
            <div className="chart-h280">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={DayTick} interval={0} height={36} />
                  <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.label} rows={[{label: 'Actual hours', value: fmt.int(payload[0].payload.hours), swatch: C.actual}, {label: `${hRef} hours`, value: fmt.int(payload[0].payload.ref), swatch: C.reference}, {label: 'Variance', value: `${fmt.signedInt(variance(payload[0].payload.hours, payload[0].payload.ref))} hrs`}, {label: 'Labor spend', value: fmt.money(payload[0].payload.pay)}, {label: `Spend ${refName}`, value: fmt.money(payload[0].payload.payRef)}]} /> : null)} />
                  <Bar dataKey="hours" isAnimationActive={ANIMATE} maxBarSize={48} fill={C.actual} />
                  <Line dataKey="ref" stroke={C.reference} strokeWidth={2} isAnimationActive={ANIMATE} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </VisualCard>

          <VisualCard
            title={`Hours vs ${hRef} and spend vs ${refName} · ${dayLabel}`}
            filters={<VisualFilters scope={scope} />}
            actions={<Segmented label="Rows" value={groupBy} options={[{id: 'day', label: 'By day'}, {id: 'store', label: 'By store'}, {id: 'dept', label: 'By department'}, {id: 'storeDept', label: 'By store and department'}]} onChange={setGroupBy} size="sm" />}
          >
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="Daily labor vs target" searchText={groupBy === 'day' ? undefined : r => r.name} pinned={[{id: 'total', name: 'Total', t: totalT}]} pinnedLabel={() => 'Total'} initialSort={groupBy === 'day' ? {key: 'name', dir: 'asc'} : {key: 'hoursVar', dir: 'desc'}} exportName={`daily-labor-week-ending-${usDate(info.end).replaceAll('/', '-')}`} />
          </VisualCard>

        </>
      )}
    </div>
  );
}
