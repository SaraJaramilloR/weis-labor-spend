// Workbook view R62 "Store Ops Labor Allocation" (User Story 1). Required KPIs, by store and department:
// gross sales ($ TY / LY), items sold (# TY / LY), customer count, basket size, sales per transaction, AIV,
// estimated inflation, sales per square foot, labor hours (TY / LY), labor spend ($ TY / LY), budgeted labor ($),
// AHR (actual / budget), overtime ($ / hrs), overtime rate (excl. RX), vacation hours, IPLH and labor rate.
// Filters: date range, region, district, store number, department, position, tenure, state and geography.
// Oct 28 review feedback: the table starts at Region and expands to District, Store and Department; Sales & customers
// adds sales and items vs Budget and customer count / basket size TY vs LY; Hours & spend adds hours vs Budget and MDoc.
// Nov 3 final review (James, 23:03–26:33): select the area and time frame and see every department without expanding
// the hierarchy. The Department summary below the cards is our placement proposal, not an approved layout.
import {useMemo, useState, type ReactNode} from 'react';
import {pageById} from '../app/pages';
import {deptLabel, useScope, type Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, PctVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {AivHistory} from '../visuals/AivHistory';
import {DEPARTMENTS, UNGROUPED_DEPTS, type DeptId} from '../data/org';
import {customerBase, emptyLabor, emptyStore, rollup, total, type LaborTotals, type Rollup} from '../lib/aggregate';
import {deptRows, groupRows, sumDepts, type SummaryRow} from '../lib/deptSummary';
import {ALL} from '../lib/filters';
import {fmt} from '../lib/format';
import {laborForPeople, peopleFilterActive} from '../lib/laborPeople';
import {operationalLabor} from '../lib/overtime';
import {OT_DEPT_HOURS_HELP, OT_DEPT_PAY_HELP, OT_DEPT_RATE_HELP, OT_HOURS_HELP, OT_PAY_HELP, OT_RATE_HELP} from '../config/references';
import {buildOrgTree, onlyChildIds, scopeLabel, type OrgNode} from '../lib/orgTree';
import {ahr, aiv, basketSize, iplh, laborRate, otRate, ppDiff, ratio, salesPerTx, variance, variancePct, yoyChange, yoyPct} from '../lib/metrics';

const META = pageById.get('allocation')!;
type Group = 'sales' | 'labor' | 'productivity';
/** One table row: a region, district, store or one department of a store; in the Department summary, a department or
 *  a department group. `lp`: labor actuals of the Position / Tenure population (null when no people filter is active).
 *  Each level comes from the rollup at that level, never from adding up the rows below it, so rates, averages and
 *  overlapping department transactions are not summed. `deptKey`: the department context of customer measures (the
 *  row's department, or the Department filter). `noTx`: a group of departments, whose transactions overlap. `op`:
 *  operational overtime components (all departments except Pharmacy, Ops 100 Less RX scope) of a location or total row;
 *  absent on department and group rows, which show only the department-context overtime. */
type Row = OrgNode<{r: Rollup; lp: LaborTotals | null; deptKey: 'All' | DeptId; noTx?: boolean; op?: LaborTotals | null}>;

const inflation = (l: LaborTotals) => yoyPct(aiv(l.sales, l.items), aiv(l.salesLY, l.itemsLY));
// Why a value is n/a under a Position / Tenure filter. Actual ratios and budget comparisons have different reasons.
const NA_BUDGET = 'Budget is set by store, department and period, not by Position / Tenure';
const NA_ATTRIBUTION = 'Items and sales are recorded by store and department and cannot be attributed to a Position / Tenure population (hours and pay can), so the actual ratio has no compatible numerator';
const NA_GROUP_TX = 'A transaction can include several departments, so department transactions cannot be added up to a group. A group customer count needs a source measure at group level';
const CUSTOMER_KEYS = new Set(['tx', 'txLY', 'txYoy', 'basket', 'basketLY', 'basketYoy', 'spt']);

/** Header tooltips: full name, meaning, formula and unit. */
const HELP = {
  sales: 'Gross Sales this year (TY), $: sales after item-level discounts and before non-item discounts (UC1 definition).',
  salesLY: 'Gross Sales last year (LY), $: same fiscal weeks one year earlier (364 days).',
  yoyAmt: 'Year-over-year growth, $ = Gross Sales TY − Gross Sales LY. Not adjusted for inflation.',
  yoyPct: 'Year-over-year growth, % = (Gross Sales TY − LY) / LY. Not adjusted for inflation.',
  items: 'Items sold this year: one quantity that includes weighed items, as Ops 100 Items Actual (D30).',
  itemsLY: 'Items sold in the same weeks last year.',
  aiv: 'Average Item Value (AIV), $ = Gross Sales / Items sold.',
  inflation: 'Estimated Inflation (% vs LY) = (AIV TY / AIV LY) − 1, the same as (AIV TY − AIV LY) / AIV LY (Ops 100 "Avg Item Value % Value vs LY"). It compares the selected weeks with the same fiscal weeks last year, so it is not an annual rate unless the time frame covers a full year. AIV also moves with product mix, so this is an estimate, not measured price inflation. It does not adjust labor spend, labor hours, Labor Rate or IPLH.',
  tx: 'Customer count = number of transactions (Ops 100 uses transactions as customer count; not unique customers). A department row counts the transactions that include that department; they overlap, so the store row uses store transactions, not the sum of departments.',
  basket: 'Basket size = Items / Transactions, in the same store or department context.',
  spt: 'Sales per transaction, $ = Gross Sales / Transactions.',
  sqft: 'Sales per square foot, $ = all-department store sales / store square feet for the time frame. Store level only (D24).',
  hours: 'Actual labor hours this year. Vacation hours are not included (D17).',
  hoursLY: 'Actual labor hours in the same weeks last year.',
  pay: 'Labor spend this year, $: actual payroll dollars as supplied by the source (salaried managers and Starbucks included, no manual additions).',
  payLY: 'Labor spend in the same weeks last year, $.',
  payBud: 'Budgeted labor, $ (Ops 100 `Pay Budget`, SO1007). Ops reports compare labor spend with Budget (Labor $ Act vs Labor $ Bud).',
  hoursBud: 'Budgeted labor hours (Ops 100 Warehouse `Hours Budget`, SO1007). Ops reports compare hours with MDoc rather than Budget; Hours Budget is kept here as a separate reference (D01).',
  hoursVarBud: 'Hours vs Budget = Actual hours − Budgeted hours (hrs), and (Actual − Budget) / Budget (%). Above or below budget is not good or bad by itself.',
  hoursMdoc: 'Labor hours in the Master Doc (MDoc), the Ops operational target (Ops 100 `Hours Mdoc`; Hours vs Master Doc in OPS101, OPS102 and OPS106). Set and revised by Ops; kept separate from the formal Budget and never forced to match it (D01).',
  hoursVarMdoc: 'Hours vs MDoc = Actual hours − MDoc hours (hrs), and (Actual − MDoc) / MDoc (%).',
  salesBud: 'Budgeted sales, $ (Ops 100 Warehouse `Sales Budget`, SO1007; OPS101 Sales vs Budget). Synthetic values.',
  salesVarBud: 'Sales vs Budget, % = (Gross Sales TY − Sales Budget) / Sales Budget.',
  itemsBud: 'Budgeted items sold (Ops 100 Warehouse `Items Budget`; OPS111 `Dept_Bud` "Items Bud"). Ops reports compare items with Budget (OPS101 Items vs Budget). The model also holds Items MDoc, used here only inside IPLH vs MDoc. Synthetic values.',
  itemsVarBud: 'Items vs Budget, % = (Items TY − Items Budget) / Items Budget.',
  txLY: 'Customer count last year: transactions in the same fiscal weeks one year earlier, same store or department context.',
  txYoy: 'Customer count YoY, % = (Transactions TY − Transactions LY) / Transactions LY.',
  basketLY: 'Basket size last year = Items LY / Transactions LY, in the same store or department context.',
  basketYoy: 'Basket size YoY, % = (Basket size TY − Basket size LY) / Basket size LY.',
  payVar: 'Labor spend vs Budget, % = (Actual − Budget) / Budget. Above or below budget is not good or bad by itself.',
  ahr: 'Average Hourly Rate (AHR), actual, $ = Labor spend $ / Labor hours.',
  ahrBud: 'Average Hourly Rate (AHR), budget, $ = Budgeted labor $ / Budgeted hours.',
  iplh: 'Items per Labor Hour (IPLH) = Items sold / Actual labor hours.',
  iplhMdoc: 'IPLH difference vs MDoc (Master Doc) = IPLH Actual − IPLH Master Doc, where IPLH Master Doc = MDoc items / MDoc hours (Ops 100 IPLH Actual vs Master Doc; OPS101, OPS102, OPS107). Ops 100 also has IPLH Last Year and IPLH Budget (Budget items / Budget hours, OPS107), not shown in this column.',
  rate: 'Labor rate, % = Labor spend $ / Total Sales $ for the same stores, departments and weeks (sales basis open, D19).',
  rateBud: 'Labor rate difference vs Budget, in percentage points (pp) = actual labor rate − (Budgeted labor $ / Budgeted sales $).',
  otPay: OT_PAY_HELP,
  otHours: OT_HOURS_HELP,
  otRate: OT_RATE_HELP,
  dOtPay: OT_DEPT_PAY_HELP,
  dOtHours: OT_DEPT_HOURS_HELP,
  dOtRate: OT_DEPT_RATE_HELP,
  vac: 'Vacation hours in the time frame, shown separately from actual hours (D17).',
} as const;

function columnsFor(group: Group, opts: {lyAvailable: boolean; customerLY: boolean}): Column<Row>[] {
  const L = (r: Row) => r.data.r.labor; // sales, items, budget: store × department × week
  const A = (r: Row) => r.data.lp ?? r.data.r.labor; // labor actuals, filtered by Position / Tenure when active
  const filtered = (r: Row) => r.data.lp !== null;
  const ly = (r: Row, v: number) => (filtered(r) && !opts.lyAvailable ? null : v);
  const na = (r: Row, v: number | null) => (filtered(r) ? null : v);
  const naCell = (r: Row, text: ReactNode, why: string = NA_BUDGET) => (filtered(r) ? <span className="na" title={why}>n/a</span> : text);
  const C = (r: Row) => customerBase(r.data.r, r.data.deptKey);
  // Group rows: customer measures need group-level transactions, which overlapping department rows cannot give.
  const tx = (c: Column<Row>): Column<Row> => (CUSTOMER_KEYS.has(c.key) ? {...c, value: r => (r.data.noTx ? null : c.value(r)), render: r => (r.data.noTx ? <span className="na" title={NA_GROUP_TX}>n/a</span> : c.render!(r))} : c);
  const basket = (r: Row) => basketSize(C(r).items, C(r).tx);
  const basketLY = (r: Row) => basketSize(C(r).itemsLY, C(r).txLY);
  const noOt = (r: Row) => r.dept === 'rx';
  // Operational overtime exists on location and total rows only (never repeated on department or group rows).
  const O = (r: Row) => (r.level === 'dept' ? null : (r.data.op ?? null));
  if (group === 'sales')
    return ([
      {key: 'sales', header: 'Gross Sales TY', help: HELP.sales, value: r => L(r).sales, render: r => fmt.money(L(r).sales), group: 'Gross sales'},
      {key: 'salesLY', header: 'Gross Sales LY', help: HELP.salesLY, value: r => L(r).salesLY, render: r => fmt.money(L(r).salesLY), group: 'Gross sales'},
      {key: 'yoyAmt', header: 'YoY Growth ($)', help: HELP.yoyAmt, value: r => yoyChange(L(r).sales, L(r).salesLY), render: r => fmt.signedMoney(yoyChange(L(r).sales, L(r).salesLY)), group: 'Gross sales'},
      {key: 'yoyPct', header: 'YoY Growth (%)', help: HELP.yoyPct, value: r => yoyPct(L(r).sales, L(r).salesLY), render: r => <PctVar actual={L(r).sales} target={L(r).salesLY} />, group: 'Gross sales'},
      {key: 'salesBud', header: 'Sales Budget', help: HELP.salesBud, value: r => L(r).salesBud, render: r => fmt.money(L(r).salesBud), group: 'Sales vs Budget'},
      {key: 'salesVar', header: 'Sales vs Budget', sub: '%', help: HELP.salesVarBud, value: r => variancePct(L(r).sales, L(r).salesBud), render: r => <PctVar actual={L(r).sales} target={L(r).salesBud} />, group: 'Sales vs Budget'},
      {key: 'items', header: 'Items TY', help: HELP.items, value: r => L(r).items, render: r => fmt.int(L(r).items), group: 'Items sold'},
      {key: 'itemsLY', header: 'Items LY', help: HELP.itemsLY, value: r => L(r).itemsLY, render: r => fmt.int(L(r).itemsLY), group: 'Items sold'},
      {key: 'itemsBud', header: 'Items Budget', help: HELP.itemsBud, value: r => L(r).itemsBud, render: r => fmt.int(L(r).itemsBud), group: 'Items vs Budget'},
      {key: 'itemsVar', header: 'Items vs Budget', sub: '%', help: HELP.itemsVarBud, value: r => variancePct(L(r).items, L(r).itemsBud), render: r => <PctVar actual={L(r).items} target={L(r).itemsBud} />, group: 'Items vs Budget'},
      {key: 'aiv', header: 'AIV', sub: 'Average Item Value', help: HELP.aiv, value: r => aiv(L(r).sales, L(r).items), render: r => fmt.money2(aiv(L(r).sales, L(r).items)), group: 'Average item value'},
      {key: 'inflation', header: 'Estimated Inflation', sub: '% vs LY', help: HELP.inflation, value: r => inflation(L(r)), render: r => fmt.signedPct(inflation(L(r))), group: 'Average item value'},
      {key: 'tx', header: 'Customer count TY', sub: 'transactions', help: HELP.tx, value: r => C(r).tx, render: r => fmt.int(C(r).tx), group: 'Customer count'},
      ...(opts.customerLY ? [{key: 'txLY', header: 'Customer count LY', sub: 'transactions', help: HELP.txLY, value: (r: Row) => C(r).txLY, render: (r: Row) => fmt.int(C(r).txLY), group: 'Customer count'}] : []),
      {key: 'txYoy', header: 'Customer count YoY', sub: '% vs LY', help: `${HELP.txYoy} LY transactions are in the cell tooltip and in Show LY values.`, value: r => yoyPct(C(r).tx, C(r).txLY), render: r => <WithLY text={`LY ${fmt.int(C(r).txLY)} transactions`}><PctVar actual={C(r).tx} target={C(r).txLY} /></WithLY>, group: 'Customer count'},
      {key: 'basket', header: 'Basket size TY', sub: 'items / transaction', help: HELP.basket, value: basket, render: r => fmt.dec2(basket(r)), group: 'Basket size'},
      ...(opts.customerLY ? [{key: 'basketLY', header: 'Basket size LY', sub: 'items / transaction', help: HELP.basketLY, value: basketLY, render: (r: Row) => fmt.dec2(basketLY(r)), group: 'Basket size'}] : []),
      {key: 'basketYoy', header: 'Basket size YoY', sub: '% vs LY', help: `${HELP.basketYoy} LY basket size is in the cell tooltip and in Show LY values.`, value: r => yoyPct(basket(r), basketLY(r)), render: r => <WithLY text={`LY ${fmt.dec2(basketLY(r))} items per transaction`}><PctVar actual={basket(r)} target={basketLY(r)} /></WithLY>, group: 'Basket size'},
      {key: 'spt', header: 'Sales / transaction', help: HELP.spt, value: r => salesPerTx(C(r).sales, C(r).tx), render: r => fmt.money2(salesPerTx(C(r).sales, C(r).tx)), group: 'Per transaction & store'},
      {
        key: 'sqft',
        header: 'Sales / sq ft',
        sub: 'store level',
        help: HELP.sqft,
        value: r => (r.level === 'dept' ? null : ratio(r.data.r.store.storeSales, r.data.r.store.sqft)),
        render: r => (r.level === 'dept' ? <span className="na" title="Store-level measure: not calculated by department (D24)">—</span> : fmt.money2(ratio(r.data.r.store.storeSales, r.data.r.store.sqft))),
        group: 'Per transaction & store',
      },
    ] as Column<Row>[]).map(tx);
  if (group === 'labor')
    return [
      {key: 'hours', header: 'Hours TY', help: HELP.hours, value: r => A(r).hours, render: r => fmt.int(A(r).hours), group: 'Labor hours'},
      {key: 'hoursLY', header: 'Hours LY', help: HELP.hoursLY, value: r => ly(r, A(r).hoursLY), render: r => fmt.int(ly(r, A(r).hoursLY)), group: 'Labor hours'},
      {key: 'hoursBud', header: 'Hours Budget', help: HELP.hoursBud, value: r => na(r, L(r).hoursBud), render: r => naCell(r, fmt.int(L(r).hoursBud)), group: 'Hours vs Budget'},
      {key: 'hoursVarBud', header: 'Hours vs Budget', sub: 'hrs (%)', help: HELP.hoursVarBud, value: r => na(r, variance(L(r).hours, L(r).hoursBud)), render: r => naCell(r, <HoursVar actual={L(r).hours} target={L(r).hoursBud} />), group: 'Hours vs Budget'},
      {key: 'hoursMdoc', header: 'Hours MDoc', help: HELP.hoursMdoc, value: r => na(r, L(r).hoursMdoc), render: r => naCell(r, fmt.int(L(r).hoursMdoc)), group: 'Hours vs MDoc (operational target)'},
      {key: 'hoursVarMdoc', header: 'Hours vs MDoc', sub: 'hrs (%)', help: HELP.hoursVarMdoc, value: r => na(r, variance(L(r).hours, L(r).hoursMdoc)), render: r => naCell(r, <HoursVar actual={L(r).hours} target={L(r).hoursMdoc} />), group: 'Hours vs MDoc (operational target)'},
      {key: 'pay', header: 'Spend TY', help: HELP.pay, value: r => A(r).pay, render: r => fmt.money(A(r).pay), group: 'Labor spend'},
      {key: 'payLY', header: 'Spend LY', help: HELP.payLY, value: r => ly(r, A(r).payLY), render: r => fmt.money(ly(r, A(r).payLY)), group: 'Labor spend'},
      {key: 'payBud', header: 'Budgeted labor', help: HELP.payBud, value: r => na(r, L(r).payBud), render: r => naCell(r, fmt.money(L(r).payBud)), group: 'Labor spend'},
      {key: 'payVar', header: 'Var % vs Budget', help: HELP.payVar, value: r => na(r, variancePct(L(r).pay, L(r).payBud)), render: r => naCell(r, <PctVar actual={L(r).pay} target={L(r).payBud} />), group: 'Labor spend'},
      {key: 'ahr', header: 'AHR actual', help: HELP.ahr, value: r => ahr(A(r).pay, A(r).hours), render: r => fmt.money2(ahr(A(r).pay, A(r).hours)), group: 'Average hourly rate'},
      {key: 'ahrBud', header: 'AHR budget', help: HELP.ahrBud, value: r => na(r, ahr(L(r).payBud, L(r).hoursBud)), render: r => naCell(r, fmt.money2(ahr(L(r).payBud, L(r).hoursBud))), group: 'Average hourly rate'},
    ];
  return [
    {key: 'iplh', header: 'IPLH', sub: 'Items per Labor Hour', help: HELP.iplh, value: r => na(r, iplh(L(r).items, L(r).hours)), render: r => naCell(r, fmt.dec1(iplh(L(r).items, L(r).hours)), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'iplhMdoc', header: 'IPLH vs MDoc', help: HELP.iplhMdoc, value: r => na(r, variance(iplh(L(r).items, L(r).hours), iplh(L(r).itemsMdoc, L(r).hoursMdoc))), render: r => naCell(r, <RatioVar actual={iplh(L(r).items, L(r).hours)} target={iplh(L(r).itemsMdoc, L(r).hoursMdoc)} />, NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'rate', header: 'Labor rate', sub: '% of sales', help: HELP.rate, value: r => na(r, laborRate(L(r).pay, L(r).sales)), render: r => naCell(r, fmt.pct(laborRate(L(r).pay, L(r).sales), 2), NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'rateBud', header: 'Labor rate vs Budget', sub: 'pp', help: HELP.rateBud, value: r => na(r, ppDiff(laborRate(L(r).pay, L(r).sales), laborRate(L(r).payBud, L(r).salesBud))), render: r => naCell(r, <RateVar actual={laborRate(L(r).pay, L(r).sales)} target={laborRate(L(r).payBud, L(r).salesBud)} />, NA_ATTRIBUTION), group: 'Productivity'},
    {key: 'otPay', header: 'Overtime $ (excl. Pharmacy)', sub: 'operational', help: HELP.otPay, value: r => O(r)?.otPay ?? null, render: r => { const o = O(r); return o ? fmt.money(o.otPay) : <OpDash />; }, group: 'Overtime · operational (Ops 100 Less RX)'},
    {key: 'otHours', header: 'Overtime hrs (excl. Pharmacy)', sub: 'operational', help: HELP.otHours, value: r => O(r)?.otHours ?? null, render: r => { const o = O(r); return o ? fmt.int(o.otHours) : <OpDash />; }, group: 'Overtime · operational (Ops 100 Less RX)'},
    {key: 'otRate', header: 'Overtime Rate (% of Payroll, excl. Pharmacy)', sub: 'operational', help: HELP.otRate, value: r => { const o = O(r); return o ? otRate(o.otPay, o.otBasePay) : null; }, render: r => { const o = O(r); return o ? fmt.pct(otRate(o.otPay, o.otBasePay), 2) : <OpDash />; }, group: 'Overtime · operational (Ops 100 Less RX)'},
    {key: 'dOtPay', header: 'Department overtime $', sub: 'department context', help: HELP.dOtPay, value: r => (noOt(r) ? null : A(r).otPay), render: r => (noOt(r) ? <span className="na">Out of OT scope</span> : fmt.money(A(r).otPay)), group: 'Overtime · department context'},
    {key: 'dOtHours', header: 'Department overtime hrs', sub: 'department context', help: HELP.dOtHours, value: r => (noOt(r) ? null : A(r).otHours), render: r => (noOt(r) ? <span className="na">Out of OT scope</span> : fmt.int(A(r).otHours)), group: 'Overtime · department context'},
    {key: 'dOtRate', header: 'Department Overtime Rate (% of Department Payroll)', sub: 'department context', help: HELP.dOtRate, value: r => (noOt(r) ? null : otRate(A(r).otPay, A(r).otBasePay)), render: r => (noOt(r) ? <span className="na">Out of OT scope</span> : fmt.pct(otRate(A(r).otPay, A(r).otBasePay), 2)), group: 'Overtime · department context'},
    {key: 'vac', header: 'Vacation hrs', help: HELP.vac, value: r => A(r).vacHours, render: r => fmt.int(A(r).vacHours), group: 'Vacation'},
  ];
}

/** A YoY cell with its LY value in a hover title and as screen-reader text. */
function WithLY({text, children}: {text: string; children: ReactNode}) {
  return (
    <span title={text}>
      {children}
      <span className="sr-only"> ({text})</span>
    </span>
  );
}

type SummaryView = 'dept' | 'group';
type SummaryMeasures = 'key' | Group;
/** Key measures: actuals and their references for hours, spend, IPLH and labor rate (existing columns, no new formula). */
const KEY_COLUMNS = ['hours', 'hoursVarBud', 'hoursVarMdoc', 'pay', 'payBud', 'payVar', 'iplh', 'iplhMdoc', 'rate', 'rateBud'];
const UNGROUPED_NAMES = UNGROUPED_DEPTS.map(d => DEPARTMENTS.find(x => x.id === d)!.name).join(', ');

/** Every department (or Center Store / Fresh) of the selected area and time frame, without expanding the hierarchy. */
function DepartmentSummary({scope, t, plTotal, opTotal, lyAvailable}: {scope: Scope; t: Rollup; plTotal: LaborTotals | null; opTotal: LaborTotals; lyAvailable: boolean}) {
  const [view, setView] = useState<SummaryView>('dept');
  const [measures, setMeasures] = useState<SummaryMeasures>('key');
  const peopleActive = plTotal !== null;
  const byDept = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'dept'), [scope]);
  const lpByDept = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'dept').totals : null), [scope, peopleActive]);
  const where = scopeLabel(scope.stores);

  const rows: Row[] = useMemo(() => {
    const get = (d: DeptId) => byDept.get(d)?.labor;
    const list: SummaryRow[] = view === 'dept' ? deptRows(get) : groupRows(get);
    return list.map(s => {
      const isGroup = view === 'group';
      return {
        id: s.id,
        level: 'dept',
        name: s.name,
        sub: isGroup ? `${s.depts.length} ${s.depts.length === 1 ? 'department' : 'departments'}` : '',
        search: `${s.name}: ${s.depts.map(d => DEPARTMENTS.find(x => x.id === d)!.name).join(', ')}`,
        dept: isGroup ? null : (s.id as DeptId),
        storeIds: [...scope.stores],
        data: {r: {labor: s.labor, store: emptyStore()}, lp: lpByDept ? sumDepts(s.depts, d => lpByDept.get(d)) : null, deptKey: s.depts.length === 1 ? s.depts[0] : scope.dept, noTx: s.depts.length > 1},
        children: [],
      };
    });
  }, [byDept, lpByDept, view, scope.stores, scope.dept]);
  const totalRow: Row = {id: 'total', level: 'region', name: 'Total', sub: '', search: '', dept: null, storeIds: [...scope.stores], data: {r: t, lp: plTotal, deptKey: scope.dept, op: opTotal}, children: []};
  const memberTitle = (r: Row) => `Departments in scope: ${r.search.slice(r.name.length + 2)}.${r.id === 'ungrouped' ? ' No Dept Group membership was supplied for them; this is not the official Other group.' : ''}`;
  const opts = {lyAvailable, customerLY: false};
  const measureCols = measures === 'key' ? [...columnsFor('labor', opts), ...columnsFor('productivity', opts)].filter(c => KEY_COLUMNS.includes(c.key)) : columnsFor(measures, opts);
  const columns: Column<Row>[] = [
    {key: 'name', header: view === 'dept' ? 'Department' : 'Department group', value: r => r.name, render: r => (r.sub ? <span title={memberTitle(r)}>{r.name}<span className="cell-sub">{r.sub}</span></span> : r.name), align: 'left'},
    ...measureCols,
  ];
  const deptOnly = scope.dept !== ALL ? ` · ${deptLabel(scope.dept)} only (Department filter)` : '';

  return (
    <VisualCard
      className="dept-summary"
      title="Department summary"
      subtitle="Every department of the selected area and time frame in one table: no need to expand the hierarchy or select departments one by one. Updates with the location, time and Department filters."
      filters={
        <VisualFilters
          scope={scope}
          notes={[
            'One row per department for all stores in scope (Region, District, Store, State and Geography filters), for the selected time frame. With one department selected in the Department filter, only that department is shown.',
            'Each row adds up the store × department × week totals of its departments; ratios (IPLH, labor rate, AHR, overtime rate, AIV, variance %) are recalculated from the row totals, never averaged across stores or departments.',
            'Center Store / Fresh follows the Dept Group memberships supplied in the workbook (Stakeholder Answer). The groups do not overlap. Departments without a supplied group are shown together so the rows add up to the Total; this auxiliary row is not the official Other group. Clean is a reporting filter in Ops 100, not a level beside Center Store and Fresh, so it is not a row here (D34).',
            'Customer count, basket size and sales per transaction: a department row uses the transactions that include the department (Ops 100 department rows); group rows show n/a because department transactions overlap and cannot be added up. The Total row uses store transactions.',
            'Budget and MDoc stay separate, as in the table below. Position and Tenure filter labor actuals only; budgets, sales and items show n/a, as in the rest of the page (D20).',
          ]}
        />
      }
      actions={
        <>
          <Segmented label="View by" value={view} options={[{id: 'dept', label: 'Department'}, {id: 'group', label: 'Center Store / Fresh'}]} onChange={setView} size="sm" />
          <Segmented label="Summary measures" value={measures} options={[{id: 'key', label: 'Key measures'}, {id: 'sales', label: 'Sales & customers'}, {id: 'labor', label: 'Hours & spend'}, {id: 'productivity', label: 'Productivity, overtime & vacation'}]} onChange={setMeasures} size="sm" />
        </>
      }
    >
      <p className="table-scope">
        <b>Showing</b> {where}
        {deptOnly} · {view === 'dept' ? `${rows.length} ${rows.length === 1 ? 'department' : 'departments'}` : 'Center Store and Fresh only, as documented; other departments are grouped as "Not in Center Store / Fresh"'} · Total row = all departments in scope
        {peopleActive ? ' (labor actuals of the Position / Tenure population)' : ''}
      </p>
      {view === 'group' ? (
        <p className="note">
          Center Store and Fresh are the documented department rollups and cover part of the business, not the whole business. {UNGROUPED_NAMES} have no documented rollup and appear in the auxiliary &quot;Not in Center Store / Fresh&quot; row (not the official Other group), so the rows add up to the Total for the selected scope. Clean is a reporting filter, not a rollup. Group customer measures are n/a: department transactions overlap. <DecisionChip ids={['D34']} label="Open" align="left" />
        </p>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        label={view === 'dept' ? 'Department summary' : 'Department summary by Center Store and Fresh'}
        searchText={r => r.search}
        searchPlaceholder="Search department…"
        countNoun={view === 'dept' ? 'departments' : 'groups'}
        pinned={[totalRow]}
        pinnedLabel={() => `Total · ${scope.dept !== ALL ? deptLabel(scope.dept) : 'all departments'} · ${where}`}
        exportName={`department-summary-${view === 'dept' ? 'by-department' : 'center-fresh'}-${measures}`}
        maxHeight={460}
      />
    </VisualCard>
  );
}

export default function AllocationPage() {
  const scope = useScope('allocation');
  const [group, setGroup] = useState<Group>('labor');
  const [customerLY, setCustomerLY] = useState(false);
  const [aivView, setAivView] = useState<'summary' | 'history'>('summary');
  const [showOrg, setShowOrg] = useState(true);
  const peopleActive = peopleFilterActive(scope.people);

  const levels = useMemo(() => ({region: rollup(scope.stores, scope.dept, scope.from, scope.to, 'region'), district: rollup(scope.stores, scope.dept, scope.from, scope.to, 'district'), store: rollup(scope.stores, scope.dept, scope.from, scope.to, 'store'), storeDept: rollup(scope.stores, scope.dept, scope.from, scope.to, 'storeDept')}), [scope]);
  const t = useMemo(() => total(scope.stores, scope.dept, scope.from, scope.to), [scope]);
  const pl = useMemo(() => {
    if (!peopleActive) return null;
    const by = (g: 'region' | 'district' | 'store' | 'storeDept') => laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, g);
    return {region: by('region'), district: by('district'), store: by('store'), storeDept: by('storeDept')};
  }, [scope, peopleActive]);
  const plTotal = useMemo(() => (peopleActive ? laborForPeople(scope.stores, scope.dept, scope.from, scope.to, scope.people, 'none').totals.get('all') ?? null : null), [scope, peopleActive]);
  const lyAvailable = pl?.store.lyAvailable ?? true;
  // Operational overtime (Ops 100 Less RX) replaces the Department filter only; with all departments it equals the
  // department-filtered totals, so it is computed separately only when a department is selected.
  const op = useMemo(() => {
    if (scope.dept === ALL) return null;
    const by = (g: 'region' | 'district' | 'store' | 'none') => operationalLabor(scope.stores, scope.from, scope.to, g, peopleActive ? scope.people : null);
    return {region: by('region'), district: by('district'), store: by('store'), none: by('none')};
  }, [scope, peopleActive]);
  const opTotal = op ? (op.none.get('all') ?? emptyLabor()) : (plTotal ?? t.labor);

  const rows: Row[] = useMemo(() => {
    const at = (level: 'region' | 'district' | 'store', id: string): Row['data'] | undefined => {
      const r = levels[level].get(id);
      const lp = pl ? (pl[level].totals.get(id) ?? null) : null;
      return r ? {r, lp, deptKey: scope.dept, op: op ? (op[level].get(id) ?? emptyLabor()) : (lp ?? r.labor)} : undefined;
    };
    return buildOrgTree(scope.stores, {
      region: id => at('region', id),
      district: id => at('district', id),
      store: id => at('store', id),
      depts: sid =>
        DEPARTMENTS.flatMap(d => {
          const key = `${sid}|${d.id}`;
          const r = levels.storeDept.get(key);
          return r && r.labor.rows > 0 ? [{id: d.id, name: d.name, data: {r, lp: pl ? (pl.storeDept.totals.get(key) ?? null) : null, deptKey: d.id}}] : [];
        }),
    });
  }, [levels, pl, op, scope.stores, scope.dept]);
  const autoOpen = useMemo(() => onlyChildIds(rows), [rows]);
  const tree = useMemo(() => ({children: (r: Row) => r.children, levels: ['Region', 'District', 'Store', 'Department'], name: (r: Row) => r.name, defaultOpen: (r: Row) => autoOpen.has(r.id)}), [autoOpen]);
  const totalRow: Row = {id: 'total', level: 'region', name: 'Total', sub: '', search: '', dept: null, storeIds: [...scope.stores], data: {r: t, lp: plTotal, deptKey: scope.dept, op: opTotal}, children: []};
  const where = scopeLabel(scope.stores);

  const columns: Column<Row>[] = [
    {key: 'name', header: 'Region / District / Store / Department', value: r => r.name, render: r => (r.sub ? <>{r.name}<span className="cell-sub">{r.sub}</span></> : r.name), align: 'left'},
    ...columnsFor(group, {lyAvailable, customerLY}),
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
            <KpiCard
              level="primary"
              label="Gross Sales TY"
              decisions={['D01']}
              value={fmt.compactMoney(t.labor.sales)}
              hint={`Gross Sales (UC1 definition) of ${deptLabel(scope.dept)}. Budget = Ops 100 Sales Budget (SO1007; synthetic values), as OPS101 Sales vs Budget. LY = same fiscal weeks one year earlier: ${fmt.compactMoney(t.labor.salesLY)}, YoY ${fmt.signedCompactMoney(yoyChange(t.labor.sales, t.labor.salesLY))}. Not filtered by Position / Tenure.`}
              lines={[{label: 'Budget', value: fmt.compactMoney(t.labor.salesBud)}, {label: 'vs Budget', value: <PctVar actual={t.labor.sales} target={t.labor.salesBud} />}, {label: 'vs LY', value: <PctVar actual={t.labor.sales} target={t.labor.salesLY} />}]}
            />
            <KpiCard
              level="primary"
              label="Labor hours TY"
              decisions={['D01']}
              value={fmt.compactHours(A.hours)}
              hint={`Actual labor hours. Budget = budgeted hours (SO 1007). The MDoc operational target is a separate reference, shown in the table (Hours & spend). LY = same fiscal weeks one year earlier: ${peopleActive && !lyAvailable ? 'n/a' : fmt.compactHours(A.hoursLY)}.${peopleActive ? ' Budget shows n/a under Position / Tenure: budgets are set by store, department and period.' : ''}`}
              lines={[{label: 'Budget', value: peopleActive ? 'n/a' : fmt.compactHours(t.labor.hoursBud)}, {label: 'vs Budget', value: peopleActive ? 'n/a' : <PctVar actual={t.labor.hours} target={t.labor.hoursBud} />}, {label: 'vs LY', value: peopleActive && !lyAvailable ? 'n/a' : <PctVar actual={A.hours} target={A.hoursLY} />}]}
            />
            <KpiCard level="primary" label="Labor spend TY" decisions={['D01']} value={fmt.compactMoney(A.pay)} lines={[{label: 'Budgeted labor', value: peopleActive ? 'n/a' : fmt.compactMoney(t.labor.payBud)}, {label: 'vs Budget', value: peopleActive ? 'n/a' : <PctVar actual={t.labor.pay} target={t.labor.payBud} />}, {label: 'LY', value: peopleActive && !lyAvailable ? 'n/a' : fmt.compactMoney(A.payLY)}]} />
            <KpiCard label="Items per Labor Hour (IPLH)" hint={`${HELP.iplh} Compared with MDoc (Master Doc) as Ops 100 IPLH Actual vs Master Doc (IPLH Master Doc = MDoc items / MDoc hours). Ops 100 also has IPLH Budget (OPS107) and IPLH Last Year.`} value={peopleActive ? 'n/a' : fmt.dec1(iplh(t.labor.items, t.labor.hours))} lines={peopleActive ? [{label: 'Reason', value: 'Items not attributable to Position / Tenure'}] : [{label: 'vs MDoc', value: <RatioVar actual={iplh(t.labor.items, t.labor.hours)} target={iplh(t.labor.itemsMdoc, t.labor.hoursMdoc)} />}]} />
            <KpiCard label="Labor rate" hint={HELP.rate} value={peopleActive ? 'n/a' : fmt.pct(laborRate(t.labor.pay, t.labor.sales), 2)} decisions={['D19']} lines={peopleActive ? [{label: 'Reason', value: 'Sales not attributable to Position / Tenure'}] : [{label: 'vs Budget', value: <RateVar actual={laborRate(t.labor.pay, t.labor.sales)} target={laborRate(t.labor.payBud, t.labor.salesBud)} />}]} />
          </section>

          <DepartmentSummary scope={scope} t={t} plTotal={plTotal} opTotal={opTotal} lyAvailable={lyAvailable} />

          <VisualCard
            className="org-card"
            title="Labor allocation by region, district, store and department"
            subtitle={showOrg ? 'Starts at Region. Select + to show the districts, stores and departments below a row, with the same measures. Each row is calculated from its own totals, not by adding the rows below it.' : 'Hidden. Show the table to investigate by region, district, store and department.'}
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  'Region, District, Store, State and Geography filters limit the rows and the totals; a level left with a single row opens automatically. The Total row covers every store in scope.',
                  'Department rows follow the Department filter: with one department selected, each store shows only that department, and region, district and store rows show that department\'s measures.',
                  'Customer count, basket size and sales per transaction: region, district and store rows use store transactions (a transaction belongs to one store, so stores add up); department rows use the transactions that include the department (Ops 100 department rows). Department transactions overlap, so they are never added up to the store.',
                  'Rates, averages and ratios (AHR, IPLH, labor rate, overtime rate, AIV, basket size, variance %) are recalculated from the totals of each row, never summed or averaged across rows. Sales per square foot is all-department store sales / store square feet, also for region and district rows, and is not shown on department rows.',
                  'Budget and MDoc stay separate: Sales, Items and Spend are compared with the formal Budget (SO1007), as in the Ops 100 reports; Hours are compared with both Budget and MDoc, the Ops operational target that Ops 100 reports use for hours. The UC5 default per view is a prototype proposal (D01).',
                  peopleNote,
                ]}
              />
            }
            actions={
              <>
                {showOrg ? <Segmented label="Measure group" value={group} options={groupOptions} onChange={setGroup} size="sm" /> : null}
                {showOrg && group === 'sales' ? (
                  <label className="check">
                    <input type="checkbox" checked={customerLY} onChange={e => setCustomerLY(e.target.checked)} /> Show LY values (customers, basket)
                  </label>
                ) : null}
                <button type="button" className="btn-secondary org-toggle" aria-expanded={showOrg} aria-controls="org-table" onClick={() => setShowOrg(x => !x)}>
                  {showOrg ? 'Hide table' : 'Show table'}
                </button>
              </>
            }
          >
            <div id="org-table" hidden={!showOrg}>
              <p className="table-scope">
                <b>Showing</b> {where}
                {scope.dept !== ALL ? ` · ${deptLabel(scope.dept)} only` : ''} · Total row = all stores in scope{peopleActive ? ' (labor actuals of the Position / Tenure population)' : ''}
              </p>
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={r => r.id}
                label="Labor allocation by region, district, store and department"
                searchText={r => r.search}
                searchPlaceholder="Search region, district, store or department…"
                countNoun={rows.length === 1 ? 'region' : 'regions'}
                tree={tree}
                pinned={[totalRow]}
                pinnedLabel={() => `Total · ${where}`}
                exportName={`store-ops-labor-allocation-${group}`}
                maxHeight={560}
              />
              {group === 'sales' ? (
                <p className="note">
                  Sales per square foot uses all departments for the selected time frame and is not shown on department rows. Sales and Items Budget are synthetic values for the Ops 100 `Sales Budget` and `Items Budget` fields. <DecisionChip ids={['D24']} label="Open" align="left" />
                </p>
              ) : null}
            </div>
          </VisualCard>

          <VisualCard
            title="Average Item Value (AIV) & estimated inflation"
            subtitle={aivView === 'summary' ? 'Average item value this year vs the same fiscal weeks last year. Tracked separately: it does not adjust labor spend, labor hours, Labor Rate or IPLH.' : 'Weekly history by department, as in the OPS111 Average Item Value report. One department or the aggregate at a time. It does not adjust labor spend, labor hours, Labor Rate or IPLH.'}
            filters={
              <VisualFilters
                scope={scope}
                notes={[
                  'Gross sales and items of the stores, department and time frame in scope. Not filtered by Position / Tenure.',
                  'History by department: rolling 52 weeks ending at the last week of the selected time frame (the start of the time frame does not apply); LW, PTD, QTD and YTD are anchored on the same week. Location filters and the Department filter apply.',
                ]}
              />
            }
            actions={<Segmented label="AIV view" value={aivView} options={[{id: 'summary', label: 'Summary'}, {id: 'history', label: 'History by department'}]} onChange={setAivView} size="sm" />}
          >
            {aivView === 'history' ? (
              <AivHistory scope={scope} />
            ) : (
              <>
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
                      Estimated Inflation (% vs LY) <InfoTip text={HELP.inflation} label="About estimated inflation" align="left" />
                    </dt>
                    <dd>{fmt.signedPct(yoyPct(aivTY, aivLY))}</dd>
                  </div>
                  <div>
                    <dt>
                      Estimated Inflation ($ vs LY) <InfoTip text="(AIV TY − AIV LY) × Items sold TY. Ops 100 measure '$ Value vs LY (INF)': the part of the Gross Sales change explained by the change in average item value at this year's volume, for the same fiscal weeks last year. It is an arithmetic split, not a proven inflation effect: product mix, promotions and weighed items also change AIV. It does not adjust labor measures." label="About estimated inflation in dollars" align="left" />
                    </dt>
                    <dd>{fmt.signedCompactMoney(aivValue)}</dd>
                  </div>
                  <div>
                    <dt>
                      Gross Sales growth vs LY (not inflation adjusted) <InfoTip text="Gross Sales TY − Gross Sales LY. It equals Estimated Inflation ($ vs LY) plus the change in items sold valued at last year's AIV: (Items TY − Items LY) × AIV LY." label="About Gross Sales growth" align="left" />
                    </dt>
                    <dd>
                      {fmt.signedCompactMoney(yoyChange(t.labor.sales, t.labor.salesLY))} <PctVar actual={t.labor.sales} target={t.labor.salesLY} />
                    </dd>
                  </div>
                </dl>
                <p className="note">
                  Confirmed: estimated inflation does not adjust labor spend, labor hours, Labor Rate or IPLH. The Budget comparison (AIV Variance vs Budget) is in History by department. Open: whether this inflation estimate should be used when reporting sales growth; until then, sales growth is shown unadjusted. <DecisionChip ids={['D26']} label="Open" align="left" />
                </p>
              </>
            )}
          </VisualCard>
        </>
      )}
    </div>
  );
}

/** Operational overtime is a store-level measure: department and group rows point to the department-context columns. */
function OpDash() {
  return (
    <span className="na" title="Operational overtime (Ops 100 Less RX) covers all departments except Pharmacy of the stores in the row, so it is not repeated on department rows. See the department-context columns.">
      —
    </span>
  );
}
