/*
 * ClaimDataCare  •  Patient file (one window for patients and clients)
 * File: cdc-chart.js  •  v1.0
 *
 * Replaces openPatientChart, _buildChartShell, _renderChartTab, _refreshChartBanner,
 * _buildApptTab and _processDocFiles from script1.js.
 *   • One window for opening an existing record and for creating a new one (New patient opens
 *     the same file at Info; the other steps unlock after the first Save)
 *   • Title bar like every window; menu on the right as a vertical progress list
 *     (required steps, optional steps, counts); Save / Cancel at the bottom right on Info
 *   • Schedule: every appointment of the patient in a paged table; Visits (was Encounters)
 *   • Records: 1 MB limit per document, with an option to reduce larger images and PDFs
 */
(function () {
  'use strict';
  var MAXDOC = 1024 * 1024;
  var current = null;   // record shown (saved patient, or the unsaved draft)

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci"></i>'; }
  function icons() { try { setTimeout(_renderLucideIcons, 20); } catch (e) {} }
  function term() { return typeof cdcPersonTerm === 'function' ? cdcPersonTerm() : 'Patient'; }
  function age(d) { try { return typeof _calcAge === 'function' ? _calcAge(d) : ''; } catch (e) { return ''; } }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  var STEPS = [
    { id: 'summary', label: 'Overview', icon: 'layout-dashboard', kind: 'view' },
    { id: 'demographics', label: 'Info', icon: 'user', kind: 'req' },
    { id: 'insurance', label: 'Coverage', icon: 'shield-check', kind: 'req' },
    { id: 'auth', label: 'Authorization', icon: 'key-round', kind: 'opt' },
    { id: 'contacts', label: 'Contacts', icon: 'contact', kind: 'opt' },
    { id: 'appointments', label: 'Schedule', icon: 'calendar-days', kind: 'count' },
    { id: 'documents', label: 'Records', icon: 'folder-open', kind: 'count' },
    { id: 'encounters', label: 'Visits', icon: 'stethoscope', kind: 'count' },
    { id: 'bills', label: 'Claims', icon: 'receipt', kind: 'count' },
    { id: 'communication', label: 'Messaging', icon: 'message-circle', kind: 'opt' },
    { id: 'pharmacies', label: 'Pharmacies', icon: 'pill', kind: 'auto' }
  ];

  var CSS = [
    '.pcf{position:absolute;inset:0;z-index:500;display:flex;align-items:stretch;justify-content:center;padding:14px;background:rgba(11,21,38,.06)}',
    '.pcf-win{flex:1;min-width:0;display:flex;flex-direction:column;background:#fff;border:1px solid #E4E9F1;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -36px rgba(11,21,38,.45)}',
    /* title bar of the patient file: a dark folder with a tab, like a physical chart */
    '.pcf-hd{position:relative;flex:none;display:flex;align-items:flex-end;gap:0;height:56px;padding:0 10px 0 14px;background:linear-gradient(180deg,#14213A,#0B1526);color:#fff}',
    '.pcf-hd:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,#FF6A3D,#7B2FF7 38%,#00A3D1 72%,#E8367A)}',
    '.pcf-tab{position:relative;z-index:1;display:flex;align-items:center;gap:8px;height:42px;padding:0 18px 0 14px;margin-right:14px;border-radius:12px 12px 0 0;background:linear-gradient(180deg,#FF8A5B,#FF6A3D);color:#fff;font-size:14px;font-weight:700;letter-spacing:.01em;box-shadow:0 -6px 16px -10px rgba(255,106,61,.8)}',
    '.pcf-tab:after{content:"";position:absolute;right:-14px;bottom:0;width:14px;height:14px;background:radial-gradient(circle at 100% 0,transparent 13px,#FF6A3D 14px)}',
    '.pcf-tab .lci{width:17px!important;height:17px!important}',
    '.pcf-meta{display:flex;align-items:center;gap:0;height:56px;min-width:0;overflow:hidden}',
    '.pcf-mi{display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:22px;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.92);white-space:nowrap}',
    '.pcf-mi+.pcf-mi{border-left:1px solid rgba(255,255,255,.18)}',
    '.pcf-mi .lci{width:13px!important;height:13px!important;color:#FFB199}',
    '.pcf-mi.st b{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3DDC97;box-shadow:0 0 0 3px rgba(61,220,151,.2)}',
    '.pcf-mi.st.off b{background:#8C98AB;box-shadow:none}',
    '.pcf-act{display:flex;align-items:center;gap:4px;height:56px}',
    '.pcf-x{width:34px;height:34px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s}',
    '.pcf-x:hover{background:rgba(255,106,61,.85)}',
    '.pcf-sp{flex:1}',
    '.pcf-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 264px}',
    '.pcf-main{min-width:0;min-height:0;overflow-y:auto;padding:14px 16px;background:#F8FAFC;display:flex;flex-direction:column}',
    '.pcf-main > *{flex:none}',
    '.pcf-main > #pcd-root{flex:1 1 auto}',
    /* the progress menu */
    '.pcf-nav{min-height:0;overflow-y:auto;border-left:1px solid #E4E9F1;background:linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%);padding:16px 14px;display:flex;flex-direction:column;gap:12px}',
    '.pcf-req{display:flex;align-items:center;gap:8px;padding:2px 6px 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579}',
    '.pcf-req i{flex:1;height:6px;border-radius:999px;background:#E4E9F1;font-style:normal}',
    '.pcf-req i.ok{background:linear-gradient(90deg,#00A3D1,#7B2FF7)}',
    '.pcf-req span{font-variant-numeric:tabular-nums;color:#0B1526}',
    '.pcf-steps{position:relative;display:flex;flex-direction:column;gap:4px}',
    /* connector line of the timeline: grey, coloured up to the steps already done */
    '.pcf-step:not(:last-child):before{content:"";position:absolute;left:24px;top:38px;bottom:-12px;width:2px;background:#E4E9F1;z-index:0}',
    '.pcf-step.done:not(:last-child):before{background:linear-gradient(180deg,#00A3D1,#7B2FF7)}',
    '.pcf-step{position:relative;display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:12px;cursor:pointer;transition:background-color .15s}',
    '.pcf-step:hover{background:#F1F4F8}',
    '.pcf-step .dot{position:relative;z-index:1;width:30px;height:30px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff;border:1.5px solid #D5DCE7;color:#586579;transition:background-color .15s,border-color .15s,color .15s}',
    '.pcf-step .dot .lci{width:14px!important;height:14px!important}',
    '.pcf-step .tx{min-width:0;display:flex;flex-direction:column}',
    '.pcf-step .tx b{font-size:12.5px;font-weight:700;color:#0B1526}',
    '.pcf-step .tx span{font-size:10.5px;color:#8C98AB}',
    '.pcf-step .ct{margin-left:auto;min-width:22px;height:20px;padding:0 7px;border-radius:999px;background:#EEF1F6;color:#586579;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center}',
    '.pcf-step.done .dot{background:#00A3D1;border-color:#00A3D1;color:#fff}',
    '.pcf-step.done .tx span{color:#007FA3}',
    '.pcf-step.need .tx span{color:#C8286A;font-weight:600}',
    '.pcf-step.on{background:#fff;box-shadow:0 8px 20px -14px rgba(11,21,38,.45),inset 3px 0 0 #FF6A3D}',
    '.pcf-step.on .dot{background:#FF6A3D;border-color:#FF6A3D;color:#fff;box-shadow:0 0 0 4px rgba(255,106,61,.15)}',
    '.pcf-step.lock{cursor:not-allowed;opacity:.45}',
    '.pcf-step.lock:hover{background:transparent}',
    '.pcf-empty{padding:40px 20px;text-align:center;color:#586579;font-size:13px;background:#fff;border:1px solid #E4E9F1;border-radius:14px}',
    '.pcf-empty b{display:block;font-size:15px;color:#0B1526;margin:8px 0 4px}',
    '.pcf-empty .lci{color:#8C98AB}',
    /* schedule table */
    '.pcf-card{background:#fff;border:1px solid #E4E9F1;border-radius:14px;overflow:hidden}',
    '.pcf-card-hd{display:flex;align-items:center;gap:10px;height:48px;padding:0 14px;border-bottom:1px solid #EEF1F6}',
    '.pcf-card-hd h4{margin:0;font-size:13px;font-weight:700;color:#0B1526}',
    '.pcf-card-hd small{font-size:11.5px;color:#586579}',
    '.pcf-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.pcf-tbl th{height:36px;padding:0 12px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;background:#F8FAFC;border-bottom:1px solid #EEF1F6}',
    '.pcf-tbl td{height:40px;padding:0 12px;border-bottom:1px solid #F1F4F8;white-space:nowrap}',
    '.pcf-tbl tbody tr:hover{background:#F8FAFC}',
    '.pcf-st{display:inline-block;padding:2px 9px;border-radius:999px;font-size:10.5px;font-weight:700}',
    '.pcf-pg{display:flex;align-items:center;gap:6px;margin-left:auto}',
    '.pcf-pg span{font-size:11.5px;color:#586579;min-width:96px;text-align:right}',
    '.pcf-pg button{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.pcf-pg button[disabled]{opacity:.35;cursor:default}',
    '@media (max-width:1100px){.pcf-body{grid-template-columns:minmax(0,1fr) 210px}}'
  ].join('\n');
  function css() { if (document.getElementById('pcf-style')) return; var s = document.createElement('style'); s.id = 'pcf-style'; s.textContent = CSS; document.head.appendChild(s); }

  function counts(p) {
    var db = getDB();
    var appts = 0; try { appts = (getAppts() || []).filter(function (a) { return (a.patients || []).some(function (x) { return x.patId === p.id; }); }).length; } catch (e) {}
    return {
      appointments: appts,
      documents: (p.documents || []).filter(function (d) { return !d.deleted && !d.trashed; }).length,
      encounters: (db.notes || []).filter(function (n) { return n.patId === p.id; }).length,
      bills: (db.claims || []).filter(function (c) { return c.patId === p.id; }).length
    };
  }
  function stepState(st, p, c) {
    if (p._draft) return st.id === 'demographics' ? { cls: 'need', txt: 'Required • not saved yet' } : { cls: 'lock', txt: 'After saving Info' };
    if (st.id === 'demographics') { var ok = p.last && p.first && p.dob && p.addr1 && p.zip && p.phone; return ok ? { cls: 'done', txt: 'Complete' } : { cls: 'need', txt: 'Required • incomplete' }; }
    if (st.id === 'insurance') { var cov = (p.insurances || []).length || p.selfPay; return cov ? { cls: 'done', txt: (p.insurances || []).length ? (p.insurances.length + ' plan' + (p.insurances.length > 1 ? 's' : '')) : 'Self pay' } : { cls: 'need', txt: 'Required • primary, secondary, tertiary or self pay' }; }
    if (st.kind === 'opt') return { cls: '', txt: 'Optional' };
    if (st.kind === 'auto') return { cls: '', txt: 'Added automatically' };
    if (st.kind === 'view') return { cls: '', txt: 'Summary of the file' };
    var n = c[st.id] || 0;
    return { cls: n ? 'done' : '', txt: n ? n + ' on file' : 'None yet', ct: n };
  }
  function navHTML(p) {
    var c = p._draft ? {} : counts(p);
    var req = STEPS.filter(function (s) { return s.kind === 'req'; }), done = req.filter(function (s) { return stepState(s, p, c).cls === 'done'; }).length;
    return '<div class="pcf-req">Required' + req.map(function (r) { return '<i class="' + (stepState(r, p, c).cls === 'done' ? 'ok' : '') + '"></i>'; }).join('') + '<span>' + done + '/' + req.length + '</span></div>' +
      '<div class="pcf-steps">' + STEPS.map(function (s, i) {
        var stt = stepState(s, p, c), on = s.id === _chartTabActive;
        var dotIcon = stt.cls === 'done' && !on ? 'check' : stt.cls === 'lock' ? 'lock' : s.icon;
        return '<div class="pcf-step ' + stt.cls + (on ? ' on' : '') + '" role="button" tabindex="0"' + (stt.cls === 'lock' ? '' : ' onclick="_renderChartTab(\'' + s.id + '\')"') + '>' +
          '<span class="dot">' + ico(dotIcon, 14) + '</span><span class="tx"><b>' + s.label + '</b><span>' + esc(stt.txt) + '</span></span>' +
          (stt.ct ? '<span class="ct">' + stt.ct + '</span>' : '') + '</div>';
      }).join('') + '</div>';
  }
  function headHTML(p) {
    var T = term(), a = age(p.dob), sx = p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : p.sex === 'O' ? 'Other' : '';
    // gender symbols drawn inline (not in this icon set)
    var sxSvg = p.sex === 'M' ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFB199" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/></svg>'
      : p.sex === 'F' ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#FFB199" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>' : ico('circle-user', 13);
    var meta = p._draft ? '' :
      '<span class="pcf-mi">' + ico('hash', 13) + esc(p.acct || '') + '</span>' +
      '<span class="pcf-mi">' + ico('user', 13) + esc((p.last || '').toUpperCase() + ', ' + (p.first || '').toUpperCase()) + '</span>' +
      (a !== '' && a != null ? '<span class="pcf-mi">' + ico('cake', 13) + a + ' yrs</span>' : '') +
      (sx ? '<span class="pcf-mi">' + sxSvg + sx + '</span>' : '') +
      '<span class="pcf-mi st' + (p.inactive ? ' off' : '') + '"><b></b>' + (p.inactive ? 'Inactive' : 'Active') + '</span>';
    return '<span class="pcf-tab">' + ico('folder-open', 17) + (p._draft ? 'New ' + T.toLowerCase() : T + ' file') + '</span>' +
      '<div class="pcf-meta">' + meta + '</div><span class="pcf-sp"></span>' +
      '<div class="pcf-act">' + (!p._draft ? '<button type="button" class="pcf-x" data-tip="Export file to PDF" aria-label="Export file to PDF" onclick="_exportPatientPDF(\'' + esc(p.id) + '\')">' + ico('file-down', 17) + '</button>' : '') +
      '<button type="button" class="pcf-x" data-tip="Close" aria-label="Close" onclick="cdcCloseChart()">' + ico('x', 18) + '</button></div>';
  }
  function footHTML(tab) {
    if (tab !== 'demographics') return '<span class="sum" id="pcf-hint">' + (current && current._draft ? '' : 'Choose a section on the right. Required: Info and Coverage.') + '</span>';
    return '<span class="sum pcd-msg" id="pcd-msg" role="status">' + (current && current._draft ? 'Nothing is saved until you press Save with the required fields complete.' : '') + '</span>' +
      '<button type="button" class="cdc-no" onclick="cdcChartCancel()">' + ico('x', 15) + 'Cancel</button>' +
      '<button type="button" class="cdc-ok" id="pcd-save" onclick="_saveDemoTab(\'' + esc(current.id) + '\')">' + ico('save', 15) + 'Save</button>';
  }

  function mount(p, tab) {
    css();
    current = p;
    var old = document.getElementById('pt-chart-overlay'); if (old) old.remove();
    var ov = document.createElement('div'); ov.className = 'pcf pt-chart-overlay'; ov.id = 'pt-chart-overlay';
    ov.innerHTML = '<div class="pcf-win"><div class="pcf-hd" id="pcf-hd">' + headHTML(p) + '</div>' +
      '<div class="pcf-body"><div class="pcf-main" id="pt-main"></div><nav class="pcf-nav" id="pcf-nav" aria-label="' + esc(term()) + ' file"></nav></div>' +
      '<div class="cdc-ftr" id="pcf-ftr"></div></div>';
    (document.querySelector('.main') || document.querySelector('.app-shell') || document.body).appendChild(ov);
    _renderChartTab(tab || (p._draft ? 'demographics' : 'summary'));
  }

  window.openPatientChart = function (patId, tab) {
    var p = (getDB().patients || []).find(function (x) { return x.id === patId; });
    if (!p) { try { toast(term() + ' not found', 'err'); } catch (e) {} return; }
    try { if (typeof cdcDemoClearDraft === 'function') cdcDemoClearDraft(); } catch (e) {}
    _chartPatId = patId;
    try { _trackRecentPatient(patId); } catch (e) {}
    mount(p, tab);
  };
  window.cdcOpenChartDraft = function (draft) { _chartPatId = draft.id; mount(draft, 'demographics'); };
  window.cdcCloseChart = function () {
    try { if (typeof cdcDemoClearDraft === 'function') cdcDemoClearDraft(); } catch (e) {}
    current = null; var o = document.getElementById('pt-chart-overlay'); if (o) o.remove();
  };
  window.cdcChartCancel = function () {
    if (current && current._draft) { cdcCloseChart(); return; }
    _renderChartTab('demographics');
    var m = document.getElementById('pcd-msg'); if (m) m.textContent = 'Changes discarded';
  };
  window._refreshChartBanner = function (patId) {
    var p = (getDB().patients || []).find(function (x) { return x.id === patId; }); if (!p) return;
    current = p;
    var hd = document.getElementById('pcf-hd'); if (hd) hd.innerHTML = headHTML(p);
    var nav = document.getElementById('pcf-nav'); if (nav) nav.innerHTML = navHTML(p);
  };

  window._renderChartTab = function (tabId) {
    var main = document.getElementById('pt-main'); if (!main) return;
    var db = getDB();
    var p = current && current._draft ? current : (db.patients || []).find(function (x) { return x.id === _chartPatId; });
    if (!p) return;
    if (p._draft && tabId !== 'demographics') tabId = 'demographics';
    current = p; _chartTabActive = tabId;
    var empty = function (icon, title, text) { return '<div class="pcf-empty">' + ico(icon, 30) + '<b>' + title + '</b>' + text + '</div>'; };
    var html = '';
    try {
      switch (tabId) {
        case 'summary': html = _buildSummaryTab(p, db); break;
        case 'demographics': html = _buildDemoTab(p, db); break;
        case 'insurance': html = _buildInsuranceTab(p, db); break;
        case 'auth': html = _buildAuthTab(p, db); break;
        case 'appointments': html = _buildApptTab(p, db); break;
        case 'bills': html = _buildBillsTab(p, db); break;
        case 'documents': html = _buildDocumentsTab(p, db); break;
        case 'encounters': html = _buildEncountersTab(p, db); break;
        case 'contacts': html = empty('contact', 'Contacts', 'Emergency contacts, guardians and responsible parties will be listed here.'); break;
        case 'communication': html = empty('message-circle', 'Messaging', 'Internal messages about this ' + term().toLowerCase() + ' between your team.'); break;
        case 'pharmacies': html = empty('pill', 'Pharmacies', 'Pharmacies are added automatically from prescriptions. This module is coming next.'); break;
        default: html = empty('construction', tabId, 'Not available yet.');
      }
    } catch (e) { html = empty('alert-triangle', 'This section could not be shown', String(e && e.message || e)); }
    main.innerHTML = html;
    main.scrollTop = 0;
    var nav = document.getElementById('pcf-nav'); if (nav) nav.innerHTML = navHTML(p);
    var ft = document.getElementById('pcf-ftr'); if (ft) ft.innerHTML = footHTML(tabId);
    icons();
  };

  /* ---------------- Schedule: every appointment, paged ---------------- */
  var AP = { page: 0, size: 12 };
  window._apptPage = function (n) { AP.page = n; _renderChartTab('appointments'); };
  window._buildApptTab = function (pat, db) {
    var appts = []; try { appts = (getAppts() || []).filter(function (a) { return (a.patients || []).some(function (x) { return x.patId === pat.id; }); }); } catch (e) {}
    appts.sort(function (a, b) { return (b.date + (b.startTime || '')) > (a.date + (a.startTime || '')) ? 1 : -1; });
    var head = '<div class="pcf-card-hd"><h4>Appointments</h4><small>' + appts.length + ' total</small>' +
      '<button type="button" class="cdc-ok" style="margin-left:12px;height:30px;min-width:0" onclick="cdcCloseChart();go(\'appointments\')">' + ico('calendar-plus', 14) + 'New appointment</button>';
    if (!appts.length) return '<div class="pcf-card">' + head + '</div><div class="pcf-empty" style="border:0">' + ico('calendar-days', 30) + '<b>No appointments yet</b>Appointments for this ' + term().toLowerCase() + ' will be listed here.</div></div>';
    var pages = Math.max(1, Math.ceil(appts.length / AP.size)); if (AP.page >= pages) AP.page = pages - 1;
    var view = appts.slice(AP.page * AP.size, (AP.page + 1) * AP.size), today = new Date().toISOString().slice(0, 10);
    var a1 = AP.page * AP.size + 1, a2 = Math.min(appts.length, (AP.page + 1) * AP.size);
    head += '<div class="pcf-pg"><span>' + a1 + '\u2013' + a2 + ' of ' + appts.length + '</span>' +
      '<button type="button" aria-label="Previous page"' + (AP.page <= 0 ? ' disabled' : ' onclick="_apptPage(' + (AP.page - 1) + ')"') + '>' + ico('chevron-left', 14) + '</button>' +
      '<button type="button" aria-label="Next page"' + (AP.page >= pages - 1 ? ' disabled' : ' onclick="_apptPage(' + (AP.page + 1) + ')"') + '>' + ico('chevron-right', 14) + '</button></div></div>';
    var ST = typeof APPT_STATUS !== 'undefined' ? APPT_STATUS : {};
    return '<div class="pcf-card">' + head + '<table class="pcf-tbl"><thead><tr><th>Date</th><th>Time</th><th>Provider</th><th>Service group</th><th>Status</th><th></th></tr></thead><tbody>' +
      view.map(function (a) {
        var rend = (db.rendering || []).find(function (r) { return r.id === a.renderingId; }) || {};
        var sg = (db.serviceGroups || []).find(function (g) { return g.id === a.sgId; }) || {};
        var me = (a.patients || []).find(function (x) { return x.patId === pat.id; }) || {};
        var st = ST[me.status || a.status] || { label: me.status || a.status || '', color: '#586579', bg: '#EEF1F6' };
        return '<tr><td style="font-weight:700">' + esc(a.date || '') + '</td><td>' + esc(a.startTime || '') + '</td><td>' + esc(rend.last ? rend.last + ', ' + rend.first : '') + '</td><td>' + esc(sg.name || '') + '</td>' +
          '<td><span class="pcf-st" style="background:' + (st.bg || '#EEF1F6') + ';color:' + (st.color || '#586579') + '">' + esc(st.label || '') + '</span></td>' +
          '<td style="color:#8C98AB;font-size:11.5px">' + (a.date > today ? 'Upcoming' : a.date === today ? 'Today' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  /* ---------------- Records: 1 MB per document, with the option to reduce ---------------- */
  function readAsDataURL(f) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function (e) { ok(e.target.result); }; r.onerror = ko; r.readAsDataURL(f); }); }
  function dataSize(d) { var i = d.indexOf(','); return Math.floor((d.length - i - 1) * 3 / 4); }
  function loadImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ko; i.src = src; }); }
  async function shrinkImage(data) {
    var img = await loadImg(data), scale = Math.min(1, 2000 / Math.max(img.width, img.height)), q = 0.82, out = data;
    for (var k = 0; k < 8; k++) {
      var c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      out = c.toDataURL('image/jpeg', q);
      if (dataSize(out) <= MAXDOC) return out;
      q = Math.max(0.45, q - 0.1); scale *= 0.85;
    }
    return out;
  }
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {} ok(window.pdfjsLib); };
      s.onerror = ko; document.head.appendChild(s);
    });
  }
  // a large PDF is rebuilt as compressed page images (readable, much lighter)
  async function shrinkPdf(data) {
    var lib = await loadPdfJs(), bytes = Uint8Array.from(atob(data.split(',')[1]), function (c) { return c.charCodeAt(0); });
    var pdf = await lib.getDocument({ data: bytes }).promise, q = 0.7, scale = 1.4, out = data;
    for (var k = 0; k < 4; k++) {
      var jsPDF = window.jspdf.jsPDF, doc = null;
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i), vp = page.getViewport({ scale: scale }), c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        var w = vp.width / scale * 0.75, h = vp.height / scale * 0.75;   // points
        if (!doc) doc = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' }); else doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
        doc.addImage(c.toDataURL('image/jpeg', q), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      }
      out = doc.output('datauristring');
      if (dataSize(out) <= MAXDOC) return out;
      q = Math.max(0.4, q - 0.12); scale = Math.max(0.9, scale - 0.2);
    }
    return out;
  }
  window._processDocFiles = async function (patId, files) {
    if (!files || !files.length) return;
    var cat = window._docUploadCat || window._docActiveCat || 'External Documents';
    var today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    var s = getSession(), by = s ? (s.name || s.email) : 'Staff', added = 0;
    for (var n = 0; n < files.length; n++) {
      var file = files[n], data = await readAsDataURL(file), size = file.size, name = file.name;
      if (size > MAXDOC) {
        var isImg = /^image\//.test(file.type), isPdf = /pdf/.test(file.type) || /\.pdf$/i.test(name);
        if (!isImg && !isPdf) { await cdcConfirm(name + ' is ' + kb(size) + '. The limit is 1 MB per document and this type of file cannot be reduced here.', { title: 'File too large', confirmText: 'OK', danger: false }); continue; }
        var ok = await cdcConfirm(name + ' is ' + kb(size) + '. The limit is 1 MB per document so the database stays light.\n\nReduce it now? ' + (isPdf ? 'The PDF is rebuilt as compressed page images.' : 'The image is resized and compressed.'), { title: 'File larger than 1 MB', confirmText: 'Reduce and upload', danger: false });
        if (!ok) continue;
        try {
          var m = document.getElementById('pcf-hint'); if (m) m.textContent = 'Reducing ' + name + '...';
          data = isPdf ? await shrinkPdf(data) : await shrinkImage(data);
          size = dataSize(data);
          if (!isPdf) name = name.replace(/\.(png|gif|bmp|webp|tiff?|heic|jpe?g)$/i, '') + '.jpg';
          if (m) m.textContent = '';
        } catch (e) { await cdcConfirm('The file could not be reduced (' + (e && e.message || e) + ').', { title: 'Could not reduce', confirmText: 'OK', danger: false }); continue; }
        if (size > MAXDOC) { await cdcConfirm(name + ' is still ' + kb(size) + ' after reducing it. Split the document in smaller parts and upload them separately.', { title: 'Still larger than 1 MB', confirmText: 'OK', danger: false }); continue; }
      }
      var doc = { id: uid(), name: name, category: cat, type: /\.jpg$/.test(name) && size !== file.size ? 'image/jpeg' : (file.type || name.split('.').pop()), size: size, data: data, date: today, uploadedBy: by, createdAt: Date.now() };
      setDB(function (d) { var p = (d.patients || []).find(function (x) { return x.id === patId; }); if (!p) return; if (!p.documents) p.documents = []; p.documents.push(doc); });
      added++;
    }
    if (added) { try { toast(added + ' file' + (added > 1 ? 's' : '') + ' uploaded'); } catch (e) {} try { _setDocCategory(patId, cat); } catch (e) { _renderChartTab('documents'); } }
  };
})();
