// Filter state, validation and resolution. Pure functions: the React context only stores the state.
import {CURRENT_FY, FIRST_FY, LAST_WEEK_IDX, REPORTING_WEEK, WEEKS, periodRange, quarterRange, weekIdx, weekIdxOfDate, type WeekInfo} from '../data/calendar';
import {DEPARTMENTS, DISTRICTS, GEOGRAPHIES, REGIONS, STATES, STORES, districtById, storeById, type DeptId, type Store} from '../data/org';
import {AGE_RANGES, POSITIONS, RECRUITERS, TENURE_BANDS} from '../data/people';
import {usDate} from './format';

export type TimeMode = 'todate' | 'rolling' | 'calendar' | 'week' | 'custom';
export type ToDateSpan = 'WTD' | 'PTD' | 'QTD' | 'YTD';
export type RollingWeeks = 6 | 13 | 26 | 52;
/** 'FY', 'P1'…'P12' or 'Q1'…'Q4'. */
export type CalendarUnit = string;

export type TimeSelection = {
  mode: TimeMode;
  span: ToDateSpan;
  rolling: RollingWeeks;
  fy: number;
  unit: CalendarUnit;
  /** Global week index for "Week beginning". */
  week: number;
  /** ISO dates for a custom date range (snapped to whole weeks). */
  from: string;
  to: string;
};

/** Budget is always the primary comparison. This is the optional EXPLORATORY secondary reference (D01). */
export type Reference = 'none' | 'mdoc' | 'ly';
/** A comparison target for calculations: Budget (primary) or one of the exploratory references. */
export type Target = 'budget' | 'mdoc' | 'ly';
export const TARGET_LABEL: Record<Target, string> = {budget: 'Budget', mdoc: 'MDoc', ly: 'LY'};
export type BenchmarkMethod = 'weighted' | 'simple';
export type AccessRole = {kind: 'regional'} | {kind: 'district'; id: string} | {kind: 'store'; id: string};

export type Filters = {
  time: TimeSelection;
  region: string;
  district: string;
  store: string;
  dept: 'All' | DeptId;
  state: string;
  geography: string;
  idOnly: boolean;
  position: string;
  tenure: string;
  age: string;
  recruiter: string;
  reference: Reference;
  benchmark: BenchmarkMethod;
};

export const ALL = 'All';
// Labels reused from UC1 (BC3 timeSelection.ts). The data cut-off is a Saturday, so WTD is the full latest week.
// "Today" is day level: in UC5 it is served by the Daily Labor vs Budget view (as in UC1, N/A on weekly views).
export const TO_DATE_SPANS: {id: ToDateSpan; label: string}[] = [
  {id: 'WTD', label: 'WTD (week to date)'},
  {id: 'PTD', label: 'PTD (period to date)'},
  {id: 'QTD', label: 'QTD (quarter to date)'},
  {id: 'YTD', label: 'YTD (year to date)'},
];
export const ROLLING: RollingWeeks[] = [6, 13, 26, 52];
export const REFERENCES: {id: Reference; label: string; short: string}[] = [
  {id: 'none', label: 'None', short: ''},
  {id: 'mdoc', label: 'MDoc (Master Doc)', short: 'MDoc'},
  {id: 'ly', label: 'Prior year (LY)', short: 'LY'},
];
export const referenceShort = (r: Reference) => REFERENCES.find(x => x.id === r)?.short ?? r;

export const DEFAULT_TIME: TimeSelection = {mode: 'todate', span: 'PTD', rolling: 13, fy: CURRENT_FY, unit: 'P10', week: LAST_WEEK_IDX, from: WEEKS[LAST_WEEK_IDX - 3].start, to: WEEKS[LAST_WEEK_IDX].end};

export const DEFAULT_FILTERS: Filters = {
  time: DEFAULT_TIME,
  region: ALL,
  district: ALL,
  store: ALL,
  dept: ALL,
  state: ALL,
  geography: ALL,
  idOnly: false,
  position: ALL,
  tenure: ALL,
  age: ALL,
  recruiter: ALL,
  reference: 'none',
  benchmark: 'weighted',
};

/** `wholeWeeks`: set when custom dates do not start on a Sunday and end on a Saturday. Weekly views read weekly
 *  facts (the Ops 100 grain is store × department × week), so the range is widened to whole weeks and the
 *  interface must say so; it never shows a weekly total as if it covered only the selected days. */
export type ResolvedTime = {ok: true; from: number; to: number; label: string; detail: string; partial: boolean; wholeWeeks?: {selected: string; note: string}} | {ok: false; error: string};

const rangeLabel = (a: WeekInfo, b: WeekInfo) => `${usDate(a.start)} – ${usDate(b.end)}`;
const weekLabel = (w: WeekInfo) => `FY${w.fy} W${String(w.week).padStart(2, '0')}`;

