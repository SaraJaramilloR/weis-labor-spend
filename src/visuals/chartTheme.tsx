import type {ReactNode} from 'react';

// Semantic palette carried over from BC3 (meaning first, color second). Weis red stays a brand and
// navigation accent and is not used for data. Labor variances use neutral tones on purpose.
export const C = {
  actual: '#252423',
  reference: '#929292',
  ly: '#b79a76',
  sales: '#2b9e91',
  comparison: '#b9c7cb',
  highlight: '#252423',
  benchmark: '#605e5c',
  grid: '#edebe9',
  axis: '#484644',
  above: '#5b6770',
  below: '#a9b4ba',
} as const;

// Report visuals render without entry animation (closer to Power BI, and reliable in automated screenshots).
export const ANIMATE = false;
// eslint-disable-next-line react-refresh/only-export-components -- shared chart tokens beside the chart helpers
export const AXIS = {fontSize: 11, fill: C.axis};

type TipRow = {label: string; value: ReactNode; swatch?: string};

/** Shared tooltip body for Recharts `content`. */
export function TipBox({title, rows, note}: {title: ReactNode; rows: TipRow[]; note?: ReactNode}) {
  return (
    <div className="chart-tip">
      <strong>{title}</strong>
      <dl>
        {rows.map(r => (
          <div key={r.label}>
            <dt>
              {r.swatch ? <i style={{background: r.swatch}} aria-hidden="true" /> : null}
              {r.label}
            </dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

/** Legend rendered as HTML (more legible than the Recharts legend and keyboard-neutral). */
export function ChartKey({items}: {items: {label: string; color: string; kind?: 'bar' | 'line' | 'dash'}[]}) {
  return (
    <ul className="chart-key">
      {items.map(i => (
        <li key={i.label}>
          <i className={`sw sw-${i.kind ?? 'bar'}`} style={i.kind === 'line' || i.kind === 'dash' ? {borderTopColor: i.color} : {background: i.color}} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
