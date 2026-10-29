// Region → District → Store (→ Department) rows for the hierarchy tables. Each level carries its own totals, taken
// from a rollup at that level (never by adding up the rows below it), so ratios, store-level measures and
// overlapping department transactions are recalculated at every level from compatible totals.
import {DISTRICTS, REGIONS, districtById, regionById, storeById, type DeptId} from '../data/org';

export type OrgLevel = 'region' | 'district' | 'store' | 'dept';

export type OrgNode<T> = {
  /** Unique across levels: R1, D01, S101, S101|meat. */
  id: string;
  level: OrgLevel;
  name: string;
  /** Short context under the name (district of a store, number of stores of a region or district). */
  sub: string;
  search: string;
  dept: DeptId | null;
  /** Stores in scope below this row (one for a store or department row). */
  storeIds: string[];
  data: T;
  children: OrgNode<T>[];
};

export type OrgData<T> = {
  region: (id: string) => T | undefined;
  district: (id: string) => T | undefined;
  store: (id: string) => T | undefined;
  /** Department rows of a store, in display order. Omit for a Region → District → Store tree. */
  depts?: (storeId: string) => {id: DeptId; name: string; data: T}[];
};

const storesLabel = (n: number) => `${n} ${n === 1 ? 'store' : 'stores'}`;

/** Builds the tree for the stores in scope. Regions and districts without a store in scope are left out. */
export function buildOrgTree<T>(stores: Set<string>, get: OrgData<T>): OrgNode<T>[] {
  const out: OrgNode<T>[] = [];
  for (const reg of REGIONS) {
    const regStores = [...stores].filter(id => storeById.get(id)?.regionId === reg.id).sort((a, b) => storeById.get(a)!.number - storeById.get(b)!.number);
    const regData = get.region(reg.id);
    if (!regStores.length || regData === undefined) continue;
    const districts: OrgNode<T>[] = [];
    for (const d of DISTRICTS.filter(x => x.regionId === reg.id)) {
      const dStores = regStores.filter(id => storeById.get(id)!.districtId === d.id);
      const dData = get.district(d.id);
      if (!dStores.length || dData === undefined) continue;
      const storeNodes: OrgNode<T>[] = [];
      for (const sid of dStores) {
        const s = storeById.get(sid)!;
        const sData = get.store(sid);
        if (sData === undefined) continue;
        const deptNodes: OrgNode<T>[] = (get.depts?.(sid) ?? []).map(x => ({id: `${sid}|${x.id}`, level: 'dept', name: x.name, sub: '', search: x.name, dept: x.id, storeIds: [sid], data: x.data, children: []}));
        storeNodes.push({id: sid, level: 'store', name: s.name, sub: d.name, search: `${s.name} ${s.number} ${s.state} ${s.geography}`, dept: null, storeIds: [sid], data: sData, children: deptNodes});
      }
      districts.push({id: d.id, level: 'district', name: d.name, sub: storesLabel(storeNodes.length), search: d.name, dept: null, storeIds: dStores, data: dData, children: storeNodes});
    }
    out.push({id: reg.id, level: 'region', name: reg.name, sub: storesLabel(regStores.length), search: reg.name, dept: null, storeIds: regStores, data: regData, children: districts});
  }
  return out;
}

/** Rows to open on first render: a region, district or store that is the only one left at its level by the filters,
 *  so a narrowed scope shows its detail directly. */
export function onlyChildIds<T>(nodes: OrgNode<T>[], out = new Set<string>()): Set<string> {
  if (nodes.length === 1 && nodes[0].children.length) out.add(nodes[0].id);
  for (const n of nodes) onlyChildIds(n.children, out);
  return out;
}

/** Plain-language description of the organizational scope of a table, e.g. "Region 2 › District 05 · 5 stores". */
export function scopeLabel(stores: Set<string>): string {
  const regions = new Set<string>();
  const districts = new Set<string>();
  for (const id of stores) {
    const s = storeById.get(id);
    if (!s) continue;
    regions.add(s.regionId);
    districts.add(s.districtId);
  }
  const parts: string[] = [];
  if (regions.size === 1) parts.push(regionById.get([...regions][0])?.name ?? '');
  else parts.push(`${regions.size} regions`);
  if (districts.size === 1) parts.push(districtById.get([...districts][0])?.name ?? '');
  else if (regions.size === 1) parts.push(`${districts.size} districts`);
  if (stores.size === 1) parts.push(storeById.get([...stores][0])?.name ?? '');
  return `${parts.join(' › ')} · ${storesLabel(stores.size)}`;
}
