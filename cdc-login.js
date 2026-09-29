/*
 * ClaimDataCare  •  Sign-in screens (standalone module)
 * File: cdc-login.js  •  v3.0
 *
 * Everything about signing in lives here (removed from script1.js): the screens, the
 * sign-in engine (doLogin), two-step verification and password reset.
 * script1.js only calls window._cdcRenderLogin() / window._cdcRenderForgot().
 *
 * Adds: attempt lockout (5 fails → 30s, then 2m, 5m, 15m), Caps Lock warning,
 * show/hide password, no autofill of anything stored in the browser.
 * Loaded by app.html right after script1.js. Also sets the favicon.
 */
(function () {
  'use strict';
  if (window.__cdcxLogin) return;
  window.__cdcxLogin = true;

  var GUARD_KEY = 'cdcx_login_guard';
  try { localStorage.removeItem('cdcx_login_email'); } catch (e) {}   // left by older versions

  function lockSeconds(f) { return f < 5 ? 0 : f === 5 ? 30 : f === 6 ? 120 : f === 7 ? 300 : 900; }
  function getGuard() { try { var g = JSON.parse(localStorage.getItem(GUARD_KEY) || '{}'); return { f: g.f | 0, until: +g.until || 0 }; } catch (e) { return { f: 0, until: 0 }; } }
  function setGuard(g) { try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }

  var ICON_EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var ICON_SHIELD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
  var ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  var ICON_CLOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var CSS = [
    '#cdcx-login{position:fixed;inset:0;z-index:10;display:flex;background:#F6F8FB;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#0B1526;-webkit-font-smoothing:antialiased;opacity:1;transition:opacity .25s ease}',
    '#cdcx-login[hidden]{display:none}',
    '#cdcx-login.cdcx-out{opacity:0;pointer-events:none}',
    '#cdcx-login *{box-sizing:border-box}',
    '.cdcx-panel{position:relative;flex:0 0 520px;max-width:100%;height:100%;overflow-y:auto;background:#fff;padding:56px 72px 36px;display:flex;flex-direction:column;justify-content:space-between;gap:32px;box-shadow:1px 0 0 #E4E9F1,12px 0 40px rgba(11,21,38,.06);z-index:1}',
    '.cdcx-bar{position:absolute;left:0;top:0;right:0;height:4px;background:linear-gradient(90deg,#FF6A3D,#FF6A3D 38%,#6A1BDB 70%,#00A3D1)}',
    '.cdcx-brand{display:flex;align-items:center;gap:12px}',
    '.cdcx-brand-name{font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:700;font-size:21px;letter-spacing:-.02em}',
    '.cdcx-brand-sub{font-size:12px;color:#586579;margin-top:2px}',
    '.cdcx-main{display:flex;flex-direction:column;gap:26px}',
    '.cdcx-h1{margin:0;font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:700;font-size:34px;letter-spacing:-.025em;line-height:1.15}',
    '.cdcx-lead{margin:8px 0 0;font-size:15px;color:#586579;line-height:1.5}',
    '.cdcx-form{display:flex;flex-direction:column;gap:18px;margin:0}',
    '.cdcx-field{display:flex;flex-direction:column;gap:7px}',
    '.cdcx-row{display:flex;justify-content:space-between;align-items:baseline}',
    '.cdcx-label{font-size:13px;font-weight:600}',
    '.cdcx-input{width:100%;height:48px;padding:0 16px;border:1.5px solid #D6DDE8;border-radius:12px;font:inherit;font-size:15px;color:#0B1526;background:#FBFCFE;transition:border-color .15s,box-shadow .15s}',
    '.cdcx-input::placeholder{color:#8792A4}',
    '.cdcx-input:focus{outline:none;border-color:#D45C37;box-shadow:0 0 0 4px rgba(255,106,61,.18)}',
    '.cdcx-input[aria-invalid=true]{border-color:#D45C37}',
    '.cdcx-pwwrap{position:relative}',
    '.cdcx-pwwrap .cdcx-input{padding-right:52px}',
    '.cdcx-eye{position:absolute;right:2px;top:2px;width:44px;height:44px;border:0;background:transparent;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#586579}',
    '.cdcx-eye:hover{color:#0B1526;background:#F1F4F9}',
    '.cdcx-link{background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:600;color:#B8461F;cursor:pointer;text-decoration:none}',
    '.cdcx-link:hover{color:#8F3314;text-decoration:underline}',
    '.cdcx-caps{position:absolute;right:50px;top:50%;transform:translateY(-50%);margin:0;padding:3px 8px;border-radius:999px;background:#FFEDE6;color:#8F3314;font-size:11.5px;font-weight:600;pointer-events:none}',    '.cdcx-caps[hidden]{display:none}',
    '.cdcx-check{display:flex;align-items:center;gap:10px;font-size:14px;color:#3A475C;cursor:pointer;user-select:none}',
    '.cdcx-check input{width:18px;height:18px;margin:0;accent-color:#D45C37}',
    '.cdcx-btn{height:52px;border:0;border-radius:12px;background:linear-gradient(95deg,#C9431C,#D45C37);color:#fff;font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:600;font-size:16px;cursor:pointer;box-shadow:0 10px 24px -8px rgba(201,67,28,.55);display:flex;align-items:center;justify-content:center;gap:10px;transition:filter .15s,transform .05s}',
    '.cdcx-btn:hover{filter:brightness(1.06)}',
    '.cdcx-btn:active{transform:translateY(1px)}',
    '.cdcx-btn[disabled]{cursor:not-allowed;filter:grayscale(.35) opacity(.75);box-shadow:none}',
    '.cdcx-spin{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:cdcxspin .8s linear infinite}',
    '@keyframes cdcxspin{to{transform:rotate(360deg)}}',
    '.cdcx-alert{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:#FFF1EC;color:#9A3412;font-size:13.5px;line-height:1.45}',
    '.cdcx-alert[hidden]{display:none}',
    '.cdcx-alert.cdcx-lock{background:#F4F0FD;color:#4B1699}',
    '.cdcx-note{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:#F4F0FD;color:#4B1699;font-size:13px;line-height:1.45}',
    '.cdcx-foot{display:flex;flex-direction:column;gap:10px;font-size:12px;color:#586579}',
    '.cdcx-badges{display:flex;flex-wrap:wrap;gap:16px}',
    '.cdcx-badges span{display:flex;align-items:center;gap:6px}',
    '.cdcx-badges svg{color:#0A7FA6}',
    '#cdcx-login :focus-visible{outline:3px solid rgba(106,27,219,.45);outline-offset:2px}',
    '.cdcx-art{position:relative;flex:1 1 auto;height:100%;background:#0B1526;overflow:hidden}',
    '.cdcx-art svg.cdcx-bg{position:absolute;inset:0;width:100%;height:100%}',
    '.cdcx-chip{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#E6EBF3;font-size:12.5px;font-weight:500}',
    '.cdcx-dot{width:8px;height:8px;border-radius:50%;background:#00A3D1;box-shadow:0 0 0 4px rgba(0,163,209,.25)}',
    '.cdcx-copy{position:absolute;left:72px;right:72px;bottom:64px;max-width:620px;display:flex;flex-direction:column;gap:14px}',
    '.cdcx-eyebrow{font-size:12px;font-weight:600;letter-spacing:.16em;color:#FF8A63}',
    '.cdcx-headline{font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:700;font-size:clamp(34px,3.6vw,52px);line-height:1.04;letter-spacing:-.035em;color:#fff}',
    '.cdcx-sub{font-size:16px;line-height:1.5;color:#A9B4C6}',
    '.cdcx-pulse-main{stroke-dasharray:2400;stroke-dashoffset:2400;animation:cdcxdraw 2.2s cubic-bezier(.6,.1,.2,1) .15s forwards}',
    '@keyframes cdcxdraw{to{stroke-dashoffset:0}}',
    '@media (prefers-reduced-motion:reduce){.cdcx-pulse-main{animation:none;stroke-dashoffset:0}#cdcx-login{transition:none}}',
    '@media (max-width:980px){.cdcx-art{display:none}.cdcx-panel{flex:1 1 auto;padding:48px 28px 28px}.cdcx-main{max-width:440px;width:100%;margin:0 auto}}',
    '.cdcx-msgslot{height:64px;flex-shrink:0;display:flex;align-items:center}',    '.cdcx-msgslot>.alert{width:100%;max-height:64px;overflow:hidden;animation:cdcxmsg .18s ease-out}',    '@keyframes cdcxmsg{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',    '#login-alert .cdcx-lock{background:#F4F0FD!important;color:#4B1699!important}',    '.cdcx-spotlayer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5}',    '.cdcx-spot{position:absolute;left:0;top:0;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;background:radial-gradient(circle,rgba(255,106,61,.16),rgba(106,27,219,.09) 38%,rgba(0,163,209,.04) 55%,rgba(0,163,209,0) 70%);opacity:0;transition:opacity .35s ease;will-change:transform}',    '@media (pointer:coarse),(prefers-reduced-motion:reduce){.cdcx-spotlayer{display:none}}',
    '#modal-2fa{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(11,21,38,.72);font-family:"IBM Plex Sans",system-ui,sans-serif;color:#0B1526}',
    '#modal-2fa *{box-sizing:border-box}',
    '.cdcx-tfa{position:relative;overflow:hidden;width:100%;max-width:420px;background:#fff;border-radius:22px;padding:36px 32px 26px;display:flex;flex-direction:column;gap:14px;box-shadow:0 40px 90px -20px rgba(0,0,0,.5)}',
    '.cdcx-tfa h2{margin:0;font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:700;font-size:24px;letter-spacing:-.02em}',
    '.cdcx-tfa .cdcx-lead{margin:0;font-size:14.5px}',
    '.cdcx-tfa-ico{width:54px;height:54px;border-radius:16px;background:#F4F0FD;color:#4B1699;display:flex;align-items:center;justify-content:center}',
    '.cdcx-code{height:60px;font-size:28px!important;font-weight:700;letter-spacing:12px;text-align:center}',
    '.cdcx-tfa-row{display:flex;justify-content:space-between;align-items:center}',
    '.cdcx-muted{color:#586579!important}',

    '#tfa-alert .alert{display:block!important;margin:0!important;padding:11px 14px!important;border:0!important;border-radius:12px!important;background:#FFF1EC!important;color:#9A3412!important;font:500 13.5px/1.45 "IBM Plex Sans",sans-serif!important}',
    '#tfa-alert .al-success{background:#E3F5FB!important;color:#065E7C!important}',
    '#login-alert .alert,#fp-alert .alert{display:flex!important;gap:8px!important;align-items:center!important;margin:0!important;padding:12px 14px!important;border:0!important;border-radius:12px!important;background:#FFF1EC!important;color:#9A3412!important;font:500 13.5px/1.45 "IBM Plex Sans",sans-serif!important}',
    '#fp-alert .al-success{background:#E3F5FB!important;color:#065E7C!important}',
    '.cdcx-alert.cdcx-lock{background:#F4F0FD;color:#4B1699}'
  ].join('\n');
  var ART_SVG = [
    '<svg class="cdcx-bg" viewBox="0 0 920 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">',
    '<defs>',
    '<pattern id="cdcx-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,0.07)"/></pattern>',
    '<radialGradient id="cdcx-gO"><stop offset="0" stop-color="#FF6A3D" stop-opacity=".45"/><stop offset="1" stop-color="#FF6A3D" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="cdcx-gV"><stop offset="0" stop-color="#6A1BDB" stop-opacity=".55"/><stop offset="1" stop-color="#6A1BDB" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="cdcx-gB"><stop offset="0" stop-color="#00A3D1" stop-opacity=".40"/><stop offset="1" stop-color="#00A3D1" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="cdcx-beam" x1="0" y1="0" x2="920" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF6A3D" stop-opacity="0"/><stop offset=".12" stop-color="#FF6A3D"/><stop offset=".42" stop-color="#FF6A3D"/><stop offset=".72" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient>',
    '<linearGradient id="cdcx-pill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient>',
    '<filter id="cdcx-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>',
    '<filter id="cdcx-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>',
    '<path id="cdcx-p" d="M -20 540 L 150 540 L 176 540 L 192 504 L 208 540 L 226 540 L 246 372 L 270 660 L 292 468 L 308 540 L 340 540 C 470 540, 560 470, 640 380 S 800 180, 960 104"/>',
    '</defs>',
    '<rect width="920" height="900" fill="url(#cdcx-dots)"/>',
    '<circle cx="256" cy="515" r="330" fill="url(#cdcx-gO)"/>',
    '<circle cx="820" cy="120" r="360" fill="url(#cdcx-gV)"/>',
    '<circle cx="760" cy="860" r="340" fill="url(#cdcx-gB)"/>',
    '<circle cx="256" cy="515" r="96" fill="none" stroke="rgba(255,255,255,0.10)"/>',
    '<circle cx="256" cy="515" r="168" fill="none" stroke="rgba(255,255,255,0.07)" stroke-dasharray="3 7"/>',
    '<circle cx="256" cy="515" r="250" fill="none" stroke="rgba(255,255,255,0.05)"/>',
    '<circle cx="256" cy="515" r="340" fill="none" stroke="rgba(255,255,255,0.035)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1" opacity=".10" transform="translate(0,84)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1" opacity=".16" transform="translate(0,63)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1" opacity=".24" transform="translate(0,42)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1.2" opacity=".36" transform="translate(0,21)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1.2" opacity=".24" transform="translate(0,-21)"/>',
    '<use href="#cdcx-p" fill="none" stroke="url(#cdcx-beam)" stroke-width="1" opacity=".12" transform="translate(0,-42)"/>',
    '<path class="cdcx-pulse-main" d="M -20 540 L 150 540 L 176 540 L 192 504 L 208 540 L 226 540 L 246 372 L 270 660 L 292 468 L 308 540 L 340 540 C 470 540, 560 470, 640 380 S 800 180, 960 104" fill="none" stroke="url(#cdcx-beam)" stroke-width="14" stroke-linejoin="round" filter="url(#cdcx-glow)" opacity=".85"/>',
    '<path class="cdcx-pulse-main" d="M -20 540 L 150 540 L 176 540 L 192 504 L 208 540 L 226 540 L 246 372 L 270 660 L 292 468 L 308 540 L 340 540 C 470 540, 560 470, 640 380 S 800 180, 960 104" fill="none" stroke="url(#cdcx-beam)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>',
    '<circle cx="246" cy="372" r="16" fill="#FF6A3D" filter="url(#cdcx-soft)" opacity=".8"/><circle cx="246" cy="372" r="5" fill="#fff"/>',
    node(340, 540, 'Visit', 'up', 68), node(470, 523, 'Note signed', 'down', 104), node(578, 452, 'Claim 837P', 'up', 100),
    node(668, 346, 'Accepted', 'down', 88), node(770, 226, 'ERA 835', 'up', 84),
    '<circle cx="872" cy="146" r="18" fill="#00A3D1" filter="url(#cdcx-soft)" opacity=".9"/><circle cx="872" cy="146" r="6" fill="#fff"/>',
    '<line x1="872" y1="164" x2="872" y2="200" stroke="rgba(255,255,255,0.30)"/>',
    '<rect x="836" y="200" width="64" height="28" rx="14" fill="url(#cdcx-pill)"/>',
    '<text x="868" y="218" text-anchor="middle" font-family="Sora, sans-serif" font-size="12.5" font-weight="600" fill="#fff">Paid</text>',
    '</svg>'
  ].join('');  var LOGO = '<svg width="40" height="44" viewBox="0 0 40 44" aria-hidden="true" focusable="false"><defs><linearGradient id="cdcx-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A3D"/><stop offset=".4" stop-color="#FF6A3D"/><stop offset=".75" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient></defs><path d="M20 2 L37 8 V21 C37 32 29.5 39 20 42 C10.5 39 3 32 3 21 V8 Z" fill="url(#cdcx-lg)"/><path d="M20 13 V31 M11 22 H29" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg>';
  function node(x, y, label, dir, w) {
    var ly1 = dir === 'up' ? y - 12 : y + 12, ly2 = dir === 'up' ? y - 42 : y + 49;
    var ry = dir === 'up' ? y - 68 : y + 49;
    return '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="10" fill="none" stroke="rgba(255,255,255,0.35)"/>' +
      '<line x1="' + x + '" y1="' + ly1 + '" x2="' + x + '" y2="' + ly2 + '" stroke="rgba(255,255,255,0.25)"/>' +
      '<rect x="' + (x - w / 2) + '" y="' + ry + '" width="' + w + '" height="26" rx="13" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>' +
      '<text x="' + x + '" y="' + (ry + 17) + '" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="12" font-weight="500" fill="#E6EBF3">' + label + '</text>';
  }

  function injectCSS() {
    if (!document.getElementById('cdcx-fonts')) {
      var lk = document.createElement('link');
      lk.id = 'cdcx-fonts'; lk.rel = 'stylesheet';
      lk.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(lk);
    }
    if (!document.getElementById('cdcx-style')) {
      var st = document.createElement('style');
      st.id = 'cdcx-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
  }

  function art() {
    return '<aside class="cdcx-art" aria-hidden="true">' + ART_SVG +
      '<div class="cdcx-chip"><span class="cdcx-dot"></span>Secure connection</div>' +
      '<div class="cdcx-copy"><div class="cdcx-eyebrow">EHR • REVENUE CYCLE MANAGEMENT</div>' +
      '<div class="cdcx-headline">From heartbeat<br>to paid claim.</div>' +
      '<div class="cdcx-sub">Every visit, note and claim connected in one secure workspace.</div></div></aside>';
  }
  function shell(inner) {
    return '<div id="cdcx-login" role="main"><section class="cdcx-panel"><div class="cdcx-bar"></div>' +
      '<div class="cdcx-brand">' + LOGO + '<div><div class="cdcx-brand-name">ClaimDataCare</div><div class="cdcx-brand-sub">EHR and billing by IMBS Inc</div></div></div>' +
      '<div class="cdcx-main">' + inner + '</div>' +
      '<footer class="cdcx-foot"><div class="cdcx-badges"><span>' + ICON_SHIELD + 'HIPAA compliant</span><span>' + ICON_LOCK + 'Encrypted in transit and at rest</span></div>' +
      '<div>© ' + new Date().getFullYear() + ' Integrated Medical Billing Services Inc</div></footer></section>' + art() +
      '<div class="cdcx-spotlayer" aria-hidden="true"><div class="cdcx-spot"></div></div></div>';
  }
  // Soft light that follows the mouse pointer (login screens only; off on touch screens)
  function attachSpot() {
    var host = $('cdcx-login'), spot = host && host.querySelector('.cdcx-spot');
    if (!spot) return;
    var x = 0, y = 0, pending = 0;
    host.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        spot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        spot.style.opacity = '1';
      });
    });
    host.addEventListener('pointerleave', function () { spot.style.opacity = '0'; });
  }

  function setRoot(html) {
    var root = $('root');
    if (!root) return false;
    root.innerHTML = html;
    return true;
  }

  /* ---------------- Sign in ---------------- */
  var lockTimer = null, busy = false;

  function showMsg(text, lock) {
    var a = $('login-alert');
    if (!a) return;
    a.innerHTML = text ? '<div class="alert' + (lock ? ' cdcx-lock' : ' al-error') + '"></div>' : '';
    if (text) a.firstChild.textContent = text;
  }
  function lockCountdown() {
    clearInterval(lockTimer);
    function upd() {
      var btn = $('login-btn');
      if (!btn) { clearInterval(lockTimer); return; }
      var left = Math.ceil((getGuard().until - Date.now()) / 1000);
      if (left <= 0) { clearInterval(lockTimer); showMsg(''); btn.disabled = false; return; }
      showMsg('Too many attempts. Try again in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) + '.', true);
      btn.disabled = true;
    }
    upd(); lockTimer = setInterval(upd, 1000);
  }

  function signedIn() { try { return typeof getSession === 'function' && !!getSession(); } catch (e) { return false; } }

  async function submit() {
    if (busy) return;
    if (getGuard().until > Date.now()) { lockCountdown(); return; }
    var em = $('li-username'), pw = $('li-pass');
    if (!em || !pw) return;
    em.value = em.value.trim();
    if (!em.value || !pw.value) { showMsg('Enter your email and password.'); (em.value ? pw : em).focus(); return; }
    if (typeof doLogin !== 'function') { showMsg('Sign-in is not ready yet. Reload the page and try again.'); return; }
    busy = true;
    try { await doLogin(); } catch (e) { console.warn('[CDC] sign-in:', e && e.message); }
    busy = false;
    if (signedIn()) { setGuard({ f: 0, until: 0 }); return; }
    var a = $('login-alert');
    if (a && a.textContent.trim()) {                // the app reported a failed attempt
      var g = getGuard(); g.f += 1;
      var secs = lockSeconds(g.f);
      if (secs) g.until = Date.now() + secs * 1000;
      setGuard(g);
      if ($('li-pass')) $('li-pass').value = '';
      if (secs) lockCountdown(); else if ($('li-pass')) $('li-pass').focus();
    }
  }

  function renderLogin() {
    injectCSS();
    clearInterval(lockTimer);
    var ok = setRoot(shell(
      '<div><h1 class="cdcx-h1" id="cdcx-title">Welcome back</h1><p class="cdcx-lead">Sign in to your clinical and revenue cycle workspace.</p></div>' +
      '<form class="cdcx-form" id="cdcx-form" novalidate autocomplete="on">' +
        '<div id="login-alert" class="cdcx-msgslot" role="alert" aria-live="assertive"></div>' +
        '<div class="cdcx-field"><label class="cdcx-label" for="li-username">Email</label>' +
          '<input class="cdcx-input no-upper" id="li-username" name="username" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="254" placeholder="name@practice.com"></div>' +
        '<div class="cdcx-field"><div class="cdcx-row"><label class="cdcx-label" for="li-pass">Password</label>' +
          '<button type="button" class="cdcx-link" id="cdcx-forgot">Forgot password?</button></div>' +
          '<div class="cdcx-pwwrap"><input class="cdcx-input no-upper" id="li-pass" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="128" placeholder="Enter your password">' +
          '<span class="cdcx-caps" id="cdcx-caps" hidden>Caps Lock on</span>' +
          '<button type="button" class="cdcx-eye" id="li-eye" aria-label="Show password" title="Show password" aria-pressed="false">' + ICON_EYE + '</button></div></div>' +
        '<button type="submit" class="cdcx-btn" id="login-btn">Sign in</button>' +
      '</form>' +
      '<div class="cdcx-note">' + ICON_CLOCK + '<span>For your security, sessions close after 15 minutes of inactivity.</span></div>'));
    if (!ok) return;

    var form = $('cdcx-form'), em = $('li-username'), pw = $('li-pass'), eye = $('li-eye');
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    em.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pw.focus(); } });
    eye.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      var lbl = show ? 'Hide password' : 'Show password';
      eye.setAttribute('aria-label', lbl); eye.title = lbl; eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      eye.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
      pw.focus();
    });
    function caps(e) { if (e.getModifierState) $('cdcx-caps').hidden = !e.getModifierState('CapsLock'); }
    pw.addEventListener('keydown', caps); pw.addEventListener('keyup', caps);
    pw.addEventListener('blur', function () { $('cdcx-caps').hidden = true; });
    $('cdcx-forgot').addEventListener('click', function () { if (typeof renderForgotPassword === 'function') renderForgotPassword(); });
    if (getGuard().until > Date.now()) lockCountdown();
    attachSpot();
    setTimeout(function () { try { em.focus(); } catch (e) {} }, 60);
  }

  /* ---------------- Forgot password ---------------- */
  function renderForgot() {
    injectCSS();
    clearInterval(lockTimer);
    var ok = setRoot(shell(
      '<div><h1 class="cdcx-h1">Reset your password</h1><p class="cdcx-lead">Enter the email you use to sign in and we will send you a reset link.</p></div>' +
      '<form class="cdcx-form" id="cdcx-fp-form" novalidate>' +
        '<div id="fp-alert" class="cdcx-msgslot" role="alert" aria-live="assertive"></div>' +
        '<div class="cdcx-field"><label class="cdcx-label" for="fp-email">Email</label>' +
          '<input class="cdcx-input no-upper" id="fp-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="254" placeholder="name@practice.com"></div>' +
        '<button type="submit" class="cdcx-btn" id="fp-btn">Send reset link</button>' +
        '<button type="button" class="cdcx-link" id="cdcx-back-signin" style="align-self:center">Back to sign in</button>' +
      '</form>'));
    if (!ok) return;
    $('cdcx-fp-form').addEventListener('submit', function (e) { e.preventDefault(); if (typeof doForgotPassword === 'function') doForgotPassword(); });
    $('cdcx-back-signin').addEventListener('click', function () { if (typeof renderLoginScreen === 'function') renderLoginScreen(); });
    attachSpot();
    setTimeout(function () { try { $('fp-email').focus(); } catch (e) {} }, 60);
  }


  /* =====================================================================
   *  SIGN-IN ENGINE (moved here from script1.js on 2026-09-28)
   *  Same flow as before (Firebase account first, then the app's own user
   *  list), with these security fixes:
   *   1. A Firebase account no longer becomes "Super Admin" automatically:
   *      the role, practice and specialties come from the user list in the
   *      cloud; an unknown account is refused (except the owner's email).
   *   2. Inactive users cannot sign in.
   *   3. Two-step verification now applies to every sign-in path, and the
   *      session is created only AFTER the code is verified (before, a
   *      refresh on the code screen could skip the check).
   *   4. Codes come from the browser's secure random generator, are no
   *      longer written in the email subject, allow 5 tries, and "Resend"
   *      has a 30-second pause.
   *   5. Old base64 passwords are upgraded to SHA-256 on the next sign-in.
   *   6. Messages never reveal whether an account exists.
   * ===================================================================== */
  var _pending2FA = null;          // { code, email, user, expires, tries, sentAt, onSuccess }
  var MAX_2FA_TRIES = 5;

  function _esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function _isInactive(u) { return !!u && (u.inactive === true || String(u.status || '').toLowerCase() === 'inactive'); }
  function _lc(e) { return String(e || '').toLowerCase(); }
  function _isOwnerEmail(e) {
    try { if (typeof _cdcIsOwnerEmail === 'function') return _cdcIsOwnerEmail(e); } catch (x) {}
    try { return _lc(e) === _lc(SUPER_ADMIN_EMAIL); } catch (x) { return false; }
  }

  // Links a user record to the Firebase account that just signed in, so the person can
  // change the email shown in Users & Account and keep signing in with it.
  // Saves: firebaseUid, authEmail (the account's sign-in email) and ownerAccount.
  // If the record's email differs from the account's, Firebase is asked to switch the
  // account to the new email (a confirmation link goes to the new address, once a day).
  async function _cloudUsers() {
    try { var d = await _db.collection('meta').doc('users').get(); return d.exists ? (d.data().list || []) : null; } catch (e) { return null; }
  }
  async function _linkAccount(rec, fbUser) {
    try {
      var list = await _cloudUsers();          // never save an old copy over the cloud list
      if (!list) return;
      var u = list.find(function (x) { return (rec.id && x.id === rec.id) || (_lc(x.email) === _lc(rec.email)); });
      if (!u) return;
      var isOwner = u.ownerAccount === true || _lc(fbUser.email) === _lc(SUPER_ADMIN_EMAIL);
      var changed = false;
      if (u.firebaseUid !== fbUser.uid) { u.firebaseUid = fbUser.uid; changed = true; }
      if (_lc(u.authEmail) !== _lc(fbUser.email)) { u.authEmail = fbUser.email; changed = true; }
      if (isOwner && u.ownerAccount !== true) { u.ownerAccount = true; changed = true; }
      if (u.emailVerified !== true) { u.emailVerified = true; changed = true; }
      if (u.passHash) { delete u.passHash; changed = true; }   // password lives only in Firebase now
      var wantsNewEmail = u.email && _lc(u.email) !== _lc(fbUser.email);
      if (wantsNewEmail && typeof fbUser.verifyBeforeUpdateEmail === 'function' && Date.now() - (u.authEmailChangeSentAt || 0) > 24 * 3600 * 1000) {
        try {
          await fbUser.verifyBeforeUpdateEmail(u.email);
          u.authEmailChangeSentAt = Date.now(); changed = true;
          setTimeout(function () { try { toast('We sent a confirmation link to ' + u.email + ' to finish changing your sign-in email.', 'info'); } catch (e) {} }, 2500);
        } catch (e) { console.warn('[CDC] email change request:', e && e.code); }
      }
      if (changed) { _usersCache = list; saveUsers(list); }
    } catch (e) { console.warn('[CDC] account link:', e && e.message); }
  }

  // The user record for a Firebase account: read from the cloud user list (now allowed, the
  // person is authenticated); the local list only if the cloud read fails.
  async function _userForFirebase(fbUser) {
    var email = String(fbUser.email || '').toLowerCase(), list = null;
    try {
      var d = await _db.collection('meta').doc('users').get();
      if (d.exists) { list = d.data().list || []; _usersCache = list; }
    } catch (e) {}
    if (!list) { try { list = getUsers(); } catch (e) { list = []; } }
    list = list || [];
    var u = list.find(function (x) { return x.firebaseUid && x.firebaseUid === fbUser.uid; }) ||
            list.find(function (x) { return _lc(x.authEmail) === email; }) ||
            list.find(function (x) { return _lc(x.email) === email; });
    if (u) return u;
    if (_lc(email) === _lc(SUPER_ADMIN_EMAIL)) {
      // The owner's account: use the owner's record in the app (whatever email it has now);
      // the built-in default is used only if the app has no owner record yet.
      return list.find(function (x) { return x.ownerAccount === true; }) ||
             list.find(function (x) { return x.id === DEFAULT_ADMIN.id; }) ||
             Object.assign({}, DEFAULT_ADMIN, { email: fbUser.email });
    }
    return null;
  }

  // The old app kept a copy of the user list (with password data) in the browser.
  // Once every user has a Firebase sign-in account that copy is no longer needed.
  function _dropLegacyUserCache() {
    try {
      var l = _usersCache || [];
      if (l.length && l.every(function (u) { return u.firebaseUid || u.id === DEFAULT_ADMIN.id || u.ownerAccount === true; })) {
        localStorage.removeItem(USERS_KEY);
      }
    } catch (e) {}
  }

  function generate2FACode() {
    var a = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return String(100000 + (a[0] % 900000));
  }

  function get2FADeviceKey(email) {
    return 'cdc_2fa_device_' + btoa(email).replace(/=/g,'');
  }

  function isDeviceRemembered(email) {
    try {
      var key = get2FADeviceKey(email);
      var stored = localStorage.getItem(key);
      if (!stored) return false;
      var data = JSON.parse(stored);
      if (Date.now() > data.expires) { localStorage.removeItem(key); return false; }
      return true;
    } catch(e) { return false; }
  }

  function rememberDevice(email) {
    try {
      var key = get2FADeviceKey(email);
      localStorage.setItem(key, JSON.stringify({
        email: email,
        expires: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        ts: Date.now(),
      }));
    } catch(e) {}
  }

  async function send2FACode(user) {
    var code = generate2FACode();
    var prev = _pending2FA;
    _pending2FA = { code: code, email: user.email, user: user, expires: Date.now() + 10 * 60 * 1000, tries: 0, sentAt: Date.now(), onSuccess: prev && prev.onSuccess };
    var html = [
      '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">',
      '<div style="background:#0B1526;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">ClaimDataCare verification code</h2></div>',
      '<div style="background:#F6F8FB;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E4E9F1">',
      '<p style="color:#0B1526;font-size:15px">Hello ' + _esc(user.first || user.name || '') + ',</p>',
      '<p style="color:#0B1526;font-size:14px">Your verification code is:</p>',
      '<div style="background:#D45C37;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:8px;margin:20px 0">' + code + '</div>',
      '<p style="color:#586579;font-size:13px">This code expires in <strong>10 minutes</strong> and can be used once.</p>',
      '<p style="color:#586579;font-size:13px">If you did not try to sign in, change your password and contact your administrator.</p>',
      '</div><p style="color:#8792A4;font-size:11px;text-align:center;margin-top:16px">ClaimDataCare • Secure Medical Billing</p></div>'
    ].join('');
    // The code is NOT in the subject (subjects show on lock screens and notifications)
    return await sendEmail(user.email, 'Your ClaimDataCare verification code', html, 'security');
  }

  function _tfaMsg(text, ok) {
    var a = document.getElementById('tfa-alert');
    if (!a) return;
    a.innerHTML = text ? '<div class="alert ' + (ok ? 'al-success' : 'al-error') + '"></div>' : '';
    if (text) a.firstChild.textContent = text;
  }

  function show2FAScreen(user, onSuccess) {
    injectCSS();
    var old = document.getElementById('modal-2fa'); if (old) old.remove();
    if (_pending2FA) _pending2FA.onSuccess = onSuccess;
    var ov = document.createElement('div');
    ov.id = 'modal-2fa';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'tfa-title');
    ov.innerHTML =
      '<div class="cdcx-tfa">' +
        '<div class="cdcx-bar"></div>' +
        '<div class="cdcx-tfa-ico">' + ICON_SHIELD.replace('width="14" height="14"', 'width="26" height="26"') + '</div>' +
        '<h2 id="tfa-title">Check your email</h2>' +
        '<p class="cdcx-lead">We sent a 6-digit code to <b>' + _esc(user.email) + '</b>. It expires in 10 minutes.</p>' +
        '<div id="tfa-alert" class="cdcx-msgslot" role="alert" aria-live="assertive"></div>' +
        '<label class="cdcx-label" for="tfa-code">Verification code</label>' +
        '<input id="tfa-code" class="cdcx-input cdcx-code no-upper" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">' +
        '<label class="cdcx-check"><input type="checkbox" id="tfa-remember"> Remember this device for 30 days</label>' +
        '<button type="button" class="cdcx-btn" id="tfa-verify">Verify</button>' +
        '<div class="cdcx-tfa-row"><button type="button" class="cdcx-link" id="tfa-resend">Resend code</button><button type="button" class="cdcx-link cdcx-muted" id="tfa-cancel">Cancel</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var inp = document.getElementById('tfa-code');
    inp.addEventListener('input', function () { inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 6); if (inp.value.length === 6) verify2FACode(); });
    document.getElementById('tfa-verify').addEventListener('click', verify2FACode);
    document.getElementById('tfa-resend').addEventListener('click', resend2FACode);
    document.getElementById('tfa-cancel').addEventListener('click', cancelLogin);
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 100);
  }

  function verify2FACode() {
    var inp = document.getElementById('tfa-code');
    var code = (inp && inp.value || '').trim();
    if (!_pending2FA) { _tfaMsg('This sign-in expired. Please sign in again.'); return; }
    if (Date.now() > _pending2FA.expires) { _tfaMsg('The code expired. Tap "Resend code" to get a new one.'); return; }
    if (code.length !== 6) { _tfaMsg('Enter the 6-digit code.'); return; }
    if (code !== _pending2FA.code) {
      _pending2FA.tries += 1;
      if (_pending2FA.tries >= MAX_2FA_TRIES) {
        _pending2FA = null;
        var ov = document.getElementById('modal-2fa'); if (ov) ov.remove();
        try { if (_auth) _auth.signOut(); } catch (e) {}
        if (typeof renderLoginScreen === 'function') renderLoginScreen();
        setTimeout(function () { var a = document.getElementById('login-alert'); if (a) { a.innerHTML = '<div class="alert al-error">Too many incorrect codes. Please sign in again.</div>'; } }, 120);
        return;
      }
      _tfaMsg('Incorrect code. ' + (MAX_2FA_TRIES - _pending2FA.tries) + ' tries left.');
      inp.value = ''; inp.focus();
      return;
    }
    // Correct code: single use
    var email = _pending2FA.email, done = _pending2FA.onSuccess;
    _pending2FA = null;
    if (document.getElementById('tfa-remember') && document.getElementById('tfa-remember').checked) rememberDevice(email);
    var ov2 = document.getElementById('modal-2fa'); if (ov2) ov2.remove();
    if (typeof done === 'function') done();
  }

  async function resend2FACode() {
    if (!_pending2FA) return;
    var wait = 30000 - (Date.now() - (_pending2FA.sentAt || 0));
    if (wait > 0) { _tfaMsg('You can request a new code in ' + Math.ceil(wait / 1000) + ' seconds.'); return; }
    _tfaMsg('Sending a new code…', true);
    var sent = await send2FACode(_pending2FA.user);
    _tfaMsg(sent ? 'A new code is on its way.' : 'Could not send the code. Try again in a moment.', !!sent);
    var inp = document.getElementById('tfa-code'); if (inp) { inp.value = ''; inp.focus(); }
  }

  // No session exists yet while the code screen is open, so cancel just goes back to sign in
  function cancelLogin() {
    _pending2FA = null;
    var ov = document.getElementById('modal-2fa'); if (ov) ov.remove();
    try { if (_auth) _auth.signOut(); } catch (e) {}
    if (typeof renderLoginScreen === 'function') renderLoginScreen();
  }

  async function doLogin() {
    const loginRaw = (document.getElementById('li-username') && document.getElementById('li-username').value || '').trim();
    const loginId = loginRaw.toLowerCase();
    const isEmailFormat = loginId.includes('@') && loginId.includes('.');
    const pass = document.getElementById('li-pass') && document.getElementById('li-pass').value || '';
    const alertEl = document.getElementById('login-alert');
    const btn = document.getElementById('login-btn');
    function fail(msg) {
      try { _hideLoginLoader(); } catch (_) {}
      if (alertEl) { alertEl.innerHTML = '<div class="alert al-error"></div>'; alertEl.firstChild.textContent = msg || 'Incorrect email or password.'; }
      if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    }
    if (!loginRaw || !pass) { fail('Enter your email and password.'); return; }
    btn.textContent = 'Signing in...'; btn.disabled = true; alertEl.innerHTML = '';

    // Helper: after data loads, set up the UI correctly (unchanged from script1.js)
    function _afterLoad() {
      const db2 = getDB();
      const sess = getSession();
      if (!sess) { console.log('[CDC] _afterLoad: NO SESSION'); try { _hideLoginLoader(); } catch(_){} return; }
      console.log('[CDC] _afterLoad: providers='+(db2.providers||[]).length+' session.pid='+sess.activeBillingProviderId);
      if (typeof _resetIdleTimer === 'function') _resetIdleTimer();
    
      // Try to set activeProviderId from providers list
      if (db2.providers && db2.providers.length) {
        const savedId = sess.activeBillingProviderId;
        // ── Provider isolation fix ──
        // For a non-Super-Admin user, ALWAYS honor their assigned provider first.
        // Previously this fell back to db2.providers[0] when savedId was missing,
        // which caused users to briefly see another practice's dashboard.
        let validProv = null;
        if (sess.role !== 'Super Admin' && sess.providerId) {
          validProv = db2.providers.find(p => p.id === sess.providerId);
        }
        if (!validProv) {
          validProv = (savedId && db2.providers.find(p => p.id === savedId)) || db2.providers[0];
        }
        activeProviderId = validProv.id;
        sess.activeBillingProviderId = activeProviderId;
        setSession(sess);
        console.log('[CDC] _afterLoad: set activeProviderId='+activeProviderId+' from provider "'+(validProv.name||'')+'" (user role='+sess.role+', assigned pid='+sess.providerId+')');
      }
    
      // If still no activeProviderId, detect from claims or patients
      if (!activeProviderId) {
        console.log('[CDC] _afterLoad: still NO activeProviderId, deriving from claims/patients');
        const pIds = [
          ...new Set([
            ...(db2.claims||[]).map(c=>c.providerId),
            ...(db2.patients||[]).map(p=>p.providerId)
          ].filter(Boolean))
        ];
        if (pIds.length) {
          activeProviderId = pIds[0];
          sess.activeBillingProviderId = activeProviderId;
          setSession(sess);
          console.log('[CDC] _afterLoad: derived activeProviderId='+activeProviderId);
        } else {
          console.log('[CDC] _afterLoad: NO claims or patients to derive providerId');
        }
      }
    
      rebuildProvSel();
      console.log('[CDC] _afterLoad: currentSection='+(document.querySelector('.section.active')?.id||'none'));
      // Always (re)apply specialty-based menu restrictions after data loads,
      // regardless of which page the user happens to land on.
      setTimeout(function(){ if(typeof applyActiveSpecialty==='function') applyActiveSpecialty(); }, 600);
      // Also explicitly render the topnav specialty chip after data is available.
      setTimeout(function(){ try { _renderTopnavSpecialtyChip(); } catch(e){ console.warn('spec chip render err:', e); } }, 700);
      // Only re-render dashboard if it is the currently active section
      // (prevents redirecting away from a page the user navigated to)
      var _curActive = document.querySelector('.section.active');
      if (!_curActive || _curActive.id === 'sec-dashboard') {
        go('dashboard');
        try { renderDashboard(); } catch(e) { console.warn('dash err',e); }
        setTimeout(function(){ try { renderDashboard(); } catch(e) {} }, 500);
      } else {
        // Re-render current page so it picks up the freshly loaded Firestore data
        var _curPage = _curActive.id.replace('sec-', '');
        try {
          var _invoicesRender = function(){ try{setInvTab('dashboard',document.getElementById('inv-stab-dashboard'));}catch(_){} };
          var _renderFn = ({dashboard:renderDashboard,claims:renderClaims,patients:renderPatients,services:renderServices,facilities:renderFacilities,rendering:renderRendering,referring:renderReferring,eob:renderEOBPage,insurances:renderInsurances,validate:renderValidation,export:renderExportSummary,reports:renderReports,'admin-providers':renderAdminProviders,servicegroups:renderServiceGroups,account:renderAccountPage,appointments:renderAppointments,notes:renderNotes,invoices:_invoicesRender,'cm-dashboard':renderCMDashboard,'cm-clients':renderCMClients,'cm-intake':renderCMIntake,'cm-workers':renderCMWorkers,'cm-assessments':renderCMAssessments,'cm-plans':renderCMPlans,'cm-encounters':renderCMEncounters,'cm-tasks':renderCMTasks,'cm-authorizations':renderCMAuths,'cm-referrals':renderCMCommReferrals,'cm-supervisor':renderCMSupervisor,'cm-billing':renderCMBilling,'cm-reports':renderCMReports,'cm-discharge':renderCMDischarges,'intake-center':renderIntakeCenter,'intake-clients':renderIntakeClients,'intake-forms':renderIntakeConsentForms,'intake-eval':renderIntakeEvaluation,medicaid:renderMedicaid})[_curPage];
          if (_renderFn) { _renderFn(); updateBadges(); }
        } catch(e) {}
      }
      updateAdminUI();
      // Hide the loading overlay once the shell + data are ready.
      // Delayed slightly to let the final render paint.
      try { _forceCloseUserMenu(); } catch(e){}
      setTimeout(function(){ try { _hideLoginLoader(); _forceCloseUserMenu(); } catch(e){} }, 250);
    }

    // Opens the workspace for a verified user (after two-step verification when it applies)
    function finish(user, sessionId) {
      const fullName = ((user.first || '') + ' ' + (user.last || '')).trim() || user.name || 'User';
      const session = { id: sessionId, email: user.email, name: fullName,
        role: user.role || (_isOwnerEmail(user.email) ? 'Super Admin' : 'User'),
        activeBillingProviderId: null, providerId: user.providerId || null, specialties: user.specialties || [] };
      function enter() {
        setSession(session);
        window._sessionVerified = true;
        try { sessionStorage.setItem('cdc_verified', 'yes'); } catch (e) {}
        setTimeout(function () { try { auditLog('LOGIN', 'User signed in'); } catch (e) {} }, 500);
        showApp(session.name);
        // Always close the loading screen, even if something fails while preparing the screen
        var _done = function () {
          try { _dropLegacyUserCache(); } catch (e) {}
          try { _afterLoad(); } catch (e) { console.error('[CDC] after sign-in:', e); try { go('dashboard'); } catch (_) {} }
          setTimeout(function () { try { _hideLoginLoader(); } catch (_) {} }, 300);
        };
        var _fired = false, _once = function () { if (_fired) return; _fired = true; _done(); };
        setTimeout(function () { if (!_fired) console.warn('[CDC] cloud load is slow; continuing'); _once(); }, 25000);
        loadFromFirestore().then(_once, function (e) { console.error('[CDC] loading data:', e); _once(); });
      }
      if (user.twoFA && !isDeviceRemembered(user.email)) {
        btn.textContent = 'Sending code...';
        send2FACode(user).then(function (sent) {
          btn.textContent = 'Sign In'; btn.disabled = false;
          if (!sent) { try { if (_auth) _auth.signOut(); } catch (e) {} fail('Could not send the verification code. Try again in a moment.'); return; }
          show2FAScreen(user, enter);
        });
      } else {
        enter();
      }
    }

    try {
      var _localUsers = typeof getUsers === 'function' ? getUsers() : (_usersCache || []);
      // The owner's saved record (with any email change) wins over the built-in default
      var _storedOwner = _localUsers.find(function (u) { return u.id === DEFAULT_ADMIN.id; });
      var _ownerRec = _storedOwner ? Object.assign({}, DEFAULT_ADMIN, _storedOwner) : DEFAULT_ADMIN;
      var _allUsers = [_ownerRec].concat(_localUsers.filter(function (u) { return u.id !== DEFAULT_ADMIN.id; }));
      var _matchFn = function (u) {
        return (u.email || '').toLowerCase() === loginId || (u.name || '').toLowerCase() === loginId || (u.username || '').toLowerCase() === loginId || (u.first || '').toLowerCase() === loginId;
      };
      var _resolvedUser = _allUsers.find(_matchFn);
      var _fbEmail = isEmailFormat ? loginId : (_resolvedUser && _resolvedUser.email ? _resolvedUser.email.toLowerCase() : null);

      // 1) Firebase account
      if (_auth && _fbReady && _fbEmail) {
        var fbUser = null, viaLinked = false;
        try { fbUser = (await _auth.signInWithEmailAndPassword(_fbEmail, pass)).user; } catch (e) { /* not a Firebase account or wrong password */ }
        // The email shown in Users & Account was changed but the sign-in account still uses
        // its original email: sign in to that account (same password is still required).
        if (!fbUser && _resolvedUser) {
          var _linked = _resolvedUser.authEmail ||
            ((_resolvedUser.ownerAccount === true || _resolvedUser.id === DEFAULT_ADMIN.id || _resolvedUser.role === 'Super Admin') ? SUPER_ADMIN_EMAIL : '');
          if (_linked && _lc(_linked) !== _lc(_fbEmail)) {
            try { fbUser = (await _auth.signInWithEmailAndPassword(_lc(_linked), pass)).user; viaLinked = true; } catch (e) {}
          }
        }
        if (fbUser) {
          var rec = viaLinked ? _resolvedUser : await _userForFirebase(fbUser);
          // Only the email saved in the user's record in the app is accepted. An old
          // email that still exists in the sign-in account is refused.
          if (rec && !_matchFn(rec)) { try { await _auth.signOut(); } catch (e) {} fail(); return; }
          if (!rec || _isInactive(rec)) { try { await _auth.signOut(); } catch (e) {} fail('This account is not active. Contact your administrator.'); return; }
          _linkAccount(rec, fbUser);
          finish(rec, fbUser.uid);
          return;
        }
      }

      // 2) The app's own user list (SHA-256 password hashes)
      var _hash = await sha256(pass);
      var _b64 = null; try { _b64 = btoa(pass); } catch (e) {}
      var _pwOk = function (u) { return !!u.passHash && (u.passHash === _hash || (_b64 && u.passHash === _b64)); };
      var _localUser = _allUsers.find(function (u) { return _matchFn(u) && _pwOk(u); });
      if (!_localUser) {
        // Records stored by the old activation code
        try {
          var _dbUsers = (typeof getDB === 'function' ? (getDB().users || []) : []);
          var _dbUser = _dbUsers.find(function (u) { return _matchFn(u) && _pwOk(u); });
          if (_dbUser) {
            var _allU2 = getUsers();
            var _cacheUser = _allU2.find(function (u) { return u.id === _dbUser.id || (u.email || '').toLowerCase() === (_dbUser.email || '').toLowerCase(); });
            if (_cacheUser) { _localUser = _cacheUser; }
          }
        } catch (_e) {}
      }
      if (!_localUser) { fail(); return; }
      if (_isInactive(_localUser)) { fail('This account is not active. Contact your administrator.'); return; }
      // One-time move to a Firebase sign-in account, using the password just verified.
      // After this the user signs in through Firebase and no password data stays in the app.
      var _sid = _localUser.id;
      if (_auth && _fbReady && _localUser.email && _localUser.id !== DEFAULT_ADMIN.id) {
        var _mig = null, _em = _lc(_localUser.email);
        try { _mig = (await _auth.createUserWithEmailAndPassword(_em, pass)).user; }
        catch (e) { if (e && e.code === 'auth/email-already-in-use') { try { _mig = (await _auth.signInWithEmailAndPassword(_em, pass)).user; } catch (e2) {} } }
        if (_mig) { await _linkAccount(_localUser, _mig); _sid = _mig.uid; }
      }
      finish(_localUser, _sid);
    } catch (e) {
      console.warn('[CDC] sign-in error:', e && e.message);
      fail('Sign-in failed. Please try again.');
    }
  }

  async function doForgotPassword() {
  const email = (document.getElementById('fp-email')?.value||'').trim().toLowerCase();
  const alertEl = document.getElementById('fp-alert');
  const btn = document.getElementById('fp-btn');
  alertEl.innerHTML = '';
  if (!email) { alertEl.innerHTML='<div class="alert al-error">Email is required.</div>'; return; }
  btn.textContent='Sending...'; btn.disabled=true;
  try {
  if (!_auth) throw new Error('Auth not ready');
  await _auth.sendPasswordResetEmail(email);
  alertEl.innerHTML='<div class="alert al-success">If an account exists for that email, a reset link is on its way.</div>';
  btn.textContent='Resend Email'; btn.disabled=false;
  } catch(e) {
  // Same answer whether or not the account exists (no account discovery)
  if (e && e.code === 'auth/user-not-found') {
    alertEl.innerHTML='<div class="alert al-success">If an account exists for that email, a reset link is on its way.</div>';
    btn.textContent='Resend Email'; btn.disabled=false; return;
  }
  const msgs = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many requests. Try again later.'
  };
  alertEl.innerHTML='<div class="alert al-error">'+(msgs[e && e.code]||'Could not send the reset email. Try again.')+'</div>';
  btn.textContent='Send Reset Email'; btn.disabled=false;
  }
  }

  // Make the engine available to the app (the names script1.js and the screens call)
  window.doLogin = doLogin;
  window.doForgotPassword = doForgotPassword;
  window.show2FAScreen = show2FAScreen;
  window.verify2FACode = verify2FACode;
  window.resend2FACode = resend2FACode;
  window.cancelLogin = cancelLogin;
  window.send2FACode = send2FACode;
  window.isDeviceRemembered = isDeviceRemembered;
  window.rememberDevice = rememberDevice;

  window._cdcRenderLogin = renderLogin;
  window._cdcRenderForgot = renderForgot;

  /* ---------------- favicon ---------------- */
  function setFavicon() {
    try {
      var href = 'favicon.svg?v=3';
      var links = document.querySelectorAll('link[rel~="icon"]');
      if (!links.length) { var l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = href; document.head.appendChild(l); }
      else for (var i = 0; i < links.length; i++) { links[i].type = 'image/svg+xml'; links[i].href = href; }
      var nav = document.getElementById('nav-logo-main');
      if (nav && (nav.getAttribute('src') || '').indexOf('favicon.svg?v=') === -1) nav.setAttribute('src', href);
    } catch (e) {}
  }
  setFavicon();
  setInterval(function () {
    var nav = document.getElementById('nav-logo-main');
    if (nav && (nav.getAttribute('src') || '').indexOf('favicon.svg?v=') === -1) setFavicon();
  }, 2000);
})();
