// Client-facing requirements metadata: glossary, KPI definitions, open decisions and prototype
// assumptions. Workbook row references and technical detail live in docs/, not in the interface.

export type Evidence = 'Confirmed' | 'Documented draft' | 'Prototype assumption' | 'Open decision';

export const GLOSSARY: {term: string; meaning: string}[] = [
  {term: 'OPS', meaning: 'Prefix of the Operations report series (for example OPS 101–111 and OPS 200 / 201). The official expansion has not been confirmed.'},
  {term: 'IPLH', meaning: 'Items per Labor Hour: items sold divided by actual labor hours.'},
  {term: 'AHR', meaning: 'Average Hourly Rate: actual payroll dollars divided by actual labor hours.'},
  {term: 'OT', meaning: 'Overtime: hours worked beyond the scheduled threshold and the dollars paid for them.'},
  {term: 'RX', meaning: 'Pharmacy department code used in the Ops reports. Pharmacy is excluded from the overtime scope.'},
  {term: 'FT / PT', meaning: 'Full-time / part-time associates. FT / PT shares are based on headcount, not hours.'},
  {term: 'MDoc', meaning: 'Master Doc: a separate Excel file with day-level budgeted hours and dollars used by the Ops 100 reports.'},
  {term: 'SO 1007 / SO 1006', meaning: 'WMBI reports referenced by the Ops 100 model: SO 1007 holds budget values; SO 1006 holds projected values.'},
  {term: 'TY / LY', meaning: 'This year / last year. Last year is the same week number one year earlier (364 days).'},
  {term: 'WTD / PTD / QTD / YTD', meaning: 'Week, period, quarter and year to date, through the latest complete week.'},
  {term: 'ID Stores', meaning: 'Identical (comparable) stores. The prototype shows an illustrative eligibility that uses the UC1 rule (five full fiscal quarters) as a reference. Ops eligibility is open; Accounting\'s rule is unchanged and is not modeled.'},
  {term: 'Clean Sales', meaning: 'Total Sales excluding Fuel, Pharmacy and Front End.'},
  {term: 'Time frame', meaning: 'The selected span of dates. "Period" is reserved for the 4-4-5 fiscal periods (P1–P12).'},
  {term: 'Fiscal calendar', meaning: '4-4-5 calendar implemented as in UC1 (BC3) and the Ops date table: Sunday–Saturday weeks; P3, P6, P9 and P11 have five weeks. Matching implementations are not a UC5 business approval; 53-week years are not modeled.'},
];

export type KpiDefinition = {kpi: string; definition: string; calculation: string; source: string; evidence: Evidence; decisions?: string[]};

