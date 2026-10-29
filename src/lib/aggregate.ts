// One-pass rollups of the synthetic facts. Totals are summed first; KPIs are derived from totals
// (lib/metrics), so every ratio uses the same population, scope and time frame for both sides.
import {WEEKS} from '../data/calendar';
import {DAILY_FACTS, laborByWeek, storeWeekByWeek, type DailyFact, type LaborFact} from '../data/generate';
import {deptById, storeById, type DeptId} from '../data/org';
import {ahr, iplh, laborRate, otRate, variance, variancePct} from './metrics';
import type {Target} from './filters';

export type LaborTotals = {
  rows: number;
  sales: number;
  salesLY: number;
  salesBud: number;
  items: number;
  itemsLY: number;
  itemsBud: number;
  itemsMdoc: number;
  pay: number;
  payLY: number;
  payBud: number;
  payMdoc: number;
  hours: number;
  hoursLY: number;
  hoursBud: number;
  hoursMdoc: number;
  hoursProj: number;
  /** Overtime scope excludes Pharmacy (RX), confirmed. */
  otHours: number;
  otHoursLY: number;
  otPay: number;
  otPayLY: number;
  /** Payroll $ excluding RX: the overtime-rate denominator. */
  otBasePay: number;
  otBasePayLY: number;
  vacHours: number;
  vacHoursLY: number;
  ftHours: number;
  /** Σ per fact row of Actual pay − (Budget labor rate × Actual sales), rows with budget sales only (documented draft). */
  flexVar: number;
  /** Department transactions (overlap across departments: meaningful only for one department at a time). */
  tx: number;
  txLY: number;
};

/** Store-level totals that do NOT follow the Department filter (a basket spans departments). */
export type StoreTotals = {
  tx: number;
  txLY: number;
  /** All-department sales, items and Clean Sales of the stores in scope. */
  storeSales: number;
  storeSalesLY: number;
  storeItems: number;
  storeItemsLY: number;
  cleanSales: number;
  cleanSalesLY: number;
  sqft: number;
};

export const emptyLabor = (): LaborTotals => ({rows: 0, sales: 0, salesLY: 0, salesBud: 0, items: 0, itemsLY: 0, itemsBud: 0, itemsMdoc: 0, pay: 0, payLY: 0, payBud: 0, payMdoc: 0, hours: 0, hoursLY: 0, hoursBud: 0, hoursMdoc: 0, hoursProj: 0, otHours: 0, otHoursLY: 0, otPay: 0, otPayLY: 0, otBasePay: 0, otBasePayLY: 0, vacHours: 0, vacHoursLY: 0, ftHours: 0, flexVar: 0, tx: 0, txLY: 0});
export const emptyStore = (): StoreTotals => ({tx: 0, txLY: 0, storeSales: 0, storeSalesLY: 0, storeItems: 0, storeItemsLY: 0, cleanSales: 0, cleanSalesLY: 0, sqft: 0});

export function addFact(t: LaborTotals, f: LaborFact) {
  t.rows++;
  t.sales += f.sales;
  t.salesLY += f.salesLY;
  t.salesBud += f.salesBud;
  t.items += f.items;
  t.itemsLY += f.itemsLY;
  t.itemsBud += f.itemsBud;
  t.itemsMdoc += f.itemsMdoc;
  t.pay += f.pay;
  t.payLY += f.payLY;
  t.payBud += f.payBud;
  t.payMdoc += f.payMdoc;
  t.hours += f.hours;
  t.hoursLY += f.hoursLY;
  t.hoursBud += f.hoursBud;
  t.hoursMdoc += f.hoursMdoc;
  t.hoursProj += f.hoursProj;
  t.vacHours += f.vacHours;
  t.vacHoursLY += f.vacHoursLY;
  t.ftHours += f.ftHours;
  t.tx += f.tx;
  t.txLY += f.txLY;
  if (f.salesBud > 0) t.flexVar += f.pay - (f.payBud / f.salesBud) * f.sales;
  if (!deptById.get(f.dept)?.otExcluded) {
    t.otHours += f.otHours;
    t.otHoursLY += f.otHoursLY;
    t.otPay += f.otPay;
    t.otPayLY += f.otPayLY;
    t.otBasePay += f.pay;
    t.otBasePayLY += f.payLY;
  }
}

