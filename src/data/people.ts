// Synthetic Workday-style associate records and UKG-style attendance incidents.
// Associates are ILLUSTRATIVE: they exist only so headcount snapshots, hires, terminations, turnover and
// retention can be computed with the right mechanics. The UI never shows an individual associate (D10).
import {LAST_WEEK_IDX, WEEKS, addDays, parseIso} from './calendar';
import {STORES, type DeptId} from './org';
import {STORE_DEPT_BASE} from './generate';
import {between, hashSeed, mulberry32} from '../lib/prng';

export const POSITIONS = ['Cashier', 'Clerk', 'Department Manager', 'Assistant Store Manager', 'Store Manager', 'Meat Cutter', 'Baker', 'Pharmacist', 'Pharmacy Technician', 'Barista'] as const;
export type Position = (typeof POSITIONS)[number];
export const AGE_RANGES = ['16–17', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
export const TENURE_BANDS = ['< 90 days', '90 days – 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'] as const;
export type TenureBand = (typeof TENURE_BANDS)[number];
/** Illustrative recruiter labels. Real recruiter data is sensitive and not yet shared. */
export const RECRUITERS = ['Recruiter A', 'Recruiter B', 'Recruiter C', 'Recruiter D', 'Recruiter E', 'Recruiter F'] as const;
export type Recruiter = (typeof RECRUITERS)[number];
export type EmploymentType = 'FT' | 'PT';

export type Associate = {
  store: string;
  dept: DeptId;
  position: Position;
  type: EmploymentType;
  recruiter: Recruiter;
  /** Age range is fixed per record in the prototype (bucket drift over two years is ignored). */
  age: AgeRange;
  hire: number; // epoch ms (UTC midnight)
  term: number | null;
};

const DAY = 86_400_000;
const START = parseIso(WEEKS[0].start);
const END = parseIso(WEEKS[LAST_WEEK_IDX].end);

function pick<T>(rnd: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

function positionForDept(dept: DeptId, rnd: () => number): Position {
  const roll = rnd();
  if (dept === 'frontend') return 'Cashier';
  if (dept === 'meat') return roll < 0.55 ? 'Meat Cutter' : 'Clerk';
  if (dept === 'bakery') return roll < 0.6 ? 'Baker' : 'Clerk';
  if (dept === 'rx') return roll < 0.35 ? 'Pharmacist' : 'Pharmacy Technician';
  if (dept === 'starbucks') return 'Barista';
  return 'Clerk';
}

function ageFor(type: EmploymentType, rnd: () => number): AgeRange {
  return type === 'PT'
    ? pick(rnd, [['16–17', 16], ['18–24', 34], ['25–34', 15], ['35–44', 10], ['45–54', 9], ['55–64', 10], ['65+', 6]])
    : pick(rnd, [['18–24', 8], ['25–34', 24], ['35–44', 24], ['45–54', 22], ['55–64', 17], ['65+', 5]]);
}

/** Average weekly productive hours used to size the roster (illustrative). */
const FT_WEEKLY_HOURS = 37;
const PT_WEEKLY_HOURS = 18.5;

function positionFor(dept: DeptId, type: EmploymentType, rnd: () => number): Position {
  if (type === 'FT' && rnd() < 0.16) return dept === 'rx' ? 'Pharmacist' : 'Department Manager';
  return positionForDept(dept, rnd);
}

/** The roster is sized from the synthetic labor facts: for each store × department, full-time and part-time
 *  headcount = hours of that employment type / typical weekly hours. Terminated associates are replaced in the
 *  same department and employment type, so row-level average productive hours stay coherent with the facts. */
function generateAssociates(): Associate[] {
  const out: Associate[] = [];
  STORES.forEach((store, si) => {
    const rnd = mulberry32(hashSeed(`people-${store.id}`));
    const recruiters = RECRUITERS.slice((si % 3) * 2, (si % 3) * 2 + 2) as Recruiter[];
    const slots = (STORE_DEPT_BASE.get(store.id) ?? []).flatMap(b => [
      {dept: b.dept, type: 'FT' as EmploymentType, target: Math.max(0, Math.round((b.hours * b.ftShare) / FT_WEEKLY_HOURS))},
      {dept: b.dept, type: 'PT' as EmploymentType, target: Math.max(1, Math.round((b.hours * (1 - b.ftShare)) / PT_WEEKLY_HOURS))},
    ]);
    const make = (dept: DeptId, type: EmploymentType, hire: number): Associate => ({store: store.id, dept, position: positionFor(dept, type, rnd), type, recruiter: recruiters[Math.floor(rnd() * recruiters.length)], age: ageFor(type, rnd), hire, term: null});
    const openMs = store.openWeekIdx > 0 ? parseIso(WEEKS[store.openWeekIdx].start) : START;
    const active = slots.map(() => [] as Associate[]);
    // Opening roster: tenure skewed short for part-time associates.
    slots.forEach((slot, k) => {
      for (let n = 0; n < slot.target; n++) {
        const a = make(slot.dept, slot.type, openMs);
        if (store.openWeekIdx === 0) {
          const years = slot.type === 'FT' ? -Math.log(1 - rnd()) * 7 : -Math.log(1 - rnd()) * 1.6;
          a.hire = openMs - Math.round(Math.min(years, 38) * 365) * DAY - DAY;
        } else a.hire = openMs - Math.floor(rnd() * 21) * DAY;
        active[k].push(a);
        out.push(a);
      }
    });
    // Weekly simulation: terminations, then replacement hires (seasonal part-time hiring before the holidays).
    for (let w = store.openWeekIdx; w <= LAST_WEEK_IDX; w++) {
      const weekStart = parseIso(WEEKS[w].start);
      const woy = WEEKS[w].week;
      const seasonal = woy >= 44 && woy <= 50 ? 1.08 : woy <= 3 ? 0.97 : 1;
      slots.forEach((slot, k) => {
        const list = active[k];
        for (let j = list.length - 1; j >= 0; j--) {
          const a = list[j];
          const tenureDays = (weekStart - a.hire) / DAY;
          const base = a.type === 'PT' ? 0.0115 : 0.0035;
          const p = base * (tenureDays < 90 ? 2.6 : tenureDays < 365 ? 1.3 : 0.7) * (woy <= 3 ? 1.5 : 1);
          if (rnd() < p) {
            a.term = weekStart + Math.floor(rnd() * 7) * DAY;
            list.splice(j, 1);
          }
        }
        const wanted = Math.round(slot.target * (slot.type === 'PT' ? seasonal : 1));
        while (list.length < wanted) {
          const a = make(slot.dept, slot.type, weekStart + Math.floor(rnd() * 7) * DAY);
          list.push(a);
          out.push(a);
        }
      });
    }
  });
  return out;
}

export const ASSOCIATES: readonly Associate[] = generateAssociates();
export const PEOPLE_END_MS = END;

export function tenureBand(hire: number, at: number): TenureBand {
  const days = (at - hire) / DAY;
  if (days < 90) return '< 90 days';
  if (days < 365) return '90 days – 1 year';
  if (days < 3 * 365) return '1–3 years';
  if (days < 5 * 365) return '3–5 years';
  if (days < 10 * 365) return '5–10 years';
  return '10+ years';
}

/** Attendance incident types listed in the workbook (R41). Their calculation is still to be confirmed (D22). */
export const INCIDENT_TYPES = ['Late In > 15 min', 'More than half shift unworked', 'Absent Unpaid Timecard', 'Absent Unpaid Exception', 'No Call No Show Timecard', 'Sick Unpaid Timecard'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
/** Illustrative incident probability per associate per active week. */
const INCIDENT_RATE: Record<IncidentType, number> = {
  'Late In > 15 min': 0.07,
  'More than half shift unworked': 0.009,
  'Absent Unpaid Timecard': 0.018,
  'Absent Unpaid Exception': 0.008,
  'No Call No Show Timecard': 0.005,
  'Sick Unpaid Timecard': 0.014,
};

/** One ILLUSTRATIVE attendance incident of one associate in one week (UKG-style event). The incident is
 *  attributed to the associate's home store and department, the same rule used for hours (D06 open). The
 *  incident calculation itself is still to be confirmed (D22); this model does not prove source availability. */
export type AttendanceFact = {w: number; store: string; dept: DeptId; associate: number; type: IncidentType};

function generateAttendance(): AttendanceFact[] {
  const out: AttendanceFact[] = [];
  const propensity = new Map(STORES.map(s => {
    const r = mulberry32(hashSeed(`attendance-${s.id}`));
    return [s.id, between(r, 0.7, 1.45)];
  }));
  const weekEnd = WEEKS.map(w => parseIso(w.end));
  ASSOCIATES.forEach((a, idx) => {
    const rnd = mulberry32(hashSeed(`attendance-${idx}`));
    const base = (propensity.get(a.store) ?? 1) * (a.type === 'PT' ? 1.15 : 0.85);
    for (let w = 0; w <= LAST_WEEK_IDX; w++) {
      const ms = weekEnd[w];
      if (a.hire > ms) continue;
      if (a.term !== null && a.term <= ms) break;
      const winter = WEEKS[w].week <= 9 || WEEKS[w].week >= 49 ? 1.25 : 1;
      const newHire = ms - a.hire < 90 * DAY ? 1.4 : 1;
      for (const type of INCIDENT_TYPES) {
        if (rnd() < INCIDENT_RATE[type] * base * winter * newHire) out.push({w, store: a.store, dept: a.dept, associate: idx, type});
      }
    }
  });
  return out;
}

export const ATTENDANCE_FACTS: readonly AttendanceFact[] = generateAttendance();

/** Snapshot date for the end of a week index (Saturday). */
export const weekEndMs = (idx: number) => parseIso(WEEKS[idx].end);
/** Snapshot date for the day before a week index starts (beginning-of-time-frame headcount). */
export const beforeWeekMs = (idx: number) => parseIso(addDays(WEEKS[idx].start, -1));
