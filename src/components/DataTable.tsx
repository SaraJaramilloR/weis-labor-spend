import {useDeferredValue, useId, useMemo, useState, type ReactNode} from 'react';
import {downloadCsv, EXPORT_NOTE, toCsv, type Cell} from '../lib/csv';
import {filterTree, sortRows, type SortState} from '../lib/tableRows';
import {EmptyState, InfoTip} from './ui';

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
  /** Header tooltip (full name, meaning, formula, unit, limitations). Opens on hover and on keyboard focus. */
  help?: ReactNode;
};

/** Two-level tables (for example Store → Department): child rows sit under their parent inside the same table. */
export type TreeOptions<R> = {
  children: (r: R) => R[];
  /** Level names for the export "Level" column and the toggle label, e.g. ['Store', 'Department']. */
  levels: [string, string];
  /** Accessible name of the parent row, used in "Show departments of …". */
  name: (r: R) => string;
};

/**
 * Sortable, searchable table with optional pinned rows (totals and benchmarks) that never sort or filter, and an
 * optional second level of rows. Export writes exactly the visible rows (filtered, sorted and expanded).
 */
export function DataTable<R>({
  rows,
  columns,
  rowKey,
  label,
  searchText,
  searchPlaceholder = 'Search…',
  countNoun = 'rows',
  pinned = [],
  pinnedLabel,
  onRowClick,
  selectedKey,
  initialSort = null,
  exportName,
  empty = 'No rows match the current filters.',
  maxHeight = 420,
  tree,
  pageSize,
}: {
  rows: R[];
  columns: Column<R>[];
  rowKey: (r: R) => string;
  label: string;
  searchText?: (r: R) => string;
  searchPlaceholder?: string;
  countNoun?: string;
  pinned?: R[];
  pinnedLabel?: (r: R) => string;
  onRowClick?: (r: R) => void;
  selectedKey?: string | null;
  initialSort?: SortState;
  exportName?: string;
  empty?: string;
  maxHeight?: number;
  tree?: TreeOptions<R>;
  /** Rows per page; pagination shows when there are more rows. Export always writes every matching row. */
  pageSize?: number;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(initialSort);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const visible = useMemo(() => {
    const col = sort ? columns.find(c => c.key === sort.key) : undefined;
    const sorted = (list: R[]) => (sort && col ? sortRows(list, col.value, sort.dir) : list);
    const filtered = filterTree(rows, searchText ? deferredQuery : '', searchText ?? (() => ''), tree?.children);
    const byRow = new Map(filtered.map(t => [t.row, t]));
    return sorted(filtered.map(t => t.row)).map(r => {
      const t = byRow.get(r)!;
      return {...t, children: sorted(t.children)};
    });
  }, [rows, columns, sort, deferredQuery, searchText, tree]);

  const isOpen = (key: string, openForSearch: boolean) => openForSearch || open.has(key);
  const toggle = (key: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOpen = tree ? visible.every(v => v.children.length === 0 || isOpen(rowKey(v.row), v.openForSearch)) : false;
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(visible.map(v => rowKey(v.row))));

  const toggleSort = (key: string) => {
    setPageIndex(0);
    setSortKey(key);
  };
  const setSortKey = (key: string) => setSort(s => (s?.key === key ? (s.dir === 'desc' ? {key, dir: 'asc'} : null) : {key, dir: 'desc'}));

  const exportCsv = () => {
    const lines: {r: R; level: 0 | 1}[] = [...pinned.map(r => ({r, level: 0 as const}))];
    for (const v of visible) {
      lines.push({r: v.row, level: 0});
      if (isOpen(rowKey(v.row), v.openForSearch)) lines.push(...v.children.map(r => ({r, level: 1 as const})));
    }
    const head = columns.map(c => (c.sub ? `${c.header} (${c.sub})` : c.header));
    const body: Cell[][] = lines.map(({r, level}) => [...(tree ? [tree.levels[level]] : []), ...columns.map(c => c.value(r))]);
    downloadCsv(exportName ?? label, toCsv(tree ? ['Level', ...head] : head, body, [EXPORT_NOTE]));
  };

  const pages = pageSize ? Math.max(1, Math.ceil(visible.length / pageSize)) : 1;
  const pageNow = Math.min(pageIndex, pages - 1);
  const shown = pageSize ? visible.slice(pageNow * pageSize, (pageNow + 1) * pageSize) : visible;
  const groups = columns.some(c => c.group) ? groupSpans(columns) : null;
  const searching = Boolean(searchText && deferredQuery.trim());
  const cell = (c: Column<R>, r: R) => (c.render ? c.render(r) : display(c.value(r)));

  return (
    <div className="data-table">
      <div className="table-tools">
        {searchText ? (
          <div className="table-search">
            <label htmlFor={searchId} className="sr-only">
              Search {label}
            </label>
            <input
              id={searchId}
              type="search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setPageIndex(0);
              }}
              autoComplete="off"
              maxLength={60}
            />
          </div>
        ) : null}
        {searchText && query ? (
          <button type="button" className="btn-link" onClick={() => setQuery('')}>
            Clear search
          </button>
        ) : null}
        <span className="table-count" aria-live="polite">
          {visible.length} of {rows.length} {countNoun}
        </span>
        {tree ? (
          <button type="button" className="btn-link" onClick={toggleAll} disabled={visible.length === 0}>
            {allOpen ? `Collapse all ${tree.levels[1].toLowerCase()}s` : `Expand all ${tree.levels[1].toLowerCase()}s`}
          </button>
        ) : null}
        {exportName ? (
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        ) : null}
      </div>
      <div className="table-wrap" style={{maxHeight}}>
        <table aria-label={label} className={tree ? 'two-level' : undefined}>
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
              {columns.map((c, i) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" className={c.align === 'left' ? 'txt' : ''} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <span className="th-line">
                      <button type="button" className="sort-btn" onClick={() => toggleSort(c.key)}>
                        {c.header}
                        <span aria-hidden="true" className="sort-mark">
                          {active ? (sort!.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                      </button>
                      {c.help ? <InfoTip text={c.help} label={`About ${c.header}${c.sub ? ` (${c.sub})` : ''}`} align={i < 2 ? 'left' : i >= columns.length - 3 ? 'right' : 'center'} /> : null}
                    </span>
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
                    {i === 0 && pinnedLabel ? pinnedLabel(r) : cell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="txt">
                  {searching ? (
                    <EmptyState>
                      No {countNoun} match “{deferredQuery.trim()}”.{' '}
                      <button type="button" className="btn-link" onClick={() => setQuery('')}>
                        Clear search
                      </button>
                    </EmptyState>
                  ) : (
                    <EmptyState>{empty}</EmptyState>
                  )}
                </td>
              </tr>
            ) : (
              shown.flatMap(v => {
                const r = v.row;
                const key = rowKey(r);
                const expanded = isOpen(key, v.openForSearch);
                const parent = (
                  <tr key={key} className={`${onRowClick ? 'clickable' : ''}${selectedKey === key ? ' selected' : ''}${tree ? ' parent-row' : ''}`} aria-selected={onRowClick ? selectedKey === key : undefined}>
                    {columns.map((c, i) => (
                      <td key={c.key} className={c.align === 'left' ? 'txt' : ''}>
                        {i === 0 && tree ? (
                          <span className="tree-cell">
                            {v.children.length ? (
                              <button type="button" className="tree-btn" aria-expanded={expanded} disabled={v.openForSearch} onClick={() => toggle(key)} aria-label={`${expanded ? 'Hide' : 'Show'} ${tree.levels[1].toLowerCase()}s of ${tree.name(r)}`}>
                                <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                              </button>
                            ) : (
                              <span className="tree-spacer" aria-hidden="true" />
                            )}
                            <span>{cell(c, r)}</span>
                          </span>
                        ) : i === 0 && onRowClick ? (
                          <button type="button" className="rowlink" onClick={() => onRowClick(r)} aria-pressed={selectedKey === key}>
                            {cell(c, r)}
                          </button>
                        ) : (
                          cell(c, r)
                        )}
                      </td>
                    ))}
                  </tr>
                );
                if (!tree || !expanded) return [parent];
                return [
                  parent,
                  ...v.children.map(ch => (
                    <tr key={`${key}/${rowKey(ch)}`} className="child-row">
                      {columns.map((c, i) => (
                        <td key={c.key} className={c.align === 'left' ? 'txt' : ''}>
                          {cell(c, ch)}
                          {i === 0 ? <span className="sr-only"> ({tree.levels[1].toLowerCase()} of {tree.name(r)})</span> : null}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })
            )}
          </tbody>
        </table>
      </div>
      {pageSize && visible.length > pageSize ? (
        <nav className="table-pager" aria-label={`${label} pages`}>
          <span aria-live="polite">
            {countNoun[0].toUpperCase() + countNoun.slice(1)} {pageNow * pageSize + 1}–{Math.min(visible.length, (pageNow + 1) * pageSize)} of {visible.length}
          </span>
          <button type="button" className="btn-secondary" onClick={() => setPageIndex(pageNow - 1)} disabled={pageNow === 0}>
            Previous
          </button>
          <span>
            Page {pageNow + 1} of {pages}
          </span>
          <button type="button" className="btn-secondary" onClick={() => setPageIndex(pageNow + 1)} disabled={pageNow >= pages - 1}>
            Next
          </button>
        </nav>
      ) : null}
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
