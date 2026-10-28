import type {ReactNode} from 'react';
import {DecisionChip, InfoTip} from './ui';

export type KpiLine = {label: string; value: ReactNode};

/**
 * KPI card. `level` sets the visual hierarchy: primary cards lead the page, secondary cards add context.
 * A card with `pending` shows the reason instead of a value, so a missing definition never reads as 0.
 */
export function KpiCard({label, value, lines = [], hint, decisions, pending, level = 'secondary', tag}: {label: string; value: ReactNode; lines?: KpiLine[]; hint?: string; decisions?: string[]; pending?: string; level?: 'primary' | 'secondary'; tag?: string}) {
  return (
    <div className={`kpi kpi-${level}`}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {hint ? <InfoTip text={hint} label={`About ${label}`} align="left" /> : null}
        {decisions?.length ? <DecisionChip ids={decisions} label="Open" align="left" /> : null}
      </div>
      {tag ? <em className="kpi-tag">{tag}</em> : null}
      {pending ? <p className="kpi-pending">{pending}</p> : <strong className="kpi-value">{value}</strong>}
      {lines.length ? (
        <dl className="kpi-lines">
          {lines.map(l => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd>{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
