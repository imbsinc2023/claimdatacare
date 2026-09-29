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
    '.cdd-kpi{position:relative;overflow:hidden;border-radius:18px;padding:18px 20px;min-height:122px;color:#fff;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 18px 34px -24px rgba(11,21,38,.6);transition:transform .18s,box-shadow .18s}',
    '.cdd-kpi:hover{transform:translateY(-2px);box-shadow:0 22px 40px -22px rgba(11,21,38,.65)}',
    '.cdd-kpi:focus-visible{outline:2px solid #0B1526;outline-offset:3px}',
    '.cdd-kpi:after{content:"";position:absolute;right:-46px;top:-46px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.12);pointer-events:none}',
    '.cdd-kpi:before{content:"";position:absolute;right:30px;bottom:-60px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none}',
    '.cdd-kpi .hd{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:10px}',
    '.cdd-kpi .t{font-size:13px;font-weight:600;opacity:.92}',
    '.cdd-kpi .ic{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);flex-shrink:0}',
    '.cdd-kpi .v{position:relative;z-index:1;font-size:32px;font-weight:700;letter-spacing:-.02em;line-height:1.05;margin-top:8px}',
    '.cdd-kpi .s{position:relative;z-index:1;font-size:11.5px;opacity:.85;margin-top:4px}',
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
    '.cdd-rev-body{display:flex;align-items:center;gap:22px;flex-wrap:wrap}',
    '.cdd-rings{position:relative;width:280px;height:280px;flex-shrink:0;margin:0 auto}',
    '.cdd-rings svg{display:block}',
    '.cdd-arc{animation:cddArc 1.1s cubic-bezier(.2,.8,.2,1) both}',
    '@keyframes cddArc{from{stroke-dasharray:0 1200}}',
    '.cdd-rings .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none}',
    '.cdd-rings .ctr b{font-size:32px;font-weight:700;letter-spacing:-.03em;line-height:1;color:#0B1526}',
    '.cdd-rings .ctr span{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);margin-top:4px}',
    '.cdd-rings .ctr em{font-style:normal;font-size:11.5px;color:var(--text2,#3A475C);margin-top:6px}',
    '.cdd-leg{flex:1;min-width:230px;display:flex;flex-direction:column;gap:10px}',
    '.cdd-leg-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:4px 10px;align-items:center}',
    '.cdd-leg-row i{width:10px;height:10px;border-radius:3px}',
    '.cdd-leg-row .n{font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cdd-leg-row .a{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}',
    '.cdd-leg-row .d{grid-column:2 / 4;display:flex;justify-content:space-between;font-size:11px;color:var(--text3,#586579)}',
    '.cdd-leg-row .d b{font-weight:700;color:var(--text2,#3A475C)}',
    '.cdd-stat{margin-top:18px;padding-top:14px;border-top:1px solid var(--border,#EEF1F6)}',
    '.cdd-stat-bar{display:flex;height:10px;border-radius:6px;overflow:hidden;background:#EEF1F6;gap:2px}',
    '.cdd-stat-bar i{display:block;height:100%}',
    '.cdd-stat-leg{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:11.5px;color:var(--text2,#3A475C)}',
    '.cdd-stat-leg span{display:flex;align-items:center;gap:6px}',
    '.cdd-stat-leg i{width:8px;height:8px;border-radius:50%}',
    '.cdd-stat-leg b{font-weight:700;color:#0B1526}',
    '@media (max-width:1100px){.cdd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cdd-g2{grid-template-columns:minmax(0,1fr)}}',
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
  function ico(k) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + '</svg>'; }
  var GRAD = [
    'linear-gradient(135deg,#FF6A3D 0%,#D45C37 100%)',   // IMBS orange
    'linear-gradient(135deg,#0B1526 0%,#24365A 100%)',   // ink navy
    'linear-gradient(135deg,#6A1BDB 0%,#00A3D1 100%)',   // violet to blue
    'linear-gradient(135deg,#0B7FA8 0%,#00A3D1 100%)'    // deep blue to blue
  ];
  var kpiN = 0;
  function kpi(title, value, sub, icon, route) {
    var g = GRAD[kpiN++ % GRAD.length];
    return '<div class="cdd-kpi" role="button" tabindex="0" style="background:' + g + '" onclick="go(\'' + route + '\')" onkeydown="if(event.key===\'Enter\')go(\'' + route + '\')">' +
      '<div class="hd"><span class="t">' + esc(title) + '</span><span class="ic">' + ico(icon) + '</span></div>' +
      '<div class="v">' + esc(value) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>';
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
  var RING = ['#FF6A3D', '#00A3D1', '#6A1BDB', '#0B1526', '#B8461F'];
  var SCOL = { ok: '#00A3D1', att: '#FF6A3D', neu: '#8C98AB' };

  function tableCard(title, heads, rows, empty) {
    return '<div class="cdd-card"><h3>' + esc(title) + '</h3>' + (rows.length ?
      '<div style="overflow-x:auto"><table class="cdd-tbl"><thead><tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
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
    var svg = '<svg width="280" height="280" viewBox="0 0 280 280" aria-hidden="true">';
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
    var legend = '<div class="cdd-leg">' + (items.length ? items.map(function (x, i) {
      var pc = x.total > 0 ? Math.round(x.part / x.total * 100) : 0;
      return '<div class="cdd-leg-row"><i style="background:' + RING[i % RING.length] + '"></i><span class="n" title="' + esc(x.name) + '">' + esc(x.name) + '</span><span class="a">' + esc(x.partTxt) + '</span>' +
        '<div class="d"><span>' + esc(x.totalTxt) + (x.note ? ' • ' + esc(x.note) : '') + '</span><b>' + pc + '%</b></div></div>';
    }).join('') : '<div class="cdd-empty">' + esc(o.empty) + '</div>') + '</div>';
    var st = o.status.filter(function (x) { return x.count > 0; }), tot = st.reduce(function (a, x) { return a + x.count; }, 0) || 1;
    var stat = '<div class="cdd-stat"><div class="cdd-stat-bar">' + st.map(function (x) {
        return '<i style="width:' + (x.count / tot * 100).toFixed(2) + '%;background:' + SCOL[x.tone] + '" title="' + esc(x.label) + ': ' + x.count + '"></i>';
      }).join('') + '</div><div class="cdd-stat-leg">' + (st.length ? st.map(function (x) {
        return '<span><i style="background:' + SCOL[x.tone] + '"></i>' + esc(x.label) + ' <b>' + x.count + '</b></span>';
      }).join('') : '<span>' + esc(o.statusEmpty) + '</span>') + '</div></div>';
    return '<div class="cdd-card cdd-rev"><div class="cdd-rev-hd"><h3>' + esc(o.title) + '</h3><small>' + esc(o.hint) + '</small></div>' +
      '<div class="cdd-rev-body">' + rings + legend + '</div>' + stat + '</div>';
  }

  function layout(alerts, kpis, table, rings) {
    return { alerts: alerts, body: '<div class="cdd-kpis">' + kpis.join('') + '</div>' + '<div class="cdd-grid cdd-g2">' + table + rings + '</div>' };
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
      return { name: workerName(w), total: t, part: ap, totalTxt: fmtU(t) + ' this month', partTxt: fmtU(ap), note: 'caseload ' + cnt + '/' + (w.capacity || 20) };
    }).sort(function (x, y) { return y.total - x.total; });
    var moPct = moT > 0 ? Math.round(moA / moT * 100) : 0;
    var nst = { Approved: 0, Pending: 0, Returned: 0 };
    mo.forEach(function (n) { var k = n.supervisorStatus || 'Pending'; nst[k] = (nst[k] || 0) + 1; });
    var rings = ringsCard({
      title: 'Units by care team', hint: 'ring = units this month • solid = approved',
      items: items, fmt: fmtU, otherName: 'Other members',
      big: moPct + '%', bigLabel: 'approved', bigSub: moA + ' of ' + moT + ' units • week ' + wkA + '/' + wkT,
      empty: 'No care team members yet.',
      status: Object.keys(nst).map(function (k) { return { label: k, count: nst[k], tone: NTONE[k] || 'neu' }; }),
      statusEmpty: 'No notes this month.'
    });

    return layout(alerts, [
      kpi('Clients', activeClients.length, clients.length + ' total • ' + discharged.length + ' discharged', 'users', 'cm-clients'),
      kpi('Cases', activeCases.length, 'active care plans', 'brief', 'cm-clients'),
      kpi('Care Team', team.length, 'active members', 'team', 'cm-workers'),
      kpi('Documents', docs, 'plans, assessments, files', 'doc', 'cm-clients')
    ], table, rings);
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
      return ['<span style="font-family:var(--mono,monospace);font-size:11px;color:var(--text3,#586579)">' + esc(c.pcn || '') + '</span>', '<b>' + nm + '</b>', esc(c.dos || ''), money(claimTotal(c)), pd ? money(pd) : '•', pill(c.status)];
    }), '') : tableCard('Recent claims', [], [], 'No claims yet. <button class="btn btn-primary btn-sm" onclick="openClaimModal(-1)">New claim</button>');

    // rings: billed vs collected per payer
    var ps = {}, pb = {};
    claims.forEach(function (c) { var p = pts[c.patId]; if (!p) return; var k = p.payerName || p.payerid || 'Unknown'; ps[k] = (ps[k] || 0) + (parseFloat(c.paid) || 0); pb[k] = (pb[k] || 0) + claimTotal(c); });
    var items = Object.keys(pb).map(function (k) { return { name: k, total: pb[k], part: ps[k] || 0, totalTxt: money(pb[k]) + ' billed', partTxt: money(ps[k] || 0), note: '' }; })
      .sort(function (x, y) { return y.total - x.total; });
    var ss = {}; claims.forEach(function (c) { ss[c.status] = (ss[c.status] || 0) + 1; });
    var rings = ringsCard({
      title: 'Revenue by payer', hint: 'ring = billed • solid = collected',
      items: items, fmt: money, otherName: 'Other payers',
      big: pct + '%', bigLabel: 'collected', bigSub: money(paid) + ' of ' + money(billed),
      empty: 'No payer activity yet.',
      status: Object.keys(ss).sort(function (x, y) { return ss[y] - ss[x]; }).map(function (k) { return { label: LABEL[k] || k, count: ss[k], tone: tone(k) }; }),
      statusEmpty: 'No claims yet.'
    });

    return layout(alerts, [
      kpi('Total Claims', claims.length, submitted + ' submitted • ' + pending + ' pending', 'file', 'claims'),
      kpi('Collected', money(paid), pct + '% of ' + money(billed) + ' billed', 'cash', 'eob'),
      kpi('Pending', pending, 'waiting to be submitted', 'clock', 'claims'),
      kpi('Submitted', submitted, rejected ? rejected + ' rejected or denied' : 'no rejected claims', 'send', 'claims')
    ], table, rings);
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
    try { _renderTopnavSpecialtyChip(); } catch (e) {}
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
