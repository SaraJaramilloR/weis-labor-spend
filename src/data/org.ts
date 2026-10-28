// Organizational dimensions. Everything here is synthetic: names, numbers, sizes and geography are
// illustrative and do not describe real Weis stores.
import {between, hashSeed, mulberry32} from '../lib/prng';

export type Region = {id: string; name: string};
export type District = {id: string; name: string; regionId: string};
export type Store = {
  id: string;
  name: string;
  number: number;
  districtId: string;
  regionId: string;
  state: string;
  /** Illustrative market area. The real geography lookup is an open decision (D11). */
  geography: string;
  sqft: number;
  size: number;
  hasFuel: boolean;
  hasPharmacy: boolean;
  hasStarbucks: boolean;
  /** Global week index of the first trading week (0 = open before FY2025). */
  openWeekIdx: number;
};

export type DeptId =
  | 'grocery' | 'dairy' | 'frozen' | 'hbc' | 'gm' | 'beer' | 'meat' | 'seafood' | 'produce'
  | 'floral' | 'deli' | 'bakery' | 'starbucks' | 'rx' | 'fuel' | 'frontend' | 'online';

export type Department = {
  id: DeptId;
  name: string;
  /** Share of store sales before normalization. */
  salesShare: number;
  /** Share of store labor dollars before normalization. */
  laborShare: number;
  /** Illustrative average hourly rate in FY2025. */
  ahr: number;
  /** Illustrative average item value. */
  aiv: number;
  /** Excluded from Clean Sales (confirmed in the Oct 27, 2026 session: Fuel, Pharmacy, Front End). */
  cleanExcluded: boolean;
  /** Excluded from the overtime scope (Pharmacy, confirmed). */
  otExcluded: boolean;
};

export const DEPARTMENTS: Department[] = [
  {id: 'grocery', name: 'Grocery', salesShare: 30, laborShare: 15, ahr: 16.9, aiv: 3.6, cleanExcluded: false, otExcluded: false},
  {id: 'dairy', name: 'Dairy', salesShare: 8, laborShare: 3, ahr: 16.6, aiv: 3.2, cleanExcluded: false, otExcluded: false},
  {id: 'frozen', name: 'Frozen', salesShare: 5, laborShare: 2, ahr: 16.6, aiv: 4.2, cleanExcluded: false, otExcluded: false},
  {id: 'hbc', name: 'HBC', salesShare: 3.5, laborShare: 1.5, ahr: 16.8, aiv: 6.5, cleanExcluded: false, otExcluded: false},
  {id: 'gm', name: 'General Merchandise', salesShare: 3, laborShare: 1.5, ahr: 16.8, aiv: 7, cleanExcluded: false, otExcluded: false},
  {id: 'beer', name: 'Beer & Wine', salesShare: 2.5, laborShare: 0.6, ahr: 17.2, aiv: 11, cleanExcluded: false, otExcluded: false},
  {id: 'meat', name: 'Meat', salesShare: 12, laborShare: 10, ahr: 20.4, aiv: 8.5, cleanExcluded: false, otExcluded: false},
  {id: 'seafood', name: 'Seafood', salesShare: 1.5, laborShare: 2, ahr: 18.9, aiv: 11, cleanExcluded: false, otExcluded: false},
  {id: 'produce', name: 'Produce', salesShare: 9, laborShare: 8, ahr: 17.1, aiv: 2.4, cleanExcluded: false, otExcluded: false},
  {id: 'floral', name: 'Floral', salesShare: 1, laborShare: 1.2, ahr: 16.7, aiv: 9, cleanExcluded: false, otExcluded: false},
  {id: 'deli', name: 'Deli', salesShare: 5, laborShare: 11, ahr: 16.4, aiv: 6, cleanExcluded: false, otExcluded: false},
  {id: 'bakery', name: 'Bakery', salesShare: 3, laborShare: 6, ahr: 16.9, aiv: 4.5, cleanExcluded: false, otExcluded: false},
  {id: 'starbucks', name: 'Starbucks', salesShare: 0.6, laborShare: 2, ahr: 15.4, aiv: 5.5, cleanExcluded: false, otExcluded: false},
  {id: 'rx', name: 'Pharmacy (RX)', salesShare: 7, laborShare: 8, ahr: 37.5, aiv: 28, cleanExcluded: true, otExcluded: true},
  {id: 'fuel', name: 'Fuel', salesShare: 6, laborShare: 0.8, ahr: 15.6, aiv: 3.4, cleanExcluded: true, otExcluded: false},
  {id: 'frontend', name: 'Front End', salesShare: 0.8, laborShare: 24, ahr: 15.3, aiv: 3, cleanExcluded: true, otExcluded: false},
  {id: 'online', name: 'Online', salesShare: 1.6, laborShare: 2.4, ahr: 16.2, aiv: 4.5, cleanExcluded: false, otExcluded: false},
];
export const deptById = new Map(DEPARTMENTS.map(d => [d.id, d]));

export const REGIONS: Region[] = [1, 2, 3].map(n => ({id: `R${n}`, name: `Region ${n}`}));
export const DISTRICTS: District[] = Array.from({length: 12}, (_, i) => ({
  id: `D${String(i + 1).padStart(2, '0')}`,
  name: `District ${String(i + 1).padStart(2, '0')}`,
  regionId: `R${Math.floor(i / 4) + 1}`,
}));

/** Illustrative states per region (Weis operating states); not a mapping of real stores. */
const REGION_STATES: Record<string, string[]> = {R1: ['PA'], R2: ['PA', 'MD', 'DE'], R3: ['PA', 'NY', 'NJ', 'VA', 'WV']};
export const GEOGRAPHIES = Array.from({length: 8}, (_, i) => `Market Area ${i + 1}`);

const rnd = mulberry32(hashSeed('bc5-stores'));
export const STORES: Store[] = [];
DISTRICTS.forEach((d, di) => {
  for (let s = 0; s < 5; s++) {
    const number = 101 + di * 5 + s;
    const states = REGION_STATES[d.regionId];
    const size = between(rnd, 0.72, 1.38);
    STORES.push({
      id: `S${number}`,
      name: `Store ${number}`,
      number,
      districtId: d.id,
      regionId: d.regionId,
      state: states[Math.floor(rnd() * states.length)],
      geography: GEOGRAPHIES[Math.min(7, Math.floor(di * (8 / 12)) + (s === 4 ? 1 : 0))],
      sqft: Math.round((34_000 + size * 21_000) / 100) * 100,
      size,
      hasFuel: rnd() < 0.5,
      hasPharmacy: rnd() < 0.78,
      hasStarbucks: rnd() < 0.35,
      openWeekIdx: 0,
    });
  }
});
// Two new stores (FY2025 W50 and FY2026 W10) so the ID (comparable) store toggle has a visible effect.
STORES[13].openWeekIdx = 49;
STORES[46].openWeekIdx = 61;

export const storeById = new Map(STORES.map(s => [s.id, s]));
export const districtById = new Map(DISTRICTS.map(d => [d.id, d]));
export const regionById = new Map(REGIONS.map(r => [r.id, r]));
export const STATES = [...new Set(STORES.map(s => s.state))].sort();

export function storeHasDept(store: Store, dept: DeptId): boolean {
  if (dept === 'fuel') return store.hasFuel;
  if (dept === 'rx') return store.hasPharmacy;
  if (dept === 'starbucks') return store.hasStarbucks;
  return true;
}
