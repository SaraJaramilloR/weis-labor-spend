// Workbook view R65 "Headcount & Hours vs Budget" (User Story 4): labor hours (actual vs budgeted hrs), labor
// spend (actual vs budgeted $), AHR (actual vs budget), overtime ($ / hrs) and current headcount, by region,
// district and store. Budget is the primary comparison; an exploratory reference (Discovery options) is secondary.
// Oct 28 review: the business wants to find quickly the stores with the largest labor-rate differences, so the same
// rows can be shown as an expandable hierarchy or as a sortable store comparison (labor rate actual vs budget, spend
// and hours variance). Both presentations use the same rollups and columns. No ratings, thresholds or status colors.
// Review follow-up: Overtime Rate (% of payroll, excl. Pharmacy) is shown here, where the percentage view was asked
// for (41:19), and hours can be compared with Budget or with the MDoc operational target (23:44). Spend, labor rate
// and AHR stay on Budget.
import {useMemo, useState} from 'react';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, PctVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {HOURS_BUDGET_HELP, HOURS_MDOC_HELP, HOURS_REF_HELP, HOURS_REF_OPTIONS, OT_HOURS_HELP, OT_PAY_HELP, OT_RATE_HELP, hoursRefName, type HoursRef} from '../config/references';
import {districtById, regionById, storeById} from '../data/org';
import {refAhr, refHours, refSpend, rollup, total, type LaborTotals, type Rollup} from '../lib/aggregate';
import {TARGET_LABEL, type Target} from '../lib/filters';
import {fmt} from '../lib/format';
import {ahr, laborRate, otRate, ppDiff, variance, variancePct} from '../lib/metrics';
import {buildOrgTree, onlyChildIds, scopeLabel, type OrgNode} from '../lib/orgTree';
import {peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';

const META = pageById.get('budget')!;
type Mode = 'hierarchy' | 'stores';
/** One row: a region, district or store with its own rollup and ending headcount (a snapshot, summed across stores). */
type Row = OrgNode<{r: Rollup; hc: number}>;

const HELP = {
  hours: 'Actual labor hours in the time frame. Vacation hours are not included (D17).',
  hoursBud: HOURS_BUDGET_HELP,
  hoursVar: 'Labor hours variance = Actual hours − Budgeted hours.',
  hoursVarPct: 'Labor hours variance, % = (Actual − Budget) / Budget. Above or below budget is not good or bad by itself.',
  pay: 'Labor spend, $: actual payroll dollars as supplied by the source.',
  payBud: 'Budgeted labor spend, $ (SO 1007). Budget source per KPI is open (D01).',
  payVar: 'Labor spend variance, $ = Actual spend − Budgeted spend.',
  payVarPct: 'Labor spend variance, % = (Actual − Budget) / Budget.',
  rate: 'Labor rate actual, % = Labor spend $ / Total Sales $ of the same stores and weeks (sales basis open, D19).',
  rateBud: 'Labor rate budget, % = Budgeted labor $ / Budgeted sales $ (SO 1007).',
  rateDiff: 'Labor rate difference = Actual labor rate − Budget labor rate, in percentage points (pp): 9.40% − 9.20% = +0.20 pp. Not a relative % change.',
  salesVar: 'Sales vs Budget, % = (Total Sales − Budgeted sales) / Budgeted sales. Context for the labor rate: a store selling above budget can spend above its labor budget and still keep its labor rate.',
  ahr: 'Average Hourly Rate (AHR), actual = Labor spend $ / Labor hours.',
  ahrBud: 'AHR, budget = Budgeted labor $ / Budgeted hours.',
  otPay: OT_PAY_HELP,
  otHours: OT_HOURS_HELP,
  hc: 'Ending headcount: active associates on the last day of the time frame (a snapshot). Region and district rows add up the stores at the same date.',
  otRate: OT_RATE_HELP,
  hoursMdoc: HOURS_MDOC_HELP,
} as const;

export default function BudgetPage() {
  const scope = useScope('budget');
  const {filters, update} = useReport();
  const alt: Target | null = filters.reference === 'none' ? null : filters.reference;
  const altName = alt ? `${TARGET_LABEL[alt]} (exploratory)` : '';
  const [mode, setMode] = useState<Mode>('hierarchy');
  const [hoursRef, setHoursRef] = useState<HoursRef>('budget');
  const hRef = hoursRefName(hoursRef);
  const hTarget = (x: LaborTotals) => (hoursRef === 'mdoc' ? x.hoursMdoc : x.hoursBud);

  const t = useMemo(() => total(scope.stores, 'All', scope.from, scope.to), [scope]);
  const levels = useMemo(() => ({region: rollup(scope.stores, 'All', scope.from, scope.to, 'region'), district: rollup(scope.stores, 'All', scope.from, scope.to, 'district'), store: rollup(scope.stores, 'All', scope.from, scope.to, 'store')}), [scope]);
  const hc = useMemo(() => peopleRollup(scope.stores, {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'}, scope.from, scope.to, 'store'), [scope]);
  const currentHc = [...hc.values()].reduce((s, p: PeopleTotals) => s + p.end, 0);
  const L = t.labor;

  const tree = useMemo(() => {
    const nodes: Row[] = buildOrgTree(scope.stores, {
      region: id => (levels.region.get(id) ? {r: levels.region.get(id)!, hc: 0} : undefined),
      district: id => (levels.district.get(id) ? {r: levels.district.get(id)!, hc: 0} : undefined),
      store: id => (levels.store.get(id) ? {r: levels.store.get(id)!, hc: 0} : undefined),
    });
    // Ending headcount of each row = the stores below it at the same date.
    const fill = (list: Row[]) => list.forEach(n => ((n.data.hc = n.storeIds.reduce((s, id) => s + (hc.get(id)?.end ?? 0), 0)), fill(n.children)));
    fill(nodes);
    return nodes;
  }, [scope.stores, levels, hc]);
  const storeRows = useMemo(() => tree.flatMap(r => r.children.flatMap(d => d.children)), [tree]);
  const autoOpen = useMemo(() => onlyChildIds(tree), [tree]);
  const treeOptions = useMemo(() => ({children: (r: Row) => r.children, levels: ['Region', 'District', 'Store'], name: (r: Row) => r.name, defaultOpen: (r: Row) => autoOpen.has(r.id)}), [autoOpen]);
  const where = scopeLabel(scope.stores);
  const totalRow: Row = {id: 'total', level: 'region', name: 'Total', sub: '', search: '', dept: null, storeIds: [...scope.stores], data: {r: t, hc: currentHc}, children: []};

  const X = (r: Row) => r.data.r.labor;
  const hoursGroup = hoursRef === 'mdoc' ? 'Labor hours vs MDoc (operational target)' : 'Labor hours vs Budget';
  const rate = (r: Row) => laborRate(X(r).pay, X(r).sales);
  const rateBud = (r: Row) => laborRate(X(r).payBud, X(r).salesBud);
  const c = {
    hours: {key: 'hours', header: 'Actual', help: HELP.hours, value: (r: Row) => X(r).hours, render: (r: Row) => fmt.int(X(r).hours), group: hoursGroup},
    hoursBud: {key: 'hoursBud', header: hRef, help: hoursRef === 'mdoc' ? HELP.hoursMdoc : HELP.hoursBud, value: (r: Row) => hTarget(X(r)), render: (r: Row) => fmt.int(hTarget(X(r))), group: hoursGroup},
    hoursVar: {key: 'hoursVar', header: 'Variance', sub: 'hrs', help: `Labor hours variance = Actual hours − ${hRef} hours.`, value: (r: Row) => variance(X(r).hours, hTarget(X(r))), render: (r: Row) => fmt.signedInt(variance(X(r).hours, hTarget(X(r)))), group: hoursGroup},
    hoursVarPct: {key: 'hoursVarPct', header: 'Var %', help: `Labor hours variance, % = (Actual − ${hRef}) / ${hRef}. Above or below the reference is not good or bad by itself.`, value: (r: Row) => variancePct(X(r).hours, hTarget(X(r))), render: (r: Row) => <PctVar actual={X(r).hours} target={hTarget(X(r))} />, group: hoursGroup},
    pay: {key: 'pay', header: 'Actual', help: HELP.pay, value: (r: Row) => X(r).pay, render: (r: Row) => fmt.money(X(r).pay), group: 'Labor spend'},
    payBud: {key: 'payBud', header: 'Budget', help: HELP.payBud, value: (r: Row) => X(r).payBud, render: (r: Row) => fmt.money(X(r).payBud), group: 'Labor spend'},
    payVar: {key: 'payVar', header: 'Variance', sub: '$', help: HELP.payVar, value: (r: Row) => variance(X(r).pay, X(r).payBud), render: (r: Row) => fmt.signedMoney(variance(X(r).pay, X(r).payBud)), group: 'Labor spend'},
    payVarPct: {key: 'payVarPct', header: 'Var %', help: HELP.payVarPct, value: (r: Row) => variancePct(X(r).pay, X(r).payBud), render: (r: Row) => <PctVar actual={X(r).pay} target={X(r).payBud} />, group: 'Labor spend'},
    rate: {key: 'rate', header: 'Actual', sub: '% of sales', help: HELP.rate, value: rate, render: (r: Row) => fmt.pct(rate(r), 2), group: 'Labor rate'},
    rateBud: {key: 'rateBud', header: 'Budget', sub: '% of sales', help: HELP.rateBud, value: rateBud, render: (r: Row) => fmt.pct(rateBud(r), 2), group: 'Labor rate'},
    rateDiff: {key: 'rateDiff', header: 'Difference', sub: 'pp', help: HELP.rateDiff, value: (r: Row) => ppDiff(rate(r), rateBud(r)), render: (r: Row) => <RateVar actual={rate(r)} target={rateBud(r)} />, group: 'Labor rate'},
    salesVar: {key: 'salesVar', header: 'Sales vs Budget', sub: '%', help: HELP.salesVar, value: (r: Row) => variancePct(X(r).sales, X(r).salesBud), render: (r: Row) => <PctVar actual={X(r).sales} target={X(r).salesBud} />, group: 'Context'},
    ahr: {key: 'ahr', header: 'Actual', help: HELP.ahr, value: (r: Row) => ahr(X(r).pay, X(r).hours), render: (r: Row) => fmt.money2(ahr(X(r).pay, X(r).hours)), group: 'AHR'},
    ahrBud: {key: 'ahrBud', header: 'Budget', help: HELP.ahrBud, value: (r: Row) => ahr(X(r).payBud, X(r).hoursBud), render: (r: Row) => fmt.money2(ahr(X(r).payBud, X(r).hoursBud)), group: 'AHR'},
    otPay: {key: 'otPay', header: '$', help: HELP.otPay, value: (r: Row) => X(r).otPay, render: (r: Row) => fmt.money(X(r).otPay), group: 'Overtime (excl. RX)'},
    otHours: {key: 'otHours', header: 'Hours', help: HELP.otHours, value: (r: Row) => X(r).otHours, render: (r: Row) => fmt.int(X(r).otHours), group: 'Overtime (excl. RX)'},
    otRate: {key: 'otRate', header: 'Overtime Rate', sub: '% of payroll, excl. Pharmacy', help: HELP.otRate, value: (r: Row) => otRate(X(r).otPay, X(r).otBasePay), render: (r: Row) => fmt.pct(otRate(X(r).otPay, X(r).otBasePay), 2), group: 'Overtime (excl. RX)'},
    hc: {key: 'hc', header: 'Ending headcount', help: HELP.hc, value: (r: Row) => r.data.hc, render: (r: Row) => fmt.int(r.data.hc), group: 'People'},
  } satisfies Record<string, Column<Row>>;
  const altCols: Column<Row>[] = alt
    ? [
        ...(alt === 'mdoc' ? [] : [{key: 'altHours', header: 'Hours var %', help: `Labor hours vs ${TARGET_LABEL[alt]}, % (exploratory, from Discovery options).`, value: (r: Row) => variancePct(X(r).hours, refHours(X(r), alt)), render: (r: Row) => <span className="exploratory"><PctVar actual={X(r).hours} target={refHours(X(r), alt)} /></span>, group: `vs ${altName}`}]),
        {key: 'altSpend', header: 'Spend var %', help: `Labor spend vs ${TARGET_LABEL[alt]}, % (exploratory, from Discovery options).`, value: r => variancePct(X(r).pay, refSpend(X(r), alt)), render: r => <span className="exploratory"><PctVar actual={X(r).pay} target={refSpend(X(r), alt)} /></span>, group: `vs ${altName}`},
      ]
    : [];
  const nameCol: Column<Row> = {
    key: 'name',
    header: mode === 'hierarchy' ? 'Region / District / Store' : 'Store',
    value: r => (mode === 'stores' && r.level === 'store' ? storeById.get(r.id)!.number : r.name),
    render: r => (r.sub ? <>{r.name}<span className="cell-sub">{mode === 'stores' ? `${districtById.get(storeById.get(r.id)?.districtId ?? '')?.name ?? ''} · ${regionById.get(storeById.get(r.id)?.regionId ?? '')?.name ?? ''}` : r.sub}</span></> : r.name),
    align: 'left',
  };
  const columns: Column<Row>[] =
    mode === 'hierarchy'
      ? [nameCol, c.hours, c.hoursBud, c.hoursVarPct, c.pay, c.payBud, c.payVarPct, c.rate, c.rateBud, c.rateDiff, c.ahr, c.ahrBud, c.otPay, c.otHours, c.otRate, c.hc, ...altCols]
      : [nameCol, c.rate, c.rateBud, c.rateDiff, c.pay, c.payBud, c.payVar, c.payVarPct, c.hours, c.hoursBud, c.hoursVar, c.hoursVarPct, c.otRate, c.salesVar, ...altCols];
  const toStore = (r: Row) => update({store: r.id, district: storeById.get(r.id)!.districtId, region: storeById.get(r.id)!.regionId});

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <ScopeLine scope={scope} />
      {L.rows === 0 ? (
        <EmptyState>No data for this selection. Try another time frame or use Reset filters.</EmptyState>
      ) : (
        <>
          <div className="card-compare">
            <span className="card-compare-label" aria-hidden="true">
              Compare hours with
            </span>
            <Segmented label="Compare labor hours with" value={hoursRef} options={HOURS_REF_OPTIONS} onChange={setHoursRef} size="sm" />
            <InfoTip
              align="left"
              label="About the hours reference"
              text={HOURS_REF_HELP}
            />
            <DecisionChip ids={['D01']} label="Open" align="left" />
          </div>
          <section className="kpi-grid five" aria-label="Hours and spend versus budget">
            <KpiCard level="primary" label="Labor hours" value={fmt.compactHours(L.hours)} decisions={['D01']} hint={hoursRef === 'mdoc' ? HELP.hoursMdoc : HELP.hoursBud} lines={[{label: hRef, value: fmt.compactHours(hTarget(L))}, {label: `vs ${hRef}`, value: <HoursVar actual={L.hours} target={hTarget(L)} />}, ...(alt === 'ly' ? [{label: `vs ${altName}`, value: <HoursVar actual={L.hours} target={refHours(L, alt)} />}] : [])]} />
            <KpiCard level="primary" label="Labor spend" value={fmt.compactMoney(L.pay)} decisions={['D01']} lines={[{label: 'Budget', value: fmt.compactMoney(L.payBud)}, {label: 'vs Budget', value: <MoneyVar actual={L.pay} target={L.payBud} />}, ...(alt ? [{label: `vs ${altName}`, value: <MoneyVar actual={L.pay} target={refSpend(L, alt)} />}] : [])]} />
            <KpiCard label="Average hourly rate" value={fmt.money2(ahr(L.pay, L.hours))} lines={[{label: 'Budget', value: fmt.money2(ahr(L.payBud, L.hoursBud))}, {label: 'vs Budget', value: <RatioVar actual={ahr(L.pay, L.hours)} target={ahr(L.payBud, L.hoursBud)} digits={2} prefix="$" />}, ...(alt ? [{label: altName, value: fmt.money2(refAhr(L, alt))}] : [])]} />
            <KpiCard label="Overtime Rate (% of Payroll, excl. Pharmacy)" value={fmt.pct(otRate(L.otPay, L.otBasePay), 2)} hint={HELP.otRate} decisions={['D03', 'D04']} lines={[{label: 'Overtime $', value: fmt.compactMoney(L.otPay)}, {label: 'Overtime hours', value: fmt.int(L.otHours)}, {label: '$ vs LY', value: <PctVar actual={L.otPay} target={L.otPayLY} />}]} />
            <KpiCard label="Current headcount" value={fmt.int(currentHc)} hint="Active associates at the end of the time frame (a snapshot, not a sum of weeks)." decisions={['D12']} lines={[{label: 'Snapshot', value: 'End of time frame'}]} />
          </section>

          <VisualCard
            title={mode === 'hierarchy' ? (hoursRef === 'mdoc' ? 'Hours vs MDoc and Spend vs Budget by Region, District and Store' : 'Hours & Spend vs Budget by Region, District and Store') : hoursRef === 'mdoc' ? 'Store comparison: labor rate and spend vs Budget, hours vs MDoc' : 'Store comparison: labor rate, spend and hours vs Budget'}
            subtitle={`${mode === 'hierarchy' ? 'Select + to see the districts and stores below a row. Every column sorts within each level.' : 'One row per store. Sort any column, for example the labor rate difference or the spend variance, to find the largest differences.'}${hoursRef === 'mdoc' ? ' Hours are compared with the MDoc operational target; spend, labor rate and AHR with Budget.' : ''}`}
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  'Both presentations use the same rows and calculations: hierarchy rows are calculated from the totals of each region or district, never by averaging stores.',
                  'Labor rate difference is in percentage points (pp). Sorting only orders the stores: no rating, threshold or status color is applied.',
                  ...(alt ? [`Columns marked exploratory compare with ${TARGET_LABEL[alt]}; Budget remains the primary comparison.`] : []),
                ]}
              />
            }
            actions={<Segmented label="Table presentation" value={mode} options={[{id: 'hierarchy', label: 'Hierarchy'}, {id: 'stores', label: 'Store comparison'}]} onChange={setMode} size="sm" />}
          >
            <p className="table-scope">
              <b>Showing</b> {where} · Total row = all stores in scope · Hours vs {hoursRef === 'mdoc' ? 'MDoc (operational target)' : 'Budget'}; spend, labor rate and AHR vs Budget (SO 1007) <DecisionChip ids={['D01', 'D19']} label="Open" align="left" />
            </p>
            {mode === 'hierarchy' ? (
              <DataTable
                key="hierarchy"
                rows={tree}
                columns={columns}
                rowKey={r => r.id}
                label="Hours and spend versus budget by region, district and store"
                searchText={r => r.search}
                searchPlaceholder="Search region, district or store…"
                countNoun={tree.length === 1 ? 'region' : 'regions'}
                tree={treeOptions}
                pinned={[totalRow]}
                pinnedLabel={() => `Total · ${where}`}
                onRowClick={toStore}
                rowClickable={r => r.level === 'store'}
                exportName="headcount-hours-vs-budget-hierarchy"
                maxHeight={560}
              />
            ) : (
              <DataTable
                key="stores"
                rows={storeRows}
                columns={columns}
                rowKey={r => r.id}
                label="Store comparison of labor rate, spend and hours versus budget"
                searchText={r => `${r.search} ${r.sub} ${regionById.get(storeById.get(r.id)?.regionId ?? '')?.name ?? ''}`}
                searchPlaceholder="Search store, district or region…"
                countNoun="stores"
                pinned={[totalRow]}
                pinnedLabel={() => `Total · ${where}`}
                onRowClick={toStore}
                initialSort={{key: 'rateDiff', dir: 'desc'}}
                exportName="headcount-hours-vs-budget-store-comparison"
                maxHeight={560}
              />
            )}
            <p className="note">Select a store name to filter the report to that store. A store above its labor budget while selling above budget may be staffing to demand: read the labor variance with the labor rate and sales vs Budget.</p>
          </VisualCard>
        </>
      )}
    </div>
  );
}
