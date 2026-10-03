/* Integration tests • secure email links (reset password) and user administration rules. */
'use strict';
const H = require('../support/harness');
const A = require('../support/assert');
const { PASS, ACCOUNTS, seed } = require('../support/fixtures');

async function run(opts, fn) {
  const a = await H.openApp(Object.assign({ seed: seed(), accounts: ACCOUNTS }, opts));
  try { await fn(a.page, a); A.noErrors(a.errors); } finally { await a.close(); }
}
const CODE = 'RESETintegration1234567890';

module.exports = {
  name: 'links & users',
  tests: [
    { name: 'forgot password: invalid email refused, valid one answered generically, 60 s pause', fn: () => run({}, async p => {
      await p.click('#cdcx-forgot'); await p.waitForTimeout(500);
      await p.fill('#fp-email', 'not-an-email'); await p.click('#fp-btn'); await p.waitForTimeout(200);
      A.eq(await p.textContent('#fp-alert'), 'Enter a valid email address.');
      await p.fill('#fp-email', 'biller@clinic.test'); await p.click('#fp-btn'); await p.waitForTimeout(400);
      A.has(await p.textContent('#fp-alert'), 'If an account exists');
      await p.click('#fp-btn'); await p.waitForTimeout(200);
      A.has(await p.textContent('#fp-alert'), 'Please wait');
      A.eq(await p.evaluate(() => window.__LOG.resets), ['biller@clinic.test']);
    }) },
    { name: 'reset link: token leaves the address bar; weak and mismatched passwords refused', fn: () => run({ path: '/app.html?mode=resetPassword&oobCode=' + CODE + '&apiKey=x', init: "localStorage.setItem('__fakeCodesAll', JSON.stringify({'" + CODE + "':'biller@clinic.test'}));" }, async p => {
      A.no(p.url().includes('oobCode'), 'URL still has the token: ' + p.url());
      await p.fill('#rp-pass', 'password123'); await p.fill('#rp-pass2', 'password123'); await p.click('#rp-btn'); await p.waitForTimeout(200);
      A.has(await p.textContent('#rp-alert'), 'still needs');
      await p.fill('#rp-pass', 'Gr4nite!Harbor#Lake'); await p.fill('#rp-pass2', 'Gr4nite!Harbor#Lak3'); await p.click('#rp-btn'); await p.waitForTimeout(200);
      A.eq(await p.textContent('#rp-alert'), 'The two passwords do not match.');
      await p.fill('#rp-pass2', 'Gr4nite!Harbor#Lake'); await p.click('#rp-btn'); await p.waitForTimeout(800);
      A.eq(await p.textContent('.cdcx-h1'), 'Password updated');
      A.eq(await p.evaluate(() => window.__LOG.newPassword), 'Gr4nite!Harbor#Lake');
    }) },
    { name: 'used or expired reset link is refused', fn: () => run({ path: '/app.html?mode=resetPassword&oobCode=RESETexpired000000000000000' }, async p => {
      A.eq(await p.textContent('.cdcx-h1'), 'Link expired');
    }) },
    { name: 'users form: date of birth required and must be 18+', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => openAddUserModal()); await p.waitForTimeout(1500);
      await p.evaluate(() => { const s = (i, v) => { document.getElementById(i).value = v; }; s('nu-first', 'Ana'); s('nu-last', 'Lopez'); s('nu-name', 'ana.lopez'); s('nu-email', 'ana@clinic.test'); s('nu-phone', '3055551234'); });
      await p.evaluate(() => saveNewUser()); await p.waitForTimeout(200);
      A.eq(await p.textContent('#nu-dob-err'), 'Enter a valid date of birth');
      await p.fill('#nu-dob', '2012-06-06'); await p.evaluate(() => saveNewUser()); await p.waitForTimeout(200);
      A.has(await p.textContent('#nu-dob-err'), '18 years of age or older');
      A.no((await H.store(p)).meta.users.list.find(u => u.email === 'ana@clinic.test'), 'not created');
    }) },
    { name: 'creating an adult user provisions a sign-in account and sends the invitation link', fn: () => run({}, async p => {
      await H.signIn(p, 'owner@imbs.test', PASS.owner, 3500);
      await p.evaluate(() => openAddUserModal()); await p.waitForTimeout(1500);
      await p.evaluate(() => { const s = (i, v) => { document.getElementById(i).value = v; }; s('nu-first', 'Ana'); s('nu-last', 'Lopez'); s('nu-name', 'ana.lopez'); s('nu-email', 'Ana@Clinic.test'); s('nu-phone', '3055551234'); s('nu-dob', '1993-03-03'); });
      await p.evaluate(() => saveNewUser()); await p.waitForTimeout(3000);
      const u = (await H.store(p)).meta.users.list.find(x => x.email === 'ana@clinic.test');
      A.ok(u, 'user saved with the email in lower case'); A.eq(u.dob, '1993-03-03');
      A.ok((await p.evaluate(() => window.__LOG.provisioned || [])).includes('ana@clinic.test'), 'sign-in account created');
      A.ok((await p.evaluate(() => window.__LOG.resets)).includes('ana@clinic.test'), 'invitation (set password link) sent');
      A.eq(await H.session(p).then(s => s.email), 'owner@imbs.test', 'admin stays signed in');
    }) }
  ]
};
