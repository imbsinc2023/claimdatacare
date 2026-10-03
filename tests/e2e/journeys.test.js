/* End-to-end tests • complete user journeys through the real screens (clicks and typing),
   with the in-memory cloud. Each journey starts at the sign-in page like a real user. */
'use strict';
const H = require('../support/harness');
const A = require('../support/assert');
const { PASS, ACCOUNTS, seed } = require('../support/fixtures');

async function run(opts, fn) {
  const a = await H.openApp(Object.assign({ seed: seed(), accounts: ACCOUNTS }, opts));
  try { await fn(a.page, a); A.noErrors(a.errors); } finally { await a.close(); }
}
async function chip(p, field, value) {
  await p.click('#pcd-root .pcd-f:has(#pcd-' + field + ') button[data-v="' + value + '"]');
}

module.exports = {
  name: 'journeys',
  tests: [
    { name: 'biller registers a new patient, finds it, opens the chart and signs out', timeout: 90000, fn: () => run({}, async (p, a) => {
      await H.signIn(p, 'biller@clinic.test', PASS.biller, 3500);
      await p.click('#tnav-patients'); await p.waitForTimeout(1200);
      await p.click('button:has-text("New patient")'); await p.waitForTimeout(1200);
      // Save with nothing filled: nothing is created and the message line explains why
      await p.click('#pcd-save'); await p.waitForTimeout(300);
      A.has(await p.textContent('#pcd-msg'), 'Last name is required');
      A.eq(Object.keys((await H.store(p)).patients).length, 2, 'nothing created yet');
      await p.fill('#pcd-last', 'Rivera'); await p.fill('#pcd-first', 'Carmen'); await p.fill('#pcd-dob', '1968-11-23');
      await chip(p, 'sex', 'F');
      await p.selectOption('#pcd-ethnicity', 'Hispanic'); await p.selectOption('#pcd-race', 'White');
      await p.fill('#pcd-addr1', '100 Main St'); await p.fill('#pcd-zip', '33130'); await p.fill('#pcd-city', 'Miami'); await p.fill('#pcd-state', 'FL');
      await p.fill('#pcd-phone', '3055550199');
      await p.click('#pcd-save'); await p.waitForTimeout(2500);
      const usps = a.network.find(n => /usps\./.test(n.url));
      A.ok(usps, 'address checked with the USPS service');
      const cloud = Object.values((await H.store(p)).patients).find(x => String(x.last).toUpperCase() === 'RIVERA');
      A.ok(cloud, 'patient saved in the cloud');
      A.eq([String(cloud.first).toUpperCase(), cloud.dob, cloud.state, cloud.providerId], ['CARMEN', '1968-11-23', 'FL', 'p1']);
      // the new patient's file opened; close it and find the patient from the list search
      A.ok(await p.$('#pt-chart-overlay'), 'patient file opened after saving');
      await p.click('.pcf-x[onclick="cdcCloseChart()"]'); await p.waitForTimeout(500);
      A.no(await p.$('#pt-chart-overlay'), 'file closed');
      await p.click('#tnav-patients'); await p.waitForTimeout(1000);
      await p.fill('#pat-q', 'rivera'); await p.waitForTimeout(800);
      A.has(await p.textContent('#patients-tbl'), 'RIVERA');
      // open the chart again: the account menu must stay usable on top of it (bug found and fixed)
      await p.click('#patients-tbl tbody [onclick^="openPatientChart"] >> nth=0'); await p.waitForTimeout(1200);
      A.ok(await p.$('#pt-chart-overlay'), 'file reopened from the list');
      // sign out through the account menu
      await p.click('#tn-user-chip'); await p.waitForTimeout(300);
      await p.click('.tn-um-out'); await p.waitForTimeout(400);
      await p.click('#confirm-logout-btn'); await p.waitForTimeout(1200);
      A.ok(await p.$('#li-username'), 'back at sign in');
      A.eq(await H.session(p), null);
      const acts = await H.auditActions(p);
      ['LOGIN', 'LOGOUT'].forEach(x => A.ok(acts.includes(x), x + ' audited: ' + acts));
    }) },
    { name: 'forgotten password: request link, open it, set a strong password, sign in with it', timeout: 90000, fn: async () => {
      const a = await H.openApp({ seed: seed(), accounts: ACCOUNTS });
      try {
        const p = a.page;
        await p.click('#cdcx-forgot'); await p.waitForTimeout(400);
        await p.fill('#fp-email', 'biller@clinic.test'); await p.click('#fp-btn'); await p.waitForTimeout(600);
        const code = await p.evaluate(() => localStorage.getItem('__lastResetCode'));
        A.ok(code, 'reset link issued');
        // the user opens the link from the email
        await p.goto(H.ORIGIN + '/app.html?mode=resetPassword&oobCode=' + code + '&apiKey=k&lang=en'); await p.waitForTimeout(2000);
        A.has(await p.textContent('#rp-lead'), 'b•••r@clinic.test');
        await p.fill('#rp-pass', 'N3w!Lighthouse#Coast'); await p.fill('#rp-pass2', 'N3w!Lighthouse#Coast');
        await p.click('#rp-btn'); await p.waitForTimeout(800);
        A.eq(await p.textContent('.cdcx-h1'), 'Password updated');
        // the same link cannot be used twice
        await p.goto(H.ORIGIN + '/app.html?mode=resetPassword&oobCode=' + code); await p.waitForTimeout(1800);
        A.eq(await p.textContent('.cdcx-h1'), 'Link expired');
        // old password no longer works, new one does
        await p.goto(H.ORIGIN + '/app.html'); await p.waitForTimeout(1800);
        await H.signIn(p, 'biller@clinic.test', PASS.biller, 1800);
        A.eq(await H.loginAlert(p), 'Incorrect email or password.');
        await H.signIn(p, 'biller@clinic.test', 'N3w!Lighthouse#Coast', 3500);
        A.eq((await H.session(p)).role, 'Biller');
        A.noErrors(a.errors);
      } finally { await a.close(); }
    } },
    { name: 'inactivity: warning at 14 minutes, automatic sign-out at 15 (HIPAA automatic logoff)', timeout: 90000, fn: () => run({ beforeLoad: pg => pg.clock.install(), clockLoad: true }, async p => {
      await p.waitForSelector('#li-username');
      await p.fill('#li-username', 'biller@clinic.test'); await p.fill('#li-pass', PASS.biller); await p.click('#login-btn');
      await p.clock.runFor(6000);
      A.ok((await H.session(p)), 'signed in');
      await p.clock.runFor(14 * 60 * 1000 + 2000);
      A.ok(await p.$('#idle-warning-modal'), 'warning shown before sign-out');
      await p.clock.runFor(62 * 1000);
      A.eq(await H.session(p), null, 'signed out');
      A.ok(await p.$('#li-username'), 'sign-in screen');
    }) },
    { name: 'a refreshed tab keeps the session only while the Firebase sign-in is valid', timeout: 90000, fn: () => run({}, async p => {
      await H.signIn(p, 'biller@clinic.test', PASS.biller, 3500);
      await p.reload(); await p.waitForTimeout(5000);
      A.eq((await H.session(p)).role, 'Biller', 'F5 keeps the session');
      await p.evaluate(() => firebase.auth().signOut());
      await p.reload(); await p.waitForTimeout(7500);
      A.eq(await H.session(p), null, 'no Firebase sign-in: session dropped');
    }) },
    { name: 'Super Admin creates an adult user; a minor cannot be created', timeout: 90000, fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => openAddUserModal()); await p.waitForTimeout(1500);
      await p.fill('#nu-first', 'Luis'); await p.fill('#nu-last', 'Mena'); await p.fill('#nu-email', 'luis.mena@clinic.test');
      await p.fill('#nu-phone', '3055550000'); await p.fill('#nu-dob', '2011-01-01');
      await p.click('#modal-add-user button.btn-primary'); await p.waitForTimeout(300);
      A.has(await p.textContent('#nu-dob-err'), '18 years');
      await p.fill('#nu-dob', '1999-12-12');
      await p.click('#modal-add-user button.btn-primary'); await p.waitForTimeout(3000);
      const u = (await H.store(p)).meta.users.list.find(x => x.email === 'luis.mena@clinic.test');
      A.ok(u, 'user created'); A.eq(u.dob, '1999-12-12');
      A.no(await p.$('#modal-add-user'), 'window closed');
    }) }
  ]
};
