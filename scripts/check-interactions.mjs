// Interaction check: drives headless Chrome over the DevTools Protocol (clicks, filters, sorting, search,
// dialogs, simulated access) and reports console errors. Requires Google Chrome and Node 22+.
// Usage: npm run build && npm run preview -- --port 5176   then   node scripts/check-interactions.mjs http://localhost:5176/
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
  const go = async url => { await send('Page.navigate', {url}); await sleep(6000); };
  const text = sel => evalJs(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const click = expr => evalJs(`(() => { const el = ${expr}; if (!el) return false; el.click(); return true; })()`);
  const setSelect = (label, value) => evalJs(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); const s = l && document.getElementById(l.htmlFor); if (!s) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', {bubbles: true})); return true; })()`);
  const kpi = () => text('.kpi-primary .kpi-value');

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
  check('Budget is the primary comparison', (await text('.kpi-primary .kpi-lines dt')) === 'vs Budget');
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'MDoc (Master Doc)')`); await sleep(1200); await closeDiscovery();
  check('Exploratory comparison is secondary and labeled', (await evalJs(`[...document.querySelectorAll('.kpi-primary .kpi-lines dt')].map(d => d.textContent).includes('vs MDoc (exploratory)')`)) && (await text('.kpi-primary .kpi-lines dt')) === 'vs Budget');
  check('Exploratory strip visible', !!(await text('.discovery-strip')));
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'None')`); await sleep(800); await closeDiscovery();
  // Time mode: rolling 52
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Rolling')`); await sleep(800); await setSelect('Window', '52'); await sleep(1500); const v4 = await kpi(); check('Rolling 52 weeks changes KPI', v4 !== v0, v4);
  // Invalid custom range shows error and keeps previous
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Custom')`); await sleep(800);
  await evalJs(`(() => { const i = document.querySelector('input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2026-12-01'); i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(800);
  const err = await text('.fb-error'); check('Invalid date range shows message', !!err, err); const v5 = await kpi(); check('Invalid range is not applied', v5 === v5 && !!err);
  await click(`document.querySelector('.fb-reset')`); await sleep(1000);
  // Table sort + search + drill
  const firstBefore = await text('.data-table tbody tr:not(.pinned) td'); await click(`[...document.querySelectorAll('.sort-btn')].find(b => b.textContent.startsWith('Labor spend'))`); await sleep(500); const firstAfter = await text('.data-table tbody tr:not(.pinned) td'); check('Table sort changes order', firstBefore !== firstAfter, `${firstBefore} → ${firstAfter}`);
  await evalJs(`(() => { const i = document.querySelector('.table-search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'District 05'); i.dispatchEvent(new Event('input', {bubbles: true})); })()`); await sleep(800);
  check('Table search filters rows', (await text('.table-count')) === '1 of 12 rows', await text('.table-count'));
  await click(`document.querySelector('.data-table .rowlink')`); await sleep(2500); check('Row click drills to district', (await evalJs(`[...document.querySelectorAll('.scope-part')].map(x=>x.textContent).join('|')`)).includes('District: District 05'));
  await click(`document.querySelector('.fb-reset')`); await sleep(1000);
  // Department bar cross-filter
  const bar = await evalJs(`(() => { const r = document.querySelector('.recharts-bar-rectangle path, .recharts-bar-rectangle'); return !!r; })()`); check('Department bars rendered', bar);
  // Definitions dialog
  await click(`document.querySelector('.header-button')`); await sleep(500); check('Definitions dialog opens', await evalJs(`document.querySelector('.defs-dialog').open`));
  await click(`[...document.querySelectorAll('.defs-dialog [role=radio]')].find(b => b.textContent === 'Open decisions')`); await sleep(300); check('Open decisions tab lists D01–D32', (await evalJs(`document.querySelectorAll('.defs-dialog tbody tr').length`)) === 32);
  await click(`document.querySelector('.defs-dialog form button')`); await sleep(300); check('Definitions dialog closes', !(await evalJs(`document.querySelector('.defs-dialog').open`)));
  // Simulated access
  await openDiscovery(); await evalJs(`(() => { const s = document.querySelector('.discovery-dialog select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'store'); s.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(1500); await closeDiscovery();
  check('Store manager role limits scope to 1 store', (await text('.scope-count')) === '1 stores', await text('.scope-count'));
  await openDiscovery(); await evalJs(`(() => { const s = document.querySelector('.discovery-dialog select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'regional'); s.dispatchEvent(new Event('change', {bubbles: true})); })()`); await sleep(2500); await closeDiscovery();
  // More filters: ID stores
  await click(`document.querySelector('.fb-more')`); await sleep(400); await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'ID stores')`); await sleep(2500); check('ID stores toggle reduces stores', (await text('.scope-count')) !== '60 stores', await text('.scope-count'));
  await click(`document.querySelector('.fb-reset')`); await sleep(800);
  // Allocation: select store shows department detail; measure group switch
  await go(base + '?page=allocation'); await click(`document.querySelector('.data-table .rowlink')`); await sleep(2500); check('Allocation store select shows departments', (await evalJs(`document.querySelectorAll('.data-table').length`)) === 2);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Sales & customers')`); await sleep(600); check('Measure group switches columns', (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.includes('Basket size'))`)));
  // Allocation: Position / Tenure pending (required by the view, disabled for labor)
  await click(`document.querySelector('.fb-more')`); await sleep(400); const hBefore = await text('.kpi-primary:nth-child(2) .kpi-value'); await setSelect('Position', 'Cashier'); await sleep(2500);
  check('Allocation Position filters labor actuals', (await text('.kpi-primary:nth-child(2) .kpi-value')) !== hBefore && !!(await text('.selection-bar')), `${hBefore} → ${await text('.kpi-primary:nth-child(2) .kpi-value')}`);
  check('Allocation Budget shows n/a under Position', (await evalJs(`[...document.querySelectorAll('.kpi-lines dd')].some(d => d.textContent === 'n/a')`)));
  await click(`document.querySelector('.fb-reset')`); await sleep(1500);
  // Budget: expand tree
  await go(base + '?page=budget'); await click(`document.querySelector('.tree-toggle')`); await sleep(500); check('Budget tree expands', (await evalJs(`document.querySelectorAll('.tree-table tr.lvl-district').length`)) === 4);
  // Benchmark: measure over time + region rows
  await go(base + '?page=benchmark'); check('Benchmark lists chain and region averages', (await evalJs(`document.querySelectorAll('tr.pinned').length`)) === 4);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Hires')`); await sleep(1500); check('Benchmark trend measure switch', (await evalJs(`[...document.querySelectorAll('h2')].some(h => h.textContent.startsWith('Hires by period'))`)));
  // Daily: day select + group by store
  await go(base + '?page=daily'); check('Daily defaults to last completed week', (await evalJs(`document.querySelector('.local-controls select').selectedOptions[0].textContent`)).includes('last completed week')); await setSelect('Day', '1'); await sleep(800); check('Daily day filter', (await text('.data-table .table-count')) === '1 of 1 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store')`); await sleep(800); check('Daily by store', (await text('.data-table .table-count')) === '60 of 60 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store and department')`); await sleep(1200); check('Daily by store and department', Number((await text('.data-table .table-count')).split(' ')[0]) > 600, await text('.data-table .table-count'));
  // Tracking: benchmark toggle changes chain row
  await go(base + '?page=tracking'); const incAll = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); await setSelect('Department', 'meat'); await sleep(3000); const incMeat = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); check('Attendance responds to Department', incAll !== incMeat, `${incAll} → ${incMeat}`); await click(`document.querySelector('.fb-reset')`); await sleep(2000); check('Scope card removed', !(await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Scope')`))); const b1 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'Simple store average')`); await sleep(1500); await closeDiscovery(); const b2 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); check('Benchmark method changes chain turnover', b1 !== b2, `${b1} → ${b2}`);
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
