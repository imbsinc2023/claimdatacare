/* Integration tests • session restore, cloud data loading, stored-XSS defense,
   write path, access records (userRoles) and access refused by the database. */
'use strict';
const H = require('../support/harness');
const A = require('../support/assert');
const { PASS, ACCOUNTS, seed, USERS } = require('../support/fixtures');

async function run(opts, fn) {
  const a = await H.openApp(Object.assign({ seed: seed(), accounts: ACCOUNTS }, opts));
  try { await fn(a.page, a); A.noErrors(a.errors); } finally { await a.close(); }
}
const bea = { id: 'uid-biller@clinic.test', email: 'biller@clinic.test', name: 'Bea Biller' };

module.exports = {
  name: 'session & data',
  tests: [
    { name: 'a session typed into the browser without a Firebase sign-in is discarded', fn: () => run({ session: { id: 'x', email: 'hacker@evil.test', role: 'Super Admin', name: 'H' }, wait: 7500 }, async p => {
      A.eq(await H.session(p), null);
      A.ok(await p.$('#li-username'), 'login screen shown');
    }) },
    { name: 'role edited in the browser is replaced by the role in the cloud', fn: () => run({ signedInAs: 'biller@clinic.test', session: Object.assign({ role: 'Super Admin' }, bea), wait: 4500 }, async p => {
      A.eq((await H.session(p)).role, 'Biller');
    }) },
    { name: 'user deactivated in the cloud loses the session on reload', fn: () => {
      const s = seed(); s.meta.users.list.find(u => u.id === 'u-biller').status = 'inactive';
      return run({ seed: s, signedInAs: 'biller@clinic.test', session: Object.assign({ role: 'Biller' }, bea), wait: 4500 }, async p => {
        A.eq(await H.session(p), null);
        A.ok(await p.$('#li-username'), 'back to sign in');
      });
    } },
    { name: 'hostile names from the cloud are shown as text in the patient list and chart', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => go('patients')); await p.waitForTimeout(1200);
      const listText = await p.evaluate(() => document.getElementById('patients-tbl').innerText);
      A.has(listText, '‹SVG ONLOAD', 'shown as text');
      await p.evaluate(() => openPatientChart('px')); await p.waitForTimeout(1500);
      A.eq(await p.evaluate(() => window.__pwned || 0), 0, 'no script ran');
      A.eq(await p.evaluate(() => document.querySelectorAll('img[src="x"], svg[onload]').length), 0, 'no injected elements');
    }) },
    { name: 'clinical text keeps < and > exactly; identity fields are disarmed when saved', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => setDB(d => { const x = d.patients.find(q => q.id === 'px'); x.notes = 'BP < 120 and HR > 100'; x.updatedAt = Date.now(); }));
      await p.waitForTimeout(2500);
      const px = (await H.store(p)).patients.px;
      A.eq(px.notes, 'BP < 120 and HR > 100');
      A.no(/[<>]/.test(px.first + px.last + px.payerName), 'identity fields stored without markup: ' + px.first + ' ' + px.last);
    }) },
    { name: 'Super Admin load publishes access records (userRoles) bound to each sign-in', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 4500);
      const roles = (await H.store(p)).userRoles || {};
      A.eq(roles['biller@clinic.test'] && roles['biller@clinic.test'].role, 'Biller');
      A.eq(roles['biller@clinic.test'].uid, 'uid-biller@clinic.test');
      A.eq(roles['biller@clinic.test'].active, true);
      A.eq(roles['off@clinic.test'] && roles['off@clinic.test'].active, false, 'inactive user marked inactive');
    }) },
    { name: 'when the database refuses access the user sees a clear message', fn: () => run({ init: "window.__DENY=function(c,op){return c==='patients'&&op==='list';};" }, async p => {
      await H.signIn(p, 'biller@clinic.test', PASS.biller, 3500);
      const t = await p.evaluate(() => document.getElementById('toasts').innerText);
      A.has(t, 'access');
    }) },
    { name: 'opening a chart and signing out are written to the audit trail', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => openPatientChart('pa')); await p.waitForTimeout(800);
      await p.evaluate(() => _performLogout()); await p.waitForTimeout(800);
      const acts = await H.auditActions(p);
      A.ok(acts.includes('PATIENT_VIEW'), 'PATIENT_VIEW in ' + acts);
      A.ok(acts.includes('LOGOUT'), 'LOGOUT in ' + acts);
    }) },
    { name: 'old public portal links show a neutral page and run nothing', fn: () => run({ path: '/app.html?demographics=abc&idata=eyJmaXJzdE5hbWUiOiI8aW1nIHNyYz14IG9uZXJyb3I9d2luZG93Ll9fcHduZWQ9MT4ifQ==', wait: 3000 }, async p => {
      A.has(await p.evaluate(() => document.body.innerText), 'no longer valid');
      A.eq(await p.evaluate(() => window.__pwned || 0), 0);
    }) }
  ]
};
