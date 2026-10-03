/* Component tests • cdc-security.js (output encoding, safe URLs, stored-XSS neutralizer,
   audit trail queue, legacy browser data purge). Loaded alone in a blank HTTPS page. */
'use strict';
const { openComponent } = require('../support/harness');
const A = require('../support/assert');

async function withSec(fn, init) {
  const c = await openComponent(['cdc-security.js'], { init });
  try { await fn(c.page, c); A.noErrors(c.errors); } finally { await c.close(); }
}

module.exports = {
  name: 'cdc-security',
  tests: [
    { name: 'escapeHtml encodes the 6 HTML-special characters and handles null', fn: () => withSec(async p => {
      const r = await p.evaluate(() => [escapeHtml('<a href="x" onclick=\'y\'>&`</a>'), escapeHtml(null), escapeHtml(undefined), escapeHtml(0)]);
      A.eq(r, ['&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;', '', '', '0']);
    }) },
    { name: 'jsq makes a value safe inside an inline JS string', fn: () => withSec(async p => {
      const r = await p.evaluate(() => jsq("a');alert(1)//\n</script>"));
      A.no(/['"<>\n]/.test(r), 'raw quote/newline/angle bracket left: ' + r);
      A.eq(await p.evaluate(v => JSON.parse('"' + v + '"'), r), "a');alert(1)//\n</script>", 'round trip');
    }) },
    { name: 'cdcSafeUrl blocks script URLs and allows https, blob, images and PDFs', fn: () => withSec(async p => {
      const r = await p.evaluate(() => ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'vbscript:x', 'data:text/html;base64,PHNjcmlwdD4=', '//evil.example/x',
        'https://firebasestorage.googleapis.com/a', 'blob:https://app/1', 'data:image/png;base64,iVBOR', 'data:application/pdf;base64,JVBER', '/docs/a.pdf'].map(cdcSafeUrl));
      A.eq(r.slice(0, 5), ['', '', '', '', ''], 'dangerous URLs');
      A.eq(r.slice(5), ['https://firebasestorage.googleapis.com/a', 'blob:https://app/1', 'data:image/png;base64,iVBOR', 'data:application/pdf;base64,JVBER', '/docs/a.pdf'], 'safe URLs');
    }) },
    { name: 'cdcNeutralize disarms markup in identity fields only', fn: () => withSec(async p => {
      const r = await p.evaluate(() => cdcNeutralize({
        first: '<img src=x onerror=alert(1)>', email: 'a<b>@x.com', payerName: 'Aetna<script>',
        notes: 'BP < 120 and HR > 100', body: { plan: '<b>keep</b>' }, content: '<h3>Consent</h3>',
        photo: 'data:image/png;base64,AAAA', insurances: [{ name: '<svg onload=x>' }], long: 'x'.repeat(10)
      }));
      A.eq(r.first, '‹img src=x onerror=alert(1)›');
      A.eq(r.email, 'a‹b›@x.com');
      A.eq(r.payerName, 'Aetna‹script›');
      A.eq(r.insurances[0].name, '‹svg onload=x›', 'nested array');
      A.eq(r.notes, 'BP < 120 and HR > 100', 'clinical text untouched');
      A.eq(r.body.plan, '<b>keep</b>', 'note body untouched');
      A.eq(r.content, '<h3>Consent</h3>', 'templates untouched');
      A.eq(r.photo, 'data:image/png;base64,AAAA');
    }) },
    { name: 'cdcNeutralize survives odd input (null, numbers, cycles of depth)', fn: () => withSec(async p => {
      const r = await p.evaluate(() => {
        const deep = {}; let cur = deep; for (let i = 0; i < 20; i++) { cur.child = { name: '<x>' }; cur = cur.child; }
        return [cdcNeutralize(null), cdcNeutralize(5), cdcNeutralize('<x>'), !!cdcNeutralize(deep)];
      });
      A.eq(r, [null, 5, '<x>', true]);
    }) },
    { name: 'auditLog queues entries with bounded fields and never throws without Firebase', fn: () => withSec(async p => {
      const r = await p.evaluate(() => { auditLog('PATIENT_VIEW', 'x'.repeat(900), { patientId: 'pa' }); auditLog(); return window._cdcAuditMem; });
      A.eq(r.length, 2);
      A.eq(r[1].action, 'PATIENT_VIEW');
      A.eq(r[1].details.length, 500, 'details capped');
      A.eq(r[1].patientId, 'pa');
      A.eq(r[0].action, 'EVENT');
    }) },
    { name: 'legacy PHI and keys left in the browser are purged at start-up', fn: () => withSec(async p => {
      const r = await p.evaluate(() => ['cdc_cache_v2', 'cdc_audit_p1', 'rcmpro_api_cfg', 'cdc_firestore_backup_intakeClients', 'keep_me'].map(k => localStorage.getItem(k)));
      A.eq(r, [null, null, null, null, '1']);
    }, "['cdc_cache_v2','cdc_audit_p1','rcmpro_api_cfg','cdc_firestore_backup_intakeClients','keep_me'].forEach(k=>localStorage.setItem(k,'1'));") }
  ]
};
