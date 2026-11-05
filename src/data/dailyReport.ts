// Synthetic store-level inputs for the Daily Labor Update (Daily Labor vs Budget). The reference report is store level
// (no department detail), so nothing here is split by department.
//
// Fields follow the report's sources (Report_Master_Daily Labor Update, read for structure and formulas only):
//   Chain Forecast  the report reads it from its Summary "Master DOC" block (sales, units, hours, labor $); here the
//                   synthetic MDoc fields (items / hours / pay MDoc) and MDoc sales = MDoc items × budgeted AIV.
//   Store Projected projected sales, payroll hours and payroll $ of the store schedule (SO1006 style); projected hours
//                   are the existing synthetic `hoursProj`, so they agree with the call-off proxy.
//   Budget          budgeted sales and labor plan $ (SO1007 style), for the budgeted payroll %.
//   Actual          sales, items, hours and payroll $; for the current week only, day by day.
//   LY              items and hours of the same week number one year earlier (LY IPLH).
// Weeks after the last loaded week (next and future weeks of the latest report) have no facts: their targets repeat
// the same week last year scaled by the store's latest year-over-year change. Synthetic and illustrative only.
import {DAY_NAMES, LAST_WEEK_IDX, WEEKS_PER_YEAR, addDays, weekStart} from './calendar';
import {DAILY_FACTS, DAILY_FIRST_WEEK_IDX, laborByWeek, type LaborFact} from './generate';
import {STORES} from './org';
import {hashSeed, mulberry32, noise} from '../lib/prng';

/** Store-week targets (and LY) used by every section of the report. */
export type StoreWeekTargets = {
  w: number;
  store: string;
  cfSales: number;
  cfItems: number;
  cfHours: number;
  cfPay: number;
  budSales: number;
  budPay: number;
  projSales: number;
  projHours: number;
  projPay: number;
  lyItems: number;
  lyHours: number;
};

/** One store and day of a loaded week: actuals plus the day's share of each target. */
export type StoreDay = {
  w: number;
  day: number;
  date: string;
  store: string;
  sales: number;
  items: number;
  hours: number;
  pay: number;
  hoursBud: number;
  hoursMdoc: number;
  budSales: number;
  budPay: number;
  cfSales: number;
  cfItems: number;
  cfHours: number;
  cfPay: number;
  projSales: number;
  projHours: number;
  projPay: number;
};

/** Weeks the report can be run for (the current week) and the latest week with projections (current + 2). */
export const REPORT_FIRST_WEEK = DAILY_FIRST_WEEK_IDX;
export const REPORT_LAST_WEEK = LAST_WEEK_IDX;
export const PROJECTION_LAST_WEEK = LAST_WEEK_IDX + 2;

const factsOf = (w: number) => (w >= 0 && w <= LAST_WEEK_IDX ? laborByWeek[w] : []);

function targetsFromFacts(w: number, store: string, rows: LaborFact[]): StoreWeekTargets {
  const t: StoreWeekTargets = {w, store, cfSales: 0, cfItems: 0, cfHours: 0, cfPay: 0, budSales: 0, budPay: 0, projSales: 0, projHours: 0, projPay: 0, lyItems: 0, lyHours: 0};
  for (const f of rows) {
    const budAiv = f.itemsBud > 0 ? f.salesBud / f.itemsBud : 0;
    t.cfItems += f.itemsMdoc;
    t.cfSales += f.itemsMdoc * budAiv;
    t.cfHours += f.hoursMdoc;
    t.cfPay += f.payMdoc;
    t.budSales += f.salesBud;
    t.budPay += f.payBud;
    t.projHours += f.hoursProj;
    t.projPay += f.hoursBud > 0 ? f.hoursProj * (f.payBud / f.hoursBud) : 0;
    t.lyItems += f.itemsLY;
    t.lyHours += f.hoursLY;
  }
  // The store's own sales projection stays close to its budget (its own seed: other figures are unchanged).
  t.projSales = t.budSales * (1 + noise(mulberry32(hashSeed(`daily-proj-${store}-${w}`)), 0.02));
  return t;
}

