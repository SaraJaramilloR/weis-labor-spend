import {useDeferredValue, useId, useMemo, useState, type ReactNode} from 'react';
import {downloadCsv, EXPORT_NOTE, toCsv, type Cell} from '../lib/csv';
import {EmptyState} from './ui';

export type Column<R> = {
  key: string;
  header: string;
  /** Sort and export value. */
  value: (r: R) => number | string | null;
  /** Display; defaults to the value. */
  render?: (r: R) => ReactNode;
  align?: 'left' | 'right';
  /** Short note under the header (e.g. "excl. RX"). */
  sub?: string;
  group?: string;
};

type Sort = {key: string; dir: 'asc' | 'desc'} | null;

/**
 * Sortable, searchable table with optional pinned rows (totals and benchmarks) that never sort or filter.
 * Export writes exactly the visible (filtered and sorted) rows.
 */
export function DataTable<R>({
  rows,
  columns,
  rowKey,
  label,
  searchText,
  pinned = [],
  pinnedLabel,
  onRowClick,
  selectedKey,
  initialSort = null,
  exportName,
  empty = 'No rows match the current filters.',
  maxHeight = 420,
}: {
  rows: R[];
  columns: Column<R>[];
  rowKey: (r: R) => string;
  label: string;
  searchText?: (r: R) => string;
  pinned?: R[];
  pinnedLabel?: (r: R) => string;
  onRowClick?: (r: R) => void;
  selectedKey?: string | null;
  initialSort?: Sort;
  exportName?: string;
  empty?: string;
  maxHeight?: number;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(initialSort);
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const filtered = q && searchText ? rows.filter(r => searchText(r).toLowerCase().includes(q)) : rows;
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, columns, sort, deferredQuery, searchText]);

  const toggleSort = (key: string) => setSort(s => (s?.key === key ? (s.dir === 'desc' ? {key, dir: 'asc'} : null) : {key, dir: 'desc'}));

  const exportCsv = () => {
    const all = [...pinned, ...visible];
    const body: Cell[][] = all.map(r => columns.map(c => c.value(r)));
    downloadCsv(exportName ?? label, toCsv(columns.map(c => (c.sub ? `${c.header} (${c.sub})` : c.header)), body, [EXPORT_NOTE]));
  };

  const groups = columns.some(c => c.group) ? groupSpans(columns) : null;

  return (
    <div className="data-table">
      <div className="table-tools">
        {searchText ? (
          <div className="table-search">
            <label htmlFor={searchId} className="sr-only">
              Search {label}
            </label>
            <input id={searchId} type="search" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" maxLength={60} />
          </div>
        ) : null}
        <span className="table-count" aria-live="polite">
          {visible.length} of {rows.length} rows
        </span>
        {exportName ? (
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        ) : null}
      </div>
      <div className="table-wrap" style={{maxHeight}}>
        <table aria-label={label}>
          <thead>
            {groups ? (
              <tr className="group-row">
                {groups.map((g, i) => (
                  <th key={`${g.name}-${i}`} colSpan={g.span} scope="colgroup" className={g.name ? 'grouped' : ''}>
                    {g.name}
                  </th>
                ))}
              </tr>
            ) : null}
            <tr>
              {columns.map(c => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" className={c.align === 'left' ? 'txt' : ''} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      <span aria-hidden="true" className="sort-mark">
                        {active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </span>
                    </button>
                    {c.sub ? <span className="th-sub">{c.sub}</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pinned.map(r => (
              <tr key={`pinned-${rowKey(r)}`} className="pinned">
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === 'left' ? 'txt' : ''}>
                    {i === 0 && pinnedLabel ? pinnedLabel(r) : c.render ? c.render(r) : display(c.value(r))}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="txt">
                  <EmptyState>{empty}</EmptyState>
                </td>
              </tr>
            ) : (
              visible.map(r => {
                const key = rowKey(r);
                return (
                  <tr key={key} className={`${onRowClick ? 'clickable' : ''}${selectedKey === key ? ' selected' : ''}`} aria-selected={onRowClick ? selectedKey === key : undefined}>
                    {columns.map((c, i) => (
                      <td key={c.key} className={c.align === 'left' ? 'txt' : ''}>
                        {i === 0 && onRowClick ? (
                          <button type="button" className="rowlink" onClick={() => onRowClick(r)} aria-pressed={selectedKey === key}>
                            {c.render ? c.render(r) : display(c.value(r))}
                          </button>
                        ) : c.render ? (
                          c.render(r)
                        ) : (
                          display(c.value(r))
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const display = (v: number | string | null) => (v === null ? 'n/a' : String(v));

function groupSpans<R>(columns: Column<R>[]): {name: string; span: number}[] {
  const out: {name: string; span: number}[] = [];
  for (const c of columns) {
    const name = c.group ?? '';
    const last = out[out.length - 1];
    if (last && last.name === name) last.span++;
    else out.push({name, span: 1});
  }
  return out;
}