export const KPI_DEFINITIONS: KpiDefinition[] = [
  {kpi: 'Labor Spend', definition: 'Actual payroll dollars, including salaried managers and Starbucks as supplied by the source (no manual additions).', calculation: 'SUM(Payroll $ actual)', source: 'UKG Recap / WMBI', evidence: 'Documented draft', decisions: ['D01', 'D06']},
  {kpi: 'Labor Hours', definition: 'Actual labor hours, including salaried managers and Starbucks as supplied by the source.', calculation: 'SUM(Hours actual)', source: 'UKG Recap', evidence: 'Documented draft', decisions: ['D06', 'D17']},
  {kpi: 'Budget Labor Spend / Hours', definition: 'Budgeted payroll dollars and hours for the time frame. Both measures are required.', calculation: 'SUM(Payroll $ budget), SUM(Hours budget)', source: 'SO 1007 (WMBI) and MDoc', evidence: 'Confirmed', decisions: ['D01', 'D02']},
  {kpi: 'Labor Rate', definition: 'Labor dollars as a share of sales.', calculation: 'SUM(Payroll $) / SUM(Sales $). Budget: Budget payroll $ / Budget sales $', source: 'Ops 100 model', evidence: 'Documented draft', decisions: ['D19']},
  {kpi: 'Average Hourly Rate (AHR)', definition: 'Average pay per hour worked.', calculation: 'SUM(Payroll $) / SUM(Hours)', source: 'Ops 100 model', evidence: 'Documented draft'},
  {kpi: 'Items per Labor Hour (IPLH)', definition: 'Items sold per actual labor hour.', calculation: 'SUM(Items) / SUM(Hours). MDoc: Items MDoc / Hours MDoc', source: 'Ops 100 model', evidence: 'Documented draft', decisions: ['D01']},
  {kpi: 'Overtime $ / Hours (excl. RX)', definition: 'Overtime dollars and hours, excluding Pharmacy.', calculation: 'SUM(OT $), SUM(OT hours) for departments other than RX', source: 'UKG Recap', evidence: 'Confirmed', decisions: ['D03', 'D04']},
  {kpi: 'Overtime Rate (excl. RX)', definition: 'Overtime dollars as a share of payroll dollars, both excluding Pharmacy.', calculation: 'SUM(OT $ excl. RX) / SUM(Payroll $ excl. RX)', source: 'Ops 100 model', evidence: 'Documented draft', decisions: ['D03', 'D04']},
  {kpi: 'Call-off Hours / Call-off % (draft)', definition: 'Workbook draft: hours variance between actual hours worked and projected (scheduled) hours. It is not an attendance-based absence rate: call-off events and partial absences are not identified.', calculation: 'Hours: SUM(Actual hours) − SUM(Projected hours). %: ÷ SUM(Projected hours). The 2 % opportunity flag is not applied', source: 'Ops 100 model (Hours vs Proj Ct / % (Call Off)), SO 1006', evidence: 'Open decision', decisions: ['D05']},
  {kpi: 'Vacation Hours', definition: 'Vacation hours in the time frame, shown separately from actual hours.', calculation: 'SUM(Vacation hours)', source: 'UKG', evidence: 'Open decision', decisions: ['D17']},
  {kpi: 'Gross Sales (Total Gross Sales)', definition: 'Sales after item-level discounts and before non-item discounts. Same KPI as UC1 Gross Sales.', calculation: 'SUM(Gross sales); LY = same fiscal week last year (364 days); YoY ($) = TY − LY; YoY (%) = (TY − LY) / LY', source: 'UC1 definition', evidence: 'Documented draft', decisions: ['D08']},
  {kpi: 'Clean Sales', definition: 'Total Sales excluding Fuel, Pharmacy and Front End.', calculation: 'SUM(Gross sales) for all departments except Fuel, Pharmacy, Front End', source: 'Ops 100 model', evidence: 'Confirmed', decisions: ['D08', 'D16']},
  {kpi: 'Total Volume (Items)', definition: 'Total units or weight sold. Ops 100 Items Actual is one quantity that includes weighted or measured items (it carries decimals, for example fuel); UC2 shows each and pounds separately.', calculation: 'SUM(Items), as Ops 100 Items Actual (used by IPLH and AIV)', source: 'UC2 definition; Ops 100', evidence: 'Documented draft', decisions: ['D30']},
  {kpi: 'Transactions / Customer Count', definition: 'Number of customer transactions (Ops 100 uses it as customer count; not unique customers). With a department selected, the transactions that include that department (Ops 100 department rows).', calculation: 'SUM(Transactions); all departments = store total, never a sum of departments', source: 'POS / Ops 100 model', evidence: 'Documented draft'},
  {kpi: 'Basket Size', definition: 'Average number of items per transaction, in the selected department context.', calculation: 'SUM(Items) / SUM(Transactions)', source: 'Ops 100 model', evidence: 'Confirmed'},
  {kpi: 'Sales per Transaction', definition: 'Average sales dollars per transaction.', calculation: 'SUM(Sales $) / SUM(Transactions)', source: 'Ops 100 model', evidence: 'Documented draft'},
  {kpi: 'Average Item Value (AIV)', definition: 'Gross sales per item sold. The workbook equates it with UC2 Average Retail Price per Unit (a separate measure from UC2 Net Sales per Unit).', calculation: 'SUM(Gross sales $) / SUM(Items)', source: 'UC2 / Ops 100 model', evidence: 'Documented draft'},
  {kpi: 'Estimated Inflation', definition: 'Change in Average Item Value versus last year. Tracked separately; it does not adjust any labor metric.', calculation: '(AIV TY − AIV LY) / AIV LY', source: 'Ops 100 model', evidence: 'Confirmed', decisions: ['D26']},
  {kpi: 'Sales per Square Foot', definition: 'Sales of all departments per square foot of store floor area, for the selected time frame.', calculation: 'SUM(Total store sales) / SUM(Store square feet)', source: 'Ops 100 model', evidence: 'Documented draft', decisions: ['D24']},
  {kpi: 'Headcount (beginning / ending)', definition: 'Active associates at the start and at the end of the time frame (snapshots, never summed).', calculation: 'COUNT(active associates) on the snapshot date', source: 'Workday', evidence: 'Documented draft', decisions: ['D12']},
  {kpi: 'Hires / Terminations', definition: 'Associates hired / terminated within the time frame.', calculation: 'COUNT(hire events), COUNT(termination events)', source: 'Workday', evidence: 'Confirmed', decisions: ['D12']},
  {kpi: 'Turnover Rate', definition: 'Share of the workforce that left in the time frame. Must follow today\'s OPS 201 logic.', calculation: 'Terminations / ((Beginning + Ending headcount) / 2)', source: 'Workday', evidence: 'Documented draft', decisions: ['D12']},
  {kpi: 'Retention Rate', definition: 'Share of associates active at the start who are still employed at the end.', calculation: '(Beginning headcount − terminations of those associates) / Beginning headcount', source: 'Workday', evidence: 'Open decision', decisions: ['D27']},
  {kpi: 'FT / PT Ratio', definition: 'Full-time and part-time associates as a share of FT + PT headcount (headcount based, not hours).', calculation: 'FT count / (FT + PT count)', source: 'Workday census', evidence: 'Documented draft'},
  {kpi: 'Average Hours (FT / PT)', definition: 'Average productive hours per full-time and per part-time associate.', calculation: 'Workbook R31: average of the row-level FT (PT) average productive hours (row = store × department × week), positive values only', source: 'UKG (Ops 100 UKG FT / PT Avg Pro Hours)', evidence: 'Documented draft', decisions: ['D23']},
  {kpi: 'Attendance Incidents', definition: 'Count of attendance incidents by type (late in, absences, no call no show, sick unpaid, half shift unworked).', calculation: 'COUNT(incidents) by type; calculation to be confirmed', source: 'UKG Attendance', evidence: 'Open decision', decisions: ['D22']},
  {kpi: 'Chain / Region Average', definition: 'Benchmark value of each KPI across all stores in the chain or region for the same time frame.', calculation: 'Weighted: ratio of chain totals. Simple: average of store values', source: 'Derived', evidence: 'Open decision', decisions: ['D13']},
];

