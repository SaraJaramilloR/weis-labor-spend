// Workbook view R62 "Store Ops Labor Allocation" (User Story 1). Required KPIs, by store and department:
// gross sales ($ TY / LY), items sold (# TY / LY), customer count, basket size, sales per transaction, AIV,
// estimated inflation, sales per square foot, labor hours (TY / LY), labor spend ($ TY / LY), budgeted labor ($),
// AHR (actual / budget), overtime ($ / hrs), overtime rate (excl. RX), vacation hours, IPLH and labor rate.
// Filters: date range, region, district, store number, department, position, tenure, state and geography.
import {useMemo, useState} from 'react';
import {pageById} from '../app/pages';
import {deptLabel, useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {PctVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DEPARTMENTS, districtById, regionById, storeById, type DeptId} from '../data/org';
import {customerBase, rollup, total, type LaborTotals, type Rollup} from '../lib/aggregate';
import {ALL} from '../lib/filters';
import {fmt} from '../lib/format';
import {laborForPeople, peopleFilterActive} from '../lib/laborPeople';
import {ahr, aiv, basketSize, iplh, laborRate, otRate, ppDiff, ratio, salesPerTx, variance, variancePct, yoyChange, yoyPct} from '../lib/metrics';

const META = pageById.get('allocation')!;
type Group = 'sales' | 'labor' | 'productivity';
/** One table row: a store (dept = null) or one department of a store. `lp`: labor actuals of the Position / Tenure
 *  population (null when no people filter is active). Store rows come from store totals, never from adding up
 *  department rows, so rates, averages and overlapping department transactions are not summed. */
type Row = {id: string; name: string; district: string; search: string; dept: DeptId | null; r: Rollup; lp: LaborTotals | null; deptKey: 'All' | DeptId};

const inflation = (l: LaborTotals) => yoyPct(aiv(l.sales, l.items), aiv(l.salesLY, l.itemsLY));
// Why a value is n/a under a Position / Tenure filter. Actual ratios and budget comparisons have different reasons.
const NA_BUDGET = 'Budget is set by store, department and period, not by Position / Tenure';
const NA_ATTRIBUTION = 'Items and sales are recorded by store and department and cannot be attributed to a Position / Tenure population (hours and pay can), so the actual ratio has no compatible numerator';

/** Header tooltips: full name, meaning, formula and unit. */
const HELP = {
  sales: 'Gross Sales this year (TY), $: sales after item-level discounts and before non-item discounts (UC1 definition).',
  salesLY: 'Gross Sales last year (LY), $: same fiscal weeks one year earlier (364 days).',
  yoyAmt: 'Year-over-year growth, $ = Gross Sales TY − Gross Sales LY. Not adjusted for inflation.',
  yoyPct: 'Year-over-year growth, % = (Gross Sales TY − LY) / LY. Not adjusted for inflation.',
  items: 'Items sold this year: one quantity that includes weighed items, as Ops 100 Items Actual (D30).',
  itemsLY: 'Items sold in the same weeks last year.',
  aiv: 'Average Item Value (AIV), $ = Gross Sales / Items sold.',
  inflation: 'Estimated inflation = AIV % change vs LY = (AIV TY − AIV LY) / AIV LY (Ops 100 "Avg Item Value % Value vs LY"). It also moves with the product mix, so it is an estimate, not measured price inflation. It never adjusts labor metrics.',
  tx: 'Customer count = number of transactions (Ops 100 uses transactions as customer count; not unique customers). A department row counts the transactions that include that department; they overlap, so the store row uses store transactions, not the sum of departments.',
  basket: 'Basket size = Items / Transactions, in the same store or department context.',
  spt: 'Sales per transaction, $ = Gross Sales / Transactions.',
  sqft: 'Sales per square foot, $ = all-department store sales / store square feet for the time frame. Store level only (D24).',
  hours: 'Actual labor hours this year. Vacation hours are not included (D17).',
  hoursLY: 'Actual labor hours in the same weeks last year.',
  pay: 'Labor spend this year, $: actual payroll dollars as supplied by the source (salaried managers and Starbucks included, no manual additions).',
  payLY: 'Labor spend in the same weeks last year, $.',
  payBud: 'Budgeted labor, $ (budget source per KPI is open, D01).',
  payVar: 'Labor spend vs Budget, % = (Actual − Budget) / Budget. Above or below budget is not good or bad by itself.',
  ahr: 'Average Hourly Rate (AHR), actual, $ = Labor spend $ / Labor hours.',
  ahrBud: 'Average Hourly Rate (AHR), budget, $ = Budgeted labor $ / Budgeted hours.',
  iplh: 'Items per Labor Hour (IPLH) = Items sold / Actual labor hours.',
  iplhMdoc: 'IPLH difference vs MDoc (Master Doc) = IPLH actual − (MDoc items / MDoc hours). The Ops 100 draft has no budget items, so IPLH is compared with MDoc.',
  rate: 'Labor rate, % = Labor spend $ / Total Sales $ for the same stores, departments and weeks (sales basis open, D19).',
  rateBud: 'Labor rate difference vs Budget, in percentage points (pp) = actual labor rate − (Budgeted labor $ / Budgeted sales $).',
  otPay: 'Overtime (OT) dollars, excluding Pharmacy (RX). Full overtime pay or premium only is open (D04).',
  otHours: 'Overtime (OT) hours, excluding Pharmacy (RX).',
  otRate: 'Overtime rate, % of payroll $ = Overtime $ / total payroll $ (labor spend), both excluding Pharmacy (RX). Dollars, not hours (Ops 100 "OT Less RX Rate").',
  vac: 'Vacation hours in the time frame, shown separately from actual hours (D17).',
} as const;

function columnsFor(group: Group, opts: {lyAvailable: boolean}): Column<Row>[] {
  const L = (r: Row) => r.r.labor; // sales, items, budget: store × department × week
  const A = (r: Row) => r.lp ?? r.r.labor; // labor actuals, filtered by Position / Tenure when active
  const filtered = (r: Row) => r.lp !== null;
  const ly = (r: Row, v: number) => (filtered(r) && !opts.lyAvailable ? null : v);
  const na = (r: Row, v: number | null) => (filtered(r) ? null : v);
  const naCell = (r: Row, text: string, why: string = NA_BUDGET) => (filtered(r) ? <span className="na" title={why}>n/a</span> : text);
  const C = (r: Row) => customerBase(r.r, r.deptKey);
  const noOt = (r: Row) => r.dept === 'rx';
  if (group === 'sales')
    return [
      {key: 'sales', header: 'Gross Sales TY', help: HELP.sales, value: r => L(r).sales, render: r => fmt.money(L(r).sales), group: 'Gross sales'},
      {key: 'salesLY', header: 'Gross Sales LY', help: HELP.salesLY, value: r => L(r).salesLY, render: r => fmt.money(L(r).salesLY), group: 'Gross sales'},
      {key: 'yoyAmt', header: 'YoY Growth ($)', help: HELP.yoyAmt, value: r => yoyChange(L(r).sales, L(r).salesLY), render: r => fmt.signedMoney(yoyChange(L(r).sales, L(r).salesLY)), group: 'Gross sales'},
      {key: 'yoyPct', header: 'YoY Growth (%)', help: HELP.yoyPct, value: r => yoyPct(L(r).sales, L(r).salesLY), render: r => <PctVar actual={L(r).sales} target={L(r).salesLY} />, group: 'Gross sales'},
      {key: 'items', header: 'Items TY', help: HELP.items, value: r => L(r).items, render: r => fmt.int(L(r).items), group: 'Items sold'},
      {key: 'itemsLY', header: 'Items LY', help: HELP.itemsLY, value: r => L(r).itemsLY, render: r => fmt.int(L(r).itemsLY), group: 'Items sold'},
      {key: 'aiv', header: 'AIV', sub: 'Average Item Value', help: HELP.aiv, value: r => aiv(L(r).sales, L(r).items), render: r => fmt.money2(aiv(L(r).sales, L(r).items)), group: 'Average item value'},
      {key: 'inflation', header: 'AIV % vs LY', sub: 'est. inflation', help: HELP.inflation, value: r => inflation(L(r)), render: r => fmt.signedPct(inflation(L(r))), group: 'Average item value'},
      {key: 'tx', header: 'Customer count', sub: 'transactions', help: HELP.tx, value: r => C(r).tx, render: r => fmt.int(C(r).tx), group: 'Customers'},
      {key: 'basket', header: 'Basket size', sub: 'items / transaction', help: HELP.basket, value: r => basketSize(C(r).items, C(r).tx), render: r => fmt.dec2(basketSize(C(r).items, C(r).tx)), group: 'Customers'},
      {key: 'spt', header: 'Sales / transaction', help: HELP.spt, value: r => salesPerTx(C(r).sales, C(r).tx), render: r => fmt.money2(salesPerTx(C(r).sales, C(r).tx)), group: 'Customers'},
      {
        key: 'sqft',
        header: 'Sales / sq ft',
        sub: 'store level',
        help: HELP.sqft,
        value: r => (r.dept ? null : ratio(r.r.store.storeSales, r.r.store.sqft)),
        render: r => (r.dept ? <span className="na" title="Store-level measure: not calculated by department (D24)">—</span> : fmt.money2(ratio(r.r.store.storeSales, r.r.store.sqft))),
        group: 'Store',
      },
    ];
  if (group === 'labor')
    return [
      {key: 'hours', header: 'Hours TY', help: HELP.hours, value: r => A(r).hours, render: r => fmt.int(A(r).hours), group: 'Labor hours'},
      {key: 'hoursLY', header: 'Hours LY', help: HELP.hoursLY, value: r => ly(r, A(r).hoursLY), render: r => fmt.int(ly(r, A(r).hoursLY)), group: 'Labor hours'},
      {key: 'pay', header: 'Spend TY', help: HELP.pay, value: r => A(r).pay, render: r => fmt.money(A(r).pay), group: 'Labor spend'},
      {key: 'payLY', header: 'Spend LY', help: HELP.payLY, value: r => ly(r, A(r).payLY), render: r => fmt.money(ly(r, A(r).payLY)), group: 'Labor spend'},
      {key: 'payBud', header: 'Budgeted labor', help: HELP.payBud, value: r => na(r, L(r).payBud), render: r => naCell(r, fmt.money(L(r).payBud)), group: 'Labor spend'},
      {key: 'payVar', header: 'Var % vs Budget', help: HELP.payVar, value: r => na(r, variancePct(L(r).pay, L(r).payBud)), render: r => (filtered(r) ? naCell(r, '') : <PctVar actual={L(r).pay} target={L(r).payBud} />), group: 'Labor spend'},
      {key: 'ahr', header: 'AHR actual', help: HELP.ahr, value: r => ahr(A(r).pay, A(r).hours), render: r => fmt.money2(ahr(A(r).pay, A(r).hours)), group: 'Average hourly rate'},
      {key: 'ahrBud', header: 'AHR budget', help: HELP.ahrBud, value: r => na(r, ahr(L(r).payBud, L(r).hoursBud)), render: r => naCell(r, fmt.money2(ahr(L(r).payBud, L(r).hoursBud))), group: 'Average hourly rate'},
    ];
  return [
    {key: 'iplh', header: 'IPLH', sub: 'Items per Labor Hour', help: HELP.iplh, value: r => na(r, iplh(L(r).items, L(r).hours)), render: r => naCell(r, fmt.dec1(iplh(L(r).items, L(r).hours)), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'iplhMdoc', header: 'IPLH vs MDoc', help: HELP.iplhMdoc, value: r => na(r, variance(iplh(L(r).items, L(r).hours), iplh(L(r).itemsMdoc, L(r).hoursMdoc))), render: r => (filtered(r) ? naCell(r, '', NA_ATTRIBUTION) : <RatioVar actual={iplh(L(r).items, L(r).hours)} target={iplh(L(r).itemsMdoc, L(r).hoursMdoc)} />), group: 'Productivity'},
    {key: 'rate', header: 'Labor rate', sub: '% of sales', help: HELP.rate, value: r => na(r, laborRate(L(r).pay, L(r).sales)), render: r => naCell(r, fmt.pct(laborRate(L(r).pay, L(r).sales), 2), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'rateBud', header: 'Labor rate vs Budget', sub: 'pp', help: HELP.rateBud, value: r => na(r, ppDiff(laborRate(L(r).pay, L(r).sales), laborRate(L(r).payBud, L(r).salesBud))), render: r => (filtered(r) ? naCell(r, '', NA_ATTRIBUTION) : <RateVar actual={laborRate(L(r).pay, L(r).sales)} target={laborRate(L(r).payBud, L(r).salesBud)} />), group: 'Productivity'},
    {key: 'otPay', header: 'Overtime $', help: HELP.otPay, value: r => (noOt(r) ? null : A(r).otPay), render: r => (noOt(r) ? <span className="na">Out of OT scope</span> : fmt.money(A(r).otPay)), group: 'Overtime (excl. Pharmacy)'},
    {key: 'otHours', header: 'Overtime hrs', help: HELP.otHours, value: r => (noOt(r) ? null : A(r).otHours), render: r => (noOt(r) ? <span className="na">—</span> : fmt.int(A(r).otHours)), group: 'Overtime (excl. Pharmacy)'},
    {key: 'otRate', header: 'Overtime rate', sub: '% of payroll $', help: HELP.otRate, value: r => (noOt(r) ? null : otRate(A(r).otPay, A(r).otBasePay)), render: r => (noOt(r) ? <span className="na">—</span> : fmt.pct(otRate(A(r).otPay, A(r).otBasePay), 2)), group: 'Overtime (excl. Pharmacy)'},
    {key: 'vac', header: 'Vacation hrs', help: HELP.vac, value: r => A(r).vacHours, render: r => fmt.int(A(r).vacHours), group: 'Vacation'},
  ];
}

export default function AllocationPage() {
  const scope = useScope('allocation');
  const [group, setGroup] = useState<Group>('labor');
  const peopleActive = peopleFilterActive(scope.people);

  const byStore = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'store'), [scope]);
  const byStoreDept = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'storeDept'), [scope]);
  const t = useMemo(() => total(scope.stores, scope.dept, scope.from, scope.to), [scope]);
  const pl = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'store') : null), [scope, peopleActive]);
  const plDept = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'storeDept') : null), [scope, peopleActive]);
  const plTotal = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'none').totals.get('all') ?? null : null), [scope, peopleActive]);
  const lyAvailable = pl?.lyAvailable ?? true;

  const rows: Row[] = useMemo(
    () =>
      [...byStore.entries()].map(([id, r]) => {
        const s = storeById.get(id)!;
        const district = districtById.get(s.districtId)?.name ?? '';
        return {id, name: s.name, district, search: `${s.name} ${s.number} ${district} ${regionById.get(s.regionId)?.name ?? ''} ${s.state} ${s.geography}`, dept: null, r, lp: pl ? (pl.totals.get(id) ?? null) : null, deptKey: scope.dept};
      }),
    [byStore, pl, scope.dept],
  );
  const children = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const store of rows) {
      const list: Row[] = [];
      for (const d of DEPARTMENTS) {
        const key = `${store.id}|${d.id}`;
        const r = byStoreDept.get(key);
        if (!r || r.labor.rows === 0) continue;
        list.push({id: key, name: d.name, district: '', search: d.name, dept: d.id, r, lp: plDept ? (plDept.totals.get(key) ?? null) : null, deptKey: d.id});
      }
      out.set(store.id, list);
    }
    return out;
  }, [rows, byStoreDept, plDept]);
  const tree = useMemo(() => ({children: (r: Row) => children.get(r.id) ?? [], levels: ['Store', 'Department'] as [string, string], name: (r: Row) => r.name}), [children]);

  const columns: Column<Row>[] = [
    {key: 'name', header: 'Store / Department', value: r => r.name, render: r => (r.dept ? r.name : <>{r.name}<span className="cell-sub">{r.district}</span></>), align: 'left'},
    ...columnsFor(group, {lyAvailable}),
  ];

  const A = plTotal ?? t.labor;
  const aivTY = aiv(t.labor.sales, t.labor.items);
  const aivLY = aiv(t.labor.salesLY, t.labor.itemsLY);
  const aivValue = aivTY === null || aivLY === null ? null : (aivTY - aivLY) * t.labor.items;
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
            <KpiCard label="Items per Labor Hour (IPLH)" hint={`${HELP.iplh} MDoc (Master Doc) is the Ops 100 reference for IPLH; there are no budget items.`} value={peopleActive ? 'n/a' : fmt.dec1(iplh(t.labor.items, t.labor.hours))} lines={peopleActive ? [{label: 'Reason', value: 'Items not attributable to Position / Tenure'}] : [{label: 'vs MDoc', value: <RatioVar actual={iplh(t.labor.items, t.labor.hours)} target={iplh(t.labor.itemsMdoc, t.labor.hoursMdoc)} />}]} />
            <KpiCard label="Labor rate" hint={HELP.rate} value={peopleActive ? 'n/a' : fmt.pct(laborRate(t.labor.pay, t.labor.sales), 2)} decisions={['D19']} lines={peopleActive ? [{label: 'Reason', value: 'Sales not attributable to Position / Tenure'}] : [{label: 'vs Budget', value: <RateVar actual={laborRate(t.labor.pay, t.labor.sales)} target={laborRate(t.labor.payBud, t.labor.salesBud)} />}]} />
          </section>

          <VisualCard
            title="Store labor allocation"
            subtitle="One row per store. Select + to show its departments in the same table, with the same measures. Store rows are calculated from store totals, not by adding department rows."
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  'Department rows follow the Department filter: with one department selected, each store shows only that department.',
                  'Customer count, basket size and sales per transaction: store rows use store transactions; department rows use the transactions that include the department (Ops 100 department rows). Department transactions overlap, so they are never added up to the store.',
                  'Rates, averages and ratios (AHR, IPLH, labor rate, overtime rate, AIV, basket size) are recalculated from the totals of each row, never summed or averaged across rows. Sales per square foot is store level.',
                  peopleNote,
                ]}
              />
            }
            actions={<Segmented label="Measure group" value={group} options={groupOptions} onChange={setGroup} size="sm" />}
          >
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={r => r.id}
              label="Store labor allocation"
              searchText={r => r.search}
              searchPlaceholder="Search store, district or department…"
              countNoun="stores"
              tree={tree}
              initialSort={{key: group === 'sales' ? 'sales' : group === 'labor' ? 'pay' : 'otPay', dir: 'desc'}}
              exportName={`store-ops-labor-allocation-${group}`}
              maxHeight={560}
            />
            {group === 'sales' ? (
              <p className="note">
                Sales per square foot uses all departments for the selected time frame and is shown on store rows only. <DecisionChip ids={['D24']} label="Rule open" align="left" />
              </p>
            ) : null}
          </VisualCard>

          <VisualCard title="Average Item Value (AIV) & estimated inflation" subtitle="Price per item sold this year vs last year. Tracked separately: it does not adjust any labor metric." filters={<VisualFilters scope={scope} notes={['Gross sales and items of the stores, department and time frame in scope. Not filtered by Position / Tenure.']} />}>
            <dl className="context-list cols-2">
              <div>
                <dt>
                  AIV this year (TY) <InfoTip text="Average Item Value = Gross Sales TY / Items sold TY." label="About AIV this year" align="left" />
                </dt>
                <dd>{fmt.money2(aivTY)}</dd>
              </div>
              <div>
                <dt>
                  AIV last year (LY) <InfoTip text="Gross Sales LY / Items sold LY, for the same fiscal weeks one year earlier (364 days)." label="About AIV last year" align="left" />
                </dt>
                <dd>{fmt.money2(aivLY)}</dd>
              </div>
              <div>
                <dt>
                  AIV % change vs LY · estimated inflation <InfoTip text={`${HELP.inflation}`} label="About estimated inflation" align="left" />
                </dt>
                <dd>{fmt.signedPct(yoyPct(aivTY, aivLY))}</dd>
              </div>
              <div>
                <dt>
                  AIV change applied to items sold TY ($) <InfoTip text="(AIV TY − AIV LY) × Items sold TY. Ops 100 measure '$ Value vs LY (INF)': the part of the Gross Sales change explained by the change in average item value at this year's volume. It is an arithmetic split, not a proven inflation effect: product mix, promotions and weighed items also change AIV." label="About AIV change applied to items sold" align="left" />
                </dt>
                <dd>{fmt.signedCompactMoney(aivValue)}</dd>
              </div>
              <div>
                <dt>
                  Gross Sales growth vs LY (not inflation adjusted) <InfoTip text="Gross Sales TY − Gross Sales LY. It equals the AIV change applied to items sold TY plus the change in items sold valued at last year's AIV: (Items TY − Items LY) × AIV LY." label="About Gross Sales growth" align="left" />
                </dt>
                <dd>
                  {fmt.signedCompactMoney(yoyChange(t.labor.sales, t.labor.salesLY))} <PctVar actual={t.labor.sales} target={t.labor.salesLY} />
                </dd>
              </div>
            </dl>
            <p className="note">
              Confirmed: inflation does not adjust labor spend, hours, labor rate or IPLH. Open: whether this inflation estimate should be used when reporting sales growth; until then, sales growth is shown unadjusted. <DecisionChip ids={['D26']} label="Open" align="left" />
            </p>
          </VisualCard>
        </>
      )}
    </div>
  );
}
