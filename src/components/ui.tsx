import {useId, type ReactNode} from 'react';
import {decisionById} from '../config/definitions';

/** Accessible tooltip: opens on hover and on keyboard focus (BC3 pattern). */
export function InfoTip({text, label = 'About this measure', align = 'center'}: {text: ReactNode; label?: string; align?: 'center' | 'left' | 'right'}) {
  const id = useId();
  return (
    <span className={`info-tip align-${align}`}>
      <button type="button" aria-label={label} aria-describedby={id}>
        i
      </button>
      <span role="tooltip" id={id}>
        {text}
      </span>
    </span>
  );
}

/** Discreet amber marker for a visual affected by an open business decision. */
export function DecisionChip({ids, label = 'Open decision', align = 'right'}: {ids: string[]; label?: string; align?: 'center' | 'left' | 'right'}) {
  const id = useId();
  const items = ids.map(d => decisionById.get(d)).filter(Boolean);
  return (
    <span className={`decision-chip info-tip align-${align}`}>
      <button type="button" aria-describedby={id}>
        <span aria-hidden="true">◆</span> {label}
      </button>
      <span role="tooltip" id={id}>
        {items.map(d => (
          <span key={d!.id} className="tip-line">
            <b>
              {d!.id} · {d!.title}.
            </b>{' '}
            {d!.handling}
          </span>
        ))}
        <span className="tip-line tip-muted">See Definitions &amp; Open Decisions.</span>
      </span>
    </span>
  );
}

/** Marks a value or visual built on illustrative data or an unconfirmed rule. */
export function IllustrativeChip({text = 'Illustrative'}: {text?: string}) {
  return <span className="illustrative-chip">{text}</span>;
}

/** Page heading (UC1 / UC2 pattern: eyebrow, title, business question). The question restates the workbook
 *  user story; design-proposal pages pass none. */
export function PageHeading({eyebrow, title, question, children}: {eyebrow: string; title: string; question?: string | null; children?: ReactNode}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
        </div>
        {children ? <div className="heading-actions">{children}</div> : null}
      </div>
      {question ? (
        <p className="page-question">
          {question}
          <span className="q-src">From the workbook user story</span>
        </p>
      ) : null}
    </>
  );
}

/** Shown where a missing business definition prevents a meaningful value. */
export function PendingState({title, children, decisions}: {title: string; children: ReactNode; decisions?: string[]}) {
  return (
    <div className="pending-state" role="note">
      <strong>
        <span aria-hidden="true">◇ </span>
        {title}
      </strong>
      <p>{children}</p>
      {decisions?.length ? <DecisionChip ids={decisions} align="left" /> : null}
    </div>
  );
}

export function EmptyState({children}: {children: ReactNode}) {
  return (
    <div className="empty-state" role="status">
      {children}
    </div>
  );
}

/** Segmented control (single choice), keyboard accessible as a radio group. */
export function Segmented<T extends string>({label, value, options, onChange, size = 'md'}: {label: string; value: T; options: {id: T; label: string}[]; onChange: (v: T) => void; size?: 'sm' | 'md'}) {
  return (
    <div className={`segmented ${size}`} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Signed variance text with an arrow. Tone is neutral by default: under target is not automatically good. */
export function VarianceText({value, text, tone = 'neutral'}: {value: number | null; text: string; tone?: 'neutral' | 'favourable' | 'unfavourable'}) {
  if (value === null) return <span className="na">n/a</span>;
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '●';
  return (
    <span className={`variance tone-${tone}`}>
      <span aria-hidden="true">{arrow} </span>
      {text}
    </span>
  );
}
