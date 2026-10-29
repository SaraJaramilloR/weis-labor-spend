// Average Item Value (AIV) and estimated inflation history, following the OPS111 report (Report_OPS111_Avg_Item_Value):
//   AIV = Sales / Items; AIV LY = Sales LY / Items LY; AIV Bud = Sales Budget / Items Budget (Dept_LY, Dept_Bud rows).
//   Inflation % = (AIV TY − AIV ref) / AIV ref ("Avg Item Value % Value vs LY (INF)", "… vs Bud (INF)").
//   Inflation $ Value = (AIV TY − AIV ref) × Items TY ("INF $ Value": AIV VAR × Items TY).
//   Scopes: Last Week, PTD, QTD, YTD (LW-TY, TY-PTD, TY-QTD, TY-YTD flags); weekly trend on a rolling 52-week window.
// Every value is a ratio of totals over the same stores, departments and weeks. Inflation never adjusts labor measures.
import {WEEKS, periodRange, quarterRange} from '../data/calendar';
import type {LaborTotals} from './aggregate';
import {aiv, ratio} from './metrics';

export type AivMeasure = 'aiv' | 'infPct' | 'infValue';
/** LY is the OPS111 primary comparison; Budget is the additional OPS111 comparison (Dept_Bud, INFvsBud_Trend). */
export type AivCompare = 'ly' | 'budget';
export type AivScope = 'LW' | 'PTD' | 'QTD' | 'YTD';
export const AIV_SCOPES: AivScope[] = ['LW', 'PTD', 'QTD', 'YTD'];
/** Weeks in the rolling history window (OPS111 `52WK`). */
export const HISTORY_WEEKS = 52;

type AivInputs = Pick<LaborTotals, 'sales' | 'items' | 'salesLY' | 'itemsLY' | 'salesBud' | 'itemsBud'>;

export const aivActual = (t: AivInputs) => aiv(t.sales, t.items);
export const aivRef = (t: AivInputs, cmp: AivCompare) => (cmp === 'ly' ? aiv(t.salesLY, t.itemsLY) : aiv(t.salesBud, t.itemsBud));

/** Estimated inflation % = (AIV TY − AIV reference) / AIV reference. */
export function inflationPct(t: AivInputs, cmp: AivCompare): number | null {
  const a = aivActual(t);
  const r = aivRef(t, cmp);
  return a === null || r === null ? null : ratio(a - r, r);
}

/** Estimated inflation $ value = (AIV TY − AIV reference) × Items TY. */
export function inflationValue(t: AivInputs, cmp: AivCompare): number | null {
  const a = aivActual(t);
  const r = aivRef(t, cmp);
  return a === null || r === null ? null : (a - r) * t.items;
}

export function measureValue(t: AivInputs, m: AivMeasure, cmp: AivCompare): number | null {
  return m === 'aiv' ? aivActual(t) : m === 'infPct' ? inflationPct(t, cmp) : inflationValue(t, cmp);
}

/** Week range [from, to] of a summary scope, anchored on the week `anchor` (the last week of the time frame). */
export function scopeRange(scope: AivScope, anchor: number): [number, number] {
  const w = WEEKS[anchor];
  if (scope === 'LW') return [anchor, anchor];
  if (scope === 'PTD') return [periodRange(w.fy, w.period)[0], anchor];
  if (scope === 'QTD') return [quarterRange(w.fy, w.quarter)[0], anchor];
  return [WEEKS.findIndex(x => x.fy === w.fy), anchor];
}

/** Rolling history window ending at `anchor`: up to 52 weeks, shorter only when the data starts later. */
export const historyRange = (anchor: number): [number, number] => [Math.max(0, anchor - HISTORY_WEEKS + 1), anchor];
