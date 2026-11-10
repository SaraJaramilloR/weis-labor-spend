// Client-facing help for Daily Labor vs Budget. Labels keep the reference report's names (Daily Labor Update; the
// email that sends it is titled Payroll Update). Chain Forecast and Store Projected are not renamed to Budget or MDoc:
// the report's own label is kept and the lineage is explained here.

export const DAILY_HELP = {
  cf: 'Chain Forecast, as labeled in the Daily Labor Update. The report reads it from the "Master DOC" block of its Summary sheet (MDoc sales, units, hours and labor $). Current week: week to date through the data cutoff. Synthetic values.',
  cfItems: 'Chain Forecast items: the Master Doc units of the report. Synthetic values.',
  proj: 'Store Projected: the store schedule projection (projected sales, payroll hours and payroll $ of the report data, SO1006 style). Current week: week to date through the data cutoff.',
  projItems: 'Store Projected items = ROUND(Store Projected sales / Chain Forecast average unit $), as the report calculates them; the source has no projected item count.',
  projHours: 'Store Projected hours: projected (scheduled) payroll hours of the store. The same field feeds Call-off hours in Turnover, Overtime & Call-off Tracking.',
  actual: 'Actual: reported sales, items, payroll hours and payroll $ for the days through the data cutoff. Next and future weeks have no actuals.',
  toHit: 'Hours to hit IPLH = Actual items / Chain Forecast IPLH (the hours the actual volume would need at the forecast productivity). Actual vs Hrs to hit IPLH = Actual hours − Hours to hit IPLH; a positive value means more hours than the forecast productivity requires. Totals add the store values, as the report does.',
  toHitPro: 'Hours to hit PRO IPLH = ROUND(Store Projected items / Chain Forecast IPLH). Var = Store Projected hours − Hours to hit PRO IPLH: a positive value means the schedule has more hours than the forecast productivity requires.',
  iplh: 'IPLH = items / hours of the same row: Chain Forecast IPLH = Chain Forecast items / Chain Forecast hours; Projected = Store Projected items / Store Projected hours; Actual = actual items / actual hours. Totals are recalculated from summed items and hours, never averaged.',
  ly: 'LY IPLH: items / hours of the whole same week number last year (364 days earlier), as the report\'s Last Year Data. It is not cut to the current week-to-date days. n/a when the store has no last-year data.',
  rateBud: 'Budget Labor Rate (budgeted payroll %) = budgeted labor plan $ / budgeted sales, week to date. Shown in the district and regional emails; the store and district worksheets of the report do not include Labor Rate.',
  rateActual: 'Actual Labor Rate (actual payroll %) = actual payroll $ / actual sales, week to date. Actual vs Budget is in percentage points.',
  rateCf: 'Provisional. Currently the district email calculation: Chain Forecast Labor Rate = budgeted labor plan $ / Chain Forecast sales. The regional email uses a different reference: the "Budgeted Payroll %" field of the next / future week data. Which one UC5 should use is open until Rick or Vijay confirms (D38).',
  rateProj: 'Provisional with the Chain Forecast reference above. Projected Labor Rate = Store Projected payroll $ / Store Projected sales; both emails use the projected payroll %.',
  cutoff: 'Data through simulates an earlier cutoff on the synthetic data for demonstration: days after it are treated as not yet reported. It does not load or refresh data, and it cannot go past the latest day with data.',
  illustrative: 'Next and future weeks show illustrative synthetic values. The prototype does not calculate or refresh forecasts; in production these values come from the Master Doc (Chain Forecast), the store schedules (Store Projected) and the budget.',
} as const;

/** Scheduling Changes (district email "Next / Future Week Schedule Changes"). Source mapping still pending (D41). */
export const SCHEDULE_HELP = {
  section: 'Changes made to the store schedule after it was first published, as in the Scheduling Changes section of the district Daily Labor Update. The report keeps one copy of the week\'s schedule per day and compares each copy with the previous one. Values are total store scheduled hours (the report\'s Projected Payroll Hours). They are not Budget, MDoc or Chain Forecast hours.',
  capture: 'Each day\'s copy is captured at 10:30 and includes the changes made since 10:30 the previous day. The report runs the day after the Data through date, so the latest capture shown is that day.',
  original: 'Original schedule: total store scheduled hours in the first copy, captured on the Friday nine days before the week starts, after stores post their schedules. Unavailable when the store is missing from that copy. Rows above store level add only the stores that have an original schedule.',
  change: 'Net change in scheduled hours captured that day: this copy minus the previous one. Positive = hours added, negative = hours removed, 0 = schedule captured with no change. The report has only the net store total, so additions and removals that offset each other on the same day are not visible.',
  total: 'Total Changes = sum of the daily net changes captured so far = Updated schedule − Original schedule.',
  updated: 'Updated schedule = Original schedule + Total Changes, as of the latest capture. Prototype column: the report shows the original schedule and the changes only. For a store without an original schedule, its latest captured schedule (not added to the totals). Matches Store Projected hours in the table above once every change day has been captured.',
  posted: 'Completed on-time (Y/N): store answer to the task "Are schedules finalized and posted for the future week?", due the day before the original schedule is captured. Store rows show Yes, No or Did not respond; region and district rows count the Yes answers. Illustrative responses; the report reads them from a separate task export, not from the schedule reports.',
  pending: 'Source mapping pending (D41): the workbook stores daily copies of the next and future week projection extract, but it does not name the WMBI report (SO1004, SO1005 or SO1006) that supplies them, or which schedule version each copy represents.',
} as const;

/** Short visible label for the next / future week Labor Rate reference (D38). */
export const DAILY_RATE_TAG = 'Provisional';
