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
  'Applies to labor hours only (cards, table, chart and variances). Budget: budgeted hours (SO 1007), the primary comparison. MDoc (Master Doc): the operational target hours stores are asked to follow; it is not the formal Budget. Labor spend and other measures stay compared with Budget. Which reference UC5 uses for hours is open (D01).';

export const HOURS_BUDGET_HELP = 'Budgeted labor hours (SO 1007), the formal Budget. Which reference UC5 uses for hours is open (D01).';
export const HOURS_MDOC_HELP =
  'MDoc (Master Doc) labor hours: the operational target stores are asked to follow (Ops 100 `Hours Mdoc`; OPS106 / OPS108 compare hours with MDoc). Not the formal Budget. Which reference UC5 uses is open (D01).';

export const OT_RATE_HELP =
  'Overtime Rate (% of Payroll, excl. Pharmacy) = overtime $ / total payroll $ (actual labor spend), both excluding Pharmacy (RX): the workbook and Ops 100 "OT Less RX Rate" formula. Pharmacy is excluded from overtime (confirmed). The denominator is pending confirmation: in the prototype review overtime dollars were described as divided by labor budget (41:46), which differs from the payroll denominator used here (D33). No threshold or status is applied.';
