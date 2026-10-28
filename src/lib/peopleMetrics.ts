// People measures from the synthetic associate records. Headcount is a SNAPSHOT (active on a date):
// it is never summed across weeks. Hires and terminations are EVENTS counted inside the time frame.
// Turnover, retention and average headcount follow the workbook drafts; OPS 201 is pending (D12, D27).
import {WEEKS} from '../data/calendar';
import {storeById, type DeptId} from '../data/org';
import {ASSOCIATES, beforeWeekMs, tenureBand, weekEndMs, type Associate} from '../data/people';
import {avgHeadcount, headcountShare, retentionRate, turnoverRate} from './metrics';
import {ALL, type Filters} from './filters';

export type PeopleTotals = {
  begin: number;
  end: number;
  hires: number;
  terms: number;
  /** Terminations of associates who were active at the start of the time frame (retention numerator input). */
  termsOfBeginning: number;
  ftEnd: number;
  ptEnd: number;
  ftAvg: number;
  ptAvg: number;
};

export const emptyPeople = (): PeopleTotals => ({begin: 0, end: 0, hires: 0, terms: 0, termsOfBeginning: 0, ftEnd: 0, ptEnd: 0, ftAvg: 0, ptAvg: 0});

export type PeopleFilter = Pick<Filters, 'position' | 'tenure' | 'age' | 'recruiter'> & {dept: 'All' | DeptId};

const activeAt = (a: Associate, ms: number) => a.hire <= ms && (a.term === null || a.term > ms);

export type PeopleGroup = 'none' | 'store' | 'district' | 'region' | 'state' | 'recruiter' | 'age' | 'tenure' | 'position' | 'type' | 'dept';

/** Tenure is evaluated at the event or snapshot date (hires are always "< 90 days"). */
function groupKey(g: PeopleGroup, a: Associate, at: number): string {
  switch (g) {
    case 'none':
      return 'all';
    case 'store':
      return a.store;
    case 'district':
      return storeById.get(a.store)?.districtId ?? '';
    case 'region':
      return storeById.get(a.store)?.regionId ?? '';
    case 'state':
      return storeById.get(a.store)?.state ?? '';
    case 'recruiter':
      return a.recruiter;
    case 'age':
      return a.age;
    case 'tenure':
      return tenureBand(a.hire, at);
    case 'position':
      return a.position;
    case 'type':
      return a.type;
    case 'dept':
      return a.dept;
  }
}

/** Rolls people measures for [from, to] week indexes. */
export function peopleRollup(stores: Set<string>, f: PeopleFilter, from: number, to: number, group: PeopleGroup = 'none'): Map<string, PeopleTotals> {
  const start = beforeWeekMs(from);
  const end = weekEndMs(to);
  const endExclusive = end + 86_400_000;
  const startExclusive = start + 86_400_000;
  const out = new Map<string, PeopleTotals>();
  const get = (k: string) => {
    let t = out.get(k);
    if (!t) out.set(k, (t = emptyPeople()));
    return t;
  };
  const passes = (a: Associate, at: number) => f.tenure === ALL || tenureBand(a.hire, at) === f.tenure;
  for (const a of ASSOCIATES) {
    if (!stores.has(a.store)) continue;
    if ((f.dept !== 'All' && a.dept !== f.dept) || (f.position !== ALL && a.position !== f.position) || (f.age !== ALL && a.age !== f.age) || (f.recruiter !== ALL && a.recruiter !== f.recruiter)) continue;
    const wasActive = activeAt(a, start);
    if (wasActive && passes(a, start)) {
      const t = get(groupKey(group, a, start));
      t.begin++;
      if (a.term !== null && a.term >= startExclusive && a.term < endExclusive) t.termsOfBeginning++;
      if (a.type === 'FT') t.ftAvg += 0.5;
      else t.ptAvg += 0.5;
    }
    if (activeAt(a, end) && passes(a, end)) {
      const t = get(groupKey(group, a, end));
      t.end++;
      if (a.type === 'FT') {
        t.ftEnd++;
        t.ftAvg += 0.5;
      } else {
        t.ptEnd++;
        t.ptAvg += 0.5;
      }
    }
    if (a.hire >= startExclusive && a.hire < endExclusive && passes(a, a.hire)) get(groupKey(group, a, a.hire)).hires++;
    if (a.term !== null && a.term >= startExclusive && a.term < endExclusive && passes(a, a.term)) get(groupKey(group, a, a.term)).terms++;
  }
  return out;
}

export const peopleTotal = (stores: Set<string>, f: PeopleFilter, from: number, to: number) => peopleRollup(stores, f, from, to).get('all') ?? emptyPeople();

export function peopleKpis(t: PeopleTotals) {
  return {
    begin: t.begin,
    end: t.end,
    avg: avgHeadcount(t.begin, t.end),
    hires: t.hires,
    terms: t.terms,
    turnover: turnoverRate(t.terms, t.begin, t.end),
    retention: retentionRate(t.begin, t.termsOfBeginning),
    ftShare: headcountShare(t.ftEnd, t.ftEnd, t.ptEnd),
    ptShare: headcountShare(t.ptEnd, t.ftEnd, t.ptEnd),
  };
}
export type PeopleKpis = ReturnType<typeof peopleKpis>;

/** Calendar periods (4-4-5) overlapping a week range, for trend charts. */
export function periodsIn(from: number, to: number): {key: string; label: string; from: number; to: number}[] {
  const out: {key: string; label: string; from: number; to: number}[] = [];
  for (let w = from; w <= to; w++) {
    const info = WEEKS[w];
    const key = `${info.fy}-P${String(info.period).padStart(2, '0')}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.to = w;
    else out.push({key, label: `P${info.period} FY${String(info.fy).slice(2)}`, from: w, to: w});
  }
  return out;
}
