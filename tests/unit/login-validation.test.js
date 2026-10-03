/* Component tests • cdc-login.js validators (email, password policy, adult age). */
'use strict';
const { openComponent } = require('../support/harness');
const A = require('../support/assert');

async function withLogin(fn) {
  const c = await openComponent(['cdc-login.js']);
  try { await fn(c.page); A.noErrors(c.errors); } finally { await c.close(); }
}
const pad = n => String(n).padStart(2, '0');
function ymdYearsAgo(years, dayShift) {
  const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() + (dayShift || 0));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

module.exports = {
  name: 'login validators',
  tests: [
    { name: 'valid emails are accepted', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => ['ana.lopez@clinic.com', 'a+b@sub.domain.org', 'x_y-z@imbs.co'].map(cdcValidEmail));
      A.eq(r, [true, true, true]);
    }) },
    { name: 'malformed emails are rejected', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => ['frank', 'a@b', 'a@@b.com', 'a b@c.com', '@c.com', 'a@c.', 'a@-c.com', 'a@c.c', 'x'.repeat(65) + '@c.com', 'a@' + 'b'.repeat(250) + '.com'].map(cdcValidEmail));
      A.eq(r, Array(10).fill(false));
    }) },
    { name: 'cleanEmail removes hidden characters, spaces and upper case', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => cdcCleanEmail('  Ana.Lopez​@Clinic.COM﻿ \n'));
      A.eq(r, 'ana.lopez@clinic.com');
    }) },
    { name: 'weak passwords list every missing rule', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => cdcPasswordIssues('password'));
      ['At least 12 characters', 'An uppercase letter', 'A number', 'A symbol (! @ # $ % ...)', 'No common words (password, 123456, qwerty...)'].forEach(x => A.ok(r.includes(x), 'missing rule: ' + x));
    }) },
    { name: 'strong password passes; name, email, repeats and length are enforced', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => ({
        strong: cdcPasswordIssues('Gr4nite!Harbor#Lake', { email: 'ana@clinic.com', first: 'Ana', last: 'Lopez' }),
        name: cdcPasswordIssues('LopezRiver#2026x', { email: 'ana@clinic.com', first: 'Ana', last: 'Lopez' }),
        repeat: cdcPasswordIssues('Graaanite!Harbor#1'),
        long: cdcPasswordIssues('Aa1!' + 'x'.repeat(130)),
        spaces: cdcPasswordIssues(' Gr4nite!Harbor#Lake')
      }));
      A.eq(r.strong, []);
      A.ok(r.name.includes('Not your name or email'));
      A.ok(r.repeat.includes('No character 3 times in a row'));
      A.ok(r.long.includes('No more than 128 characters'));
      A.ok(r.spaces.includes('No spaces at the start or end'));
    }) },
    { name: 'age is exact on the 18th birthday and the day before', fn: () => withLogin(async p => {
      const r = await p.evaluate(([a, b]) => [cdcAgeYears(a), cdcAgeYears(b), cdcIsAdultDob(a), cdcIsAdultDob(b)], [ymdYearsAgo(18), ymdYearsAgo(18, 1)]);
      A.eq(r, [18, 17, true, false]);
    }) },
    { name: 'impossible or future dates are not ages', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => ['2001-02-30', '2001-13-01', '3000-01-01', 'abc', '', '1800-01-01'].map(cdcAgeYears).map(x => Number.isNaN(x)));
      A.eq(r, [true, true, true, true, true, true]);
    }) },
    { name: 'US date format MM/DD/YYYY is understood', fn: () => withLogin(async p => {
      const r = await p.evaluate(() => [cdcAgeYears('05/05/1980') >= 46, cdcIsAdultDob('01/01/2015')]);
      A.eq(r, [true, false]);
    }) },
    { name: 'latest allowed birth date is exactly 18 years ago', fn: () => withLogin(async p => {
      A.eq(await p.evaluate(() => cdcMaxAdultDob()), ymdYearsAgo(18));
    }) }
  ]
};
