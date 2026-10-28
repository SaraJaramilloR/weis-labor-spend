import {useId, useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, PctVar} from '../components/kpiLines';
import {VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, IllustrativeChip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DAY_NAMES, LAST_WEEK_IDX, WEEKS, addDays} from '../data/calendar';
import {DAILY_FIRST_WEEK_IDX, HOURLY_SHARE, HOURS_OF_DAY, type DailyFact} from '../data/generate';
import {deptById, storeById} from '../data/org';
import {dailyRollup, dailyStoreSales, type DailyTotals} from '../lib/aggregate';
import {storeScope} from '../lib/filters';
import {fmt, hourLabel, shortDay, usDate} from '../lib/format';
import {variance, variancePct} from '../lib/metrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('daily')!;
type GroupBy = 'day' | 'store' | 'dept' | 'storeDept';
const WEEK_OPTIONS = WEEKS.slice(DAILY_FIRST_WEEK_IDX, LAST_WEEK_IDX + 1).reverse();

export default function DailyPage() {
  const scope = useScope('daily');
  const {filters, role} = useReport();
  const [week, setWeek] = useState(LAST_WEEK_IDX);
  const [day, setDay] = useState<number | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const weekId = useId();
  const dayId = useId();
  // Daily targets exist for Budget and MDoc (MDoc is day-level, confirmed). Prior-year daily values are not loaded.
  // Budget is the primary comparison. MDoc (day-level targets) may be added as an exploratory secondary
  // comparison from Discovery options; prior-year daily values are not loaded.
  const refName = 'Budget';
  const altMdoc = filters.reference === 'mdoc';
  const stores = useMemo(() => storeScope(scope.filters, role, week), [scope.filters, role, week]);
  const info = WEEKS[week];

  const keyFn = (f: DailyFact) => (groupBy === 'day' ? String(f.day) : groupBy === 'store' ? f.store : groupBy === 'dept' ? f.dept : `${f.store}|${f.dept}`);
  const grouped = useMemo(() => dailyRollup(stores, scope.dept, week, day, keyFn), [stores, scope.dept, week, day, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => dailyRollup(stores, scope.dept, week, 'all', f => String(f.day)), [stores, scope.dept, week]);
  const totalT = [...grouped.values()].reduce<DailyTotals>((a, b) => ({sales: a.sales + b.sales, hours: a.hours + b.hours, pay: a.pay + b.pay, hoursBud: a.hoursBud + b.hoursBud, payBud: a.payBud + b.payBud, hoursMdoc: a.hoursMdoc + b.hoursMdoc, payMdoc: a.payMdoc + b.payMdoc}), {sales: 0, hours: 0, pay: 0, hoursBud: 0, payBud: 0, hoursMdoc: 0, payMdoc: 0});
  const rh = (t: DailyTotals) => t.hoursBud;
  const rp = (t: DailyTotals) => t.payBud;

  type Row = {id: string; name: string; t: DailyTotals};
  const nameOf = (id: string) => {
    if (groupBy === 'day') return `${DAY_NAMES[Number(id)]} ${usDate(addDays(info.start, Number(id)))}`;
    if (groupBy === 'store') return storeById.get(id)?.name ?? id;
    if (groupBy === 'dept') return deptById.get(id as never)?.name ?? id;
    const [store, dept] = id.split('|');
    return `${storeById.get(store)?.name ?? store} · ${deptById.get(dept as never)?.name ?? dept}`;
  };
  const rows: Row[] = [...grouped.entries()].map(([id, t]) => ({id, name: nameOf(id), t}));
  const columns: Column<Row>[] = [
    {key: 'name', header: groupBy === 'day' ? 'Day' : groupBy === 'store' ? 'Store' : groupBy === 'dept' ? 'Department' : 'Store · Department', value: r => (groupBy === 'day' ? Number(r.id) : r.name), render: r => r.name, align: 'left'},
    {key: 'hours', header: 'Actual', value: r => r.t.hours, render: r => fmt.int(r.t.hours), group: 'Labor hours'},
    {key: 'hoursRef', header: refName, value: r => rh(r.t), render: r => fmt.int(rh(r.t)), group: 'Labor hours'},
    {key: 'hoursVar', header: 'Variance', value: r => variance(r.t.hours, rh(r.t)), render: r => <HoursVar actual={r.t.hours} target={rh(r.t)} />, group: 'Labor hours'},
    {key: 'pay', header: 'Actual', value: r => r.t.pay, render: r => fmt.money(r.t.pay), group: 'Labor spend'},
    {key: 'payRef', header: refName, value: r => rp(r.t), render: r => fmt.money(rp(r.t)), group: 'Labor spend'},
    {key: 'payVar', header: 'Variance', value: r => variance(r.t.pay, rp(r.t)), render: r => <MoneyVar actual={r.t.pay} target={rp(r.t)} />, group: 'Labor spend'},
    ...(altMdoc
      ? [
          {key: 'hoursMdocVar', header: 'Hours var %', value: (r: Row) => variancePct(r.t.hours, r.t.hoursMdoc), render: (r: Row) => <PctVar actual={r.t.hours} target={r.t.hoursMdoc} />, group: 'vs MDoc (exploratory)'},
          {key: 'payMdocVar', header: 'Spend var %', value: (r: Row) => variancePct(r.t.pay, r.t.payMdoc), render: (r: Row) => <PctVar actual={r.t.pay} target={r.t.payMdoc} />, group: 'vs MDoc (exploratory)'},
        ]
      : []),
    {key: 'sales', header: 'Sales', value: r => r.t.sales, render: r => fmt.money(r.t.sales), group: 'Context'},
  ];

  const chartRows = [...byDay.entries()].map(([d, t]) => ({day: Number(d), label: shortDay(addDays(info.start, Number(d))), hours: t.hours, ref: rh(t), pay: t.pay, payRef: rp(t)})).sort((a, b) => a.day - b.day);
  const hourlyBase = useMemo(() => dailyStoreSales(stores, week, day), [stores, week, day]);
  const hourly = HOURS_OF_DAY.map((h, i) => ({h, label: hourLabel(h), sales: hourlyBase * HOURLY_SHARE[i]}));
  const dayLabel = day === 'all' ? `Week beginning ${usDate(info.start)}` : `${DAY_NAMES[day]} ${usDate(addDays(info.start, day))}`;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <div className="local-controls" role="group" aria-label="Day selection">
        <div className="fb-field">
          <label htmlFor={weekId}>Week beginning</label>
          <select id={weekId} value={week} onChange={e => setWeek(Number(e.target.value))}>
            {WEEK_OPTIONS.map(w => (
              <option key={w.idx} value={w.idx}>
                {usDate(w.start)} · FY{w.fy} W{String(w.week).padStart(2, '0')}
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
        <p className="note">
          Defaults to the last completed week; the 7 earlier weeks stay available. Primary comparison: Budget.
          {filters.reference === 'mdoc' ? ' Exploratory: MDoc (day-level budget hours and dollars).' : filters.reference === 'ly' ? ' The exploratory prior-year comparison is not available at day level.' : ''}
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
        <span className="scope-part">Compared with: {refName}</span>
        <span className="scope-count">{stores.size} stores</span>
      </p>
      {totalT.hours === 0 ? (
        <EmptyState>No daily data for this selection. Try another week, location or department, or use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid primary" aria-label="Daily summary">
            <KpiCard level="primary" label="Labor hours" value={fmt.compactHours(totalT.hours)} decisions={['D01']} lines={[{label: 'Budgeted hours', value: fmt.compactHours(rh(totalT))}, {label: 'vs Budget', value: <HoursVar actual={totalT.hours} target={rh(totalT)} />}, ...(altMdoc ? [{label: 'vs MDoc (exploratory)', value: <HoursVar actual={totalT.hours} target={totalT.hoursMdoc} />}] : [])]} />
            <KpiCard level="primary" label="Labor spend" value={fmt.compactMoney(totalT.pay)} decisions={['D01']} lines={[{label: 'Budgeted spend', value: fmt.compactMoney(rp(totalT))}, {label: 'vs Budget', value: <MoneyVar actual={totalT.pay} target={rp(totalT)} />}, ...(altMdoc ? [{label: 'vs MDoc (exploratory)', value: <MoneyVar actual={totalT.pay} target={totalT.payMdoc} />}] : [])]} />
            <KpiCard label="Sales" value={fmt.compactMoney(totalT.sales)} hint="Total Sales of the departments in scope for the selected day(s)." decisions={['D08']} />
            <KpiCard label="Hours variance %" value={fmt.signedPct(variancePct(totalT.hours, rh(totalT)))} lines={[{label: 'Spend variance %', value: <PctVar actual={totalT.pay} target={rp(totalT)} />}]} />
          </section>

          <VisualCard title={`Daily labor hours vs ${refName}`} filters={<VisualFilters scope={scope} notes={[`Week beginning ${usDate(info.start)}. The Day selector filters the table, cards and hourly sales; this chart always shows the full week.`]} />}>
            <ChartKey items={[{label: 'Actual hours', color: C.actual}, {label: refName, color: C.reference, kind: 'line'}]} />
            <div className="chart-h280">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} />
                  <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.label} rows={[{label: 'Actual hours', value: fmt.int(payload[0].payload.hours), swatch: C.actual}, {label: refName, value: fmt.int(payload[0].payload.ref), swatch: C.reference}, {label: 'Variance', value: `${fmt.signedInt(variance(payload[0].payload.hours, payload[0].payload.ref))} hrs`}, {label: 'Labor spend', value: fmt.money(payload[0].payload.pay)}, {label: `Spend ${refName}`, value: fmt.money(payload[0].payload.payRef)}]} /> : null)} />
                  <Bar dataKey="hours" isAnimationActive={ANIMATE} maxBarSize={48} fill={C.actual} />
                  <Line dataKey="ref" stroke={C.reference} strokeWidth={2} isAnimationActive={ANIMATE} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </VisualCard>

          <VisualCard
            title={`Hours & spend vs ${refName} · ${dayLabel}`}
            filters={<VisualFilters scope={scope} />}
            actions={<Segmented label="Rows" value={groupBy} options={[{id: 'day', label: 'By day'}, {id: 'store', label: 'By store'}, {id: 'dept', label: 'By department'}, {id: 'storeDept', label: 'By store and department'}]} onChange={setGroupBy} size="sm" />}
          >
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="Daily labor vs target" searchText={groupBy === 'day' ? undefined : r => r.name} pinned={[{id: 'total', name: 'Total', t: totalT}]} pinnedLabel={() => 'Total'} initialSort={groupBy === 'day' ? {key: 'name', dir: 'asc'} : {key: 'hoursVar', dir: 'desc'}} exportName={`daily-labor-${info.start}`} />
          </VisualCard>

          <VisualCard title={`Hourly sales by time of day · ${dayLabel}`} actions={<><IllustrativeChip text="Under evaluation · illustrative" /><DecisionChip ids={['D21']} label="Open" /></>} filters={<VisualFilters scope={scope} ignoreDept notes={['Hourly sales are store level (all departments). The hourly curve is illustrative: hour-level sales are not modeled in the synthetic data.']} />}>
            <div className="chart-h220">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} interval={1} />
                  <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.compactMoney(v)} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.label} rows={[{label: 'Sales (illustrative)', value: fmt.money(payload[0].payload.sales)}]} /> : null)} />
                  <Bar dataKey="sales" fill={C.sales} isAnimationActive={ANIMATE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="note">Included to evaluate whether sales by hour helps staffing decisions. Daily totals are real synthetic values; the split by hour is a fixed illustrative profile.</p>
          </VisualCard>
        </>
      )}
    </div>
  );
}
