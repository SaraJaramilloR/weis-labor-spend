// Scheduling Changes (Daily Labor Update, district email DMEmailBody rows 57–84 and 113–140). Formulas reproduced
// from the ScheduleChanges sheet of Report_Master_Daily Labor Update:
//
//   Original schedule   = SUMIFS(Next01!O, store, "Total")                   (first capture, Projected Payroll Hours)
//   Change on capture k = SUMIFS(NextNN!O, store, "Total") − SUM(original … change k−1)
//                       = capture k − capture k−1 (net; + hours added, − hours removed)
//   Total Changes       = SUM(change columns)                                 (DMEmailBody O / P)
//   District / region   = SUM of their stores; Completed on-time = COUNTIFS(response, "Yes")
//
// Differences from the workbook, all display rules: a capture not taken yet is "not captured" (the workbook leaves it
// blank); a store missing from the original capture is "unavailable" (the workbook's SUMIFS returns 0 and the first
// change then equals the whole schedule). Rows above store level add only the stores that have an original schedule.
// Updated schedule = original + Total Changes is a prototype column (the report shows only the original and changes).
import {CHANGE_DAYS, SCHEDULE_WEEKS, captureDates, reportRunDate, type PostedStatus} from '../data/scheduleChanges';
import {storeById} from '../data/org';
import type {ReportGroup} from './dailyReport';

export type ScheduleSection = 'next' | 'future';
export const SCHEDULE_OFFSET: Record<ScheduleSection, number> = {next: 1, future: 2};

/** Which captures exist on the report run date. */
export type CaptureState = {
  run: string;
  original: string;
  changes: string[];
  originalCaptured: boolean;
  /** One flag per change day. */
  captured: boolean[];
  /** The posting task is due the day before the original capture; responses are shown from the original capture on. */
  responsesDue: boolean;
};

export function captureState(reportWeek: number, cutoff: number, section: ScheduleSection): CaptureState {
  const w = reportWeek + SCHEDULE_OFFSET[section];
  const run = reportRunDate(reportWeek, cutoff);
  const {original, changes} = captureDates(w);
  const originalCaptured = original <= run;
  return {run, original, changes, originalCaptured, captured: changes.map(d => d <= run), responsesDue: originalCaptured};
}

/** Additive components of one row (store, district, region or total). */
export type ScheduleTotals = {
  /** Stores in the row. */
  stores: number;
  /** Stores with an original schedule (the rows above store level add only these). */
  withOriginal: number;
  /** Stores missing from the original capture. */
  missingOriginal: number;
  /** Store response (store rows); null before the responses are due. */
  posted: PostedStatus | null;
  /** Stores that answered Yes (Completed on-time count of the district and region rows). */
  postedYes: number;
  /** null: not captured yet, or (store row) unavailable. */
  original: number | null;
  /** Net change of each change day; null: not captured yet or unavailable. */
  changes: (number | null)[];
  /** Total Changes = SUM of the captured change days. */
  total: number | null;
  /** Updated schedule as of the run date = original + Total Changes; for a store without an original schedule, its
   *  latest captured schedule. */
  updated: number | null;
  /** Stores (with an original schedule) whose net change so far is above, below or equal to zero. */
  netUp: number;
  netDown: number;
  netZero: number;
};

const blank = (): ScheduleTotals => ({stores: 0, withOriginal: 0, missingOriginal: 0, posted: null, postedYes: 0, original: null, changes: Array(CHANGE_DAYS).fill(null), total: null, updated: null, netUp: 0, netDown: 0, netZero: 0});

/** One store and target week as seen on the report run date. undefined when the store has no schedule that week. */
export function storeSchedule(store: string, reportWeek: number, cutoff: number, section: ScheduleSection): ScheduleTotals | undefined {
  const w = reportWeek + SCHEDULE_OFFSET[section];
  const s = SCHEDULE_WEEKS.get(`${store}|${w}`);
  if (!s) return undefined;
  const st = captureState(reportWeek, cutoff, section);
  const t = blank();
  t.stores = 1;
  t.posted = st.responsesDue ? s.posted : null;
  t.postedYes = t.posted === 'yes' ? 1 : 0;
  if (!st.originalCaptured) return t;
  // Schedule on the latest capture: the final schedule minus the changes not captured yet.
  const latest = s.final - s.changes.reduce((a, c, i) => a + (st.captured[i] ? 0 : c), 0);
  if (s.original === null) {
    t.missingOriginal = 1;
    t.updated = latest;
    return t;
  }
  t.withOriginal = 1;
  t.original = s.original;
  t.changes = s.changes.map((c, i) => (st.captured[i] ? c : null));
  t.total = t.changes.reduce<number>((a, c) => a + (c ?? 0), 0);
  t.updated = t.original + t.total;
  if (t.total > 1e-9) t.netUp = 1;
  else if (t.total < -1e-9) t.netDown = 1;
  else t.netZero = 1;
  return t;
}

const plus = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

function add(into: ScheduleTotals, r: ScheduleTotals) {
  into.stores += r.stores;
  into.withOriginal += r.withOriginal;
  into.missingOriginal += r.missingOriginal;
  into.postedYes += r.postedYes;
  into.netUp += r.netUp;
  into.netDown += r.netDown;
  into.netZero += r.netZero;
  // Only stores with an original schedule enter the sums, so Updated = Original + Total Changes at every level.
  if (r.withOriginal === 0) return;
  into.original = plus(into.original, r.original);
  into.changes = into.changes.map((c, i) => plus(c, r.changes[i]));
  into.total = plus(into.total, r.total);
  into.updated = plus(into.updated, r.updated);
}

/** Rows for the stores in scope, grouped by store, district, region or a single total ('all'). */
export function scheduleRollup(stores: Set<string>, reportWeek: number, cutoff: number, section: ScheduleSection, group: ReportGroup): Map<string, ScheduleTotals> {
  const out = new Map<string, ScheduleTotals>();
  for (const id of stores) {
    const r = storeSchedule(id, reportWeek, cutoff, section);
    if (!r) continue;
    if (group === 'store') {
      out.set(id, r);
      continue;
    }
    const s = storeById.get(id);
    const key = group === 'district' ? (s?.districtId ?? '') : group === 'region' ? (s?.regionId ?? '') : 'all';
    let t = out.get(key);
    if (!t) out.set(key, (t = blank()));
    add(t, r);
  }
  return out;
}
