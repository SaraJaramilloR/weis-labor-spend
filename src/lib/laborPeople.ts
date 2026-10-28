// Labor measures by associate attributes (Position, Tenure, Age Range, Recruiter) and the Ops 100 average
// productive hours.
//
// Source evidence (Ops 100 data model, OPS108 pivot cache): every Warehouse row (store × department × week) carries
// UKG FT / PT counts and "UKG FT / PT Avg Pro Hours"; "UKG FT % of Total Hours" = SUMX(rows, Avg Pro Hours ×
// Count) / SUM(Hours Actual). UKG holds hours per associate, so filtering labor by associate attributes is a data
// question for production, not a missing business definition.
//
// Synthetic model: within each store × department × week, associates of the same employment type are given the
// row's average productive hours. Filtered labor = the filtered associates' share of FT and PT hours of the row.
// Pay, overtime, vacation and projected hours follow the same share (no position-level pay rates are modeled).
// Budget, MDoc, sales and items are set by store, department and period (workbook R7), not by associate, so they
// are not attributable to a Position / Tenure population.
import {LAST_WEEK_IDX, WEEKS, WEEKS_PER_YEAR, parseIso} from '../data/calendar';
import {laborByWeek, type LaborFact} from '../data/generate';
import {ASSOCIATES, ATTENDANCE_FACTS, tenureBand, type Associate, type IncidentType} from '../data/people';
import {addFact, emptyLabor, type GroupKey, type LaborTotals} from './aggregate';
import {ALL} from './filters';
import type {PeopleFilter} from './peopleMetrics';
import {storeById} from '../data/org';

type Counts = {ft: number; pt: number};
const key = (w: number, store: string, dept: string) => `${w}|${store}|${dept}`;
const WEEK_END_MS = WEEKS.map(w => parseIso(w.end));

export const peopleFilterActive = (f: Pick<PeopleFilter, 'position' | 'tenure' | 'age' | 'recruiter'>) => f.position !== ALL || f.tenure !== ALL || f.age !== ALL || f.recruiter !== ALL;

const cache = new Map<string, Map<string, Counts>>();

/** Active associates at each week end, by store × department × employment type, optionally filtered. */
export function rowCounts(f?: Pick<PeopleFilter, 'position' | 'tenure' | 'age' | 'recruiter'>): Map<string, Counts> {
  const cacheKey = f ? `${f.position}|${f.tenure}|${f.age}|${f.recruiter}` : 'all';
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const out = new Map<string, Counts>();
  const pass = (a: Associate, ms: number) =>
    !f || ((f.position === ALL || a.position === f.position) && (f.age === ALL || a.age === f.age) && (f.recruiter === ALL || a.recruiter === f.recruiter) && (f.tenure === ALL || tenureBand(a.hire, ms) === f.tenure));
  for (const a of ASSOCIATES) {
    for (let w = 0; w <= LAST_WEEK_IDX; w++) {
      const ms = WEEK_END_MS[w];
      if (a.hire > ms) continue;
      if (a.term !== null && a.term <= ms) continue;
      if (!pass(a, ms)) continue;
      const k = key(w, a.store, a.dept);
      let c = out.get(k);
      if (!c) out.set(k, (c = {ft: 0, pt: 0}));
      if (a.type === 'FT') c.ft++;
      else c.pt++;
    }
  }
  cache.set(cacheKey, out);
  return out;
}

/** Share of a row's hours worked by the filtered population (null when the row has no associates). */
function rowShare(f: LaborFact, w: number, all: Map<string, Counts>, sub: Map<string, Counts>): {share: number; ftHours: number} | null {
  const a = all.get(key(w, f.store, f.dept));
  if (!a || a.ft + a.pt === 0) return null;
  const s = sub.get(key(w, f.store, f.dept)) ?? {ft: 0, pt: 0};
  // If the row has no associates of one employment type, its hours are attributed to the other type.
  const ftRatio = a.ft === 0 ? 0 : a.pt === 0 ? 1 : f.hours > 0 ? f.ftHours / f.hours : 0;
  const ft = a.ft > 0 ? (s.ft / a.ft) * ftRatio : 0;
  const pt = a.pt > 0 ? (s.pt / a.pt) * (1 - ftRatio) : 0;
  return {share: ft + pt, ftHours: f.hours * ft};
}

export type PeopleLabor = {totals: Map<string, LaborTotals>; lyAvailable: boolean};