function buildTargets(): Map<string, StoreWeekTargets> {
  const out = new Map<string, StoreWeekTargets>();
  const byStore = (w: number) => {
    const m = new Map<string, LaborFact[]>();
    for (const f of factsOf(w)) {
      let list = m.get(f.store);
      if (!list) m.set(f.store, (list = []));
      list.push(f);
    }
    return m;
  };
  for (let w = REPORT_FIRST_WEEK; w <= LAST_WEEK_IDX; w++) for (const [store, rows] of byStore(w)) out.set(`${store}|${w}`, targetsFromFacts(w, store, rows));
  // Next and future weeks of the latest report: same week last year × the store's latest year-over-year change.
  const last = byStore(LAST_WEEK_IDX);
  const lastLy = byStore(LAST_WEEK_IDX - WEEKS_PER_YEAR);
  const sum = (rows: LaborFact[] | undefined, k: 'sales' | 'hours' | 'items') => (rows ?? []).reduce((a, f) => a + f[k], 0);
  for (let w = LAST_WEEK_IDX + 1; w <= PROJECTION_LAST_WEEK; w++) {
    const ly = byStore(w - WEEKS_PER_YEAR);
    for (const store of STORES) {
      const lyRows = ly.get(store.id);
      const lastRows = last.get(store.id);
      if (!lastRows) continue;
      // A store without that week last year (opened since) starts from its latest week, unscaled.
      const rows = lyRows ?? lastRows;
      const base = targetsFromFacts(w, store.id, rows);
      const gS = lyRows && sum(lastLy.get(store.id), 'sales') > 0 ? sum(lastRows, 'sales') / sum(lastLy.get(store.id), 'sales') : 1;
      const gH = lyRows && sum(lastLy.get(store.id), 'hours') > 0 ? sum(lastRows, 'hours') / sum(lastLy.get(store.id), 'hours') : 1;
      out.set(`${store.id}|${w}`, {
        ...base,
        cfSales: base.cfSales * gS,
        cfItems: Math.round(base.cfItems * gS),
        cfHours: base.cfHours * gH,
        cfPay: base.cfPay * gH,
        budSales: base.budSales * gS,
        budPay: base.budPay * gH,
        projSales: base.projSales * gS,
        projHours: base.projHours * gH,
        projPay: base.projPay * gH,
        lyItems: lyRows ? sum(lyRows, 'items') : 0,
        lyHours: lyRows ? sum(lyRows, 'hours') : 0,
      });
    }
  }
  return out;
}

export const WEEK_TARGETS = buildTargets();

function buildDays(): StoreDay[] {
  const facts = new Map<string, LaborFact>();
  for (let w = REPORT_FIRST_WEEK; w <= LAST_WEEK_IDX; w++) for (const f of laborByWeek[w]) facts.set(`${f.w}|${f.store}|${f.dept}`, f);
  const acc = new Map<string, StoreDay & {payBudDay: number}>();
  for (const d of DAILY_FACTS) {
    const k = `${d.store}|${d.w}|${d.day}`;
    let r = acc.get(k);
    if (!r) acc.set(k, (r = {w: d.w, day: d.day, date: d.date, store: d.store, sales: 0, items: 0, hours: 0, pay: 0, hoursBud: 0, hoursMdoc: 0, budSales: 0, budPay: 0, cfSales: 0, cfItems: 0, cfHours: 0, cfPay: 0, projSales: 0, projHours: 0, projPay: 0, payBudDay: 0}));
    const f = facts.get(`${d.w}|${d.store}|${d.dept}`);
    r.sales += d.sales;
    r.items += f && f.sales > 0 ? f.items * (d.sales / f.sales) : 0;
    r.hours += d.hours;
    r.pay += d.pay;
    r.hoursBud += d.hoursBud;
    r.hoursMdoc += d.hoursMdoc;
    r.payBudDay += d.payBud;
    r.cfHours += d.hoursMdoc;
    r.cfPay += d.payMdoc;
  }
  // Day share of the weekly plan (the planned day curve of the budget), used for the targets without a daily field.
  const weekPlan = new Map<string, number>();
  for (const r of acc.values()) weekPlan.set(`${r.store}|${r.w}`, (weekPlan.get(`${r.store}|${r.w}`) ?? 0) + r.payBudDay);
  const out: StoreDay[] = [];
  for (const r of acc.values()) {
    const t = WEEK_TARGETS.get(`${r.store}|${r.w}`);
    const plan = weekPlan.get(`${r.store}|${r.w}`) ?? 0;
    const share = t && plan > 0 ? r.payBudDay / plan : 0;
    const {payBudDay: _payBudDay, ...day} = r;
    void _payBudDay;
    out.push({
      ...day,
      budSales: (t?.budSales ?? 0) * share,
      budPay: (t?.budPay ?? 0) * share,
      cfSales: (t?.cfSales ?? 0) * share,
      cfItems: (t?.cfItems ?? 0) * share,
      projSales: (t?.projSales ?? 0) * share,
      projHours: (t?.projHours ?? 0) * share,
      projPay: (t?.projPay ?? 0) * share,
    });
  }
  return out;
}

export const STORE_DAYS: readonly StoreDay[] = buildDays();

/** Sunday-to-Saturday dates of a report week (also for the projected weeks after the loaded data). */
export function reportWeekDates(w: number): {start: string; end: string; fy: number; week: number} {
  const fy = 2025 + Math.floor(w / WEEKS_PER_YEAR);
  const week = (w % WEEKS_PER_YEAR) + 1;
  const start = weekStart(fy, week);
  return {start, end: addDays(start, 6), fy, week};
}

export const dayName = (d: number) => DAY_NAMES[d];
