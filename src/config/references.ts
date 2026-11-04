// Client-facing labels for comparison references that more than one page uses. Budget and the MDoc operational target
// stay distinct: MDoc is never labeled Budget. The reference per KPI is open (D01).

/** Reference for labor hours only: the formal Budget (primary) or the MDoc operational target. */
export type HoursRef = 'budget' | 'mdoc';

export const HOURS_REF_OPTIONS: {id: HoursRef; label: string}[] = [
  {id: 'budget', label: 'Budget'},
  {id: 'mdoc', label: 'MDoc (operational target)'},
];

export const hoursRefName = (r: HoursRef) => (r === 'mdoc' ? 'MDoc' : 'Budget');

export const HOURS_REF_HELP =
  'Applies to labor hours only (cards, table, chart and variances). Budget: budgeted hours (SO 1007), the primary comparison. MDoc (Master Doc): the operational target hours stores are asked to follow; it is not the formal Budget. The two are separate sources: daily Budget hours do not necessarily add up to MDoc hours, so their totals can differ. Labor spend and other measures stay compared with Budget. Which reference UC5 uses for hours is open (D01).';

export const HOURS_BUDGET_HELP = 'Budgeted labor hours (SO 1007), the formal Budget. Which reference UC5 uses for hours is open (D01).';
export const HOURS_MDOC_HELP =
  'MDoc (Master Doc) labor hours: the operational target stores are asked to follow (Ops 100 `Hours Mdoc`; OPS106 / OPS108 compare hours with MDoc). Not the formal Budget. Which reference UC5 uses is open (D01).';

const OT_OPERATIONAL_SCOPE =
  'Operational scope (Ops 100 "Less RX" measures): all departments except Pharmacy (RX) of the stores and weeks in the row; the Department filter does not change it, while location, time and associate filters still apply. Where department rows are shown, they use the department-context overtime columns instead.';

export const OT_RATE_HELP = `Overtime Rate (% of Payroll, excl. Pharmacy) = overtime $ / actual labor spend (payroll $), both excluding Pharmacy (RX) and the TOTAL row: Ops 100 OT_Less_RX_Rate_TY = OT_Less_RX_OT_Dollar_Act / OT_Less_RX_Pay_Act. Confirmed for operational reporting; Pharmacy data is kept for other reporting. ${OT_OPERATIONAL_SCOPE} Whether overtime $ is full pay or premium only is open (D04). No threshold or status is applied.`;
export const OT_PAY_HELP = `Overtime $ (excl. Pharmacy): Ops 100 OT_Less_RX_OT_Dollar_Act. ${OT_OPERATIONAL_SCOPE} Full overtime pay or premium only is open (D04).`;
export const OT_HOURS_HELP = `Overtime hours (excl. Pharmacy): Ops 100 OT_Less_RX_OT_Hrs_Act. ${OT_OPERATIONAL_SCOPE}`;

const OT_DEPT_SCOPE =
  'Department context (prototype design choice, not the Ops 100 Less RX measure): follows the department of the row and the Department filter; on store, district, region and total rows it adds up the departments in context. Pharmacy is out of the overtime scope. With all departments in context it equals the operational value.';
export const OT_DEPT_RATE_HELP = `Department Overtime Rate (% of Department Payroll) = department overtime $ / department actual payroll $. ${OT_DEPT_SCOPE}`;
export const OT_DEPT_PAY_HELP = `Department overtime $: overtime dollars of the departments in context. ${OT_DEPT_SCOPE} Full overtime pay or premium only is open (D04).`;
export const OT_DEPT_HOURS_HELP = `Department overtime hours: overtime hours of the departments in context. ${OT_DEPT_SCOPE}`;
