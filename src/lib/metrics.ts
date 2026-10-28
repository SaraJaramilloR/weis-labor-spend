// Centralized KPI formulas. Every ratio is a ratio of compatible totals (never an average of store
// ratios), and every division returns null instead of a misleading 0 when the denominator is 0.

/** Safe division: null when either side is missing, not finite, or the denominator is 0. */
export function ratio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num === null || num === undefined || den === null || den === undefined) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

/** Items per Labor Hour = SUM(Items) / SUM(Labor Hours). */
export const iplh = (items: number, hours: number) => ratio(items, hours);
/** Labor Rate = SUM(Labor Pay) / SUM(Sales). The sales basis is an open decision (D19); callers pass Total Sales. */
export const laborRate = (pay: number, sales: number) => ratio(pay, sales);
/** Average Hourly Rate = SUM(Labor Pay) / SUM(Labor Hours). */
export const ahr = (pay: number, hours: number) => ratio(pay, hours);
/** Basket Size = SUM(Items) / SUM(Transactions). */
export const basketSize = (items: number, tx: number) => ratio(items, tx);
/** Average Item Value = SUM(Sales) / SUM(Items). */
export const aiv = (sales: number, items: number) => ratio(sales, items);
/** Sales per Transaction = SUM(Sales) / SUM(Transactions). */
export const salesPerTx = (sales: number, tx: number) => ratio(sales, tx);
/** Overtime Rate (excl. RX) = SUM(OT $ excl. RX) / SUM(Payroll $ excl. RX). */
export const otRate = (otPay: number, pay: number) => ratio(otPay, pay);

/** YoY change = Current − Prior Year. Null when there is no prior-year value. */
export const yoyChange = (current: number | null, prior: number | null) => (current === null || prior === null || prior === 0 ? null : current - prior);
/** YoY % = (Current − Prior Year) / Prior Year. */
export const yoyPct = (current: number | null, prior: number | null) => (current === null || prior === null ? null : ratio(current - prior, prior));

/** Variance to a reference value ($ or hours): Actual − Reference. */
export const variance = (actual: number | null, ref: number | null) => (actual === null || ref === null ? null : actual - ref);
/** Variance % = (Actual − Reference) / Reference. */
export const variancePct = (actual: number | null, ref: number | null) => (actual === null || ref === null ? null : ratio(actual - ref, ref));
/** Difference between two rates, in percentage points (as a fraction: 0.004 = 0.4 pp). */
export const ppDiff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** Average headcount (documented draft, D12) = (Beginning + Ending) / 2. */
export const avgHeadcount = (begin: number, end: number) => (begin + end) / 2;
/** Turnover rate (documented draft, D12) = Terminations / Average headcount. */
export const turnoverRate = (terms: number, begin: number, end: number) => ratio(terms, avgHeadcount(begin, end));
/** Retention rate (documented draft, D27) = (Beginning headcount − terminations of those associates) / Beginning headcount. */
export const retentionRate = (begin: number, termsOfBeginning: number) => ratio(begin - termsOfBeginning, begin);
/** Headcount share (FT or PT) = count / (FT + PT). Headcount based, not hours based. */
export const headcountShare = (count: number, ft: number, pt: number) => ratio(count, ft + pt);

/** Simple average of non-null values (used only when the user selects the simple benchmark, D13). */
export function simpleAverage(values: (number | null)[]): number | null {
  const ok = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}
