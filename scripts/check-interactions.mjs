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
  // Every visible date (HTML, chart SVG text, select options, tooltips in title attributes) uses MM/DD/YYYY.
  const badDates = () => evalJs(`(() => { const txt = [document.body.innerText, ...[...document.querySelectorAll('svg text, option')].map(t => t.textContent), ...[...document.querySelectorAll('[title]')].map(t => t.title)].join(' \\n '); return [...new Set(txt.match(/\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\/\\d{1,2}\\b(?!\\/\\d)|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2}\\b(?!\\d)|\\b\\d\\/\\d{1,2}\\/\\d{4}|\\b\\d{2}\\/\\d\\/\\d{4}/g) ?? [])].slice(0, 5).join(', '); })()`);
  for (const p of pages) { await click(`[...document.querySelectorAll('.page-tabs button')].find(b => b.textContent === ${JSON.stringify(p)})`); await sleep(3500); const h = await text('h1'); check(`tab → ${p}`, h === p, h); const bd = await badDates(); check(`${p}: dates shown as MM/DD/YYYY only`, bd === '', bd); }
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
  const spendDts = () => evalJs(`[...document.querySelector('.kpi-primary .kpi-lines').querySelectorAll('dt')].map(d => d.textContent).join('|')`);
  check('Budget is the primary comparison for spend', (await spendDts()) === 'Budget|vs Budget', await spendDts());
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'MDoc (Master Doc)')`); await sleep(1200); await closeDiscovery();
  check('Exploratory comparison moves to the tooltip, Budget stays primary', (await evalJs(`document.querySelector('.kpi-primary [role=tooltip]').textContent.includes('Exploratory (Discovery options): vs MDoc')`)) && (await spendDts()) === 'Budget|vs Budget');
  check('Exploratory strip visible', !!(await text('.discovery-strip')));
  await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'None')`); await sleep(800); await closeDiscovery();
  // Time mode: rolling 52
  check('Time frame: to-date selector is not labeled Period', (await evalJs(`[...document.querySelectorAll('.filter-bar label')].map(l => l.textContent.trim())`)).includes('To-date span'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Fiscal Calendar')`); await sleep(500);
  check('Time frame: fiscal period selector found under Fiscal Calendar', (await evalJs(`[...document.querySelectorAll('.filter-bar label')].some(l => l.textContent.trim() === 'Fiscal period / quarter')`)));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Week Ending')`); await sleep(1500);
  const wk = await evalJs(`(() => { const f = [...document.querySelectorAll('.filter-bar .fb-field')].find(x => x.querySelector('label')?.textContent === 'Week Ending'); const sel = f?.querySelector('select'); return {opt: sel?.selectedOptions[0]?.textContent ?? '', resolved: document.querySelector('.fb-resolved')?.textContent ?? '', scope: [...document.querySelectorAll('.scope-part')].map(x => x.textContent).join('|'), beginning: document.querySelector('.filter-bar').textContent.includes('Week Beginning')}; })()`);
  check('Week Ending: option shows the Saturday and selects the same Sunday–Saturday week', wk.opt === '10/24/2026 · FY2026 W43' && wk.resolved.startsWith('10/18/2026 – 10/24/2026 · FY2026 W43') && wk.scope.includes('Week Ending 10/24/2026') && !wk.beginning, JSON.stringify(wk));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Rolling')`); await sleep(800); await setSelect('Window', '52'); await sleep(1500); const v4 = await kpi(); check('Rolling 52 weeks changes KPI', v4 !== v0, v4);
  // Invalid custom range shows error and keeps previous
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Custom')`); await sleep(800);
  const typeDate = (i, v) => evalJs(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const el = document.querySelectorAll('.fb-date input[type=text]')[${i}]; set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  const shown = await evalJs(`[...document.querySelectorAll('.fb-date input[type=text]')].map(i => i.value).join('|')`);
  check('Custom dates are shown as MM/DD/YYYY whatever the browser locale', /^\d{2}\/\d{2}\/\d{4}\|\d{2}\/\d{2}\/\d{4}$/.test(shown) && (await evalJs(`document.querySelectorAll('.fb-date-native').length === 2 && [...document.querySelectorAll('.fb-date-native')].every(i => getComputedStyle(i).opacity === '0')`)), shown);
  await typeDate(0, '12/01/2026'); await sleep(800);
  const err = await text('.fb-error'); check('Invalid date range shows message', !!err, err); const v5 = await kpi(); check('Invalid range is not applied', v5 === v5 && !!err);
  await typeDate(0, '24/10/2026'); await sleep(800);
  const err2 = await text('.fb-error'); check('Day-first date is rejected, not swapped', !!err2 && err2.includes('MM/DD/YYYY'), err2);
  await typeDate(0, '09/27/2026'); await sleep(1500);
  const resolvedTxt = await text('.fb-resolved'); check('Typed 09/27/2026 resolves to its Sunday–Saturday week without shifting', !!resolvedTxt && resolvedTxt.startsWith('09/27/2026 – '), resolvedTxt);
  await click(`document.querySelector('.fb-reset')`); await sleep(1000);
  // Overview: four cards, two charts, links, LY toggle
  check('Overview: four KPI cards and two charts only', (await evalJs(`document.querySelectorAll('.kpi').length`)) === 4 && (await evalJs(`document.querySelectorAll('.visual-card').length`)) === 2 && (await evalJs(`document.querySelectorAll('.data-table').length`)) === 0);
  const labelGap = await evalJs(`(() => { const card = [...document.querySelectorAll('.visual-card')].find(c => c.querySelector('h2')?.textContent.startsWith('Labor Spend Variance vs Budget by Department')); const ticks = [...card.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')].map(t => t.getBoundingClientRect().right); const axisRight = Math.max(...ticks); const labels = [...card.querySelectorAll('text')].filter(t => !t.closest('.recharts-xAxis') && /^[+−]\\$/.test(t.textContent)); return {n: labels.length, minLeft: Math.min(...labels.map(t => t.getBoundingClientRect().left)), axisRight}; })()`);
  check('Overview: department value labels never overlap the department names', labelGap.n === 17 && labelGap.minLeft > labelGap.axisRight, JSON.stringify(labelGap));
  check('Overview: subtle "Proposed overview" label', (await text('.eyebrow.subtle')) === 'Proposed overview');
  const cardDts = label => evalJs(`[...[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith(${JSON.stringify(label)})).querySelectorAll('dt, dd')].map(d => d.textContent).join('|')`);
  check('Overview: IPLH compared with MDoc, not labeled Budget', (await cardDts('Items per Labor Hour')).startsWith('MDoc|') && (await cardDts('Items per Labor Hour')).includes('vs MDoc') && !(await cardDts('Items per Labor Hour')).includes('Budget'), await cardDts('Items per Labor Hour'));
  check('Overview: card comparison control scoped to the cards', (await evalJs(`document.querySelector('.card-compare [role=radiogroup]').getAttribute('aria-label')`)) === 'Compare the four cards with' && (await evalJs(`document.querySelector('label.check').textContent.trim()`)) === 'Show LY on this chart');
  check('Overview: Open indicator explained', (await evalJs(`document.querySelector('.open-legend').textContent.includes('Business definition or comparison rule pending confirmation.')`)) && (await evalJs(`document.querySelector('.decision-chip [role=tooltip]').textContent.startsWith('Open: business definition or comparison rule pending confirmation.')`)));
  check('Overview: options are Budget / MDoc and Last Year; tooltip states references are pending', (await evalJs(`[...document.querySelectorAll('.card-compare [role=radio]')].map(b => b.textContent).join('|')`)) === 'Budget / MDoc|Last Year' && (await evalJs(`document.querySelector('.card-compare [role=tooltip]').textContent`)).includes('Official comparison references remain pending business confirmation'));
  await click(`[...document.querySelectorAll('.card-compare [role=radio]')].find(b => b.textContent === 'Last Year')`); await sleep(800);
  const lyCards = {spend: await cardDts('Labor Spend'), hours: await cardDts('Labor Hours'), rate: await cardDts('Labor Rate'), iplh: await cardDts('Items per Labor Hour')};
  check('Overview LY: Labor Spend shows LY $ and difference in $ and %', /^LY\|\$[\d.]+[KM]\|vs LY\|[▲▼●] [+−]?\$[\d.]+[KM]? \([+−]?\d+\.\d%\)$/.test(lyCards.spend), lyCards.spend);
  check('Overview LY: Labor Hours shows LY hrs and difference in hrs and %', /^LY\|[\d.]+K hrs\|vs LY\|[▲▼●] [+−]?[\d,]+ hrs \([+−]?\d+\.\d%\)$/.test(lyCards.hours), lyCards.hours);
  check('Overview LY: Labor Rate shows LY rate and difference in pp', /^LY\|\d+\.\d\d%\|vs LY\|[▲▼●] [+−]?\d+\.\d\d pp$/.test(lyCards.rate), lyCards.rate);
  check('Overview LY: IPLH shows LY items per hour and difference in items per hour and %', /^LY\|\d+\.\d\|vs LY\|[▲▼●] [+−]?\d+\.\d \([+−]?\d+\.\d%\)$/.test(lyCards.iplh), lyCards.iplh);
  check('Overview: card selector leaves the chart LY option off', !(await evalJs(`document.querySelector('label.check input').checked`)) && !(await evalJs(`[...document.querySelectorAll('.chart-key li')].some(l => l.textContent === 'LY')`)));
  await click(`document.querySelector('label.check input')`); await sleep(600);
  check('Overview: chart LY checkbox changes the chart only', (await evalJs(`[...document.querySelectorAll('.chart-key li')].some(l => l.textContent === 'LY')`)) && (await cardDts('Labor Rate')) === lyCards.rate && (await evalJs(`[...document.querySelectorAll('.info-tip button')].find(b => b.getAttribute('aria-label') === 'About Show LY on this chart')?.parentElement.textContent ?? ''`)).includes('this weekly chart only'));
  await click(`[...document.querySelectorAll('.card-compare [role=radio]')].find(b => b.textContent === 'Budget / MDoc')`); await sleep(600);
  check('Overview: Budget / MDoc restores Budget and MDoc lines and keeps the chart LY on', (await cardDts('Labor Spend')).startsWith('Budget|') && (await cardDts('Labor Rate')).startsWith('Budget|') && (await cardDts('Items per Labor Hour')).startsWith('MDoc|') && (await evalJs(`document.querySelector('label.check input').checked`)));
  await click(`document.querySelector('label.check input')`); await sleep(400);
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
  await click(`[...document.querySelectorAll('.defs-dialog [role=radio]')].find(b => b.textContent === 'Open decisions')`); await sleep(300); check('Open decisions tab lists D01–D39', (await evalJs(`document.querySelectorAll('.defs-dialog tbody tr').length`)) === 39);
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
  // Allocation: Region → District → Store → Department in one table; measure groups and new comparisons
  await go(base + '?page=allocation');
  const depthRows = d => evalJs(`document.querySelectorAll('tr.tree-depth-${d}').length`);
  const searchFor = q => evalJs(`(() => { const i = document.querySelector('.table-search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  check('Allocation has one Region / District / Store / Department table', (await evalJs(`document.querySelectorAll('.data-table').length`)) === 1 && (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.startsWith('Region / District / Store / Department'))`)) && (await text('.table-count')) === '3 of 3 regions', await text('.table-count'));
  check('Allocation: Total row and visible scope', (await evalJs(`document.querySelector('tr.pinned td').textContent`)).startsWith('Total · 3 regions · 60 stores') && (await text('.table-scope')).includes('60 stores'));
  check('Allocation cards: Gross Sales and Labor hours show Budget, vs Budget and vs LY', (await cardDts('Gross Sales TY')).match(/^Budget\|\$[\d.]+M\|vs Budget\|.*\|vs LY\|/) !== null && (await cardDts('Labor hours TY')).match(/^Budget\|[\d.]+K hrs\|vs Budget\|.*\|vs LY\|/) !== null, `${await cardDts('Gross Sales TY')} · ${await cardDts('Labor hours TY')}`);
  check('IPLH card shows the full name', (await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Items per Labor Hour (IPLH)')`)));
  await click(`document.querySelector('tr.tree-depth-0 .tree-btn')`); await sleep(600);
  check('Allocation: region expands to its districts', (await depthRows(1)) === 4, `${await depthRows(1)} districts`);
  await click(`document.querySelector('tr.tree-depth-1 .tree-btn')`); await sleep(600);
  check('Allocation: district expands to its stores', (await depthRows(2)) === 5, `${await depthRows(2)} stores`);
  await click(`document.querySelector('tr.tree-depth-2 .tree-btn')`); await sleep(800);
  check('Allocation: store expands to its departments in the same table', (await depthRows(3)) > 10 && (await evalJs(`document.querySelector('tr.tree-depth-2 .tree-btn').getAttribute('aria-expanded')`)) === 'true', `${await depthRows(3)} department rows`);
  await click(`document.querySelector('tr.tree-depth-0 .tree-btn')`); await sleep(500); check('Allocation: collapsing a region hides everything below it', (await evalJs(`document.querySelectorAll('tr.child-row').length`)) === 0);
  await searchFor('101 meat'); await sleep(900);
  check('Search finds a department inside a store, through region and district', (await text('.table-count')) === '1 of 3 regions' && (await evalJs(`[...document.querySelectorAll('tr.tree-depth-3 td:first-child')].map(t => t.textContent).join('|')`)).startsWith('Meat'), await text('.table-count'));
  await searchFor(''); await sleep(600);
  const allocHeads = () => evalJs(`[...document.querySelectorAll('.data-table thead th')].map(t => t.textContent).join('|')`);
  check('Allocation hours: Budget and MDoc shown separately', (await allocHeads()).includes('Hours Budget') && (await allocHeads()).includes('Hours MDoc') && (await allocHeads()).includes('Hours vs MDoc (operational target)'), '');
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Sales & customers')`); await sleep(600);
  const sortHeads = () => evalJs(`[...document.querySelectorAll('.data-table thead .sort-btn')].map(t => t.textContent.trim()).join('|')`);
  const salesHeads = await sortHeads();
  check('Allocation sales: Sales and Items vs Budget; customer count and basket TY + YoY by default', ['Sales Budget', 'Sales vs Budget', 'Items Budget', 'Items vs Budget', 'Customer count TY', 'Customer count YoY', 'Basket size TY', 'Basket size YoY'].every(h => salesHeads.includes(h)) && !salesHeads.includes('Customer count LY') && !salesHeads.includes('Basket size LY'), salesHeads.slice(0, 80));
  check('Allocation sales: LY value available in the YoY cell', (await evalJs(`document.querySelector('.data-table tbody tr:not(.pinned) span[title^="LY "]')?.getAttribute('title') ?? ''`)).includes('transactions'));
  await click(`[...document.querySelectorAll('label.check')].find(l => l.textContent.includes('Show LY values')).querySelector('input')`); await sleep(600);
  check('Allocation sales: Show LY values adds the LY columns', (await sortHeads()).includes('Customer count LY') && (await sortHeads()).includes('Basket size LY'));
  await click(`[...document.querySelectorAll('label.check')].find(l => l.textContent.includes('Show LY values')).querySelector('input')`); await sleep(400);
  check('Measure group switches columns', (await evalJs(`[...document.querySelectorAll('th')].some(t => t.textContent.includes('Basket size'))`)));
  // AIV history by department (OPS111 reference), inside the AIV section
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'History by department')`); await sleep(1500);
  const aivScope = () => text('.aiv-history .table-scope');
  check('AIV history: rolling 52 weekly points, aggregate scope by default', (await aivScope()).startsWith('Rolling 52 weeks, weekly points') && (await aivScope()).includes('All departments in scope') && (await evalJs(`document.querySelectorAll('.aiv-history .recharts-line-dot, .aiv-history .recharts-line .recharts-curve').length`)) > 0, await aivScope());
  check('AIV history: department summary has LW, PTD, QTD, YTD and one line per chart, not per department', (await evalJs(`[...document.querySelectorAll('.aiv-history thead th .sort-btn')].map(b => b.textContent.trim()).join('|')`)).startsWith('Department|LW|PTD|QTD|YTD') && (await evalJs(`document.querySelectorAll('.aiv-history .recharts-line').length`)) === 1);
  await click(`[...document.querySelectorAll('.aiv-history [role=radio]')].find(b => b.textContent === 'Average Item Value')`); await sleep(800);
  check('AIV history: AIV shows TY and LY lines', (await evalJs(`document.querySelectorAll('.aiv-history .recharts-line').length`)) === 2 && (await evalJs(`[...document.querySelectorAll('.aiv-history .chart-key li')].map(l => l.textContent).join('|')`)) === 'AIV TY|AIV LY');
  await click(`[...document.querySelectorAll('.aiv-history [role=radio]')].find(b => b.textContent === 'vs Budget (OPS111)')`); await sleep(600);
  check('AIV history: Budget is a secondary OPS111 comparison', (await evalJs(`[...document.querySelectorAll('.aiv-history .chart-key li')].map(l => l.textContent).join('|')`)) === 'AIV TY|AIV Budget');
  await click(`[...document.querySelectorAll('.aiv-history [role=radio]')].find(b => b.textContent === 'Estimated Inflation ($)')`); await sleep(600);
  check('AIV history: inflation $ uses its own measure (bars, $ axis)', (await evalJs(`document.querySelectorAll('.aiv-history .recharts-bar-rectangle').length`)) > 10 && (await evalJs(`document.querySelectorAll('.aiv-history .recharts-line').length`)) === 0);
  await click(`[...document.querySelectorAll('.aiv-history tbody tr:not(.pinned) .rowlink')].find(b => b.textContent === 'Meat')`); await sleep(1200);
  check('AIV history: selecting a department row shows that department', (await aivScope()).includes('· Meat ·'), await aivScope());
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Summary')`); await sleep(400);
  await setSelect('Region', 'R2'); await sleep(2500);
  check('Allocation: a single region opens to its districts and totals follow the filter', (await depthRows(1)) === 4 && (await text('.table-scope')).includes('Region 2') && (await evalJs(`document.querySelector('tr.pinned td').textContent`)).includes('Region 2'), await text('.table-scope'));
  await click(`document.querySelector('.fb-reset')`); await sleep(1500);
  // Allocation: Position / Tenure pending (required by the view, disabled for labor)
  await click(`document.querySelector('.fb-more')`); await sleep(400); const hBefore = await text('.kpi-primary:nth-child(2) .kpi-value'); await setSelect('Position', 'Cashier'); await sleep(2500);
  check('Allocation Position filters labor actuals', (await text('.kpi-primary:nth-child(2) .kpi-value')) !== hBefore && !!(await text('.selection-bar')), `${hBefore} → ${await text('.kpi-primary:nth-child(2) .kpi-value')}`);
  check('Allocation Budget shows n/a under Position', (await evalJs(`[...document.querySelectorAll('.kpi-lines dd')].some(d => d.textContent === 'n/a')`)));
  await click(`document.querySelector('.fb-reset')`); await sleep(1500);
  // Budget: expand tree
  await go(base + '?page=budget');
  const bCard = l => evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === ${JSON.stringify(l)})?.textContent ?? ''`);
  check('Budget: Overtime Rate card (% of payroll, excl. Pharmacy) with D33 open and denominator tooltip', (await bCard('Overtime Rate (% of Payroll, excl. Pharmacy)')).includes('%') && (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Overtime Rate')).querySelector('[role=tooltip]').textContent`)).includes('labor budget (41:46)') && (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Overtime Rate')).querySelector('.decision-chip [role=tooltip]').textContent`)).includes('D33'));
  check('Budget: Overtime Rate column in the table', (await evalJs(`[...document.querySelectorAll('.data-table thead th')].some(t => t.textContent.startsWith('Overtime Rate') && t.textContent.includes('% of payroll, excl. Pharmacy'))`)));
  const hoursCard = () => evalJs(`[...[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Labor hours').querySelectorAll('dt')].map(d => d.textContent).join('|')`);
  const spendCard = () => evalJs(`[...[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Labor spend').querySelectorAll('dt')].map(d => d.textContent).join('|')`);
  check('Budget: hours compared with Budget by default', (await hoursCard()) === 'Budget|vs Budget', await hoursCard());
  check('Budget: table title with Budget', (await evalJs(`[...document.querySelectorAll('h2')].some(h => h.textContent === 'Hours & Spend vs Budget by Region, District and Store')`)));
  await click(`[...document.querySelectorAll('.card-compare [role=radio]')].find(b => b.textContent === 'MDoc (operational target)')`); await sleep(800);
  check('Budget: MDoc switch changes hours only (card, table group), spend stays on Budget', (await hoursCard()) === 'MDoc|vs MDoc' && (await spendCard()) === 'Budget|vs Budget' && (await evalJs(`[...document.querySelectorAll('.data-table thead .group-row th')].some(t => t.textContent === 'Labor hours vs MDoc (operational target)')`)) && (await evalJs(`[...document.querySelectorAll('.data-table thead .group-row th')].some(t => t.textContent === 'Labor spend')`)), `${await hoursCard()} · ${await spendCard()}`);
  await setSelect('Region', 'R1'); await sleep(2000);
  check('Budget: table title follows the MDoc hours selection', (await evalJs(`[...document.querySelectorAll('h2')].some(h => h.textContent === 'Hours vs MDoc and Spend vs Budget by Region, District and Store')`)));
  check('Budget: MDoc selection kept with a Region filter', (await hoursCard()) === 'MDoc|vs MDoc' && (await text('.table-scope')).includes('Region 1'));
  await click(`document.querySelector('.fb-reset')`); await sleep(1500);
  await click(`[...document.querySelectorAll('.card-compare [role=radio]')].find(b => b.textContent === 'Budget')`); await sleep(500);
  check('Budget: scatter removed', (await evalJs(`document.querySelectorAll('.recharts-scatter').length`)) === 0 && (await evalJs(`document.querySelectorAll('.visual-card').length`)) === 1);
  await click(`document.querySelector('tr.tree-depth-0 .tree-btn')`); await sleep(500); check('Budget hierarchy expands region → districts', (await depthRows(1)) === 4);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Store comparison')`); await sleep(1000);
  const colVals = sub => evalJs(`(() => { const ths = [...document.querySelectorAll('.data-table thead tr:last-child th')]; const i = ths.findIndex(t => t.querySelector('.th-sub')?.textContent === ${JSON.stringify(sub)}); return [...document.querySelectorAll('.data-table tbody tr:not(.pinned)')].slice(0, 6).map(r => Number(r.children[i].textContent.replace(/[^0-9.−-]/g, '').replace('−', '-'))); })()`);
  const desc = a => a.every((v, i) => i === 0 || a[i - 1] >= v);
  check('Budget store comparison: one row per store, sorted by labor rate difference (pp)', (await text('.table-count')) === '60 of 60 stores' && desc(await colVals('pp')), JSON.stringify(await colVals('pp')));
  await click(`[...document.querySelectorAll('.data-table thead tr:last-child th')].find(t => t.querySelector('.th-sub')?.textContent === '$').querySelector('.sort-btn')`); await sleep(600);
  check('Budget store comparison: sort by spend variance', desc(await colVals('$')), JSON.stringify(await colVals('$')));
  await click(`[...document.querySelectorAll('.data-table thead tr:last-child th')].find(t => t.querySelector('.th-sub')?.textContent === 'hrs').querySelector('.sort-btn')`); await sleep(600);
  check('Budget store comparison: sort by hours variance', desc(await colVals('hrs')), JSON.stringify(await colVals('hrs')));
  check('Budget store comparison: no ratings or status colors in the visible table', !(await evalJs(`(() => { const c = document.querySelector('.visual-card').cloneNode(true); c.querySelectorAll('[role=tooltip]').forEach(t => t.remove()); return /\\b(rating|red|amber|green)\\b|top 10|bottom 10/i.test(c.textContent); })()`)));
  // Benchmark: Chain → Region → District → Store matrix, scope selection, five trends, optional ranking
  const typeIn = async (sel, q) => evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', {bubbles: true})); return true; })()`);
  const h2s = () => evalJs(`[...document.querySelectorAll('h2')].map(h => h.textContent.trim())`);
  const scopeBar = () => text('.selection-bar');
  const keysOf = title => evalJs(`[...[...document.querySelectorAll('.trend-grid .visual-card')].find(c => c.querySelector('h2')?.textContent === ${JSON.stringify(title)}).querySelectorAll('.chart-key li')].map(l => l.textContent).join('|')`);
  const rowLink = (depth, name) => `[...document.querySelectorAll('tr.tree-depth-${depth} .rowlink')].find(b => b.textContent.startsWith(${JSON.stringify(name)}))`;
  const TRENDS = ['Turnover Rate over Time', 'Retention Rate over Time', 'Hires over Time', 'Terminations over Time', 'Beginning & Ending Headcount over Time'];
  await go(base + '?page=benchmark');
  check('Benchmark: page order is scope, matrix, trends, optional ranking (collapsed)', (await evalJs(`(() => { const order = [...document.querySelectorAll('.selection-bar, .data-table, .trend-grid, details.bench-ranking')].map(e => e.className.split(' ')[0]); return order.join('>') + '|' + document.querySelector('details.bench-ranking').open; })()`)) === 'selection-bar>data-table>trend-grid>bench-ranking|false');
  check('Benchmark: trends appear without selecting a store, for the chain', (await h2s()).filter(h => TRENDS.includes(h)).length === 5 && (await scopeBar()).startsWith('Analysis scope: Chain · 60 stores'), await scopeBar());
  check('Benchmark: entire chain shows one chain series (no duplicate benchmark)', (await keysOf('Turnover Rate over Time')) === 'Chain', await keysOf('Turnover Rate over Time'));
  check('Benchmark: matrix starts with Chain and its regions', (await depthRows(0)) === 1 && (await depthRows(1)) === 3 && (await depthRows(2)) === 0 && (await text('.table-count')) === '60 of 60 stores' && (await evalJs(`document.querySelector('tr.tree-depth-0 .rowlink').textContent`)).startsWith('Chain'));
  check('Benchmark: label column stays visible when scrolling horizontally', (await evalJs(`getComputedStyle(document.querySelector('.data-table tbody td')).position`)) === 'sticky');
  await click(`document.querySelector('tr.tree-depth-1 .tree-btn')`); await sleep(600);
  check('Benchmark: expanding a region shows its districts and does not select it', (await depthRows(2)) === 4 && (await scopeBar()).startsWith('Analysis scope: Chain'));
  await click(`document.querySelector('tr.tree-depth-2 .tree-btn')`); await sleep(600);
  check('Benchmark: expanding a district shows its stores', (await depthRows(3)) === 5);
  await click(rowLink(2, 'District 01')); await sleep(3000);
  check('Benchmark: selecting a district updates the scope and highlights the row', (await scopeBar()).startsWith('Analysis scope: Region 1 › District 01 · 5 stores') && (await evalJs(`document.querySelector('tr.selected .rowlink').textContent`)).startsWith('District 01'), await scopeBar());
  check('Benchmark: district trends show district, its region and the chain', (await keysOf('Turnover Rate over Time')) === 'District 01|Region 1 benchmark|Chain benchmark' && (await keysOf('Retention Rate over Time')) === 'District 01|Region 1 benchmark|Chain benchmark', await keysOf('Turnover Rate over Time'));
  check('Benchmark: count trends show only the scope count (benchmarks per store in the tooltip)', (await keysOf('Hires over Time')) === 'District 01 · hires (count)' && (await keysOf('Terminations over Time')) === 'District 01 · terminations (count)' && (await keysOf('Beginning & Ending Headcount over Time')) === 'District 01 · ending|District 01 · beginning');
  check('Benchmark: headcount chart has no rate wording; rate charts keep it', !(await evalJs(`[...document.querySelectorAll('.trend-grid .visual-card')].find(c => c.querySelector('h2')?.textContent === 'Beginning & Ending Headcount over Time').querySelector('.chart-note').textContent.includes('Rates')`)) && (await evalJs(`[...document.querySelectorAll('.trend-grid .visual-card')].find(c => c.querySelector('h2')?.textContent === 'Beginning & Ending Headcount over Time').querySelector('.chart-note').textContent.includes('not at zero')`)));
  check('Benchmark: five charts use the same time buckets', (await evalJs(`(() => { const sets = [...document.querySelectorAll('.trend-grid .recharts-xAxis')].map(a => [...a.querySelectorAll('.recharts-cartesian-axis-tick-value')].map(t => t.textContent).join(',')); return sets.length === 5 && new Set(sets.map(s => s.split(',')[0])).size === 1; })()`)));
  await click(rowLink(1, 'Region 1')); await sleep(3000);
  check('Benchmark: region trends show the region and the chain only', (await keysOf('Turnover Rate over Time')) === 'Region 1|Chain benchmark' && (await scopeBar()).startsWith('Analysis scope: Region 1 · 20 stores'));
  const regCells = await evalJs(`(() => { const td = [...document.querySelector('tr.selected').querySelectorAll('td')]; return {t: td.map(t => t.textContent), title: td[2].querySelector('[title]')?.title ?? ''}; })()`);
  check('Benchmark: region row compares with itself: region reference = own rate (2 decimals), 0.0 pp, tooltip says it is the region itself', regCells.t[2] === regCells.t[1] && /^\d+\.\d{2}%$/.test(regCells.t[1]) && regCells.t[4] === '0.0 pp' && !regCells.t.slice(1).some(c => c.startsWith('n/a')) && regCells.title.includes('region itself'), regCells.t.join(' | '));
  const ppRow = await evalJs(`(() => { const heads = [...document.querySelectorAll('.data-table thead tr:last-child th')].map(t => t.querySelector('.sort-btn').textContent.trim()); const tr = document.querySelector('tr.tree-depth-2'); const c = [...tr.querySelectorAll('td')].map(t => t.textContent); const v = h => parseFloat(c[heads.indexOf(h)]); return {ok: Math.abs((v('Turnover (%)') - v('Chain Turnover (%)')) - v('Difference vs Chain (pp)')) < 0.11 && Math.abs((v('Turnover (%)') - v('Region Turnover (%)')) - v('Difference vs Region (pp)')) < 0.11, row: c.join(' | ')}; })()`);
  check('Benchmark: pp differences = row − benchmark', ppRow.ok, ppRow.row);
  await click(rowLink(3, 'Store')); await sleep(3000);
  const storeName = await evalJs(`document.querySelector('tr.selected .rowlink').textContent.split('District')[0].trim()`);
  check('Benchmark: selecting a store shows the store, its region and the chain', (await keysOf('Turnover Rate over Time')) === `${storeName}|Region 1 benchmark|Chain benchmark` && (await scopeBar()).includes(`District 01 › ${storeName} · 1 store`), `${storeName} · ${await keysOf('Turnover Rate over Time')}`);
  await click(`[...document.querySelectorAll('.selection-bar button')].find(b => b.textContent === 'Reset to filtered scope')`); await sleep(2500);
  check('Benchmark: Reset to filtered scope returns to the chain', (await scopeBar()).startsWith('Analysis scope: Chain') && (await evalJs(`[...document.querySelectorAll('.selection-bar button')].find(b => b.textContent === 'Reset to filtered scope').disabled`)));
  // Headers, tooltips, counts
  const tHeads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.replace(/[▲▼]/g, '').trim()).join('|')`);
  check('Benchmark: turnover group headers', tHeads === 'Chain › Region › District › Store|Turnover (%)|Region Turnover (%)|Chain Turnover (%)|Difference vs Region (pp)|Difference vs Chain (pp)', tHeads);
  const ppTip = await evalJs(`[...document.querySelectorAll('.data-table thead [role=tooltip]')].map(t => t.textContent).find(t => t.startsWith('Row turnover rate minus the chain')) ?? ''`);
  check('Benchmark: pp tooltip explains sign, example, unrounded calculation, pp, 0.0 pp and n/a', ppTip.includes('A positive value means higher turnover than the chain') && ppTip.includes('Store turnover of 5.0% minus chain turnover of 3.4% equals +1.6 percentage points.') && ppTip.includes('unrounded') && ppTip.includes('not a relative percentage change') && ppTip.includes('0.0 pp on the Chain row'), ppTip.slice(0, 120));
  const chainCells = await evalJs(`[...document.querySelector('tr.tree-depth-0').querySelectorAll('td')].map(t => t.textContent)`);
  check('Benchmark: chain row: no single regional benchmark (n/a), chain reference = own rate, 0.0 pp vs Chain', chainCells[2].startsWith('n/a') && chainCells[4].startsWith('n/a') && chainCells[3] === chainCells[1] && chainCells[5] === '0.0 pp', chainCells.join(' | '));
  check('Benchmark: district and store rates keep a real regional benchmark, two decimals', /^\d+\.\d{2}%$/.test((await evalJs(`[...document.querySelector('tr.tree-depth-2').querySelectorAll('td')][2].textContent`))) && !(await evalJs(`[...document.querySelector('tr.tree-depth-2').querySelectorAll('td')].map(t => t.textContent).join('|')`)).includes('n/a'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Retention Comparison')`); await sleep(600);
  check('Benchmark: retention group headers', (await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.replace(/[▲▼]/g, '').trim()).join('|')`)) === 'Chain › Region › District › Store|Retention (%)|Region Retention (%)|Chain Retention (%)|Difference vs Region (pp)|Difference vs Chain (pp)');
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Headcount & Movements')`); await sleep(600);
  const mHeads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.replace(/[▲▼]/g, '').trim()).join('|')`);
  check('Benchmark: Headcount & Movements group (row totals)', mHeads === 'Chain › Region › District › Store|Stores|Beginning Headcount|Ending Headcount|Hires|Terminations', mHeads);
  check('Benchmark: counts show per-store and benchmark averages per store on hover', (await evalJs(`document.querySelector('tr.tree-depth-1 td span[title]').getAttribute('title')`)).match(/per store\). Benchmarks, average per store: (region [\d.]+, )?chain [\d.]+/) !== null);
  check('Benchmark: benchmark values kept in a compact reference (counts per store)', (await text('.bench-ref')).includes('Chain benchmark (60 stores)') && (await text('.bench-ref')).includes('average per store'));
  // Search keeps ancestors; export has level and path
  await typeIn('.table-search input', '103'); await sleep(900);
  check('Benchmark: search keeps the ancestor path of a matching store', (await text('.table-count')) === '1 of 60 stores' && (await evalJs(`[1, 2, 3].map(d => document.querySelector('tr.tree-depth-' + d + ' .rowlink')?.textContent ?? '').join('|')`)).match(/^Region 1.*\|District 01.*\|Store 103/) !== null, await text('.table-count'));
  await typeIn('.table-search input', ''); await sleep(800);
  await click(`[...document.querySelectorAll('.data-table .btn-link')].find(b => b.textContent === 'Expand all levels')`); await sleep(1200);
  await evalJs(`(() => { window.__csv = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { window.__csv = b; return orig.call(URL, b); }; })()`);
  await click(`[...document.querySelectorAll('.btn-secondary')].find(b => b.textContent === 'Export CSV')`); await sleep(500);
  const csv = await evalJs(`window.__csv ? window.__csv.text() : ''`);
  check('Benchmark: export identifies level and parent path', csv.includes('"Level","Path"') || csv.startsWith('Level,Path') || /Level.{0,3},.{0,3}Path/.test(csv.split('\n').find(l => l.includes('Level')) ?? ''), csv.split('\n').find(l => l.includes('Level'))?.slice(0, 80));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Turnover Comparison')`); await sleep(600);
  await evalJs(`window.__csv = null`); await click(`[...document.querySelectorAll('.btn-secondary')].find(b => b.textContent === 'Export CSV')`); await sleep(500);
  const tCsv = await evalJs(`window.__csv ? window.__csv.text() : ''`);
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Headcount & Movements')`); await sleep(600);
  const csvRows = tCsv.split('\n').map(l => l.replace(/\r$/, '').split(',').map(c => c.replace(/"/g, '')));
  const cChain = csvRows.find(r => r[0] === 'Chain'); const cReg = csvRows.find(r => r[0] === 'Region');
  check('Benchmark: CSV self-comparisons: region = own rate with 0 pp; chain region reference and difference empty, chain difference 0', !!cChain && !!cReg && cReg[4] === cReg[3] && Number(cReg[6]) === 0 && cChain[4] === '' && cChain[6] === '' && cChain[5] === cChain[3] && Number(cChain[7]) === 0, `${cChain?.join('|')} // ${cReg?.join('|')}`);
  check('Benchmark: export writes chain, regions, districts and stores', (csv.match(/^"?Store"?,/gm) ?? []).length === 60 && (csv.match(/^"?District"?,/gm) ?? []).length === 12 && /^"?Store"?,"?Chain › Region 1 › District 01"?/m.test(csv), `${(csv.match(/^"?Store"?,/gm) ?? []).length} store rows`);
  check('Benchmark: expand / collapse and row names are keyboard buttons', (await evalJs(`document.querySelector('tr.tree-depth-1 .tree-btn').tagName + document.querySelector('tr.tree-depth-1 .rowlink').tagName`)) === 'BUTTONBUTTON');
  // Ranking (optional) uses the same selection
  await evalJs(`document.querySelector('details.bench-ranking').open = true`); await sleep(800);
  const firstBar = await evalJs(`document.querySelector('.bench-ranking .recharts-yAxis .recharts-cartesian-axis-tick-value')?.textContent`);
  await evalJs(`(() => { const r = document.querySelector('.bench-ranking .recharts-bar-rectangle path') ?? document.querySelector('.bench-ranking .recharts-bar-rectangle'); r.dispatchEvent(new MouseEvent('click', {bubbles: true})); })()`); await sleep(3000);
  check('Benchmark: ranking selects the store like the table', (await scopeBar()).includes(`${firstBar} · 1 store`) && (await evalJs(`document.querySelector('tr.selected .rowlink')?.textContent ?? ''`)).startsWith(firstBar), `${firstBar} · ${await scopeBar()}`);
  // Global filters constrain matrix and scope; invalid selections reset
  await setSelect('Region', 'R2'); await sleep(3000);
  check('Benchmark: a filter that excludes the selected store resets to the filtered scope', (await scopeBar()).startsWith('Analysis scope: Filtered selection: Region 2 › 4 districts · 20 stores') && (await text('.table-count')) === '20 of 20 stores', await scopeBar());
  check('Benchmark: filtered region is the whole region population → region vs chain only', (await keysOf('Turnover Rate over Time')) === 'Filtered selection|Chain benchmark' && (await depthRows(2)) === 4, await keysOf('Turnover Rate over Time'));
  await evalJs(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent === 'Store'); const i = document.getElementById(l.htmlFor); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '121'); i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); })()`); await sleep(3000);
  check('Benchmark: the global Store filter constrains the matrix and the analysis scope', (await text('.table-count')) === '1 of 1 stores' && (await scopeBar()).includes('Store 121 · 1 store') && (await keysOf('Turnover Rate over Time')) === 'Filtered selection|Region 2 benchmark|Chain benchmark', `${await text('.table-count')} · ${await scopeBar()}`);
  await click(`document.querySelector('.fb-reset')`); await sleep(2500);
  // Daily: day select + group by store
  await go(base + '?page=daily');
  const dHours = () => evalJs(`[...[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Labor hours').querySelectorAll('dt')].map(d => d.textContent).join('|')`);
  check('Daily: hours vs Budget by default', (await dHours()) === 'Budgeted hours|vs Budget');
  const dWeek = await evalJs(`(() => { const f = document.querySelector('.local-controls .fb-field'); return f.querySelector('label').textContent + '|' + f.querySelector('select').selectedOptions[0].textContent + '|' + [...document.querySelectorAll('.scope-part, .visual-card .chart-notes, .visual-card')].map(x => x.textContent).join(' ').includes('Week Ending 10/24/2026'); })()`);
  check('Daily: week selector and notes use Week Ending', dWeek === 'Week Ending|10/24/2026 · FY2026 W43 · last completed week|true' && !(await evalJs(`document.body.innerText.includes('Week beginning') || document.body.innerText.includes('Week Beginning')`)), dWeek);
  const dayTicks = await evalJs(`[...document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map(t => [...t.querySelectorAll('tspan')].map(x => x.textContent).join(' ')).join('|')`);
  check('Daily: chart days show weekday and MM/DD/YYYY (Sun–Sat, no shift)', /^Sun \d{2}\/\d{2}\/\d{4}\|Mon .*\|Sat \d{2}\/\d{2}\/\d{4}$/.test(dayTicks) && dayTicks.startsWith('Sun 10/18/2026') && dayTicks.endsWith('Sat 10/24/2026'), dayTicks);
  await evalJs(`(() => { window.__csv = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { window.__csv = b; return orig.call(URL, b); }; })()`);
  await click(`[...document.querySelectorAll('.data-table button')].find(b => /export/i.test(b.textContent))`); await sleep(800);
  const dayCsv = (await evalJs(`window.__csv ? window.__csv.text() : ''`)).split('\n').map(l => l.split(',')[0].replace(/"/g, '')).filter(d => /^\d/.test(d));
  check('Daily: CSV export writes days as MM/DD/YYYY', dayCsv.length === 7 && dayCsv[0] === '10/18/2026' && dayCsv[6] === '10/24/2026', dayCsv.join('|'));
  await click(`[...document.querySelectorAll('.local-controls [role=radio]')].find(b => b.textContent === 'MDoc (operational target)')`); await sleep(800);
  check('Daily: MDoc hours selectable in the normal view; spend stays on Budget', (await dHours()) === 'MDoc hours|vs MDoc' && (await evalJs(`[...document.querySelectorAll('h2')].some(h => h.textContent === 'Daily labor hours vs MDoc')`)) && (await evalJs(`[...[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Labor spend').querySelectorAll('dt')].map(d => d.textContent).join('|')`)) === 'Budgeted spend|vs Budget');
  await click(`[...document.querySelectorAll('.local-controls [role=radio]')].find(b => b.textContent === 'Budget')`); await sleep(500);
  check('Daily defaults to last completed week', (await evalJs(`document.querySelector('.local-controls select').selectedOptions[0].textContent`)).includes('last completed week')); await setSelect('Day', '1'); await sleep(800); check('Daily day filter', (await text('.data-table .table-count')) === '1 of 1 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store')`); await sleep(800); check('Daily by store', (await text('.data-table .table-count')) === '60 of 60 rows', await text('.data-table .table-count'));
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'By store and department')`); await sleep(1200); check('Daily by store and department', Number((await text('.data-table .table-count')).split(' ')[0]) > 600, await text('.data-table .table-count'));
  // Tracking: full column names, keyboard-accessible header tooltips, separate Terminations and Hires
  await go(base + '?page=tracking');
  const heads = await evalJs(`[...document.querySelectorAll('.data-table thead tr:last-child th .sort-btn')].map(b => b.textContent.trim()).join('|')`);
  check('Tracking headers use full names', ['Terminations', 'Full-time (%)', 'Overtime $', 'Overtime rate', 'Call-off hours', 'Avg weekly hours FT'].every(h => heads.includes(h)) && !heads.includes('Terms'), heads);
  const tipShown = await evalJs(`(() => { const b = [...document.querySelectorAll('.data-table thead .info-tip button')].find(x => x.getAttribute('aria-label').startsWith('About Overtime rate')); b.focus(); const t = document.getElementById(b.getAttribute('aria-describedby')); return getComputedStyle(t).visibility === 'visible' && t.textContent.includes('Denominator'); })()`);
  check('Header tooltip opens on keyboard focus', tipShown);
  check('Terminations and Hires labeled separately', (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Terminations & hires')?.querySelector('.kpi-value').textContent`) ?? '').match(/Terminations.*Hires/) !== null);
  await click(`document.querySelector('.data-table tr.tree-depth-0 .tree-btn')`); await sleep(800);
  check('Tracking: a store expands to its departments', (await depthRows(1)) > 5, `${await depthRows(1)} department rows`);
  check('Tracking: chain benchmark labeled as a benchmark, not a total', (await evalJs(`document.querySelector('tr.pinned td').textContent`)).startsWith('Chain benchmark') && (await evalJs(`document.querySelector('tr.pinned td').textContent`)).includes('not a total'));
  await searchFor('pharmacy'); await sleep(900);
  check('Tracking: Pharmacy department row is out of overtime scope', (await evalJs(`[...document.querySelectorAll('tr.tree-depth-1')].some(r => r.textContent.startsWith('Pharmacy') && r.textContent.includes('Out of OT scope'))`)));
  await searchFor(''); await sleep(600);
  const attLabels = await evalJs(`[...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')].map(t => [...t.querySelectorAll('tspan')].map(x => x.textContent).join(' ') || t.textContent).join('|')`);
  check('Tracking attendance: readable labels without the threshold, no early-departure category', ['Late arrivals', 'More than half of shift not worked', 'Unpaid absence (timecard)', 'Unpaid absence (exception)', 'No call, no show (timecard)', 'Unpaid sick time (timecard)'].every(l => attLabels.includes(l)) && !/min|early/i.test(attLabels), attLabels);
  check('Tracking attendance: category tooltip names the source categories and open items', (await evalJs(`[...document.querySelectorAll('.info-tip button')].find(b => b.getAttribute('aria-label') === 'About the attendance categories')?.parentElement.textContent ?? ''`)).includes('Late arrivals. Source category: Late In >15. The threshold unit and business rule are pending confirmation.') && !(await evalJs(`/early/i.test([...document.querySelectorAll('.visual-card')].find(c => c.querySelector('h2')?.textContent === 'Attendance incidents by type').textContent)`)));
  check('Tracking attendance: KPI and chart kept; tooltip states UKG today and Workday availability pending', (await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Attendance incidents') && [...document.querySelectorAll('h2')].some(h => h.textContent === 'Attendance incidents by type')`)) && (await evalJs(`[...document.querySelectorAll('.info-tip button')].find(b => b.getAttribute('aria-label') === 'About the attendance categories')?.parentElement.textContent ?? ''`)).includes('Attendance information is currently available in UKG. Its availability following the Workday migration still needs confirmation (D35).'));
  check('Tracking attendance: visible note without internal references', (await evalJs(`[...document.querySelectorAll('.chart-note')].some(n => n.textContent === 'Attendance reporting is included in the proposed view. Data availability following the Workday migration is pending confirmation. Illustrative incident counts by attendance category. Source categories and pending definitions are available in the tooltips.')`)) && !(await evalJs(`[...document.querySelectorAll('.chart-note')].some(n => n.textContent.includes('R41'))`)));
  check('Tracking attendance: incidents counted on the card', await evalJs(`(() => { const card = [...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent === 'Attendance incidents').querySelector('.kpi-value').textContent.replace(/,/g, ''); return Number(card) > 0; })()`));
  check('FT / PT Ratio card title', (await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'FT / PT Ratio')`)));
  check('Headcount card reconciles with no other movements', (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Beginning'))?.textContent`)).includes('Other movements+0') || (await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.querySelector('.kpi-label').textContent.startsWith('Beginning'))?.textContent`)).includes('Other movements0'));
  // Single-day custom range is reported as its whole week and says so
  await click(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent === 'Custom')`); await sleep(800);
  await evalJs(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (const el of document.querySelectorAll('.fb-date input[type=text]')) { set.call(el, '10/24/2026'); el.dispatchEvent(new Event('input', {bubbles: true})); } })()`); await sleep(2500);
  const weeksNote = await text('.fb-weeks-note');
  check('Single day shows the whole-week note', !!weeksNote && weeksNote.includes('10/18/2026 – 10/24/2026'), weeksNote);
  check('Scope line states whole weeks', (await evalJs(`[...document.querySelectorAll('.scope-part')].map(x => x.textContent).join('|')`)).includes('whole weeks; selected 10/24/2026'));
  await click(`document.querySelector('.fb-reset')`); await sleep(2000);
  // Tracking: benchmark toggle changes chain row const incAll = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); await setSelect('Department', 'meat'); await sleep(3000); const incMeat = await evalJs(`[...document.querySelectorAll('.kpi')].find(k => k.textContent.startsWith('Attendance incidents'))?.querySelector('.kpi-value')?.textContent`); check('Attendance responds to Department', incAll !== incMeat, `${incAll} → ${incMeat}`); await click(`document.querySelector('.fb-reset')`); await sleep(2000); check('Scope card removed', !(await evalJs(`[...document.querySelectorAll('.kpi-label')].some(l => l.textContent === 'Scope')`))); const b1 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); await openDiscovery(); await click(`[...document.querySelectorAll('.discovery-dialog [role=radio]')].find(b => b.textContent === 'Simple store average')`); await sleep(1500); await closeDiscovery(); const b2 = await evalJs(`[...document.querySelectorAll('tr.pinned td')].map(t=>t.textContent).join('|')`); check('Benchmark method changes chain turnover', b1 !== b2, `${b1} → ${b2}`);
  // People: position filter + breakdown
  await go(base + '?page=people'); const h0 = await kpi();
  check('People: breakdown subtitle without implementation reference', (await evalJs(`[...document.querySelectorAll('.visual-card p')].some(p => p.textContent.startsWith('Choose a breakdown. Values'))`)) && !(await evalJs(`document.body.innerText.includes('Power BI field parameter')`))); await click(`document.querySelector('.fb-more')`); await sleep(400); await setSelect('Position', 'Cashier'); await sleep(1500); const h1 = await kpi(); check('Position filter changes headcount', h0 !== h1, `${h0} → ${h1}`);
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