/** `storeDept`: one group per store × department (key `store|dept`), for the Store → Department table. */
export type GroupKey = 'none' | 'week' | 'period' | 'store' | 'district' | 'region' | 'dept' | 'storeDept';

function keyOf(group: GroupKey, f: {w: number; store: string; dept?: DeptId}): string {
  switch (group) {
    case 'none':
      return 'all';
    case 'week':
      return String(f.w);
    case 'period': {
      const w = WEEKS[f.w];
      return `${w.fy}-P${String(w.period).padStart(2, '0')}`;
    }
    case 'store':
      return f.store;
    case 'district':
      return storeById.get(f.store)?.districtId ?? '';
    case 'region':
      return storeById.get(f.store)?.regionId ?? '';
    case 'dept':
      return f.dept ?? 'all';
    case 'storeDept':
      return `${f.store}|${f.dept ?? 'all'}`;
  }
}

export type Rollup = {labor: LaborTotals; store: StoreTotals};

/** Rolls labor and store-level facts into groups. `dept` filters labor measures only. Department groups carry no
 *  store-level totals: department transactions overlap, so a department row uses its own `labor.tx`. */
export function rollup(stores: Set<string>, dept: 'All' | DeptId, from: number, to: number, group: GroupKey = 'none'): Map<string, Rollup> {
  const out = new Map<string, Rollup>();
  const get = (k: string) => {
    let r = out.get(k);
    if (!r) out.set(k, (r = {labor: emptyLabor(), store: emptyStore()}));
    return r;
  };
  const sqftSeen = new Set<string>();
  for (let w = from; w <= to; w++) {
    for (const f of laborByWeek[w] ?? []) {
      if (!stores.has(f.store)) continue;
      const r = get(keyOf(group, f));
      if (dept === 'All' || f.dept === dept) addFact(r.labor, f);
      if (group === 'dept' || group === 'storeDept') continue;
      r.store.storeSales += f.sales;
      r.store.storeSalesLY += f.salesLY;
      r.store.storeItems += f.items;
      r.store.storeItemsLY += f.itemsLY;
      if (!deptById.get(f.dept)?.cleanExcluded) {
        r.store.cleanSales += f.sales;
        r.store.cleanSalesLY += f.salesLY;
      }
      const sqKey = `${keyOf(group, f)}|${f.store}`;
      if (f.sales > 0 && !sqftSeen.has(sqKey)) {
        sqftSeen.add(sqKey);
        r.store.sqft += storeById.get(f.store)?.sqft ?? 0;
      }
    }
    if (group === 'dept' || group === 'storeDept') continue;
    for (const s of storeWeekByWeek[w] ?? []) {
      if (!stores.has(s.store)) continue;
      const r = get(keyOf(group, s));
      r.store.tx += s.tx;
      r.store.txLY += s.txLY;
    }
  }
  return out;
}

export const total = (stores: Set<string>, dept: 'All' | DeptId, from: number, to: number): Rollup => rollup(stores, dept, from, to, 'none').get('all') ?? {labor: emptyLabor(), store: emptyStore()};

/** Customer measures with the Ops 100 department behavior: all departments → store totals (the TOTAL row);
 *  one department → that department's transactions, items and sales (Basket Size = items / transactions in the
 *  department context). Department transactions are never summed into a store total. */
export function customerBase(r: Rollup, dept: 'All' | string) {
  return dept === 'All'
    ? {tx: r.store.tx, txLY: r.store.txLY, items: r.store.storeItems, itemsLY: r.store.storeItemsLY, sales: r.store.storeSales, salesLY: r.store.storeSalesLY}
    : {tx: r.labor.tx, txLY: r.labor.txLY, items: r.labor.items, itemsLY: r.labor.itemsLY, sales: r.labor.sales, salesLY: r.labor.salesLY};
}

