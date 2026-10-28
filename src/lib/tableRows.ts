// Pure search and sort logic for DataTable (flat and two-level tables), kept out of the component so it can be tested.

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
  /** Children to show under the row (all of them, or only the ones that match the search). */
  children: R[];
  /** True when the row is listed only because some of its children match: they are shown without expanding. */
  openForSearch: boolean;
};

/**
 * Filters a one- or two-level table. A parent row matches on its own text; a child row matches on the parent text
 * plus its own text (so "101 meat" finds the Meat row of Store 101). A parent whose own text matches keeps all its
 * children; otherwise it is kept, with only the matching children, when at least one child matches.
 */
export function filterTree<R>(rows: R[], query: string, text: (r: R) => string, children?: (r: R) => R[]): TreeRow<R>[] {
  const terms = searchTerms(query);
  const out: TreeRow<R>[] = [];
  for (const row of rows) {
    const kids = children ? children(row) : [];
    if (!terms.length) {
      out.push({row, children: kids, openForSearch: false});
      continue;
    }
    const own = text(row);
    if (matches(own, terms)) {
      out.push({row, children: kids, openForSearch: false});
      continue;
    }
    const hits = kids.filter(k => matches(`${own} ${text(k)}`, terms));
    if (hits.length) out.push({row, children: hits, openForSearch: true});
  }
  return out;
}
