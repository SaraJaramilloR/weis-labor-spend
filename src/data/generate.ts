// Deterministic synthetic operational facts. All figures are illustrative; no value comes from Weis files.
//
// Grains (kept separate so ratios never mix populations):
//   LaborFact      one row per store × department × week (sales, items, labor $ / hours, targets, OT)
//   StoreWeekFact  one row per store × week (transactions: a basket spans departments, so it is not split)
//   DailyFact      one row per store × department × day, last 8 weeks only (Daily Labor vs Budget)
// Last-year values sit on the same row (as the OPS "Lyear" columns do) and equal the actuals of the same
// week number one year earlier, so FY2026 LY reconciles exactly with FY2025 actuals.
import {LAST_WEEK_IDX, WEEKS, WEEKS_PER_YEAR} from './calendar';
import {DEPARTMENTS, STORES, storeHasDept, type Department, type DeptId, type Store} from './org';
import {between, hashSeed, mulberry32, noise} from '../lib/prng';

export type LaborFact = {
  w: number;
  store: string;
  dept: DeptId;
  sales: number;
  salesLY: number;
  salesBud: number;
  items: number;
  itemsLY: number;
  /** Budget items (Ops 100 Warehouse `Items Budget`): Budget sales / a budgeted average item value. */
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
  /** Projected (scheduled) hours, SO 1006 style. Used only for Hours vs Projection (call-off proxy). */
  hoursProj: number;
  otHours: number;
  otHoursLY: number;
  /** Illustrative: overtime hours × rate × 1.5 (full overtime pay; premium-only is open, D04). */
  otPay: number;
  otPayLY: number;
  /** Kept separate from actual hours; whether vacation is inside actual hours is open (D17). */
  vacHours: number;
  vacHoursLY: number;
  /** Hours worked by full-time associates (UKG-style split by employee type). */
  ftHours: number;
  /** Transactions that include this department (Ops 100 department rows carry their own Tx Actual / Tx Lyear;
   *  they overlap across departments, so they are never summed to a store total). */
  tx: number;
  txLY: number;
};

export type StoreWeekFact = {w: number; store: string; tx: number; txLY: number};

export type DailyFact = {
  w: number;
  day: number;
  date: string;
  store: string;
  dept: DeptId;
  sales: number;
  hours: number;
  pay: number;
  hoursBud: number;
  payBud: number;
  hoursMdoc: number;
  payMdoc: number;
};

const SEED = 5;
export const FIRST_GEN_IDX = -WEEKS_PER_YEAR; // FY2024 W01, used only to fill FY2025 last-year values.

/** Week-of-year sales index: holiday peaks and a January dip (illustrative). */
function season(week: number): number {
  const peaks: Record<number, number> = {7: 1.03, 14: 1.06, 21: 1.04, 27: 1.05, 36: 1.03, 44: 1.02, 47: 1.17, 48: 1.03, 51: 1.15, 52: 1.06};
  const base = week <= 4 ? 0.94 : week <= 8 ? 0.97 : 1;
  return (peaks[week] ?? base) * (1 + 0.015 * Math.sin((week / 52) * 2 * Math.PI));
}
/** Illustrative staffing scenario per store: labor hours, spend, budget and the associate roster all follow the same
 *  annual trend, so headcount growth or reduction is visible in hires and terminations. No Weis benchmark is used. */
export type StaffScenario = 'growth' | 'stable' | 'reduction';
export const STAFF_TREND = new Map<string, {scenario: StaffScenario; rate: number}>();
for (const store of STORES) {
  const r = mulberry32(hashSeed(`staff-${store.id}`));
  const roll = r();
  const scenario: StaffScenario = store.openWeekIdx > 0 ? 'stable' : roll < 0.3 ? 'growth' : roll < 0.75 ? 'stable' : 'reduction';
  const rate = scenario === 'growth' ? between(r, 0.05, 0.09) : scenario === 'reduction' ? -between(r, 0.04, 0.08) : between(r, -0.01, 0.015);
  STAFF_TREND.set(store.id, {scenario, rate});
}
/** Staffing level of a store in a generated week relative to its base (FY2024 W01). */
export const staffFactor = (storeId: string, i: number) => (1 + (STAFF_TREND.get(storeId)?.rate ?? 0)) ** ((i - FIRST_GEN_IDX) / WEEKS_PER_YEAR);
/** Opening ramp of a new store: hours (and roster) start at 70 % and reach 100 % in about 8 weeks. */
export const openRamp = (store: Store, i: number) => (store.openWeekIdx > 0 ? Math.min(1, 0.7 + 0.04 * Math.max(0, i - store.openWeekIdx)) : 1);

