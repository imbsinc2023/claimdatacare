/*
 * ClaimDataCare • Sign-in screen (standalone module)
 * File: cdc-login.js  ·  v1.0
 *
 * How it works (non-invasive):
 *  - Detects the existing sign-in form of the app (email + password + Sign In button).
 *  - Draws the new sign-in screen on top of it.
 *  - On submit, it passes the email/password to the ORIGINAL form and presses the ORIGINAL
 *    button, so the existing Firebase login, auto-login (F5), loader and HIPAA logout keep
 *    working exactly as before.
 *  - When the app signs in (original form disappears) this screen removes itself.
 *    When the app signs out (form appears again) this screen comes back.
 *  - If the original form can't be found, it does nothing: the old login stays.
 *
 * Kill switch (fallback to the classic login without redeploying):
 *    add ?classiclogin=1 to the URL, or run in the console:
 *    localStorage.setItem('cdcx_login_off','1')
 */
(function () {
  'use strict';
  if (window.__cdcxLogin) return;
  window.__cdcxLogin = true;

  // Load the animated workspace loader (separate file, same folder as this one)
  try {
    var _me = document.currentScript, _base = _me && _me.src ? _me.src.replace(/[^\/?#]*([?#].*)?$/, '') : '';
    if (!document.getElementById('cdcl-loader-js')) {
      var _ls = document.createElement('script');
      _ls.id = 'cdcl-loader-js'; _ls.src = _base + 'cdc-loader.js?v=2';
      document.head.appendChild(_ls);
    }
  } catch (e) {}

  try {
    if (/[?&]classiclogin=1\b/.test(location.search)) return;
    if (localStorage.getItem('cdcx_login_off') === '1') return;
  } catch (e) { /* storage blocked: continue */ }

  var GUARD_KEY = 'cdcx_login_guard';
  var EMAIL_KEY = 'cdcx_login_email';
  // Lockout (seconds) by number of consecutive failures
  function lockSeconds(fails) {
    if (fails < 5) return 0;
    if (fails === 5) return 30;
    if (fails === 6) return 120;
    if (fails === 7) return 300;
    return 900;
  }

  var SIGNIN_RX = /\b(sign\s*-?\s*in|log\s*-?\s*in|login|entrar|iniciar|acceder|ingresar)\b/i;
  var FORGOT_RX = /(forgot|olvid|reset\s*password|recuperar)/i;
  var ERR_RX = /(invalid|incorrect|wrong|not\s*found|no\s*user|failed|error|denied|disabled|too\s*many|inv[aá]lid|incorrect[oa]|fall[oó]|bloquead|deshabilitad|no\s*existe|credential)/i;
  var RATE_RX = /(too\s*many|demasiados|temporarily|temporalmente)/i;
  var NET_RX = /(network|offline|connection|conexi[oó]n|internet)/i;

  var root = null, styleEl = null, backPill = null;
  var orig = null;          // {pw, email, btn, forgot, scope, form}
  var shown = false;
  var suspended = false;    // true while the user is in the original "forgot password" flow
  var pending = null;       // {t0, errFound}
  var lockTimer = null;
  var scheduled = false;

  /* ---------------- storage helpers ---------------- */
  function getGuard() {
    try { var g = JSON.parse(localStorage.getItem(GUARD_KEY) || '{}'); return { f: g.f | 0, until: +g.until || 0 }; }
    catch (e) { return { f: 0, until: 0 }; }
  }
  function setGuard(g) { try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); } catch (e) {} }
  // Nothing personal is kept in the browser: erase the email saved by older versions
  try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}

  /* ---------------- detection of the original form ---------------- */
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (root && root.contains(el)) return false;
    if (!el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function textOf(el) {
    return ((el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '') + '').trim();
  }
  function mine(el) { return !!(el && ((root && root.contains(el)) || (backPill && backPill.contains(el)))); }
  function q1(scope, sel) {
    var l = scope.querySelectorAll(sel);
    for (var i = 0; i < l.length; i++) if (!mine(l[i])) return l[i];
    return null;
  }
  function findEmail(scope) {
    return q1(scope, 'input[type=email]') ||
      q1(scope, 'input[autocomplete=username],input[autocomplete=email]') ||
      q1(scope, 'input[name*=mail i],input[id*=mail i],input[placeholder*=mail i]') ||
      q1(scope, 'input[id*=user i],input[name*=user i]') ||
      q1(scope, 'input[type=text]');
  }
  function findButton(scope) {
    var cands = scope.querySelectorAll('button,input[type=submit],input[type=button],[role=button],a');
    for (var i = 0; i < cands.length; i++) {
      if (mine(cands[i])) continue;
      var t = textOf(cands[i]);
      if (t && t.length < 40 && SIGNIN_RX.test(t) && !FORGOT_RX.test(t)) return cands[i];
    }
    return null;
  }
  function findForgot(scope) {
    var cands = scope.querySelectorAll('a,button,span,[role=button],div');
    for (var i = 0; i < cands.length; i++) {
      if (mine(cands[i])) continue;
      var t = textOf(cands[i]);
      if (t && t.length < 40 && FORGOT_RX.test(t) && cands[i].children.length === 0) return cands[i];
    }
    return null;
  }
  function findOriginal() {
    var pws = document.querySelectorAll('input[type=password]');
    for (var i = 0; i < pws.length; i++) {
      var pw = pws[i];
      if (!isVisible(pw)) continue;
      var form = pw.closest('form');
      var scope = form || pw.parentElement, depth = 0;
      while (scope && scope !== document.documentElement && depth < 8) {
        var em = findEmail(scope), bt = findButton(scope);
        if (em && em !== pw && bt) {
          var fg = findForgot(scope) || (scope.parentElement ? findForgot(scope.parentElement) : null);
          return { pw: pw, email: em, btn: bt, forgot: fg, scope: scope, form: form };
        }
        scope = scope.parentElement; depth++;
      }
    }
    return null;
  }

  /* ---------------- UI ---------------- */
  var ICON_EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var ICON_SHIELD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
  var ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  var ICON_CLOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  var CSS = [
    '#cdcx-login{position:fixed;inset:0;z-index:2147483000;display:flex;background:#F6F8FB;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#0B1526;-webkit-font-smoothing:antialiased;opacity:1;transition:opacity .25s ease}',
    '#cdcx-login[hidden]{display:none}',
    '#cdcx-login.cdcx-out{opacity:0;pointer-events:none}',
    '#cdcx-login *{box-sizing:border-box}',
    '.cdcx-panel{position:relative;flex:0 0 520px;max-width:100%;height:100%;overflow-y:auto;background:#fff;padding:56px 72px 36px;display:flex;flex-direction:column;justify-content:space-between;gap:32px;box-shadow:1px 0 0 #E4E9F1,12px 0 40px rgba(11,21,38,.06);z-index:1}',
    '.cdcx-bar{position:absolute;left:0;top:0;right:0;height:4px;background:linear-gradient(90deg,#FF6A3D,#E8367A 38%,#6A1BDB 70%,#00A3D1)}',
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
    '.cdcx-input[aria-invalid=true]{border-color:#B32660}',
    '.cdcx-pwwrap{position:relative}',
    '.cdcx-pwwrap .cdcx-input{padding-right:52px}',
    '.cdcx-eye{position:absolute;right:2px;top:2px;width:44px;height:44px;border:0;background:transparent;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#586579}',
    '.cdcx-eye:hover{color:#0B1526;background:#F1F4F9}',
    '.cdcx-link{background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:600;color:#B8461F;cursor:pointer;text-decoration:none}',
    '.cdcx-link:hover{color:#8F3314;text-decoration:underline}',
    '.cdcx-caps{font-size:12.5px;color:#8F3314;margin:0}',
    '.cdcx-check{display:flex;align-items:center;gap:10px;font-size:14px;color:#3A475C;cursor:pointer;user-select:none}',
    '.cdcx-check input{width:18px;height:18px;margin:0;accent-color:#D45C37}',
    '.cdcx-btn{height:52px;border:0;border-radius:12px;background:linear-gradient(95deg,#C9431C,#B32660);color:#fff;font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:600;font-size:16px;cursor:pointer;box-shadow:0 10px 24px -8px rgba(201,67,28,.55);display:flex;align-items:center;justify-content:center;gap:10px;transition:filter .15s,transform .05s}',
    '.cdcx-btn:hover{filter:brightness(1.06)}',
    '.cdcx-btn:active{transform:translateY(1px)}',
    '.cdcx-btn[disabled]{cursor:not-allowed;filter:grayscale(.35) opacity(.75);box-shadow:none}',
    '.cdcx-spin{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:cdcxspin .8s linear infinite}',
    '@keyframes cdcxspin{to{transform:rotate(360deg)}}',
    '.cdcx-alert{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:#FDECF2;color:#7E1640;font-size:13.5px;line-height:1.45}',
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
    '#cdcx-back{position:fixed;left:16px;bottom:16px;z-index:2147483001;display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:0;border-radius:999px;background:#0B1526;color:#fff;font:600 13px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 24px -8px rgba(11,21,38,.5)}',
    '#cdcx-back[hidden]{display:none}'
  ].join('\n');

  var ART_SVG = [
    '<svg class="cdcx-bg" viewBox="0 0 920 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">',
    '<defs>',
    '<pattern id="cdcx-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="rgba(255,255,255,0.07)"/></pattern>',
    '<radialGradient id="cdcx-gO"><stop offset="0" stop-color="#FF6A3D" stop-opacity=".45"/><stop offset="1" stop-color="#FF6A3D" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="cdcx-gV"><stop offset="0" stop-color="#6A1BDB" stop-opacity=".55"/><stop offset="1" stop-color="#6A1BDB" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="cdcx-gB"><stop offset="0" stop-color="#00A3D1" stop-opacity=".40"/><stop offset="1" stop-color="#00A3D1" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="cdcx-beam" x1="0" y1="0" x2="920" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF6A3D" stop-opacity="0"/><stop offset=".12" stop-color="#FF6A3D"/><stop offset=".42" stop-color="#E8367A"/><stop offset=".72" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient>',
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
  ].join('');

  function node(x, y, label, dir, w) {
    var ly1 = dir === 'up' ? y - 12 : y + 12, ly2 = dir === 'up' ? y - 42 : y + 49;
    var ry = dir === 'up' ? y - 68 : y + 49;
    return '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="10" fill="none" stroke="rgba(255,255,255,0.35)"/>' +
      '<line x1="' + x + '" y1="' + ly1 + '" x2="' + x + '" y2="' + ly2 + '" stroke="rgba(255,255,255,0.25)"/>' +
      '<rect x="' + (x - w / 2) + '" y="' + ry + '" width="' + w + '" height="26" rx="13" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>' +
      '<text x="' + x + '" y="' + (ry + 17) + '" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="12" font-weight="500" fill="#E6EBF3">' + label + '</text>';
  }

  var LOGO = '<svg width="40" height="44" viewBox="0 0 40 44" aria-hidden="true" focusable="false"><defs><linearGradient id="cdcx-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A3D"/><stop offset=".4" stop-color="#E8367A"/><stop offset=".75" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient></defs><path d="M20 2 L37 8 V21 C37 32 29.5 39 20 42 C10.5 39 3 32 3 21 V8 Z" fill="url(#cdcx-lg)"/><path d="M20 13 V31 M11 22 H29" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg>';

  function buildUI() {
    if (!document.getElementById('cdcx-fonts')) {
      var lk = document.createElement('link');
      lk.id = 'cdcx-fonts'; lk.rel = 'stylesheet';
      lk.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(lk);
    }
    styleEl = document.createElement('style');
    styleEl.id = 'cdcx-style';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    root = document.createElement('div');
    root.id = 'cdcx-login';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'cdcx-title');
    root.innerHTML =
      '<section class="cdcx-panel">' +
        '<div class="cdcx-bar"></div>' +
        '<div class="cdcx-brand">' + LOGO + '<div><div class="cdcx-brand-name">ClaimDataCare</div><div class="cdcx-brand-sub">EHR and billing by IMBS Inc</div></div></div>' +
        '<div class="cdcx-main">' +
          '<div><h1 class="cdcx-h1" id="cdcx-title">Welcome back</h1><p class="cdcx-lead">Sign in to your clinical and revenue cycle workspace.</p></div>' +
          '<form class="cdcx-form" id="cdcx-form" novalidate autocomplete="on">' +
            '<div class="cdcx-alert" id="cdcx-alert" role="alert" hidden></div>' +
            '<div class="cdcx-field"><label class="cdcx-label" for="cdcx-email">Email</label>' +
              '<input class="cdcx-input" id="cdcx-email" name="username" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="254" placeholder="name@practice.com" required></div>' +
            '<div class="cdcx-field"><div class="cdcx-row"><label class="cdcx-label" for="cdcx-pw">Password</label>' +
              '<button type="button" class="cdcx-link" id="cdcx-forgot">Forgot password?</button></div>' +
              '<div class="cdcx-pwwrap"><input class="cdcx-input" id="cdcx-pw" name="password" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="128" placeholder="Enter your password" required>' +
              '<button type="button" class="cdcx-eye" id="cdcx-eye" aria-label="Show password" title="Show password" aria-pressed="false">' + ICON_EYE + '</button></div>' +
              '<p class="cdcx-caps" id="cdcx-caps" hidden>Caps Lock is on.</p></div>' +
            '<button type="submit" class="cdcx-btn" id="cdcx-submit">Sign in</button>' +
          '</form>' +
          '<div class="cdcx-note">' + ICON_CLOCK + '<span>For your security, sessions close after 5 minutes of inactivity.</span></div>' +
        '</div>' +
        '<footer class="cdcx-foot"><div class="cdcx-badges"><span>' + ICON_SHIELD + 'HIPAA compliant</span><span>' + ICON_LOCK + 'Encrypted in transit and at rest</span></div>' +
          '<div>© ' + new Date().getFullYear() + ' Integrated Medical Billing Services Inc</div></footer>' +
      '</section>' +
      '<aside class="cdcx-art" aria-hidden="true">' + ART_SVG +
        '<div class="cdcx-chip"><span class="cdcx-dot"></span>Secure connection</div>' +
        '<div class="cdcx-copy"><div class="cdcx-eyebrow">EHR · REVENUE CYCLE MANAGEMENT</div>' +
        '<div class="cdcx-headline">From heartbeat<br>to paid claim.</div>' +
        '<div class="cdcx-sub">Every visit, note and claim connected in one secure workspace.</div></div>' +
      '</aside>';
    document.body.appendChild(root);

    backPill = document.createElement('button');
    backPill.id = 'cdcx-back';
    backPill.type = 'button';
    backPill.hidden = true;
    backPill.title = 'Back to sign in';
    backPill.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Back to sign in';
    backPill.addEventListener('click', function () { suspended = false; backPill.hidden = true; schedule(); });
    document.body.appendChild(backPill);

    wire();
  }

  function $(id) { return document.getElementById(id); }

  function showAlert(msg, isLock) {
    var a = $('cdcx-alert');
    a.textContent = msg;
    a.className = 'cdcx-alert' + (isLock ? ' cdcx-lock' : '');
    a.hidden = !msg;
  }
  function setBusy(b) {
    var s = $('cdcx-submit');
    s.disabled = b;
    s.innerHTML = b ? '<span class="cdcx-spin" aria-hidden="true"></span>Signing in…' : 'Sign in';
    $('cdcx-email').readOnly = b;
    $('cdcx-pw').readOnly = b;
  }

  function wire() {
    var form = $('cdcx-form'), em = $('cdcx-email'), pw = $('cdcx-pw'), eye = $('cdcx-eye');

    eye.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      var lbl = show ? 'Hide password' : 'Show password';
      eye.setAttribute('aria-label', lbl); eye.title = lbl;
      eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      eye.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
      pw.focus();
    });

    function caps(e) { if (e.getModifierState) $('cdcx-caps').hidden = !e.getModifierState('CapsLock'); }
    pw.addEventListener('keydown', caps);
    pw.addEventListener('keyup', caps);
    pw.addEventListener('blur', function () { $('cdcx-caps').hidden = true; });

    [em, pw].forEach(function (i) { i.addEventListener('input', function () { i.removeAttribute('aria-invalid'); }); });

    $('cdcx-forgot').addEventListener('click', function () {
      if (!orig || !orig.forgot) return;
      var v = em.value.trim();
      if (v && orig.email) setVal(orig.email, v);
      suspended = true;
      hide(true);
      backPill.hidden = false;
      try { orig.forgot.click(); } catch (e) {}
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (pending) return;
      var g = getGuard();
      if (g.until > Date.now()) { startLockCountdown(); return; }

      var email = em.value.trim().toLowerCase(), pass = pw.value;
      var bad = false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) { em.setAttribute('aria-invalid', 'true'); bad = true; }
      if (!pass) { pw.setAttribute('aria-invalid', 'true'); bad = true; }
      if (bad) { showAlert('Enter a valid email and your password.'); (em.getAttribute('aria-invalid') ? em : pw).focus(); return; }

      orig = findOriginal() || orig;
      if (!orig || !orig.pw.isConnected) { showAlert('Sign-in is not available right now. Reload the page and try again.'); return; }

      showAlert('');
      setBusy(true);
      pending = { t0: Date.now(), errFound: null };

      setVal(orig.email, email);
      setVal(orig.pw, pass);
      pw.value = '';           // never keep the password in our field
      pass = null;
      try {
        if (orig.btn && orig.btn.isConnected) orig.btn.click();
        else if (orig.form && orig.form.requestSubmit) orig.form.requestSubmit();
        else orig.pw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      } catch (err) {
        pending.errFound = 'Unable to sign in. Reload the page and try again.';
      }
      schedule();
    });
  }

  function setVal(input, v) {
    try {
      var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d.set.call(input, v);
    } catch (e) { input.value = v; }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function startLockCountdown() {
    clearInterval(lockTimer);
    function upd() {
      var left = Math.ceil((getGuard().until - Date.now()) / 1000);
      if (left <= 0) { clearInterval(lockTimer); lockTimer = null; showAlert(''); $('cdcx-submit').disabled = false; return; }
      var m = Math.floor(left / 60), s = left % 60;
      showAlert('Too many attempts. Try again in ' + m + ':' + (s < 10 ? '0' : '') + s + '.', true);
      $('cdcx-submit').disabled = true;
    }
    upd();
    lockTimer = setInterval(upd, 1000);
  }

  function registerFailure(msg) {
    var g = getGuard();
    g.f += 1;
    var secs = lockSeconds(g.f);
    if (secs) g.until = Date.now() + secs * 1000;
    setGuard(g);
    setBusy(false);
    if (orig && orig.pw && orig.pw.isConnected) setVal(orig.pw, '');
    if (secs) startLockCountdown();
    else {
      showAlert(msg);
      $('cdcx-pw').setAttribute('aria-invalid', 'true');
      $('cdcx-pw').focus();
    }
    try { window.dispatchEvent(new CustomEvent('cdc:login-attempt', { detail: { ok: false, at: Date.now() } })); } catch (e) {}
  }

  function registerSuccess() {
    setGuard({ f: 0, until: 0 });
    try { window.dispatchEvent(new CustomEvent('cdc:login-attempt', { detail: { ok: true, at: Date.now() } })); } catch (e) {}
  }

  /* ---------------- show / hide ---------------- */
  var needsReset = true;
  var tfaSeen = false;
  function resetForm() {
    setBusy(false);
    var saved = '';
    $('cdcx-email').value = '';
    $('cdcx-pw').value = '';
    if (getGuard().until > Date.now()) startLockCountdown(); else showAlert('');
    setTimeout(function () { try { (saved ? $('cdcx-pw') : $('cdcx-email')).focus(); } catch (e) {} }, 60);
  }
  function show() {
    if (shown) return;
    shown = true;
    root.hidden = false;
    root.classList.remove('cdcx-out');
    $('cdcx-forgot').hidden = !(orig && orig.forgot);
    if (needsReset) { needsReset = false; resetForm(); }
  }
  // conceal: step aside for the app's own loader / 2FA window, keeping the form state
  function conceal() {
    if (!shown) return;
    shown = false;
    root.hidden = true;
  }
  function hide(instant) {
    needsReset = true;
    if (!shown) { root.hidden = true; return; }
    shown = false;
    $('cdcx-pw').value = '';
    clearInterval(lockTimer); lockTimer = null;
    if (instant) { root.hidden = true; return; }
    root.classList.add('cdcx-out');
    setTimeout(function () { if (!shown) root.hidden = true; }, 260);
  }
  function appWindowOpen() {
    var t = document.getElementById('modal-2fa');
    if (t && t.isConnected) return '2fa';
    var l = document.getElementById('cdc-login-loader');
    if (l && isVisible(l)) return 'loader';
    return '';
  }

  /* ---------------- watcher ---------------- */
  function looksLikeError(el) {
    if (!el || (root && root.contains(el)) || el === backPill) return null;
    var t = ((el.textContent || '') + '').trim();
    if (!t || t.length > 300 || !ERR_RX.test(t)) return null;
    if (RATE_RX.test(t)) return 'rate';
    if (NET_RX.test(t)) return 'net';
    return 'auth';
  }

  function evalPending() {
    if (!orig || !isVisible(orig.pw)) {          // original form gone => signed in
      pending = null;
      registerSuccess();
      setBusy(false);
      hide(false);
      return;
    }
    if (pending.errFound) {
      // short grace period: if the app is actually signing in, the form disappears meanwhile
      if (!pending.errAt) pending.errAt = Date.now();
      if (Date.now() - pending.errAt < 600) { setTimeout(schedule, 250); return; }
      var kind = pending.errFound;
      pending = null;
      if (kind === 'net') { setBusy(false); showAlert('Unable to reach the server. Check your connection and try again.'); return; }
      if (kind === 'rate') {
        var g = getGuard(); g.f = Math.max(g.f, 5); g.until = Date.now() + 120000; setGuard(g);
        setBusy(false); startLockCountdown(); return;
      }
      if (kind === 'auth') { registerFailure('Email or password is incorrect.'); return; }
      setBusy(false); showAlert(kind); return;
    }
    if (Date.now() - pending.t0 > 6000) {          // fallback: check the original form text
      var k = looksLikeError(orig.scope);
      if (k) { pending.errFound = k; return evalPending(); }
    }
    if (Date.now() - pending.t0 > 20000) {         // no answer: re-enable without counting
      pending = null;
      setBusy(false);
      showAlert('Sign-in is taking longer than usual. Try again.');
    }
  }

  function tick() {
    scheduled = false;
    if (!root) return;
    // The app's logout clears floating layers from <body>; put ours back if that happened.
    if (!root.isConnected) { shown = false; needsReset = true; root.hidden = true; document.body.appendChild(root); }
    if (backPill && !backPill.isConnected) { backPill.hidden = true; document.body.appendChild(backPill); }
    if (styleEl && !styleEl.isConnected) document.head.appendChild(styleEl);
    var win = appWindowOpen();
    if (win === '2fa') { tfaSeen = true; if (pending) { pending = null; setBusy(false); needsReset = true; } }
    if (pending) evalPending();
    if (win) { conceal(); return; }        // app's loader or 2FA code window on screen
    if (pending) return;
    var o = findOriginal();
    if (o) {
      orig = o;
      if (!shown && !suspended) show();
      if (shown) $('cdcx-forgot').hidden = !orig.forgot;
    } else {
      suspended = false;
      if (backPill) backPill.hidden = true;
      if (tfaSeen) { tfaSeen = false; registerSuccess(); }   // signed in after the 2FA code
      if (shown) hide(false); else needsReset = true;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(tick, 120);
  }

  function start() {
    try { buildUI(); } catch (e) { return; }   // any problem: keep the classic login
    var mo = new MutationObserver(function (recs) {
      if (pending && !pending.errFound) {
        for (var i = 0; i < recs.length; i++) {
          var r = recs[i];
          if (r.type === 'characterData') {
            var k0 = looksLikeError(r.target.parentElement);
            if (k0) { pending.errFound = k0; break; }
          }
          for (var j = 0; j < r.addedNodes.length; j++) {
            var n = r.addedNodes[j];
            var k = looksLikeError(n.nodeType === 1 ? n : n.parentElement);
            if (k) { pending.errFound = k; break; }
          }
          if (pending.errFound) break;
          if (r.type === 'attributes' && r.target.nodeType === 1) {
            var k2 = looksLikeError(r.target);
            if (k2 && isVisible(r.target)) { pending.errFound = k2; break; }
          }
        }
      }
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    setInterval(schedule, 1000);   // safety net
    tick();
  }

  /* ---------------- favicon ---------------- */
  // Points the tab icon to the new favicon.svg (?v= forces browsers to drop the old cached icon)
  function setFavicon() {
    try {
      var href = 'favicon.svg?v=3';
      var links = document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]');
      if (!links.length) {
        var l = document.createElement('link');
        l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = href;
        document.head.appendChild(l);
      } else {
        for (var i = 0; i < links.length; i++) {
          if (links[i].rel.indexOf('apple') === -1) { links[i].type = 'image/svg+xml'; links[i].href = href; }
        }
      }
      var nav = document.getElementById('nav-logo-main');
      if (nav && nav.getAttribute('src') && nav.getAttribute('src').indexOf('favicon.svg?v=') === -1) nav.setAttribute('src', href);
    } catch (e) {}
  }
  setFavicon();
  setInterval(function () {
    var nav = document.getElementById('nav-logo-main');
    if (nav && (nav.getAttribute('src') || '').indexOf('favicon.svg?v=') === -1) setFavicon();
  }, 2000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
