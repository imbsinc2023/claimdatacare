/*
 * ClaimDataCare  •  Workspace loading screen (standalone module)
 * File: cdc-loader.js  •  v2.0
 *
 * Loaded by app.html right after script1.js. This IS the app's loading screen
 * (_showLoginLoader / _hideLoginLoader); the old one was removed from script1.js.
 * Heart-monitor line over a blurred dashboard, with a 15-second Reload safety net.
 *
 * Smoothness (v2.0): the heart-monitor line is drawn by cdc-ecg-worker.js on its own
 * thread (OffscreenCanvas), so it never waits for the app while data is loading. The
 * logo beat, the glow and the status text are CSS animations on the GPU (no timers).
 * Browsers without OffscreenCanvas get the previous CSS version of the line.
 */
(function () {
  'use strict';
  var BASE = '';
  try { var _me = document.currentScript; BASE = _me && _me.src ? _me.src.replace(/[^\/?#]*([?#].*)?$/, '') : ''; } catch (e) {}
  var worker = null, resizeFn = null;
  if (window.__cdclLoader) return;
  window.__cdclLoader = true;

  var STEPS = ['Securing your session', 'Syncing patients', 'Loading claims', 'Preparing your dashboard'];

  // One heartbeat (PQRST) every 300px, drawn across 1500px
  function ecgPath() {
    var d = 'M 0 150', x = 0;
    for (var i = 0; i < 5; i++) {
      d += ' L ' + (x + 70) + ' 150 Q ' + (x + 82) + ' 132 ' + (x + 94) + ' 150 L ' + (x + 118) + ' 150' +
           ' L ' + (x + 128) + ' 162 L ' + (x + 142) + ' 40 L ' + (x + 156) + ' 236 L ' + (x + 168) + ' 128 L ' + (x + 176) + ' 150' +
           ' L ' + (x + 206) + ' 150 Q ' + (x + 228) + ' 116 ' + (x + 250) + ' 150 L ' + (x + 300) + ' 150';
      x += 300;
    }
    return d;
  }
  var PATH = ecgPath();

  var CSS = [
    '#cdc-login-loader{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#0B1526;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;opacity:1;transition:opacity .45s ease}',
    '#cdc-login-loader *{box-sizing:border-box}',
    '#cdc-login-loader.cdcl-out{opacity:0}',
    '#cdc-login-loader.cdcl-out .cdcl-center{transform:scale(1.06);opacity:0}',
    /* blurred dashboard backdrop */
    '.cdcl-dash{position:absolute;inset:-40px;display:flex;background:#F6F8FB;filter:blur(14px) saturate(1.1);transform:scale(1.04);opacity:.55;contain:strict}',
    '.cdcl-side{width:230px;flex-shrink:0;background:#0B1526;display:flex;flex-direction:column;gap:14px;padding:30px 22px}',
    '.cdcl-side i{display:block;height:12px;border-radius:6px;background:rgba(255,255,255,.18)}',
    '.cdcl-side i.a{height:34px;width:34px;border-radius:10px;background:linear-gradient(135deg,#FF6A3D,#E8367A 45%,#6A1BDB);margin-bottom:18px}',
    '.cdcl-main{flex:1;padding:40px 48px;display:flex;flex-direction:column;gap:26px}',
    '.cdcl-top{height:34px;width:38%;border-radius:10px;background:#DCE3EE}',
    '.cdcl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}',
    '.cdcl-kpi{height:120px;border-radius:18px;background:#fff;box-shadow:0 10px 30px -12px rgba(11,21,38,.25);padding:20px;display:flex;flex-direction:column;justify-content:space-between}',
    '.cdcl-kpi b{display:block;height:26px;width:60%;border-radius:8px;background:#0B1526;opacity:.8}',
    '.cdcl-kpi u{display:block;height:6px;border-radius:4px}',
    '.cdcl-row{flex:1;display:flex;gap:22px;min-height:0}',
    '.cdcl-chart{flex:0 0 42%;border-radius:18px;background:#fff;padding:26px;display:flex;align-items:flex-end;gap:14px}',
    '.cdcl-chart s{flex:1;border-radius:8px 8px 3px 3px;background:linear-gradient(0deg,#FF6A3D,#E8367A 55%,#6A1BDB)}',
    '.cdcl-table{flex:1;border-radius:18px;background:#fff;padding:26px;display:flex;flex-direction:column;gap:18px}',
    '.cdcl-table i{display:flex;gap:14px;align-items:center;height:22px}',
    '.cdcl-table i:before{content:"";flex:1;height:12px;border-radius:6px;background:#E4E9F1}',
    '.cdcl-table i:after{content:"";width:74px;height:20px;border-radius:999px;background:#E3F5FB}',
    '.cdcl-table i.p:after{background:#F1EAFD}.cdcl-table i.d:after{background:#FDE8F0}',
    /* cinematic tint over the dashboard */
    '.cdcl-tint{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(11,21,38,.55) 0%,rgba(11,21,38,.86) 62%,rgba(11,21,38,.96) 100%)}',
    '.cdcl-glow{position:absolute;width:760px;height:760px;border-radius:50%;left:50%;top:50%;margin:-380px 0 0 -380px;background:radial-gradient(circle,rgba(232,54,122,.22),rgba(106,27,219,.10) 45%,rgba(11,21,38,0) 70%);animation:cdclbreath 1.2s ease-in-out infinite;will-change:transform,opacity}',
    /* the monitor line */
    '.cdcl-ecg{position:absolute;left:0;top:50%;width:100vw;height:300px;margin-top:-150px;overflow:hidden;pointer-events:none}','.cdcl-ecg svg{position:absolute;left:0;top:0;width:100vw;height:300px}','.cdcl-win{position:absolute;left:0;top:0;width:34vw;height:300px;overflow:hidden;animation:cdclwin 2.4s linear infinite;will-change:transform;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 72%,#000 94%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0%,#000 72%,#000 94%,transparent 100%)}','.cdcl-inner{position:absolute;left:0;top:0;width:100vw;height:300px;animation:cdclinner 2.4s linear infinite;will-change:transform}','@keyframes cdclwin{from{transform:translate3d(-34vw,0,0)}to{transform:translate3d(100vw,0,0)}}','@keyframes cdclinner{from{transform:translate3d(34vw,0,0)}to{transform:translate3d(-100vw,0,0)}}',
                '@keyframes cdclbreath{0%,100%{opacity:.75;transform:scale(1)}14%{opacity:1;transform:scale(1.06)}28%{opacity:.85;transform:scale(1.01)}42%{opacity:1;transform:scale(1.04)}}',
    /* center card */
    '.cdcl-center{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;transition:transform .45s ease,filter .45s ease,opacity .45s ease}',
    '.cdcl-logo{width:84px;height:92px;filter:drop-shadow(0 12px 28px rgba(232,54,122,.45));animation:cdclbeat 1.2s ease-in-out infinite;will-change:transform}',
    '@keyframes cdclbeat{0%,100%{transform:scale(1)}14%{transform:scale(1.12)}28%{transform:scale(.98)}42%{transform:scale(1.07)}60%{transform:scale(1)}}',
    '.cdcl-name{font-family:Sora,"IBM Plex Sans",sans-serif;font-weight:700;font-size:30px;letter-spacing:-.02em}',
    '.cdcl-status{display:flex;align-items:center;gap:10px;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);font-size:14px;font-weight:500;color:#E6EBF3;min-height:40px}',
    '.cdcl-dot{position:relative;width:8px;height:8px;border-radius:50%;background:#00A3D1;flex-shrink:0}','.cdcl-dot:after{content:"";position:absolute;inset:0;border-radius:50%;background:#00A3D1;animation:cdclping 1.2s ease-out infinite;will-change:transform,opacity}',
    '@keyframes cdclping{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(3.4);opacity:0}}',
    '#cdc-login-loader-msg{position:relative;display:inline-grid}',    '#cdc-login-loader-msg .cdcl-step{grid-area:1/1;opacity:0;white-space:nowrap}',    '#cdc-login-loader-msg .cdcl-step:nth-child(1){animation:cdclstep 1.4s ease 0s both}',    '#cdc-login-loader-msg .cdcl-step:nth-child(2){animation:cdclstep 1.4s ease 1.4s both}',    '#cdc-login-loader-msg .cdcl-step:nth-child(3){animation:cdclstep 1.4s ease 2.8s both}',    '#cdc-login-loader-msg .cdcl-step:nth-child(4){animation:cdcllast .5s ease 4.2s both}',    '@keyframes cdclstep{0%{opacity:0;transform:translateY(6px)}15%,82%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-6px)}}',    '@keyframes cdcllast{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',    '.cdcl-canvas{position:absolute;left:0;top:50%;width:100vw;height:300px;margin-top:-150px;pointer-events:none}',
    '#cdc-login-loader-msg button{margin-top:10px;padding:8px 16px;background:linear-gradient(95deg,#C9431C,#B32660)!important;color:#fff;border:0;border-radius:10px;font-weight:600;cursor:pointer}',
    '.cdcl-foot{position:absolute;left:0;right:0;bottom:calc(28px + env(safe-area-inset-bottom,0px));text-align:center;font-size:12px;letter-spacing:.14em;color:rgba(230,235,243,.55)}',
    '@media (max-width:760px){.cdcl-side{display:none}.cdcl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cdcl-chart{display:none}.cdcl-name{font-size:24px}}',
    '@media (prefers-reduced-motion:reduce){.cdcl-win,.cdcl-inner,.cdcl-logo,.cdcl-glow,.cdcl-dot:after{animation:none}.cdcl-win{transform:none;width:100vw;-webkit-mask-image:none;mask-image:none}.cdcl-inner{transform:none}}'
  ].join('\n');

  var LOGO = '<svg class="cdcl-logo" viewBox="0 0 40 44" aria-hidden="true" focusable="false"><defs><linearGradient id="cdcl-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A3D"/><stop offset=".4" stop-color="#E8367A"/><stop offset=".75" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient></defs><path d="M20 2 L37 8 V21 C37 32 29.5 39 20 42 C10.5 39 3 32 3 21 V8 Z" fill="url(#cdcl-lg)"/><path d="M20 13 V31 M11 22 H29" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg>';

  var DASH = '<div class="cdcl-dash" aria-hidden="true">' +
    '<div class="cdcl-side"><i class="a"></i><i style="width:80%"></i><i style="width:65%"></i><i style="width:74%"></i><i style="width:58%"></i><i style="width:70%"></i><i style="width:62%"></i></div>' +
    '<div class="cdcl-main"><div class="cdcl-top"></div>' +
      '<div class="cdcl-kpis">' +
        '<div class="cdcl-kpi"><b></b><u style="background:linear-gradient(90deg,#FF6A3D,#E8367A)"></u></div>' +
        '<div class="cdcl-kpi"><b></b><u style="background:linear-gradient(90deg,#E8367A,#6A1BDB)"></u></div>' +
        '<div class="cdcl-kpi"><b></b><u style="background:linear-gradient(90deg,#6A1BDB,#00A3D1)"></u></div>' +
        '<div class="cdcl-kpi"><b></b><u style="background:#00A3D1"></u></div>' +
      '</div>' +
      '<div class="cdcl-row"><div class="cdcl-chart">' +
        '<s style="height:34%"></s><s style="height:46%"></s><s style="height:40%"></s><s style="height:58%"></s><s style="height:52%"></s><s style="height:66%"></s><s style="height:72%"></s><s style="height:64%"></s><s style="height:82%"></s><s style="height:90%"></s>' +
      '</div><div class="cdcl-table"><i></i><i class="p"></i><i class="d"></i><i></i><i class="p"></i><i></i><i></i></div></div>' +
    '</div></div>';

  var DEFS = '<defs><linearGradient id="cdcl-g" x1="0" y1="0" x2="1500" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF6A3D"/><stop offset=".35" stop-color="#E8367A"/><stop offset=".7" stop-color="#6A1BDB"/><stop offset="1" stop-color="#00A3D1"/></linearGradient>' +
    '<filter id="cdcl-bl" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs>';
  var ECG = '<div class="cdcl-ecg" aria-hidden="true">' +
    '<svg viewBox="0 0 1500 300" preserveAspectRatio="none" focusable="false">' + DEFS +
      '<path d="' + PATH + '" fill="none" stroke="url(#cdcl-g)" stroke-width="1.5" opacity=".18" vector-effect="non-scaling-stroke"/></svg>' +
    '<div class="cdcl-win"><div class="cdcl-inner"><svg viewBox="0 0 1500 300" preserveAspectRatio="none" focusable="false">' +
      '<path d="' + PATH + '" fill="none" stroke="url(#cdcl-g)" stroke-width="10" stroke-linejoin="round" filter="url(#cdcl-bl)" opacity=".9"/>' +
      '<path d="' + PATH + '" fill="none" stroke="url(#cdcl-g)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
    '</svg></div></div></div>';


  function injectCSS() {
    if (document.getElementById('cdcl-style')) return;
    var st = document.createElement('style');
    st.id = 'cdcl-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function paint(ov, msg) {
    ov.removeAttribute('style');
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    ov.innerHTML = DASH + '<div class="cdcl-tint"></div><div class="cdcl-glow"></div><div class="cdcl-linebox"></div>' +
      '<div class="cdcl-center">' + LOGO + '<div class="cdcl-name">ClaimDataCare</div>' +
      '<div class="cdcl-status"><span class="cdcl-dot"></span><span id="cdc-login-loader-msg"></span></div></div>' +
      '<div class="cdcl-foot">HIPAA • ENCRYPTED • CLOUD SYNC</div>';
    var m = ov.querySelector('#cdc-login-loader-msg');
    if (m) {
      if (msg) m.textContent = msg;
      else m.innerHTML = STEPS.map(function (t) { return '<span class="cdcl-step">' + t + '…</span>'; }).join('');
    }
    startLine(ov.querySelector('.cdcl-linebox'));
  }

  // Heart-monitor line: on its own thread when the browser supports it, CSS otherwise
  function startLine(box) {
    stopLine();
    if (!box) return;
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    try {
      if (!reduce && typeof OffscreenCanvas !== 'undefined' && HTMLCanvasElement.prototype.transferControlToOffscreen) {
        var c = document.createElement('canvas');
        c.className = 'cdcl-canvas';
        box.appendChild(c);
        var off = c.transferControlToOffscreen();
        worker = new Worker(BASE + 'cdc-ecg-worker.js?v=1');
        worker.onerror = function () { stopLine(); box.innerHTML = ECG; };
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        worker.postMessage({ type: 'init', canvas: off, w: window.innerWidth, h: 300, dpr: dpr }, [off]);
        resizeFn = function () { if (worker) worker.postMessage({ type: 'resize', w: window.innerWidth, h: 300, dpr: Math.min(window.devicePixelRatio || 1, 2) }); };
        window.addEventListener('resize', resizeFn);
        return;
      }
    } catch (e) { stopLine(); }
    box.innerHTML = ECG;
  }
  function stopLine() {
    if (resizeFn) { window.removeEventListener('resize', resizeFn); resizeFn = null; }
    if (worker) { try { worker.postMessage({ type: 'stop' }); worker.terminate(); } catch (e) {} worker = null; }
  }

  function showLoader(msg) {
    injectCSS();
    var ov = document.getElementById('cdc-login-loader');
    if (ov) { ov.classList.remove('cdcl-out'); ov.style.display = 'flex'; if (!ov.querySelector('.cdcl-linebox')) paint(ov, msg); return; }
    ov = document.createElement('div');
    ov.id = 'cdc-login-loader';
    paint(ov, msg);
    document.body.appendChild(ov);

    // Same safety net as before: after 15s offer a Reload button
    try { if (window._cdcLoaderStuckTimer) clearTimeout(window._cdcLoaderStuckTimer); } catch (e) {}
    window._cdcLoaderStuckTimer = setTimeout(function () {
      var m = document.getElementById('cdc-login-loader-msg');
      if (!m || !document.getElementById('cdc-login-loader')) return;
      var why = (window.__cdclLastError ? String(window.__cdclLastError).slice(0, 140) : '');
      m.innerHTML = 'This is taking longer than usual…' + (why ? '<br><small style="opacity:.75;font-size:11px"></small>' : '') +
        '<br><button type="button" onclick="location.reload()">Reload</button> <button type="button" onclick="try{clearSession()}catch(e){};location.reload()" style="background:transparent!important;border:1px solid rgba(255,255,255,.35)">Sign out</button>';
      if (why) m.querySelector('small').textContent = 'Detail: ' + why;
    }, 15000);
  }

  function hideLoader() {
    try { if (window._cdcLoaderStuckTimer) { clearTimeout(window._cdcLoaderStuckTimer); window._cdcLoaderStuckTimer = null; } } catch (e) {}
    var ov = document.getElementById('cdc-login-loader');
    if (!ov) { stopLine(); return; }
    ov.classList.add('cdcl-out');
    setTimeout(function () { stopLine(); if (ov.parentNode) ov.parentNode.removeChild(ov); }, 470);
  }

  // Remember the last error while the loading screen is up (shown if it gets stuck)
  window.addEventListener('error', function (e) { if (document.getElementById('cdc-login-loader')) window.__cdclLastError = (e && (e.message || e.error)) || 'error'; });
  window.addEventListener('unhandledrejection', function (e) { if (document.getElementById('cdc-login-loader')) window.__cdclLastError = (e && e.reason && (e.reason.message || e.reason)) || 'error'; });

  // Take over the app's functions (global names, resolved when they are called)
  window._showLoginLoader = showLoader;
  window._hideLoginLoader = hideLoader;

})();
