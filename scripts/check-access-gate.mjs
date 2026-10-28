// Checks the demo access gate in headless Chrome: wrong password, correct password, direct links, refresh,
// Lock, and the six required views. The password is read from ACCESS_TEST_PASSWORD and never printed.
// Usage: ACCESS_TEST_PASSWORD=… node scripts/check-access-gate.mjs <baseUrl>
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5176/';
const PW = process.env.ACCESS_TEST_PASSWORD ?? '';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'bc5-gate-'))}`, '--window-size=1440,1000', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const errors = [];
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id: i, method, params})); });
const ev = async e => (await send('Runtime.evaluate', {expression: e, awaitPromise: true, returnByValue: true})).result?.result?.value;
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const go = async url => { await send('Page.navigate', {url}); await sleep(5000); };
const login = async pw => {
  await ev(`(() => { const i = document.querySelector('#report-password'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(pw)}); i.dispatchEvent(new Event('input', {bubbles: true})); i.closest('form').requestSubmit(); })()`);
  await sleep(2500);
};
try {
  if (!PW) throw new Error('Set ACCESS_TEST_PASSWORD in the environment.');
  let wsUrl;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('Chrome did not start.');
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
  await send('Runtime.enable'); await send('Page.enable');

  await go(base + '?page=budget');
  check('Gate shown before access', (await text('#access-title')) === 'Enter the report');
  check('No report content behind the gate', !(await ev(`!!document.querySelector('.page-tabs')`)));
  await login('wrong passphrase for testing');
  check('Wrong password rejected', (await text('.access-error')) === 'Incorrect password. Please try again.');
  await login(PW);
  check('Correct password opens the deep-linked view', (await text('h1')) === 'Headcount & Hours vs Budget', await text('h1'));
  await send('Page.reload'); await sleep(5000);
  check('Refresh keeps the session and the page', (await text('h1')) === 'Headcount & Hours vs Budget', await text('h1'));
  const views = [['allocation', 'Store Ops Labor Allocation'], ['tracking', 'Turnover, Overtime & Call-off Tracking'], ['benchmark', 'Turnover & Retention Benchmark'], ['budget', 'Headcount & Hours vs Budget'], ['daily', 'Daily Labor vs Budget'], ['people', 'People Reporting (Filterable Ops 200)'], ['overview', 'Labor Overview']];
  for (const [id, title] of views) {
    await go(base + `?page=${id}`);
    const h = await text('h1');
    const kpis = await ev(`document.querySelectorAll('.kpi').length`);
    check(`Direct link ?page=${id}`, h === title && kpis > 0, `${h} · ${kpis} KPI cards`);
  }
  check('Static assets load (logo)', await ev(`(async () => (await fetch('/weis-1-logo-svg-vector.svg')).ok)()`));
  check('Fonts load', await ev(`document.fonts.ready.then(() => document.fonts.check('16px "Nunito Sans"'))`));
  await ev(`[...document.querySelectorAll('.header-button')].find(b => b.textContent.trim() === 'Lock').click()`); await sleep(1500);
  check('Lock returns to the gate', (await text('#access-title')) === 'Enter the report');
  await send('Page.reload'); await sleep(4000);
  check('After Lock, refresh still requires the password', (await text('#access-title')) === 'Enter the report');
} catch (e) {
  results.push('ERROR ' + e.message);
}
console.log(results.join('\n'));
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
process.exitCode = results.some(r => !r.startsWith('PASS')) || errors.length ? 1 : 0;
ws?.close();
chrome.kill();
