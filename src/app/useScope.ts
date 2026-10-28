import {useMemo} from 'react';
import {DEPARTMENTS, deptById, districtById, regionById, storeById} from '../data/org';
import {ALL, benchmarkScope, referenceShort, resolveTime, storeScope, type Filters, type ResolvedTime} from '../lib/filters';
import type {PeopleFilter} from '../lib/peopleMetrics';
import {pageById, type PageId, type PeopleKey} from './pages';
import {useReport} from './state';

export type Scope = {
  filters: Filters;
  time: ResolvedTime;
  from: number;
  to: number;
  stores: Set<string>;
  chain: Set<string>;
  dept: Filters['dept'];
  people: PeopleFilter;
  /** Human-readable description of what applies, for "Filters on this visual" and exports. */
  applied: string[];
  ignored: string[];
};

/** Effective filters for a page: filters that do not apply to the page are neutralized, never silently used. */
export function useScope(pageId: PageId): Scope {
  const {filters, role} = useReport();
  return useMemo(() => {
    const page = pageById.get(pageId)!;
    const time = resolveTime(filters.time);
    const from = time.ok ? time.from : 0;
    const to = time.ok ? time.to : 0;
    const dept = page.filters.department ? filters.dept : ALL;
    const allowed = page.filters.people;
    const pick = (k: PeopleKey) => (allowed.includes(k) ? filters[k] : ALL);
    const people: PeopleFilter = {dept, position: pick('position'), tenure: pick('tenure'), age: pick('age'), recruiter: pick('recruiter')};
    const effective: Filters = {...filters, idOnly: page.filters.idStores && filters.idOnly};
    const applied: string[] = [];
    const ignored: string[] = [];
    if (time.ok && page.filters.time) applied.push(`Time frame: ${time.label} (${time.detail})${time.wholeWeeks ? ` · whole weeks; selected ${time.wholeWeeks.selected}` : ''}`);
    applied.push(locationText(filters));
    if (filters.state !== ALL) applied.push(`State: ${filters.state}`);
    if (filters.geography !== ALL) applied.push(`Geography: ${filters.geography}`);
    if (filters.idOnly) (page.filters.idStores ? applied : ignored).push('ID stores (illustrative eligibility)');
    if (filters.dept !== ALL) (page.filters.department ? applied : ignored).push(`Department: ${deptById.get(filters.dept as never)?.name ?? filters.dept}`);
    for (const k of ['position', 'tenure', 'age', 'recruiter'] as const) if (filters[k] !== ALL) (allowed.includes(k) ? applied : ignored).push(`${PEOPLE_LABEL[k]}: ${filters[k]}`);
    if (page.filters.exploratoryReference && filters.reference !== 'none') applied.push(`Exploratory comparison: ${referenceShort(filters.reference)}`);
    if (role.kind !== 'regional') applied.push(`Simulated access: ${role.kind === 'district' ? districtById.get(role.id)?.name : storeById.get(role.id)?.name}`);
    return {filters: effective, time, from, to, stores: storeScope(effective, role, from), chain: benchmarkScope(effective, from), dept, people, applied, ignored};
  }, [filters, role, pageId]);
}

const PEOPLE_LABEL = {position: 'Position', tenure: 'Tenure', age: 'Age range', recruiter: 'Recruiter'} as const;

export function locationText(f: Filters): string {
  if (f.store !== ALL) return `Store: ${storeById.get(f.store)?.name ?? f.store}`;
  if (f.district !== ALL) return `District: ${districtById.get(f.district)?.name ?? f.district}`;
  if (f.region !== ALL) return `Region: ${regionById.get(f.region)?.name ?? f.region}`;
  return 'Location: All stores';
}

export const deptLabel = (d: Filters['dept']) => (d === ALL ? 'All departments' : (DEPARTMENTS.find(x => x.id === d)?.name ?? d));