const OT_SEASON = (week: number) => (week === 47 || week === 51 || week === 52 ? 1.8 : week === 14 || week === 27 ? 1.3 : 1);
const VAC_SEASON = (week: number) => (week >= 24 && week <= 35 ? 1.7 : week >= 51 ? 1.5 : 0.8);

const OT_DEPT: Partial<Record<DeptId, number>> = {meat: 1.7, deli: 1.4, bakery: 1.3, seafood: 1.2, rx: 1.6, frontend: 0.8, fuel: 0.5};
const FT_SHARE: Partial<Record<DeptId, number>> = {meat: 0.74, rx: 0.8, seafood: 0.62, produce: 0.58, bakery: 0.56, grocery: 0.55, frontend: 0.34, starbucks: 0.3, fuel: 0.3};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Illustrative share of store transactions that include each department (basket penetration). */
const PENETRATION: Record<DeptId, number> = {grocery: 0.65, dairy: 0.36, frozen: 0.22, hbc: 0.11, gm: 0.09, beer: 0.05, meat: 0.23, seafood: 0.05, produce: 0.33, floral: 0.02, deli: 0.19, bakery: 0.16, starbucks: 0.012, rx: 0.05, fuel: 0.08, frontend: 0.84, online: 0.01};

/** Weekly base hours and full-time hours share per store × department (used to size the synthetic roster). */
export type DeptBase = {dept: DeptId; hours: number; ftShare: number};
export const STORE_DEPT_BASE = new Map<string, DeptBase[]>();

type Profile = {dept: Department; salesBase: number; payBase: number; ot: number; ft: number; mdocHours: number; mdocPay: number; mdocItems: number; planBias: number; laborTarget: number};

function storeProfiles(store: Store, rnd: () => number): Profile[] {
  const depts = DEPARTMENTS.filter(d => storeHasDept(store, d.id));
  const salesTotal = depts.reduce((s, d) => s + d.salesShare, 0);
  const laborTotal = depts.reduce((s, d) => s + d.laborShare, 0);
  const storeSales = 430_000 * store.size;
  const laborRate = 0.092 * (1 + noise(rnd, 0.07));
  return depts.map(dept => ({
    dept,
    salesBase: (storeSales * dept.salesShare * (1 + noise(rnd, 0.08))) / salesTotal,
    payBase: (storeSales * laborRate * dept.laborShare * (1 + noise(rnd, 0.06))) / laborTotal,
    ot: 0.0035 * (OT_DEPT[dept.id] ?? 1) * Math.exp(noise(rnd, 0.35)),
    ft: Math.min(0.88, (FT_SHARE[dept.id] ?? 0.52) * (1 + noise(rnd, 0.08))),
    mdocHours: noise(rnd, 0.018),
    mdocPay: noise(rnd, 0.012),
    mdocItems: noise(rnd, 0.015),
    planBias: noise(rnd, 0.015),
    laborTarget: 1 + noise(rnd, 0.02),
  }));
}

type Actual = {sales: number; items: number; pay: number; hours: number; otHours: number; otPay: number; vac: number};
const ZERO: Actual = {sales: 0, items: 0, pay: 0, hours: 0, otHours: 0, otPay: 0, vac: 0};

