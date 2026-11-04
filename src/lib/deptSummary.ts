// Department summary of Store Ops Labor Allocation (final review, Nov 3: select the area and time frame and see every
// department at once). One row per department, or per documented Dept Group (Center Store, Fresh), for the stores,
// Department filter and weeks in scope. Additive totals are summed; every ratio is recalculated from the row totals
// (lib/metrics). Department transactions overlap, so a group row never adds them up.
import {DEPARTMENTS, DEPT_GROUPS, UNGROUPED_DEPTS, type DeptGroupId, type DeptId} from '../data/org';
import {emptyLabor, type LaborTotals} from './aggregate';

/** Field-by-field sum of additive labor totals. `tx` / `txLY` are summed too: callers must not read them for a
 *  group of departments (transactions overlap across departments). */
export function addLabor(into: LaborTotals, from: LaborTotals): LaborTotals {
  for (const k of Object.keys(into) as (keyof LaborTotals)[]) into[k] += from[k];
  return into;
}

/** Totals of several departments (each fact row belongs to one department, so nothing is counted twice). */
export const sumDepts = (depts: DeptId[], get: (d: DeptId) => LaborTotals | undefined) => depts.reduce((t, d) => {
  const x = get(d);
  return x ? addLabor(t, x) : t;
}, emptyLabor());

export type SummaryKey = DeptId | DeptGroupId | 'ungrouped';
export type SummaryRow = {id: SummaryKey; name: string; depts: DeptId[]; labor: LaborTotals};

/** One row per department with labor in scope, in the Ops department order. */
export function deptRows(get: (d: DeptId) => LaborTotals | undefined): SummaryRow[] {
  return DEPARTMENTS.flatMap(d => {
    const labor = get(d.id);
    return labor && labor.rows > 0 ? [{id: d.id, name: d.name, depts: [d.id], labor}] : [];
  });
}

/** Center Store and Fresh rows, plus one row for the departments without a supplied group, so the rows add up to the
 *  all-department total. Only departments with labor in scope are included. */
export function groupRows(get: (d: DeptId) => LaborTotals | undefined): SummaryRow[] {
  const present = new Set(deptRows(get).flatMap(r => r.depts));
  const make = (id: SummaryKey, name: string, members: DeptId[]): SummaryRow[] => {
    const depts = members.filter(d => present.has(d));
    return depts.length ? [{id, name, depts, labor: sumDepts(depts, get)}] : [];
  };
  return [...DEPT_GROUPS.flatMap(g => make(g.id, g.name, g.depts)), ...make('ungrouped', 'Not in Center Store / Fresh', UNGROUPED_DEPTS)];
}
