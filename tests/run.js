#!/usr/bin/env node
/* ClaimDataCare test runner.
 *   node tests/run.js                 all suites
 *   node tests/run.js unit            component tests only (unit | integration | e2e)
 *   node tests/run.js e2e "patient"   only tests whose name contains "patient"
 * Writes tests/report/results.json and tests/report/REPORT.md */
'use strict';
const fs = require('fs');
const path = require('path');
const { closeBrowser } = require('./support/harness');

const LEVELS = ['unit', 'integration', 'e2e'];
const LABEL = { unit: 'Component tests', integration: 'Integration tests', e2e: 'End-to-end tests' };
const only = process.argv[2] && LEVELS.includes(process.argv[2]) ? [process.argv[2]] : LEVELS;
const filter = (process.argv[3] || '').toLowerCase();

(async () => {
  const results = [];
  const t0 = Date.now();
  for (const level of only) {
    const dir = path.join(__dirname, level);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
    for (const file of files) {
      const suite = require(path.join(dir, file));
      for (const t of suite.tests) {
        if (filter && !t.name.toLowerCase().includes(filter)) continue;
        const s = Date.now();
        let status = 'pass', error = '';
        try {
          await Promise.race([t.fn(), new Promise((_, ko) => setTimeout(() => ko(new Error('timeout (' + (t.timeout || 60000) + ' ms)')), t.timeout || 60000))]);
        } catch (e) { status = 'fail'; error = (e && (e.message || String(e))).slice(0, 600); }
        const r = { level, suite: suite.name, file, name: t.name, status, ms: Date.now() - s, error };
        results.push(r);
        console.log((status === 'pass' ? '  ✓ ' : '  ✗ ') + '[' + level + '] ' + suite.name + ' › ' + t.name + ' (' + r.ms + ' ms)' + (error ? '\n      ' + error : ''));
      }
    }
  }
  await closeBrowser();
  const pass = results.filter(r => r.status === 'pass').length, fail = results.length - pass;
  const out = path.join(__dirname, 'report'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ date: new Date().toISOString(), pass, fail, ms: Date.now() - t0, results }, null, 1));
  let md = '# ClaimDataCare • Test report\n\n' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC • ' +
    results.length + ' tests • **' + pass + ' passed** • **' + fail + ' failed** • ' + Math.round((Date.now() - t0) / 1000) + ' s\n\n';
  for (const level of only) {
    const rs = results.filter(r => r.level === level);
    if (!rs.length) continue;
    md += '## ' + LABEL[level] + ' (' + rs.filter(r => r.status === 'pass').length + '/' + rs.length + ')\n\n| Suite | Test | Result | Time |\n|---|---|---|---|\n';
    rs.forEach(r => { md += '| ' + r.suite + ' | ' + r.name + ' | ' + (r.status === 'pass' ? 'PASS' : 'FAIL: ' + r.error.replace(/\|/g, '/').replace(/\n/g, ' ')) + ' | ' + r.ms + ' ms |\n'; });
    md += '\n';
  }
  fs.writeFileSync(path.join(out, 'REPORT.md'), md);
  console.log('\n' + pass + ' passed, ' + fail + ' failed. Report: tests/report/REPORT.md');
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await closeBrowser(); process.exit(2); });
