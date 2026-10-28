import {useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {pageById} from '../app/pages';
import {useScope} from '../app/useScope';
import {DataTable, type Column} from '../components/DataTable';
import {KpiCard} from '../components/KpiCard';
import {ScopeLine, VisualFilters} from '../components/scope';
import {DecisionChip, EmptyState, IllustrativeChip, PageHeading, Segmented} from '../components/ui';
import {VisualCard} from '../components/VisualCard';
import {districtById, regionById, storeById} from '../data/org';
import {AGE_RANGES, POSITIONS, RECRUITERS, TENURE_BANDS} from '../data/people';
import {fmt} from '../lib/format';
import {headcountShare, turnoverRate} from '../lib/metrics';
import {peopleKpis, peopleRollup, peopleTotal, type PeopleGroup, type PeopleTotals} from '../lib/peopleMetrics';
import {ANIMATE, AXIS, C, ChartKey, TipBox} from '../visuals/chartTheme';

const META = pageById.get('people')!;
const FT_HELP = 'Full-time ratio = FT headcount / (FT headcount + PT headcount), using ending headcount. Headcount based, not hours.';
const PT_HELP = 'Part-time ratio = PT headcount / (FT headcount + PT headcount), using ending headcount. Headcount based, not hours.';
type Breakdown = Exclude<PeopleGroup, 'none' | 'dept'>;
const BREAKDOWNS: {id: Breakdown; label: string}[] = [
  {id: 'recruiter', label: 'Recruiter'},
  {id: 'age', label: 'Age range'},
  {id: 'tenure', label: 'Tenure'},
  {id: 'position', label: 'Position'},
  {id: 'type', label: 'FT / PT'},
  {id: 'store', label: 'Store'},
  {id: 'district', label: 'District'},
  {id: 'region', label: 'Region'},
  {id: 'state', label: 'State'},
];
const ORDER: Partial<Record<Breakdown, readonly string[]>> = {age: AGE_RANGES, tenure: TENURE_BANDS, recruiter: RECRUITERS, position: POSITIONS, type: ['FT', 'PT']};

function labelOf(b: Breakdown, id: string): string {
  if (b === 'store') return storeById.get(id)?.name ?? id;
  if (b === 'district') return districtById.get(id)?.name ?? id;
  if (b === 'region') return regionById.get(id)?.name ?? id;
  if (b === 'type') return id === 'FT' ? 'Full-time' : 'Part-time';
  return id;
}

type Row = {id: string; name: string; p: PeopleTotals};

export default function PeoplePage() {
  const scope = useScope('people');
  const [by, setBy] = useState<Breakdown>('tenure');
  const tot = useMemo(() => peopleTotal(scope.stores, scope.people, scope.from, scope.to), [scope]);
  const k = peopleKpis(tot);
  const groups = useMemo(() => peopleRollup(scope.stores, scope.people, scope.from, scope.to, by), [scope, by]);
  const order = ORDER[by];
  const rows: Row[] = [...groups.entries()]
    .map(([id, p]) => ({id, name: labelOf(by, id), p}))
    .sort((a, b) => (order ? order.indexOf(a.id) - order.indexOf(b.id) : a.name.localeCompare(b.name)));

  const turnover = (r: Row) => turnoverRate(r.p.terms, r.p.begin, r.p.end);
  const columns: Column<Row>[] = [
    {key: 'name', header: BREAKDOWNS.find(b => b.id === by)!.label, value: r => (order ? order.indexOf(r.id) : r.name), render: r => r.name, align: 'left'},
    {key: 'begin', header: 'Begin HC', value: r => r.p.begin, render: r => fmt.int(r.p.begin)},
    {key: 'end', header: 'End HC', value: r => r.p.end, render: r => fmt.int(r.p.end)},
    {key: 'hires', header: 'Hires', value: r => r.p.hires, render: r => fmt.int(r.p.hires)},
    {key: 'terms', header: 'Terminations', value: r => r.p.terms, render: r => fmt.int(r.p.terms)},
    {key: 'turnover', header: 'Turnover', value: turnover, render: r => fmt.pct(turnover(r))},
    {key: 'ft', header: 'Full-time ratio', sub: '% of ending headcount', help: FT_HELP, value: r => headcountShare(r.p.ftEnd, r.p.ftEnd, r.p.ptEnd), render: r => fmt.pct(headcountShare(r.p.ftEnd, r.p.ftEnd, r.p.ptEnd), 0)},
    {key: 'pt', header: 'Part-time ratio', sub: '% of ending headcount', help: PT_HELP, value: r => headcountShare(r.p.ptEnd, r.p.ftEnd, r.p.ptEnd), render: r => fmt.pct(headcountShare(r.p.ptEnd, r.p.ftEnd, r.p.ptEnd), 0)},
  ];
  const chart = rows.map(r => ({name: r.name, end: r.p.end, hires: r.p.hires, terms: r.p.terms, turnover: turnover(r)}));
  const tenureNote = by === 'tenure' ? 'Tenure is measured on the snapshot or event date: hires are always "< 90 days"; terminations use tenure at termination.' : null;

  return (
    <div className="page">
      <PageHeading eyebrow={META.eyebrow} title={META.name} question={META.question}>
        <DecisionChip ids={['D10', 'D12']} label="People rules open" />
      </PageHeading>
      <ScopeLine scope={scope} />
      {tot.begin + tot.end + tot.hires === 0 ? (
        <EmptyState>No associates match these filters. Try another Position, Tenure, Age Range or Recruiter, or use Reset filters.</EmptyState>
      ) : (
        <>
          <section className="kpi-grid six" aria-label="People summary">
            <KpiCard level="primary" label="Ending headcount" value={fmt.int(k.end)} hint="Active associates at the end of the time frame (snapshot)." lines={[{label: 'Beginning', value: fmt.int(k.begin)}]} />
            <KpiCard level="primary" label="Hires" value={fmt.int(k.hires)} />
            <KpiCard level="primary" label="Terminations" value={fmt.int(k.terms)} hint="Workday supplies a single termination type." />
            <KpiCard level="primary" label="Turnover rate" value={fmt.pct(k.turnover)} decisions={['D12']} lines={[{label: 'Avg headcount', value: fmt.dec1(k.avg)}]} />
            <KpiCard label="Full-time ratio" value={fmt.pct(k.ftShare, 0)} hint={FT_HELP} />
            <KpiCard label="Part-time ratio" value={fmt.pct(k.ptShare, 0)} hint={PT_HELP} />
          </section>

          <VisualCard
            title={`Headcount, hires and terminations by ${BREAKDOWNS.find(b => b.id === by)!.label.toLowerCase()}`}
            actions={<Segmented label="Breakdown" value={by} options={BREAKDOWNS} onChange={setBy} size="sm" />}
            subtitle="Choose a breakdown (a Power BI field parameter). Values are aggregates only; no associate-level detail is shown."
            filters={<VisualFilters scope={scope} notes={[tenureNote, by === 'recruiter' ? 'Recruiter names are illustrative.' : null, 'Age range is not compared with last year (as in today\'s Ops 200 reporting).'].filter(Boolean)} />}
          >
            <ChartKey items={[{label: 'Ending headcount', color: C.comparison}, {label: 'Hires', color: C.sales}, {label: 'Terminations', color: C.actual}]} />
            <div className="chart-h320">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{top: 8, right: 12, left: 8, bottom: by === 'store' ? 40 : 8}}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} interval={by === 'store' ? 'preserveStartEnd' : 0} angle={by === 'store' ? -40 : 0} textAnchor={by === 'store' ? 'end' : 'middle'} height={by === 'store' ? 50 : 30} />
                  <YAxis tick={AXIS} width={52} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip cursor={{fill: '#f3f2f1'}} content={({active, payload}) => (active && payload?.[0] ? <TipBox title={payload[0].payload.name} rows={[{label: 'Ending headcount', value: fmt.int(payload[0].payload.end), swatch: C.comparison}, {label: 'Hires', value: fmt.int(payload[0].payload.hires), swatch: C.sales}, {label: 'Terminations', value: fmt.int(payload[0].payload.terms), swatch: C.actual}, {label: 'Turnover', value: fmt.pct(payload[0].payload.turnover)}]} /> : null)} />
                  <Bar dataKey="end" fill={C.comparison} isAnimationActive={ANIMATE} />
                  <Bar dataKey="hires" fill={C.sales} isAnimationActive={ANIMATE} />
                  <Bar dataKey="terms" fill={C.actual} isAnimationActive={ANIMATE} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {by === 'recruiter' ? <IllustrativeChip text="Recruiters are illustrative" /> : null}
          </VisualCard>

          <VisualCard title="People table" filters={<VisualFilters scope={scope} />}>
            <DataTable rows={rows} columns={columns} rowKey={r => r.id} label="People reporting" searchText={r => r.name} pinned={[{id: 'total', name: 'Total', p: tot}]} pinnedLabel={() => 'Total'} exportName={`people-by-${by}`} />
            <p className="note">Turnover = terminations / ((beginning + ending headcount) / 2), per the workbook draft; OPS 201 logic is still to be reviewed.{by === 'tenure' ? ' By tenure, an associate can count in one band at the start and another at the end, so band-level turnover mixes populations.' : ''}</p>
          </VisualCard>
        </>
      )}
    </div>
  );
}
