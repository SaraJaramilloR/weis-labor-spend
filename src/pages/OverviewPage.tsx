import {useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {deptLabel, useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, PctVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {WEEKS} from '../data/calendar';
import {DEPARTMENTS, districtById, regionById, storeById, type DeptId} from '../data/org';
import {customerBase, laborKpis, refAhr, refHours, refSpend, rollup, total, type Rollup} from '../lib/aggregate';
import {ALL, TARGET_LABEL, type Target} from '../lib/filters';
import {fmt, usDate} from '../lib/format';
import {iplh, laborRate, otRate, ratio, variance, variancePct, yoyPct} from '../lib/metrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('overview')!;
type Measure = 'spend' | 'hours';
type Level = 'region' | 'district' | 'store';

export default function OverviewPage() {
  const scope = useScope('overview');
  const {filters, update} = useReport();
  // Budget is the primary comparison; an exploratory reference (Discovery options) adds a secondary line.
  const ref: Target = 'budget';
  const refName = 'Budget';
  const alt: Target | null = filters.reference === 'mdoc' ? 'mdoc' : null;
  const [measure, setMeasure] = useState<Measure>('spend');
  const [level, setLevel] = useState<Level>(filters.district !== ALL ? 'store' : 'district');

  const t = useMemo(() => total(scope.stores, scope.dept, scope.from, scope.to), [scope]);
  const k = laborKpis(t.labor, ref);
  const cb = customerBase(t, scope.dept);
  const weeks = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'week'), [scope]);
  const depts = useMemo(() => rollup(scope.stores, ALL, scope.from, scope.to, 'dept'), [scope]);
  const breakdown = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, level), [scope, level]);
  const hasData = t.labor.rows > 0;

  const weekRows = [...weeks.entries()]
    .map(([w, r]) => {
      const info = WEEKS[Number(w)];
      const actual = measure === 'spend' ? r.labor.pay : r.labor.hours;
      const reference = measure === 'spend' ? refSpend(r.labor, ref) : refHours(r.labor, ref);
      const ly = measure === 'spend' ? r.labor.payLY : r.labor.hoursLY;
      return {w: Number(w), label: `W${info.week}`, start: info.start, end: info.end, fy: info.fy, actual, reference, ly, rate: laborRate(r.labor.pay, r.labor.sales), rateBud: laborRate(r.labor.payBud, r.labor.salesBud), iplh: iplh(r.labor.items, r.labor.hours), iplhMdoc: iplh(r.labor.itemsMdoc, r.labor.hoursMdoc), iplhLY: iplh(r.labor.itemsLY, r.labor.hoursLY), rateLY: laborRate(r.labor.payLY, r.labor.salesLY)};
    })
    .sort((a, b) => a.w - b.w);

  const deptRows = DEPARTMENTS.map(d => {
    const r = depts.get(d.id);
    if (!r) return null;
    const actual = measure === 'spend' ? r.labor.pay : r.labor.hours;
    const reference = measure === 'spend' ? refSpend(r.labor, ref) : refHours(r.labor, ref);
    return {id: d.id, name: d.name, actual, reference, v: variance(actual, reference), pct: variancePct(actual, reference)};
  })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.actual > 0)
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0));

  type Row = {id: string; name: string; r: Rollup};
  const tableRows: Row[] = [...breakdown.entries()].map(([id, r]) => ({id, name: nameOf(level, id), r}));
  const money = measure === 'spend';
  const columns: Column<Row>[] = [
    {key: 'name', header: level === 'region' ? 'Region' : level === 'district' ? 'District' : 'Store', value: r => r.name, align: 'left'},
    {key: 'spend', header: 'Labor spend', value: r => r.r.labor.pay, render: r => fmt.money(r.r.labor.pay), group: 'Labor $'},
    {key: 'spendRef', header: refName, value: r => refSpend(r.r.labor, ref), render: r => fmt.money(refSpend(r.r.labor, ref)), group: 'Labor $'},
    {key: 'spendVar', header: `Var % vs ${refName}`, value: r => variancePct(r.r.labor.pay, refSpend(r.r.labor, ref)), render: r => <PctVar actual={r.r.labor.pay} target={refSpend(r.r.labor, ref)} />, group: 'Labor $'},
    {key: 'hours', header: 'Hours', value: r => r.r.labor.hours, render: r => fmt.int(r.r.labor.hours), group: 'Labor hours'},
    {key: 'hoursVar', header: `Var % vs ${refName}`, value: r => variancePct(r.r.labor.hours, refHours(r.r.labor, ref)), render: r => <PctVar actual={r.r.labor.hours} target={refHours(r.r.labor, ref)} />, group: 'Labor hours'},
    {key: 'rate', header: 'Labor rate', value: r => laborRate(r.r.labor.pay, r.r.labor.sales), render: r => fmt.pct(laborRate(r.r.labor.pay, r.r.labor.sales), 2), group: 'Productivity'},
    {key: 'iplh', header: 'IPLH', value: r => iplh(r.r.labor.items, r.r.labor.hours), render: r => fmt.dec1(iplh(r.r.labor.items, r.r.labor.hours)), group: 'Productivity'},
    {key: 'ot', header: 'OT rate', sub: 'excl. RX', value: r => otRate(r.r.labor.otPay, r.r.labor.otBasePay), render: r => fmt.pct(otRate(r.r.labor.otPay, r.r.labor.otBasePay), 2), group: 'Productivity'},
    {key: 'sales', header: 'Sales vs Budget', value: r => variancePct(r.r.labor.sales, r.r.labor.salesBud), render: r => <PctVar actual={r.r.labor.sales} target={r.r.labor.salesBud} />, group: 'Sales context'},
  ];

  const drill = (row: Row) => {
    if (level === 'region') update({region: row.id, district: ALL, store: ALL});
    else if (level === 'district') {
      update({region: districtById.get(row.id)?.regionId ?? ALL, district: row.id, store: ALL});
      setLevel('store');
    } else {
      const s = storeById.get(row.id);
      update({region: s?.regionId ?? ALL, district: s?.districtId ?? ALL, store: row.id});
    }
  };

  const filtersInfo = <VisualFilters scope={scope} />;
  const storeLevelNote = 'Clean Sales and the Total Sales in Sales context are store level (the Department filter does not change them). Transactions, basket size and sales per transaction follow the Department filter, as Ops 100 department rows do.';

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <ScopeLine scope={scope} />
      {!hasData ? (
        <EmptyState>No labor data for this selection. Try another time frame, location or department, or use Reset filters.</EmptyState>
      ) : (
        <>
          <section aria-label="Labor spend and hours" className="kpi-grid primary">
            <KpiCard
              level="primary"
              label="Labor spend"
              value={fmt.compactMoney(k.spend)}
              hint="Actual payroll dollars from the source, including salaried managers and Starbucks (no manual additions)."
              lines={[
                {label: `vs ${refName}`, value: <MoneyVar actual={k.spend} target={k.spendRef} />},
                {label: 'vs LY', value: <MoneyVar actual={k.spend} target={t.labor.payLY} />},
                ...(alt ? [{label: `vs ${TARGET_LABEL[alt]} (exploratory)`, value: <MoneyVar actual={k.spend} target={refSpend(t.labor, alt)} />}] : []),
              ]}
            />
            <KpiCard
              level="primary"
              label="Labor hours"
              value={fmt.compactHours(k.hours)}
              hint="Actual labor hours. Vacation hours are shown separately (inclusion is an open decision)."
              decisions={['D17']}
              lines={[
                {label: `vs ${refName}`, value: <HoursVar actual={k.hours} target={k.hoursRef} />},
                {label: 'vs LY', value: <HoursVar actual={k.hours} target={t.labor.hoursLY} />},
                ...(alt ? [{label: `vs ${TARGET_LABEL[alt]} (exploratory)`, value: <HoursVar actual={k.hours} target={refHours(t.labor, alt)} />}] : []),
              ]}
            />
            <KpiCard
              level="primary"
              label="Labor rate"
              value={fmt.pct(k.laborRate, 2)}
              hint="Payroll $ / Total Sales $ for the same stores, departments and weeks. Budget rate = Budget payroll $ / Budget sales $."
              decisions={['D19']}
              lines={[
                {label: 'vs Budget', value: <RateVar actual={k.laborRate} target={laborRate(t.labor.payBud, t.labor.salesBud)} />},
                {label: 'vs LY', value: <RateVar actual={k.laborRate} target={laborRate(t.labor.payLY, t.labor.salesLY)} />},
              ]}
            />
            <KpiCard
              level="primary"
              label="Items per labor hour"
              value={fmt.dec1(k.iplh)}
              hint="SUM(Items) / SUM(Labor hours). The Ops 100 draft compares IPLH with MDoc and last year; it has no budget items."
              lines={[
                {label: 'vs MDoc', value: <RatioVar actual={k.iplh} target={iplh(t.labor.itemsMdoc, t.labor.hoursMdoc)} />},
                {label: 'vs LY', value: <RatioVar actual={k.iplh} target={iplh(t.labor.itemsLY, t.labor.hoursLY)} />},
              ]}
            />
          </section>
          <section aria-label="Rate, overtime and sales context" className="kpi-grid secondary">
            <KpiCard label="Average hourly rate" value={fmt.money2(k.ahr)} hint="Payroll $ / Labor hours." lines={[{label: `vs ${refName}`, value: <RatioVar actual={k.ahr} target={k.ahrRef} digits={2} prefix="$" />}, ...(alt ? [{label: `${TARGET_LABEL[alt]} (exploratory)`, value: fmt.money2(refAhr(t.labor, alt))}] : [])]} />
            <KpiCard
              label="Overtime (excl. RX)"
              value={fmt.compactMoney(k.otPay)}
              hint="Overtime dollars and hours excluding Pharmacy. Rate = OT $ / Payroll $, both excluding RX. No status threshold is applied."
              decisions={['D03', 'D04']}
              lines={[
                {label: 'Rate', value: `${fmt.pct(k.otRate, 2)} (${fmt.pp(variance(k.otRate, k.otRateLY))} vs LY)`},
                {label: 'Hours', value: `${fmt.int(k.otHours)} (${fmt.signedPct(yoyPct(k.otHours, k.otHoursLY))} vs LY)`},
              ]}
            />
            <KpiCard
              label="Call-off % (draft)"
              value={fmt.signedPct(k.hoursVsProjPct)}
              hint="Workbook draft: hours variance against projected (scheduled) hours, (actual − projected) / projected. It is not an attendance-based absence rate. The 2% opportunity flag is not applied."
              decisions={['D05']}
              lines={[{label: 'Call-off hours (draft)', value: fmt.signedHours(k.hoursVsProj)}]}
            />
            <KpiCard
              label="Sales context"
              value={<span className="dual-value">{fmt.compactMoney(t.store.storeSales)} <small>Total</small> · {fmt.compactMoney(t.store.cleanSales)} <small>Clean</small></span>}
              hint="Total Sales and Clean Sales (excludes Fuel, Pharmacy, Front End) for all departments of the stores in scope. Which one leads the dashboard is not decided."
              decisions={['D08', 'D16']}
              lines={[
                {label: 'Total vs LY', value: <PctVar actual={t.store.storeSales} target={t.store.storeSalesLY} />},
                {label: 'Clean vs LY', value: <PctVar actual={t.store.cleanSales} target={t.store.cleanSalesLY} />},
              ]}
            />
          </section>
          {scope.dept !== ALL ? <p className="note">{storeLevelNote} Labor measures above are for {deptLabel(scope.dept)}.</p> : null}

          <VisualCard
            title={`Weekly ${money ? 'labor spend' : 'labor hours'} vs ${refName}`}
            filters={filtersInfo}
            actions={<Segmented label="Measure" value={measure} options={[{id: 'spend', label: 'Labor $'}, {id: 'hours', label: 'Hours'}]} onChange={setMeasure} size="sm" />}
          >
            <ChartKey items={[{label: 'Actual', color: C.actual}, {label: refName, color: C.reference, kind: 'line'}, {label: 'LY', color: C.ly, kind: 'line' as const}]} />
            <div className="chart-h280">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weekRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis tick={AXIS} width={64} tickFormatter={v => (money ? fmt.compactMoney(v) : fmt.compact(v))} domain={['auto', 'auto']} />
                  <Tooltip
                    cursor={{fill: '#f3f2f1'}}
                    content={({active, payload}) => {
                      const p = active && payload?.[0]?.payload;
                      if (!p) return null;
                      const f = money ? fmt.money : (v: number | null) => fmt.hours(v);
                      return (
                        <TipBox
                          title={`FY${p.fy} ${p.label} · ${usDate(p.start)} – ${usDate(p.end)}`}
                          rows={[
                            {label: 'Actual', value: f(p.actual), swatch: C.actual},
                            {label: refName, value: f(p.reference), swatch: C.reference},
                            {label: `Var vs ${refName}`, value: `${money ? fmt.signedMoney(variance(p.actual, p.reference)) : fmt.signedHours(variance(p.actual, p.reference))} (${fmt.signedPct(variancePct(p.actual, p.reference))})`},
                            {label: 'LY', value: f(p.ly), swatch: C.ly},
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="actual" fill={C.actual} isAnimationActive={ANIMATE} maxBarSize={22} />
                  <Line dataKey="reference" stroke={C.reference} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                  <Line dataKey="ly" stroke={C.ly} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">The axis starts near the data range, not at zero, so weekly differences are visible.</p>
          </VisualCard>

          <div className="two-col">
            <VisualCard title="Labor rate by week" filters={filtersInfo}>
              <ChartKey items={[{label: 'Actual', color: C.actual, kind: 'line'}, {label: 'Budget', color: C.reference, kind: 'line'}, {label: 'LY', color: C.ly, kind: 'line'}]} />
              <div className="chart-h220">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.pct(v, 2)} domain={['auto', 'auto']} />
                    <Tooltip content={({active, payload}) => (active && payload?.[0] ? <TipBox title={`FY${payload[0].payload.fy} ${payload[0].payload.label}`} rows={[{label: 'Actual', value: fmt.pct(payload[0].payload.rate, 2), swatch: C.actual}, {label: 'Budget', value: fmt.pct(payload[0].payload.rateBud, 2), swatch: C.reference}, {label: 'Difference', value: fmt.pp(variance(payload[0].payload.rate, payload[0].payload.rateBud))}, {label: 'LY', value: fmt.pct(payload[0].payload.rateLY, 2), swatch: C.ly}]} /> : null)} />
                    <Line dataKey="rate" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                    <Line dataKey="rateBud" stroke={C.reference} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                    <Line dataKey="rateLY" stroke={C.ly} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </VisualCard>
            <VisualCard title="Items per labor hour by week" filters={filtersInfo}>
              <ChartKey items={[{label: 'Actual', color: C.actual, kind: 'line'}, {label: 'MDoc', color: C.reference, kind: 'line'}, {label: 'LY', color: C.ly, kind: 'line'}]} />
              <div className="chart-h220">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tick={AXIS} width={44} tickFormatter={v => fmt.dec1(v)} domain={['auto', 'auto']} />
                    <Tooltip content={({active, payload}) => (active && payload?.[0] ? <TipBox title={`FY${payload[0].payload.fy} ${payload[0].payload.label}`} rows={[{label: 'Actual', value: fmt.dec1(payload[0].payload.iplh), swatch: C.actual}, {label: 'MDoc', value: fmt.dec1(payload[0].payload.iplhMdoc), swatch: C.reference}, {label: 'LY', value: fmt.dec1(payload[0].payload.iplhLY), swatch: C.ly}]} /> : null)} />
                    <Line dataKey="iplh" stroke={C.actual} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                    <Line dataKey="iplhMdoc" stroke={C.reference} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                    <Line dataKey="iplhLY" stroke={C.ly} strokeWidth={2} dot={false} isAnimationActive={ANIMATE} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </VisualCard>
          </div>

          <div className="two-col wide-left">
            <VisualCard
              title={`${money ? 'Labor $' : 'Hours'} variance to ${refName} by department`}
              filters={<VisualFilters scope={scope} ignoreDept notes={['Select a bar to filter the page to that department; select it again to clear.']} />}
              subtitle={scope.dept !== ALL ? `Filtered to ${deptLabel(scope.dept)} · select the bar again to clear` : 'Select a bar to filter the report by department'}
            >
              <div className="chart-h320">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptRows} layout="vertical" margin={{top: 4, right: 16, left: 8, bottom: 0}}>
                    <CartesianGrid stroke={C.grid} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickFormatter={v => (money ? fmt.signedCompactMoney(v) : fmt.compact(v))} />
                    <YAxis type="category" dataKey="name" tick={AXIS} width={118} interval={0} />
                    <ReferenceLine x={0} stroke={C.benchmark} />
                    <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.name} rows={[{label: 'Actual', value: money ? fmt.money(payload[0].payload.actual) : fmt.hours(payload[0].payload.actual)}, {label: refName, value: money ? fmt.money(payload[0].payload.reference) : fmt.hours(payload[0].payload.reference)}, {label: 'Variance', value: `${money ? fmt.signedMoney(payload[0].payload.v) : fmt.signedHours(payload[0].payload.v)} (${fmt.signedPct(payload[0].payload.pct)})`}]} note="Above or below target is not good or bad by itself: read it with sales and productivity." /> : null)} />
                    <Bar dataKey="v" isAnimationActive={ANIMATE} onClick={(d: {id?: DeptId}) => d?.id && update({dept: filters.dept === d.id ? ALL : d.id})} cursor="pointer">
                      {deptRows.map(d => (
                        <Cell key={d.id} fill={filters.dept === ALL || filters.dept === d.id ? ((d.v ?? 0) >= 0 ? C.above : C.below) : '#e1e4e6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartKey items={[{label: `Above ${refName}`, color: C.above}, {label: `Below ${refName}`, color: C.below}]} />
            </VisualCard>
            <VisualCard title="Customer and time-off context" filters={<VisualFilters scope={scope} notes={[storeLevelNote, 'Vacation hours follow the Department filter.']} />}>
              <dl className="context-list">
                <div>
                  <dt>Transactions (customer count)</dt>
                  <dd>
                    {fmt.compact(cb.tx)} <PctVar actual={cb.tx} target={cb.txLY} />
                  </dd>
                </div>
                <div>
                  <dt>Basket size (items / transaction)</dt>
                  <dd>
                    {fmt.dec2(ratio(cb.items, cb.tx))} <RatioVar actual={ratio(cb.items, cb.tx)} target={ratio(cb.itemsLY, cb.txLY)} digits={2} />
                  </dd>
                </div>
                <div>
                  <dt>Sales per transaction</dt>
                  <dd>
                    {fmt.money2(ratio(cb.sales, cb.tx))} <RatioVar actual={ratio(cb.sales, cb.tx)} target={ratio(cb.salesLY, cb.txLY)} digits={2} prefix="$" />
                  </dd>
                </div>
                <div>
                  <dt>Vacation hours{scope.dept !== ALL ? ` · ${deptLabel(scope.dept)}` : ''}</dt>
                  <dd>
                    {fmt.int(k.vacHours)} <PctVar actual={k.vacHours} target={k.vacHoursLY} />
                  </dd>
                </div>
              </dl>
              <p className="note">
                Changes are shown against LY. Transactions are the Ops 100 customer count, not unique customers. <DecisionChip ids={['D17']} label="Vacation open" align="left" />
              </p>
            </VisualCard>
          </div>

          <VisualCard
            title={`Labor by ${level}`}
            filters={<VisualFilters scope={scope} notes={['Select a row to filter the report to it.']} />}
            actions={<Segmented label="Breakdown level" value={level} options={[{id: 'region', label: 'Region'}, {id: 'district', label: 'District'}, {id: 'store', label: 'Store'}]} onChange={setLevel} size="sm" />}
          >
            <DataTable rows={tableRows} columns={columns} rowKey={r => r.id} label={`Labor by ${level}`} searchText={r => r.name} onRowClick={drill} selectedKey={level === 'store' ? filters.store : level === 'district' ? filters.district : filters.region} initialSort={{key: 'spendVar', dir: 'desc'}} exportName={`labor-by-${level}`} />
          </VisualCard>
        </>
      )}
    </div>
  );
}

function nameOf(level: Level, id: string): string {
  if (level === 'region') return regionById.get(id)?.name ?? id;
  if (level === 'district') return districtById.get(id)?.name ?? id;
  return storeById.get(id)?.name ?? id;
}
