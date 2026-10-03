/* ClaimDataCare tests • browser harness.
 * Serves the repo files as https://app.claimdatacare.test (so HTTPS rules apply), replaces
 * Firebase with support/fake-firebase.js, and answers every outside service with a stub.
 * Nothing leaves the machine. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const ORIGIN = 'https://app.claimdatacare.test';
const FAKE_FB = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json' };

let browser = null;
async function getBrowser() {
  if (browser) return browser;
  const opts = {};
  if (process.env.CDC_CHROMIUM) opts.executablePath = process.env.CDC_CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  browser = await chromium.launch(opts);
  return browser;
}
async function closeBrowser() { if (browser) { await browser.close(); browser = null; } }

// Default answers of the outside services (tests can override per route)
function defaultService(url) {
  const u = new URL(url);
  if (/usps\./.test(u.hostname)) return { status: 200, body: { found: true, source: 'USPS', address: { addr1: '100 MAIN ST', addr2: '', city: 'MIAMI', state: 'FL', zip: '33130' } } };
  if (/email-service\./.test(u.hostname)) return { status: 200, body: { success: true, id: 'mail-1' } };
  if (/geocoding\.geo\.census\.gov/.test(u.hostname)) return { status: 200, body: { result: { addressMatches: [] } } };
  return { status: 200, body: {} };
}

/**
 * Opens a page of the app.
 * opts.path          '/app.html' (default) + query
 * opts.seed          initial cloud data { collection: { id: doc } }
 * opts.accounts      sign-in accounts { email: password }
 * opts.signedInAs    email already signed in to Firebase (persisted session)
 * opts.session       object stored as the app session before load
 * opts.init          extra script (string) run before the app
 * opts.services      function(url) -> {status, body} | null to override outside services
 * opts.wait          ms to wait after load (default 1800)
 * opts.beforeLoad    async (page) => {} run before navigation (e.g. page.clock.install())
 * opts.clockLoad     true when the page clock is installed: wait with clock.runFor
 */
async function openApp(opts = {}) {
  const b = await getBrowser();
  const ctx = opts.context || await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], network = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 300)));
  await page.route('**/*', async route => {
    const url = route.request().url();
    const u = new URL(url);
    if (u.origin === ORIGIN) {
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    }
    network.push({ method: route.request().method(), url, body: route.request().postData() });
    if (/firebasejs\/.*firebase-app-compat/.test(url)) return route.fulfill({ contentType: 'application/javascript', body: FAKE_FB });
    if (/firebasejs\//.test(url)) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({ contentType: 'text/css', body: '' });
    if (/fonts\.gstatic\.com/.test(url)) return route.fulfill({ status: 404, body: '' });
    if (/(unpkg\.com|cdnjs\.cloudflare\.com|jsdelivr\.net)/.test(url)) return route.fulfill({ contentType: 'application/javascript', body: '' });
    const r = (opts.services && opts.services(url)) || defaultService(url);
    return route.fulfill({ status: r.status || 200, contentType: 'application/json', body: JSON.stringify(r.body || {}) });
  });
  let init = 'window.__SEED=' + JSON.stringify(opts.seed || {}) + ';window.__ACCOUNTS=' + JSON.stringify(opts.accounts || {}) + ';';
  if (opts.signedInAs) init += "if(!sessionStorage.getItem('__fakeUserSet')){sessionStorage.setItem('__fakeUser'," + JSON.stringify(opts.signedInAs) + ");sessionStorage.setItem('__fakeUserSet','1');}";
  if (opts.session) init += "if(!sessionStorage.getItem('__sessSet')){sessionStorage.setItem('_cdc_tab_alive','1');sessionStorage.setItem('rcmpro_session'," + JSON.stringify(JSON.stringify(opts.session)) + ");sessionStorage.setItem('__sessSet','1');}";
  init += (opts.init || '');
  await page.addInitScript(init);
  if (opts.beforeLoad) await opts.beforeLoad(page);
  await page.goto(ORIGIN + (opts.path || '/app.html'), { waitUntil: 'load' });
  if (opts.clockLoad) await page.clock.runFor(opts.wait == null ? 1800 : opts.wait);
  else await page.waitForTimeout(opts.wait == null ? 1800 : opts.wait);
  return { page, ctx, errors, network, close: () => ctx.close() };
}

// Blank HTTPS page with only the given scripts (component tests)
async function openComponent(scripts, opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 300)));
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><div id="toasts"></div>' +
    scripts.map(s => '<script src="/' + s + '"></script>').join('') + '</body></html>';
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === ORIGIN) {
      if (u.pathname === '/__component.html') return route.fulfill({ contentType: 'text/html', body: html });
      const f = path.join(ROOT, u.pathname);
      if (fs.existsSync(f) && !fs.statSync(f).isDirectory()) return route.fulfill({ contentType: TYPES[path.extname(f)] || 'text/plain', body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify((opts.services && opts.services(u.href)) || { ok: 1 }) });
  });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(ORIGIN + '/__component.html', { waitUntil: 'load' });
  return { page, ctx, errors, close: () => ctx.close() };
}

// Sign in through the real login screen
async function signIn(page, email, password, wait = 2500) {
  await page.waitForSelector('#li-username', { timeout: 8000 });
  await page.fill('#li-username', email);
  await page.fill('#li-pass', password);
  await page.click('#login-btn');
  await page.waitForTimeout(wait);
}
const store = page => page.evaluate(() => window.__STORE);
const session = page => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('rcmpro_session') || 'null'); } catch (e) { return null; } });
const loginAlert = page => page.evaluate(() => ((document.getElementById('login-alert') || {}).textContent || '').trim());
const auditActions = page => page.evaluate(() => Object.values((window.__STORE || {}).auditLog || {}).map(a => a.action));

module.exports = { ROOT, ORIGIN, openApp, openComponent, signIn, store, session, loginAlert, auditActions, closeBrowser };
