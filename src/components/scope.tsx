import type {ReactNode} from 'react';
import type {Scope} from '../app/useScope';

/** Content of the "Filters on this visual" popover: applied filters, ignored filters and visual-specific notes. */
export function VisualFilters({scope, notes = [], ignoreDept = false}: {scope: Scope; notes?: ReactNode[]; ignoreDept?: boolean}) {
  const applied = ignoreDept ? scope.applied.filter(a => !a.startsWith('Department:')) : scope.applied;
  const ignored = ignoreDept ? [...scope.ignored, ...scope.applied.filter(a => a.startsWith('Department:'))] : scope.ignored;
  return (
    <>
      <ul className="vf-list">
        {applied.map(a => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {ignored.length ? (
        <p className="vf-ignored">
          <b>Not applied here:</b> {ignored.join(' · ')}
        </p>
      ) : null}
      {notes.map((n, i) => (
        <p key={i} className="vf-note">
          {n}
        </p>
      ))}
    </>
  );
}

/** Always-visible line describing what the page is showing (BC3 "Showing" pattern). */
export function ScopeLine({scope}: {scope: Scope}) {
  return (
    <p className="scope-line">
      <span className="scope-title">Showing</span>
      {scope.applied.map(a => (
        <span key={a} className="scope-part">
          {a}
        </span>
      ))}
      <span className="scope-count">{scope.stores.size} stores</span>
    </p>
  );
}
