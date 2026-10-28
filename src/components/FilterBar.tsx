import {useEffect, useId, useState, type ReactNode} from 'react';
import {useReport} from '../app/state';
import type {PageMeta} from '../app/pages';
import {LAST_WEEK_IDX, WEEKS} from '../data/calendar';
import {DEPARTMENTS, DISTRICTS, GEOGRAPHIES, REGIONS, STATES} from '../data/org';
import {AGE_RANGES, POSITIONS, RECRUITERS, TENURE_BANDS} from '../data/people';
import {ALL, calendarUnits, changedFilters, DEFAULT_TIME, FISCAL_YEARS, resolveTime, ROLLING, storesForRole, TO_DATE_SPANS, type TimeMode, type TimeSelection} from '../lib/filters';
import {usDate} from '../lib/format';
import {InfoTip, Segmented} from './ui';

function Field({label, children}: {label: string; children: (id: string) => ReactNode}) {
  const id = useId();
  return (
    <div className="fb-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

const TIME_MODES: {id: TimeMode; label: string}[] = [
  // Mode labels reused from UC1 (BC3); "Week Beginning" is the workbook filter name.
  {id: 'todate', label: 'To Date'},
  {id: 'rolling', label: 'Rolling'},
  {id: 'calendar', label: 'Fiscal Calendar'},
  {id: 'week', label: 'Week Beginning'},
  {id: 'custom', label: 'Custom'},
];

const COVERAGE = `Synthetic data from ${usDate(WEEKS[0].start)} to ${usDate(WEEKS[LAST_WEEK_IDX].end)} (FY2025 W01 – FY2026 W43). Weeks run Sunday–Saturday on the 4-4-5 calendar implemented in UC1 and in the Ops date table; UC5 confirmation is pending (D18). 53-week years are not modeled.`;

/** Report filter bar (BC3 pattern): time row, location row, More filters, Reset and the comparison reference. */
export function FilterBar({page}: {page: PageMeta}) {
  const {filters, role, update, reset} = useReport();
  const [more, setMore] = useState(false);
  const visible = storesForRole(role);
  const regions = REGIONS.filter(r => visible.some(s => s.regionId === r.id));
  const districts = DISTRICTS.filter(d => visible.some(s => s.districtId === d.id) && (filters.region === ALL || d.regionId === filters.region));
  const stores = visible.filter(s => (filters.region === ALL || s.regionId === filters.region) && (filters.district === ALL || s.districtId === filters.district));
  const changed = changedFilters(filters);
  const moreCount = changed.filter(k => ['state', 'geography'].includes(k) || (k === 'idOnly' && page.filters.idStores) || (page.filters.people as string[]).includes(k)).length;
  const locked = role.kind !== 'regional';
  const timeChanged = JSON.stringify(filters.time) !== JSON.stringify(DEFAULT_TIME);

  return (
    <div className="filter-bar" role="region" aria-label="Report filters">
      {page.filters.time ? <TimeRow /> : null}
      <div className="fb-row">
        <span className="fb-heading">Business</span>
        {page.filters.department ? (
          <Field label="Department">
            {id => (
              <select id={id} value={filters.dept} onChange={e => update({dept: e.target.value as typeof filters.dept})}>
                <option value={ALL}>All departments</option>
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <div className="fb-field fb-chain">
          <span className="fb-label">Chain</span>
          <span className="fb-static">Weis Markets</span>
        </div>
        <Field label="Region">
          {id => (
            <select id={id} value={filters.region} onChange={e => update({region: e.target.value, district: ALL, store: ALL})} disabled={regions.length <= 1 && locked}>
              {regions.length > 1 || !locked ? <option value={ALL}>All regions</option> : null}
              {regions.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="District">
          {id => (
            <select id={id} value={filters.district} onChange={e => update({district: e.target.value, store: ALL})} disabled={role.kind === 'store'}>
              {role.kind !== 'store' ? <option value={ALL}>All districts</option> : null}
              {districts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Store">
          {id => (
            <select id={id} value={filters.store} onChange={e => update({store: e.target.value})}>
              {role.kind !== 'store' ? <option value={ALL}>All stores</option> : null}
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button type="button" className={`fb-more${moreCount ? ' has-value' : ''}`} aria-expanded={more} onClick={() => setMore(m => !m)}>
          More filters{moreCount ? ` (${moreCount})` : ''} {more ? '▴' : '▾'}
        </button>
        <button type="button" className="fb-reset" onClick={reset} disabled={changed.length === 0 && !timeChanged}>
          Reset filters
        </button>
      </div>
      {more ? (
        <div className="fb-row fb-more-row">
          <span className="fb-heading">More</span>
          <Field label="State">
            {id => (
              <select id={id} value={filters.state} onChange={e => update({state: e.target.value})}>
                <option value={ALL}>All states</option>
                {STATES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Geography (illustrative)">
            {id => (
              <select id={id} value={filters.geography} onChange={e => update({geography: e.target.value})}>
                <option value={ALL}>All market areas</option>
                {GEOGRAPHIES.map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {page.filters.idStores ? (
            <>
              <div className="fb-field">
                <span className="fb-label">Stores</span>
                <Segmented label="All stores or ID stores" value={filters.idOnly ? 'id' : 'all'} options={[{id: 'all', label: 'All stores'}, {id: 'id', label: 'ID stores'}]} onChange={v => update({idOnly: v === 'id'})} size="sm" />
              </div>
              <InfoTip text="Illustrative eligibility: the UC1 five-full-fiscal-quarter rule is used as a reference on synthetic store dates. Ops ID-store eligibility is still open (D07); Accounting's rule is unchanged and not modeled here." label="About ID stores" align="left" />
            </>
          ) : null}
          {page.filters.people.includes('position') ? <PeopleSelect label="Position" value={filters.position} options={POSITIONS} onChange={v => update({position: v})} /> : null}
          {page.filters.people.includes('tenure') ? <PeopleSelect label="Tenure" value={filters.tenure} options={TENURE_BANDS} onChange={v => update({tenure: v})} /> : null}
          {page.filters.people.includes('age') ? <PeopleSelect label="Age range" value={filters.age} options={AGE_RANGES} onChange={v => update({age: v})} /> : null}
          {page.filters.people.includes('recruiter') ? <PeopleSelect label="Recruiter (illustrative)" value={filters.recruiter} options={RECRUITERS} onChange={v => update({recruiter: v})} /> : null}
          {page.filters.people.length ? (
            <p className="fb-note">
              People filters apply to people measures and to labor actuals (hours, spend, overtime, vacation) through associate hours. Budget, sales and items are not set by associate, so they are not filtered.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PeopleSelect({label, value, options, onChange, disabled = false}: {label: string; value: string; options: readonly string[]; onChange: (v: string) => void; disabled?: boolean}) {
  return (
    <Field label={label}>
      {id => (
        <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
          <option value={ALL}>All</option>
          {options.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function TimeRow() {
  const {filters, update} = useReport();
  const [draft, setDraft] = useState<TimeSelection>(filters.time);
  useEffect(() => setDraft(filters.time), [filters.time]);
  const resolved = resolveTime(draft);
  const set = (patch: Partial<TimeSelection>) => {
    const next = {...draft, ...patch};
    setDraft(next);
    if (resolveTime(next).ok) update({time: next});
  };
  const weeksDesc = [...WEEKS].reverse();

  return (
    <div className="fb-row">
      <span className="fb-heading fb-time-heading">
        Time frame
        <InfoTip text={COVERAGE} label="Data coverage" align="left" />
      </span>
      <Segmented label="Time frame mode" value={draft.mode} options={TIME_MODES} onChange={mode => set({mode})} size="sm" />
      {draft.mode === 'todate' ? (
        <Field label="Period">
          {id => (
            <select id={id} value={draft.span} onChange={e => set({span: e.target.value as TimeSelection['span']})}>
              <option value="TODAY" disabled>
                Today · day level: see Daily Labor vs Budget
              </option>
              {TO_DATE_SPANS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {draft.mode === 'rolling' ? (
        <Field label="Window">
          {id => (
            <select id={id} value={draft.rolling} onChange={e => set({rolling: Number(e.target.value) as TimeSelection['rolling']})}>
              {ROLLING.map(n => (
                <option key={n} value={n}>
                  Last {n} weeks
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {draft.mode === 'calendar' ? (
        <>
          <Field label="Fiscal Year">
            {id => (
              <select id={id} value={draft.fy} onChange={e => set({fy: Number(e.target.value), unit: 'FY'})}>
                {FISCAL_YEARS.map(fy => (
                  <option key={fy} value={fy}>
                    FY{fy}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Period / Quarter">
            {id => (
              <select id={id} value={draft.unit} onChange={e => set({unit: e.target.value})}>
                {calendarUnits(draft.fy).map(u => (
                  <option key={u.id} value={u.id} disabled={!u.available}>
                    {u.label}
                    {u.available ? '' : ' · no data yet'}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      ) : null}
      {draft.mode === 'week' ? (
        <Field label="Week Beginning">
          {id => (
            <select id={id} value={draft.week} onChange={e => set({week: Number(e.target.value)})}>
              {weeksDesc.map(w => (
                <option key={w.idx} value={w.idx}>
                  {usDate(w.start)} · FY{w.fy} W{String(w.week).padStart(2, '0')}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {draft.mode === 'custom' ? (
        <>
          <Field label="From">{id => <input id={id} type="date" value={draft.from} min={WEEKS[0].start} max={WEEKS[LAST_WEEK_IDX].end} onChange={e => set({from: e.target.value})} />}</Field>
          <Field label="To">{id => <input id={id} type="date" value={draft.to} min={WEEKS[0].start} max={WEEKS[LAST_WEEK_IDX].end} onChange={e => set({to: e.target.value})} />}</Field>
        </>
      ) : null}
      {resolved.ok ? (
        <output className="fb-resolved">
          {resolved.detail}
          {draft.mode === 'custom' ? ' · snapped to whole weeks' : ''}
          {resolved.partial ? ' · in progress' : ''}
        </output>
      ) : (
        <p className="fb-error" role="alert">
          {resolved.error} The previous time frame is still applied.
        </p>
      )}
    </div>
  );
}
