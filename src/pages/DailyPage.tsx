// Workbook view R66 "Daily Labor vs Budget" (User Story 5), redesigned on the Daily Labor Update reference report
// ("Payroll Update" is the subject of the email that sends it; same report). The report is store level: current week
// to date, next week and future week, with Chain / Region / District / Store rows. Formulas: lib/dailyReport.ts.
// No department detail, no actuals for next or future weeks, no forecasting: all values are synthetic.
import {useId, useMemo, useState, type ReactNode} from 'react';
import {Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, RateVar} from '../components/kpiLines';
import {VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented, VarianceText} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DAILY_HELP, DAILY_RATE_TAG} from '../config/dailyReport';
import {HOURS_REF_HELP, HOURS_REF_OPTIONS, hoursRefName, type HoursRef} from '../config/references';
import {DAY_NAMES, WEEKS} from '../data/calendar';
import {REPORT_FIRST_WEEK, REPORT_LAST_WEEK, STORE_DAYS, reportWeekDates} from '../data/dailyReport';
import {storeScope} from '../lib/filters';
import {currentWeekDays, reportRatios, reportRollup, SECTION_OFFSET, type ReportSection, type ReportTotals} from '../lib/dailyReport';
import {fmt, shortDay, usDate} from '../lib/format';
import {buildOrgTree, onlyChildIds, scopeLabel, type OrgNode} from '../lib/orgTree';
import {ppDiff, variance} from '../lib/metrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('daily')!;
const WEEK_OPTIONS = WEEKS.slice(REPORT_FIRST_WEEK, REPORT_LAST_WEEK + 1).reverse();
/** Latest day (0 = Sunday … 6 = Saturday) with synthetic actuals in each report week. */
const AVAILABLE_DAY = new Map<number, number>();
for (const d of STORE_DAYS) AVAILABLE_DAY.set(d.w, Math.max(AVAILABLE_DAY.get(d.w) ?? 0, d.day));
const SECTIONS: {id: ReportSection; label: string}[] = [
  {id: 'current', label: 'Current week · to date'},
  {id: 'next', label: 'Next week'},
  {id: 'future', label: 'Future week'},
];
type Measures = 'sales' | 'hours' | 'rate' | 'all';
type Row = OrgNode<ReportTotals>;

