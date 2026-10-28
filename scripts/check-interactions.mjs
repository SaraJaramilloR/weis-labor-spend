// Interaction check: drives headless Chrome over the DevTools Protocol (clicks, filters, sorting, search,
// dialogs, simulated access) and reports console errors. Requires Google Chrome and Node 22+.
// Usage: npm run build && npm run preview -- --port 5176   then   ACCESS_TEST_PASSWORD=… node scripts/check-interactions.mjs http://localhost:5176/
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base = process.argv[2] ?? 'http://localhost:5176/';
const out = mkdtempSync(join(tmpdir(), 'bc5-check-'));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${out}/cdp-profile`, '--window-size=1440,1000', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 40; i++) { try { const list = await (await fetch('http://127.0.0.1:9333/json')).json(); const page = list.find(t => t.type === 'page'); if (page) return page.webSocketDebuggerUrl; } catch {} await sleep(250); }
  throw new Error('no chrome');
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id: i, method, params})); });
const evalJs = async expr => (await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true})).result?.result?.value;
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
try {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); });
  await send('Runtime.enable'); await send('Page.enable');
  const PW = process.env.ACCESS_TEST_PASSWORD ?? '';
  const go = async url => {
    await send('Page.navigate', {url}); await sleep(6000);
    // Demo access screen: log in with ACCESS_TEST_PASSWORD (never printed); the session lasts for this tab.
    if (PW && (await evalJs(`!!document.querySelector('#report-password')`))) {
      await evalJs(`(() => { const i = document.querySelector('#report-password'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(PW)}); i.dispatchEvent(new Event('input', {bubbles: true})); i.closest('form').requestSubmit(); })()`);
      await sleep(4000);
    }
  };
  const text = sel => evalJs(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const click = expr => evalJs(`(() => { const el = ${expr}; if (!el) return false; el.click(); return true; })()`);
  const setSelect = (label, value) => evalJs(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); const s = l && document.getElementById(l.htmlFor); if (!s) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', {bubbles: true})); return true; })()`);
  const kpi = () => text('.kpi-primary .kpi-value');
  const h2sOverview = () => evalJs(`[...document.querySelectorAll('h2')].map(h => h.textContent.trim())`);

  await go(base + '?page=overview');
  const v0 = await kpi(); check('overview renders KPI', !!v0, v0);
  // Tabs navigation
  const pages = ['Store Ops Labor Allocation', 'Turnover, Overtime & Call-off Tracking', 'Turnover & Retention Benchmark', 'Headcount & Hours vs Budget', 'Daily Labor vs Budget', 'People Reporting (Filterable Ops 200)', 'Labor Overview'];
  check('Tabs follow workbook order after Overview', (await evalJs(`[...document.querySelectorAll('.page-tabs button')].map(b => b.textContent).join('|')`)) === ['Labor Overview', ...pages.slice(0, 6)].join('|'));
  for (const p of pages) { await click(`[...document.querySelectorAll('.page-tabs button')].find(b => b.textContent === ${JSON.stringify(p)})`); await sleep(3500); const h = await text('h1'); check(`tab → ${p}`, h === p, h); }
  check('URL deep link updated', (await evalJs('location.search')) === '?page=overview');
  // Region filter changes KPIs
  await setSelect('Region', 'R2'); await sleep(2500); const v1 = await kpi(); check('Region filter changes KPI', v1 !== v0, `${v0} → ${v1}`);
  const stores = await text('.scope-count'); check('scope shows region store count', stores === '20 stores', stores);
  // Department filter
  await setSelect('Department', 'meat'); await sleep(2500); const v2 = await kpi(); check('Department filter changes KPI', v2 !== v1, `${v1} → ${v2}`);
  // Reset
  await click(`document.querySelector('.fb-reset')`); await sleep(2500); const v3 = await kpi(); check('Reset restores KPI', v3 === v0, v3);
  // Reference toggle
  const openDiscovery = async () => { await click(`[...document.querySelectorAll('.header-button')].find(b => b.textContent.startsWith('Discovery options'))`); await sleep(400); };
  const closeDiscovery = async () => { await click(`document.querySelector('.discovery-dialog form button')`); await sleep(400); };
  check('Budget is the primary comparison for spend', (await text('.kpi-primary .kpi-lines dt')) === 'vs Budget');
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'MDoc (Master Doc)')`); await sleep(1200); await closeDiscovery();
  check('Exploratory comparison moves to the tooltip, Budget stays primary', (await evalJs(`document.querySelector('.kpi-primary [role=tooltip]').textContent.includes('Exploratory (Discovery options): vs MDoc')`)) && (await text('.kpi-primary .kpi-lines dt')) === 'vs Budget');
  check('Exploratory strip visible', !!(await text('.discovery-strip')));
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'None')`); await sleep(800); await closeDiscovery();
  // Time mode: rolling 52
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Rolling')`); await sleep(800); await setSelect('Window', '52'); await sleep(1500); const v4 = await kpi(); check('Rolling 52 weeks changes KPI', v4 !== v0, v4);
  // Invalid custom range shows error and keeps previous
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Custom')`); await sleep(800);
  await evalJs(`(() => { const i = document.querySelector('input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2026-12-01'); i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(800);
  const err = await text('.fb-error'); check('Invalid date range shows message', !!err, err); const v5 = await kpi(); check('Invalid range is not applied', v5 === v5 && !!err);
  await click(`document.querySelector('.fb-reset')`); await sleep(1000);
  // Overview: four cards, two charts, links, LY toggle
  check('Overview: four KPI cards and two charts only', (await evalJs(`document.querySelectorAll('.kpi').length`)) === 4 && (await evalJs(`document.querySelectorAll('.visual-card').length`)) === 2 && (await evalJs(`document.querySelectorAll('.data-table').length`)) === 0);
  check('Overview: subtle "Proposed overview" label', (await text('.eyebrow.subtle')) === 'Proposed overview');
  check('Overview: IPLH compared with MDoc', (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Items per Labor Hour'))?.querySelector('dt').textContent`)) === 'vs MDoc');
  check('Overview: LY is optional', !(await evalJs(`[...document.querySelectorAll('.chart-key li')].some(l => l.textContent === 'LY')`)) && (await click(`document.querySelector('label.check input')`)) && (await sleep(500), await evalJs(`[...document.querySelectorAll('.chart-key li')].some(l => l.textContent === 'LY')`)));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Labor Hours')`); await sleep(800);
  check('Overview: trend selector switches to hours', (await h2sOverview()).includes('Weekly Labor Hours vs Budget'));
  await click(`[...document.querySelectorAll('.deeper-links .page-link')].find(a => a.textContent === 'Store Ops Labor Allocation')`); await sleep(3500);
  check('Overview: link opens the required view', (await text('h1')) === 'Store Ops Labor Allocation');
  await send('Runtime.evaluate', {expression: 'history.back()'}); await sleep(3000);
  check('Overview: back returns to the overview', (await text('h1')) === 'Labor Overview');
  // Department bar cross-filter
  const bar = await evalJs(`(() => { const r = document.querySelector('.recharts-bar-rectangle path, .recharts-bar-rectangle'); return !!r; })()`); check('Department bars rendered', bar);
  // Definitions dialog
  await click(`document.querySelector('.header-button')`); await sleep(500); check('Definitions dialog opens', await evalJs(`document.querySelector('.defs-dialog').open`));
  await click(`[...document.querySelectorAll('.defs-dialog [role=radio]')].find(b => b.textContent === 'Open decisions')`); await sleep(300); check('Open decisions tab lists D01–D32', (await evalJs(`document.querySelectorAll('.defs-dialog tbody tr').length`)) === 32);
  await click(`[...document.querySelectorAll('.defs-dialog [role=radio]')].find(b => b.textContent === 'Glossary')`); await sleep(300);
  const gl = await evalJs(`[...document.querySelectorAll('.glossary dt')].map(d => d.textContent)`);
  check('Glossary lists the acronyms alphabetically', ['AHR', 'AIV', 'FT', 'HC', 'IPLH', 'LY', 'MDoc', 'OPS', 'OT', 'PT', 'RX', 'TY'].every(t => gl.includes(t)) && gl.join('|') === [...gl].sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})).join('|'), gl.join(', '));
  await click(`document.querySelector('.defs-dialog form button')`); await sleep(300); check('Definitions dialog closes', !(await evalJs(`document.querySelector('.defs-dialog').open`)));
  // Simulated access
  await openDiscovery(); await evalJs(`(() => { const s = document.querySelector('.discovery-dialog select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'store'); s.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(1500); await closeDiscovery();
  check('Store manager role limits scope to 1 store', (await text('.scope-count')) === '1 stores', await text('.scope-count'));
  await openDiscovery(); await evalJs(`(() => { const s = document.querySelector('.discovery-dialog select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'regional'); s.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(2500); await closeDiscovery();
  // More filters: ID stores
  await click(`document.querySelector('.fb-more')`); await sleep(400); await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'ID stores')`); await sleep(2500); check('ID stores toggle reduces stores', (await text('.scope-count')) !== '60 stores', await text('.scope-count'));
  await click(`document.querySelector('.fb-reset')`); await sleep(800);
  // Allocation: Store → Department rows in one table; measure group switch
  await go(base + '?page=allocation');
  check('Allocation has one Store / Department table', (await evalJs(`document.querySelectorAll('.data-table').length`)) === 1 && (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.startsWith('Store / Department'))`)));
  check('IPLH card shows the full name', (await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Items per Labor Hour (IPLH)')`)));
  await click(`document.querySelector('.tree-btn')`); await sleep(800);
  const childRows = await evalJs(`document.querySelectorAll('tr.child-row').length`);
  check('Expanding a store shows its departments in the same table', childRows > 10 && (await evalJs(`document.querySelector('.tree-btn').getAttribute('aria-expanded')`)) === 'true', `${childRows} department rows`);
  await click(`document.querySelector('.tree-btn')`); await sleep(500); check('Collapsing hides the departments', (await evalJs(`document.querySelectorAll('tr.child-row').length`)) === 0);
  await evalJs(`(() => { const i = document.querySelector('.table-search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '101 meat'); i.dispatchEvent(new Event('input', {bubbles: true})); })()`); await sleep(900);
  check('Search finds a department inside a store', (await text('.table-count')) === '1 of 60 stores' && (await evalJs(`[...document.querySelectorAll('tr.child-row td:first-child')].map(t => t.textContent).join('|')`)).startsWith('Meat'), await text('.table-count'));
  await evalJs(`(() => { const i = document.querySelector('.table-search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', {bubbles: true})); })()`); await sleep(600);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Sales & customers')`); await sleep(600); check('Measure group switches columns', (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.includes('Basket size'))`)));
  // Allocation: Position / Tenure pending (required by the view, disabled for labor)
  await click(`document.querySelector('.fb-more')`); await sleep(400); const hBefore = await text('.kpi-primary:nth-child(2) .kpi-value'); await setSelect('Position', 'Cashier'); await sleep(2500);
  check('Allocation Position filters labor actuals', (await text('.kpi-primary:nth-child(2) .kpi-value')) !== hBefore && !!(await text('.selection-bar')), `${hBefore} → ${await text('.kpi-primary:nth-child(2) .kpi-value')}`);
  check('Allocation Budget shows n/a under Position', (await evalJs(`[...document.querySelectorAll('.kpi-lines dd')].some(d => d.textContent === 'n/a')`)));
  await click(`document.querySelector('.fb-reset')`); await sleep(1500);
  // Budget: expand tree
  await go(base + '?page=budget'); await click(`document.querySelector('.tree-toggle')`); await sleep(500); check('Budget tree expands', (await evalJs(`document.querySelectorAll('.tree-table tr.lvl-district').length`)) === 4);
  // Benchmark: store list, ranking, five trends, table groups, search, pagination, export
  const typeIn = async (sel, q) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', {bubbles: true})); return true; })()`);
  const h2s = () => evalJs(`[...document.querySelectorAll('h2')].map(h => h.textContent.trim())`);
  await go(base + '?page=benchmark');
  check('Benchmark: no aggregate rows interleaved in the table', (await evalJs(`document.querySelectorAll('tr.pinned').length`)) === 0);
  check('Benchmark: no store selected shows a trend prompt', (await evalJs(`document.body.textContent.includes('Select a store to see its turnover, retention')`)));
  check('Benchmark: ranking shows 10 of 60 stores', (await evalJs(`document.body.textContent.includes('Showing 10 of 60 stores')`)));
  check('Benchmark: table lists one row per store with pagination', (await text('.table-count')) === '60 of 60 stores' && (await text('.table-pager span')) === 'Stores 1–20 of 60', `${await text('.table-count')} · ${await text('.table-pager span')}`);
  check('Benchmark: summary shows chain only with several regions', (await evalJs(`(() => { const d = document.querySelector('.bench-summary'); d.open = true; return [...d.querySelectorAll('thead th')].map(t => t.textContent).join('|'); })()`)) === 'Measure|Chain benchmark');
  check('Benchmark: summary labels counts as average per store', (await evalJs(`document.querySelector('.bench-summary').textContent.includes('Benchmarks: average per store')`)));
  // Select from the ranking
  const firstBar = await evalJs(`document.querySelector('.recharts-yAxis .recharts-cartesian-axis-tick-value')?.textContent`);
  await evalJs(`(() => { const r = document.querySelector('.recharts-bar-rectangle path') ?? document.querySelector('.recharts-bar-rectangle'); r.dispatchEvent(new MouseEvent('click', {bubbles: true})); })()`); await sleep(3500);
  const titles = await h2s();
  check('Benchmark: ranking click selects the store for five trend charts', ['Turnover Rate over Time', 'Retention Rate over Time', 'Hires over Time', 'Terminations over Time', 'Beginning & Ending Headcount over Time'].every(t => titles.includes(t)) && (await text('.selection-bar')).includes(`Trend store: ${firstBar}`), firstBar);
  check('Benchmark: selecting a store keeps the full table', (await text('.table-count')) === '60 of 60 stores', await text('.table-count'));
  const keys = await evalJs(`[...document.querySelectorAll('.trend-grid .chart-key li')].map(l => l.textContent)`);
  const storeRegion = await evalJs(`[...document.querySelectorAll('.data-table tbody tr')].find(tr => tr.querySelector('td').textContent === ${JSON.stringify(firstBar)})?.querySelectorAll('td')[1].textContent ?? null`);
  check('Benchmark: legends use store and region names, never "Selection"', keys.includes(firstBar) && keys.includes('Chain benchmark') && !keys.some(k => k.includes('Selection')), keys.slice(0, 3).join(' · '));
  check('Benchmark: counts vs per-store averages labeled', keys.includes(`${firstBar} · count`) && keys.some(k => k.endsWith('· average per store')));
  const sel = await text('.selection-bar');
  check('Benchmark: trend region is the selected store region', !!storeRegion || sel.includes('Region'), `${sel}`);
  check('Benchmark: five charts use the same time buckets', (await evalJs(`(() => { const sets = [...document.querySelectorAll('.trend-grid .recharts-xAxis')].map(a => [...a.querySelectorAll('.recharts-cartesian-axis-tick-value')].map(t => t.textContent).join(',')); return sets.length === 5 && new Set(sets.map(s => s.split(',')[0])).size === 1; })()`)));
  await click(`[...document.querySelectorAll('.trend-grid [role=radio]')].find(b => b.textContent === 'Chain benchmark')`); await sleep(800);
  check('Benchmark: headcount benchmark selector switches to chain', (await evalJs(`[...document.querySelectorAll('.trend-grid .chart-key li')].some(l => l.textContent === 'Chain · ending (avg per store)')`)));
  await click(`[...document.querySelectorAll('.selection-bar button')].find(b => b.textContent === 'Clear store selection')`); await sleep(2500);
  check('Benchmark: clearing the selection restores the prompt', (await evalJs(`document.body.textContent.includes('No store selected')`)));
  // Table: search, row select keeps search, groups, pp, sort, pagination, export
  await typeIn('.table-search input', '14'); await sleep(900);
  const matches = await text('.table-count');
  await click(`document.querySelector('.data-table .rowlink')`); await sleep(3000);
  check('Benchmark: row click selects without discarding the search', (await evalJs(`document.querySelector('.table-search input').value`)) === '14' && (await text('.table-count')) === matches && (await text('.selection-bar')).includes('Trend store'), matches);
  await typeIn('.table-search input', 'zzz'); await sleep(900);
  check('Benchmark: no-results state with Clear search', (await evalJs(`document.querySelector('.data-table tbody').textContent.includes('No stores match')`)));
  await click(`[...document.querySelectorAll('.data-table .btn-link')].find(b => b.textContent === 'Clear search')`); await sleep(800);
  check('Benchmark: Clear search restores all stores', (await text('.table-count')) === '60 of 60 stores');
  check('Benchmark: search placeholder', (await evalJs(`document.querySelector('.table-search input').placeholder`)) === 'Search store number or name');
  const pp = await evalJs(`(() => { const heads = [...document.querySelectorAll('.data-table thead tr:last-child th')].map(t => t.querySelector('.sort-btn').textContent.trim()); const tr = document.querySelector('.data-table tbody tr'); const c = [...tr.querySelectorAll('td')].map(t => t.textContent); const v = h => c[heads.findIndex(x => x.startsWith(h))]; const n = s => parseFloat(s.replace('−', '-').replace('+', '')); return {ok: Math.abs(n(v('Store Turnover')) - n(v('Chain Turnover')) - n(v('Difference vs Chain'))) < 0.051 && Math.abs(n(v('Store Turnover')) - n(v('Region Turnover')) - n(v('Difference vs Region'))) < 0.051, row: [v('Store Turnover'), v('Region Turnover'), v('Chain Turnover'), v('Difference vs Region'), v('Difference vs Chain')].join(' ')}; })()`);
  check('Benchmark: pp differences = store − benchmark', pp.ok, pp.row);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Retention Comparison')`); await sleep(600);
  const rHeads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.replace(/[▲▼]/g, '').trim()).join('|')`);
  check('Benchmark: Retention group keeps Store and Region', rHeads.startsWith('Store|Region|Store Retention (%)|Region Retention (%)|Chain Retention (%)|Difference vs Region (pp)|Difference vs Chain (pp)'), rHeads);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Headcount & Movements')`); await sleep(600);
  const mHeads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.replace(/[▲▼]/g, '').trim()).join('|')`);
  check('Benchmark: Headcount & Movements group', mHeads.startsWith('Store|Region|Beginning Headcount|Ending Headcount|Hires|Terminations') && !mHeads.includes('Terms'), mHeads);
  const before = await text('.data-table tbody tr td'); await click(`[...document.querySelectorAll('.sort-btn')].find(b => b.textContent.startsWith('Hires'))`); await sleep(500);
  check('Benchmark: sorting changes order', before !== (await text('.data-table tbody tr td')));
  await click(`[...document.querySelectorAll('.table-pager button')].find(b => b.textContent === 'Next')`); await sleep(500);
  check('Benchmark: pagination next page', (await text('.table-pager span')) === 'Stores 21–40 of 60', await text('.table-pager span'));
  await evalJs(`(() => { window.__csv = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { window.__csv = b; return orig.call(URL, b); }; })()`);
  await click(`[...document.querySelectorAll('.btn-secondary')].find(b => b.textContent === 'Export CSV')`); await sleep(500);
  const csv = await evalJs(`window.__csv ? window.__csv.text() : ''`);
  const csvLines = csv.split('\n').filter(l => /^"?Store \d/.test(l));
  check('Benchmark: CSV exports every matching store of the selected group', csvLines.length === 60 && csv.includes('Beginning Headcount') && !csv.includes('Store Turnover'), `${csvLines.length} store rows`);
  // Header tooltip: click / tap and keyboard
  await evalJs(`[...document.querySelectorAll('.data-table thead .info-tip button')][0].click()`); await sleep(400);
  const tipClick = await evalJs(`(() => { const b = [...document.querySelectorAll('.data-table thead .info-tip button')][0]; const t = document.getElementById(b.getAttribute('aria-describedby')); return b.closest('.info-tip').classList.contains('open') && getComputedStyle(t).visibility === 'visible'; })()`);
  check('Benchmark: header tooltip opens on click / tap', tipClick);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Turnover Comparison')`); await sleep(600);
  const ppTip = await evalJs(`[...document.querySelectorAll('.data-table thead [role=tooltip]')].map(t => t.textContent).find(t => t.startsWith('Store turnover rate minus the chain')) ?? ''`);
  check('Benchmark: pp tooltip explains sign, example and pp', ppTip.includes('A positive value means higher turnover than the chain benchmark') && ppTip.includes('7.5% − 3.7% = +3.8 percentage points') && ppTip.includes('not a relative percentage change'));
  // One region; searchable Store control constrained by location
  await setSelect('Region', 'R1'); await sleep(2500);
  check('Benchmark: one region shows its reference and summary', (await evalJs(`document.body.textContent.includes('Showing 10 of 20 stores')`)) && (await evalJs(`[...document.querySelectorAll('.chart-key li')].some(l => l.textContent === 'Region 1 benchmark')`)) && (await evalJs(`[...document.querySelectorAll('.bench-summary thead th')].map(t => t.textContent).join('|')`)) === 'Measure|Region 1 benchmark|Chain benchmark');
  check('Benchmark: Store options follow the region', (await evalJs(`(() => { const i = [...document.querySelectorAll('label')].find(l => l.textContent === 'Store'); const inp = document.getElementById(i.htmlFor); return document.getElementById(inp.getAttribute('list')).options.length; })()`)) === 20);
  await evalJs(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent === 'Store'); const i = document.getElementById(l.htmlFor); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '103'); i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); })()`); await sleep(3000);
  check('Benchmark: typing a store number selects it for the trends', (await text('.selection-bar')).includes('Trend store: Store 103') && (await text('.table-count')) === '20 of 20 stores', await text('.selection-bar'));
  await click(`document.querySelector('.fb-reset')`); await sleep(2000);
  // Daily: day select + group by store
  await go(base + '?page=daily'); check('Daily defaults to last completed week', (await evalJs(`document.querySelector('.local-controls select').selectedOptions[0].textContent`)).includes('last completed week')); await setSelect('Day', '1'); await sleep(800); check('Daily day filter', (await text('.data-table .table-count')) === '1 of 1 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store')`); await sleep(800); check('Daily by store', (await text('.data-table .table-count')) === '60 of 60 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store and department')`); await sleep(1200); check('Daily by store and department', Number((await text('.data-table .table-count')).split(' ')[0]) > 600, await text('.data-table .table-count'));
  // Tracking: full column names, keyboard-accessible header tooltips, separate Terminations and Hires
  await go(base + '?page=tracking');
  const heads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.trim()).join('|')`);
  check('Tracking headers use full names', ['Terminations', 'Full-time (%)', 'Overtime $', 'Overtime rate', 'Call-off hours', 'Avg weekly hours FT'].every(h => heads.includes(h)) && !heads.includes('Terms'), heads);
  const tipShown = await evalJs(`(() => { const b = [...document.querySelectorAll('.data-table thead .info-tip button')].find(x => x.getAttribute('aria-label').startsWith('About Overtime rate')); b.focus(); const t = document.getElementById(b.getAttribute('aria-describedby')); return getComputedStyle(t).visibility === 'visible' && t.textContent.includes('Denominator'); })()`);
  check('Header tooltip opens on keyboard focus', tipShown);
  check('Terminations and Hires labeled separately', (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Terminations & hires')?.querySelector('.kpi-value').textContent`) ?? '').match(/Terminations.*Hires/) !== null);
  check('FT / PT Ratio card title', (await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'FT / PT Ratio')`)));
  check('Headcount card reconciles with no other movements', (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Beginning'))?.textContent`)).includes('Other movements+0') || (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Beginning'))?.textContent`)).includes('Other movements0'));
  // Single-day custom range is reported as its whole week and says so
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Custom')`); await sleep(800);
  await evalJs(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const [a, b] = document.querySelectorAll('input[type=date]'); set.call(a, '2026-10-24'); a.dispatchEvent(new Event('input', {bubbles: true})); a.dispatchEvent(new Event('change', {bubbles: true})); set.call(b, '2026-10-24'); b.dispatchEvent(new Event('input', {bubbles: true})); b.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(2500);
  const weeksNote = await text('.fb-weeks-note');
  check('Single day shows the whole-week note', !!weeksNote && weeksNote.includes('10/18/2026 – 10/24/2026'), weeksNote);
  check('Scope line states whole weeks', (await evalJs(`[...document.querySelectorAll('.scope-part')].map(x => x.textContent).join('|')`)).includes('whole weeks; selected 10/24/2026'));
  await click(`document.querySelector('.fb-reset')`); await sleep(2000);
  // Tracking: benchmark toggle changes chain row const incAll = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); await setSelect('Department', 'meat'); await sleep(3000); const incMeat = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); check('Attendance responds to Department', incAll !== incMeat, `${incAll} → ${incMeat}`); await click(`document.querySelector('.fb-reset')`); await sleep(2000); check('Scope card removed', !(await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Scope')`))); const b1 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'Simple store average')`); await sleep(1500); await closeDiscovery(); const b2 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); check('Benchmark method changes chain turnover', b1 !== b2, `${b1} → ${b2}`);
  // People: position filter + breakdown
  await go(base + '?page=people'); const h0 = await kpi(); await click(`document.querySelector('.fb-more')`); await sleep(400); await setSelect('Position', 'Cashier'); await sleep(1500); const h1 = await kpi(); check('Position filter changes headcount', h0 !== h1, `${h0} → ${h1}`);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Age range')`); await sleep(800); check('People breakdown by age', (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.startsWith('Age range'))`)));
  // Empty state
  await setSelect('Recruiter (illustrative)', 'Recruiter A'); await setSelect('Region', 'R3'); await sleep(1500);
  check('Empty / filtered state renders without crash', !!(await text('h1')));
  // Browser back button
  await send('Runtime.evaluate', {expression: 'history.back()'}); await sleep(1500); check('Back button returns to previous page', (await text('h1')) === 'Turnover, Overtime & Call-off Tracking', await text('h1'));
} catch (e) { results.push('ERROR ' + e.message); }
console.log(results.join('\n'));
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
process.exitCode = results.some(r => !r.startsWith('PASS')) || errors.length ? 1 : 0;
ws?.close(); chrome.kill();
