/*
 * ClaimDataCare  •  Dashboard (one dashboard for every specialty)
 * File: cdc-dashboard.js  •  v1.0
 *
 * Replaces the two dashboards that lived in script1.js (billing and Case Management).
 * The content adapts to the ACTIVE SPECIALTY:
 *   • Case Management / TCM → clients, cases, care team, documents, units this week/month
 *   • Any other specialty    → claims, collected, pending, submitted, payers, status
 * Specialty tabs (top right) appear only when the provider has more than one specialty;
 * the active one is solid, the others faded. Switching requires the "Switch Specialty"
 * permission in the user's form (the owner / Super Admin can always switch).
 * Static layout: the top row (alerts + tabs) has a fixed height and stays pinned under
 * the title bar while the dashboard scrolls; the date sits at the end.
 */
(function () {
  'use strict';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lc(t) { return String(t || '').toLowerCase(); }
  function money(n) { try { return '$' + fmtMoney(n); } catch (e) { return '$' + Number(n || 0).toFixed(2); } }
  function isCMName(n) { n = lc(n); return n.indexOf('case management') >= 0 || n.indexOf('case-management') >= 0 || /\btcm\b/.test(n); }
  function shortName(n) {
    var s = String(n || '');
    if (s.length <= 14) return s;
    var ab = s.split(/[\s\-/]+/).filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase();
    return ab.length >= 2 ? ab : s.slice(0, 12) + '…';
  }

  /* ---------------- who can switch specialty ---------------- */
  function me() {
    var s = getSession(); if (!s) return null;
    var list = [];
    try { list = (typeof _usersCache !== 'undefined' && _usersCache) ? _usersCache : getUsers(); } catch (e) {}
    return list.find(function (u) { return lc(u.email) === lc(s.email); }) || null;
  }
  function canSwitch() {
    var s = getSession(); if (!s) return false;
    if (s.role === 'Super Admin') return true;
    try { if (_cdcIsOwnerEmail(s.email)) return true; } catch (e) {}
    var u = me();
    return !!(u && Array.isArray(u.permissions) && u.permissions.indexOf('Switch Specialty') >= 0);
  }

  function context() {
    var s = getSession() || {};
    var db = getDB();
    var prov = (db.providers || []).find(function (p) { return p.id === activeProviderId; }) || {};
    var defs = (prov.specialtyDefs || []).map(function (d) { return d && d.name; }).filter(Boolean);
    var isSA = s.role === 'Super Admin';
    var active = isSA ? (window._saActiveSpecialty || '') : (s.activeSpecialty || (typeof getActiveSpecialty === 'function' ? getActiveSpecialty() : '') || '');
    if (!active) active = (typeof _isCMSpecialtyActive === 'function' && _isCMSpecialtyActive()) ? (defs.find(isCMName) || '') : (defs[0] || '');
    var mine = isSA ? defs.slice() : (typeof _specNamesOf === 'function' ? _specNamesOf(s.specialties || (me() || {}).specialties || []) : []);
    return { db: db, prov: prov, defs: defs, active: active, mine: mine, isSA: isSA, cm: isCMName(active) || (typeof _isCMSpecialtyActive === 'function' && _isCMSpecialtyActive()) };
  }

  /* ---------------- styles ---------------- */
  var CSS = [
    /* the dashboard section is its own scroll area, flush with the title bar */
    '#sec-dashboard,#sec-cm-dashboard{margin:-18px -20px;height:calc(100% + 36px);overflow-y:auto;overflow-x:hidden}',
    '.cdd{position:relative;padding:0 24px 24px;font-family:inherit;color:var(--text,#0B1526)}',
    /* pinned top row: alerts on the left, specialty tabs hanging from the title bar on the right */
    '.cdd-top{position:sticky;top:0;z-index:5;display:flex;align-items:flex-start;gap:14px;height:52px;margin:0 -24px;padding:0 24px;background:#FFFFFF}',
    '.cdd-alerts{flex:1;min-width:0;height:32px;margin-top:10px;display:flex;gap:8px;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}',
    '.cdd-alerts::-webkit-scrollbar{display:none}',
    '.cdd-alert{flex-shrink:0;display:flex;align-items:center;gap:7px;height:28px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;background:var(--bg2,#fff);border:1px solid var(--border2,#E4E9F1);color:var(--text2,#3A475C)}',
    '.cdd-alert:before{content:"";width:7px;height:7px;border-radius:50%;background:#8C98AB;flex-shrink:0}',
    '.cdd-alert.err:before,.cdd-alert.warn:before{background:#D45C37}',
    '.cdd-alert.err{color:#B8461F}',
    '.cdd-alert.ok{cursor:default;color:var(--text3,#586579)}',
    '.cdd-alert.ok:before{background:#0A7FA6}',
    '.cdd-tabs{display:flex;gap:4px;flex-shrink:0}',
    '.cdd-tab{border:0;cursor:pointer;height:30px;padding:0 16px;border-radius:0 0 10px 10px;font-family:inherit;font-size:11px;font-weight:700;line-height:1;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:#D45C37;transition:background .15s,color .15s}',
    '.cdd-tab.on{cursor:default}',
    '.cdd-tab.off{background:#F1F4F8;color:#586579}',
    '.cdd-tab.off:hover{background:#E4E9F1;color:#0B1526}',
    '.cdd-tab[disabled]{cursor:not-allowed;opacity:.55}',
    '.cdd-tab[disabled]:hover{background:#F1F4F8;color:#586579}',
    /* KPI cards: white, one accent colour only */
    '.cdd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:4px}',
    '.cdd-kpi{position:relative;overflow:hidden;border-radius:18px;padding:clamp(14px,1.4vw,20px) clamp(16px,1.6vw,22px);min-height:clamp(112px,9vw,132px);background-size:400% 100%;color:#fff;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform .18s,box-shadow .18s}',
    '.cdd-kpi:hover{transform:translateY(-2px)}',
    '.cdd-kpi:focus-visible{outline:2px solid #0B1526;outline-offset:3px}',
    '.cdd-kpi:after{content:"";position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.13);pointer-events:none}',
    '.cdd-kpi .t{position:relative;z-index:1;font-size:clamp(13px,1vw,15px);font-weight:600;text-align:right;opacity:.96}',
    '.cdd-kpi .row{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}',
    '.cdd-kpi .row svg{opacity:.92;flex-shrink:0;width:clamp(22px,2vw,30px);height:auto}',
    '.cdd-kpi .v{font-size:clamp(24px,2.3vw,34px);font-weight:700;letter-spacing:-.02em;line-height:1;text-align:right}',
    '.cdd-kpi .s{font-size:11.5px;opacity:.88;margin-top:6px;text-align:right}',
    /* panels */
    '.cdd-grid{display:grid;gap:14px;margin-top:14px}',
    '.cdd-g2{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}',
    '.cdd-card{background:var(--bg2,#fff);border:1px solid var(--border2,#E4E9F1);border-radius:14px;padding:18px 20px;min-height:220px}',
    '.cdd-card h3{margin:0 0 14px;font-size:14px;font-weight:700}',
    '.cdd-empty{font-size:12.5px;color:var(--text3,#586579);padding:14px 0}',
    '.cdd-pill{padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}',
    '.cdd-pill.ok{background:rgba(10,127,166,.1);color:#0A6A8C}',
    '.cdd-pill.att{background:rgba(212,92,55,.1);color:#B8461F}',
    '.cdd-pill.neu{background:#EEF1F6;color:#3A475C}',
    '.cdd-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.cdd-tbl th{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);text-align:left;padding:0 8px 8px;font-weight:600}',
    '.cdd-tbl td{padding:9px 8px;border-top:1px solid var(--border,#EEF1F6)}',
    '.cdd-date{flex-shrink:0;font-size:12px;font-weight:500;color:var(--text3,#586579);white-space:nowrap;padding-left:4px}',
    /* revenue by payer: radial rings + legend + status bar */
    '.cdd-rev{display:flex;flex-direction:column}',
    '.cdd-rev-hd{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px}',
    '.cdd-rev-hd h3{margin:0}',
    '.cdd-rev-hd small{font-size:11.5px;color:var(--text3,#586579)}',
    '.cdd-rev-body{display:flex;align-items:center;gap:clamp(14px,2vw,24px);flex-wrap:wrap}',
    '.cdd-key{display:flex;gap:12px;font-size:11px;color:var(--text3,#586579);flex-wrap:wrap}',
    '.cdd-key span{display:flex;align-items:center;gap:6px}',
    '.cdd-key i{width:18px;height:6px;border-radius:4px;background:#FF6A3D}',
    '.cdd-key i.lt{opacity:.25}',
    '.cdd-rings{position:relative;width:min(280px,100%);aspect-ratio:1;flex-shrink:0;margin:0 auto}',
    '.cdd-rings svg{display:block;width:100%;height:auto}',
    '.cdd-arc{animation:cddArc 1.1s cubic-bezier(.2,.8,.2,1) both}',
    '@keyframes cddArc{from{stroke-dasharray:0 1200}}',
    '.cdd-rings .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;padding:0 22%}',
    '.cdd-rings .ctr b{font-size:clamp(24px,2.2vw,32px);font-weight:700;letter-spacing:-.03em;line-height:1;color:#0B1526}',
    '.cdd-rings .ctr span{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);margin-top:4px}',
    '.cdd-rings .ctr em{font-style:normal;font-size:11px;color:var(--text2,#3A475C);margin-top:6px}',
    '.cdd-leg{flex:1 1 260px;min-width:0}',
    '.cdd-leg table{width:100%;border-collapse:collapse;font-size:12px}',
    '.cdd-leg th{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);text-align:right;padding:0 0 8px 8px;white-space:nowrap}',
    '.cdd-leg th:first-child{text-align:left;padding-left:0}',
    '.cdd-leg td{padding:8px 0 8px 8px;border-top:1px solid var(--border,#EEF1F6);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.cdd-leg td:first-child{text-align:left;padding-left:0;white-space:normal}',
    '.cdd-leg .nm{display:flex;align-items:center;gap:8px;font-weight:700;color:#0B1526;min-width:0}',
    '.cdd-leg .nm i{width:10px;height:10px;border-radius:3px;flex-shrink:0}',
    '.cdd-leg .nm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}',
    '.cdd-leg .nt{display:block;font-size:10.5px;font-weight:500;color:var(--text3,#586579);margin:2px 0 0 18px}',
    '.cdd-leg .pc{display:inline-block;min-width:38px;padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:700;text-align:center}',
    '.cdd-leg .solid{font-weight:700;color:#0B1526}',
    '.cdd-leg .muted{color:var(--text3,#586579)}',
    '.cdd-stat{margin-top:12px;padding-top:10px;border-top:1px solid var(--border,#EEF1F6)}',
    '.cdd-stat-hd{display:flex;justify-content:space-between;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);margin-bottom:7px}',
    '.cdd-stat-bar{display:flex;height:8px;border-radius:6px;overflow:hidden;background:#EEF1F6;gap:2px}',
    '.cdd-stat-bar i{display:block;height:100%}',
    '.cdd-stat-leg{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}',
    '.cdd-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;background:#F8FAFC;border:1px solid #EEF1F6;font-size:11.5px;color:var(--text2,#3A475C);white-space:nowrap}',
    '.cdd-chip i{width:8px;height:8px;border-radius:50%}',
    '.cdd-chip b{font-weight:700;color:#0B1526;font-variant-numeric:tabular-nums}',
    '.cdd-chip em{font-style:normal;font-size:10.5px;color:var(--text3,#586579)}',
    /* aging + trend */
    '.cdd-g2b{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}',
    '.cdd-age-bar{display:flex;height:10px;border-radius:6px;overflow:hidden;background:#EEF1F6;gap:2px;margin:4px 0 14px}',
    '.cdd-age-bar i{display:block;height:100%}',
    '.cdd-age{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
    '.cdd-age div{border-radius:12px;background:#F8FAFC;border:1px solid #EEF1F6;padding:10px 12px}',
    '.cdd-age small i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}',
    '.cdd-age small{display:block;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text3,#586579)}',
    '.cdd-age b{display:block;font-size:clamp(15px,1.3vw,18px);font-weight:700;color:#0B1526;margin-top:4px;font-variant-numeric:tabular-nums}',
    '.cdd-age span{font-size:11px;color:var(--text3,#586579)}',
    '.cdd-trend svg{display:block;width:100%;height:auto}',
    '.cdd-pcn{cursor:pointer;font-family:var(--mono,monospace);font-size:11px;color:var(--text3,#586579);text-decoration:none;border-radius:6px;padding:2px 5px;margin-left:-5px;transition:background .15s,color .15s}',
    '.cdd-pcn:hover{background:rgba(255,106,61,.1);color:#D45C37}',
    '.cdd-tblwrap{overflow:auto}',
    '.cdd-tbl thead th{position:sticky;top:0;background:var(--bg2,#fff);z-index:1}',
    /* fit to the screen: every block shares the available height, nothing is cut and the page does not scroll */
    '@media (min-width:1281px) and (min-height:640px){' +
      '.cdd{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding-bottom:14px}' +
      '.cdd-top{flex:none;height:46px}.cdd-alerts{margin-top:7px}' +
      '.cdd-kpis{flex:none;margin-top:0}' +
      '.cdd-kpi{min-height:clamp(92px,11.5vh,132px)}' +
      '.cdd-grid{margin-top:12px;gap:12px;min-height:0}' +
      '.cdd-g2{flex:1.35 1 0}.cdd-g2b{flex:1 1 0}' +
      '.cdd-g2>.cdd-card,.cdd-g2b>.cdd-card{min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:14px 18px}' +
      '.cdd-card h3{margin-bottom:10px}' +
      '.cdd-tblwrap{flex:1;min-height:0}' +
      '.cdd-tbl td{padding:7px 8px}' +
      '.cdd-rev-body{flex:1;min-height:0;flex-wrap:nowrap;align-items:stretch}' +
      '.cdd-rings{height:100%;width:auto;max-width:48%;margin:0}' +
      '.cdd-leg{align-self:center;max-height:100%;overflow:auto}' +
      '.cdd-trend svg{flex:1;min-height:0;height:100%}' +
      '.cdd-age-bar{margin:2px 0 10px}' +
    '}',
    '@media (max-width:1280px){.cdd-g2{grid-template-columns:minmax(0,1fr)}}',
    '@media (max-width:1100px){.cdd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cdd-g2b{grid-template-columns:minmax(0,1fr)}}',
    '@media (max-width:620px){.cdd-kpis{grid-template-columns:minmax(0,1fr)}.cdd-age{grid-template-columns:repeat(2,minmax(0,1fr))}.cdd-date{display:none}}',
    '@media (max-width:768px){#sec-dashboard,#sec-cm-dashboard{margin:-12px;height:calc(100% + 24px)}.cdd{padding:0 14px 18px}.cdd-top{margin:0 -14px;padding:0 14px}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('cdd-style')) return;
    var st = document.createElement('style'); st.id = 'cdd-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* ---------------- small builders ---------------- */
  var ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    brief: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    team: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 20c.8-2.5 2.8-4 5-4s4.2 1.5 5 4"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'
  };
  function ico(k) { return '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + '</svg>'; }
  // Neon order: orange (primary) • violet • blue • magenta. One continuous gradient runs
  // across the four cards (each card shows its own slice), so the colours fuse card to card.
  var FUSE = 'linear-gradient(100deg,#FF8A3D 0%,#FF6A3D 7%,#7B2FF7 36%,#00A3D1 66%,#E8367A 93%,#FF4F9A 100%)';
  var GLOW = ['rgba(255,106,61,.7)', 'rgba(123,47,247,.65)', 'rgba(0,163,209,.65)', 'rgba(232,54,122,.65)'];
  var POS = ['0%', '33.333%', '66.667%', '100%'];
  var kpiN = 0;
  function kpi(title, value, sub, icon, route) {
    var i = kpiN++ % 4;
    return '<div class="cdd-kpi" role="button" tabindex="0" style="background-image:' + FUSE + ';background-position:' + POS[i] + ' 0;box-shadow:0 18px 34px -20px ' + GLOW[i] + '" onclick="go(\'' + route + '\')" onkeydown="if(event.key===\'Enter\')go(\'' + route + '\')">' +
      '<div class="t">' + esc(title) + '</div>' +
      '<div class="row">' + ico(icon) + '<div><div class="v">' + esc(value) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div></div></div>';
  }
  function alertsStrip(list) {
    var day = '<span class="cdd-date">' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</span>';
    if (!list.length) return '<div class="cdd-alerts"><span class="cdd-alert ok">All caught up • no alerts right now</span>' + day + '</div>';
    return '<div class="cdd-alerts">' + list.map(function (a) {
      return '<span class="cdd-alert ' + a.type + '"' + (a.route ? ' role="button" tabindex="0" onclick="go(\'' + a.route + '\')"' : '') + '>' + esc(a.text) + '</span>';
    }).join('') + day + '</div>';
  }
  function tabs(ctx) {
    if (ctx.defs.length < 2) return '';
    var allowed = canSwitch();
    return '<div class="cdd-tabs" role="tablist" aria-label="Specialty">' + ctx.defs.map(function (n) {
      var on = n === ctx.active;
      var mine = ctx.mine.indexOf(n) >= 0;
      var can = !on && allowed && mine;
      var tip = on ? n + ' (active)' : (!allowed ? 'You do not have permission to switch specialty' : (!mine ? 'This specialty is not assigned to you' : 'Switch to ' + n));
      return '<button type="button" role="tab" aria-selected="' + on + '" class="cdd-tab ' + (on ? 'on' : 'off') + '" title="' + esc(tip) + '"' +
        (can ? ' onclick="cdcDashSwitch(\'' + esc(n).replace(/'/g, "\\'") + '\')"' : (on ? '' : ' disabled')) + '>' + esc(shortName(n)) + '</button>';
    }).join('') + '</div>';
  }
  /* ---------------- shared layout (identical for every specialty) ----------------
   Row 1: alerts + date | specialty tabs
   Row 2: four gradient KPI cards
   Row 3: recent activity table | ring visual (one ring per group) + status bar        */
  var RING = ['#FF6A3D', '#7B2FF7', '#00A3D1', '#E8367A', '#0B1526'];
  var SCOL = { ok: '#00A3D1', att: '#FF6A3D', neu: '#8C98AB' };

  function tableCard(title, heads, rows, empty) {
    return '<div class="cdd-card"><h3>' + esc(title) + '</h3>' + (rows.length ?
      '<div class="cdd-tblwrap"><table class="cdd-tbl"><thead><tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="cdd-empty">' + empty + '</div>') + '</div>';
  }

  // items: [{ name, total, part, totalTxt, partTxt, note }]  ring length = total, solid = part
  function ringsCard(o) {
    var items = o.items.slice();
    if (items.length > 5) {
      var rest = items.slice(4), agg = { name: o.otherName || 'Other', total: 0, part: 0 };
      rest.forEach(function (x) { agg.total += x.total; agg.part += x.part; });
      agg.totalTxt = o.fmt(agg.total); agg.partTxt = o.fmt(agg.part); agg.note = '';
      items = items.slice(0, 4); items.push(agg);
    }
    var maxT = items.reduce(function (m, x) { return Math.max(m, x.total); }, 0) || 1;
    var SW = 10, GAP = 5, R0 = 130, SWEEP = 0.75;
    var svg = '<svg viewBox="0 0 280 280" aria-hidden="true">';
    items.forEach(function (x, i) {
      var r = R0 - i * (SW + GAP), C = 2 * Math.PI * r, full = C * SWEEP;
      var tl = full * (x.total / maxT), pl = full * Math.min(1, x.part / maxT), col = RING[i % RING.length];
      var base = ' cx="140" cy="140" r="' + r + '" fill="none" stroke-width="' + SW + '" stroke-linecap="round" transform="rotate(-90 140 140)"';
      svg += '<circle' + base + ' stroke="#EEF1F6" stroke-dasharray="' + full.toFixed(1) + ' ' + C.toFixed(1) + '"/>';
      if (tl > 0.5) svg += '<circle class="cdd-arc"' + base + ' stroke="' + col + '" stroke-opacity=".22" stroke-dasharray="' + tl.toFixed(1) + ' ' + C.toFixed(1) + '" style="animation-delay:' + (i * 90) + 'ms"/>';
      if (pl > 0.5) svg += '<circle class="cdd-arc"' + base + ' stroke="' + col + '" stroke-dasharray="' + pl.toFixed(1) + ' ' + C.toFixed(1) + '" style="animation-delay:' + (i * 90 + 250) + 'ms"/>';
    });
    svg += '</svg>';
    var rings = '<div class="cdd-rings">' + svg + '<div class="ctr"><b>' + esc(o.big) + '</b><span>' + esc(o.bigLabel) + '</span><em>' + esc(o.bigSub) + '</em></div></div>';
    var legend = '<div class="cdd-leg">' + (items.length ? '<table><thead><tr><th>' + esc(o.cols[0]) + '</th><th>' + esc(o.cols[1]) + '</th><th>' + esc(o.cols[2]) + '</th><th>%</th></tr></thead><tbody>' +
      items.map(function (x, i) {
        var pc = x.total > 0 ? Math.round(x.part / x.total * 100) : 0, col = RING[i % RING.length];
        return '<tr><td><div class="nm"><i style="background:' + col + '"></i><span title="' + esc(x.name) + '">' + esc(x.name) + '</span></div>' + (x.note ? '<span class="nt">' + esc(x.note) + '</span>' : '') + '</td>' +
          '<td class="solid">' + esc(x.partTxt) + '</td><td class="muted">' + esc(x.totalTxt) + '</td>' +
          '<td><span class="pc" style="background:' + col + '1f;color:' + col + '">' + pc + '%</span></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="cdd-empty">' + esc(o.empty) + '</div>') + '</div>';
    var st = o.status.filter(function (x) { return x.count > 0; }), tot = st.reduce(function (a, x) { return a + x.count; }, 0) || 1;
    var stat = '<div class="cdd-stat"><div class="cdd-stat-hd"><span>' + esc(o.statusTitle) + '</span><span>' + (st.length ? tot + ' total' : '') + '</span></div><div class="cdd-stat-bar">' + st.map(function (x) {
        return '<i style="width:' + (x.count / tot * 100).toFixed(2) + '%;background:' + SCOL[x.tone] + '" title="' + esc(x.label) + ': ' + x.count + '"></i>';
      }).join('') + '</div><div class="cdd-stat-leg">' + (st.length ? st.map(function (x) {
        return '<span class="cdd-chip"><i style="background:' + SCOL[x.tone] + '"></i>' + esc(x.label) + ' <b>' + x.count + '</b><em>' + Math.round(x.count / tot * 100) + '%</em></span>';
      }).join('') : '<span class="cdd-chip">' + esc(o.statusEmpty) + '</span>') + '</div></div>';
    return '<div class="cdd-card cdd-rev"><div class="cdd-rev-hd"><h3>' + esc(o.title) + '</h3><div class="cdd-key"><span><i class="lt"></i>' + esc(o.cols[2]) + '</span><span><i></i>' + esc(o.cols[1]) + '</span></div></div>' +
      '<div class="cdd-rev-body">' + rings + legend + '</div>' + stat + '</div>';
  }

  // Buckets: [{ label, value, txt, color }]
  function agingCard(title, totalTxt, buckets, empty) {
    var tot = buckets.reduce(function (a, x) { return a + x.value; }, 0);
    return '<div class="cdd-card"><div class="cdd-rev-hd"><h3>' + esc(title) + '</h3><small>' + esc(totalTxt) + '</small></div>' +
      (tot > 0 ? '<div class="cdd-age-bar">' + buckets.filter(function (x) { return x.value > 0; }).map(function (x) {
        return '<i style="width:' + (x.value / tot * 100).toFixed(2) + '%;background:' + x.color + '" title="' + esc(x.label) + ': ' + esc(x.txt) + '"></i>';
      }).join('') + '</div>' : '<div class="cdd-age-bar"></div>') +
      '<div class="cdd-age">' + buckets.map(function (x) {
        return '<div><small><i style="background:' + x.color + '"></i>' + esc(x.label) + '</small><b>' + esc(x.txt) + '</b><span>' + (tot > 0 ? Math.round(x.value / tot * 100) : 0) + '% • ' + x.count + ' ' + esc(x.unit) + '</span></div>';
      }).join('') + '</div>' + (tot > 0 ? '' : '<div class="cdd-empty">' + esc(empty) + '</div>') + '</div>';
  }

  // months: [{ label, total, part }]  tint bar = total, solid bar = part
  function trendCard(title, cols, months, fmt, color) {
    var max = months.reduce(function (m, x) { return Math.max(m, x.total, x.part); }, 0) || 1;
    var W = 560, H = 190, PB = 26, PT = 18, bw = 26, step = W / months.length;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
    [0.5, 1].forEach(function (f) { var y = PT + (H - PB - PT) * (1 - f); svg += '<line x1="0" x2="' + W + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#EEF1F6" stroke-dasharray="3 4"/>'; });
    months.forEach(function (m, i) {
      var cx = step * i + step / 2, hT = (H - PB - PT) * (m.total / max), hP = (H - PB - PT) * (m.part / max), base = H - PB;
      svg += '<rect class="cdd-arc" x="' + (cx - bw - 2) + '" y="' + (base - hT).toFixed(1) + '" width="' + bw + '" height="' + Math.max(hT, 0).toFixed(1) + '" rx="6" fill="' + color + '" fill-opacity=".22"><title>' + esc(m.label + ' ' + cols[0] + ': ' + fmt(m.total)) + '</title></rect>';
      svg += '<rect x="' + (cx + 2) + '" y="' + (base - hP).toFixed(1) + '" width="' + bw + '" height="' + Math.max(hP, 0).toFixed(1) + '" rx="6" fill="' + color + '"><title>' + esc(m.label + ' ' + cols[1] + ': ' + fmt(m.part)) + '</title></rect>';
      svg += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#586579" font-family="inherit">' + esc(m.label) + '</text>';
    });
    svg += '</svg>';
    var tT = months.reduce(function (a, x) { return a + x.total; }, 0), tP = months.reduce(function (a, x) { return a + x.part; }, 0);
    return '<div class="cdd-card cdd-trend"><div class="cdd-rev-hd"><h3>' + esc(title) + '</h3><div class="cdd-key"><span><i class="lt" style="background:' + color + '"></i>' + esc(cols[0]) + ' ' + esc(fmt(tT)) + '</span><span><i style="background:' + color + '"></i>' + esc(cols[1]) + ' ' + esc(fmt(tP)) + '</span></div></div>' + svg + '</div>';
  }

  function lastMonths(n) {
    var out = [], d = new Date(); d.setDate(1);
    for (var i = n - 1; i >= 0; i--) { var m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push({ y: m.getFullYear(), m: m.getMonth(), label: m.toLocaleDateString('en-US', { month: 'short' }), total: 0, part: 0 }); }
    return out;
  }
  function parseDay(v) {
    if (!v) return null;
    var t = String(v), m;
    if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3], +m[1] - 1, +m[2]);
    var d = new Date(t); return isNaN(d) ? null : d;
  }
  function daysAgo(d) { return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; }
  var AGE = [['0 to 30 days', 30, '#FFD3C2'], ['31 to 60 days', 60, '#FFA07C'], ['61 to 90 days', 90, '#FF6A3D'], ['Over 90 days', Infinity, '#C8431F']];   // one orange ramp, darker = older

  function layout(alerts, kpis, table, rings, aging, trend) {
    return { alerts: alerts, body: '<div class="cdd-kpis">' + kpis.join('') + '</div>' +
      '<div class="cdd-grid cdd-g2">' + table + rings + '</div>' +
      '<div class="cdd-grid cdd-g2b">' + aging + trend + '</div>' };
  }

  /* ---------------- Case Management / TCM ---------------- */
  function cmView(ctx) {
    var d = (typeof getCMData === 'function') ? getCMData() : {};
    var now = new Date(), day = 86400000;
    var clients = d.clients || [], workers = d.workers || [], plans = d.plans || [], enc = d.encounters || [];
    var activeClients = clients.filter(function (c) { return c.status === 'Active'; });
    var discharged = clients.filter(function (c) { return lc(c.status) === 'discharged'; });
    var activeCases = plans.filter(function (p) { return p.status === 'Active'; });
    var team = workers.filter(function (w) { return w.status !== 'Inactive'; });
    var docs = (d.documents || []).length + (d.assessments || []).length + plans.length + (d.discharges || []).length;
    var weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    function units(list) { return list.reduce(function (s, n) { return s + (parseFloat(n.units) || 0); }, 0); }
    function approved(n) { return n.supervisorStatus === 'Approved'; }
    var wk = enc.filter(function (n) { var t = new Date(n.date); return t >= weekStart; });
    var mo = enc.filter(function (n) { var t = new Date(n.date); return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear(); });
    var wkT = units(wk), wkA = units(wk.filter(approved)), moT = units(mo), moA = units(mo.filter(approved));

    var alerts = [];
    var expAuth = (d.authorizations || []).filter(function (a) { return a.status === 'Active' && a.endDate && new Date(a.endDate) >= now && new Date(a.endDate) < new Date(+now + 30 * day); });
    var expiredAuth = (d.authorizations || []).filter(function (a) { return a.status === 'Active' && a.endDate && new Date(a.endDate) < now; });
    var reviews = plans.filter(function (p) { return p.status === 'Active' && p.nextReview && new Date(p.nextReview) < new Date(+now + 30 * day); });
    var pending = enc.filter(function (n) { return n.supervisorStatus === 'Pending' || !n.supervisorStatus; });
    var overdue = (d.tasks || []).filter(function (t) { return t.status === 'Open' && t.dueDate && new Date(t.dueDate) < now; });
    var unsigned = enc.filter(function (n) { return n.signatureStatus !== 'Signed' && n.billable; });
    if (expiredAuth.length) alerts.push({ type: 'err', text: expiredAuth.length + ' authorization(s) expired • billing blocked', route: 'cm-authorizations' });
    if (overdue.length) alerts.push({ type: 'err', text: overdue.length + ' overdue task(s)', route: 'cm-dashboard' });
    if (expAuth.length) alerts.push({ type: 'warn', text: expAuth.length + ' authorization(s) expiring in 30 days', route: 'cm-authorizations' });
    if (reviews.length) alerts.push({ type: 'warn', text: reviews.length + ' care plan(s) due for review', route: 'cm-clients' });
    if (pending.length) alerts.push({ type: 'info', text: pending.length + ' note(s) pending supervisor review', route: 'cm-supervisor' });
    if (unsigned.length) alerts.push({ type: 'info', text: unsigned.length + ' unsigned billable note(s)', route: 'cm-supervisor' });

    var nameOf = function (id) { try { return _cmClientName(id) || ''; } catch (e) { return ''; } };
    var workerName = function (w) { return ((w.first || '') + ' ' + (w.last || '')).trim() || w.name || 'Unnamed'; };
    var byW = {}; team.forEach(function (w) { byW[w.id] = w; });
    var fmtU = function (n) { return (Math.round(n * 100) / 100) + ' u'; };

    // table: recent notes this month (same card as recent claims)
    var recent = mo.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 8);
    var NTONE = { Approved: 'ok', Returned: 'att' };
    var table = tableCard('Recent notes • this month', ['Client', 'Date', 'Type', 'Care team', 'Units', 'Status'], recent.map(function (n) {
      var stt = n.supervisorStatus || 'Pending', w = byW[n.workerId];
      return ['<b>' + esc(nameOf(n.clientId)) + '</b>', esc(n.date || ''), esc(n.contactType || ''), esc(w ? workerName(w) : ''), esc(n.units || 0),
        '<span class="cdd-pill ' + (NTONE[stt] || 'neu') + '">' + esc(stt) + '</span>'];
    }), 'No notes this month.');

    // rings: units this month per care team member (ring = units, solid = approved) + caseload
    var items = team.map(function (w) {
      var mine = mo.filter(function (n) { return n.workerId === w.id; });
      var t = units(mine), ap = units(mine.filter(approved));
      var cnt = activeClients.filter(function (c) { return c.workerId === w.id; }).length;
      return { name: workerName(w), total: t, part: ap, totalTxt: fmtU(t), partTxt: fmtU(ap), note: 'Caseload ' + cnt + ' of ' + (w.capacity || 20) + ' clients' };
    }).sort(function (x, y) { return y.total - x.total; });
    var moPct = moT > 0 ? Math.round(moA / moT * 100) : 0;
    var nst = { Approved: 0, Pending: 0, Returned: 0 };
    mo.forEach(function (n) { var k = n.supervisorStatus || 'Pending'; nst[k] = (nst[k] || 0) + 1; });
    var rings = ringsCard({
      title: 'Units by care team', cols: ['Care team', 'Approved', 'Units'],
      items: items, fmt: fmtU, otherName: 'Other members',
      big: moPct + '%', bigLabel: 'approved', bigSub: moA + ' of ' + moT + ' units • week ' + wkA + '/' + wkT,
      empty: 'No care team members yet.',
      status: Object.keys(nst).map(function (k) { return { label: k, count: nst[k], tone: NTONE[k] || 'neu' }; }),
      statusTitle: 'Notes this month by status', statusEmpty: 'No notes this month.'
    });

    // aging: notes still waiting for supervisor review, by age
    var cmAge = AGE.map(function (a) { return { label: a[0], value: 0, count: 0, txt: '', color: a[2], unit: 'notes' }; });
    enc.filter(function (n) { return !n.supervisorStatus || n.supervisorStatus === 'Pending'; }).forEach(function (n) {
      var dd = daysAgo(parseDay(n.date)); if (dd == null) return;
      for (var i = 0; i < AGE.length; i++) if (dd <= AGE[i][1]) { cmAge[i].value += parseFloat(n.units) || 0; cmAge[i].count++; break; }
    });
    cmAge.forEach(function (x) { x.txt = fmtU(x.value); });
    var cmPend = cmAge.reduce(function (a, x) { return a + x.value; }, 0);
    var aging = agingCard('Notes waiting for review', fmtU(cmPend) + ' pending', cmAge, 'Nothing waiting for review.');
    var cmMo = lastMonths(6);
    enc.forEach(function (n) { var d = parseDay(n.date); if (!d) return; cmMo.forEach(function (m) { if (m.y === d.getFullYear() && m.m === d.getMonth()) { var u = parseFloat(n.units) || 0; m.total += u; if (approved(n)) m.part += u; } }); });
    var trend = trendCard('Units • last 6 months', ['Units', 'Approved'], cmMo, fmtU, '#7B2FF7');

    return layout(alerts, [
      kpi('Clients', activeClients.length, clients.length + ' total • ' + discharged.length + ' discharged', 'users', 'cm-clients'),
      kpi('Cases', activeCases.length, 'active care plans', 'brief', 'cm-clients'),
      kpi('Care Team', team.length, 'active members', 'team', 'cm-workers'),
      kpi('Documents', docs, 'plans, assessments, files', 'doc', 'cm-clients')
    ], table, rings, aging, trend);
  }

  /* ---------------- Billing (every other specialty) ---------------- */
  function billingView(ctx) {
    var db = ctx.db;
    var claims = (db.claims || []).filter(function (c) { return c.providerId === activeProviderId; });
    var billed = claims.reduce(function (s, c) { return s + claimTotal(c); }, 0);
    var paid = claims.reduce(function (s, c) { return s + (parseFloat(c.paid) || 0); }, 0);
    var pct = billed > 0 ? Math.round(paid / billed * 100) : 0;
    var cnt = function (f) { return claims.filter(f).length; };
    var pending = cnt(function (c) { return c.status === 'pending' || c.status === 'draft'; });
    var submitted = cnt(function (c) { return c.status === 'submitted'; });
    var rejected = cnt(function (c) { return c.status === 'rejected' || c.status === 'denied'; });
    var onHold = cnt(function (c) { return c.status === 'on_hold'; });

    var alerts = [];
    if (rejected) alerts.push({ type: 'err', text: rejected + ' rejected or denied claim(s)', route: 'claims' });
    if (pending) alerts.push({ type: 'warn', text: pending + ' claim(s) waiting to be submitted', route: 'claims' });
    if (onHold) alerts.push({ type: 'info', text: onHold + ' claim(s) on hold', route: 'claims' });

    var LABEL = { draft: 'Draft', pending: 'Pending', submitted: 'Submitted', accepted: 'Accepted CH', rejected: 'Rejected', denied: 'Denied', on_hold: 'On Hold', paid: 'Paid', partially_paid: 'Partial', partial: 'Partial', voided: 'Voided', EXTENSION_QUEUED: 'Queued' };
    var TONE = { paid: 'ok', partially_paid: 'ok', partial: 'ok', pending: 'att', rejected: 'att', denied: 'att', on_hold: 'att' };
    var tone = function (st) { return TONE[st] || 'neu'; };
    var pill = function (st) { return '<span class="cdd-pill ' + tone(st) + '">' + esc(LABEL[st] || st || '') + '</span>'; };

    var pts = {}; (db.patients || []).forEach(function (p) { pts[p.id] = p; });
    var recent = claims.slice(-8).reverse();
    var table = recent.length ? tableCard('Recent claims', ['PCN', 'Patient', 'DOS', 'Billed', 'Paid', 'Status'], recent.map(function (c) {
      var p = pts[c.patId] || {};
      var nm = (typeof ptLinkName === 'function') ? ptLinkName(p.id, p.last || '?', p.first || '?') : esc((p.last || '') + ', ' + (p.first || ''));
      var pd = parseFloat(c.paid) || 0;
      return ['<span class="cdd-pcn" role="button" tabindex="0" title="Edit claim" onclick="openClaimDetail(\'' + esc(c.id) + '\')" onkeydown="if(event.key===\'Enter\')openClaimDetail(\'' + esc(c.id) + '\')">' + esc(c.pcn || '') + '</span>', '<b>' + nm + '</b>', esc(c.dos || ''), money(claimTotal(c)), pd ? money(pd) : '•', pill(c.status)];
    }), '') : tableCard('Recent claims', [], [], 'No claims yet. <button class="btn btn-primary btn-sm" onclick="openClaimModal(-1)">New claim</button>');

    // rings: billed vs collected per payer
    var ps = {}, pb = {};
    claims.forEach(function (c) { var p = pts[c.patId]; if (!p) return; var k = p.payerName || p.payerid || 'Unknown'; ps[k] = (ps[k] || 0) + (parseFloat(c.paid) || 0); pb[k] = (pb[k] || 0) + claimTotal(c); });
    var items = Object.keys(pb).map(function (k) { return { name: k, total: pb[k], part: ps[k] || 0, totalTxt: money(pb[k]) + ' billed', partTxt: money(ps[k] || 0), note: '' }; })
      .sort(function (x, y) { return y.total - x.total; });
    var ss = {}; claims.forEach(function (c) { ss[c.status] = (ss[c.status] || 0) + 1; });
    var rings = ringsCard({
      title: 'Revenue by payer', cols: ['Payer', 'Collected', 'Billed'],
      items: items, fmt: money, otherName: 'Other payers',
      big: pct + '%', bigLabel: 'collected', bigSub: money(paid) + ' of ' + money(billed),
      empty: 'No payer activity yet.',
      status: Object.keys(ss).sort(function (x, y) { return ss[y] - ss[x]; }).map(function (k) { return { label: LABEL[k] || k, count: ss[k], tone: tone(k) }; }),
      statusTitle: 'Claims by status', statusEmpty: 'No claims yet.'
    });

    // A/R aging: open balance of claims already sent, by date of service
    var OPEN = { submitted: 1, accepted: 1, partially_paid: 1, partial: 1, rejected: 1, denied: 1, on_hold: 1 };
    var arAge = AGE.map(function (a) { return { label: a[0], value: 0, count: 0, txt: '', color: a[2], unit: 'claims' }; });
    claims.forEach(function (c) {
      if (!OPEN[c.status]) return;
      var bal = Math.max(0, claimTotal(c) - (parseFloat(c.paid) || 0)); if (!bal) return;
      var dd = daysAgo(parseDay(c.dos)); if (dd == null) return;
      for (var i = 0; i < AGE.length; i++) if (dd <= AGE[i][1]) { arAge[i].value += bal; arAge[i].count++; break; }
    });
    arAge.forEach(function (x) { x.txt = money(x.value); });
    var arTot = arAge.reduce(function (a, x) { return a + x.value; }, 0);
    var aging = agingCard('A/R aging', money(arTot) + ' outstanding', arAge, 'No open balances.');
    var bMo = lastMonths(6);
    claims.forEach(function (c) { var d = parseDay(c.dos); if (!d) return; bMo.forEach(function (m) { if (m.y === d.getFullYear() && m.m === d.getMonth()) { m.total += claimTotal(c); m.part += parseFloat(c.paid) || 0; } }); });
    var trend = trendCard('Billed vs collected • last 6 months', ['Billed', 'Collected'], bMo, money, '#FF6A3D');

    return layout(alerts, [
      kpi('Total Claims', claims.length, submitted + ' submitted • ' + pending + ' pending', 'file', 'claims'),
      kpi('Collected', money(paid), pct + '% of ' + money(billed) + ' billed', 'cash', 'eob'),
      kpi('Pending', pending, 'waiting to be submitted', 'clock', 'claims'),
      kpi('Submitted', submitted, rejected ? rejected + ' rejected or denied' : 'no rejected claims', 'send', 'claims')
    ], table, rings, aging, trend);
  }

  /* ---------------- render ---------------- */
  var tries = 0;
  function render(sectionId) {
    if (!activeProviderId) {
      var db0 = getDB(), s0 = getSession();
      var sid = s0 && (s0.activeBillingProviderId || s0.providerId);
      var vp = (sid && (db0.providers || []).find(function (p) { return p.id === sid; })) || (db0.providers || [])[0];
      if (vp) activeProviderId = vp.id;
      else if (tries++ < 30) { setTimeout(function () { render(sectionId); }, 150); return; }
      else { tries = 0; return; }
    }
    var sec = document.getElementById(sectionId);
    if (!sec) { if (tries++ < 30) { setTimeout(function () { render(sectionId); }, 100); return; } tries = 0; return; }
    tries = 0;
    injectCSS();
    var ctx = context();
    var view;
    kpiN = 0;
    try { view = ctx.cm ? cmView(ctx) : billingView(ctx); }
    catch (e) { console.warn('[CDC] dashboard:', e); view = { alerts: [], body: '<div class="cdd-card">The dashboard could not be prepared. Reload the page.</div>' }; }
    sec.innerHTML = '<div class="cdd"><div class="cdd-top">' + alertsStrip(view.alerts) + tabs(ctx) + '</div>' + view.body + '</div>';
    try { if (typeof _renderLucideIcons === 'function') setTimeout(_renderLucideIcons, 20); } catch (e) {}
  }

  // Specialty switch from the dashboard tabs
  window.cdcDashSwitch = function (name) {
    if (!canSwitch()) { try { toast('You do not have permission to switch specialty.', 'warn'); } catch (e) {} return; }
    var s = getSession(); if (!s) return;
    if (s.role === 'Super Admin') {
      window._saActiveSpecialty = name;
      try { if (typeof _applySpecialtyMenuForSA === 'function') _applySpecialtyMenuForSA(name); } catch (e) {}
    } else {
      setDB(function (db2) { var u = (db2.users || []).find(function (x) { return lc(x.email) === lc(s.email); }); if (u) u.activeSpecialty = name; });
      s.activeSpecialty = name; setSession(s);
      try { applyActiveSpecialty(); } catch (e) {}
    }
    try { toast('Switched to ' + name, 'ok'); } catch (e) {}
    try { go(isCMName(name) ? 'cm-dashboard' : 'dashboard'); } catch (e) {}
    render(isCMName(name) ? 'sec-cm-dashboard' : 'sec-dashboard');
  };

  window.renderDashboard = function () { render('sec-dashboard'); };
  window.renderCMDashboard = function () {
    if (typeof _isCMRole === 'function' && !_isCMRole()) { try { go('dashboard'); } catch (e) {} return; }
    render('sec-cm-dashboard');
  };
})();
