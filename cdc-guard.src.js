window.CDC_BUILD = '__CDC_BUILD__';
/* ClaimDataCare • console guard • cdc-guard.js v1.0
   Loads first. In production it silences internal console output (log/info/debug...)
   and shows a branded notice for anyone who opens the browser console.
   Warnings and errors stay visible. Add ?debug=1 to the URL to see everything. */
(function () {
  'use strict';
  var debug = /[?&]debug=1\b/.test(location.search);
  var out = console.log.bind(console);
  if (!debug) {
    ['log', 'info', 'debug', 'trace', 'table', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog', 'count', 'countReset'].forEach(function (k) {
      try { console[k] = function () {}; } catch (e) {}
    });
  }
  var F = "font-family:'Sora','IBM Plex Sans',system-ui,sans-serif;";
  function banner() {
    out('%cClaimDataCare', F + 'font-size:34px;font-weight:700;letter-spacing:-.02em;color:#fff;padding:18px 40px;border-radius:14px;background:linear-gradient(90deg,#FF6A3D,#7B2FF7 40%,#00A3D1 75%,#E8367A);');
    out('%cStop!', F + 'font-size:26px;font-weight:700;color:#E8367A;padding:6px 0 0;');
    out('%cThis area of the browser is for developers. If someone asked you to copy or paste something here, it is a scam that could give them access to your account and to protected patient information.', F + 'font-size:14px;color:#0B1526;padding:4px 0;line-height:1.5;');
    out('%cClaimDataCare contains Protected Health Information safeguarded under the Health Insurance Portability and Accountability Act of 1996 (HIPAA). Access is limited to authorized users, and activity in the system is recorded.', F + 'font-size:13px;color:#fff;background:#0B1526;padding:12px 16px;border-radius:10px;line-height:1.5;');
    out('%cKeep your credentials confidential and report any unauthorized use of your account right away: contact@integratedmbs.com', F + 'font-size:13px;color:#fff;background:#7B2FF7;padding:12px 16px;border-radius:10px;line-height:1.5;');
    out('%c\u00A9 ' + new Date().getFullYear() + ' IMBS Inc. All rights reserved.', F + 'font-size:11px;color:#586579;padding:6px 0 0;');
  }
  banner();
  // shown again once the app has finished loading, so it stays at the top of what people see
  window.addEventListener('load', function () { setTimeout(function () { try { if (!debug) console.clear(); } catch (e) {} banner(); }, 1200); });
})();
