// Workbook view R65 "Headcount & Hours vs Budget" (User Story 4): labor hours (actual vs budgeted hrs), labor
// spend (actual vs budgeted $), AHR (actual vs budget), overtime ($ / hrs) and current headcount, by region,
// district and store. Budget is the primary comparison; an exploratory reference (Discovery options) is secondary.
import {useMemo, useState} from 'react';
import {CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useReport} from '../app/state';
import {useScope} from '../app/useScope';
import {KpiCard} from '../components/KpiCard';
import {HoursVar, MoneyVar, PctVar, RatioVar} from '../components/kpiLines';
import {ScopeLine, VisualFilters} from '../components/scope';
import {EmptyState, PageHeading} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {DISTRICTS, REGIONS, storeById} from '../data/org';
import {refAhr, refHours, refSpend, rollup, total, type LaborTotals, type Rollup} from '../lib/aggregate';
import {downloadCsv, EXPORT_NOTE, toCsv, type Cell} from '../lib/csv';
import {TARGET_LABEL, type Target} from '../lib/filters';
import {fmt} from '../lib/format';
import {ahr, variance, variancePct} from '../lib/metrics';
import {peopleRollup, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, TipBox} from '../visuals/chartTheme';

const META = pageById.get('budget')!;
type Line = {id: string; level: 'region' | 'district' | 'store'; name: string; parent: string | null; r: Rollup; hc: number};

