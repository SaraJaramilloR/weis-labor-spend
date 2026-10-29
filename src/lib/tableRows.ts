// Pure search and sort logic for DataTable (flat and multi-level tables), kept out of the component so it can be tested.

export type SortState = {key: string; dir: 'asc' | 'desc'} | null;
export type SortValue = number | string | null;

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Case-insensitive search terms (letters and digits only); every term must match. */
export const searchTerms = (query: string) => words(query);

/** Every term must match the start of a word, so "05" finds "District 05" but not "Store 105". */
const matches = (text: string, terms: string[]) => {
  const w = words(text);
  return terms.every(term => w.some(x => x.startsWith(term)));
};

/** Sorts a copy of the rows; nulls (n/a) always go last. */
export function sortRows<R>(rows: R[], value: ((r: R) => SortValue) | null, dir: 'asc' | 'desc'): R[] {
  if (!value) return rows;
  const d = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * d;
  });
}

export type TreeRow<R> = {
  row: R;
  /** Children to show under the row (all of them, or only the ones that match the search), at any depth. */
  children: TreeRow<R>[];
  /** True when the row is listed only because some of its descendants match: they are shown without expanding. */
  openForSearch: boolean;
};

/**
 * Filters a table of any depth (flat, Store → Department, Region → District → Store → Department). A row matches on
 * its ancestors' text plus its own text (so "101 meat" finds the Meat row of Store 101). A row that matches keeps all
 * its descendants; otherwise it is kept, with only the matching descendants, when at least one of them matches.
 */
export function filterTree<R>(rows: R[], query: string, text: (r: R) => string, children?: (r: R) => R[], prefix = ''): TreeRow<R>[] {
  const terms = searchTerms(query);
  const all = (list: R[]): TreeRow<R>[] => list.map(row => ({row, children: children ? all(children(row)) : [], openForSearch: false}));
  if (!terms.length) return all(rows);
  const out: TreeRow<R>[] = [];
  for (const row of rows) {
    const own = `${prefix} ${text(row)}`;
    if (matches(own, terms)) {
      out.push({row, children: children ? all(children(row)) : [], openForSearch: false});
      continue;
    }
    const hits = children ? filterTree(children(row), query, text, children, own) : [];
    if (hits.length) out.push({row, children: hits, openForSearch: true});
  }
  return out;
}

/** Sorts every level of a tree with the same column; each row keeps its own children. */
export function sortTree<R>(nodes: TreeRow<R>[], value: ((r: R) => SortValue) | null, dir: 'asc' | 'desc'): TreeRow<R>[] {
  if (!value) return nodes;
  const byRow = new Map(nodes.map(n => [n.row, n]));
  return sortRows(nodes.map(n => n.row), value, dir).map(r => {
    const n = byRow.get(r)!;
    return {...n, children: sortTree(n.children, value, dir)};
  });
}
