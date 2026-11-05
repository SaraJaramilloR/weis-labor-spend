// Daily Labor Update ("Payroll Update" is the email subject of the same report). Formulas reproduced from
// Report_Master_Daily Labor Update (sheets Current / Next / Future, Current-D / Next-D / Future-D, DMEmailBody):
//
// Current week (week to date through the data cutoff; the report date is the Week Ending Saturday):
//   Sales      Chain Forecast, Store Projected, Actual, Actual vs Store Projected = Actual − Store Projected
//   Items      Chain Forecast, Store Projected = ROUND(Store Projected sales / Chain Forecast avg unit $), Actual,
//              Actual vs Store Projected
//   Hours      Chain Forecast, Store Projected, Hours to hit IPLH = Actual items / Chain Forecast IPLH, Actual,
//              Actual vs Hrs to hit IPLH = Actual − Hours to hit IPLH
//   IPLH       Chain Forecast = CF items / CF hours, Projected = projected items / projected hours,
//              Actual = actual items / actual hours, Actual vs Chain Forecast, LY IPLH
//   Labor Rate (district email) Budget = budgeted payroll %, Actual = actual payroll %, Actual vs Budget
// Next and future weeks (whole week, projections only):
//   Sales / Items as above with Var = Store Projected − Chain Forecast
//   Hours      Chain Forecast, Hours to hit PRO IPLH = ROUND(Store Projected items / Chain Forecast IPLH),
//              Store Projected, Var = Store Projected − Hours to hit PRO IPLH
//   IPLH       Chain Forecast, Store Projected, Var, LY IPLH
//   Labor Rate (district email) Chain Forecast = budgeted labor plan $ / Chain Forecast sales,
//              Projected = projected payroll $ / Store Projected sales, Var
// Totals add store components (as the report's SUM rows do); every ratio is recalculated from those sums.
import {STORE_DAYS, WEEK_TARGETS, reportWeekDates, type StoreDay} from '../data/dailyReport';
import {storeById} from '../data/org';
import {ratio} from './metrics';

export type ReportSection = 'current' | 'next' | 'future';
export const SECTION_OFFSET: Record<ReportSection, number> = {current: 0, next: 1, future: 2};

/** Additive components of one row. Actuals are null when the section has none (next and future weeks). */
export type ReportTotals = {
  stores: number;
  cfSales: number;
  cfItems: number;
  cfHours: number;
  cfPay: number;
  projSales: number;
  projItems: number;
  projHours: number;
  projPay: number;
  hoursToHit: number;
  budSales: number;
  budPay: number;
  lyItems: number;
  lyHours: number;
  actSales: number | null;
  actItems: number | null;
  actHours: number | null;
  actPay: number | null;
};

const empty = (withActuals: boolean): ReportTotals => ({stores: 0, cfSales: 0, cfItems: 0, cfHours: 0, cfPay: 0, projSales: 0, projItems: 0, projHours: 0, projPay: 0, hoursToHit: 0, budSales: 0, budPay: 0, lyItems: 0, lyHours: 0, actSales: withActuals ? 0 : null, actItems: withActuals ? 0 : null, actHours: withActuals ? 0 : null, actPay: withActuals ? 0 : null});

function add(into: ReportTotals, r: ReportTotals) {
  for (const k of Object.keys(into) as (keyof ReportTotals)[]) {
    const a = into[k];
    const b = r[k];
    if (a === null || b === null) continue;
    (into[k] as number) = a + b;
  }
}

const daysByKey = new Map<string, StoreDay[]>();
for (const d of STORE_DAYS) {
  const k = `${d.store}|${d.w}`;
  let list = daysByKey.get(k);
  if (!list) daysByKey.set(k, (list = []));
  list.push(d);
}

/** Current week of one store, week to date through `cutoff` (0 = Sunday … 6 = Saturday). */
export function storeCurrent(store: string, w: number, cutoff: number): ReportTotals | undefined {
  const week = WEEK_TARGETS.get(`${store}|${w}`);
  const days = (daysByKey.get(`${store}|${w}`) ?? []).filter(d => d.day <= cutoff);
  if (!week || !days.length) return undefined;
  const t = empty(true);
  t.stores = 1;
  for (const d of days) {
    t.cfSales += d.cfSales;
    t.cfItems += d.cfItems;
    t.cfHours += d.cfHours;
    t.cfPay += d.cfPay;
    t.projSales += d.projSales;
    t.projHours += d.projHours;
    t.projPay += d.projPay;
    t.budSales += d.budSales;
    t.budPay += d.budPay;
    t.actSales! += d.sales;
    t.actItems! += d.items;
    t.actHours! += d.hours;
    t.actPay! += d.pay;
  }
  const avgUnit = ratio(week.cfSales, week.cfItems);
  t.projItems = avgUnit ? Math.round(t.projSales / avgUnit) : 0;
  const cfIplh = ratio(t.cfItems, t.cfHours);
  t.hoursToHit = cfIplh ? t.actItems! / cfIplh : 0;
  t.lyItems = week.lyItems;
  t.lyHours = week.lyHours;
  return t;
}

