// Two overtime scopes, kept apart on purpose.
//
// Operational (source): Ops 100 OT_Less_RX_OT_Dollar_Act, OT_Less_RX_OT_Hrs_Act, OT_Less_RX_Pay_Act and
// OT_Less_RX_Rate_TY = CALCULATE(SUM(…), FILTER(ALL(Dept[Database Name]), NOT Dept[Database Name] IN {"RX", "TOTAL"})).
// ALL replaces only the department-name filter (the Department slicer), so the value covers every department except
// Pharmacy of the stores and weeks in context; store, region, time, ID-store and associate filters stay.
//
// Department context (prototype design choice): overtime of the departments of the row or of the Department filter,
// over the payroll of the same departments; Pharmacy is out of the overtime scope.
//
// Both read the RX-excluded components of LaborTotals (otPay, otHours, otBasePay); they differ only in the department
// context of the totals. Rates are always recalculated from summed components.
import {ALL} from './filters';
import {rollup, type GroupKey, type LaborTotals} from './aggregate';
import {laborForPeople} from './laborPeople';
import type {PeopleFilter} from './peopleMetrics';

/** Totals with the department filter replaced by all departments (the operational overtime scope). `people`: the
 *  associate filters when active (labor actuals of that population), otherwise null. */
export function operationalLabor(stores: Set<string>, from: number, to: number, group: GroupKey, people: PeopleFilter | null): Map<string, LaborTotals> {
  return people ? laborForPeople(stores, ALL, from, to, people, group).totals : new Map([...rollup(stores, ALL, from, to, group)].map(([k, v]) => [k, v.labor]));
}