function groupOf(group: GroupKey, f: LaborFact): string {
  if (group === 'none') return 'all';
  if (group === 'store') return f.store;
  if (group === 'dept') return f.dept;
  if (group === 'storeDept') return `${f.store}|${f.dept}`;
  if (group === 'district') return storeById.get(f.store)?.districtId ?? '';
  if (group === 'region') return storeById.get(f.store)?.regionId ?? '';
  if (group === 'week') return String(f.w);
  return 'all';
}

/** Labor actuals of the filtered associate population. Budget, MDoc, sales and items stay 0 (not attributable). */
export function laborForPeople(stores: Set<string>, dept: 'All' | string, from: number, to: number, f: PeopleFilter, group: GroupKey = 'none'): PeopleLabor {
  const all = rowCounts();
  const sub = rowCounts(f);
  const out = new Map<string, LaborTotals>();
  let lyAvailable = true;
  for (let w = from; w <= to; w++) {
    for (const fact of laborByWeek[w] ?? []) {
      if (!stores.has(fact.store) || (dept !== ALL && fact.dept !== dept)) continue;
      const ty = rowShare(fact, w, all, sub);
      const lyW = w - WEEKS_PER_YEAR;
      const ly = lyW >= 0 ? rowShare(fact, lyW, all, sub) : null;
      if (lyW < 0) lyAvailable = false;
      const s = ty?.share ?? 0;
      const sl = ly?.share ?? 0;
      const k = groupOf(group, fact);
      let t = out.get(k);
      if (!t) out.set(k, (t = emptyLabor()));
      addFact(t, {
        ...fact,
        sales: 0, salesLY: 0, salesBud: 0, items: 0, itemsLY: 0, itemsMdoc: 0, tx: 0, txLY: 0,
        payBud: 0, payMdoc: 0, hoursBud: 0, hoursMdoc: 0,
        hours: fact.hours * s, pay: fact.pay * s, hoursProj: fact.hoursProj * s, otHours: fact.otHours * s, otPay: fact.otPay * s, vacHours: fact.vacHours * s, ftHours: ty?.ftHours ?? 0,
        hoursLY: fact.hoursLY * sl, payLY: fact.payLY * sl, otHoursLY: fact.otHoursLY * sl, otPayLY: fact.otPayLY * sl, vacHoursLY: fact.vacHoursLY * sl,
      });
    }
  }
  return {totals: out, lyAvailable};
}

/** Ops 100 "UKG FT / PT Average Pro Hours": average of the row-level average productive hours, positive values
 *  only (workbook R31). Row = store × department × week; row FT value = FT hours / active FT associates. */
export function averageProHours(stores: Set<string>, dept: 'All' | string, from: number, to: number, f?: PeopleFilter): {ft: number | null; pt: number | null; rows: number} {
  const all = rowCounts();
  const sub = f && peopleFilterActive(f) ? rowCounts(f) : all;
  let ftSum = 0, ftN = 0, ptSum = 0, ptN = 0, rows = 0;
  for (let w = from; w <= to; w++) {
    for (const fact of laborByWeek[w] ?? []) {
      if (!stores.has(fact.store) || (dept !== ALL && fact.dept !== dept)) continue;
      const a = all.get(key(w, fact.store, fact.dept));
      const s = sub.get(key(w, fact.store, fact.dept));
      if (!a || !s) continue;
      rows++;
      // A filtered row contributes only when the filtered population has associates of that type.
      if (a.ft > 0 && s.ft > 0) {
        const v = fact.ftHours / a.ft;
        if (v > 0) {
          ftSum += v;
          ftN++;
        }
      }
      if (a.pt > 0 && s.pt > 0) {
        const v = (fact.hours - fact.ftHours) / a.pt;
        if (v > 0) {
          ptSum += v;
          ptN++;
        }
      }
    }
  }
  return {ft: ftN ? ftSum / ftN : null, pt: ptN ? ptSum / ptN : null, rows};
}

/** Illustrative attendance incidents (associate-level events) filtered by location, Department (associate home
 *  department) and people filters (tenure at the event week end). Grouped by store or by incident type. */
export function attendanceRollup(stores: Set<string>, f: PeopleFilter, from: number, to: number, group: 'store' | 'type'): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ATTENDANCE_FACTS) {
    if (e.w < from || e.w > to || !stores.has(e.store) || (f.dept !== ALL && e.dept !== f.dept)) continue;
    const a = ASSOCIATES[e.associate];
    if ((f.position !== ALL && a.position !== f.position) || (f.age !== ALL && a.age !== f.age) || (f.recruiter !== ALL && a.recruiter !== f.recruiter)) continue;
    if (f.tenure !== ALL && tenureBand(a.hire, WEEK_END_MS[e.w]) !== f.tenure) continue;
    const k = group === 'store' ? e.store : e.type;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
export type {IncidentType};
