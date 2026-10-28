import {useId, useRef} from 'react';
import {useReport} from '../app/state';
import {districtById, storeById} from '../data/org';
import {REFERENCES, type AccessRole} from '../lib/filters';
import {BENCHMARK_OPTIONS} from '../lib/benchmark';
import {DecisionChip, Segmented} from './ui';

// Secondary discovery area: settings that explore OPEN decisions. None of them is an approved requirement.
// Simulated access filters data in the browser only; in Power BI this becomes row-level security.
const ROLES: {id: string; label: string; role: AccessRole}[] = [
  {id: 'regional', label: 'Regional manager · all stores', role: {kind: 'regional'}},
  {id: 'district', label: 'District manager · District 05', role: {kind: 'district', id: 'D05'}},
  {id: 'store', label: 'Store manager · Store 123', role: {kind: 'store', id: 'S123'}},
];

// eslint-disable-next-line react-refresh/only-export-components -- small helper shared by the dialog and the strip
export function activeDiscovery(f: {benchmark: string; reference: string}, role: AccessRole): string[] {
  const out: string[] = [];
  if (role.kind !== 'regional') out.push(`Simulated access: ${role.kind === 'district' ? districtById.get(role.id)?.name : storeById.get(role.id)?.name}`);
  if (f.benchmark !== 'weighted') out.push('Benchmark method: simple store average');
  if (f.reference !== 'none') out.push(`Exploratory comparison: ${REFERENCES.find(r => r.id === f.reference)?.label}`);
  return out;
}

export function DiscoveryOptions() {
  const {filters, role, setRole, update} = useReport();
  const ref = useRef<HTMLDialogElement>(null);
  const roleId = useId();
  const current = ROLES.find(r => r.role.kind === role.kind)?.id ?? 'regional';
  const active = activeDiscovery(filters, role);
  return (
    <>
      <button type="button" className="header-button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        Discovery options{active.length ? ` (${active.length} active)` : ''}
      </button>
      <dialog ref={ref} className="defs-dialog discovery-dialog" aria-labelledby="discovery-title">
        <div className="defs-head">
          <h2 id="discovery-title">Discovery options</h2>
          <form method="dialog">
            <button type="submit" className="btn-secondary">
              Close
            </button>
          </form>
        </div>
        <p className="note">Exploratory settings for discussing open decisions with Weis. They are not part of the approved requirements and are off by default.</p>
        <section className="discovery-item">
          <h3>
            Simulated access <DecisionChip ids={['D09', 'D10']} label="Open" align="left" />
          </h3>
          <p>Demonstrates the access baseline from the technical session (store, district, regional). Browser filtering only; not security.</p>
          <label htmlFor={roleId} className="fb-label">
            View as
          </label>
          <select id={roleId} value={current} onChange={e => setRole(ROLES.find(r => r.id === e.target.value)!.role)}>
            {ROLES.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </section>
        <section className="discovery-item">
          <h3>
            Chain benchmark method <DecisionChip ids={['D13']} label="Open" align="left" />
          </h3>
          <p>Default: weighted (KPI calculated on chain totals). The simple store average is an alternative for discussion. Applies to Turnover, Overtime & Call-off Tracking and Turnover & Retention Benchmark.</p>
          <Segmented label="Benchmark method" value={filters.benchmark} options={BENCHMARK_OPTIONS} onChange={benchmark => update({benchmark})} size="sm" />
        </section>
        <section className="discovery-item">
          <h3>
            Exploratory comparison <DecisionChip ids={['D01']} label="Open" align="left" />
          </h3>
          <p>Budget stays the primary comparison. This adds a secondary, clearly labeled comparison on Labor Overview, Headcount & Hours vs Budget and Daily Labor vs Budget.</p>
          <Segmented label="Exploratory comparison" value={filters.reference} options={REFERENCES.map(r => ({id: r.id, label: r.label}))} onChange={reference => update({reference})} size="sm" />
        </section>
      </dialog>
    </>
  );
}

/** Visible reminder under the disclaimer whenever an exploratory setting is active. */
export function DiscoveryStrip() {
  const {filters, role} = useReport();
  const active = activeDiscovery(filters, role);
  if (!active.length) return null;
  return (
    <p className="discovery-strip" role="status">
      <b>Exploratory settings active:</b> {active.join(' · ')}
    </p>
  );
}
