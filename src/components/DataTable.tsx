import {useDeferredValue, useId, useMemo, useState, type ReactNode} from 'react';
import {downloadCsv, EXPORT_NOTE, toCsv, type Cell} from '../lib/csv';
import {filterTree, sortTree, type SortState, type TreeRow} from '../lib/tableRows';
import {EmptyState, InfoTip} from './ui';

export type Column<R> = {
  key: string;
  header: string;
  /** Sort and export value. */
  value: (r: R) => number | string | null;
  /** Export value when it differs from the sort value (e.g. a day sorted by index, exported as MM/DD/YYYY). */
  exportValue?: (r: R) => number | string | null;
  /** Display; defaults to the value. */
  render?: (r: R) => ReactNode;
  align?: 'left' | 'right';
  /** Short note under the header (e.g. "excl. RX"). */
  sub?: string;
  group?: string;
  /** Header tooltip (full name, meaning, formula, unit, limitations). Opens on hover and on keyboard focus. */
  help?: ReactNode;
};

/** Multi-level tables (Store → Department, Region → District → Store → Department): child rows sit under their
 *  parent inside the same table. */
export type TreeOptions<R> = {
  children: (r: R) => R[];
  /** Level names, top first, for the export "Level" column and the toggle label, e.g. ['Store', 'Department']. */
  levels: string[];
  /** Accessible name of a row, used in "Show departments of …". */
  name: (r: R) => string;
  /** Rows open on first render (for example the only region left by a filter). The user can still close them. */
  defaultOpen?: (r: R) => boolean;
  /** Parent path of a row for the export "Path" column (e.g. "Chain › Region 1 › District 02"). */
  path?: (r: R) => string;
};

