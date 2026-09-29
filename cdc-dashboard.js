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
 * Static layout: the alerts strip has a fixed height, so nothing moves.
 */
(function () {
  'use strict';

  var PALETTE = [
    ['#FF6A3D', '#E8367A'],   // orange -> magenta
    ['#E8367A', '#6A1BDB'],   // magenta -> violet
    ['#6A1BDB', '#00A3D1'],   // violet -> blue
    ['#0B7FA8', '#00A3D1']    // deep blue -> blue
  ];

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
    '.cdd{position:relative;padding:22px 24px 32px;font-family:inherit;color:var(--text,#0B1526)}',
    '.cdd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;min-height:74px}',
    '.cdd-title{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0}',
    '.cdd-sub{font-size:13px;color:var(--text3,#586579);margin-top:4px}',
    /* specialty tabs attached to the top edge, like a ribbon */
    '.cdd-tabs{position:absolute;top:0;right:24px;display:flex;gap:6px;z-index:2}',
    '.cdd-tab{border:0;cursor:pointer;padding:7px 16px 8px;border-radius:0 0 12px 12px;font:700 11.5px/1 inherit;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,#FF6A3D,#E8367A 50%,#6A1BDB);box-shadow:0 6px 16px -8px rgba(232,54,122,.7);transition:opacity .15s,transform .15s}',
    '.cdd-tab.off{background:#8C98AB;box-shadow:none;opacity:.45}',
    '.cdd-tab.off:hover{opacity:.8;transform:translateY(1px)}',
    '.cdd-tab.on{cursor:default}',
    '.cdd-tab[disabled]{cursor:not-allowed}',
    '.cdd-tab[disabled]:hover{opacity:.45;transform:none}',
    '.cdd-date{font-size:12px;color:var(--text3,#586579);text-align:right;padding-top:30px;white-space:nowrap}',
    /* fixed-height alerts strip (static layout) */
    '.cdd-alerts{height:40px;margin:14px 0 16px;display:flex;gap:8px;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}',
    '.cdd-alert{flex-shrink:0;display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.cdd-alert.err{background:#FDE8F0;color:#9C1C4E}.cdd-alert.warn{background:#FFEDE6;color:#8F3314}.cdd-alert.info{background:#F1EAFD;color:#4B1699}.cdd-alert.ok{background:#E3F5FB;color:#065E7C;cursor:default}',
    /* gradient KPI cards */
    '.cdd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}',
    '.cdd-kpi{position:relative;overflow:hidden;border-radius:18px;padding:20px 22px;min-height:132px;color:#fff;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 18px 36px -22px rgba(11,21,38,.55);transition:transform .15s,box-shadow .15s}',
    '.cdd-kpi:hover{transform:translateY(-2px);box-shadow:0 22px 40px -20px rgba(11,21,38,.6)}',
    '.cdd-kpi:after{content:"";position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.12)}',
    '.cdd-kpi .t{font-size:15px;font-weight:600;opacity:.95;text-align:right;position:relative;z-index:1}',
    '.cdd-kpi .row{display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1}',
    '.cdd-kpi .v{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1}',
    '.cdd-kpi .s{font-size:11.5px;opacity:.85;margin-top:6px;text-align:right}',
    '.cdd-kpi svg{opacity:.9}',
    /* panels */
    '.cdd-grid{display:grid;gap:16px;margin-top:16px}',
    '.cdd-g3{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.cdd-g2{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}',
    '.cdd-card{background:var(--bg2,#fff);border:1px solid var(--border,#E4E9F1);border-radius:16px;padding:18px 20px;min-height:220px}',
    '.cdd-card h3{margin:0 0 14px;font-size:14px;font-weight:700}',
    '.cdd-donut{display:flex;align-items:center;gap:22px}',
    '.cdd-donut .big{font-size:30px;font-weight:700;line-height:1}',
    '.cdd-donut .lbl{font-size:13px;color:var(--text3,#586579);margin:2px 0 10px}',
    '.cdd-split{display:flex;gap:18px}',
    '.cdd-split div{border-left:3px solid #E8367A;padding-left:8px}',
    '.cdd-split div.b{border-color:#6A1BDB}',
    '.cdd-split b{display:block;font-size:17px}',
    '.cdd-split small{font-size:11px;color:var(--text3,#586579)}',
    '.cdd-list{max-height:260px;overflow-y:auto}',
    '.cdd-li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border,#EEF1F6);font-size:12.5px}',
    '.cdd-li:last-child{border-bottom:0}',
    '.cdd-empty{font-size:12.5px;color:var(--text3,#586579);padding:14px 0}',
    '.cdd-bar{height:6px;border-radius:4px;background:var(--bg3,#EEF1F6);overflow:hidden;margin-top:6px}',
    '.cdd-bar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#E8367A,#6A1BDB)}',
    '.cdd-pill{padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}',
    '.cdd-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.cdd-tbl th{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3,#586579);text-align:left;padding:0 8px 8px;font-weight:600}',
    '.cdd-tbl td{padding:9px 8px;border-top:1px solid var(--border,#EEF1F6)}',
    '.cdd-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '@media (max-width:1100px){.cdd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cdd-g3,.cdd-g2{grid-template-columns:minmax(0,1fr)}}'
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
  function kpi(i, title, value, sub, icon, route) {
    var g = PALETTE[i % PALETTE.length];
    return '<div class="cdd-kpi" role="button" tabindex="0" onclick="go(\'' + route + '\')" onkeydown="if(event.key===\'Enter\')go(\'' + route + '\')" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' +
      '<div class="t">' + esc(title) + '</div>' +
      '<div class="row">' + ico(icon) + '<div><div class="v">' + esc(value) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div></div></div>';
  }
  function donut(part, total, colorA, colorB) {
    var r = 46, c = 2 * Math.PI * r, pct = total > 0 ? Math.min(1, part / total) : 0;
    return '<svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="cddg' + colorA.slice(1) + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + colorA + '"/><stop offset="1" stop-color="' + colorB + '"/></linearGradient></defs>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--bg3,#EEF1F6)" stroke-width="14"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="url(#cddg' + colorA.slice(1) + ')" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>';
  }
  function alertsStrip(list) {
    if (!list.length) return '<div class="cdd-alerts"><span class="cdd-alert ok">All caught up • no alerts right now</span></div>';
    return '<div class="cdd-alerts">' + list.map(function (a) {
      return '<span class="cdd-alert ' + a.type + '"' + (a.route ? ' role="button" tabindex="0" onclick="go(\'' + a.route + '\')"' : '') + '>' + esc(a.text) + '</span>';
    }).join('') + '</div>';
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
  function header(ctx, title) {
    var d = new Date();
    return '<div class="cdd-head"><div><h1 class="cdd-title">' + esc(title) + '</h1><div class="cdd-sub">' + esc(ctx.prov.name || '') + '</div></div>' +
      '<div class="cdd-date">' + d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</div></div>';
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

    var total = clients.length || 1;
    var statusCard = '<div class="cdd-card"><h3>Client Status</h3><div class="cdd-donut">' + donut(activeClients.length, total, '#E8367A', '#6A1BDB') +
      '<div><div class="big">' + activeClients.length + '</div><div class="lbl">Active clients</div><div class="cdd-split"><div><b>' + activeClients.length + '</b><small>Active</small></div><div class="b"><b>' + discharged.length + '</b><small>Discharged</small></div></div></div></div></div>';
    function unitsCard(title, t, a) {
      var open = Math.max(0, t - a);
      return '<div class="cdd-card"><h3>' + title + '</h3><div class="cdd-donut">' + donut(a, t, '#6A1BDB', '#00A3D1') +
        '<div><div class="big">' + t + '</div><div class="lbl">Total units</div><div class="cdd-split"><div><b>' + open + '</b><small>Open ' + (t ? Math.round(open / t * 100) : 0) + '%</small></div><div class="b"><b>' + a + '</b><small>Approved ' + (t ? Math.round(a / t * 100) : 0) + '%</small></div></div></div></div></div>';
    }
    var recent = mo.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 8);
    var nameOf = function (id) { try { return _cmClientName(id); } catch (e) { return ''; } };
    var recentCard = '<div class="cdd-card"><h3>Recent notes • this month</h3><div class="cdd-list">' + (recent.length ? recent.map(function (n) {
      var st = n.supervisorStatus || 'Pending';
      var col = st === 'Approved' ? 'background:#E3F5FB;color:#065E7C' : st === 'Returned' ? 'background:#FDE8F0;color:#9C1C4E' : 'background:#F1EAFD;color:#4B1699';
      return '<div class="cdd-li"><span><b>' + esc(nameOf(n.clientId)) + '</b> • ' + esc(n.contactType || '') + '</span><span class="cdd-pill" style="' + col + '">' + esc(st) + '</span></div>';
    }).join('') : '<div class="cdd-empty">No notes this month.</div>') + '</div></div>';
    var loadCard = '<div class="cdd-card"><h3>Caseload by care team</h3><div class="cdd-list">' + (team.length ? team.map(function (w) {
      var cnt = activeClients.filter(function (c) { return c.workerId === w.id; }).length, cap = w.capacity || 20, pct = Math.min(100, Math.round(cnt / cap * 100));
      return '<div style="padding:6px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span>' + esc((w.first || '') + ' ' + (w.last || '')) + '</span><b>' + cnt + ' / ' + cap + '</b></div><div class="cdd-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') : '<div class="cdd-empty">No care team members yet.</div>') + '</div></div>';
    var actions = '<div class="cdd-actions" style="margin-top:16px">' +
      '<button class="btn btn-sm" onclick="openCMEncounterModal()">New note</button>' +
      '<button class="btn btn-sm" onclick="openCMIntakeModal()">New referral</button>' +
      '<button class="btn btn-sm" onclick="openCMPlanModal()">New care plan</button>' +
      '<button class="btn btn-sm" onclick="openCMTaskModal()">Add follow-up</button>' +
      '<button class="btn btn-sm" onclick="openCMAuthModal()">Add authorization</button></div>';

    var myWork = '';
    try { if (typeof _cmBuildMyWorkPanel === 'function') myWork = _cmBuildMyWorkPanel(d) || ''; } catch (e) {}
    return header(ctx, ctx.active || 'Case Management') + alertsStrip(alerts) + myWork +
      '<div class="cdd-kpis">' +
        kpi(0, 'Clients', activeClients.length, clients.length + ' total', 'users', 'cm-clients') +
        kpi(1, 'Cases', activeCases.length, 'active care plans', 'brief', 'cm-clients') +
        kpi(2, 'Care Team', team.length, 'active members', 'team', 'cm-workers') +
        kpi(3, 'Documents', docs, 'plans, assessments, files', 'doc', 'cm-clients') +
      '</div>' +
      '<div class="cdd-grid cdd-g3">' + statusCard + unitsCard('Units this week', wkT, wkA) + unitsCard('Units this month', moT, moA) + '</div>' +
      '<div class="cdd-grid cdd-g2">' + recentCard + loadCard + '</div>' + actions;
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
    var paidCt = cnt(function (c) { return c.status === 'paid' || c.status === 'partially_paid' || c.status === 'partial'; });
    var onHold = cnt(function (c) { return c.status === 'on_hold'; });

    var alerts = [];
    if (rejected) alerts.push({ type: 'err', text: rejected + ' rejected or denied claim(s)', route: 'claims' });
    if (pending) alerts.push({ type: 'warn', text: pending + ' claim(s) waiting to be submitted', route: 'claims' });
    if (onHold) alerts.push({ type: 'info', text: onHold + ' claim(s) on hold', route: 'claims' });

    var LABEL = { draft: 'Draft', pending: 'Pending', submitted: 'Submitted', accepted: 'Accepted CH', rejected: 'Rejected', denied: 'Denied', on_hold: 'On Hold', paid: 'Paid', partially_paid: 'Partial', partial: 'Partial', voided: 'Voided', EXTENSION_QUEUED: 'Queued' };
    var COLOR = { paid: '#0A7FA6', partially_paid: '#00A3D1', partial: '#00A3D1', submitted: '#6A1BDB', accepted: '#4B1699', pending: '#FF6A3D', draft: '#8C98AB', rejected: '#B32660', denied: '#B32660', on_hold: '#E8367A' };
    var pill = function (st) { var c = COLOR[st] || '#8C98AB'; return '<span class="cdd-pill" style="background:' + c + '1f;color:' + c + '">' + esc(LABEL[st] || st || '') + '</span>'; };

    var pts = {}; (db.patients || []).forEach(function (p) { pts[p.id] = p; });
    var recent = claims.slice(-8).reverse();
    var recentCard = '<div class="cdd-card"><h3>Recent claims</h3>' + (recent.length ? '<div style="overflow-x:auto"><table class="cdd-tbl"><thead><tr><th>PCN</th><th>Patient</th><th>DOS</th><th>Billed</th><th>Paid</th><th>Status</th></tr></thead><tbody>' +
      recent.map(function (c) {
        var p = pts[c.patId] || {};
        var nm = (typeof ptLinkName === 'function') ? ptLinkName(p.id, p.last || '?', p.first || '?') : esc((p.last || '') + ', ' + (p.first || ''));
        var pd = parseFloat(c.paid) || 0;
        return '<tr><td style="font-family:monospace;font-size:11px;color:var(--text3,#586579)">' + esc(c.pcn || '') + '</td><td style="font-weight:600">' + nm + '</td><td>' + esc(c.dos || '') + '</td><td>' + money(claimTotal(c)) + '</td><td>' + (pd ? money(pd) : '•') + '</td><td>' + pill(c.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cdd-empty">No claims yet. <button class="btn btn-primary btn-sm" onclick="openClaimModal(-1)">New claim</button></div>') + '</div>';

    var ps = {}, pb = {};
    claims.forEach(function (c) { var p = pts[c.patId]; if (!p) return; var k = p.payerName || p.payerid || 'Unknown'; ps[k] = (ps[k] || 0) + (parseFloat(c.paid) || 0); pb[k] = (pb[k] || 0) + claimTotal(c); });
    var payers = Object.keys(pb).sort(function (a, b) { return pb[b] - pb[a]; }).slice(0, 6);
    var payerCard = '<div class="cdd-card"><h3>By payer</h3><div class="cdd-list">' + (payers.length ? payers.map(function (k) {
      var r = pb[k] > 0 ? Math.round(ps[k] / pb[k] * 100) : 0;
      return '<div style="padding:6px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px;gap:10px"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k) + '</b><span style="font-family:monospace;font-weight:700">' + money(ps[k]) + '</span></div>' +
        '<div class="cdd-bar"><i style="width:' + r + '%"></i></div><div style="font-size:10.5px;color:var(--text3,#586579);margin-top:3px">' + r + '% collected of ' + money(pb[k]) + ' billed</div></div>';
    }).join('') : '<div class="cdd-empty">No payer activity yet.</div>') + '</div></div>';

    var ss = {}; claims.forEach(function (c) { ss[c.status] = (ss[c.status] || 0) + 1; });
    var sts = Object.keys(ss).sort(function (a, b) { return ss[b] - ss[a]; });
    var tot = claims.length || 1;
    var statusCard = '<div class="cdd-card"><h3>Collection</h3><div class="cdd-donut">' + donut(paid, billed, '#E8367A', '#6A1BDB') +
      '<div><div class="big">' + pct + '%</div><div class="lbl">collected of ' + money(billed) + '</div><div class="cdd-split"><div><b>' + paidCt + '</b><small>Paid claims</small></div><div class="b"><b>' + submitted + '</b><small>Submitted</small></div></div></div></div>' +
      '<div style="margin-top:14px">' + sts.slice(0, 5).map(function (s) {
        var c = COLOR[s] || '#8C98AB';
        return '<div class="cdd-li"><span style="display:flex;align-items:center;gap:8px"><i style="width:9px;height:9px;border-radius:50%;background:' + c + '"></i>' + esc(LABEL[s] || s) + '</span><b>' + ss[s] + '</b></div>';
      }).join('') + '</div></div>';

    return header(ctx, 'Dashboard') + alertsStrip(alerts) +
      '<div class="cdd-kpis">' +
        kpi(0, 'Total Claims', claims.length, submitted + ' submitted • ' + pending + ' pending', 'file', 'claims') +
        kpi(1, 'Collected', money(paid), pct + '% of ' + money(billed) + ' billed', 'cash', 'eob') +
        kpi(2, 'Pending', pending, 'waiting to be submitted', 'clock', 'claims') +
        kpi(3, 'Submitted', submitted, rejected ? rejected + ' rejected or denied' : 'no rejected claims', 'send', 'claims') +
      '</div>' +
      '<div class="cdd-grid cdd-g2">' + recentCard + '<div style="display:grid;gap:16px">' + payerCard + '</div></div>' +
      '<div class="cdd-grid" style="grid-template-columns:minmax(0,1fr)">' + statusCard + '</div>';
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
    var html;
    try { html = ctx.cm ? cmView(ctx) : billingView(ctx); }
    catch (e) { console.warn('[CDC] dashboard:', e); html = header(ctx, 'Dashboard') + '<div class="cdd-card">The dashboard could not be prepared. Reload the page.</div>'; }
    sec.innerHTML = '<div class="cdd">' + tabs(ctx) + html + '</div>';
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
