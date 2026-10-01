/*
 * ClaimDataCare  •  HIPAA automatic logoff (45 CFR 164.312(a)(2)(iv))
 * File: cdc-idle.js  •  v1.0
 *
 * Replaces the idle timer that lived in script1.js.
 *   • 15 minutes without activity signs the user out; a countdown appears for the last 60 seconds
 *   • Measured against the real clock, so it stays exact in background tabs and after the
 *     computer sleeps (browser timers alone drift and can stop in hidden tabs)
 *   • Every open ClaimDataCare tab shares the same clock: activity in one keeps the others
 *     alive, and signing out in one signs out all of them (BroadcastChannel, nothing stored)
 *   • While the countdown is showing, moving the mouse does not cancel it: only
 *     "Stay signed in" does, so the countdown and the sign-out always match
 */
(function () {
  'use strict';
  var TIMEOUT = 15 * 60 * 1000, WARN = 60 * 1000;
  var last = Date.now(), shown = false, lastPing = 0;
  var chan = null;
  try { chan = new BroadcastChannel('cdc-idle'); } catch (e) {}

  function hasSession() { try { return typeof getSession === 'function' && !!getSession(); } catch (e) { return false; } }

  function touch(fromOtherTab) {
    last = Date.now();
    if (!fromOtherTab && chan && last - lastPing > 5000) { lastPing = last; try { chan.postMessage({ t: 'act', at: last }); } catch (e) {} }
  }

  var CSS = [
    '#idle-warning-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(11,21,38,.55);backdrop-filter:blur(2px)}',
    '#idle-warning-modal .box{width:100%;max-width:380px;background:#fff;border-radius:20px;padding:28px 26px 22px;text-align:center;box-shadow:0 30px 60px -24px rgba(11,21,38,.55);font-family:inherit}',
    '#idle-warning-modal .ring{position:relative;width:132px;height:132px;margin:0 auto 14px}',
    '#idle-warning-modal .ring svg{display:block;transform:rotate(-90deg)}',
    '#idle-warning-modal .ring .arc{transition:stroke-dashoffset 1s linear}',
    '#idle-warning-modal .ring b{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:40px;font-weight:700;letter-spacing:-.03em;color:#0B1526;font-variant-numeric:tabular-nums;line-height:1}',
    '#idle-warning-modal .ring b small{font-size:10.5px;font-weight:600;letter-spacing:.1em;color:#586579;margin-top:6px}',
    '#idle-warning-modal h3{margin:0 0 6px;font-size:18px;font-weight:700;color:#0B1526}',
    '#idle-warning-modal p{margin:0 0 20px;font-size:13px;line-height:1.5;color:#586579}',
    '#idle-warning-modal .row{display:flex;gap:8px}',
    '#idle-warning-modal .row button{flex:1}'
  ].join('\n');
  var R = 56, C = 2 * Math.PI * R;

  function show(secs) {
    var el = document.getElementById('idle-warning-modal');
    if (!el) {
      if (!document.getElementById('idle-style')) { var st = document.createElement('style'); st.id = 'idle-style'; st.textContent = CSS; document.head.appendChild(st); }
      el = document.createElement('div');
      el.id = 'idle-warning-modal';
      el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'idle-t');
      el.innerHTML = '<div class="box">' +
        '<div class="ring"><svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">' +
          '<defs><linearGradient id="idle-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A3D"/><stop offset="1" stop-color="#7B2FF7"/></linearGradient></defs>' +
          '<circle cx="66" cy="66" r="' + R + '" fill="none" stroke="#EEF1F6" stroke-width="10"/>' +
          '<circle class="arc" id="idle-arc" cx="66" cy="66" r="' + R + '" fill="none" stroke="url(#idle-g)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0"/>' +
        '</svg><b><span id="idle-countdown">60</span><small>SECONDS</small></b></div>' +
        '<h3 id="idle-t">Still there?</h3>' +
        '<p>For your security (HIPAA), you will be signed out because of inactivity. Unsaved changes may be lost.</p>' +
        '<div class="row"><button type="button" class="cdc-no out" id="idle-out-btn">Sign out now</button><button type="button" class="cdc-ok stay" id="idle-stay-btn">Stay signed in</button></div>' +
      '</div>';
      document.body.appendChild(el);
      document.getElementById('idle-stay-btn').onclick = function () { touch(false); hide(); if (chan) try { chan.postMessage({ t: 'act', at: last }); } catch (e) {} };
      document.getElementById('idle-out-btn').onclick = function () { logout(false, true); };
      setTimeout(function () { var b = document.getElementById('idle-stay-btn'); if (b) b.focus(); }, 30);
    }
    shown = true;
    var n = document.getElementById('idle-countdown'); if (n) n.textContent = secs;
    var arc = document.getElementById('idle-arc'); if (arc) arc.setAttribute('stroke-dashoffset', (C * (1 - secs / (WARN / 1000))).toFixed(1));
  }
  function hide() { shown = false; var el = document.getElementById('idle-warning-modal'); if (el) el.remove(); }

  function logout(fromOtherTab, byChoice) {
    hide();
    if (!fromOtherTab && chan) try { chan.postMessage({ t: 'logout' }); } catch (e) {}
    if (!hasSession()) return;
    try { _performLogout(); } catch (e) { try { doLogout(); } catch (e2) {} }
    if (!byChoice) setTimeout(function () { try { toast('Signed out automatically after 15 minutes of inactivity (HIPAA security policy)', 'warn'); } catch (e) {} }, 300);
  }

  function tick() {
    if (!hasSession()) { if (shown) hide(); return; }
    var remain = TIMEOUT - (Date.now() - last);
    if (remain <= 0) { logout(false, false); return; }
    if (remain <= WARN) show(Math.ceil(remain / 1000));
    else if (shown) hide();
  }

  if (chan) chan.onmessage = function (ev) {
    var m = ev && ev.data || {};
    if (m.t === 'act') { if (m.at > last) last = m.at; if (shown) tick(); }
    else if (m.t === 'logout') logout(true, false);
  };

  // Activity resets the clock, except while the countdown is on screen
  var lastMove = 0;
  function onAct(e) {
    if (shown) return;
    if (e.type === 'mousemove') { var n = Date.now(); if (n - lastMove < 1000) return; lastMove = n; }
    touch(false);
  }
  ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (t) {
    window.addEventListener(t, onAct, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  // Login code calls this after a successful sign-in
  window._resetIdleTimer = function () { hide(); touch(false); };

  setInterval(tick, 1000);
})();