/** Reference values for a KPI. null when the Ops 100 draft has no such reference for the KPI. */
export function refSpend(t: LaborTotals, ref: Target) {
  return ref === 'budget' ? t.payBud : ref === 'mdoc' ? t.payMdoc : t.payLY;
}
export function refHours(t: LaborTotals, ref: Target) {
  return ref === 'budget' ? t.hoursBud : ref === 'mdoc' ? t.hoursMdoc : t.hoursLY;
}
/** Labor Rate reference: Budget = Budget pay / Budget sales; LY = LY pay / LY sales; MDoc has no sales. */
export function refLaborRate(t: LaborTotals, ref: Target) {
  return ref === 'budget' ? laborRate(t.payBud, t.salesBud) : ref === 'ly' ? laborRate(t.payLY, t.salesLY) : null;
}
export function refAhr(t: LaborTotals, ref: Target) {
  return ref === 'budget' ? ahr(t.payBud, t.hoursBud) : ref === 'mdoc' ? ahr(t.payMdoc, t.hoursMdoc) : ahr(t.payLY, t.hoursLY);
}
/** IPLH reference: MDoc = Items MDoc / Hours MDoc (the OPS107 report comparison and the prototype's primary IPLH
 *  reference); Budget = Items Budget / Hours Budget (Ops 100 `IPLH Budget`); LY = Items LY / Hours LY. D01 open. */
export function refIplh(t: LaborTotals, ref: Target) {
  return ref === 'mdoc' ? iplh(t.itemsMdoc, t.hoursMdoc) : ref === 'budget' ? iplh(t.itemsBud, t.hoursBud) : iplh(t.itemsLY, t.hoursLY);
}

/** Core labor KPIs derived from totals. */
export function laborKpis(t: LaborTotals, ref: Target) {
  const spendRef = refSpend(t, ref);
  const hoursRef = refHours(t, ref);
  return {
    spend: t.pay,
    spendRef,
    spendVar: variance(t.pay, spendRef),
    spendVarPct: variancePct(t.pay, spendRef),
    hours: t.hours,
    hoursRef,
    hoursVar: variance(t.hours, hoursRef),
    hoursVarPct: variancePct(t.hours, hoursRef),
    laborRate: laborRate(t.pay, t.sales),
    laborRateRef: refLaborRate(t, ref),
    ahr: ahr(t.pay, t.hours),
    ahrRef: refAhr(t, ref),
    iplh: iplh(t.items, t.hours),
    iplhRef: refIplh(t, ref),
    otPay: t.otPay,
    otPayLY: t.otPayLY,
    otHours: t.otHours,
    otHoursLY: t.otHoursLY,
    otRate: otRate(t.otPay, t.otBasePay),
    otRateLY: otRate(t.otPayLY, t.otBasePayLY),
    hoursVsProj: variance(t.hours, t.hoursProj),
    hoursVsProjPct: variancePct(t.hours, t.hoursProj),
    vacHours: t.vacHours,
    vacHoursLY: t.vacHoursLY,
  };
}
export type LaborKpis = ReturnType<typeof laborKpis>;

/** Daily rollup for the Daily Labor vs Budget view. */
export type DailyTotals = {sales: number; hours: number; pay: number; hoursBud: number; payBud: number; hoursMdoc: number; payMdoc: number};
export function dailyRollup(stores: Set<string>, dept: 'All' | DeptId, w: number, day: number | 'all', group: (f: DailyFact) => string): Map<string, DailyTotals> {
  const out = new Map<string, DailyTotals>();
  for (const f of DAILY_FACTS) {
    if (f.w !== w || !stores.has(f.store) || (dept !== 'All' && f.dept !== dept) || (day !== 'all' && f.day !== day)) continue;
    const k = group(f);
    let t = out.get(k);
    if (!t) out.set(k, (t = {sales: 0, hours: 0, pay: 0, hoursBud: 0, payBud: 0, hoursMdoc: 0, payMdoc: 0}));
    t.sales += f.sales;
    t.hours += f.hours;
    t.pay += f.pay;
    t.hoursBud += f.hoursBud;
    t.payBud += f.payBud;
    t.hoursMdoc += f.hoursMdoc;
    t.payMdoc += f.payMdoc;
  }
  return out;
}
