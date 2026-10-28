// Report pages: the proposed Labor Overview first, then the six required workbook Views in workbook order.
// Each required page is one workbook View (sheet "UC #5 - Labor Spend", rows 62–67); its name is
// the Excel view name and its filter set follows the view Definition. Traceability: docs/prototype-validation-map.md.
export type PageId = 'overview' | 'allocation' | 'budget' | 'daily' | 'tracking' | 'benchmark' | 'people';

export type PeopleKey = 'position' | 'tenure' | 'age' | 'recruiter';

export type PageFilters = {
  /** Shared time row. The Daily page has its own week / day control instead. */
  time: boolean;
  department: boolean;
  /** People filters listed in the view Definition (they also filter labor actuals through associate hours). */
  people: PeopleKey[];
  /** ID stores toggle: only where a last-year comparison gives it meaning. */
  idStores: boolean;
  /** Accepts the exploratory secondary comparison (Discovery options). Budget stays primary. */
  exploratoryReference: boolean;
  /** Store control as a searchable list (type a number or name). On the benchmark page the Store selects the
   *  store for the trend charts; the store list follows Region / District. */
  storeSearch?: boolean;
};

export type PageMeta = {
  id: PageId;
  name: string;
  eyebrow: string;
  /** Need stated in the workbook user story (paraphrased), or null for design proposals. */
  question: string | null;
  filters: PageFilters;
};

export const PAGES: PageMeta[] = [
  {id: 'overview', name: 'Labor Overview', eyebrow: 'Proposed overview', question: null, filters: {time: true, department: true, people: [], idStores: true, exploratoryReference: true}},
  {id: 'allocation', name: 'Store Ops Labor Allocation', eyebrow: 'Workbook view · User Story 1', question: 'Historical labor hours and spend and items per labor hour by store and department, to allocate hours and spend against the labor budget.', filters: {time: true, department: true, people: ['position', 'tenure'], idStores: true, exploratoryReference: false}},
  {id: 'tracking', name: 'Turnover, Overtime & Call-off Tracking', eyebrow: 'Workbook view · User Story 2', question: 'Turnover, overtime and call-off tracking, chain-wide and by store, with a chain-wide average next to each KPI, to identify poor-performing stores.', filters: {time: true, department: true, people: ['position', 'tenure', 'age', 'recruiter'], idStores: false, exploratoryReference: false}},
  {id: 'benchmark', name: 'Turnover & Retention Benchmark', eyebrow: 'Workbook view · User Story 3', question: 'Where do my stores stand on turnover and retention against the chain and the region, to see where to upskill talent?', filters: {time: true, department: false, people: ['position', 'tenure', 'age', 'recruiter'], idStores: false, exploratoryReference: false, storeSearch: true}},
  {id: 'budget', name: 'Headcount & Hours vs Budget', eyebrow: 'Workbook view · User Story 4', question: 'Headcount, hours and spend versus budget by region, district and store, to give feedback and address areas where labor spend is higher than budget.', filters: {time: true, department: false, people: [], idStores: false, exploratoryReference: true}},
  {id: 'daily', name: 'Daily Labor vs Budget', eyebrow: 'Workbook view · User Story 5', question: 'A quick daily view of labor hours and spend versus budget for the past week, to make quick staffing decisions.', filters: {time: false, department: true, people: [], idStores: false, exploratoryReference: true}},
  {id: 'people', name: 'People Reporting (Filterable Ops 200)', eyebrow: 'Workbook view · People Reporting', question: 'Headcount, hires, terminations, turnover and full-time / part-time ratio by recruiter, age range and tenure, by store, district, region and state.', filters: {time: true, department: false, people: ['position', 'tenure', 'age', 'recruiter'], idStores: false, exploratoryReference: false}},
];

export const pageById = new Map(PAGES.map(p => [p.id, p]));
export const isPageId = (v: string | null): v is PageId => v !== null && pageById.has(v as PageId);
