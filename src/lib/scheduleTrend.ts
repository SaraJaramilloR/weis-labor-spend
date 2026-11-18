// Next-week scheduling changes · rolling 13 weeks. Stakeholder request: "a rolling 13-week trend line that reflects the
// total schedule changes for the next week". Reference: Report_Next Week Schedule Changes-Detail › CRD (traced in
// docs/scheduling-changes-source-trace.md § 5):
//
//   CRD row 1 "Week File Name" = date of the weekly file = Saturday S − 1, the last change capture
//   CRD row 2 "Data Week"      = Week Ending of the schedule week (file date + 7 days); the chart's axis
//   CRD row 3 "Chain"          = Detail Total of that week = SUM over stores of SUM(8 signed daily net changes)
//   CRD rows 4–18 / stores     = the same total for each region, district and store; chain = Σ regions = Σ districts
//
// One point = Total Changes of one schedule week, exactly as the Next week section of Scheduling Changes computes it
// (lib/scheduleChanges.ts): net hours, signed, rows above store level add only the stores with an original schedule.
//
// Time rule (design decision, D42): the window ends at the next week of the selected report week, so its last point is
// the week shown in the Scheduling Changes table. Earlier points are schedule weeks that have already started; each is
// read at its own final capture (Saturday S − 1), never at the selected Data through day. The last point uses the
// selected Data through, like the table: it is final once all 8 change days are captured (Data through Friday or
// later) and partial before that. Changes not captured yet are never counted as 0.
import {reportWeekDates} from '../data/dailyReport';
import {CHANGE_DAYS, TREND_WEEKS, captureDates} from '../data/scheduleChanges';
import {ALL, type AccessRole, type Filters} from './filters';
import {scopeLabel} from './orgTree';
import {captureState, scheduleRollup} from './scheduleChanges';

export type TrendStatus = 'final' | 'partial' | 'unavailable';

export type TrendPoint = {
  /** Schedule (target) week index. */
  w: number;
  /** Week Ending of the schedule week (CRD "Data Week"). */
  weekEnding: string;
  fy: number;
  week: number;
  /** Original-schedule capture (Friday S − 9). */
  originalCapture: string;
  /** Last change capture of the week = weekly file date (CRD "Week File Name", Saturday S − 1). */
  fileDate: string;
  /** Latest change day captured for this point (= fileDate when final). null when nothing is captured. */
  asOf: string | null;
  capturedDays: number;
  status: TrendStatus;
  /** Total Changes, net hours (+ added, − removed). null = not available. */
  total: number | null;
  /** Original schedule of the same stores (for the share of the original). */
  original: number | null;
  /** Stores in scope with a schedule that week. */
  stores: number;
  /** Stores added up (with an original schedule). */
  counted: number;
  /** Stores missing from the original capture (not added up, as in the table; prototype rule, not observed in CRD). */
  missingOriginal: number;
  /** The point shown in the Scheduling Changes table (same scope and cutoff). */
  current: boolean;
};

/** Schedule weeks of the window for a report week: 12 weeks before its next week, then the next week. */
export function trendWeeks(reportWeek: number): number[] {
  const last = reportWeek + 1;
  return Array.from({length: TREND_WEEKS}, (_, i) => last - (TREND_WEEKS - 1) + i);
}

/** Data through used to read a schedule week: its own final capture for past weeks, the selected cutoff for the last. */
const FINAL_CUTOFF = 6;

export function scheduleTrend(stores: Set<string>, reportWeek: number, cutoff: number): TrendPoint[] {
  return trendWeeks(reportWeek).map(w => {
    // Schedule week w is the "next week" of report week w − 1.
    const current = w === reportWeek + 1;
    const rw = w - 1;
    const c = current ? cutoff : FINAL_CUTOFF;
    const {end, fy, week} = reportWeekDates(w);
    const {original: originalCapture, changes} = captureDates(w);
    const st = captureState(rw, c, 'next');
    const capturedDays = st.originalCaptured ? st.captured.filter(Boolean).length : 0;
    const t = scheduleRollup(stores, rw, c, 'next', 'none').get('all');
    const total = t && t.withOriginal > 0 ? t.total : null;
    const status: TrendStatus = total === null ? 'unavailable' : capturedDays === CHANGE_DAYS ? 'final' : 'partial';
    return {
      w,
      weekEnding: end,
      fy,
      week,
      originalCapture,
      fileDate: changes[CHANGE_DAYS - 1],
      asOf: capturedDays > 0 ? changes[capturedDays - 1] : null,
      capturedDays,
      status,
      total,
      original: total === null ? null : (t?.original ?? null),
      stores: t?.stores ?? 0,
      counted: t?.withOriginal ?? 0,
      missingOriginal: t?.missingOriginal ?? 0,
      current,
    };
  });
}

/** Name of the single line: Chain with no location restriction and full access; otherwise the selected scope
 *  (region, district or store; State and Geography narrow the same stores the Daily table uses). */
export function trendScopeName(f: Filters, role: AccessRole, stores: Set<string>): string {
  const noLocation = f.region === ALL && f.district === ALL && f.store === ALL && f.state === ALL && f.geography === ALL;
  if (noLocation && role.kind === 'regional') return `Chain · ${stores.size} stores`;
  const qualifiers = [f.state !== ALL ? `State ${f.state}` : '', f.geography !== ALL ? f.geography : ''].filter(Boolean);
  return qualifiers.length ? `${scopeLabel(stores)} · ${qualifiers.join(' · ')}` : scopeLabel(stores);
}
