// Workbook view R62 "Store Ops Labor Allocation" (User Story 1). Required KPIs, by store and department:
// gross sales ($ TY / LY), items sold (# TY / LY), customer count, basket size, sales per transaction, AIV,
// estimated inflation, sales per square foot, labor hours (TY / LY), labor spend ($ TY / LY), budgeted labor ($),
// AHR (actual / budget), overtime ($ / hrs), overtime rate (excl. RX), vacation hours, IPLH and labor rate.
// Filters: date range, region, district, store number, department, position, tenure, state and geography.
import {useMemo, useState} from 'react';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {deptLabel, useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {PctVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DEPARTMENTS, districtById, storeById} from '../data/org';
import {customerBase, rollup, total, type LaborTotals, type Rollup} from '../lib/aggregate';
import {ALL} from '../lib/filters';
import {fmt} from '../lib/format';
import {laborForPeople, peopleFilterActive} from '../lib/laborPeople';
import {ahr, aiv, basketSize, iplh, laborRate, otRate, ppDiff, ratio, salesPerTx, variance, variancePct, yoyChange, yoyPct} from '../lib/metrics';

const META = pageById.get('allocation')!;
type Group = 'sales' | 'labor' | 'productivity';
/** `lp`: labor actuals of the Position / Tenure population (null when no people filter is active). */
type Row = {id: string; name: string; district: string; r: Rollup; lp: LaborTotals | null; deptKey: 'All' | string};

const inflation = (l: LaborTotals) => yoyPct(aiv(l.sales, l.items), aiv(l.salesLY, l.itemsLY));
// Why a value is n/a under a Position / Tenure filter. Actual ratios and budget comparisons have different reasons.
const NA_BUDGET = 'Budget is set by store, department and period, not by Position / Tenure';
const NA_ATTRIBUTION = 'Items and sales are recorded by store and department and cannot be attributed to a Position / Tenure population (hours and pay can), so the actual ratio has no compatible numerator';

function columnsFor(group: Group, opts: {storeLevel: boolean; lyAvailable: boolean}): Column<Row>[] {
  const L = (r: Row) => r.r.labor; // sales, items, budget: store × department × week
  const A = (r: Row) => r.lp ?? r.r.labor; // labor actuals, filtered by Position / Tenure when active
  const filtered = (r: Row) => r.lp !== null;
  const ly = (r: Row, v: number) => (filtered(r) && !opts.lyAvailable ? null : v);
  const na = (r: Row, v: number | null) => (filtered(r) ? null : v);
  const naCell = (r: Row, text: string, why: string = NA_BUDGET) => (filtered(r) ? <span className="na" title={why}>n/a</span> : text);
  const C = (r: Row) => customerBase(r.r, r.deptKey);
  if (group === 'sales')
    return [
      {key: 'sales', header: 'Gross Sales TY', value: r => L(r).sales, render: r => fmt.money(L(r).sales), group: 'Gross sales'},
      {key: 'salesLY', header: 'Gross Sales LY', value: r => L(r).salesLY, render: r => fmt.money(L(r).salesLY), group: 'Gross sales'},
      {key: 'yoyAmt', header: 'YoY Growth ($)', value: r => yoyChange(L(r).sales, L(r).salesLY), render: r => fmt.signedMoney(yoyChange(L(r).sales, L(r).salesLY)), group: 'Gross sales'},
      {key: 'yoyPct', header: 'YoY Growth (%)', value: r => yoyPct(L(r).sales, L(r).salesLY), render: r => <PctVar actual={L(r).sales} target={L(r).salesLY} />, group: 'Gross sales'},
      {key: 'items', header: 'Items TY', value: r => L(r).items, render: r => fmt.int(L(r).items), group: 'Items sold'},
      {key: 'itemsLY', header: 'Items LY', value: r => L(r).itemsLY, render: r => fmt.int(L(r).itemsLY), group: 'Items sold'},
      {key: 'aiv', header: 'AIV', value: r => aiv(L(r).sales, L(r).items), render: r => fmt.money2(aiv(L(r).sales, L(r).items)), group: 'Item value'},
      {key: 'inflation', header: 'Est. inflation', sub: 'AIV vs LY', value: r => inflation(L(r)), render: r => fmt.signedPct(inflation(L(r))), group: 'Item value'},
      {key: 'tx', header: 'Customer count', sub: 'transactions', value: r => C(r).tx, render: r => fmt.int(C(r).tx), group: 'Customers'},
      {key: 'basket', header: 'Basket size', value: r => basketSize(C(r).items, C(r).tx), render: r => fmt.dec2(basketSize(C(r).items, C(r).tx)), group: 'Customers'},
      {key: 'spt', header: 'Sales / transaction', value: r => salesPerTx(C(r).sales, C(r).tx), render: r => fmt.money2(salesPerTx(C(r).sales, C(r).tx)), group: 'Customers'},
      ...(opts.storeLevel ? [{key: 'sqft', header: 'Sales / sq ft', sub: 'store level', value: (r: Row) => ratio(r.r.store.storeSales, r.r.store.sqft), render: (r: Row) => fmt.money2(ratio(r.r.store.storeSales, r.r.store.sqft)), group: 'Store'}] : []),
    ];
  if (group === 'labor')
    return [
      {key: 'hours', header: 'Hours TY', value: r => A(r).hours, render: r => fmt.int(A(r).hours), group: 'Labor hours'},
      {key: 'hoursLY', header: 'Hours LY', value: r => ly(r, A(r).hoursLY), render: r => fmt.int(ly(r, A(r).hoursLY)), group: 'Labor hours'},
      {key: 'pay', header: 'Spend TY', value: r => A(r).pay, render: r => fmt.money(A(r).pay), group: 'Labor spend'},
      {key: 'payLY', header: 'Spend LY', value: r => ly(r, A(r).payLY), render: r => fmt.money(ly(r, A(r).payLY)), group: 'Labor spend'},
      {key: 'payBud', header: 'Budgeted labor', value: r => na(r, L(r).payBud), render: r => naCell(r, fmt.money(L(r).payBud)), group: 'Labor spend'},
      {key: 'payVar', header: 'Var % vs Budget', value: r => na(r, variancePct(L(r).pay, L(r).payBud)), render: r => (filtered(r) ? naCell(r, '') : <PctVar actual={L(r).pay} target={L(r).payBud} />), group: 'Labor spend'},
      {key: 'ahr', header: 'AHR actual', value: r => ahr(A(r).pay, A(r).hours), render: r => fmt.money2(ahr(A(r).pay, A(r).hours)), group: 'Average hourly rate'},
      {key: 'ahrBud', header: 'AHR budget', value: r => na(r, ahr(L(r).payBud, L(r).hoursBud)), render: r => naCell(r, fmt.money2(ahr(L(r).payBud, L(r).hoursBud))), group: 'Average hourly rate'},
    ];
  return [
    {key: 'iplh', header: 'IPLH', value: r => na(r, iplh(L(r).items, L(r).hours)), render: r => naCell(r, fmt.dec1(iplh(L(r).items, L(r).hours)), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'iplhMdoc', header: 'IPLH vs MDoc', value: r => na(r, variance(iplh(L(r).items, L(r).hours), iplh(L(r).itemsMdoc, L(r).hoursMdoc))), render: r => (filtered(r) ? naCell(r, '', NA_ATTRIBUTION) : <RatioVar actual={iplh(L(r).items, L(r).hours)} target={iplh(L(r).itemsMdoc, L(r).hoursMdoc)} />), group: 'Productivity'},
    {key: 'rate', header: 'Labor rate', value: r => na(r, laborRate(L(r).pay, L(r).sales)), render: r => naCell(r, fmt.pct(laborRate(L(r).pay, L(r).sales), 2), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'rateBud', header: 'Labor rate vs Budget', value: r => na(r, ppDiff(laborRate(L(r).pay, L(r).sales), laborRate(L(r).payBud, L(r).salesBud))), render: r => (filtered(r) ? naCell(r, '', NA_ATTRIBUTION) : <RateVar actual={laborRate(L(r).pay, L(r).sales)} target={laborRate(L(r).payBud, L(r).salesBud)} />), group: 'Productivity'},
    {key: 'otPay', header: 'OT $', value: r => (r.id === 'rx' ? null : A(r).otPay), render: r => (r.id === 'rx' ? <span className="na">Out of OT scope</span> : fmt.money(A(r).otPay)), group: 'Overtime (excl. RX)'},
    {key: 'otHours', header: 'OT hrs', value: r => (r.id === 'rx' ? null : A(r).otHours), render: r => (r.id === 'rx' ? <span className="na">—</span> : fmt.int(A(r).otHours)), group: 'Overtime (excl. RX)'},
    {key: 'otRate', header: 'OT rate', value: r => (r.id === 'rx' ? null : otRate(A(r).otPay, A(r).otBasePay)), render: r => (r.id === 'rx' ? <span className="na">—</span> : fmt.pct(otRate(A(r).otPay, A(r).otBasePay), 2)), group: 'Overtime (excl. RX)'},
    {key: 'vac', header: 'Vacation hrs', value: r => A(r).vacHours, render: r => fmt.int(A(r).vacHours), group: 'Vacation'},
  ];
}

export default function AllocationPage() {
  const scope = useScope('allocation');
  const {filters} = useReport();
  const [group, setGroup] = useState<Group>('labor');
  const [selected, setSelected] = useState<string | null>(null);
  const peopleActive = peopleFilterActive(scope.people);

  const byStore = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'store'), [scope]);
  const t = useMemo(() => total(scope.stores, scope.dept, scope.from, scope.to), [scope]);
  const pl = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'store') : null), [scope, peopleActive]);
  const plTotal = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'none').totals.get('all') ?? null : null), [scope, peopleActive]);
  const lyAvailable = pl?.lyAvailable ?? true;

  const rows: Row[] = [...byStore.entries()].map(([id, r]) => {
    const s = storeById.get(id)!;
    return {id, name: s.name, district: districtById.get(s.districtId)?.name ?? '', r, lp: pl ? (pl.totals.get(id) ?? null) : null, deptKey: scope.dept};
  });
  const storeId = selected && scope.stores.has(selected) ? selected : filters.store !== ALL ? filters.store : null;
  const deptRollup = useMemo(() => (storeId ? rollup(new Set([storeId]), ALL, scope.from, scope.to, 'dept') : null), [storeId, scope]);
  const deptPeople = useMemo(() => (storeId && peopleActive ? laborForPeople(new Set([storeId]), ALL, scope.from, scope.to, scope.people, 'dept').totals : null), [storeId, scope, peopleActive]);
  const deptRows: Row[] = deptRollup ? DEPARTMENTS.filter(d => deptRollup.has(d.id)).map(d => ({id: d.id, name: d.name, district: '', r: deptRollup.get(d.id)!, lp: deptPeople ? (deptPeople.get(d.id) ?? null) : null, deptKey: d.id})) : [];

  const columns: Column<Row>[] = [{key: 'name', header: 'Store', value: r => r.name, align: 'left'}, {key: 'district', header: 'District', value: r => r.district, align: 'left'}, ...columnsFor(group, {storeLevel: true, lyAvailable})];
  const deptColumns: Column<Row>[] = [{key: 'name', header: 'Department', value: r => r.name, align: 'left'}, ...columnsFor(group, {storeLevel: false, lyAvailable})];

  const A = plTotal ?? t.labor;
  const aivTY = aiv(t.labor.sales, t.labor.items);
  const aivLY = aiv(t.labor.salesLY, t.labor.itemsLY);
  const inflationValue = aivTY === null || aivLY === null ? null : (aivTY - aivLY) * t.labor.items;
  const groupOptions = [
    {id: 'sales' as const, label: 'Sales & customers'},
    {id: 'labor' as const, label: 'Hours & spend'},
    {id: 'productivity' as const, label: 'Productivity, overtime & vacation'},
  ];
  const peopleLabel = [scope.people.position !== ALL ? scope.people.position : null, scope.people.tenure !== ALL ? `tenure ${scope.people.tenure}` : null].filter(Boolean).join(', ');
  const peopleNote = 'Position and Tenure filter labor actuals (hours, spend, AHR actual, overtime, vacation) through associate hours. Actual IPLH and Actual labor rate show n/a because items and sales are recorded by store and department and cannot be attributed to the filtered population. Budgeted labor and AHR budget show n/a because budgets are set by store, department and period.';

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <ScopeLine scope={scope} />
      {peopleActive ? (
        <p className="selection-bar" role="status">
          <span>
            <b>Labor actuals for {peopleLabel}.</b> {peopleNote}
            {lyAvailable ? '' : ' LY by associate is not available before FY2026 in the synthetic data.'}
          </span>
        </p>
      ) : null}
      {t.labor.rows === 0 ? (
        <EmptyState>No data for this selection. Try another time frame or use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid five" aria-label="Allocation summary">
            <KpiCard level="primary" label="Gross Sales TY" value={fmt.compactMoney(t.labor.sales)} hint={`Gross Sales (UC1 definition) of ${deptLabel(scope.dept)}. Not filtered by Position / Tenure.`} lines={[{label: 'Gross Sales LY', value: fmt.compactMoney(t.labor.salesLY)}, {label: 'YoY growth', value: `${fmt.signedCompactMoney(yoyChange(t.labor.sales, t.labor.salesLY))} (${fmt.signedPct(yoyPct(t.labor.sales, t.labor.salesLY))})`}]} />
            <KpiCard level="primary" label="Labor hours TY" value={fmt.compactHours(A.hours)} lines={[{label: 'LY', value: peopleActive && !lyAvailable ? 'n/a' : fmt.compactHours(A.hoursLY)}, {label: 'vs LY', value: peopleActive && !lyAvailable ? 'n/a' : <PctVar actual={A.hours} target={A.hoursLY} />}]} />
            <KpiCard level="primary" label="Labor spend TY" decisions={['D01']} value={fmt.compactMoney(A.pay)} lines={[{label: 'Budgeted labor', value: peopleActive ? 'n/a' : fmt.compactMoney(t.labor.payBud)}, {label: 'vs Budget', value: peopleActive ? 'n/a' : <PctVar actual={t.labor.pay} target={t.labor.payBud} />}, {label: 'LY', value: peopleActive && !lyAvailable ? 'n/a' : fmt.compactMoney(A.payLY)}]} />
            <KpiCard label="IPLH" value={peopleActive ? 'n/a' : fmt.dec1(iplh(t.labor.items, t.labor.hours))} lines={peopleActive ? [{label: 'Reason', value: 'Items not attributable to Position / Tenure'}] : [{label: 'vs MDoc', value: <RatioVar actual={iplh(t.labor.items, t.labor.hours)} target={iplh(t.labor.itemsMdoc, t.labor.hoursMdoc)} />}]} />
            <KpiCard label="Labor rate" value={peopleActive ? 'n/a' : fmt.pct(laborRate(t.labor.pay, t.labor.sales), 2)} decisions={['D19']} lines={peopleActive ? [{label: 'Reason', value: 'Sales not attributable to Position / Tenure'}] : [{label: 'vs Budget', value: <RateVar actual={laborRate(t.labor.pay, t.labor.sales)} target={laborRate(t.labor.payBud, t.labor.salesBud)} />}]} />
          </section>

          <VisualCard
            title="Store labor allocation"
            subtitle="All view KPIs by store. Switch the measure group to see the rest of the columns. Select a store to see the same KPIs by department."
            filters={<VisualFilters scope={scope} notes={['Customer count, basket size and sales per transaction follow the Department filter (Ops 100 department rows); sales per square foot is store level.', peopleNote]} />}
            actions={<Segmented label="Measure group" value={group} options={groupOptions} onChange={setGroup} size="sm" />}
          >
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="Store labor allocation" searchText={r => `${r.name} ${r.district}`} onRowClick={r => setSelected(r.id)} selectedKey={storeId} initialSort={{key: group === 'sales' ? 'sales' : group === 'labor' ? 'pay' : 'otPay', dir: 'desc'}} exportName={`store-ops-labor-allocation-${group}`} />
            {group === 'sales' ? (
              <p className="note">
                Sales per square foot uses all departments for the selected time frame. <DecisionChip ids={['D24']} label="Rule open" align="left" />
              </p>
            ) : null}
          </VisualCard>

          <div className="two-col wide-left">
            <VisualCard title={storeId ? `Department detail · ${storeById.get(storeId)?.name}` : 'Department detail'} subtitle="Same KPIs and measure group as the store table." filters={<VisualFilters scope={scope} ignoreDept notes={['All departments of the selected store are listed. Department transactions overlap (a basket spans departments), so they are not added up to the store total.']} />}>
              {storeId ? (
                <DataTable rows={deptRows} columns={deptColumns} rowKey={r => r.id} label="Department detail" initialSort={{key: deptColumns[1].key, dir: 'desc'}} exportName={`department-detail-${storeId}`} maxHeight={480} />
              ) : (
                <EmptyState>Select a store in the table above (or a Store filter) to see its departments.</EmptyState>
              )}
            </VisualCard>
            <VisualCard title="Average item value & estimated inflation" filters={<VisualFilters scope={scope} />}>
              <p className="note">Tracked separately. Inflation does not adjust any labor metric.</p>
              <dl className="context-list">
                <div>
                  <dt>AIV TY</dt>
                  <dd>{fmt.money2(aivTY)}</dd>
                </div>
                <div>
                  <dt>AIV LY</dt>
                  <dd>{fmt.money2(aivLY)}</dd>
                </div>
                <div>
                  <dt>Estimated inflation (AIV vs LY)</dt>
                  <dd>{fmt.signedPct(yoyPct(aivTY, aivLY))}</dd>
                </div>
                <div>
                  <dt>$ value vs LY</dt>
                  <dd>{fmt.signedCompactMoney(inflationValue)}</dd>
                </div>
              </dl>
              <p className="note">
                $ value = (AIV TY − AIV LY) × items TY. Whether inflation is used in sales growth is still to be confirmed. <DecisionChip ids={['D26']} label="Open" align="left" />
              </p>
            </VisualCard>
          </div>
        </>
      )}
    </div>
  );
}
