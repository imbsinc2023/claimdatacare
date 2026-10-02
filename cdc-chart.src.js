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
    /* title bar of the patient file: slim and light, a folder tab on the left (no colour line) */
    /* title bar: soft paper background; the folder tab holds the file summary */
    '.pcf-hd{position:relative;flex:none;display:flex;align-items:flex-end;height:50px;padding:0 10px 0 14px;background:linear-gradient(180deg,#FBF4EE 0%,#F7EEE6 100%);border-bottom:1px solid #EADBCF}',
    '.pcf-tab{position:relative;z-index:1;display:flex;align-items:center;height:40px;margin-bottom:-1px;padding:0 6px 0 14px;border-radius:12px 12px 0 0;background:#fff;border:1px solid #EADBCF;border-bottom-color:#fff;box-shadow:0 -8px 18px -14px rgba(212,92,55,.55)}',
    '.pcf-tab:before{content:"";position:absolute;left:14px;right:14px;top:-1px;height:3px;border-radius:0 0 3px 3px;background:#FF6A3D}',
    '.pcf-tab .lb{display:flex;align-items:center;gap:7px;padding-right:12px;font-size:13px;font-weight:700;color:#D45C37;white-space:nowrap}',
    '.pcf-tab .lb .lci{width:16px!important;height:16px!important}',
    '.pcf-meta{display:flex;align-items:center;min-width:0;overflow:hidden;border-left:1px solid #F0E4DA}',
    '.pcf-mi{display:inline-flex;align-items:center;gap:6px;padding:0 11px;height:20px;font-size:12.5px;font-weight:600;color:#3A475C;white-space:nowrap}',
    '.pcf-mi+.pcf-mi{border-left:1px solid #F0E4DA}',
    '.pcf-mi .lci{width:13px!important;height:13px!important;color:#D45C37}',
    '.pcf-mi svg[stroke="#FFB199"]{stroke:#D45C37}',
    '.pcf-mi.st b{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16A34A;box-shadow:0 0 0 3px rgba(22,163,74,.15)}',
    '.pcf-mi.st.off b{background:#8C98AB;box-shadow:none}',
    '.pcf-act{display:flex;align-items:center;gap:4px;height:50px}',
    '.pcf-x{width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:#586579;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s}',
    '.pcf-x:hover{background:rgba(255,106,61,.1);color:#D45C37}',
    '.pcf-sp{flex:1}',
    '.pcf-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 264px}',
    '.pcf-main{min-width:0;min-height:0;overflow-y:auto;padding:16px 18px;background:radial-gradient(1200px 400px at 0% 0%,#FFF7F2 0%,rgba(255,247,242,0) 60%),#F6F8FB;display:flex;flex-direction:column}',
    '.pcf-main > *{flex:none}',
    '.pcf-main > #pcd-root{flex:1 1 auto}',
    '.pcf-main.fit > .ov{flex:1 1 auto}',
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
    return '<span class="pcf-tab"><span class="lb">' + ico('folder-open', 16) + (p._draft ? 'New ' + T.toLowerCase() : T + ' file') + '</span>' +
      (meta ? '<span class="pcf-meta">' + meta + '</span>' : '') + '</span><span class="pcf-sp"></span>' +
      '<div class="pcf-act">' + (!p._draft ? '<button type="button" class="pcf-x" data-tip="Export file to PDF" aria-label="Export file to PDF" onclick="_exportPatientPDF(\'' + esc(p.id) + '\')">' + ico('file-down', 17) + '</button>' : '') +
      '<button type="button" class="pcf-x" data-tip="Close" aria-label="Close" onclick="cdcCloseChart()">' + ico('x', 18) + '</button></div>';
  }
  function footHTML(tab) {
    if (tab !== 'demographics') return '<span class="sum" id="pcf-hint">' + (current && current._draft ? '' : 'Choose a section on the right. Required: Info and Coverage.') + '</span>';
    return '<span class="sum pcd-msg" id="pcd-msg" role="status">' + (current && current._draft ? 'Nothing is saved until you press Save with the required fields complete.' : '') + '</span>' +
      '<button type="button" class="cdc-alt" onclick="_pcdValidateAddr()">' + ico('map-pin-check', 15) + 'Validate address</button>' +
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
        case 'contacts': html = _buildContactsTab(p, db); break;
        case 'communication': html = empty('message-circle', 'Messaging', 'Internal messages about this ' + term().toLowerCase() + ' between your team.'); break;
        case 'pharmacies': html = empty('pill', 'Pharmacies', 'Pharmacies are added automatically from prescriptions. This module is coming next.'); break;
        default: html = empty('construction', tabId, 'Not available yet.');
      }
    } catch (e) { html = empty('alert-triangle', 'This section could not be shown', String(e && e.message || e)); }
    main.innerHTML = html;
    main.classList.toggle('fit', tabId === 'summary' || tabId === 'demographics');
    main.scrollTop = 0;
    var nav = document.getElementById('pcf-nav'); if (nav) nav.innerHTML = navHTML(p);
    var ft = document.getElementById('pcf-ftr'); if (ft) ft.innerHTML = footHTML(tabId);
    icons();
  };


  /* =====================================================================
     Overview (fits one screen), Contacts (with HIPAA release), Authorizations,
     and the authorization check used by the claim editor
     ===================================================================== */
  var CSS2 = [
    '.ov{display:grid;height:100%;min-height:0;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:12px}',
    '.ov-c{min-width:0;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid #E4E9F1;border-radius:14px;overflow:hidden}',
    '.ov-h{flex:none;display:flex;align-items:center;gap:8px;height:42px;padding:0 10px 0 14px;border-bottom:1px solid #EEF1F6}',
    '.ov-h h4{margin:0;display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
    '.ov-h h4 .lci{color:#FF6A3D}',
    '.ov-h .sp{flex:1}',
    '.ov-b{flex:1;min-height:0;overflow:auto;padding:12px 14px}',
    '.ov-ib{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;color:#586579;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s}',
    '.ov-ib:hover{background:rgba(255,106,61,.09);color:#D45C37}',
    '.ov-who{display:flex;gap:14px;align-items:center;margin-bottom:10px}',
    '.ov-av{width:64px;height:64px;border-radius:16px;flex:none;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;background:#7B2FF7}',
    '.ov-av.f{background:#E8367A}.ov-av.m{background:#00A3D1}.ov-av img{width:100%;height:100%;object-fit:cover}',
    '.ov-who b{display:block;font-size:16px;color:#0B1526}',
    '.ov-who span{font-size:12px;color:#586579}',
    '.ov-kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:6px 10px;font-size:12.5px}',
    '.ov-kv dt{color:#8C98AB;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding-top:2px}',
    '.ov-kv dd{margin:0;color:#0B1526;min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '.ov-ins{border:1px solid #EEF1F6;border-radius:12px;padding:10px 12px;margin-bottom:8px}',
    '.ov-ins .t{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
    '.ov-ins .t small{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.ov-ins .t b{font-size:13px;color:#0B1526}',
    '.ov-ins .m{font-size:12px;color:#3A475C}',
    '.ov-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;margin-left:auto}',
    '.ov-pill.ok{background:rgba(0,163,209,.1);color:#007FA3}.ov-pill.no{background:rgba(232,54,122,.1);color:#C21F62}.ov-pill.na{background:#EEF1F6;color:#586579}',
    '.ov-tot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}',
    '.ov-tot div{border:1px solid #EEF1F6;border-radius:10px;padding:8px 10px}',
    '.ov-tot small{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.ov-tot b{font-size:16px;color:#0B1526;font-variant-numeric:tabular-nums}',
    '.ov-tot .bal b{color:#D45C37}',
    '.ov-age{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;align-items:end;height:92px}',
    '.ov-age div{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}',
    '.ov-age i{display:block;width:100%;max-width:34px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,#FF8A5B,#FF6A3D);min-height:3px}',
    '.ov-age span{font-size:10px;color:#586579;white-space:nowrap}',
    '.ov-age em{font-style:normal;font-size:10.5px;font-weight:700;color:#0B1526;font-variant-numeric:tabular-nums}',
    '.ov-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F1F4F8;font-size:12.5px}',
    '.ov-row:last-child{border-bottom:0}',
    '.ov-row .ic{width:30px;height:30px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;background:#F4F6FA;color:#586579}',
    '.ov-row b{display:block;color:#0B1526;font-size:12.5px}',
    '.ov-row span{color:#586579;font-size:11.5px}',
    '.ov-none{font-size:12.5px;color:#8C98AB;padding:6px 0}',
    '.ov-bar{height:6px;border-radius:999px;background:#EEF1F6;overflow:hidden;margin-top:4px}',
    '.ov-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#00A3D1,#7B2FF7)}',
    '.ov-bar i.hi{background:#E8367A}',
    /* contacts */
    '.ctc-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
    '.ctc-top span{font-size:12px;color:#586579}',
    '.ctc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}',
    '.ctc{background:#fff;border:1px solid #E4E9F1;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}',
    '.ctc .hd{display:flex;align-items:flex-start;gap:12px}',
    '.ctc .av{width:42px;height:42px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;background:#F4F6FA;color:#586579;font-weight:700}',
    '.ctc .hd b{display:block;font-size:14px;color:#0B1526}',
    '.ctc .hd span{font-size:12px;color:#586579}',
    '.ctc .act{margin-left:auto;display:flex;gap:4px}',
    '.ctc .tags{display:flex;gap:5px;flex-wrap:wrap}',
    '.ctc .tag{padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;background:#EEF1F6;color:#3A475C}',
    '.ctc .tag.em{background:rgba(232,54,122,.1);color:#C21F62}',
    '.ctc .hip{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;font-size:12px}',
    '.ctc .hip.yes{background:rgba(0,163,209,.08);color:#007FA3}',
    '.ctc .hip.no{background:#F4F6FA;color:#586579}',
    '.ctc .ln{font-size:12.5px;color:#3A475C;display:flex;align-items:center;gap:7px}',
    '.ctc .ln .lci{color:#8C98AB}',
    '.ctw{width:94vw!important;max-width:880px!important;max-height:92vh;display:flex!important;flex-direction:column;border-radius:18px!important;padding:0!important;overflow:hidden}',
    '.ctw-b{flex:1;min-height:0;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;background:#F8FAFC}',
    '.ctw-roles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.ctw-roles label{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #E4E9F1;border-radius:10px;background:#fff;font-size:12.5px;cursor:pointer}',
    '.ctw-roles input{width:16px;height:16px;margin:0;accent-color:#FF6A3D}',
    '.ctw-hip{display:flex;align-items:center;gap:10px;font-size:12.5px;color:#3A475C}',
    /* authorizations */
    '.au-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}',
    '.au-top span{font-size:12px;color:#586579}',
    '.au-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}',
    '.au{background:#fff;border:1px solid #E4E9F1;border-radius:14px;overflow:hidden}',
    '.au-h{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #EEF1F6}',
    '.au-h .st{padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}',
    '.au-h b{font-size:14px;color:#0B1526}',
    '.au-h small{display:block;font-size:11.5px;color:#586579}',
    '.au-h .act{margin-left:auto;display:flex;gap:4px}',
    '.au-dates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#EEF1F6}',
    '.au-dates div{background:#fff;padding:8px 14px}',
    '.au-dates small{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.au-dates b{font-size:13px;color:#0B1526;font-variant-numeric:tabular-nums}',
    '.au-svc{padding:8px 14px 12px}',
    '.au-s{display:grid;grid-template-columns:70px minmax(0,1fr) 150px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #F1F4F8}',
    '.au-s:last-child{border-bottom:0}',
    '.au-s code{font-family:var(--mono,monospace);font-weight:700;color:#0B1526}',
    '.au-s span{font-size:12px;color:#3A475C;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.au-s .u{font-size:11.5px;color:#586579;text-align:right;font-variant-numeric:tabular-nums}',
    '.au-s .u b{color:#0B1526}',
    '.au-note{padding:0 14px 12px;font-size:12px;color:#586579;font-style:italic}'
  ].join('\n');
  function css2() { if (document.getElementById('pcf-style2')) return; var s = document.createElement('style'); s.id = 'pcf-style2'; s.textContent = CSS2; document.head.appendChild(s); }
  function money(n) { var v = Math.round((parseFloat(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function us(d) { var s = String(d || ''), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + '/' + m[3] + '/' + m[1] : s; }
  function isoD(d) { var s = String(d || '').trim(), m; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3]; if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); return ''; }

  /* ---------- authorization usage (manual starting units + units already billed) ---------- */
  var NOUSE = { denied: 1, void: 1, deleted: 1, rejected: 1 };
  function authUse(pat, auth, svc, exceptClaimId) {
    var from = isoD(auth.startDate), to = isoD(auth.endDate), cpt = String(svc.cpt || '').toUpperCase(), used = parseFloat(svc.unitsUsed) || 0;
    (getDB().claims || []).forEach(function (c) {
      if (c.patId !== pat.id || c.id === exceptClaimId || NOUSE[String(c.status || '').toLowerCase()]) return;
      (c.lines || []).forEach(function (l) {
        if (String(l.cpt || '').toUpperCase() !== cpt) return;
        var d = isoD(l.dos) || isoD(c.dos);
        if ((from && d < from) || (to && d > to)) return;
        used += parseFloat(l.units) || 1;
      });
    });
    var appr = parseFloat(svc.unitsApproved) || 0;
    return { used: used, approved: appr, left: appr ? appr - used : Infinity };
  }
  window.cdcAuthUse = authUse;
  // problems for a claim: expired / not yet valid / no units left / missing when the plan needs it
  window.cdcAuthCheckClaim = function (claimId) {
    var db = getDB(), c = (db.claims || []).find(function (x) { return x.id === claimId; }); if (!c) return [];
    var pat = (db.patients || []).find(function (p) { return p.id === c.patId; }); if (!pat) return [];
    var auths = (pat.authorizations || []).filter(function (a) { return a.manualStatus !== 'Denied'; });
    var needs = (pat.insurances || []).some(function (iv) { return iv.preAuth || iv.preAuthRequired; });
    var out = [], pending = {};
    (c.lines || []).forEach(function (l) {
      var cpt = String(l.cpt || '').toUpperCase(); if (!cpt) return;
      var d = isoD(l.dos) || isoD(c.dos), units = parseFloat(l.units) || 1;
      var withCpt = auths.filter(function (a) { return (a.services || []).some(function (s) { return String(s.cpt || '').toUpperCase() === cpt; }); });
      if (!withCpt.length) { if (needs) out.push(cpt + ': the plan requires authorization and there is none on file for this code'); return; }
      var valid = withCpt.filter(function (a) { var f = isoD(a.startDate), t = isoD(a.endDate); return (!f || d >= f) && (!t || d <= t); });
      if (!valid.length) {
        var a0 = withCpt[0];
        out.push(cpt + ' on ' + us(d) + ': authorization #' + (a0.authNum || '') + ' is not valid on that date (effective ' + us(a0.startDate) + ' to ' + us(a0.endDate) + ')');
        return;
      }
      var best = null;
      valid.forEach(function (a) { var s = a.services.find(function (x) { return String(x.cpt || '').toUpperCase() === cpt; }), u = authUse(pat, a, s, c.id); var key = a.authNum + '|' + cpt; u.left -= pending[key] || 0; if (!best || u.left > best.u.left) best = { a: a, u: u, key: key }; });
      if (best.u.left !== Infinity && units > best.u.left) out.push(cpt + ' on ' + us(d) + ': only ' + Math.max(0, best.u.left) + ' unit' + (best.u.left === 1 ? '' : 's') + ' left on authorization #' + (best.a.authNum || '') + ' (this line uses ' + units + ')');
      pending[best.key] = (pending[best.key] || 0) + units;
    });
    return out;
  };

  /* ---------- Overview ---------- */
  window._buildSummaryTab = function (pat, db) {
    css2();
    var T = term(), sx = String(pat.sex || '').toUpperCase(), ini = ((pat.first || ' ')[0] + (pat.last || ' ')[0]).trim().toUpperCase();
    var a = age(pat.dob), EOB = db.claimEOB || {};
    var claims = (db.claims || []).filter(function (c) { return c.patId === pat.id; });
    var billed = 0, paid = 0, bucket = [0, 0, 0, 0, 0], today = new Date();
    claims.forEach(function (c) {
      var b = (c.lines || []).reduce(function (s2, l) { return s2 + (parseFloat(l.charge) || 0); }, 0), p = (EOB[c.id] || []).reduce(function (s2, e) { return s2 + (parseFloat(e.paid) || 0); }, 0);
      billed += b; paid += p;
      var open = (EOB[c.id] || []).length ? 0 : b; if (!open || NOUSE[String(c.status || '').toLowerCase()]) return;
      var d = isoD(c.dos), days = d ? Math.floor((today - new Date(d + 'T12:00:00')) / 864e5) : 0;
      bucket[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : days <= 120 ? 3 : 4] += open;
    });
    var maxB = Math.max.apply(null, bucket.concat([1]));
    var card = function (icon, title, body, act) { return '<div class="ov-c"><div class="ov-h"><h4>' + ico(icon, 14) + title + '</h4><span class="sp"></span>' + (act || '') + '</div><div class="ov-b">' + body + '</div></div>'; };
    var go = function (tab, icon, tip) { return '<button type="button" class="ov-ib" data-tip="' + tip + '" aria-label="' + tip + '" onclick="_renderChartTab(\'' + tab + '\')">' + ico(icon, 14) + '</button>'; };
    // patient
    var who = '<div class="ov-who"><div class="ov-av ' + (sx === 'F' ? 'f' : sx === 'M' ? 'm' : '') + '">' + (pat.photo ? '<img src="' + esc(pat.photo) + '" alt="">' : esc(ini)) + '</div><div><b>' + esc((pat.last || '').toUpperCase() + ', ' + (pat.first || '').toUpperCase()) + '</b><span>File #' + esc(pat.acct || '') + (a !== '' && a != null ? ' • ' + a + ' yrs' : '') + ' • ' + (sx === 'F' ? 'Female' : sx === 'M' ? 'Male' : 'Other') + '</span></div></div>' +
      '<dl class="ov-kv"><dt>DOB</dt><dd>' + esc(us(pat.dob)) + '</dd><dt>Phone</dt><dd>' + esc(pat.phone || '•') + '</dd><dt>Email</dt><dd>' + esc(pat.email || '•') + '</dd>' +
      '<dt>Address</dt><dd>' + esc([pat.addr1, pat.addr2].filter(Boolean).join(' ')) + '<br>' + esc([pat.city, pat.state].filter(Boolean).join(', ') + ' ' + (pat.zip || '')) + '</dd>' +
      '<dt>Language</dt><dd>' + esc(pat.language || '•') + '</dd></dl>';
    // coverage
    var ins = (pat.insurances || []).slice().sort(function (x, y) { var o = { primary: 0, secondary: 1, tertiary: 2 }; var k = function (i) { var t = String(i.insType || 'primary').toLowerCase(); return o[t.split(' ')[0]] != null ? o[t.split(' ')[0]] : 3; }; return k(x) - k(y); });
    var cov = ins.length ? ins.slice(0, 3).map(function (iv) {
      var el = iv.elig || {}, st = el.status === 'active' ? '<span class="ov-pill ok">' + ico('check', 11) + 'Eligible</span>' : el.status === 'inactive' ? '<span class="ov-pill no">Inactive</span>' : '<span class="ov-pill na">Not verified</span>';
      return '<div class="ov-ins"><div class="t"><small>' + esc(iv.insType || 'Primary') + '</small>' + st + '</div><div class="t"><b>' + esc(iv.name || iv.insuranceName || '') + '</b></div><div class="m">Member ID ' + esc(iv.policy || iv.memberId || '•') + (iv.group ? ' • Group ' + esc(iv.group) : '') + (el.checkedAt ? ' • Checked ' + esc(us(new Date(el.checkedAt).toISOString())) : '') + '</div></div>';
    }).join('') : (pat.selfPay ? '<div class="ov-ins"><div class="t"><b>Self pay</b></div><div class="m">No insurance on file</div></div>' : '<div class="ov-none">No coverage yet. Add it in Coverage.</div>');
    // balance
    var bal = '<div class="ov-tot"><div><small>Billed</small><b>' + money(billed) + '</b></div><div><small>Paid</small><b>' + money(paid) + '</b></div><div class="bal"><small>Balance</small><b>' + money(Math.max(0, billed - paid)) + '</b></div></div>' +
      '<div class="ov-age">' + ['0-30', '31-60', '61-90', '91-120', '120+'].map(function (l, i) { return '<div><em>' + (bucket[i] ? money(bucket[i]).replace('.00', '') : '$0') + '</em><i style="height:' + Math.round(bucket[i] / maxB * 56) + 'px"></i><span>' + l + '</span></div>'; }).join('') + '</div>';
    // authorizations
    var auths = (pat.authorizations || []);
    var au = auths.length ? auths.slice(0, 4).map(function (x) {
      var s = (x.services || [])[0] || {}, u = s.cpt ? authUse(pat, x, s) : null, pct = u && u.approved ? Math.min(100, Math.round(u.used / u.approved * 100)) : 0;
      return '<div class="ov-row"><span class="ic">' + ico('key-round', 14) + '</span><div style="flex:1;min-width:0"><b>#' + esc(x.authNum || '') + ' • ' + esc(x.payerName || '') + '</b><span>' + esc(us(x.startDate)) + ' to ' + esc(us(x.endDate)) + (u && u.approved ? ' • ' + s.cpt + ' ' + Math.max(0, u.left) + ' of ' + u.approved + ' units left' : '') + '</span>' +
        (u && u.approved ? '<div class="ov-bar"><i class="' + (pct >= 90 ? 'hi' : '') + '" style="width:' + pct + '%"></i></div>' : '') + '</div></div>';
    }).join('') : '<div class="ov-none">No authorizations on file.</div>';
    // activity
    var appts = []; try { appts = (getAppts() || []).filter(function (x) { return (x.patients || []).some(function (y) { return y.patId === pat.id; }); }); } catch (e) {}
    var tISO = new Date().toISOString().slice(0, 10);
    var next = appts.filter(function (x) { return x.date >= tISO; }).sort(function (x, y) { return x.date < y.date ? -1 : 1; })[0];
    var lastV = (db.notes || []).filter(function (n) { return n.patId === pat.id; }).sort(function (x, y) { return (y.createdAt || 0) - (x.createdAt || 0); })[0];
    var lastC = claims.slice().sort(function (x, y) { return isoD(y.dos) > isoD(x.dos) ? 1 : -1; })[0];
    var row = function (icon, t, sub, tab) { return '<div class="ov-row" style="cursor:pointer" onclick="_renderChartTab(\'' + tab + '\')"><span class="ic">' + ico(icon, 14) + '</span><div><b>' + t + '</b><span>' + sub + '</span></div></div>'; };
    var act = row('calendar-days', 'Next appointment', next ? esc(us(next.date) + ' ' + (next.startTime || '')) : 'None scheduled', 'appointments') +
      row('stethoscope', 'Last visit', lastV ? esc(us(new Date(lastV.createdAt || Date.now()).toISOString())) : 'None yet', 'encounters') +
      row('receipt', 'Last claim', lastC ? esc(us(lastC.dos)) + ' • ' + esc(lastC.status || '') : 'None yet', 'bills') +
      row('folder-open', 'Records', (pat.documents || []).filter(function (d) { return !d.deleted && !d.trashed; }).length + ' on file', 'documents');
    // contacts
    var cts = contactsOf(pat);
    var ct = cts.length ? cts.slice(0, 3).map(function (k) {
      return '<div class="ov-row"><span class="ic">' + ico(k.roles && k.roles.emergency ? 'siren' : 'user', 14) + '</span><div style="flex:1;min-width:0"><b>' + esc(k.name) + ' • ' + esc(k.relation || '') + '</b><span>' + esc(k.phone || '') + (k.hipaa ? ' • PHI release on file' : '') + '</span></div></div>';
    }).join('') : '<div class="ov-none">No contacts yet.</div>';
    return '<div class="ov">' +
      card('user', T, who, go('demographics', 'pencil', 'Edit info')) +
      card('shield-check', 'Coverage', cov, go('insurance', 'pencil', 'Edit coverage')) +
      card('wallet', 'Balance', bal, go('bills', 'arrow-right', 'Open claims')) +
      card('key-round', 'Authorizations', au, go('auth', 'arrow-right', 'Open authorizations')) +
      card('activity', 'Activity', act) +
      card('contact', 'Contacts', ct, go('contacts', 'arrow-right', 'Open contacts')) +
    '</div>';
  };

  /* ---------- Contacts ---------- */
  var REL = ['Spouse', 'Parent', 'Child', 'Sibling', 'Legal guardian', 'Caregiver', 'Friend', 'Other'];
  function contactsOf(pat) {
    var list = (pat.contacts || []).slice();
    // the emergency contact typed in Info shows here until it is saved as a contact
    if (pat.ecName && !list.some(function (c) { return String(c.name || '').toUpperCase() === String(pat.ecName).toUpperCase(); }))
      list.unshift({ id: '_ec', name: pat.ecName, relation: pat.ecRel, phone: pat.ecPhone, email: pat.ecEmail, roles: { emergency: true }, fromInfo: true });
    return list;
  }
  window._buildContactsTab = function (pat) {
    css2();
    var list = contactsOf(pat);
    var top = '<div class="ctc-top"><button type="button" class="cdc-ok" onclick="cdcContactEdit(\'' + esc(pat.id) + '\',-1)">' + ico('user-plus', 15) + 'Add contact</button><span>Emergency contacts, guardians, responsible parties and people allowed to receive medical records (HIPAA release).</span></div>';
    if (!list.length) return top + '<div class="pcf-empty">' + ico('contact', 30) + '<b>No contacts yet</b>Add the emergency contact and anyone the ' + term().toLowerCase() + ' authorizes to receive information.</div>';
    return top + '<div class="ctc-grid">' + list.map(function (k, i) {
      var ini = String(k.name || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(), R = k.roles || {};
      var tags = (R.emergency ? '<span class="tag em">Emergency</span>' : '') + (R.guardian ? '<span class="tag">Legal guardian</span>' : '') + (R.responsible ? '<span class="tag">Responsible party</span>' : '') + (R.pickup ? '<span class="tag">May pick up</span>' : '');
      var idx = k.fromInfo ? -2 : (pat.contacts || []).indexOf(k);
      return '<div class="ctc"><div class="hd"><span class="av">' + esc(ini) + '</span><div><b>' + esc(k.name) + '</b><span>' + esc(k.relation || 'Relationship not set') + '</span></div><div class="act">' +
        '<button type="button" class="ov-ib" data-tip="Edit" aria-label="Edit" onclick="cdcContactEdit(\'' + esc(pat.id) + '\',' + idx + ')">' + ico('pencil', 14) + '</button>' +
        (k.fromInfo ? '' : '<button type="button" class="ov-ib" data-tip="Delete" aria-label="Delete" onclick="cdcContactDelete(\'' + esc(pat.id) + '\',' + idx + ')">' + ico('trash-2', 14) + '</button>') + '</div></div>' +
        (tags ? '<div class="tags">' + tags + '</div>' : '') +
        (k.phone ? '<div class="ln">' + ico('phone', 13) + esc(k.phone) + (k.phone2 ? ' • ' + esc(k.phone2) : '') + '</div>' : '') +
        (k.email ? '<div class="ln">' + ico('mail', 13) + esc(k.email) + '</div>' : '') +
        (k.address ? '<div class="ln">' + ico('map-pin', 13) + esc(k.address) + '</div>' : '') +
        '<div class="hip ' + (k.hipaa ? 'yes' : 'no') + '">' + ico(k.hipaa ? 'shield-check' : 'shield-off', 14) +
          (k.hipaa ? 'May receive medical records (' + esc(k.hipaaScope || 'All records') + ') • since ' + esc(us(k.hipaaDate)) + (k.hipaaExp ? ' until ' + esc(us(k.hipaaExp)) : '') + (k.hipaaSigned ? ' • signed form on file' : '') : 'Not authorized to receive medical records') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  };
  window.cdcContactEdit = function (patId, idx) {
    css2();
    var pat = (getDB().patients || []).find(function (p) { return p.id === patId; }); if (!pat) return;
    var k = idx === -2 ? contactsOf(pat)[0] : idx >= 0 ? (pat.contacts || [])[idx] : { roles: {} };
    k = k || { roles: {} }; var R = k.roles || {};
    var w = document.getElementById('modal-contact'); if (w) w.remove();
    w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-contact';
    var F = function (id, lbl, val, o) { o = o || {}; return '<div class="pcd-f ' + (o.span || '') + '"><label for="ct-' + id + '">' + lbl + (o.req ? ' <span class="rq">*</span>' : '') + '</label><input id="ct-' + id + '" type="' + (o.type || 'text') + '" value="' + esc(val || '') + '"' + (o.on ? ' ' + o.on : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '></div>'; };
    w.innerHTML = '<div class="modal ctw">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('contact', 17) + (idx === -1 ? 'Add contact' : 'Edit contact') + '</span><button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="cdcContactClose()">' + ico('x', 17) + '</button></div>' +
      '<div class="ctw-b">' +
        '<section class="pcd-sec"><h4>' + ico('user', 14) + 'Person</h4><div class="pcd-g">' +
          F('name', 'Full name', k.name, { req: 1, span: 's3' }) +
          '<div class="pcd-f s3"><label for="ct-rel">Relationship to the ' + term().toLowerCase() + ' <span class="rq">*</span></label><select id="ct-rel"><option value="">Select</option>' + REL.map(function (r) { return '<option' + (r === k.relation ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div>' +
          F('phone', 'Phone', k.phone, { req: 1, type: 'tel', span: 's2', on: 'oninput="_pcdPhone(this)"' }) + F('phone2', 'Alternate phone', k.phone2, { type: 'tel', span: 's2', on: 'oninput="_pcdPhone(this)"' }) + F('email', 'Email', k.email, { type: 'email', span: 's2' }) +
          F('address', 'Address', k.address, { span: 's6', ph: 'Street, city, state, ZIP' }) +
        '</div></section>' +
        '<section class="pcd-sec"><h4>' + ico('tags', 14) + 'Role</h4><div class="ctw-roles">' +
          [['emergency', 'Emergency contact'], ['guardian', 'Legal guardian'], ['responsible', 'Responsible party'], ['pickup', 'May pick up']].map(function (r) { return '<label><input type="checkbox" id="ct-r-' + r[0] + '"' + (R[r[0]] ? ' checked' : '') + '>' + r[1] + '</label>'; }).join('') +
        '</div></section>' +
        '<section class="pcd-sec"><h4>' + ico('shield-check', 14) + 'HIPAA release of information</h4>' +
          '<label class="ctw-hip"><input type="checkbox" id="ct-hipaa"' + (k.hipaa ? ' checked' : '') + ' onchange="document.getElementById(\'ct-hip-f\').style.visibility=this.checked?\'visible\':\'hidden\'" style="width:16px;height:16px;accent-color:#FF6A3D">The ' + term().toLowerCase() + ' authorizes this person to receive protected health information and medical records</label>' +
          '<div class="pcd-g" id="ct-hip-f" style="margin-top:10px;visibility:' + (k.hipaa ? 'visible' : 'hidden') + '">' +
            '<div class="pcd-f s2"><label for="ct-scope">What may be shared <span class="rq">*</span></label><select id="ct-scope">' + ['All records', 'Billing and payments only', 'Treatment and appointments only', 'Limited (see notes)'].map(function (o) { return '<option' + (o === k.hipaaScope ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
            F('hdate', 'Authorization date', k.hipaaDate, { req: 1, type: 'date' }) + F('hexp', 'Expires', k.hipaaExp, { type: 'date' }) +
            '<div class="pcd-f s2"><label>&nbsp;</label><label class="ctw-hip" style="height:34px"><input type="checkbox" id="ct-hsigned"' + (k.hipaaSigned ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:#FF6A3D">Signed authorization form on file</label></div>' +
          '</div></section>' +
        '<section class="pcd-sec"><h4>' + ico('sticky-note', 14) + 'Notes</h4><div class="pcd-g">' + F('notes', 'Notes', k.notes, { span: 's6' }) + '</div></section>' +
      '</div>' +
      '<div class="cdc-ftr"><span class="sum pcd-msg" id="ct-msg"></span>' +
        '<button type="button" class="cdc-no" onclick="cdcContactClose()">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-ok" onclick="cdcContactSave(\'' + esc(patId) + '\',' + idx + ')">' + ico('save', 15) + 'Save contact</button></div>' +
    '</div>';
    document.body.appendChild(w); openModal('modal-contact');
    setTimeout(function () { var n = document.getElementById('ct-name'); if (n) n.focus(); }, 30);
  };
  window.cdcContactClose = function () { var w = document.getElementById('modal-contact'); if (w) { closeModal('modal-contact'); w.remove(); } };
  window.cdcContactSave = function (patId, idx) {
    var g2 = function (id) { var e = document.getElementById('ct-' + id); return e ? String(e.value || '').trim() : ''; };
    var ck = function (id) { var e = document.getElementById('ct-' + id); return !!(e && e.checked); };
    var m = document.getElementById('ct-msg'), fail = function (id, t) { if (m) { m.textContent = t; m.className = 'sum pcd-msg err'; } var e = document.getElementById('ct-' + id); if (e) { e.classList.add('bad'); e.focus(); } };
    document.querySelectorAll('#modal-contact .bad').forEach(function (e) { e.classList.remove('bad'); });
    var digits = function (x) { return String(x || '').replace(/\D/g, ''); }, emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!g2('name')) return fail('name', 'Full name is required');
    if (!g2('rel')) return fail('rel', 'Relationship is required');
    if (digits(g2('phone')).length !== 10) return fail('phone', 'Phone must have 10 digits');
    if (g2('phone2') && digits(g2('phone2')).length !== 10) return fail('phone2', 'Alternate phone must have 10 digits');
    if (g2('email') && !emailRe.test(g2('email'))) return fail('email', 'Email is not valid');
    var hip = ck('hipaa');
    if (hip && !g2('hdate')) return fail('hdate', 'Authorization date is required for the HIPAA release');
    if (hip && g2('hexp') && g2('hexp') < g2('hdate')) return fail('hexp', 'Expiration cannot be before the authorization date');
    var rec = { id: uid(), name: g2('name').toUpperCase(), relation: g2('rel'), phone: g2('phone'), phone2: g2('phone2'), email: g2('email').toLowerCase(), address: g2('address').toUpperCase(),
      roles: { emergency: ck('r-emergency'), guardian: ck('r-guardian'), responsible: ck('r-responsible'), pickup: ck('r-pickup') },
      hipaa: hip, hipaaScope: hip ? g2('scope') : '', hipaaDate: hip ? g2('hdate') : '', hipaaExp: hip ? g2('hexp') : '', hipaaSigned: hip && ck('hsigned'), notes: g2('notes'), updatedAt: Date.now() };
    setDB(function (d) {
      var p = (d.patients || []).find(function (x) { return x.id === patId; }); if (!p) return;
      p.contacts = p.contacts || [];
      if (idx >= 0 && p.contacts[idx]) { rec.id = p.contacts[idx].id || rec.id; p.contacts[idx] = rec; } else p.contacts.push(rec);
      // the first emergency contact also fills the emergency contact shown in Info
      if (rec.roles.emergency && (idx === -2 || !p.ecName || String(p.ecName).toUpperCase() === rec.name)) { p.ecName = rec.name; p.ecRel = rec.relation; p.ecPhone = rec.phone; p.ecEmail = rec.email; }
    });
    cdcContactClose(); try { toast('Contact saved', 'ok'); } catch (e) {}
    _renderChartTab('contacts');
  };
  window.cdcContactDelete = function (patId, idx) {
    cdcConfirm('Delete this contact?', { title: 'Confirm delete' }).then(function (ok) {
      if (!ok) return;
      setDB(function (d) { var p = (d.patients || []).find(function (x) { return x.id === patId; }); if (p && p.contacts) p.contacts.splice(idx, 1); });
      _renderChartTab('contacts');
    });
  };

  /* ---------- Authorizations ---------- */
  window._buildAuthTab = function (pat) {
    css2();
    var auths = pat.authorizations || [];
    var top = '<div class="au-top"><button type="button" class="cdc-ok" onclick="_openAuthModal(\'' + esc(pat.id) + '\',-1)">' + ico('plus', 15) + 'Add authorization</button><span>Status is automatic from the effective dates and units. Units used count the claims already created for each code.</span></div>';
    if (!auths.length) return top + '<div class="pcf-empty">' + ico('key-round', 30) + '<b>No authorizations on file</b>When an authorization is added, claims are checked against its dates and units.</div>';
    return top + '<div class="au-grid">' + auths.map(function (a, i) {
      var st = typeof _authStatus === 'function' ? _authStatus(a) : { label: 'Active', bg: '#EEF1F6', fg: '#3A475C' };
      var t = new Date(), end = a.endDate ? new Date(isoD(a.endDate) + 'T12:00:00') : null, left = end ? Math.ceil((end - t) / 864e5) : null;
      var svcs = (a.services || []).filter(function (s) { return s.cpt; });
      return '<div class="au"><div class="au-h"><span class="st" style="background:' + st.bg + ';color:' + st.fg + '">' + esc(st.label) + '</span><div><b>' + esc(a.payerName || '') + '</b><small>Auth # ' + esc(a.authNum || '') + '</small></div><div class="act">' +
        '<button type="button" class="ov-ib" data-tip="Edit" aria-label="Edit" onclick="_openAuthModal(\'' + esc(pat.id) + '\',' + i + ')">' + ico('pencil', 14) + '</button>' +
        '<button type="button" class="ov-ib" data-tip="Delete" aria-label="Delete" onclick="_deleteAuth(\'' + esc(pat.id) + '\',' + i + ')">' + ico('trash-2', 14) + '</button></div></div>' +
        '<div class="au-dates"><div><small>Effective</small><b>' + esc(us(a.startDate) || '•') + '</b></div><div><small>Expires</small><b>' + esc(us(a.endDate) || '•') + '</b></div><div><small>Days left</small><b style="color:' + (left != null && left < 0 ? '#C21F62' : left != null && left <= 14 ? '#D45C37' : '#0B1526') + '">' + (left == null ? '•' : left < 0 ? 'Expired' : left) + '</b></div></div>' +
        '<div class="au-svc">' + (svcs.length ? svcs.map(function (s) {
          var u = authUse(pat, a, s), pct = u.approved ? Math.min(100, Math.round(u.used / u.approved * 100)) : 0;
          return '<div class="au-s"><code>' + esc(String(s.cpt).toUpperCase()) + '</code><span>' + esc(s.description || '') + '</span><div><div class="u"><b>' + (u.approved ? Math.max(0, u.left) : 'No limit') + '</b>' + (u.approved ? ' left • ' + u.used + ' of ' + u.approved + ' used' : '') + '</div>' +
            (u.approved ? '<div class="ov-bar"><i class="' + (pct >= 90 ? 'hi' : '') + '" style="width:' + pct + '%"></i></div>' : '') + '</div></div>';
        }).join('') : '<div class="ov-none">No services listed. Edit the authorization to add the approved codes and units.</div>') + '</div>' +
        (a.notes ? '<div class="au-note">' + esc(a.notes) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
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
