// Reporting calendar used by the prototype.
// Evidence: the OPS reporting date table (weeks end Saturday, 52 weeks, P01–P12 in a 4-4-5 pattern,
// Q1–Q4 of 13 weeks, last year = same week number 364 days earlier). That table is a DOCUMENTED DRAFT
// for Ops reporting; it is not confirmed as the official Weis fiscal calendar (decision D18).
// 53-week years are not handled because their rule is unknown.

export type WeekInfo = {
  /** Global index: 0 = FY2025 W01. Negative indexes are only used internally for last-year values. */
  idx: number;
  fy: number;
  week: number;
  period: number;
  quarter: number;
  /** ISO date of the Sunday that starts the week. */
  start: string;
  /** ISO date of the Saturday that ends the week. */
  end: string;
};

const DAY = 86_400_000;
/** FY2025 W01 starts Sunday 2024-12-29 and ends Saturday 2025-01-04 (OPS date table). */
const FY_START: Record<number, string> = {2024: '2023-12-31', 2025: '2024-12-29', 2026: '2025-12-28'};
export const FIRST_FY = 2025;
export const CURRENT_FY = 2026;
/** Latest complete week with synthetic actuals: FY2026 W43, ending Saturday 2026-10-24. */
export const REPORTING_WEEK = 43;
export const WEEKS_PER_YEAR = 52;

/** Weeks per period, 4-4-5 within each quarter. */
const PERIOD_WEEKS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 5, 4];

const periodOfWeek: number[] = [];
PERIOD_WEEKS.forEach((n, p) => {
  for (let i = 0; i < n; i++) periodOfWeek.push(p + 1);
});

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const parseIso = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, days: number) => isoDate(parseIso(iso) + days * DAY);

export function weekStart(fy: number, week: number): string {
  const start = FY_START[fy];
  if (!start) throw new Error(`No calendar for FY${fy}`);
  return addDays(start, (week - 1) * 7);
}

function makeWeek(fy: number, week: number): WeekInfo {
  const start = weekStart(fy, week);
  return {idx: (fy - FIRST_FY) * WEEKS_PER_YEAR + week - 1, fy, week, period: periodOfWeek[week - 1], quarter: Math.ceil(periodOfWeek[week - 1] / 3), start, end: addDays(start, 6)};
}

/** Weeks with synthetic actuals: FY2025 W01 → FY2026 W43. */
export const WEEKS: WeekInfo[] = [];
for (let fy = FIRST_FY; fy <= CURRENT_FY; fy++) {
  const last = fy === CURRENT_FY ? REPORTING_WEEK : WEEKS_PER_YEAR;
  for (let w = 1; w <= last; w++) WEEKS.push(makeWeek(fy, w));
}
export const LAST_WEEK_IDX = WEEKS.length - 1;
export const REPORTING_DATE = WEEKS[LAST_WEEK_IDX].end;

export const weekByIdx = (idx: number): WeekInfo => WEEKS[Math.max(0, Math.min(LAST_WEEK_IDX, idx))];
export const weekIdx = (fy: number, week: number) => (fy - FIRST_FY) * WEEKS_PER_YEAR + week - 1;

/** The week (index) containing an ISO date, clamped to the loaded range. */
export function weekIdxOfDate(iso: string): number {
  const ms = parseIso(iso);
  const first = parseIso(WEEKS[0].start);
  return Math.max(0, Math.min(LAST_WEEK_IDX, Math.floor((ms - first) / (7 * DAY))));
}

export function periodRange(fy: number, period: number): [number, number] {
  const weeks = WEEKS.filter(w => w.fy === fy && w.period === period);
  return weeks.length ? [weeks[0].idx, weeks[weeks.length - 1].idx] : [-1, -1];
}

export function quarterRange(fy: number, quarter: number): [number, number] {
  const weeks = WEEKS.filter(w => w.fy === fy && w.quarter === quarter);
  return weeks.length ? [weeks[0].idx, weeks[weeks.length - 1].idx] : [-1, -1];
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
