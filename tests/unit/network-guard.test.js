/* Component tests • cdc-guard.js network guard (HTTPS only + per-service request limits). */
'use strict';
const { openComponent } = require('../support/harness');
const A = require('../support/assert');

async function withGuard(fn) {
  const c = await openComponent(['cdc-guard.js']);
  try { await fn(c.page); A.noErrors(c.errors); } finally { await c.close(); }
}

module.exports = {
  name: 'network guard',
  tests: [
    { name: 'plain HTTP requests are refused before leaving the browser', fn: () => withGuard(async p => {
      const r = await p.evaluate(async () => { try { await fetch('http://example.com/x'); return 'sent'; } catch (e) { return e.message; } });
      A.has(r, 'insecure');
    }) },
    { name: 'XMLHttpRequest to HTTP is refused too', fn: () => withGuard(async p => {
      const r = await p.evaluate(() => { try { const x = new XMLHttpRequest(); x.open('GET', 'http://example.com'); return 'opened'; } catch (e) { return e.message; } });
      A.has(r, 'insecure');
    }) },
    { name: 'same-site and HTTPS requests go through', fn: () => withGuard(async p => {
      const r = await p.evaluate(async () => [(await fetch('/cdc-guard.js')).status, (await fetch('https://claimmd-proxy.imbsinc2023.workers.dev', { method: 'POST' })).status]);
      A.eq(r, [200, 200]);
    }) },
    { name: 'Firebase / Google traffic is never throttled', fn: () => withGuard(async p => {
      const ms = await p.evaluate(async () => { const t = Date.now(); await Promise.all(Array.from({ length: 300 }, () => fetch('https://firestore.googleapis.com/x'))); return Date.now() - t; });
      A.ok(ms < 4000, 'took ' + ms + ' ms');
    }) },
    { name: 'email service: 10 per minute go at once, the rest are paced (not lost)', timeout: 40000, fn: () => withGuard(async p => {
      const r = await p.evaluate(async () => {
        const t = Date.now(), times = [];
        await Promise.all(Array.from({ length: 12 }, () => fetch('https://email-service.imbsinc2023.workers.dev/', { method: 'POST' }).then(() => times.push(Date.now() - t))));
        times.sort((a, b) => a - b); return times;
      });
      A.eq(r.length, 12, 'all delivered');
      A.ok(r[9] < 1500, 'first 10 immediate: ' + r[9]);
      A.ok(r[10] >= 4000, '11th paced: ' + r[10]);
    }) },
    { name: 'a runaway loop is stopped with a clear error', timeout: 20000, fn: () => withGuard(async p => {
      // 30 at once: 10 go now, the next places in line fit in 60 s, the rest are refused at once
      const r = await p.evaluate(async () => {
        let ok = 0, fail = 0, msg = '';
        Array.from({ length: 30 }, () => fetch('https://email-service.imbsinc2023.workers.dev/', { method: 'POST' }).then(() => ok++, e => { fail++; msg = e.message; }));
        await new Promise(r => setTimeout(r, 1500));
        return { ok, fail, msg };
      });
      A.eq(r.ok, 10, 'sent immediately');
      A.eq(r.fail, 10, 'refused immediately (beyond 60 s of waiting)');
      A.has(r.msg, 'Too many requests');
    }) }
  ]
};