export type Decision = {id: string; title: string; handling: string; owner: string};

/** Short client-facing summaries. The full register, with evidence and sources, is docs/decision-register.md. */
export const DECISIONS: Decision[] = [
  {id: 'D01', title: 'Target reference per KPI (Budget, MDoc, Projection)', handling: 'Budget is the primary comparison. MDoc or Prior year can be added as an exploratory secondary comparison in Discovery options. The mapping per KPI is pending.', owner: 'Vijay'},
  {id: 'D02', title: 'Revised historical targets', handling: 'Targets are shown as loaded; whether budget revisions change history is pending.', owner: 'Vijay'},
  {id: 'D03', title: 'OPS 102 overtime 0.5% criterion', handling: 'Not applied as a status rule. Overtime is shown without traffic lights.', owner: 'Vijay'},
  {id: 'D04', title: 'Overtime dollars: full pay or premium only', handling: 'Synthetic overtime dollars represent full overtime pay; the field definition is pending.', owner: 'Vijay'},
  {id: 'D05', title: 'Call-off definition and partial absences', handling: 'Call-off hours / % use the workbook hours-variance draft, labeled draft. It is not an attendance-based absence rate. The 2% flag is not applied.', owner: 'Vijay / Rick / James'},
  {id: 'D06', title: 'Labor of associates supporting another store or department', handling: 'Labor is attributed to the store and department on the record; cross-store attribution is pending.', owner: 'Rick'},
  {id: 'D07', title: 'Ops ID-store eligibility', handling: 'The ID stores toggle shows an illustrative eligibility using the UC1 five-full-quarter rule as a reference on synthetic store dates. Ops eligibility is open; Accounting\'s rule is unchanged and not modeled.', owner: 'Vijay'},
  {id: 'D08', title: 'KPI priority and lead sales number', handling: 'Total Sales and Clean Sales are shown side by side; neither is presented as the lead number.', owner: 'James / Rick'},
  {id: 'D09', title: 'Combined vs individual results by access level', handling: 'Simulated access (Discovery options) limits stores in the browser only; whether managers see combined or individual results is pending.', owner: 'James / Rick'},
  {id: 'D10', title: 'Associate-level visibility', handling: 'No associate-level detail is shown.', owner: 'James / Rick'},
  {id: 'D11', title: 'Geography lookup', handling: 'Geography values are illustrative market areas until the master lookup is shared.', owner: 'Vijay'},
  {id: 'D12', title: 'People calculations (OPS 201)', handling: 'Turnover and headcount follow the workbook drafts until OPS 201 is reviewed.', owner: 'Vijay'},
  {id: 'D13', title: 'Benchmark aggregation and filter behavior', handling: 'Default is weighted (chain totals); the simple store average is available in Discovery options. Benchmarks ignore location filters.', owner: 'James / Rick'},
  {id: 'D14', title: 'Corrections to historical actuals', handling: 'Not modeled.', owner: 'Vijay'},
  {id: 'D15', title: 'Validation reference, approver and rounding tolerance', handling: 'No reconciliation tolerance is applied in the prototype.', owner: 'Weis business owners'},
  {id: 'D16', title: 'Clean Sales exclusions', handling: 'Follows the confirmed rule (excludes Fuel, Pharmacy, Front End); one Ops report note lists only Fuel and Pharmacy.', owner: 'Vijay'},
  {id: 'D17', title: 'Vacation hours and pay-code mapping', handling: 'Vacation hours are shown separately and are not added to actual hours.', owner: 'Vijay'},
  {id: 'D18', title: 'UC5 reporting calendar confirmation', handling: 'Implemented as in UC1 (BC3 fiscal.ts) and the Ops date table. Consistent implementations are not a UC5 approval. 53-week years are not modeled.', owner: 'Vijay'},
  {id: 'D19', title: 'Sales basis for Labor Rate', handling: 'Labor Rate uses Total Sales, as in the Ops 100 measure; this is not assumed for every Labor Rate measure.', owner: 'James / Rick'},
  {id: 'D20', title: 'Position and Tenure on labor measures', handling: 'Implemented: UKG hours exist per associate, so filters apply to labor actuals. Budget, sales and items are not set by associate (n/a under these filters). Confirm that Ops wants labor filtered this way.', owner: 'Vijay'},
  {id: 'D21', title: 'Hourly sales by time of day', handling: 'Under evaluation; shown as an illustrative curve.', owner: 'James'},
  {id: 'D22', title: 'Attendance incident calculation', handling: 'Illustrative associate-level events counted by type; all view filters apply (home-department attribution, D06). The calculation is pending and the synthetic events do not prove source availability.', owner: 'James'},
  {id: 'D23', title: 'Average hours per FT / PT associate', handling: 'Implemented as the workbook draft (average of row-level averages, positive values only). Confirm whether an unweighted average of rows is intended.', owner: 'Vijay'},
  {id: 'D24', title: 'Sales per square foot rule', handling: 'Uses all-department store sales and ignores the Department filter.', owner: 'James'},
  {id: 'D25', title: 'Holiday period windows', handling: 'Not implemented until the windows are defined.', owner: 'Vijay'},
  {id: 'D26', title: 'Inflation scope', handling: 'Shown separately; it does not adjust labor metrics. Its use in sales growth is pending.', owner: 'Vijay'},
  {id: 'D27', title: 'Retention rate definition', handling: 'Shown with the workbook draft formula.', owner: 'James / Rick'},
  {id: 'D28', title: 'Benchmark visibility for people KPIs', handling: 'Chain and region averages are shown as aggregates only.', owner: 'James / Rick'},
  {id: 'D29', title: 'Labor Rate $ over / under (not displayed)', handling: 'Ops 100 DAX iterates the fact rows (SUMX); kept out of the views until its business use is confirmed.', owner: 'Vijay'},
  {id: 'D30', title: 'Total Volume units vs weight', handling: 'Ops 100 Items Actual combines units and weighted quantities; UC2 shows each and pounds separately. The prototype keeps the Ops 100 single quantity. Confirm which representation UC5 should show.', owner: 'James / Vijay'},
  {id: 'D31', title: 'AIV and UC2 Average Retail Price per Unit (closed)', handling: 'Not a contradiction: UC2 Net Sales per Unit is a different measure. AIV follows the workbook (gross sales / items); the UC2 formula is not available as code.', owner: '—'},
  {id: 'D32', title: 'Customer measures by department (resolved)', handling: 'Ops 100 department rows carry their own transactions, so customer count, basket and sales per transaction follow the Department filter. Department transactions are never summed into a store total.', owner: '—'},
];
export const decisionById = new Map(DECISIONS.map(d => [d.id, d]));

export const ASSUMPTIONS: string[] = [
  'All figures are synthetic and deterministic. Stores, districts, regions, markets and recruiters are illustrative.',
  'Weeks run Sunday to Saturday on the 4-4-5 calendar implemented in UC1 and in the Ops date table; UC5 confirmation is pending.',
  'Data is loaded from FY2025 W01 through FY2026 W43 (week ending 10/24/2026). Daily detail covers the last 8 weeks.',
  'Clean Sales and Sales per Square Foot are store level (the Department filter does not change them). Transactions, basket size and sales per transaction follow the Department filter, as Ops 100 department rows do.',
  'Position, Tenure, Age Range and Recruiter filter people measures and labor actuals (through associate hours, assuming associates of the same employment type share the row average). Budget, sales and items are not filtered by them.',
  'Benchmarks (chain and region averages) ignore location filters and keep time, department, people filters and the ID stores toggle.',
  'ID-store eligibility is illustrative: the UC1 five-full-quarter rule is applied to synthetic store opening dates as a reference only.',
  'Variance colors are neutral: spending below a target is not automatically favorable without sales and productivity context.',
  'Simulated access is a demonstration of filtering only. It is not production security.',
];
