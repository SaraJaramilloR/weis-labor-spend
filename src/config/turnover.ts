// Client-facing wording for turnover, shared by Turnover, Overtime & Call-off Tracking, Turnover & Retention Benchmark
// and People Reporting. Nov 3 final review (James, 29:15–30:48) and Nov 4 open-questions session (23:09–24:26):
// turnover is a rolling 52-week metric anchored on the selected reporting point, and the existing OPS 200 calculation
// is to be reused. That calculation has not been supplied (D40), so the workbook draft for the selected time frame is
// kept and labeled provisional; it does not implement the 52-week method.

export const TURNOVER_FORMULA = 'Terminations in the selected time frame / average headcount, where average headcount = (beginning + ending headcount) / 2.';

export const TURNOVER_DRAFT_HELP = `Provisional: ${TURNOVER_FORMULA} Not annualized. Confirmed direction: turnover is a rolling 52-week metric anchored on the selected reporting point, using the existing OPS 200 calculation. That calculation (numerator window, headcount averaging and window anchoring) is awaiting source review and implementation, so this value does not apply the 52-week method and has not been tested against it (D40). OPS 201 is still to be reviewed (D12).`;

export const TURNOVER_DRAFT_NOTE = 'Turnover is provisional: it uses the selected time frame, not yet the confirmed rolling 52-week OPS 200 calculation.';