export function resolveTime(t: TimeSelection): ResolvedTime {
  const last = WEEKS[LAST_WEEK_IDX];
  let from: number;
  let to = LAST_WEEK_IDX;
  let label: string;
  if (t.mode === 'todate') {
    if (t.span === 'WTD') from = LAST_WEEK_IDX;
    else if (t.span === 'PTD') from = periodRange(last.fy, last.period)[0];
    else if (t.span === 'QTD') from = quarterRange(last.fy, last.quarter)[0];
    else from = weekIdx(last.fy, 1);
    label = TO_DATE_SPANS.find(s => s.id === t.span)?.label ?? t.span;
  } else if (t.mode === 'rolling') {
    from = Math.max(0, LAST_WEEK_IDX - t.rolling + 1);
    label = `Rolling ${t.rolling} weeks`;
  } else if (t.mode === 'calendar') {
    if (t.unit === 'FY') [from, to] = [weekIdx(t.fy, 1), Math.min(LAST_WEEK_IDX, weekIdx(t.fy, 52))];
    else if (t.unit.startsWith('P')) [from, to] = periodRange(t.fy, Number(t.unit.slice(1)));
    else [from, to] = quarterRange(t.fy, Number(t.unit.slice(1)));
    if (from < 0) return {ok: false, error: `No data loaded for FY${t.fy} ${t.unit} yet.`};
    to = Math.min(to, LAST_WEEK_IDX);
    label = t.unit === 'FY' ? `FY${t.fy}` : `FY${t.fy} ${t.unit.startsWith('P') ? 'Period' : 'Quarter'} ${t.unit.slice(1)}`;
  } else if (t.mode === 'week') {
    from = to = Math.max(0, Math.min(LAST_WEEK_IDX, t.week));
    label = `Week beginning ${usDate(WEEKS[from].start)}`;
  } else {
    if (!t.from || !t.to) return {ok: false, error: 'Enter both dates.'};
    if (t.from > t.to) return {ok: false, error: 'The start date is after the end date.'};
    if (t.to < WEEKS[0].start || t.from > last.end) return {ok: false, error: `Data is available from ${usDate(WEEKS[0].start)} to ${usDate(last.end)}.`};
    from = weekIdxOfDate(t.from);
    to = weekIdxOfDate(t.to);
    label = 'Custom date range';
  }
  const a = WEEKS[from];
  const b = WEEKS[to];
  const partial = t.mode === 'calendar' && to === LAST_WEEK_IDX && (t.unit === 'FY' ? b.week < 52 : false);
  const detail = `${rangeLabel(a, b)} · ${from === to ? weekLabel(a) : `${weekLabel(a)}–${weekLabel(b)}`}`;
  let wholeWeeks: {selected: string; note: string} | undefined;
  if (t.mode === 'custom' && (t.from !== a.start || t.to !== b.end)) {
    const selected = t.from === t.to ? usDate(t.from) : `${usDate(t.from)} – ${usDate(t.to)}`;
    const days = Math.round((Date.parse(b.end) - Date.parse(a.start)) / 86_400_000) + 1;
    wholeWeeks = {selected, note: `Weekly data: the selected ${t.from === t.to ? 'day' : 'dates'} (${selected}) ${t.from === t.to ? 'is' : 'are'} reported as the full week${from === to ? '' : 's'} ${rangeLabel(a, b)} (${days} days). Day-level labor hours and spend are in Daily Labor vs Budget.`};
  }
  return {ok: true, from, to, label, detail, partial, ...(wholeWeeks ? {wholeWeeks} : {})};
}

/** Number of weeks in a resolved range. */
export const weeksIn = (r: {from: number; to: number}) => r.to - r.from + 1;

/** Calendar units available for a fiscal year (only units that have started). */
export function calendarUnits(fy: number): {id: string; label: string; available: boolean}[] {
  const units: {id: string; label: string; available: boolean}[] = [{id: 'FY', label: `Full year FY${fy}${fy === CURRENT_FY ? ' (in progress)' : ''}`, available: true}];
  for (let q = 1; q <= 4; q++) units.push({id: `Q${q}`, label: `Quarter ${q}`, available: quarterRange(fy, q)[0] >= 0});
  for (let p = 1; p <= 12; p++) units.push({id: `P${p}`, label: `Period ${p}`, available: periodRange(fy, p)[0] >= 0});
  return units;
}
export const FISCAL_YEARS = [FIRST_FY, CURRENT_FY];
export const CURRENT_LABEL = `FY${CURRENT_FY} W${REPORTING_WEEK}`;

/** UC1 comparable-store rule, reused from BC3 (lib/comp.ts, confirmed in UC1): a new store becomes comparable
 *  after five full fiscal quarters (13 weeks each) of operation. Store dates are synthetic. Whether Ops uses the
 *  same rule as UC1 / Accounting is still open (D07). */
export const COMP_FULL_QUARTERS = 5;
const QUARTER_WEEKS = 13;
export function firstCompWeek(openWeekIdx: number): number {
  const inQuarter = ((openWeekIdx % QUARTER_WEEKS) + QUARTER_WEEKS) % QUARTER_WEEKS;
  const firstFullQuarter = Math.floor(openWeekIdx / QUARTER_WEEKS) + (inQuarter === 0 ? 0 : 1);
  return (firstFullQuarter + COMP_FULL_QUARTERS) * QUARTER_WEEKS;
}
/** A store counts as ID for a time frame when it is comparable from the first week of the time frame
 *  (stores open before FY2025 are comparable). UC1 classifies store-weeks; with the synthetic store dates no
 *  store becomes comparable inside the loaded range, so both readings give the same result. */
