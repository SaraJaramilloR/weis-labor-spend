// Synthetic schedule captures for Scheduling Changes (Daily Labor Update, district email "Next / Future Week Schedule
// Changes"). Structure traced from Report_Master_Daily Labor Update (read for structure and formulas only):
//
//   The report keeps one copy per day of the next / future week schedule extract (sheets Next01–Next10,
//   Future01–Future10, same layout as "Next Week" / "Future Week"). Each copy is captured at 10:30 and covers the
//   changes from 10:30 the previous day. Scheduling Changes reads the store "Total" row of column O
//   (Projected Payroll Hours) of each copy: the first copy is the originally published schedule, each later column
//   is the net change since the previous copy, and Total Changes is their sum.
//
// Grain kept here: store × target week × capture day, net change in total store scheduled hours. The report only
// has net store totals, so additions and removals are not generated separately (a net value cannot be split).
//
// Capture calendar of a target week starting Sunday S (as in the reference run): original schedule captured on
// Friday S − 9; daily changes captured S − 8 … S − 1 (8 days, Saturday to Saturday). The final capture equals the
// Store Projected hours of that week in WEEK_TARGETS, so Scheduling Changes agrees with the report table once every
// change day has been captured. Synthetic and illustrative only.
import {addDays} from './calendar';
import {REPORT_FIRST_WEEK, PROJECTION_LAST_WEEK, WEEK_TARGETS, reportWeekDates} from './dailyReport';
import {STORES} from './org';
import {hashSeed, mulberry32, noise} from '../lib/prng';

/** Days of net change captured after the original schedule (Saturday S − 8 to Saturday S − 1). */
export const CHANGE_DAYS = 8;
/** Days between the original-schedule capture and the Sunday the week starts. */
export const BASELINE_LEAD_DAYS = 9;

/** Response to the store task "Are schedules finalized and posted for the future week?" (report: Completed on-time). */
export type PostedStatus = 'yes' | 'no' | 'none';

export type StoreScheduleWeek = {
  store: string;
  /** Target week index (the week the schedule is for). */
  w: number;
  /** Originally published schedule, total store hours; null when the store is missing from that capture. */
  original: number | null;
  /** Net change of each capture day, in hours (quarter hours). 0 = captured, no change. */
  changes: number[];
  /** Schedule after the last change day (= Store Projected hours of the week). */
  final: number;
  posted: PostedStatus;
};

/** Capture dates (ISO) of a target week: original schedule, then each change day. */
export function captureDates(w: number): {original: string; changes: string[]} {
  const {start} = reportWeekDates(w);
  const original = addDays(start, -BASELINE_LEAD_DAYS);
  return {original, changes: Array.from({length: CHANGE_DAYS}, (_, i) => addDays(original, i + 1))};
}

/** Day the report runs: the morning after the Data through date (reference run: data through 08/23, last capture 08/24). */
export function reportRunDate(reportWeek: number, cutoff: number): string {
  return addDays(reportWeekDates(reportWeek).start, cutoff + 1);
}

const quarter = (v: number) => Math.round(v * 4) / 4;

function build(): Map<string, StoreScheduleWeek> {
  const out = new Map<string, StoreScheduleWeek>();
  for (let w = REPORT_FIRST_WEEK + 1; w <= PROJECTION_LAST_WEEK; w++) {
    for (const s of STORES) {
      const t = WEEK_TARGETS.get(`${s.id}|${w}`);
      if (!t) continue;
      const rnd = mulberry32(hashSeed(`sched-${s.id}-${w}`));
      // A few stores per week are missing from the original-schedule capture (unavailable, never 0).
      const missing = rnd() < 0.035;
      const p = rnd();
      const posted: PostedStatus = missing ? (p < 0.5 ? 'no' : 'none') : p < 0.88 ? 'yes' : p < 0.93 ? 'no' : 'none';
      const changes: number[] = [];
      for (let i = 0; i < CHANGE_DAYS; i++) {
        // Changes get more frequent as the week approaches; about half of the store-days have none.
        const changed = rnd() < 0.36 + 0.03 * i;
        const size = Math.abs(noise(rnd, t.projHours * 0.008)) + 1;
        const up = rnd() < 0.62;
        changes.push(changed ? quarter(up ? size : -size) : 0);
      }
      const final = t.projHours;
      const original = missing ? null : final - changes.reduce((a, b) => a + b, 0);
      out.set(`${s.id}|${w}`, {store: s.id, w, original, changes, final, posted});
    }
  }
  return out;
}

export const SCHEDULE_WEEKS = build();
