---
name: uc5-metrics-and-mock-data
description: Generate and maintain coherent deterministic synthetic data and centralized KPI formulas for the BC5 Labor Spend prototype. Use when asked to "add a metric", "change a formula", "generate data", "fix a calculation", "reconcile totals", or when touching src/data or src/lib.
---

# UC5 Metrics and Mock Data

## Data rules
1. Keep the data deterministic: mulberry32 with a fixed seed and no `Math.random()`. Changing the seed changes every demo figure, so mention it when you do.
2. Never use real Weis values, store numbers, names or employee records. Keep magnitudes plausible for a grocery chain. Do not mirror the totals from the OPS reports.
3. Keep grains separate:
   - Weekly store × department facts: sales (TY/LY/Budget), items (TY/LY/MDoc), pay and hours (Actual/LY/Budget/MDoc/Projection), OT hours and $ (TY/LY), vacation hours, FT/PT hours.
   - Daily store × department facts for recent weeks. They must sum exactly to the weekly facts.
   - Store × week transactions (TY/LY). Never derive them per department.
   - Associate roster (illustrative) for headcount snapshots and hire/termination events, shown only in aggregate.
   - Store × week attendance incident counts by type.
   - Calendar (OPS reporting calendar, documented draft) and organization dimensions (region, district, store, state, market area, sq ft, ID-store flag).
4. Do not invent source-level detail from aggregated reports. Label any associate or item detail as illustrative.
5. Starbucks and salaried-manager pay are part of the source facts. Never add manual adjustments.

## Formula rules (single source: `src/lib/metrics.ts`)
- IPLH = Items / Hours; Labor Rate = Pay / Sales (Total Sales); AHR = Pay / Hours; Basket = Items / Transactions; AIV = Sales / Items; Sales per Tx = Sales / Tx; Sales per Sq Ft = Total-dept Sales / Sq Ft.
- OT Rate excl. RX = OT $ (non-RX) / Pay (non-RX). OT measures exclude Pharmacy.
- Clean Sales = Sales excluding Fuel, Pharmacy and Front End (D16 is open).
- Turnover = Terminations / Average Headcount. Retention = (Beginning HC − terminations of beginning employees) / Beginning HC. Both are drafts (D12, D27).
- Hours vs Projection = (Actual − Projected) / Projected, the call-off proxy (D05).
- YoY = Current − LY; YoY % = (Current − LY) / LY. Rate differences are in pp.
- Always sum numerators and denominators first and then divide. Use the same population and time frame on both sides. Never average store percentages unless the user picks the simple-average benchmark (D13).
- `safeDivide` returns `null` for a zero or non-finite denominator, and the UI shows n/a.
- Headcount is a snapshot at a date: Beginning = active at the start date, Ending = active at the end date. Never sum snapshots.
- Inflation never feeds a labor metric.

## Filter applicability
Maintain one applicability map (filter → measures it affects). Basket, transactions, sales/tx and sales per sq ft ignore Department. Position, Tenure, Age range and Recruiter apply to people measures only (D20). Visuals list the ignored filters under "Filters on this visual".

## Tests to keep green
- Ratio of totals ≠ average of ratios (fixture).
- Department rows sum to the store total. Daily rows sum to the week. Regions sum to the chain.
- Clean Sales excludes exactly Fuel, Pharmacy and Front End. OT excludes RX.
- Zero denominators return null. Invalid filter values are rejected or reset.
- Headcount is not summed across weeks. Hires − terms reconcile with the change in headcount.
- Inflation is unchanged when labor inputs change.