export const isIdStore = (s: Store, from: number) => s.openWeekIdx === 0 || firstCompWeek(s.openWeekIdx) <= from;

/** Stores the simulated role may see. Frontend filtering only: this is not production security (D09, D10). */
export function storesForRole(role: AccessRole): Store[] {
  if (role.kind === 'district') return STORES.filter(s => s.districtId === role.id);
  if (role.kind === 'store') return STORES.filter(s => s.id === role.id);
  return STORES;
}

export function storeScope(f: Filters, role: AccessRole, from: number): Set<string> {
  return new Set(
    storesForRole(role)
      .filter(s => (f.region === ALL || s.regionId === f.region) && (f.district === ALL || s.districtId === f.district) && (f.store === ALL || s.id === f.store))
      .filter(s => (f.state === ALL || s.state === f.state) && (f.geography === ALL || s.geography === f.geography))
      .filter(s => !f.idOnly || isIdStore(s, from))
      .map(s => s.id),
  );
}

/** Benchmark population: every store (chain) or the stores of one region, ignoring location filters,
 *  but keeping the ID-store toggle. Combined vs individual visibility by role is open (D09, D13). */
export function benchmarkScope(f: Filters, from: number, regionId?: string): Set<string> {
  return new Set(STORES.filter(s => (!regionId || s.regionId === regionId) && (!f.idOnly || isIdStore(s, from))).map(s => s.id));
}

const oneOf = (v: unknown, allowed: readonly string[]) => typeof v === 'string' && (v === ALL || allowed.includes(v));

/** Validates a filter patch before it reaches state; unknown values fall back to the current value. */
export function sanitizeFilters(next: Filters, prev: Filters, role: AccessRole): Filters {
  const visible = storesForRole(role);
  const out: Filters = {...next};
  if (!oneOf(out.region, REGIONS.map(r => r.id))) out.region = prev.region;
  if (!oneOf(out.district, DISTRICTS.map(d => d.id))) out.district = prev.district;
  if (!oneOf(out.store, STORES.map(s => s.id))) out.store = prev.store;
  if (!oneOf(out.dept, DEPARTMENTS.map(d => d.id))) out.dept = prev.dept;
  if (!oneOf(out.state, STATES)) out.state = prev.state;
  if (!oneOf(out.geography, GEOGRAPHIES)) out.geography = prev.geography;
  if (!oneOf(out.position, POSITIONS)) out.position = prev.position;
  if (!oneOf(out.tenure, TENURE_BANDS)) out.tenure = prev.tenure;
  if (!oneOf(out.age, AGE_RANGES)) out.age = prev.age;
  if (!oneOf(out.recruiter, RECRUITERS)) out.recruiter = prev.recruiter;
  if (!['none', 'mdoc', 'ly'].includes(out.reference)) out.reference = prev.reference;
  if (!['weighted', 'simple'].includes(out.benchmark)) out.benchmark = prev.benchmark;
  out.idOnly = Boolean(out.idOnly);
  // Keep the location path consistent: a district belongs to the region, a store to the district.
  const district = out.district === ALL ? null : districtById.get(out.district);
  if (district && out.region !== ALL && district.regionId !== out.region) out.district = ALL;
  const store = out.store === ALL ? null : storeById.get(out.store);
  if (store && ((out.district !== ALL && store.districtId !== out.district) || (out.region !== ALL && store.regionId !== out.region))) out.store = ALL;
  // Simulated access: selections outside the role scope are cleared.
  if (out.store !== ALL && !visible.some(s => s.id === out.store)) out.store = ALL;
  if (out.district !== ALL && !visible.some(s => s.districtId === out.district)) out.district = ALL;
  if (out.region !== ALL && !visible.some(s => s.regionId === out.region)) out.region = ALL;
  const t = out.time;
  const validTime =
    ['todate', 'rolling', 'calendar', 'week', 'custom'].includes(t.mode) &&
    ['WTD', 'PTD', 'QTD', 'YTD'].includes(t.span) &&
    ROLLING.includes(t.rolling) &&
    FISCAL_YEARS.includes(t.fy) &&
    /^(FY|P([1-9]|1[0-2])|Q[1-4])$/.test(t.unit) &&
    Number.isInteger(t.week) &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.to);
  if (!validTime) out.time = prev.time;
  return out;
}

/** Number of filters that differ from the defaults (for the "More filters" badge and the scope line). */
export function changedFilters(f: Filters): string[] {
  const keys: (keyof Filters)[] = ['region', 'district', 'store', 'dept', 'state', 'geography', 'position', 'tenure', 'age', 'recruiter'];
  const out = keys.filter(k => f[k] !== ALL) as string[];
  if (f.idOnly) out.push('idOnly');
  return out;
}
