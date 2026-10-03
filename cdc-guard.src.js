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

/* ClaimDataCare • network guard (2026-10-03)
   1. Encrypted transport only: the app is always served over HTTPS, and any request to an
      address that is not HTTPS (or same-site) is refused before it leaves the browser.
   2. Request limits per service: requests to the app's own services (workers) and to any
      outside address are paced with a per-minute budget. Bursts (for example a large claim
      batch) are slowed down, not lost; only a runaway loop or abuse is stopped.
   The servers apply their own limits too (workers, Firebase); this is the first layer. */
(function () {
  'use strict';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (location.protocol === 'http:' && !local) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  // requests per minute, by service
  var LIMITS = [
    { re: /^email-service\./, perMin: 10 },
    { re: /^claimmd-proxy\./, perMin: 240 },
    { re: /^claimmd-era\./, perMin: 60 },
    { re: /^claimmd-elig\./, perMin: 60 },
    { re: /^usps\./, perMin: 60 },
    { re: /^npiregistry\.cms\.hhs\.gov$|corsproxy\.io$|allorigins\.win$|codetabs\.com$/, perMin: 30 }
  ];
  var DEFAULT_PER_MIN = 120;                       // any other outside service
  // Google/Firebase traffic (database, sign-in, storage, libraries) keeps its own SDK limits
  var EXEMPT = /(^|\.)(googleapis\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|google\.com|googleusercontent\.com|cloudflare\.com|unpkg\.com|jsdelivr\.net)$/;
  var MAX_WAIT = 60000;
  var buckets = {};
  function budget(host) {
    for (var i = 0; i < LIMITS.length; i++) if (LIMITS[i].re.test(host)) return LIMITS[i].perMin;
    return DEFAULT_PER_MIN;
  }
  // Returns 0 (send now), the wait in ms for a reserved place in line, or -1 (refuse:
  // the line is longer than MAX_WAIT). Places are first come, first served.
  function take(host, canWait) {
    var per = budget(host), now = Date.now(), gap = 60000 / per;
    var b = buckets[host] || (buckets[host] = { t: per, at: now, q: 0 });
    b.t = Math.min(per, b.t + (now - b.at) * per / 60000); b.at = now;
    if (b.q <= now && b.t >= 1) { b.t -= 1; return 0; }
    if (!canWait) return -1;
    var slot = Math.max(b.q, now + (1 - Math.min(b.t, 1)) * gap);
    if (slot - now > MAX_WAIT) return -1;
    b.q = slot + gap;
    return Math.ceil(slot - now);
  }
  var warned = 0;
  function notify() {
    if (Date.now() - warned < 15000) return; warned = Date.now();
    try { if (typeof toast === 'function') toast('Too many requests in a short time. Please wait a moment.', 'warn'); } catch (e) {}
  }
  function check(url) {
    var u;
    try { u = new URL(url, location.href); } catch (e) { return { ok: false, why: 'Invalid address' }; }
    if (u.protocol === 'blob:' || u.protocol === 'data:') return { ok: true, host: '' };
    if (u.origin === location.origin) return { ok: true, host: '' };
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return { ok: false, why: 'Blocked: insecure (non-HTTPS) request' };
    if (EXEMPT.test(u.hostname)) return { ok: true, host: '' };
    return { ok: true, host: u.hostname };
  }
  var _fetch = window.fetch && window.fetch.bind(window);
  if (_fetch) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
      var c = check(url);
      if (!c.ok) return Promise.reject(new TypeError(c.why));
      if (!c.host) return _fetch(input, init);
      var wait = take(c.host, true);
      if (wait < 0) { notify(); return Promise.reject(new Error('Too many requests. Please wait a moment and try again.')); }
      if (!wait) return _fetch(input, init);
      if (wait > 1500) notify();
      return new Promise(function (resolve, reject) {
        setTimeout(function () { _fetch(input, init).then(resolve, reject); }, wait);
      });
    };
  }
  var XO = window.XMLHttpRequest && XMLHttpRequest.prototype.open;
  if (XO) {
    XMLHttpRequest.prototype.open = function (method, url) {
      var c = check(url);
      if (!c.ok) throw new TypeError(c.why);
      if (c.host && take(c.host, false) !== 0) { notify(); throw new Error('Too many requests. Please wait a moment and try again.'); }
      return XO.apply(this, arguments);
    };
  }
  var SB = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (SB) navigator.sendBeacon = function (url, data) { return check(url).ok ? SB(url, data) : false; };
})();
