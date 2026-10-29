// Proposed overview (not one of the six workbook views): a short summary of labor spend, hours, labor rate and
// IPLH, with links to the required views for detail. Each KPI keeps its primary reference: Budget for spend, hours
// and labor rate; MDoc for IPLH, as in the OPS107 report. The reference per KPI is open (D01). Oct 28 review: the
// cards can also be compared with Last Year (card-level control, separate from the chart's own LY option).
import {useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {PageLink} from '../app/nav';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {deptLabel, useScope} from '../app/useScope';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, RateVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, InfoTip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {WEEKS} from '../data/calendar';
import {DEPARTMENTS, type DeptId} from '../data/org';
import {laborKpis, refHours, refSpend, rollup, total} from '../lib/aggregate';
import {ALL, TARGET_LABEL, type Target} from '../lib/filters';
import {fmt, usDate} from '../lib/format';
import {iplh, laborRate, variance, variancePct, yoyPct} from '../lib/metrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('overview')!;

/** Value label outside the bar end: right of positive bars, left of negative bars (never over the category names). */
function VarianceLabel(props: {x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string}) {
  const x = Number(props.x ?? 0);
  const w = Number(props.width ?? 0);
  const v = Number(props.value ?? 0);
  const left = Math.min(x, x + w);
  const right = Math.max(x, x + w);
  return (
    <text x={v < 0 ? left - 4 : right + 4} y={Number(props.y ?? 0) + Number(props.height ?? 0) / 2} dy={4} fontSize={11} fill={C.axis} textAnchor={v < 0 ? 'end' : 'start'}>
      {fmt.signedCompactMoney(v)}
    </text>
  );
}
type Measure = 'spend' | 'hours';
type CardRef = 'primary' | 'ly';

export default function OverviewPage() {
  const scope = useScope('overview');
  const {filters, update} = useReport();
  const alt: Target | null = filters.reference === 'mdoc' ? 'mdoc' : null;
  const [measure, setMeasure] = useState<Measure>('spend');
  const [showLY, setShowLY] = useState(false);
  const [cardRef, setCardRef] = useState<CardRef>('primary');
  const vsLY = cardRef === 'ly';

  const t = useMemo(() => total(scope.stores, scope.dept, scope.from, scope.to), [scope]);
  const k = laborKpis(t.labor, 'budget');
  const weeks = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'week'), [scope]);
  const depts = useMemo(() => rollup(scope.stores, scope.dept, scope.from, scope.to, 'dept'), [scope]);
  const hasData = t.labor.rows > 0;
  const money = measure === 'spend';

  const weekRows = [...weeks.entries()]
    .map(([w, r]) => {
      const info = WEEKS[Number(w)];
      return {w: Number(w), label: `W${info.week}`, start: info.start, end: info.end, fy: info.fy, actual: money ? r.labor.pay : r.labor.hours, budget: money ? refSpend(r.labor, 'budget') : refHours(r.labor, 'budget'), ly: money ? r.labor.payLY : r.labor.hoursLY};
    })
    .sort((a, b) => a.w - b.w);
  const deptRows = DEPARTMENTS.map(d => {
    const r = depts.get(d.id);
    if (!r || r.labor.pay <= 0) return null;
    return {id: d.id, name: d.name, actual: r.labor.pay, budget: r.labor.payBud, v: variance(r.labor.pay, r.labor.payBud), pct: variancePct(r.labor.pay, r.labor.payBud)};
  })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0));

  // Axis padding proportional to the whole range, so a value label always fits beside the bar end (no overlap with names).
  const deptVals = deptRows.map(d => d.v ?? 0);
  const deptLo = Math.min(0, ...deptVals);
  const deptHi = Math.max(0, ...deptVals);
  const deptPad = (deptHi - deptLo) * 0.22;
  const rawStep = (deptHi - deptLo + deptPad) / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const deptStep = [1, 2, 2.5, 5, 10].map(k => k * mag).find(x => x >= rawStep) ?? 10 * mag;
  const deptDomain: [number, number] = [deptLo < 0 ? Math.floor((deptLo - deptPad) / deptStep) * deptStep : 0, deptHi > 0 ? Math.ceil((deptHi + deptPad * 0.4) / deptStep) * deptStep : 0];
  const deptTicks = Array.from({length: Math.round((deptDomain[1] - deptDomain[0]) / deptStep) + 1}, (_, i) => deptDomain[0] + i * deptStep);
  const rate = laborRate(t.labor.pay, t.labor.sales);
  const rateBud = laborRate(t.labor.payBud, t.labor.salesBud);
  const rateLY = laborRate(t.labor.payLY, t.labor.salesLY);
  const iplhNow = iplh(t.labor.items, t.labor.hours);
  const iplhMdoc = iplh(t.labor.itemsMdoc, t.labor.hoursMdoc);
  const iplhLY = iplh(t.labor.itemsLY, t.labor.hoursLY);
  const salesBasis = `Sales basis: Total Sales (Gross Sales of ${deptLabel(scope.dept).toLowerCase()} in scope) ${fmt.compactMoney(t.labor.sales)}, ${fmt.signedPct(yoyPct(t.labor.sales, t.labor.salesLY))} vs LY; Budget sales ${fmt.compactMoney(t.labor.salesBud)}.`;
  const exploratory = alt ? ` Exploratory (Discovery options): vs ${TARGET_LABEL[alt]} ` : '';

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} subtle />
      <ScopeLine scope={scope} />
      {!hasData ? (
        <EmptyState>No labor data for this selection. Try another time frame, location or department, or use Reset filters.</EmptyState>
      ) : (
        <>
          <div className="card-compare">
            <span className="card-compare-label" aria-hidden="true">
              Compare cards with
            </span>
            <Segmented label="Compare the four cards with" value={cardRef} options={[{id: 'primary', label: 'Budget / MDoc'}, {id: 'ly', label: 'Last Year'}]} onChange={setCardRef} size="sm" />
            <InfoTip
              align="left"
              label="About the card comparison"
              text="Applies to the four cards only; the weekly chart has its own LY option. Budget is the current comparison for Labor Spend, Labor Hours and Labor Rate. IPLH uses MDoc (Master Doc, the Ops operational target, not the formal Budget). Official comparison references remain pending business confirmation (D01). Last Year: the same fiscal weeks one year earlier (364 days); Labor Rate differences are in percentage points. Use ID stores in More filters for a like-for-like store base."
            />
            <span className="open-legend">
              <DecisionChip ids={['D01']} label="Open" align="left" /> = Business definition or comparison rule pending confirmation.
            </span>
          </div>
          <section aria-label={`Labor summary, compared with ${vsLY ? 'Last Year' : 'Budget / MDoc'}`} className="kpi-grid primary">
            <KpiCard
              level="primary"
              label="Labor Spend"
              value={fmt.compactMoney(k.spend)}
              decisions={['D01']}
              hint={
                <>
                  Actual payroll dollars from the source (salaried managers and Starbucks included, no manual additions). Budget: {fmt.compactMoney(t.labor.payBud)}. vs LY: {fmt.signedCompactMoney(variance(k.spend, t.labor.payLY))} ({fmt.signedPct(variancePct(k.spend, t.labor.payLY))}).
                  {exploratory ? `${exploratory}${fmt.signedPct(variancePct(k.spend, refSpend(t.labor, alt!)))}.` : ''} {salesBasis} Above or below budget is not good or bad by itself.
                </>
              }
              lines={vsLY ? [{label: 'LY', value: fmt.compactMoney(t.labor.payLY)}, {label: 'vs LY', value: <MoneyVar actual={k.spend} target={t.labor.payLY} />}] : [{label: 'Budget', value: fmt.compactMoney(t.labor.payBud)}, {label: 'vs Budget', value: <MoneyVar actual={k.spend} target={t.labor.payBud} />}]}
            />
            <KpiCard
              level="primary"
              label="Labor Hours"
              value={fmt.compactHours(k.hours)}
              decisions={['D01', 'D17']}
              hint={
                <>
                  Actual labor hours; vacation hours are not included (D17). Budget: {fmt.compactHours(t.labor.hoursBud)}. vs LY: {fmt.signedHours(variance(k.hours, t.labor.hoursLY))} ({fmt.signedPct(variancePct(k.hours, t.labor.hoursLY))}).
                  {exploratory ? `${exploratory}${fmt.signedPct(variancePct(k.hours, refHours(t.labor, alt!)))}.` : ''}
                </>
              }
              lines={vsLY ? [{label: 'LY', value: fmt.compactHours(t.labor.hoursLY)}, {label: 'vs LY', value: <HoursVar actual={k.hours} target={t.labor.hoursLY} />}] : [{label: 'Budget', value: fmt.compactHours(t.labor.hoursBud)}, {label: 'vs Budget', value: <HoursVar actual={k.hours} target={t.labor.hoursBud} />}]}
            />
            <KpiCard
              level="primary"
              label="Labor Rate"
              value={fmt.pct(rate, 2)}
              decisions={['D19']}
              hint={
                <>
                  Labor spend $ / Total Sales $ for the same stores, departments and weeks. Budget rate = Budgeted labor $ / Budget sales $ = {fmt.pct(rateBud, 2)}. LY rate = LY labor $ / LY sales $ = {fmt.pct(rateLY, 2)}. {salesBasis} Differences are in percentage points (pp): 9.40% − 9.20% = +0.20 pp.
                </>
              }
              lines={vsLY ? [{label: 'LY', value: fmt.pct(rateLY, 2)}, {label: 'vs LY', value: <RateVar actual={rate} target={rateLY} />}] : [{label: 'Budget', value: fmt.pct(rateBud, 2)}, {label: 'vs Budget', value: <RateVar actual={rate} target={rateBud} />}]}
            />
            <KpiCard
              level="primary"
              label="Items per Labor Hour (IPLH)"
              value={fmt.dec1(iplhNow)}
              decisions={['D01']}
              hint={
                <>
                  Items sold / actual labor hours. Current comparison: MDoc (Master Doc, the Ops operational target) = MDoc items / MDoc hours, as in the OPS107 IPLH report; MDoc is not the formal Budget. The Ops 100 model also holds IPLH Budget; the reference for UC5 is open (D01). LY IPLH = LY items / LY hours. Differences are in items per labor hour (and %).
                </>
              }
              lines={vsLY ? [{label: 'LY', value: fmt.dec1(iplhLY)}, {label: 'vs LY', value: <RatioVar actual={iplhNow} target={iplhLY} />}] : [{label: 'MDoc', value: fmt.dec1(iplhMdoc)}, {label: 'vs MDoc', value: <RatioVar actual={iplhNow} target={iplhMdoc} />}]}
            />
          </section>
          <p className="deeper-links">
            <span>More detail:</span> <PageLink to="allocation" /> (store and department, AHR, overtime, sales and customers) · <PageLink to="tracking" /> (overtime and call-offs) · <PageLink to="budget" /> (region, district and store vs budget) · <PageLink to="daily" />
          </p>

          <div className="two-col">
            <VisualCard
              title={`Weekly ${money ? 'Labor Spend' : 'Labor Hours'} vs Budget`}
              subtitle={`${money ? 'US dollars' : 'Hours'} per week, ${weekRows.length} ${weekRows.length === 1 ? 'week' : 'weeks'} of the selected time frame.`}
              filters={<VisualFilters scope={scope} />}
              actions={
                <>
                  <Segmented label="Measure" value={measure} options={[{id: 'spend', label: 'Labor Spend ($)'}, {id: 'hours', label: 'Labor Hours'}]} onChange={setMeasure} size="sm" />
                  <label className="check">
                    <input type="checkbox" checked={showLY} onChange={e => setShowLY(e.target.checked)} /> Show LY on this chart
                  </label>
                  <InfoTip text="Adds the last-year line (same fiscal weeks one year earlier) to this weekly chart only. It does not change the cards; use Compare cards with for them." label="About Show LY on this chart" align="right" />
                </>
              }
            >
              <ChartKey items={[{label: `Actual (${money ? '$' : 'hours'})`, color: C.actual, kind: 'line'}, {label: `Budget (${money ? '$' : 'hours'})`, color: C.reference, kind: 'dash'}, ...(showLY ? [{label: 'LY', color: C.ly, kind: 'line' as const}] : [])]} />
              <div className="chart-h280">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weekRows} margin={{top: 8, right: 12, left: 8, bottom: 0}} accessibilityLayer>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tick={AXIS} width={64} tickFormatter={v => (money ? `$${fmt.int(v / 1000)}K` : fmt.int(v))} domain={['auto', 'auto']} />
                    <Tooltip
                      cursor={{fill: '#f3f2f1'}}
                      content={({active, payload}) => {
                        const p = active && payload?.[0]?.payload;
                        if (!p) return null;
                        const f = money ? fmt.money : (v: number | null) => fmt.hours(v);
                        return (
                          <TipBox
                            title={`FY${p.fy} ${p.label} · ${usDate(p.start)} – ${usDate(p.end)}`}
                            rows={[
                              {label: 'Actual', value: f(p.actual), swatch: C.actual},
                              {label: 'Budget', value: f(p.budget), swatch: C.reference},
                              {label: 'vs Budget', value: `${money ? fmt.signedMoney(variance(p.actual, p.budget)) : fmt.signedHours(variance(p.actual, p.budget))} (${fmt.signedPct(variancePct(p.actual, p.budget))})`},
                              ...(showLY ? [{label: 'LY', value: f(p.ly), swatch: C.ly}] : []),
                            ]}
                          />
                        );
                      }}
                    />
                    <Line dataKey="actual" name="Actual" stroke={C.actual} strokeWidth={2.5} dot={{r: 3}} isAnimationActive={ANIMATE} />
                    <Line dataKey="budget" name="Budget" stroke={C.reference} strokeWidth={2} strokeDasharray="5 3" dot={{r: 2}} isAnimationActive={ANIMATE} />
                    {showLY ? <Line dataKey="ly" name="LY" stroke={C.ly} strokeWidth={2} dot={{r: 2}} isAnimationActive={ANIMATE} /> : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-note">Lines on an axis that starts near the data range, not at zero{money ? '; values in thousands of US dollars ($K)' : ''}. Exact values and the difference vs Budget are in the tooltip.</p>
            </VisualCard>

            <VisualCard
              title="Labor Spend Variance vs Budget by Department"
              subtitle={scope.dept !== ALL ? `Filtered to ${deptLabel(scope.dept)} · select the bar again to clear` : `Actual − Budget, US dollars, all ${deptRows.length} departments in scope. Select a bar to filter the page.`}
              filters={<VisualFilters scope={scope} notes={['Follows all page filters, including Department. Select a bar to filter the page to that department; select it again to clear.']} />}
            >
              <ChartKey items={[{label: 'Above Budget', color: C.above}, {label: 'Below Budget', color: C.below}]} />
              <div style={{height: Math.max(120, deptRows.length * 24 + 40)}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptRows} layout="vertical" margin={{top: 4, right: 64, left: 8, bottom: 0}} accessibilityLayer>
                    <CartesianGrid stroke={C.grid} horizontal={false} />
                    {/* Padded domain: value labels sit outside each bar end, so negative labels never reach the department names. */}
                    <XAxis type="number" tick={AXIS} tickFormatter={v => fmt.signedCompactMoney(v)} domain={deptDomain} ticks={deptTicks} />
                    <YAxis type="category" dataKey="name" tick={AXIS} width={128} interval={0} />
                    <ReferenceLine x={0} stroke={C.benchmark} />
                    <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.name} rows={[{label: 'Actual', value: fmt.money(payload[0].payload.actual)}, {label: 'Budget', value: fmt.money(payload[0].payload.budget)}, {label: 'Variance', value: `${fmt.signedMoney(payload[0].payload.v)} (${fmt.signedPct(payload[0].payload.pct)})`}]} note="Above or below budget is not good or bad by itself: read it with sales and productivity." /> : null)} />
                    <Bar dataKey="v" isAnimationActive={ANIMATE} onClick={(d: {id?: DeptId}) => d?.id && update({dept: filters.dept === d.id ? ALL : d.id})} cursor="pointer">
                      {deptRows.map(d => (
                        <Cell key={d.id} fill={(d.v ?? 0) >= 0 ? C.above : C.below} />
                      ))}
                      <LabelList dataKey="v" content={VarianceLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-note">
                Neutral colors: spending above or below budget is not good or bad by itself. Store × department detail: <PageLink to="allocation" />.
              </p>
            </VisualCard>
          </div>
        </>
      )}
    </div>
  );
}
