/* Integration tests • sign-in engine + user records in the cloud + session + audit trail.
   Real app (app.html and all modules) against the in-memory Firebase. */
'use strict';
const H = require('../support/harness');
const A = require('../support/assert');
const { PASS, ACCOUNTS, seed } = require('../support/fixtures');

async function run(opts, fn) {
  const a = await H.openApp(Object.assign({ seed: seed(), accounts: ACCOUNTS }, opts));
  try { await fn(a.page, a); A.noErrors(a.errors); } finally { await a.close(); }
}

module.exports = {
  name: 'sign-in',
  tests: [
    { name: 'Super Admin signs in: session from the cloud record, LOGIN audited with uid', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      const s = await H.session(p);
      A.eq(s && s.role, 'Super Admin'); A.eq(s.email, 'owner@imbs.test');
      const log = Object.values((await H.store(p)).auditLog || {});
      const login = log.find(e => e.action === 'LOGIN');
      A.ok(login, 'LOGIN entry written'); A.eq(login.uid, 'uid-owner@imbs.test');
    }) },
    { name: 'Biller signs in with the role from the cloud (not Super Admin)', fn: () => run({}, async p => {
      await H.signIn(p, 'biller@clinic.test', PASS.biller);
      A.eq((await H.session(p)).role, 'Biller');
    }) },
    { name: 'wrong password: generic message, no session', fn: () => run({}, async p => {
      await H.signIn(p, 'biller@clinic.test', 'Wrong#Password1', 1800);
      A.eq(await H.loginAlert(p), 'Incorrect email or password.');
      A.eq(await H.session(p), null);
    }) },
    { name: 'unknown email gets the same message (no account discovery)', fn: () => run({}, async p => {
      await H.signIn(p, 'nobody@clinic.test', 'Whatever#Pass1', 1800);
      A.eq(await H.loginAlert(p), 'Incorrect email or password.');
    }) },
    { name: 'username / first name is refused before contacting the server', fn: () => run({}, async p => {
      await H.signIn(p, 'bea.biller', PASS.biller, 800);
      A.eq(await H.loginAlert(p), 'Enter a valid email address.');
      A.eq(await p.evaluate(() => window.__LOG.signIns.length), 0);
    }) },
    { name: 'inactive user cannot sign in', fn: () => run({}, async p => {
      await H.signIn(p, 'off@clinic.test', ACCOUNTS['off@clinic.test'], 1800);
      A.has(await H.loginAlert(p), 'not active');
      A.eq(await H.session(p), null);
    }) },
    { name: 'minor with a birth date on file is denied and signed out', fn: () => run({}, async p => {
      await H.signIn(p, 'minor@clinic.test', PASS.minor, 1800);
      A.has(await H.loginAlert(p), '18 years of age or older');
      A.eq(await H.session(p), null);
      A.eq(await p.evaluate(() => firebase.auth().currentUser), null);
    }) },
    { name: 'user without birth date is asked once; adult date is saved in the cloud', fn: () => run({}, async p => {
      await H.signIn(p, 'nodob@clinic.test', PASS.nodob, 1500);
      A.ok(await p.$('#modal-dob'), 'date of birth window shown');
      await p.fill('#dob-input', '1991-09-09'); await p.click('#dob-ok'); await p.waitForTimeout(2500);
      const u = (await H.store(p)).meta.users.list.find(x => x.id === 'u-nodob');
      A.eq(u.dob, '1991-09-09'); A.eq((await H.session(p)).role, 'Biller');
    }) },
    { name: 'user who enters an under-18 date is deactivated and refused', fn: () => run({}, async p => {
      await H.signIn(p, 'nodob@clinic.test', PASS.nodob, 1500);
      await p.fill('#dob-input', '2014-04-04'); await p.click('#dob-ok'); await p.waitForTimeout(1500);
      const u = (await H.store(p)).meta.users.list.find(x => x.id === 'u-nodob');
      A.eq(u.inactive, true); A.eq(u.inactiveReason, 'Under 18');
      A.eq(await H.session(p), null);
    }) },
    { name: 'five failed attempts lock the form with a countdown', fn: () => run({}, async p => {
      for (let i = 0; i < 5; i++) await H.signIn(p, 'biller@clinic.test', 'Wrong#Password' + i, 900);
      A.has(await H.loginAlert(p), 'Too many attempts');
      A.eq(await p.evaluate(() => document.getElementById('login-btn').disabled), true);
    }) }
  ]
};
