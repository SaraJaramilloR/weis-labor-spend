// Content guards: English-only interface, no client reference files in the bundle, open rules stay labeled.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {DECISIONS, GLOSSARY, KPI_DEFINITIONS} from './config/definitions';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f: string) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) && !f.includes('.test.') ? [p] : [];
  });
}
const SRC = files(join(__dirname));

describe('content guards', () => {
  it('uses no Spanish words in interface code', () => {
    const spanish = /\b(ventas|horas|tienda|tiendas|semana|presupuesto|rotación|empleados|filtros|pendiente|decisión|también|según)\b/i;
    const hits = SRC.filter(f => spanish.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('never imports the client reference folder or spreadsheets', () => {
    const hits = SRC.filter(f => /references\/|\.xlsx|\.xlsm|\.docx/.test(readFileSync(f, 'utf8').replace(/server: \{fs[^\n]*/g, '')));
    expect(hits).toEqual([]);
  });
  it('contains no demo passwords or secrets', () => {
    const hits = SRC.filter(f => /BC[2-5]demo|password\s*[:=]\s*['"`][^'"`]+|api[_-]?key\s*[:=]|VITE_ACCESS_PASSWORD\b(?!_HASH)/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('keeps the required glossary terms', () => {
    const terms = GLOSSARY.map(g => g.term).join(' ');
    for (const t of ['OPS', 'IPLH', 'AHR', 'OT', 'RX', 'FT', 'PT', 'MDoc', 'TY', 'LY', 'WTD', 'QTD', 'YTD', 'ID Stores']) expect(terms).toContain(t);
  });
  it('labels unresolved rules: every referenced decision exists', () => {
    const ids = new Set(DECISIONS.map(d => d.id));
    const used = new Set<string>();
    for (const f of SRC) for (const m of readFileSync(f, 'utf8').matchAll(/'(D\d{2})'/g)) used.add(m[1]);
    for (const k of KPI_DEFINITIONS) for (const d of k.decisions ?? []) used.add(d);
    expect([...used].filter(id => !ids.has(id))).toEqual([]);
    expect(used.has('D03') && used.has('D05') && used.has('D08')).toBe(true);
  });
  it('does not apply the 0.5% overtime or 2% call-off thresholds as status rules', () => {
    const hits = SRC.filter(f => /0\.005\b|0\.02\b.*call|>\s*0\.02/.test(readFileSync(f, 'utf8')) && !f.endsWith('generate.ts') && !f.endsWith('people.ts'));
    expect(hits).toEqual([]);
  });
});
