// Scheduling Changes for next and future week, as in the district Daily Labor Update (DMEmailBody "Next / Future
// Week Schedule Changes"): Completed on-time, original schedule, daily net changes, Total Changes; Region › District ›
// Store with a Total of the scope. Formulas: lib/scheduleChanges.ts. Synthetic data; source mapping pending (D41).
import {useMemo} from 'react';
import type {Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {VisualFilters} from '../components/scope';
import {DecisionChip, InfoTip, VarianceText} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {SCHEDULE_HELP} from '../config/dailyReport';
import {DAY_NAMES} from '../data/calendar';
import {reportWeekDates} from '../data/dailyReport';
import {CHANGE_DAYS} from '../data/scheduleChanges';
import {fmt, shortDay, usDate} from '../lib/format';
import {buildOrgTree, onlyChildIds, scopeLabel, type OrgNode} from '../lib/orgTree';
import {captureState, scheduleRollup, SCHEDULE_OFFSET, type ScheduleSection, type ScheduleTotals} from '../lib/scheduleChanges';

type Row = OrgNode<ScheduleTotals>;
const POSTED_LABEL = {yes: 'Yes', no: 'No', none: 'Did not respond'} as const;
const notCaptured = <span className="na" title="Not captured yet">—</span>;
const unavailable = <span className="na" title="The store is missing from the original schedule capture">Unavailable</span>;
const mmdd = (iso: string) => usDate(iso).slice(0, 5);
const weekday = (iso: string) => shortDay(iso).slice(0, 3);

export function SchedulingChanges({scope, stores, week, cutoff, section}: {scope: Scope; stores: Set<string>; week: number; cutoff: number; section: ScheduleSection}) {
  const st = useMemo(() => captureState(week, cutoff, section), [week, cutoff, section]);
  const target = reportWeekDates(week + SCHEDULE_OFFSET[section]);
  const levels = useMemo(
    () => ({
      store: scheduleRollup(stores, week, cutoff, section, 'store'),
      district: scheduleRollup(stores, week, cutoff, section, 'district'),
      region: scheduleRollup(stores, week, cutoff, section, 'region'),
      total: scheduleRollup(stores, week, cutoff, section, 'none').get('all'),
    }),
    [stores, week, cutoff, section],
  );
  const rows: Row[] = useMemo(() => buildOrgTree(stores, {region: id => levels.region.get(id), district: id => levels.district.get(id), store: id => levels.store.get(id)}), [stores, levels]);
  const autoOpen = useMemo(() => onlyChildIds(rows), [rows]);
  const tree = useMemo(() => ({children: (r: Row) => r.children, levels: ['Region', 'District', 'Store'], name: (r: Row) => r.name, defaultOpen: (r: Row) => autoOpen.has(r.id)}), [autoOpen]);
  const total = levels.total;
  if (!total) return null;

  const where = scopeLabel(stores);
  const label = section === 'next' ? 'Next week' : 'Future week';
  const capturedDays = st.captured.filter(Boolean).length;
  const dataThrough = new Date(Date.parse(`${reportWeekDates(week).start}T00:00:00Z`) + cutoff * 86_400_000).toISOString().slice(0, 10);
  const isStore = (r: Row) => r.level === 'store';
  /** Why a value is missing: not captured yet (dates) or unavailable (store missing from the original capture). */
  const missing = (captured: boolean) => (!captured ? notCaptured : unavailable);
  const missingText = (captured: boolean) => (!captured ? 'Not captured yet' : 'Unavailable');

  const columns: Column<Row>[] = [
    {key: 'name', header: 'Region / District / Store', value: r => r.name, render: r => (r.sub ? <>{r.name}<span className="cell-sub">{r.sub}</span></> : r.name), align: 'left'},
    {
      key: 'posted',
      header: 'Completed on-time (Y/N)',
      sub: 'Yes count above store',
      help: SCHEDULE_HELP.posted,
      value: r => (isStore(r) ? (r.data.posted === null ? null : r.data.posted === 'yes' ? 1 : 0) : st.responsesDue ? r.data.postedYes : null),
      exportValue: r => (isStore(r) ? (r.data.posted === null ? 'Not due yet' : POSTED_LABEL[r.data.posted]) : st.responsesDue ? r.data.postedYes : 'Not due yet'),
      render: r => (!st.responsesDue ? <span className="na" title="Responses are due the day before the original schedule is captured">Not due yet</span> : isStore(r) ? POSTED_LABEL[r.data.posted!] : `${r.data.postedYes} of ${r.data.stores}`),
      align: 'left',
    },
    {
      key: 'original',
      header: 'Original schedule',
      sub: `hrs · ${weekday(st.original)} ${mmdd(st.original)}`,
      help: SCHEDULE_HELP.original,
      value: r => r.data.original,
      exportValue: r => r.data.original ?? missingText(st.originalCaptured),
      render: r => (r.data.original === null ? missing(st.originalCaptured) : fmt.hours2(r.data.original)),
    },
    ...st.changes.map(
      (d, i): Column<Row> => ({
        key: `c${i}`,
        header: weekday(d),
        sub: mmdd(d),
        help: i === 0 ? SCHEDULE_HELP.change : undefined,
        group: 'Daily changes in scheduled hours',
        value: r => r.data.changes[i],
        exportValue: r => r.data.changes[i] ?? missingText(st.captured[i] && st.originalCaptured),
        render: r => (r.data.changes[i] === null ? missing(st.captured[i] && st.originalCaptured) : <VarianceText value={r.data.changes[i]} text={fmt.signedHours2(r.data.changes[i])} />),
      }),
    ),
    {
      key: 'total',
      header: 'Total Changes',
      sub: 'hrs, net',
      help: SCHEDULE_HELP.total,
      value: r => r.data.total,
      exportValue: r => r.data.total ?? missingText(st.originalCaptured),
      render: r => (r.data.total === null ? missing(st.originalCaptured) : <VarianceText value={r.data.total} text={fmt.signedHours2(r.data.total)} />),
    },
    {
      key: 'updated',
      header: 'Updated schedule',
      sub: `hrs · as of ${mmdd(st.run)}`,
      help: SCHEDULE_HELP.updated,
      value: r => r.data.updated,
      exportValue: r => r.data.updated ?? missingText(st.originalCaptured),
      render: r =>
        r.data.updated === null ? (
          missing(st.originalCaptured)
        ) : isStore(r) && r.data.missingOriginal ? (
          <span title="Latest captured schedule; not included in the totals because the original schedule is unavailable">{fmt.hours2(r.data.updated)}*</span>
        ) : (
          fmt.hours2(r.data.updated)
        ),
    },
  ];
  const totalRow: Row = {id: 'total', level: 'region', name: 'Total', sub: '', search: '', dept: null, storeIds: [...stores], data: total, children: []};
  const pct = total.original ? (total.total ?? 0) / total.original : null;
  // Same state as the waiting note below: "capture expected" until the original schedule has been captured.
  const captureLine = `Original schedule ${st.originalCaptured ? 'captured' : 'capture expected'} ${shortDay(st.original)} at 10:30 · change days ${shortDay(st.changes[0])} to ${shortDay(st.changes[CHANGE_DAYS - 1])} · report run ${shortDay(st.run)} (day after Data through)`;
  const exportNotes = [`${label} · Week Ending ${usDate(target.end)} · Scheduling Changes`, captureLine, `Location: ${where}`, 'Net change in total store scheduled hours: positive = hours added, negative = hours removed. Rows above store level add only stores with an original schedule.', 'Illustrative synthetic data. Report reference: Daily Labor Update, district email.'];

  return (
    <VisualCard
      className="schedule-changes"
      title={`Scheduling Changes · ${label} · Week Ending ${usDate(target.end)}`}
      subtitle="Net hours added or removed since the originally published schedule, by region, district and store, as in the district Daily Labor Update. Original and updated schedules are store schedules, not Budget, MDoc or Chain Forecast."
      filters={<VisualFilters scope={scope} ignoreDept notes={[captureLine, SCHEDULE_HELP.capture, SCHEDULE_HELP.pending, 'Store level: the Department filter does not apply.', 'A capture not taken yet shows —; a store missing from the original capture shows Unavailable; 0 means the schedule was captured with no change.']} />}
      actions={<DecisionChip ids={['D41']} label="Source pending" align="right" />}
    >
      <p className="table-scope">
        <b>Showing</b> {where} · {captureLine} <InfoTip text={SCHEDULE_HELP.section} label="About Scheduling Changes" align="right" />
      </p>
      {!st.originalCaptured ? (
        <p className="note sched-wait" role="status">
          The original {label.toLowerCase()} schedule is captured on {DAY_NAMES[5]} {usDate(st.original)} at 10:30. With data through {usDate(dataThrough)} (report run {usDate(st.run)}), it has not been captured yet, so no changes can be shown. Move Data through to Thursday or later to see it.
        </p>
      ) : (
        <dl className="sched-summary" aria-label="Scheduling Changes summary">
          <div>
            <dt>Total Changes · {capturedDays} of {CHANGE_DAYS} change days captured</dt>
            <dd>
              <VarianceText value={total.total} text={`${fmt.signedHours2(total.total)} hrs`} /> <span className="cell-sub">{pct === null ? 'n/a' : `${fmt.signedPct(pct, 2)} of the original schedule`}</span>
            </dd>
          </div>
          <div>
            <dt>Original → updated schedule</dt>
            <dd>
              {fmt.hours2(total.original)} → {fmt.hours2(total.updated)} hrs
            </dd>
          </div>
          <div>
            <dt>Stores by net change</dt>
            <dd>
              {total.netUp} net added · {total.netDown} net removed · {total.netZero} no change
            </dd>
          </div>
          <div>
            <dt>Original schedule unavailable</dt>
            <dd>{total.missingOriginal === 0 ? 'None' : `${total.missingOriginal} ${total.missingOriginal === 1 ? 'store' : 'stores'}, not in the totals`}</dd>
          </div>
        </dl>
      )}
      <DataTable rows={rows} columns={columns} rowKey={r => r.id} label={`Scheduling Changes, ${label.toLowerCase()}, by region, district and store`} searchText={r => r.search} searchPlaceholder="Search region, district or store…" countNoun={rows.length === 1 ? 'region' : 'regions'} tree={tree} pinned={[totalRow]} pinnedLabel={() => `Total · ${where}`} exportName={`daily-labor-update-schedule-changes-${section}-week-ending-${usDate(target.end).replaceAll('/', '-')}`} exportNotes={exportNotes} maxHeight={480} />
    </VisualCard>
  );
}