type Line<R> = {node: TreeRow<R>; depth: number; parent: R | null; expanded: boolean};
const plural = (level: string) => `${level.toLowerCase()}s`;

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
  rowClickable,
  stickyFirst = true,
  countLabel,
  exportNotes = [],
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
  /** With a tree, which rows `onRowClick` applies to (default: all). */
  rowClickable?: (r: R) => boolean;
  /** Keeps the first (label) column visible during horizontal scrolling (default). */
  stickyFirst?: boolean;
  /** Extra lines written above the CSV header, e.g. the selected week, cutoff and location scope. */
  exportNotes?: string[];
  /** Replaces the "x of y rows" count, e.g. to count stores inside a tree. */
  countLabel?: (visible: TreeRow<R>[]) => string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(initialSort);
  // Rows the user opened (true) or closed (false); other rows follow tree.defaultOpen.
  const [open, setOpen] = useState<Map<string, boolean>>(() => new Map());
  const [pageIndex, setPageIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();

  const visible = useMemo(() => {
    const col = sort ? columns.find(c => c.key === sort.key) : undefined;
    const filtered = filterTree(rows, searchText ? deferredQuery : '', searchText ?? (() => ''), tree?.children);
    return sort && col ? sortTree(filtered, col.value, sort.dir) : filtered;
  }, [rows, columns, sort, deferredQuery, searchText, tree]);

  const isOpen = (n: TreeRow<R>) => n.openForSearch || (open.get(rowKey(n.row)) ?? tree?.defaultOpen?.(n.row) ?? false);
  const toggle = (n: TreeRow<R>) => setOpen(prev => new Map(prev).set(rowKey(n.row), !isOpen(n)));
  /** Visible lines of a list of top-level rows: each row, then its children when it is open, at any depth. */
  const linesOf = (nodes: TreeRow<R>[], depth = 0, parent: R | null = null, out: Line<R>[] = []): Line<R>[] => {
    for (const node of nodes) {
      const expanded = Boolean(tree) && node.children.length > 0 && isOpen(node);
      out.push({node, depth, parent, expanded});
      if (expanded) linesOf(node.children, depth + 1, node.row, out);
    }
    return out;
  };
  const parents = (nodes: TreeRow<R>[], out: TreeRow<R>[] = []): TreeRow<R>[] => {
    for (const n of nodes) if (n.children.length) out.push(n, ...parents(n.children));
    return out;
  };
  const allOpen = tree ? parents(visible).every(isOpen) : false;
  const toggleAll = () => setOpen(new Map(parents(visible).map(n => [rowKey(n.row), !allOpen])));

  const toggleSort = (key: string) => {
    setPageIndex(0);
    setSortKey(key);
  };
  const setSortKey = (key: string) => setSort(s => (s?.key === key ? (s.dir === 'desc' ? {key, dir: 'asc'} : null) : {key, dir: 'desc'}));

  const exportCsv = () => {
    const lines: {r: R; level: string}[] = [...pinned.map(r => ({r, level: 'Total'})), ...linesOf(visible).map(l => ({r: l.node.row, level: tree?.levels[l.depth] ?? ''}))];
    const head = columns.map(c => (c.sub ? `${c.header} (${c.sub})` : c.header));
    const withPath = Boolean(tree?.path);
    const body: Cell[][] = lines.map(({r, level}) => [...(tree ? [level] : []), ...(withPath ? [tree!.path!(r)] : []), ...columns.map(c => (c.exportValue ?? c.value)(r))]);
    downloadCsv(exportName ?? label, toCsv(tree ? ['Level', ...(withPath ? ['Path'] : []), ...head] : head, body, [EXPORT_NOTE, ...exportNotes]));
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
          {countLabel ? countLabel(visible) : `${visible.length} of ${rows.length} ${countNoun}`}
        </span>
        {tree ? (
          <button type="button" className="btn-link" onClick={toggleAll} disabled={visible.length === 0}>
            {tree.levels.length === 2 ? `${allOpen ? 'Collapse' : 'Expand'} all ${plural(tree.levels[1])}` : allOpen ? 'Collapse all levels' : 'Expand all levels'}
          </button>
        ) : null}
        {exportName ? (
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        ) : null}
      </div>
      <div className="table-wrap" style={{maxHeight}}>
        <table aria-label={label} className={[tree ? 'tree-rows' : '', stickyFirst ? 'sticky-first' : ''].filter(Boolean).join(' ') || undefined}>
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
              linesOf(shown).map(({node, depth, parent, expanded}) => {
                const r = node.row;
                const key = rowKey(r);
                const clickable = onRowClick && (!rowClickable || rowClickable(r));
                const classes = [clickable ? 'clickable' : '', selectedKey === key ? 'selected' : '', tree ? `tree-depth-${depth}` : '', tree && node.children.length ? 'parent-row' : '', tree && depth > 0 ? 'child-row' : ''].filter(Boolean).join(' ');
                const label = (c: Column<R>) =>
                  clickable ? (
                    <button type="button" className="rowlink" onClick={() => onRowClick!(r)} aria-pressed={selectedKey === key}>
                      {cell(c, r)}
                    </button>
                  ) : (
                    cell(c, r)
                  );
                return (
                  <tr key={key} className={classes || undefined} aria-selected={clickable ? selectedKey === key : undefined}>
                    {columns.map((c, i) => (
                      <td key={c.key} className={c.align === 'left' ? 'txt' : ''}>
                        {i === 0 && tree ? (
                          <span className="tree-cell" style={depth ? {paddingLeft: depth * 18} : undefined}>
                            {node.children.length ? (
                              <button type="button" className="tree-btn" aria-expanded={expanded} disabled={node.openForSearch} onClick={() => toggle(node)} aria-label={`${expanded ? 'Hide' : 'Show'} ${plural(tree.levels[depth + 1] ?? 'row')} of ${tree.name(r)}`}>
                                <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                              </button>
                            ) : (
                              <span className="tree-spacer" aria-hidden="true" />
                            )}
                            <span>{label(c)}</span>
                            {parent ? <span className="sr-only"> ({tree.levels[depth].toLowerCase()} of {tree.name(parent)})</span> : null}
                          </span>
                        ) : i === 0 ? (
                          label(c)
                        ) : (
                          cell(c, r)
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
