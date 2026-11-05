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

/** Short visible label for the next / future week Labor Rate reference (D38). */
export const DAILY_RATE_TAG = 'Provisional';