export default function BudgetPage() {
  const scope = useScope('budget');
  const {filters, update} = useReport();
  const alt: Target | null = filters.reference === 'none' ? null : filters.reference;
  const altName = alt ? `${TARGET_LABEL[alt]} (exploratory)` : '';
  const [open, setOpen] = useState<Set<string>>(new Set());

  const t = useMemo(() => total(scope.stores, 'All', scope.from, scope.to), [scope]);
  const levels = useMemo(() => ({region: rollup(scope.stores, 'All', scope.from, scope.to, 'region'), district: rollup(scope.stores, 'All', scope.from, scope.to, 'district'), store: rollup(scope.stores, 'All', scope.from, scope.to, 'store')}), [scope]);
  const hc = useMemo(() => peopleRollup(scope.stores, {dept: 'All', position: 'All', tenure: 'All', age: 'All', recruiter: 'All'}, scope.from, scope.to, 'store'), [scope]);
  const hcOf = (stores: string[]) => stores.reduce((s, id) => s + (hc.get(id)?.end ?? 0), 0);
  const currentHc = [...hc.values()].reduce((s, p: PeopleTotals) => s + p.end, 0);
  const L = t.labor;

  const lines: Line[] = [];
  for (const reg of REGIONS) {
    const r = levels.region.get(reg.id);
    if (!r) continue;
    const regStores = [...scope.stores].filter(id => storeById.get(id)?.regionId === reg.id);
    lines.push({id: reg.id, level: 'region', name: reg.name, parent: null, r, hc: hcOf(regStores)});
    for (const d of DISTRICTS.filter(x => x.regionId === reg.id)) {
      const dr = levels.district.get(d.id);
      if (!dr) continue;
      const dStores = regStores.filter(id => storeById.get(id)?.districtId === d.id);
      lines.push({id: d.id, level: 'district', name: d.name, parent: reg.id, r: dr, hc: hcOf(dStores)});
      for (const sid of dStores) {
        const sr = levels.store.get(sid);
        if (sr) lines.push({id: sid, level: 'store', name: storeById.get(sid)!.name, parent: d.id, r: sr, hc: hc.get(sid)?.end ?? 0});
      }
    }
  }
  const autoOpen = new Set(lines.filter(l => l.level !== 'store' && lines.filter(x => x.level === l.level).length === 1).map(l => l.id));
  const isOpen = (id: string) => open.has(id) || autoOpen.has(id);
  const visibleLines = lines.filter(l => l.parent === null || (isOpen(l.parent) && (l.level !== 'store' || isOpen(lines.find(x => x.id === l.parent)!.parent!))));
  const toggle = (id: string) =>
    setOpen(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const points = lines
    .filter(l => l.level === 'store')
    .map(l => ({id: l.id, name: l.name, x: variancePct(l.r.labor.sales, l.r.labor.salesBud), y: variancePct(l.r.labor.pay, l.r.labor.payBud), pay: l.r.labor.pay, varAmt: variance(l.r.labor.pay, l.r.labor.payBud)}))
    .filter(p => p.x !== null && p.y !== null);

  const exportAll = () => {
    const header = ['Level', 'Name', 'Hours actual', 'Hours budget', 'Hours var %', 'Spend actual', 'Spend budget', 'Spend var %', 'AHR actual', 'AHR budget', 'OT $ (excl. RX)', 'OT hours (excl. RX)', 'Ending headcount', ...(alt ? [`Hours ${altName}`, `Spend ${altName}`] : [])];
    const rows: Cell[][] = lines.map(l => {
      const x = l.r.labor;
      return [l.level, l.name, x.hours, x.hoursBud, variancePct(x.hours, x.hoursBud), x.pay, x.payBud, variancePct(x.pay, x.payBud), ahr(x.pay, x.hours), ahr(x.payBud, x.hoursBud), x.otPay, x.otHours, l.hc, ...(alt ? [refHours(x, alt), refSpend(x, alt)] : [])];
    });
    downloadCsv('headcount-hours-vs-budget', toCsv(header, rows, [EXPORT_NOTE]));
  };

  const altCells = (x: LaborTotals) =>
    alt ? (
      <>
        <td className="exploratory">
          <PctVar actual={x.hours} target={refHours(x, alt)} />
        </td>
        <td className="exploratory">
          <PctVar actual={x.pay} target={refSpend(x, alt)} />
        </td>
      </>
    ) : null;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question} />
      <ScopeLine scope={scope} />
      {L.rows === 0 ? (
        <EmptyState>No data for this selection. Try another time frame or use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid five" aria-label="Hours and spend versus budget">
            <KpiCard level="primary" label="Labor hours" value={fmt.compactHours(L.hours)} decisions={['D01']} lines={[{label: 'Budget', value: fmt.compactHours(L.hoursBud)}, {label: 'vs Budget', value: <HoursVar actual={L.hours} target={L.hoursBud} />}, ...(alt ? [{label: `vs ${altName}`, value: <HoursVar actual={L.hours} target={refHours(L, alt)} />}] : [])]} />
            <KpiCard level="primary" label="Labor spend" value={fmt.compactMoney(L.pay)} decisions={['D01']} lines={[{label: 'Budget', value: fmt.compactMoney(L.payBud)}, {label: 'vs Budget', value: <MoneyVar actual={L.pay} target={L.payBud} />}, ...(alt ? [{label: `vs ${altName}`, value: <MoneyVar actual={L.pay} target={refSpend(L, alt)} />}] : [])]} />
            <KpiCard label="Average hourly rate" value={fmt.money2(ahr(L.pay, L.hours))} lines={[{label: 'Budget', value: fmt.money2(ahr(L.payBud, L.hoursBud))}, {label: 'vs Budget', value: <RatioVar actual={ahr(L.pay, L.hours)} target={ahr(L.payBud, L.hoursBud)} digits={2} prefix="$" />}, ...(alt ? [{label: altName, value: fmt.money2(refAhr(L, alt))}] : [])]} />
            <KpiCard label="Overtime (excl. RX)" value={fmt.compactMoney(L.otPay)} decisions={['D04']} lines={[{label: 'Hours', value: fmt.int(L.otHours)}, {label: '$ vs LY', value: <PctVar actual={L.otPay} target={L.otPayLY} />}]} />
            <KpiCard label="Current headcount" value={fmt.int(currentHc)} hint="Active associates at the end of the time frame (a snapshot, not a sum of weeks)." decisions={['D12']} lines={[{label: 'Snapshot', value: 'End of time frame'}]} />
          </section>

          <VisualCard
            title="Hours & spend vs Budget by region, district and store"
            subtitle="Expand a region or district to see its districts and stores."
            filters={<VisualFilters scope={scope} notes={alt ? [`Columns marked exploratory compare with ${TARGET_LABEL[alt]}; Budget remains the primary comparison.`] : []} />}
            actions={
              <button type="button" className="btn-secondary" onClick={exportAll}>
                Export CSV
              </button>
            }
          >
            <div className="table-wrap" style={{maxHeight: 520}}>
              <table aria-label="Hours and spend versus budget by region, district and store" className="tree-table">
                <thead>
                  <tr className="group-row">
                    <th />
                    <th colSpan={3} className="grouped">Labor hours</th>
                    <th colSpan={3} className="grouped">Labor spend</th>
                    <th colSpan={2} className="grouped">AHR</th>
                    <th colSpan={2} className="grouped">Overtime (excl. RX)</th>
                    <th className="grouped">People</th>
                    {alt ? (
                      <th colSpan={2} className="grouped exploratory">
                        vs {altName}
                      </th>
                    ) : null}
                  </tr>
                  <tr>
                    <th scope="col">Location</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Budget</th>
                    <th scope="col">Var %</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Budget</th>
                    <th scope="col">Var %</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Budget</th>
                    <th scope="col">$</th>
                    <th scope="col">Hours</th>
                    <th scope="col">Ending headcount</th>
                    {alt ? (
                      <>
                        <th scope="col" className="exploratory">
                          Hours var %
                        </th>
                        <th scope="col" className="exploratory">
                          Spend var %
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map(l => {
                    const x = l.r.labor;
                    return (
                      <tr key={l.id} className={`lvl-${l.level}`}>
                        <td>
                          {l.level !== 'store' ? (
                            <button type="button" className="tree-toggle" aria-expanded={isOpen(l.id)} onClick={() => toggle(l.id)}>
                              <span aria-hidden="true">{isOpen(l.id) ? '▾' : '▸'}</span> {l.name}
                            </button>
                          ) : (
                            <button type="button" className="rowlink" onClick={() => update({store: l.id, district: storeById.get(l.id)!.districtId, region: storeById.get(l.id)!.regionId})} title="Filter the report to this store">
                              {l.name}
                            </button>
                          )}
                        </td>
                        <td>{fmt.int(x.hours)}</td>
                        <td>{fmt.int(x.hoursBud)}</td>
                        <td>
                          <PctVar actual={x.hours} target={x.hoursBud} />
                        </td>
                        <td>{fmt.money(x.pay)}</td>
                        <td>{fmt.money(x.payBud)}</td>
                        <td>
                          <PctVar actual={x.pay} target={x.payBud} />
                        </td>
                        <td>{fmt.money2(ahr(x.pay, x.hours))}</td>
                        <td>{fmt.money2(ahr(x.payBud, x.hoursBud))}</td>
                        <td>{fmt.money(x.otPay)}</td>
                        <td>{fmt.int(x.otHours)}</td>
                        <td>{fmt.int(l.hc)}</td>
                        {altCells(x)}
                      </tr>
                    );
                  })}
                  <tr className="pinned">
                    <td>Total</td>
                    <td>{fmt.int(L.hours)}</td>
                    <td>{fmt.int(L.hoursBud)}</td>
                    <td>
                      <PctVar actual={L.hours} target={L.hoursBud} />
                    </td>
                    <td>{fmt.money(L.pay)}</td>
                    <td>{fmt.money(L.payBud)}</td>
                    <td>
                      <PctVar actual={L.pay} target={L.payBud} />
                    </td>
                    <td>{fmt.money2(ahr(L.pay, L.hours))}</td>
                    <td>{fmt.money2(ahr(L.payBud, L.hoursBud))}</td>
                    <td>{fmt.money(L.otPay)}</td>
                    <td>{fmt.int(L.otHours)}</td>
                    <td>{fmt.int(currentHc)}</td>
                    {altCells(L)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">A store above its labor budget with sales above budget may be staffing to demand: read labor variance together with sales (chart below).</p>
          </VisualCard>

          <VisualCard title="Labor spend vs Budget compared with sales vs Budget, by store" subtitle="Context for the spend variance (design proposal)." filters={<VisualFilters scope={scope} notes={['Each dot is a store. Select a dot to filter the report to that store.']} />}>
            <div className="chart-h360">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{top: 10, right: 20, left: 10, bottom: 24}}>
                  <CartesianGrid stroke={C.grid} />
                  <XAxis type="number" dataKey="x" name="Sales vs budget" tick={AXIS} tickFormatter={v => fmt.signedPct(v)} label={{value: 'Sales vs Budget %', position: 'insideBottom', offset: -14, fontSize: 11, fill: C.axis}} domain={['auto', 'auto']} />
                  <YAxis type="number" dataKey="y" name="Labor spend vs budget" tick={AXIS} tickFormatter={v => fmt.signedPct(v)} width={56} label={{value: 'Spend vs Budget %', angle: -90, position: 'insideLeft', fontSize: 11, fill: C.axis}} domain={['auto', 'auto']} />
                  <ZAxis type="number" dataKey="pay" range={[30, 160]} />
                  <ReferenceLine x={0} stroke={C.benchmark} />
                  <ReferenceLine y={0} stroke={C.benchmark} />
                  <Tooltip
                    content={({active, payload}) => {
                      const p = active && payload?.[0]?.payload;
                      return p ? <TipBox title={p.name} rows={[{label: 'Sales vs Budget', value: fmt.signedPct(p.x)}, {label: 'Spend vs Budget', value: fmt.signedPct(p.y)}, {label: 'Labor spend', value: fmt.money(p.pay)}, {label: 'Spend variance', value: fmt.signedMoney(p.varAmt)}]} /> : null;
                    }}
                  />
                  <Scatter data={points} fill={C.above} isAnimationActive={ANIMATE} cursor="pointer" onClick={(d: {id?: string}) => d?.id && update({store: d.id, district: storeById.get(d.id)!.districtId, region: storeById.get(d.id)!.regionId})} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="note">Upper right: spending above budget while selling above budget. Lower left: below budget while selling below budget. Dot size reflects labor spend.</p>
          </VisualCard>
        </>
      )}
    </div>
  );
}