/** Signed difference in units (items, hours), "n/a" when a side is missing. */
function Diff({a, b, unit = ''}: {a: number | null; b: number | null; unit?: string}) {
  const v = variance(a, b);
  return <VarianceText value={v} text={`${fmt.signedInt(v)}${unit}`} />;
}
function MoneyDiff({a, b}: {a: number | null; b: number | null}) {
  const v = variance(a, b);
  return <VarianceText value={v} text={fmt.signedMoney(v)} />;
}
function IplhDiff({a, b}: {a: number | null; b: number | null}) {
  const v = variance(a, b);
  return <VarianceText value={v} text={v === null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt.dec1(Math.abs(v))}`} />;
}
const noActual = <span className="na" title="No actuals: the week has not happened yet">—</span>;

/** Report columns for a section, in the order of the Daily Labor Update. */
function columnsFor(section: ReportSection, measures: Measures): Column<Row>[] {
  const T = (r: Row) => r.data;
  const R = (r: Row) => reportRatios(r.data);
  const cur = section === 'current';
  const sales: Column<Row>[] = cur
    ? [
        {key: 'cfSales', header: 'Chain Forecast', help: DAILY_HELP.cf, value: r => T(r).cfSales, render: r => fmt.money(T(r).cfSales), group: 'Sales'},
        {key: 'projSales', header: 'Store Projected', help: DAILY_HELP.proj, value: r => T(r).projSales, render: r => fmt.money(T(r).projSales), group: 'Sales'},
        {key: 'actSales', header: 'Actual', help: DAILY_HELP.actual, value: r => T(r).actSales, render: r => fmt.money(T(r).actSales), group: 'Sales'},
        {key: 'salesVar', header: 'Actual vs Store Projected', sub: '$', value: r => variance(T(r).actSales, T(r).projSales), render: r => <MoneyDiff a={T(r).actSales} b={T(r).projSales} />, group: 'Sales'},
        {key: 'cfItems', header: 'Chain Forecast', help: DAILY_HELP.cfItems, value: r => T(r).cfItems, render: r => fmt.int(T(r).cfItems), group: 'Items'},
        {key: 'projItems', header: 'Store Projected', help: DAILY_HELP.projItems, value: r => T(r).projItems, render: r => fmt.int(T(r).projItems), group: 'Items'},
        {key: 'actItems', header: 'Actual', value: r => T(r).actItems, render: r => fmt.int(T(r).actItems), group: 'Items'},
        {key: 'itemsVar', header: 'Actual vs Store Projected', value: r => variance(T(r).actItems, T(r).projItems), render: r => <Diff a={T(r).actItems} b={T(r).projItems} />, group: 'Items'},
      ]
    : [
        {key: 'cfSales', header: 'Chain Forecast', help: DAILY_HELP.cf, value: r => T(r).cfSales, render: r => fmt.money(T(r).cfSales), group: 'Sales'},
        {key: 'projSales', header: 'Store Projected', help: DAILY_HELP.proj, value: r => T(r).projSales, render: r => fmt.money(T(r).projSales), group: 'Sales'},
        {key: 'salesVar', header: 'Var', sub: 'Projected − Chain Forecast', value: r => variance(T(r).projSales, T(r).cfSales), render: r => <MoneyDiff a={T(r).projSales} b={T(r).cfSales} />, group: 'Sales'},
        {key: 'cfItems', header: 'Chain Forecast', help: DAILY_HELP.cfItems, value: r => T(r).cfItems, render: r => fmt.int(T(r).cfItems), group: 'Items'},
        {key: 'projItems', header: 'Store Projected', help: DAILY_HELP.projItems, value: r => T(r).projItems, render: r => fmt.int(T(r).projItems), group: 'Items'},
        {key: 'itemsVar', header: 'Var', sub: 'Projected − Chain Forecast', value: r => variance(T(r).projItems, T(r).cfItems), render: r => <Diff a={T(r).projItems} b={T(r).cfItems} />, group: 'Items'},
      ];
  const hours: Column<Row>[] = cur
    ? [
        {key: 'cfHours', header: 'Chain Forecast', help: DAILY_HELP.cf, value: r => T(r).cfHours, render: r => fmt.int(T(r).cfHours), group: 'Hours'},
        {key: 'projHours', header: 'Store Projected', help: DAILY_HELP.projHours, value: r => T(r).projHours, render: r => fmt.int(T(r).projHours), group: 'Hours'},
        {key: 'toHit', header: 'Hours to hit IPLH', help: DAILY_HELP.toHit, value: r => T(r).hoursToHit, render: r => fmt.int(T(r).hoursToHit), group: 'Hours'},
        {key: 'actHours', header: 'Actual', value: r => T(r).actHours, render: r => fmt.int(T(r).actHours), group: 'Hours'},
        {key: 'hoursVar', header: 'Actual vs Hrs to hit IPLH', value: r => variance(T(r).actHours, T(r).hoursToHit), render: r => <Diff a={T(r).actHours} b={T(r).hoursToHit} unit=" hrs" />, group: 'Hours'},
        {key: 'cfIplh', header: 'Chain Forecast', help: DAILY_HELP.iplh, value: r => R(r).cfIplh, render: r => fmt.dec1(R(r).cfIplh), group: 'IPLH'},
        {key: 'projIplh', header: 'Projected', value: r => R(r).projIplh, render: r => fmt.dec1(R(r).projIplh), group: 'IPLH'},
        {key: 'actIplh', header: 'Actual', value: r => R(r).actIplh, render: r => fmt.dec1(R(r).actIplh), group: 'IPLH'},
        {key: 'iplhVar', header: 'Actual vs Chain Forecast', value: r => variance(R(r).actIplh, R(r).cfIplh), render: r => <IplhDiff a={R(r).actIplh} b={R(r).cfIplh} />, group: 'IPLH'},
        {key: 'lyIplh', header: 'LY IPLH', help: DAILY_HELP.ly, value: r => R(r).lyIplh, render: r => fmt.dec1(R(r).lyIplh), group: 'IPLH'},
      ]
    : [
        {key: 'cfHours', header: 'Chain Forecast', help: DAILY_HELP.cf, value: r => T(r).cfHours, render: r => fmt.int(T(r).cfHours), group: 'Hours'},
        {key: 'toHit', header: 'Hours to hit PRO IPLH', help: DAILY_HELP.toHitPro, value: r => T(r).hoursToHit, render: r => fmt.int(T(r).hoursToHit), group: 'Hours'},
        {key: 'projHours', header: 'Store Projected', help: DAILY_HELP.projHours, value: r => T(r).projHours, render: r => fmt.int(T(r).projHours), group: 'Hours'},
        {key: 'hoursVar', header: 'Var', sub: 'Projected − Hrs to hit', value: r => variance(T(r).projHours, T(r).hoursToHit), render: r => <Diff a={T(r).projHours} b={T(r).hoursToHit} unit=" hrs" />, group: 'Hours'},
        {key: 'cfIplh', header: 'Chain Forecast', help: DAILY_HELP.iplh, value: r => R(r).cfIplh, render: r => fmt.dec1(R(r).cfIplh), group: 'IPLH'},
        {key: 'projIplh', header: 'Store Projected', value: r => R(r).projIplh, render: r => fmt.dec1(R(r).projIplh), group: 'IPLH'},
        {key: 'iplhVar', header: 'Var', sub: 'Projected − Chain Forecast', value: r => variance(R(r).projIplh, R(r).cfIplh), render: r => <IplhDiff a={R(r).projIplh} b={R(r).cfIplh} />, group: 'IPLH'},
        {key: 'lyIplh', header: 'LY IPLH', help: DAILY_HELP.ly, value: r => R(r).lyIplh, render: r => fmt.dec1(R(r).lyIplh), group: 'IPLH'},
      ];
  const rate: Column<Row>[] = cur
    ? [
        {key: 'budRate', header: 'Budget', help: DAILY_HELP.rateBud, value: r => R(r).budLaborRate, render: r => fmt.pct(R(r).budLaborRate, 2), group: 'Labor Rate'},
        {key: 'actRate', header: 'Actual', help: DAILY_HELP.rateActual, value: r => R(r).actLaborRate, render: r => fmt.pct(R(r).actLaborRate, 2), group: 'Labor Rate'},
        {key: 'rateVar', header: 'Actual vs Budget', sub: 'pp', value: r => ppDiff(R(r).actLaborRate, R(r).budLaborRate), render: r => <RateVar actual={R(r).actLaborRate} target={R(r).budLaborRate} />, group: 'Labor Rate'},
      ]
    : [
        {key: 'cfRate', header: 'Chain Forecast', sub: DAILY_RATE_TAG, help: DAILY_HELP.rateCf, value: r => R(r).cfLaborRate, render: r => fmt.pct(R(r).cfLaborRate, 2), group: `Labor Rate · ${DAILY_RATE_TAG}`},
        {key: 'projRate', header: 'Projected', help: DAILY_HELP.rateProj, value: r => R(r).projLaborRate, render: r => fmt.pct(R(r).projLaborRate, 2), group: `Labor Rate · ${DAILY_RATE_TAG}`},
        {key: 'rateVar', header: 'Var', sub: 'pp', value: r => ppDiff(R(r).projLaborRate, R(r).cfLaborRate), render: r => <RateVar actual={R(r).projLaborRate} target={R(r).cfLaborRate} />, group: `Labor Rate · ${DAILY_RATE_TAG}`},
      ];
  return measures === 'sales' ? sales : measures === 'hours' ? hours : measures === 'rate' ? rate : [...sales, ...hours, ...rate];
}

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
  const {role} = useReport();
  const [week, setWeek] = useState(REPORT_LAST_WEEK);
  const [cutoffChoice, setCutoff] = useState(6);
  const [section, setSection] = useState<ReportSection>('current');
  const [measures, setMeasures] = useState<Measures>('hours');
  const [hoursRef, setHoursRef] = useState<HoursRef>('budget');
  const weekId = useId();
  const cutoffId = useId();
  const stores = useMemo(() => storeScope(scope.filters, role, week), [scope.filters, role, week]);
  const cur = reportWeekDates(week);
  const available = AVAILABLE_DAY.get(week) ?? 6;
  // The selector can only move the cutoff back: actuals never extend past the latest day with data.
  const cutoff = Math.min(cutoffChoice, available);
  const simulated = cutoff < available;
  const dayIso = (i: number) => new Date(Date.parse(`${cur.start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  const shown = reportWeekDates(week + SECTION_OFFSET[section]);
  const isCurrent = section === 'current';
  const cutoffDate = new Date(Date.parse(`${cur.start}T00:00:00Z`) + cutoff * 86_400_000).toISOString().slice(0, 10);
  const weekTag = (d: {fy: number; week: number}) => `FY${d.fy} W${String(d.week).padStart(2, '0')}`;

  const levels = useMemo(
    () => ({
      store: reportRollup(stores, section, week, cutoff, 'store'),
      district: reportRollup(stores, section, week, cutoff, 'district'),
      region: reportRollup(stores, section, week, cutoff, 'region'),
      total: reportRollup(stores, section, week, cutoff, 'none').get('all'),
    }),
    [stores, section, week, cutoff],
  );
  const rows: Row[] = useMemo(() => buildOrgTree(stores, {region: id => levels.region.get(id), district: id => levels.district.get(id), store: id => levels.store.get(id)}), [stores, levels]);
  const autoOpen = useMemo(() => onlyChildIds(rows), [rows]);
  const tree = useMemo(() => ({children: (r: Row) => r.children, levels: ['Region', 'District', 'Store'], name: (r: Row) => r.name, defaultOpen: (r: Row) => autoOpen.has(r.id)}), [autoOpen]);
  const where = scopeLabel(stores);
  const total = levels.total;
  const days = useMemo(() => currentWeekDays(stores, week, cutoff), [stores, week, cutoff]);

  const periodLine = isCurrent
    ? `Current week · Week Ending ${usDate(cur.end)} (${weekTag(cur)}) · week to date through ${DAY_NAMES[cutoff]} ${usDate(cutoffDate)} · ${cutoff + 1} of 7 days with actuals${simulated ? ' (simulated cutoff)' : ''}`
    : `${section === 'next' ? 'Next week' : 'Future week'} · Week Ending ${usDate(shown.end)} (${weekTag(shown)}) · whole week · projected and forecast values only, no actuals · illustrative`;
  const exportBase = `daily-labor-update-${section}-week-ending-${usDate(shown.end).replaceAll('/', '-')}`;
  const exportNotes = [periodLine, `Location: ${where}`, 'Report reference: Daily Labor Update (email subject: Payroll Update)'];
  const totalRow: Row | null = total ? {id: 'total', level: 'region', name: 'Total', sub: '', search: '', dept: null, storeIds: [...stores], data: total, children: []} : null;
  const columns: Column<Row>[] = [{key: 'name', header: 'Region / District / Store', value: r => r.name, render: r => (r.sub ? <>{r.name}<span className="cell-sub">{r.sub}</span></> : r.name), align: 'left'}, ...columnsFor(section, measures)];
  const ratios = total ? reportRatios(total) : null;
  const hRef = hoursRefName(hoursRef);
  const rh = (d: (typeof days)[number]) => (hoursRef === 'mdoc' ? d.hoursMdoc : d.hoursBud);
  const chartRows = days.map(d => ({label: shortDay(d.date), hours: d.hours, proj: d.projHours, ref: rh(d), reported: d.reported, pay: d.pay, payBud: d.budPay}));

  const cards: ReactNode = total && ratios ? (
    isCurrent ? (
      <section className="kpi-grid five" aria-label="Current week to date">
        <KpiCard level="primary" label="Sales · week to date" value={fmt.compactMoney(total.actSales)} hint={DAILY_HELP.actual} lines={[{label: 'Store Projected', value: fmt.compactMoney(total.projSales)}, {label: 'Actual vs Store Projected', value: <MoneyDiff a={total.actSales} b={total.projSales} />}, {label: 'Chain Forecast', value: fmt.compactMoney(total.cfSales)}]} />
        <KpiCard level="primary" label="Hours · week to date" value={fmt.compactHours(total.actHours)} hint={DAILY_HELP.toHit} lines={[{label: 'Hours to hit IPLH', value: fmt.compactHours(total.hoursToHit)}, {label: 'Actual vs Hrs to hit IPLH', value: <HoursVar actual={total.actHours} target={total.hoursToHit} />}, {label: 'Store Projected', value: fmt.compactHours(total.projHours)}]} />
        <KpiCard level="primary" label="IPLH · week to date" value={fmt.dec1(ratios.actIplh)} hint={DAILY_HELP.iplh} lines={[{label: 'Chain Forecast', value: fmt.dec1(ratios.cfIplh)}, {label: 'Actual vs Chain Forecast', value: <IplhDiff a={ratios.actIplh} b={ratios.cfIplh} />}, {label: 'LY IPLH (whole LY week)', value: fmt.dec1(ratios.lyIplh)}]} />
        <KpiCard label="Items · week to date" value={fmt.int(total.actItems)} hint={DAILY_HELP.projItems} lines={[{label: 'Store Projected', value: fmt.int(total.projItems)}, {label: 'Actual vs Store Projected', value: <Diff a={total.actItems} b={total.projItems} />}]} />
        <KpiCard label="Labor Rate · week to date" value={fmt.pct(ratios.actLaborRate, 2)} hint={DAILY_HELP.rateActual} lines={[{label: 'Budget', value: fmt.pct(ratios.budLaborRate, 2)}, {label: 'Actual vs Budget', value: <RateVar actual={ratios.actLaborRate} target={ratios.budLaborRate} />}]} />
      </section>
    ) : (
      <section className="kpi-grid five" aria-label={`${section === 'next' ? 'Next' : 'Future'} week projections`}>
        <KpiCard level="primary" label="Sales · Store Projected" value={fmt.compactMoney(total.projSales)} hint={DAILY_HELP.proj} lines={[{label: 'Chain Forecast', value: fmt.compactMoney(total.cfSales)}, {label: 'Var', value: <MoneyDiff a={total.projSales} b={total.cfSales} />}]} />
        <KpiCard level="primary" label="Hours · Store Projected" value={fmt.compactHours(total.projHours)} hint={DAILY_HELP.toHitPro} lines={[{label: 'Hours to hit PRO IPLH', value: fmt.compactHours(total.hoursToHit)}, {label: 'Var', value: <HoursVar actual={total.projHours} target={total.hoursToHit} />}, {label: 'Chain Forecast', value: fmt.compactHours(total.cfHours)}]} />
        <KpiCard level="primary" label="IPLH · Store Projected" value={fmt.dec1(ratios.projIplh)} hint={DAILY_HELP.iplh} lines={[{label: 'Chain Forecast', value: fmt.dec1(ratios.cfIplh)}, {label: 'Var', value: <IplhDiff a={ratios.projIplh} b={ratios.cfIplh} />}, {label: 'LY IPLH', value: fmt.dec1(ratios.lyIplh)}]} />
        <KpiCard label="Items · Store Projected" value={fmt.int(total.projItems)} hint={DAILY_HELP.projItems} lines={[{label: 'Chain Forecast', value: fmt.int(total.cfItems)}, {label: 'Var', value: <Diff a={total.projItems} b={total.cfItems} />}]} />
        <KpiCard label="Labor Rate · Projected" tag={DAILY_RATE_TAG} value={fmt.pct(ratios.projLaborRate, 2)} hint={DAILY_HELP.rateProj} lines={[{label: 'Chain Forecast', value: fmt.pct(ratios.cfLaborRate, 2)}, {label: 'Var', value: <RateVar actual={ratios.projLaborRate} target={ratios.cfLaborRate} />}]} />
      </section>
    )
  ) : null;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <div className="local-controls" role="group" aria-label="Report week and data cutoff">
        <div className="fb-field">
          <label htmlFor={weekId}>Week Ending</label>
          <select id={weekId} value={week} onChange={e => setWeek(Number(e.target.value))}>
            {WEEK_OPTIONS.map(w => (
              <option key={w.idx} value={w.idx}>
                {usDate(w.end)} · FY{w.fy} W{String(w.week).padStart(2, '0')}
                {w.idx === REPORT_LAST_WEEK ? ' · latest week' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="fb-field">
          <label htmlFor={cutoffId}>Data through</label>
          <select id={cutoffId} value={cutoff} onChange={e => setCutoff(Number(e.target.value))} aria-describedby={`${cutoffId}-help`}>
            {DAY_NAMES.map((n, i) => (
              <option key={n} value={i} disabled={i > available}>
                {n} {usDate(dayIso(i))}
                {i === available ? ' · latest available' : i > available ? ' · no data yet' : ''}
              </option>
            ))}
          </select>
          <span className="fb-help" id={`${cutoffId}-help`}>
            Data available through {usDate(dayIso(available))}. An earlier day simulates an earlier cutoff; nothing is loaded or refreshed. <InfoTip text={DAILY_HELP.cutoff} label="About Data through" align="left" />
          </span>
        </div>
        <div className="fb-field">
          <span className="fb-label">Report section</span>
          <Segmented label="Report section" value={section} options={SECTIONS} onChange={setSection} />
        </div>
        <p className="note">
          Layout follows the Daily Labor Update (sent by email as the Payroll Update). Week Ending selects the current week; Data through sets the week-to-date cutoff; next and future weeks show projections only. Synthetic data; daily refresh is the intended production behavior, the prototype does not refresh. <DecisionChip ids={['D38']} label="Open" align="left" />
        </p>
      </div>
      <p className="scope-line">
        <span className="scope-title">Showing</span>
        <span className="scope-part daily-period">{periodLine}</span>
        {scope.applied.filter(a => !a.startsWith('Time frame')).map(a => (
          <span key={a} className="scope-part">
            {a}
          </span>
        ))}
        <span className="scope-count">{stores.size} stores</span>
      </p>
      {!total || !totalRow ? (
        <EmptyState>No report data for this selection. Try another week or location, or use Reset filters.</EmptyState>
      ) : (
        <>
          {cards}
          <VisualCard
            className="daily-report"
            title={`Daily Labor Update · ${SECTIONS.find(s => s.id === section)!.label}`}
            subtitle={isCurrent ? 'Week to date through the data cutoff, by region, district and store. Totals add the store values; IPLH and Labor Rate are recalculated from those totals.' : 'Whole-week projections by region, district and store, illustrative synthetic values; the prototype does not calculate or refresh forecasts. No actuals exist yet for this week. Labor Rate reference is provisional (D38).'}
            filters={<VisualFilters scope={scope} notes={[periodLine, ...(isCurrent ? [DAILY_HELP.cutoff] : [DAILY_HELP.illustrative]), 'Store level, as the reference report: there is no department detail, and the Department filter does not apply.', 'Chain, region and district rows add up their stores; IPLH = items / hours and Labor Rate = payroll $ / sales of those totals (never an average of store ratios).', 'A missing value is shown as n/a or —, never as 0.']} />}
            actions={<Segmented label="Report columns" value={measures} options={[{id: 'sales', label: 'Sales & items'}, {id: 'hours', label: 'Hours & IPLH'}, {id: 'rate', label: 'Labor Rate'}, {id: 'all', label: 'All report columns'}]} onChange={setMeasures} size="sm" />}
          >
            <p className="table-scope">
              <b>Showing</b> {where} · {isCurrent ? `week to date through ${usDate(cutoffDate)}` : `Week Ending ${usDate(shown.end)}, projections only`} · Total row = all stores in scope
            </p>
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="Daily Labor Update by region, district and store" searchText={r => r.search} searchPlaceholder="Search region, district or store…" countNoun={rows.length === 1 ? 'region' : 'regions'} tree={tree} pinned={[totalRow]} pinnedLabel={() => `Total · ${where}`} exportName={exportBase} exportNotes={exportNotes} maxHeight={520} />
          </VisualCard>

          {isCurrent ? (
            <VisualCard
              title={`Day by day · Week Ending ${usDate(cur.end)}`}
              subtitle="Actual hours for the days reported so far against the store schedule and the selected target. Days after the cutoff show projections only."
              filters={<VisualFilters scope={scope} notes={[`Data through ${DAY_NAMES[cutoff]} ${usDate(cutoffDate)}.`, HOURS_REF_HELP]} />}
              actions={
                <span className="fb-label">
                  Compare hours with <InfoTip text={HOURS_REF_HELP} label="About the hours reference" align="right" /> <Segmented label="Compare daily hours with" value={hoursRef} options={HOURS_REF_OPTIONS} onChange={setHoursRef} size="sm" />
                </span>
              }
            >
              <ChartKey items={[{label: 'Actual hours (reported days)', color: C.actual}, {label: 'Store Projected hours', color: C.ly, kind: 'line'}, {label: `${hRef} hours`, color: C.reference, kind: 'dash'}]} />
              <div className="chart-h280">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{top: 8, right: 12, left: 8, bottom: 0}}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={DayTick} interval={0} height={36} />
                    <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.compact(v)} />
                    <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.label} rows={[{label: 'Actual hours', value: payload[0].payload.reported ? fmt.int(payload[0].payload.hours) : 'Not reported yet', swatch: C.actual}, {label: 'Store Projected hours', value: fmt.int(payload[0].payload.proj), swatch: C.ly}, {label: `${hRef} hours`, value: fmt.int(payload[0].payload.ref), swatch: C.reference}, {label: 'Payroll $ actual', value: payload[0].payload.reported ? fmt.money(payload[0].payload.pay) : 'Not reported yet'}, {label: 'Payroll $ budget', value: fmt.money(payload[0].payload.payBud)}]} /> : null)} />
                    <Bar dataKey="hours" isAnimationActive={ANIMATE} maxBarSize={48} fill={C.actual} />
                    <Line dataKey="proj" stroke={C.ly} strokeWidth={2} isAnimationActive={ANIMATE} />
                    <Line dataKey="ref" stroke={C.reference} strokeWidth={2} strokeDasharray="5 3" isAnimationActive={ANIMATE} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <DataTable
                rows={days}
                columns={[
                  {key: 'day', header: 'Day', value: d => d.day, exportValue: d => usDate(d.date), render: d => `${DAY_NAMES[d.day]} ${usDate(d.date)}`, align: 'left'},
                  {key: 'sales', header: 'Actual', value: d => d.sales, render: d => (d.reported ? fmt.money(d.sales) : noActual), group: 'Sales'},
                  {key: 'projSales', header: 'Store Projected', value: d => d.projSales, render: d => fmt.money(d.projSales), group: 'Sales'},
                  {key: 'budSales', header: 'Budget', value: d => d.budSales, render: d => fmt.money(d.budSales), group: 'Sales'},
                  {key: 'hours', header: 'Actual', value: d => d.hours, render: d => (d.reported ? fmt.int(d.hours) : noActual), group: 'Hours'},
                  {key: 'projHours', header: 'Store Projected', value: d => d.projHours, render: d => fmt.int(d.projHours), group: 'Hours'},
                  {key: 'refHours', header: hRef, value: d => rh(d), render: d => fmt.int(rh(d)), group: 'Hours'},
                  {key: 'hoursVar', header: `Actual vs ${hRef}`, sub: 'hrs (%)', value: d => variance(d.hours, rh(d)), render: d => (d.reported ? <HoursVar actual={d.hours} target={rh(d)} /> : noActual), group: 'Hours'},
                  {key: 'pay', header: 'Actual', value: d => d.pay, render: d => (d.reported ? fmt.money(d.pay) : noActual), group: 'Payroll $'},
                  {key: 'budPay', header: 'Budget', value: d => d.budPay, render: d => fmt.money(d.budPay), group: 'Payroll $'},
                ]}
                rowKey={d => String(d.day)}
                label="Current week day by day"
                countNoun="days"
                initialSort={{key: 'day', dir: 'asc'}}
                exportName={`daily-labor-update-days-week-ending-${usDate(cur.end).replaceAll('/', '-')}`}
                exportNotes={exportNotes}
              />
            </VisualCard>
          ) : null}
        </>
      )}
    </div>
  );
}