/** Next or future week of one store: whole-week projections, no actuals. */
export function storeAhead(store: string, w: number): ReportTotals | undefined {
  const week = WEEK_TARGETS.get(`${store}|${w}`);
  if (!week) return undefined;
  const t = empty(false);
  t.stores = 1;
  t.cfSales = week.cfSales;
  t.cfItems = week.cfItems;
  t.cfHours = week.cfHours;
  t.cfPay = week.cfPay;
  t.projSales = week.projSales;
  t.projHours = week.projHours;
  t.projPay = week.projPay;
  t.budSales = week.budSales;
  t.budPay = week.budPay;
  const avgUnit = ratio(week.cfSales, week.cfItems);
  t.projItems = avgUnit ? Math.round(week.projSales / avgUnit) : 0;
  const cfIplh = ratio(week.cfItems, week.cfHours);
  t.hoursToHit = cfIplh ? Math.round(t.projItems / cfIplh) : 0;
  t.lyItems = week.lyItems;
  t.lyHours = week.lyHours;
  return t;
}

export type ReportGroup = 'store' | 'district' | 'region' | 'none';

/** Section totals for the stores in scope, grouped by store, district, region or a single total ('all'). */
export function reportRollup(stores: Set<string>, section: ReportSection, currentWeek: number, cutoff: number, group: ReportGroup): Map<string, ReportTotals> {
  const w = currentWeek + SECTION_OFFSET[section];
  const out = new Map<string, ReportTotals>();
  for (const id of stores) {
    const r = section === 'current' ? storeCurrent(id, w, cutoff) : storeAhead(id, w);
    if (!r) continue;
    const s = storeById.get(id);
    const key = group === 'store' ? id : group === 'district' ? (s?.districtId ?? '') : group === 'region' ? (s?.regionId ?? '') : 'all';
    let t = out.get(key);
    if (!t) out.set(key, (t = empty(section === 'current')));
    add(t, r);
  }
  return out;
}

/** Ratios of a row, always from its own summed components. */
export function reportRatios(t: ReportTotals) {
  const cfIplh = ratio(t.cfItems, t.cfHours);
  const projIplh = ratio(t.projItems, t.projHours);
  const actIplh = t.actItems === null || t.actHours === null ? null : ratio(t.actItems, t.actHours);
  return {
    cfIplh,
    projIplh,
    actIplh,
    lyIplh: ratio(t.lyItems, t.lyHours),
    /** Current week: budgeted payroll % (labor plan $ / budgeted sales). */
    budLaborRate: ratio(t.budPay, t.budSales),
    actLaborRate: t.actPay === null || t.actSales === null ? null : ratio(t.actPay, t.actSales),
    /** Next / future weeks (district email): budgeted labor plan $ / Chain Forecast sales. */
    cfLaborRate: ratio(t.budPay, t.cfSales),
    projLaborRate: ratio(t.projPay, t.projSales),
  };
}

/** Day rows of the current week for the stores in scope; actuals after the cutoff are null (not yet reported). */
export function currentWeekDays(stores: Set<string>, w: number, cutoff: number) {
  const days = Array.from({length: 7}, (_, day) => ({day, date: '', sales: 0, hours: 0, pay: 0, items: 0, budSales: 0, budPay: 0, hoursBud: 0, hoursMdoc: 0, projSales: 0, projHours: 0, projPay: 0, reported: day <= cutoff}));
  const {start} = reportWeekDates(w);
  for (const d of STORE_DAYS) {
    if (d.w !== w || !stores.has(d.store)) continue;
    const r = days[d.day];
    r.sales += d.sales;
    r.hours += d.hours;
    r.pay += d.pay;
    r.items += d.items;
    r.budSales += d.budSales;
    r.budPay += d.budPay;
    r.hoursBud += d.hoursBud;
    r.hoursMdoc += d.hoursMdoc;
    r.projSales += d.projSales;
    r.projHours += d.projHours;
    r.projPay += d.projPay;
  }
  return days.map(r => ({...r, date: addDaysIso(start, r.day), sales: r.reported ? r.sales : null, hours: r.reported ? r.hours : null, pay: r.reported ? r.pay : null, items: r.reported ? r.items : null}));
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
