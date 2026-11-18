// Next-week scheduling changes · rolling 13 weeks (stakeholder request: "a rolling 13-week trend line that reflects the
// total schedule changes for the next week"; reference: Next Week Schedule Changes report, CRD tab and its Company
// chart). One line for the selected scope, one point per schedule week (Week Ending), Total Changes in net hours.
// Placed below Scheduling Changes in the Next week section only. Formulas and time rule: lib/scheduleTrend.ts.
// Synthetic data; source mapping pending (D41); time rule and partial point are design decisions (D42).
import {useMemo} from 'react';
import {CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {useReport} from '../app/state';
import type {Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {VisualFilters} from '../components/scope';
import {DecisionChip, InfoTip, VarianceText} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {SCHEDULE_HELP, SCHEDULE_TREND_HELP} from '../config/dailyReport';
import {CHANGE_DAYS} from '../data/scheduleChanges';
import {fmt, shortDay, usDate} from '../lib/format';
import {scheduleTrend, trendScopeName, type TrendPoint} from '../lib/scheduleTrend';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from './chartTheme';

const STATUS_LABEL = {final: 'Final', partial: 'Partial', unavailable: 'Not available'} as const;
const mmdd = (iso: string) => usDate(iso).slice(0, 5);
const weekTag = (p: TrendPoint) => `FY${p.fy} W${String(p.week).padStart(2, '0')}`;
const pctOf = (p: TrendPoint) => (p.total === null || !p.original ? null : p.total / p.original);

function statusText(p: TrendPoint): string {
  if (p.status === 'final') return `Final · ${CHANGE_DAYS} of ${CHANGE_DAYS} change days`;
  if (p.status === 'partial') return `Partial · ${p.capturedDays} of ${CHANGE_DAYS} change days, through ${usDate(p.asOf!)}`;
  return p.stores === 0 ? 'Not available · no schedule in scope' : 'Not available · no original schedule in scope';
}

/** Two-line tick: Week Ending MM/DD, then the fiscal week, so all 13 weeks stay labeled at narrow widths. */
function WeekTick({x, y, payload}: {x?: number; y?: number; payload?: {value: string}}) {
  const [date, wk] = (payload?.value ?? '').split(' ');
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill={C.axis}>
      <tspan x={x} dy={12}>
        {date}
      </tspan>
      <tspan x={x} dy={13} fill="#605e5c">
        {wk}
      </tspan>
    </text>
  );
}

export function ScheduleChangesTrend({scope, stores, week, cutoff}: {scope: Scope; stores: Set<string>; week: number; cutoff: number}) {
  const {role} = useReport();
  const points = useMemo(() => scheduleTrend(stores, week, cutoff), [stores, week, cutoff]);
  const name = trendScopeName(scope.filters, role, stores);
  const last = points[points.length - 1];
  const partial = last.status === 'partial';
  const unavailable = points.filter(p => p.status === 'unavailable');
  const first = points[0];

  // Final points form the solid line; a partial last point is joined to the previous final point by a dashed segment,
  // so final and partial values are never drawn as one series. Not available weeks are gaps (null), never 0.
  const data = useMemo(
    () =>
      points.map((p, i) => {
        const nextIsPartial = points[i + 1]?.status === 'partial';
        return {
          label: `${mmdd(p.weekEnding)} W${String(p.week).padStart(2, '0')}`,
          p,
          final: p.status === 'final' ? p.total : null,
          partial: p.status === 'partial' ? p.total : nextIsPartial && p.status === 'final' ? p.total : null,
        };
      }),
    [points],
  );

  const captureNote = `Each point is one schedule week: Week Ending is the week the schedule is for; its changes are captured from the original schedule (Friday, nine days before the week starts) through the Saturday before the week starts (weekly file date).`;
  const lastNote = partial
    ? `Last point (Week Ending ${usDate(last.weekEnding)}, the week in the Scheduling Changes table above) is partial: ${last.capturedDays} of ${CHANGE_DAYS} change days captured through ${usDate(last.asOf!)}, with Data through as selected. The remaining change days are not counted as 0. Move Data through to Friday or later to see it final.`
    : `Last point (Week Ending ${usDate(last.weekEnding)}) is the week in the Scheduling Changes table above, with all ${CHANGE_DAYS} change days captured; it equals that table's Total Changes.`;
  const notes = [captureNote, lastNote, 'Earlier weeks are read at their own last capture, not at the selected Data through day.', SCHEDULE_TREND_HELP.aggregation, SCHEDULE_HELP.pending, 'Store level: the Department filter does not apply.'];

  const columns: Column<TrendPoint>[] = [
    {key: 'week', header: 'Week Ending', sub: 'schedule week', value: p => p.w, exportValue: p => usDate(p.weekEnding), render: p => <>{usDate(p.weekEnding)}<span className="cell-sub">{weekTag(p)}{p.current ? ' · table week' : ''}</span></>, align: 'left'},
    {key: 'status', header: 'Status', help: SCHEDULE_TREND_HELP.status, value: p => STATUS_LABEL[p.status], exportValue: statusText, render: p => (p.status === 'final' ? 'Final' : <span className={p.status === 'partial' ? 'trend-partial' : 'na'}>{statusText(p)}</span>), align: 'left'},
    {key: 'total', header: 'Total Changes', sub: 'hrs, net', help: SCHEDULE_HELP.total, value: p => p.total, exportValue: p => p.total ?? 'Not available', render: p => (p.total === null ? <span className="na">Not available</span> : <VarianceText value={p.total} text={fmt.signedHours2(p.total)} />)},
    {key: 'pct', header: '% of original', help: SCHEDULE_TREND_HELP.pct, value: pctOf, render: p => fmt.signedPct(pctOf(p), 2)},
    {key: 'original', header: 'Original schedule', sub: 'hrs', value: p => p.original, render: p => fmt.hours2(p.original)},
    {key: 'oc', header: 'Original captured', value: p => p.originalCapture, exportValue: p => usDate(p.originalCapture), render: p => shortDay(p.originalCapture)},
    {key: 'file', header: 'Weekly file date', sub: 'last capture', help: SCHEDULE_TREND_HELP.fileDate, value: p => p.fileDate, exportValue: p => usDate(p.fileDate), render: p => shortDay(p.fileDate)},
    {key: 'stores', header: 'Stores added up', help: SCHEDULE_HELP.original, value: p => p.counted, exportValue: p => `${p.counted} of ${p.stores}`, render: p => `${p.counted} of ${p.stores}`},
  ];

  return (
    <VisualCard
      className="schedule-trend"
      title="Next-week scheduling changes · Rolling 13 weeks"
      subtitle={
        <>
          Total Changes in net scheduled hours for each schedule week · <b>{name}</b>
        </>
      }
      filters={<VisualFilters scope={scope} ignoreDept notes={notes} />}
      actions={<DecisionChip ids={['D41', 'D42']} label="Open" align="right" />}
    >
      <p className="table-scope">
        <b>Showing</b> {name} · Week Ending {usDate(first.weekEnding)} to {usDate(last.weekEnding)} · {points.filter(p => p.status === 'final').length} final weeks
        {partial ? ` · last week partial (${last.capturedDays} of ${CHANGE_DAYS} change days)` : ''} <InfoTip text={SCHEDULE_TREND_HELP.about} label="About the 13-week trend" align="right" />
      </p>
      <ChartKey items={[{label: 'Total Changes · final week', color: C.actual, kind: 'line'}, ...(partial ? [{label: `Partial week · ${last.capturedDays} of ${CHANGE_DAYS} change days so far`, color: C.reference, kind: 'dash' as const}] : [])]} />
      <div className="chart-h280" role="img" aria-label={`Line chart of Total Changes by schedule week for ${name}, Week Ending ${usDate(first.weekEnding)} to ${usDate(last.weekEnding)}. Values are listed in the table below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{top: 10, right: 16, left: 8, bottom: 0}}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={WeekTick} interval={0} height={38} />
            <YAxis tick={AXIS} width={56} tickFormatter={v => fmt.compact(v)} />
            <ReferenceLine y={0} stroke={C.benchmark} />
            <Tooltip
              cursor={{stroke: C.grid}}
              content={({active, payload}) => {
                const p = active ? (payload?.[0]?.payload?.p as TrendPoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <TipBox
                    title={`Week Ending ${usDate(p.weekEnding)} · ${weekTag(p)}`}
                    rows={[
                      {label: 'Total Changes (net)', value: p.total === null ? 'Not available' : `${fmt.signedHours2(p.total)} hrs`, swatch: p.status === 'partial' ? C.reference : C.actual},
                      {label: '% of original schedule', value: fmt.signedPct(pctOf(p), 2)},
                      {label: 'Status', value: p.status === 'partial' ? `Partial · ${p.capturedDays} of ${CHANGE_DAYS} days` : STATUS_LABEL[p.status]},
                      {label: 'Original captured', value: shortDay(p.originalCapture)},
                      {label: 'Weekly file date', value: shortDay(p.fileDate)},
                      {label: 'Stores added up', value: `${p.counted} of ${p.stores}`},
                    ]}
                    note={p.status === 'partial' ? `Captured through ${usDate(p.asOf!)}; later change days are not counted as 0.` : p.missingOriginal ? `${p.missingOriginal} ${p.missingOriginal === 1 ? 'store has' : 'stores have'} no original schedule and ${p.missingOriginal === 1 ? 'is' : 'are'} not added up.` : undefined}
                  />
                );
              }}
            />
            <Line dataKey="final" stroke={C.actual} strokeWidth={2.5} dot={{r: 3, fill: C.actual, strokeWidth: 0}} activeDot={{r: 5}} connectNulls={false} isAnimationActive={ANIMATE} />
            {partial ? (
              <Line
                dataKey="partial"
                stroke={C.reference}
                strokeWidth={2}
                strokeDasharray="5 4"
                connectNulls={false}
                isAnimationActive={ANIMATE}
                activeDot={false}
                dot={(d: {cx?: number; cy?: number; index?: number}) =>
                  d.index === points.length - 1 && d.cx !== undefined && d.cy !== undefined ? <circle key="partial-dot" cx={d.cx} cy={d.cy} r={4.5} fill="#fff" stroke={C.axis} strokeWidth={2} /> : <g key={`no-dot-${d.index}`} />
                }
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {unavailable.length ? (
        <p className="note" role="status">
          Not available: {unavailable.map(p => `Week Ending ${usDate(p.weekEnding)}`).join(', ')}. Shown as a gap, never as 0.
        </p>
      ) : null}
      <DataTable rows={points} columns={columns} rowKey={p => String(p.w)} label={`Next-week scheduling changes by schedule week, ${name}`} countNoun="weeks" initialSort={{key: 'week', dir: 'asc'}} exportName={`next-week-scheduling-changes-13-weeks-to-${usDate(last.weekEnding).replaceAll('/', '-')}`} exportNotes={[`Next-week scheduling changes · Rolling 13 weeks · ${name}`, ...notes, 'Illustrative synthetic data. Report reference: Next Week Schedule Changes report (CRD tab).']} />
    </VisualCard>
  );
}
