// CSV export of filtered synthetic data. Text cells that a spreadsheet could read as a formula
// (=, +, -, @, tab, carriage return) get a leading apostrophe, and quotes are escaped.
export type Cell = string | number | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][], notes: string[] = []): string {
  const lines = [...notes.map(n => csvCell(`# ${n}`)), header.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))];
  return lines.join('\r\n');
}

/** Triggers a browser download. Filenames are restricted to safe characters. */
export function downloadCsv(filename: string, csv: string) {
  const safe = filename.replace(/[^a-z0-9-_]/gi, '-').toLowerCase().slice(0, 80) || 'export';
  const blob = new Blob(['﻿', csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const EXPORT_NOTE = 'Prototype preview · Illustrative synthetic data · Not Weis business results';
