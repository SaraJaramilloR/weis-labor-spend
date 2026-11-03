// "History by department" inside the AIV & estimated inflation section of Store Ops Labor Allocation (review request,
// Speaker 4 20:59–22:39, Speaker 6 22:55; OPS111 is the reference). Placing it here is a design choice. One selected
// department or the aggregate scope at a time, never one line per department. One measure at a time, so dollars,
// percentages and AIV never share an axis.
import {useId, useMemo, useState} from 'react';
import {Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {deptLabel, type Scope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {InfoTip, Segmented} from '../components/ui';
import {WEEKS} from '../data/calendar';
import {DEPARTMENTS, type DeptId} from '../data/org';
import {emptyLabor, rollup, type LaborTotals} from '../lib/aggregate';
import {AIV_SCOPES, aivActual, aivRef, historyRange, measureValue, scopeRange, type AivCompare, type AivMeasure, type AivScope} from '../lib/aivHistory';
import {ALL} from '../lib/filters';
import {fmt, usDate} from '../lib/format';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from './chartTheme';

const AIV_HELP = {
  aiv: 'Average Item Value (AIV) = Gross Sales / Items sold, for the same stores, department and weeks.',
  tyly: 'TY = this year. LY = last year: the same fiscal weeks one year earlier (364 days).',
  infPct: 'Estimated Inflation (%) = (AIV TY − AIV LY) / AIV LY (OPS111 "Avg Item Value % Value vs LY (INF)"). It is an estimate from the change in average item value, so it also moves with product mix, promotions and weighed items; it is not item-level price inflation.',
  infValue: "Estimated Inflation Dollar Value = (AIV TY − AIV LY) × Items sold TY (OPS111 \"INF $ Value\"): the part of the sales change explained by the change in average item value at this year's volume. An arithmetic split, not a proven price effect.",
  scopes: 'LW = last week of the selected time frame. PTD = period to date, QTD = quarter to date, YTD = year to date: from the start of that fiscal period, quarter or year to the same week (OPS111 Last Week, Period / Quarter / Year to Date).',
  budget: 'Budget comparison: AIV Budget = Sales Budget / Items Budget (OPS111 Dept_Bud and INFvsBud_Trend). An additional comparison supported by OPS111, not an individually approved client request; the Budget vs MDoc reference is open (D01).',
} as const;

const MEASURES: {id: AivMeasure; label: string}[] = [
  {id: 'aiv', label: 'Average Item Value'},
  {id: 'infPct', label: 'Estimated Inflation (%)'},
  {id: 'infValue', label: 'Estimated Inflation ($)'},
];
const SCOPE_LABEL: Record<AivScope, string> = {LW: 'Last week (LW)', PTD: 'Period to date (PTD)', QTD: 'Quarter to date (QTD)', YTD: 'Year to date (YTD)'};

type Row = {id: 'all' | DeptId; name: string; byScope: Record<AivScope, LaborTotals>};

/** Totals of each summary scope (LW, PTD, QTD, YTD) by department, anchored on the same week. */
function scopeTotals(stores: Set<string>, dept: 'All' | DeptId, anchor: number, group: 'dept' | 'none') {
  return AIV_SCOPES.map(sc => {
    const [a, b] = scopeRange(sc, anchor);
    return rollup(stores, dept, a, b, group);
  });
}

export function AivHistory({scope}: {scope: Scope}) {
  const [measure, setMeasure] = useState<AivMeasure>('infPct');
  const [cmp, setCmp] = useState<AivCompare>('ly');
  const [localDept, setLocalDept] = useState<'all' | DeptId>('all');
  const deptId = useId();
  const locked = scope.dept !== ALL;
  // The page Department filter wins; otherwise the local selector picks one department or the aggregate.
  const dept: 'All' | DeptId = locked ? scope.dept : localDept === 'all' ? ALL : localDept;
  const anchor = scope.to;
  const [hFrom, hTo] = historyRange(anchor);
  const refLabel = cmp === 'ly' ? 'LY' : 'Budget';
  const isAiv = measure === 'aiv';
  const measureLabel = MEASURES.find(m => m.id === measure)!.label;

  const weekly = useMemo(() => rollup(scope.stores, dept, hFrom, hTo, 'week'), [scope.stores, dept, hFrom, hTo]);
  const points = useMemo(
    () =>
      [...weekly.entries()]
        .map(([w, r]) => {
          const info = WEEKS[Number(w)];
          return {w: Number(w), label: `W${String(info.week).padStart(2, '0')} FY${String(info.fy).slice(2)}`, end: info.end, items: r.labor.items, actual: aivActual(r.labor), ref: aivRef(r.labor, cmp), value: measureValue(r.labor, measure, cmp)};
        })
        .sort((a, b) => a.w - b.w),
    [weekly, measure, cmp],
  );

  const rows: Row[] = useMemo(() => {
    const maps = scopeTotals(scope.stores, scope.dept, anchor, 'dept');
    return DEPARTMENTS.filter(d => maps[3].get(d.id)?.labor.items).map(d => ({
      id: d.id,
      name: d.name,
      byScope: Object.fromEntries(AIV_SCOPES.map((sc, i) => [sc, maps[i].get(d.id)?.labor ?? emptyLabor()])) as Record<AivScope, LaborTotals>,
    }));
  }, [scope.stores, scope.dept, anchor]);
  const totalRow: Row = useMemo(() => {
    const maps = scopeTotals(scope.stores, scope.dept, anchor, 'none');
    const byScope = Object.fromEntries(AIV_SCOPES.map((sc, i) => [sc, maps[i].get('all')?.labor ?? emptyLabor()])) as Record<AivScope, LaborTotals>;
    return {id: 'all', name: locked ? deptLabel(scope.dept) : 'All departments in scope', byScope};
  }, [scope.stores, scope.dept, anchor, locked]);

  const fmtMeasure = (v: number | null) => (isAiv ? fmt.money2(v) : measure === 'infPct' ? fmt.signedPct(v, 2) : fmt.signedCompactMoney(v));
  const columns: Column<Row>[] = [
    {key: 'name', header: 'Department', value: r => r.name, align: 'left'},
    ...AIV_SCOPES.map(sc => ({
      key: sc,
      header: sc,
      sub: isAiv ? `AIV TY · ${refLabel} below` : `vs ${refLabel}`,
      help: `${SCOPE_LABEL[sc]}, through Week Ending ${usDate(WEEKS[anchor].end)}. ${AIV_HELP.scopes}`,
      value: (r: Row) => measureValue(r.byScope[sc], measure, cmp),
      render: (r: Row) =>
        isAiv ? (
          <>
            {fmt.money2(aivActual(r.byScope[sc]))}
            <span className="cell-sub">
              {refLabel} {fmt.money2(aivRef(r.byScope[sc], cmp))}
            </span>
          </>
        ) : (
          fmtMeasure(measureValue(r.byScope[sc], measure, cmp))
        ),
    })),
  ];

  const selectedName = dept === ALL ? 'All departments in scope' : deptLabel(dept);
  const windowWeeks = hTo - hFrom + 1;
  const refColor = cmp === 'ly' ? C.ly : C.reference;

  return (
    <div className="aiv-history">
      <div className="aiv-controls">
        <Segmented label="Measure" value={measure} options={MEASURES} onChange={setMeasure} size="sm" />
        <Segmented label="Compare with" value={cmp} options={[{id: 'ly', label: 'vs LY'}, {id: 'budget', label: 'vs Budget (OPS111)'}]} onChange={setCmp} size="sm" />
        <div className="fb-field">
          <label htmlFor={deptId}>Department</label>
          <select id={deptId} value={locked ? scope.dept : localDept} disabled={locked} onChange={e => setLocalDept(e.target.value as 'all' | DeptId)}>
            {locked ? <option value={scope.dept}>{deptLabel(scope.dept)} (page filter)</option> : <option value="all">All departments in scope</option>}
            {locked
              ? null
              : rows.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
          </select>
        </div>
        <InfoTip
          align="right"
          label="About AIV history"
          text={
            <>
              {AIV_HELP.aiv} {AIV_HELP.tyly} {AIV_HELP.infPct} {AIV_HELP.infValue} {cmp === 'budget' ? AIV_HELP.budget : ''} Inflation never adjusts labor measures or sales growth.
            </>
          }
        />
      </div>
      <p className="table-scope">
        <b>Rolling {windowWeeks} weeks</b>, weekly points, through Week Ending {usDate(WEEKS[hTo].end)} (the last week of the selected time frame{windowWeeks < 52 ? '; synthetic data starts FY2025 W01' : ''}) · {selectedName} · {measureLabel}
        {isAiv ? ` · TY and ${refLabel}` : ` vs ${refLabel}`}
      </p>
      <ChartKey items={isAiv ? [{label: 'AIV TY', color: C.actual, kind: 'line'}, {label: `AIV ${refLabel}`, color: refColor, kind: cmp === 'ly' ? 'line' : 'dash'}] : [{label: `${measureLabel} vs ${refLabel}`, color: C.actual, kind: measure === 'infPct' ? 'line' : 'bar'}]} />
      <div className="chart-h280">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{top: 8, right: 12, left: 8, bottom: 0}} accessibilityLayer>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={AXIS} width={64} domain={isAiv ? ['auto', 'auto'] : undefined} tickFormatter={v => (isAiv ? `$${Number(v).toFixed(2)}` : measure === 'infPct' ? fmt.signedPct(v, 1) : fmt.signedCompactMoney(v))} />
            {isAiv ? null : <ReferenceLine y={0} stroke={C.benchmark} />}
            <Tooltip
              cursor={{fill: '#f3f2f1'}}
              content={({active, payload}) => {
                const p = active && payload?.[0]?.payload;
                if (!p) return null;
                return (
                  <TipBox
                    title={`${p.label} · Week Ending ${usDate(p.end)}`}
                    rows={[
                      {label: 'AIV TY', value: fmt.money2(p.actual), swatch: C.actual},
                      {label: `AIV ${refLabel}`, value: fmt.money2(p.ref), swatch: isAiv ? refColor : undefined},
                      ...(isAiv ? [] : [{label: `${measureLabel} vs ${refLabel}`, value: fmtMeasure(p.value)}]),
                      {label: 'Items sold TY', value: fmt.int(p.items)},
                    ]}
                    note="Estimate from the change in average item value; it also reflects product mix."
                  />
                );
              }}
            />
            {isAiv ? (
              <>
                <Line dataKey="actual" name="AIV TY" stroke={C.actual} strokeWidth={2.5} dot={false} isAnimationActive={ANIMATE} />
                <Line dataKey="ref" name={`AIV ${refLabel}`} stroke={refColor} strokeWidth={2} strokeDasharray={cmp === 'ly' ? undefined : '5 3'} dot={false} isAnimationActive={ANIMATE} />
              </>
            ) : measure === 'infPct' ? (
              <Line dataKey="value" name={measureLabel} stroke={C.actual} strokeWidth={2.5} dot={{r: 2}} isAnimationActive={ANIMATE} />
            ) : (
              <Bar dataKey="value" name={measureLabel} fill={C.actual} isAnimationActive={ANIMATE} maxBarSize={14} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">
        {isAiv ? 'AIV axis starts near the data range, not at zero.' : 'Zero line = no change in average item value.'} Exact values in the tooltip. {locked ? 'Department fixed by the page Department filter.' : 'Select a department row below (or use Department) to show its history; select it again for all departments.'}
      </p>
      <h3 className="sub-heading">
        Department summary · {measureLabel} {isAiv ? `(TY, ${refLabel} below)` : `vs ${refLabel}`} <InfoTip text={AIV_HELP.scopes} label="About LW, PTD, QTD and YTD" align="left" />
      </h3>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        label="AIV and estimated inflation by department"
        countNoun="departments"
        pinned={[totalRow]}
        pinnedLabel={r => r.name}
        onRowClick={locked ? undefined : r => setLocalDept(localDept === r.id ? 'all' : (r.id as DeptId))}
        selectedKey={dept === ALL ? null : dept}
        exportName={`aiv-history-${measure}-vs-${cmp}`}
        maxHeight={380}
      />
    </div>
  );
}