function generate() {
  const labor: LaborFact[] = [];
  const storeWeeks: StoreWeekFact[] = [];
  const daily: DailyFact[] = [];
  const dailyFrom = LAST_WEEK_IDX - 7;

  for (const store of STORES) {
    const rnd = mulberry32(hashSeed(`${SEED}-${store.id}`));
    const profiles = storeProfiles(store, rnd);
    STORE_DEPT_BASE.set(store.id, profiles.map(p => ({dept: p.dept.id, hours: p.payBase / p.dept.ahr, ftShare: p.ft})));
    // Budgeted average item value per department; its own seed, so adding Items Budget leaves every other figure unchanged.
    const budAiv = profiles.map(p => 1 + noise(mulberry32(hashSeed(`items-bud-${store.id}-${p.dept.id}`)), 0.012));
    const growth = noise(rnd, 0.018);
  const storeTarget = noise(rnd, 0.015);
    const basket = between(rnd, 8.2, 9.8);
    const callOffBias = -0.012 + noise(rnd, 0.006);
    // Actuals per profile for every generated week, so last-year values reuse them exactly.
    const history = profiles.map(() => new Map<number, Actual>());
    const txHistory = new Map<number, number>();
    const deptTxHistory = profiles.map(() => new Map<number, number>());

    for (let i = FIRST_GEN_IDX; i <= LAST_WEEK_IDX; i++) {
      const fy = 2025 + Math.floor(i / WEEKS_PER_YEAR);
      const week = (((i % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR) + 1;
      const t = (i - FIRST_GEN_IDX) / WEEKS_PER_YEAR; // years since FY2024 W01
      const open = i >= store.openWeekIdx || store.openWeekIdx === 0;
      const ramp = openRamp(store, i);
      const staff = staffFactor(store.id, i);
      const salesTrend = (1 + 0.029 + growth) ** t;
      const wage = 1.035 ** t;
      const aivTrend = 1.023 ** t;
      const s = season(week);
      let storeItems = 0;
      const weekFacts: [number, LaborFact][] = [];
      const isTy = i >= 0;
      const info = isTy ? WEEKS[i] : null;

      profiles.forEach((p, k) => {
        if (!open) {
          history[k].set(i, ZERO);
          return;
        }
        const expectedSales = p.salesBase * s * salesTrend * ramp;
        const sales = expectedSales * (1 + noise(rnd, 0.025));
        const ahr = p.dept.ahr * wage * (1 + noise(rnd, 0.01));
        const expectedPay = p.payBase * (0.55 + 0.45 * s) * wage * staff * ramp;
        const pay = expectedPay * (1 + noise(rnd, 0.022));
        const hours = pay / ahr;
        const otHours = hours * p.ot * OT_SEASON(week) * Math.exp(noise(rnd, 0.25));
        // Vacation is taken mostly by full-time associates (about 1.8 weeks a year for a 37-hour FT associate).
        const vacRate = (p.ft * 0.034 + (1 - p.ft) * 0.005) * VAC_SEASON(week);
        const a: Actual = {
          sales,
          items: sales / (p.dept.aiv * aivTrend * (1 + noise(rnd, 0.012))),
          pay,
          hours,
          otHours,
          otPay: otHours * ahr * 1.5,
          vac: hours * vacRate * (1 + noise(rnd, 0.15)),
        };
        history[k].set(i, a);
        storeItems += a.items;
        if (!isTy || !info) return;

        const ly = history[k].get(i - WEEKS_PER_YEAR) ?? ZERO;
        const salesBud = expectedSales * (1 + p.planBias) * 1.004;
        const payBud = expectedPay * (p.laborTarget + storeTarget);
        const ahrBud = p.dept.ahr * 1.035 ** (fy - 2024 + 0.55) * 0.996;
        const hoursBud = payBud / ahrBud;
        const fact: LaborFact = {
          w: i,
          store: store.id,
          dept: p.dept.id,
          sales: r2(a.sales),
          salesLY: r2(ly.sales),
          salesBud: r2(salesBud),
          items: Math.round(a.items),
          itemsLY: Math.round(ly.items),
          itemsBud: Math.round(salesBud / (p.dept.aiv * aivTrend * budAiv[k])),
          itemsMdoc: Math.round((expectedSales / (p.dept.aiv * aivTrend)) * (1 + p.mdocItems)),
          pay: r2(a.pay),
          payLY: r2(ly.pay),
          payBud: r2(payBud),
          payMdoc: r2(payBud * (1 + p.mdocPay)),
          hours: r2(a.hours),
          hoursLY: r2(ly.hours),
          hoursBud: r2(hoursBud),
          hoursMdoc: r2(hoursBud * (1 + p.mdocHours)),
          hoursProj: r2(a.hours / (1 + callOffBias + noise(rnd, 0.008))),
          otHours: r2(a.otHours),
          otHoursLY: r2(ly.otHours),
          otPay: r2(a.otPay),
          otPayLY: r2(ly.otPay),
          vacHours: r2(a.vac),
          vacHoursLY: r2(ly.vac),
          ftHours: r2(a.hours * p.ft),
          tx: 0,
          txLY: 0,
        };
        labor.push(fact);
        weekFacts.push([k, fact]);
        if (i >= dailyFrom) daily.push(...splitDaily(fact, info.start, rnd));
      });

      const tx = open ? storeItems / (basket * (1 + noise(rnd, 0.015))) : 0;
      txHistory.set(i, tx);
      profiles.forEach((p, k) => {
        const dTx = open ? Math.min(tx, tx * PENETRATION[p.dept.id] * (1 + noise(rnd, 0.03))) : 0;
        deptTxHistory[k].set(i, dTx);
      });
      for (const [k, f] of weekFacts) {
        f.tx = Math.round(deptTxHistory[k].get(i) ?? 0);
        f.txLY = Math.round(deptTxHistory[k].get(i - WEEKS_PER_YEAR) ?? 0);
      }
      if (isTy && (open || (txHistory.get(i - WEEKS_PER_YEAR) ?? 0) > 0)) storeWeeks.push({w: i, store: store.id, tx: Math.round(tx), txLY: Math.round(txHistory.get(i - WEEKS_PER_YEAR) ?? 0)});
    }
  }
  return {labor, storeWeeks, daily};
}

/** Day-of-week shares (Sunday first). Budget follows a planned curve; actuals add daily noise. */
const PLAN_DAY = [0.15, 0.13, 0.13, 0.13, 0.14, 0.16, 0.16];
const ACTUAL_DAY = [0.155, 0.125, 0.125, 0.13, 0.14, 0.16, 0.165];

function weights(base: number[], rnd: () => number, sd: number): number[] {
  const raw = base.map(b => Math.max(0.01, b * (1 + noise(rnd, sd))));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map(r => r / total);
}

/** Splits one weekly row into seven days. Shares sum to 1, so daily totals reconcile with the week. */
function splitDaily(f: LaborFact, weekStartIso: string, rnd: () => number): DailyFact[] {
  const act = weights(ACTUAL_DAY, rnd, 0.06);
  const plan = weights(PLAN_DAY, rnd, 0.01);
  const startMs = Date.parse(`${weekStartIso}T00:00:00Z`);
  return act.map((share, day) => ({
    w: f.w,
    day,
    date: new Date(startMs + day * 86_400_000).toISOString().slice(0, 10),
    store: f.store,
    dept: f.dept,
    sales: f.sales * share,
    hours: f.hours * share,
    pay: f.pay * share,
    hoursBud: f.hoursBud * plan[day],
    payBud: f.payBud * plan[day],
    hoursMdoc: f.hoursMdoc * plan[day],
    payMdoc: f.payMdoc * plan[day],
  }));
}

const generated = generate();
export const LABOR_FACTS: readonly LaborFact[] = generated.labor;
export const STORE_WEEK_FACTS: readonly StoreWeekFact[] = generated.storeWeeks;
export const DAILY_FACTS: readonly DailyFact[] = generated.daily;
export const DAILY_FIRST_WEEK_IDX = LAST_WEEK_IDX - 7;

/** Index by week for fast range scans. */
export const laborByWeek: LaborFact[][] = WEEKS.map(() => []);
for (const f of LABOR_FACTS) laborByWeek[f.w].push(f);
export const storeWeekByWeek: StoreWeekFact[][] = WEEKS.map(() => []);
for (const f of STORE_WEEK_FACTS) storeWeekByWeek[f.w].push(f);
