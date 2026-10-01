/*
 * ClaimDataCare  •  Claims list
 * File: cdc-claims.js  •  v1.0
 *
 * Replaces the claims list that lived in script1.js (renderClaims, setTab, paging,
 * sorting and selection helpers were removed there).
 *   • Status tabs beside the title as folder tabs (same as Invoicing), no counters
 *   • One filter row; select all / clear / Excel export on the right
 *   • Static layout: rows per page are computed from the screen height, so the table
 *     fits without scrolling; pagers are fixed top right and at the bottom
 *   • Fixed-height selection bar: nothing moves when claims are selected
 *   • Clicking the PCN opens the claim editor
 */
(function () {
  'use strict';

  var S = { tab: 'all', sort: 'dos', asc: false, page: 0, size: 0, list: [] };
  var ROW_H = 40, HEAD_H = 38;
  var TABS = [['all', 'All'], ['draft', 'Draft'], ['pending', 'Pending'], ['submitted', 'Submitted'], ['accepted', 'Accepted CH'], ['rejected', 'Rejected']];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px"></i>'; }
  function icons() { try { if (typeof _renderLucideIcons === 'function') setTimeout(_renderLucideIcons, 10); } catch (e) {} }
  function money(n) { try { return '$' + fmtMoney(n); } catch (e) { return '$' + Number(n || 0).toFixed(2); } }

  /* ---------------- styles ---------------- */
  var STYLE = [
    '#sec-claims.section{overflow:hidden}',
    '.clm{display:flex;flex-direction:column;height:100%;min-height:0;gap:10px}',
    /* folder tabs beside the title, same as Invoicing */
    '.clm-hd{flex:none;display:flex;align-items:flex-end;gap:22px;min-height:46px;border-bottom:1px solid #E4E9F1}',
    '.clm-title{margin:0 0 8px;font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap}',
    '.clm-tabs{display:flex;gap:4px;margin-bottom:-1px;min-width:0;overflow-x:auto;scrollbar-width:none}',
    '.clm-tabs::-webkit-scrollbar{display:none}',
    '.clm-tab{height:38px;padding:0 16px;border:1px solid transparent;border-bottom:1px solid #E4E9F1;border-radius:10px 10px 0 0;background:#F4F6FA;font-family:inherit;font-size:12.5px;font-weight:600;color:#586579;cursor:pointer;white-space:nowrap;transition:background-color .15s,color .15s}',
    '.clm-tab:hover{background:#EEF1F6;color:#0B1526}',
    '.clm-tab.on{background:#fff;border-color:#E4E9F1;border-bottom-color:#fff;color:#D45C37;box-shadow:inset 0 2px 0 #FF6A3D;cursor:default}',
    '.clm-pager{margin-left:auto;margin-bottom:6px;flex:none;display:flex;align-items:center;gap:6px;min-width:330px;justify-content:flex-end}',
    '.clm-pg-info{font-size:11.5px;color:#586579;white-space:nowrap;min-width:120px;text-align:right;font-variant-numeric:tabular-nums}',
    '.clm-pg-b{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;transition:border-color .15s,color .15s}',
    '.clm-pg-b:hover{border-color:#D5DCE7;color:#0B1526}',
    '.clm-pg-b.on{background:#FF6A3D;border-color:#FF6A3D;color:#fff;cursor:default}',
    '.clm-pg-b[disabled]{opacity:.35;cursor:default}',
    '.clm-pg-gap{width:14px;text-align:center;color:#8C98AB;font-size:12px}',
    '.clm-flt{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}',
    '.clm-flt input[type=text]{flex:1 1 220px;min-width:140px;max-width:320px;height:34px}',
    '.clm-flt select{height:34px;max-width:190px}',
    '.clm-dos{display:flex;align-items:center;gap:5px;font-size:12px;color:#586579;white-space:nowrap}',
    '.clm-dos input{height:34px;font-size:12px;padding:0 6px}',
    '.clm-sp{flex:1}',
    '.clm-ib{position:relative;width:34px;height:34px;flex:none;border:1px solid #E4E9F1;border-radius:10px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .15s,color .15s,background .15s}',
    '.clm-ib.xl{color:#0E8A5F}',
    '.clm-bar{flex:none;height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF1F6;overflow:hidden}',
    '.clm-bar.sel{background:rgba(255,106,61,.07);border-color:rgba(255,106,61,.25)}',
    '.clm-bar .n{font-size:12.5px;font-weight:700;color:#D45C37;white-space:nowrap}',
    '.clm-bar .m{font-size:12px;color:#586579;white-space:nowrap}',
    '.clm-bar .acts{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;min-width:0}',
    '.clm-bar .acts::-webkit-scrollbar{display:none}',
    '.clm-bar .btn{white-space:nowrap}',
    '.clm-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;border:1px solid #EEF1F6;border-radius:14px;background:#fff}',
    '.clm-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px}',
    '.clm-tbl th{height:' + HEAD_H + 'px;padding:0 10px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;background:#F8FAFC;border-bottom:1px solid #EEF1F6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;user-select:none}',
    '.clm-tbl th.ns{cursor:default}',
    '.clm-tbl th .ar{color:#FF6A3D;margin-left:3px}',
    '.clm-tbl td{height:' + ROW_H + 'px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid #F1F4F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}',
    '.clm-tbl tbody tr{transition:background .12s}',
    '.clm-tbl tbody tr:hover{background:#F8FAFC}',
    '.clm-tbl tbody tr.sel{background:rgba(255,106,61,.06)}',
    '.clm-tbl input[type=checkbox]{width:16px;height:16px;cursor:pointer;accent-color:#FF6A3D;margin:0}',
    '.clm-pcn{cursor:pointer;font-family:var(--mono,monospace);font-size:11.5px;color:#3A475C;text-decoration:none;border-radius:6px;padding:3px 6px;margin-left:-6px;transition:background .15s,color .15s}',
    '.clm-pcn:hover{background:rgba(255,106,61,.1);color:#D45C37}',
    '.clm-cpt{font-family:var(--mono,monospace);font-size:11px;color:#3A475C}',
    '.clm-num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}',
    '.clm-acts{display:flex;gap:2px}',
    '.clm-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#586579;font-size:13px}',
    '.clm-empty b{font-size:15px;color:#0B1526}',
    '.clm-foot{flex:none;display:flex;justify-content:flex-end;min-height:30px}',
    '@media (max-width:1100px){.clm-hd{flex-wrap:wrap}.clm-flt{flex-wrap:wrap}.clm-pager{min-width:0}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('clm-style')) return;
    var st = document.createElement('style'); st.id = 'clm-style'; st.textContent = STYLE; document.head.appendChild(st);
  }

  /* ---------------- skeleton (built once, stays put) ---------------- */
  function skeleton(sec) {
    sec.innerHTML =
      '<div class="clm">' +
        '<div class="clm-hd"><h1 class="clm-title">Claims</h1>' +
          '<div class="clm-tabs" id="clm-tabs" role="tablist">' +
            TABS.map(function (t) { return '<button type="button" role="tab" class="clm-tab" data-t="' + t[0] + '" onclick="cdcClaimsTab(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') +
          '</div>' +
          '<div class="clm-pager" id="clm-pg-top"></div>' +
        '</div>' +
        '<div class="clm-flt">' +
          '<input type="text" id="clm-q" class="no-upper" placeholder="Search patient, PCN, CPT, Acct#" oninput="cdcClaimsRefilter()">' +
          '<select id="clm-payer" onchange="cdcClaimsRefilter()"><option value="">All payers</option></select>' +
          '<select id="clm-month" onchange="cdcClaimsRefilter()"><option value="">All months</option></select>' +
          '<label class="clm-dos">DOS <input type="date" id="clm-dos-from" onchange="cdcClaimsRefilter()"> <span>to</span> <input type="date" id="clm-dos-to" onchange="cdcClaimsRefilter()"></label>' +
          '<button type="button" class="clm-ib" data-tip="Clear dates" aria-label="Clear dates" onclick="document.getElementById(\'clm-dos-from\').value=\'\';document.getElementById(\'clm-dos-to\').value=\'\';cdcClaimsRefilter()">' + ico('calendar-x', 15) + '</button>' +
          '<span class="clm-sp"></span>' +
          '<button type="button" class="clm-ib" data-tip="Select all on this page" aria-label="Select all on this page" onclick="selectAllClaims(true)">' + ico('check-square', 16) + '</button>' +
          '<button type="button" class="clm-ib" data-tip="Clear selection" aria-label="Clear selection" onclick="selectAllClaims(false)">' + ico('square', 16) + '</button>' +
          '<button type="button" class="clm-ib xl" data-tip="Export this list to Excel" aria-label="Export this list to Excel" onclick="cdcClaimsExport()">' + ico('file-spreadsheet', 17) + '</button>' +
        '</div>' +
        '<div class="clm-bar" id="clm-bulk-bar"></div>' +
        '<div class="clm-body" id="claims-tbl"></div>' +
        '<div class="clm-foot" id="clm-pg-bot"></div>' +
      '</div>';
    icons();
  }

  /* ---------------- data ---------------- */
  function monthKey(dos) {
    var s = String(dos || '').trim();
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    var p = s.split('/');
    return p.length === 3 ? p[2].padStart(4, '0') + '-' + p[0].padStart(2, '0') : '';
  }
  function iso(dos) {
    var s = String(dos || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var p = s.split('/');
    return (p.length === 3 && p[2].length === 4) ? p[2] + '-' + p[0].padStart(2, '0') + '-' + p[1].padStart(2, '0') : s;
  }

  function build(db) {
    var pats = {}; (db.patients || []).forEach(function (p) { pats[p.id] = p; });
    var all = (db.claims || []).filter(function (c) { return c.providerId === activeProviderId; });

    // payer + month options (keep the current choice)
    var payerOf = function (c) { var p = pats[c.patId] || {}; return p.payerName || p.payerid || ''; };
    var ps = document.getElementById('clm-payer'), cur = ps ? ps.value : '';
    if (ps) ps.innerHTML = '<option value="">All payers</option>' + Array.from(new Set(all.map(payerOf).filter(Boolean))).sort().map(function (p) { return '<option value="' + esc(p) + '"' + (p === cur ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    var ms = document.getElementById('clm-month'), curM = ms ? ms.value : '';
    if (ms) ms.innerHTML = '<option value="">All months</option>' + Array.from(new Set(all.map(function (c) { return monthKey(c.dos); }).filter(Boolean))).sort().reverse().map(function (m) { return '<option value="' + m + '"' + (m === curM ? ' selected' : '') + '>' + m + '</option>'; }).join('');

    var q = val('clm-q').toLowerCase(), payerF = val('clm-payer'), monthF = val('clm-month'), from = val('clm-dos-from'), to = val('clm-dos-to');
    var list = all;
    if (S.tab !== 'all') list = list.filter(function (c) { return (c.status || 'draft') === S.tab; });
    if (from || to) list = list.filter(function (c) {
      var d = [c.dos].concat((c.lines || []).map(function (l) { return l.dos; })).filter(Boolean).map(iso).sort();
      if (!d.length) return !from;
      return !(from && d[d.length - 1] < from) && !(to && d[0] > to);
    });
    if (q) list = list.filter(function (c) {
      var p = pats[c.patId] || {};
      var dx = Array.isArray(c.dx) ? c.dx.join(' ') : String(c.dx || '');
      return [c.pcn, p.last, p.first, p.acct, c.acct, dx, (c.lines || []).map(function (l) { return l.cpt; }).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (payerF) list = list.filter(function (c) { return payerOf(c) === payerF; });
    if (monthF) list = list.filter(function (c) { return monthKey(c.dos) === monthF; });

    var key = function (c) {
      var p = pats[c.patId] || {};
      switch (S.sort) {
        case 'pcn': return (c.pcn || '').toLowerCase();
        case 'acct': return (p.acct || c.acct || '').toLowerCase();
        case 'patient': return ((p.last || '') + ', ' + (p.first || '')).toLowerCase();
        case 'cpts': return (c.lines || []).map(function (l) { return l.cpt || ''; }).join(' ').toLowerCase();
        case 'lines': return (c.lines || []).length;
        case 'total': return claimTotal(c);
        case 'status': return c.status || 'draft';
        default: return iso(c.dos);
      }
    };
    list = list.slice().sort(function (a, b) {
      var x = key(a), y = key(b);
      if (typeof x === 'number') return S.asc ? x - y : y - x;
      return x < y ? (S.asc ? -1 : 1) : x > y ? (S.asc ? 1 : -1) : 0;
    });
    return { list: list, pats: pats, all: all, filtered: !!(q || payerF || monthF || from || to || S.tab !== 'all') };
  }

  /* ---------------- rows per page from the screen ---------------- */
  function fitSize() {
    var body = document.getElementById('claims-tbl');
    var h = body ? body.clientHeight : 0;
    return Math.max(5, Math.floor((h - HEAD_H - 2) / ROW_H));
  }

  /* ---------------- pieces ---------------- */
  function pager(total) {
    var pages = Math.max(1, Math.ceil(total / S.size)), p = S.page;
    var a = total ? p * S.size + 1 : 0, b = Math.min(total, (p + 1) * S.size);
    var nums = [], lo = Math.max(0, Math.min(p - 2, pages - 5)), hi = Math.min(pages - 1, lo + 4);
    if (lo > 0) { nums.push(0); if (lo > 1) nums.push(-1); }
    for (var i = lo; i <= hi; i++) nums.push(i);
    if (hi < pages - 1) { if (hi < pages - 2) nums.push(-1); nums.push(pages - 1); }
    return '<span class="clm-pg-info">' + a + '\u2013' + b + ' of ' + total + '</span>' +
      '<button type="button" class="clm-pg-b" aria-label="Previous page"' + (p <= 0 ? ' disabled' : ' onclick="cdcClaimsPage(' + (p - 1) + ')"') + '>' + ico('chevron-left', 14) + '</button>' +
      nums.map(function (n) { return n < 0 ? '<span class="clm-pg-gap">\u2026</span>' : '<button type="button" class="clm-pg-b' + (n === p ? ' on' : '') + '"' + (n === p ? '' : ' onclick="cdcClaimsPage(' + n + ')"') + '>' + (n + 1) + '</button>'; }).join('') +
      '<button type="button" class="clm-pg-b" aria-label="Next page"' + (p >= pages - 1 ? ' disabled' : ' onclick="cdcClaimsPage(' + (p + 1) + ')"') + '>' + ico('chevron-right', 14) + '</button>';
  }

  function bar(total) {
    var el = document.getElementById('clm-bulk-bar'); if (!el) return;
    var n = _selectedClaims.size;
    el.classList.toggle('sel', n > 0);
    if (!n) { el.innerHTML = '<span class="m">' + total + ' claim' + (total === 1 ? '' : 's') + ' in this list • tick claims to act on them</span>'; return; }
    var del = (typeof hasPermission === 'function' && hasPermission('Delete Claims')) ? '<button class="btn btn-xs btn-danger" onclick="bulkClaimAction(\'delete\')">' + ico('trash-2', 12) + ' Delete</button>' : '';
    el.innerHTML = '<span class="n">' + n + ' selected</span><div class="acts">' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'pending\')">' + ico('clock', 12) + ' Pending</button>' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'submitted\')">' + ico('send', 12) + ' Submit</button>' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'accepted\')">' + ico('check-circle', 12) + ' Accept</button>' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'rejected\')">' + ico('x-circle', 12) + ' Reject</button>' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'export\')">' + ico('download', 12) + ' Export 837P</button>' +
      '<button class="btn btn-xs" onclick="bulkClaimAction(\'pdf\')">' + ico('printer', 12) + ' Superbills PDF</button>' +
      '<button class="btn btn-xs btn-primary" onclick="bulkClaimAction(\'transmit\')">' + ico('send', 12) + ' Transmit</button>' + del +
      '</div><button class="btn btn-xs btn-ghost" style="margin-left:auto" onclick="selectAllClaims(false)">' + ico('x', 12) + ' Clear</button>';
    icons();
  }

  function moveInd() {
    var tabs = document.getElementById('clm-tabs'); if (!tabs) return;
    tabs.querySelectorAll('.clm-tab').forEach(function (b) { var a = b.getAttribute('data-t') === S.tab; b.classList.toggle('on', a); b.setAttribute('aria-selected', a); });
  }

  /* ---------------- render ---------------- */
  function renderClaims() {
    if (!activeProviderId) {
      var db0 = getDB(), ids = Array.from(new Set((db0.claims || []).map(function (c) { return c.providerId; }).filter(Boolean)));
      if (!ids.length) return;
      activeProviderId = ids[0];
    }
    var sec = document.getElementById('sec-claims'); if (!sec) return;
    injectCSS();
    if (!document.getElementById('claims-tbl')) skeleton(sec);
    moveInd();

    var db = getDB(), r = build(db), list = r.list, pats = r.pats;
    S.list = list;
    var body = document.getElementById('claims-tbl');
    if (body && !body.clientHeight && !S.retry) { S.retry = true; setTimeout(renderClaims, 60); }   // section not laid out yet
    else S.retry = false;
    var size = Math.min(fitSize(), S._fix && S.cap ? S.cap : 999);
    if (S.size && size !== S.size) S.page = Math.floor(S.page * S.size / size);   // keep roughly the same claims in view
    S.size = size;
    var pages = Math.max(1, Math.ceil(list.length / S.size));
    if (S.page >= pages) S.page = pages - 1;
    if (S.page < 0) S.page = 0;

    var top = pager(list.length);
    document.getElementById('clm-pg-top').innerHTML = top;
    document.getElementById('clm-pg-bot').innerHTML = '<div class="clm-pager" style="margin-left:0">' + top + '</div>';
    bar(list.length);

    var el = document.getElementById('claims-tbl');
    if (!list.length) {
      el.innerHTML = '<div class="clm-empty">' + ico('file-text', 34) + '<b>' + (r.filtered ? 'No matching claims' : 'No claims yet') + '</b><span>' + (r.all.length ? r.all.length + ' claims in total • try clearing the filters' : 'Create one from Billing > New Claim') + '</span></div>';
      icons(); return;
    }

    var pageList = list.slice(S.page * S.size, (S.page + 1) * S.size);
    var idx = {}; (db.claims || []).forEach(function (c, i) { idx[c.id] = i; });
    var allSel = pageList.every(function (c) { return _selectedClaims.has(c.id); });
    var th = function (label, f, w, cls) {
      return '<th style="width:' + w + '"' + (cls ? ' class="' + cls + '"' : '') + (f ? ' onclick="cdcClaimsSort(\'' + f + '\')"' : '') + '>' + label + (f && S.sort === f ? '<span class="ar">' + (S.asc ? '\u25B2' : '\u25BC') + '</span>' : '') + '</th>';
    };
    var rows = pageList.map(function (c) {
      var p = pats[c.patId] || {}, lines = Array.isArray(c.lines) ? c.lines : [], oi = idx[c.id], sel = _selectedClaims.has(c.id);
      var errs = (typeof validateClaim === 'function') ? validateClaim(c) : [];
      var errB = errs.length ? ' <span class="badge b-red" style="font-size:10px" title="' + esc(errs.join('\n')) + '">' + errs.length + '</span>' : '';
      var cid = esc(c.id);
      return '<tr class="' + (sel ? 'sel' : '') + '" data-cid="' + cid + '">' +
        '<td><input type="checkbox" data-cid="' + cid + '"' + (sel ? ' checked' : '') + ' onchange="toggleClaimSelect(\'' + cid + '\',this.checked)" aria-label="Select claim"></td>' +
        '<td><span class="clm-pcn" role="button" tabindex="0" title="Edit claim" onclick="openClaimDetail(\'' + cid + '\')" onkeydown="if(event.key===\'Enter\')openClaimDetail(\'' + cid + '\')">' + esc(c.pcn || '') + '</span></td>' +
        '<td>' + esc(p.acct || c.acct || '') + '</td>' +
        '<td style="font-weight:600">' + ((typeof ptLinkName === 'function') ? ptLinkName(p.id, p.last || '?', p.first || '') : esc((p.last || '') + ', ' + (p.first || ''))) + '</td>' +
        '<td>' + ((typeof claimDosRange === 'function') ? claimDosRange(c) : esc(c.dos || '')) + '</td>' +
        '<td class="clm-cpt" title="' + esc(lines.map(function (l) { return l.cpt; }).join(' ')) + '">' + esc(lines.map(function (l) { return l.cpt || ''; }).join(' ')) + '</td>' +
        '<td class="clm-num" style="font-weight:500">' + lines.length + '</td>' +
        '<td class="clm-num">' + money(claimTotal(c)) + '</td>' +
        '<td>' + ((typeof statusBadge === 'function') ? statusBadge(c.status || 'draft') : esc(c.status || 'draft')) + errB + '</td>' +
        '<td><div class="clm-acts">' +
          '<button class="btn-icon sm" onclick="openClaimDetail(\'' + cid + '\')" title="Edit">' + ico('pencil', 13) + '</button>' +
          '<button class="btn-icon sm" onclick="openStatusModal(' + oi + ')" title="Status">' + ico('refresh-cw', 13) + '</button>' +
          '<button class="btn-icon sm" onclick="genSuperbill(' + oi + ')" title="PDF">' + ico('printer', 13) + '</button>' +
          '<button class="btn-icon sm" onclick="quickDup(' + oi + ')" title="Duplicate">' + ico('copy', 13) + '</button>' +
          '<button class="btn-icon sm" onclick="toggleClaimActive(' + oi + ')" title="' + (c.inactive ? 'Activate' : 'Deactivate') + '" style="color:' + (c.inactive ? 'var(--green)' : 'var(--text3)') + '">' + ico(c.inactive ? 'toggle-left' : 'toggle-right', 13) + '</button>' +
        '</div></td></tr>';
    }).join('');

    el.innerHTML = '<table class="clm-tbl"><thead><tr>' +
      '<th class="ns" style="width:40px"><input type="checkbox"' + (allSel ? ' checked' : '') + ' onchange="selectAllClaims(this.checked)" aria-label="Select all on this page"></th>' +
      th('PCN', 'pcn', '15%') + th('Acct#', 'acct', '8%') + th('Patient', 'patient', '18%') + th('DOS', 'dos', '14%') + th('CPTs', 'cpts', '15%') +
      th('Lines', 'lines', '6%', 'clm-num') + th('Total', 'total', '9%', 'clm-num') + th('Status', 'status', '10%') + '<th class="ns" style="width:170px">Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    // if the last row does not fit (fonts, zoom...), show one row less per page instead of hiding it
    if (!S._fix && body && body.scrollHeight > body.clientHeight + 1 && S.size > 5) {
      S._fix = true; S.cap = S.size - Math.ceil((body.scrollHeight - body.clientHeight) / ROW_H); renderClaims(); S._fix = false; return;
    }
    icons();
  }

  /* ---------------- selection (fixed bar, table stays put) ---------------- */
  window.toggleClaimSelect = function (id, on) {
    if (on) _selectedClaims.add(id); else _selectedClaims.delete(id);
    var tr = document.querySelector('#claims-tbl tr[data-cid="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
    if (tr) tr.classList.toggle('sel', !!on);
    bar(S.list.length);
  };
  window.selectAllClaims = function (on) {
    if (on) document.querySelectorAll('#claims-tbl tbody input[type=checkbox][data-cid]').forEach(function (cb) { _selectedClaims.add(cb.getAttribute('data-cid')); });
    else _selectedClaims.clear();
    renderClaims();
  };

  /* ---------------- Excel export of the list on screen (all pages) ---------------- */
  window.cdcClaimsExport = function () {
    if (typeof XLSX === 'undefined') { try { toast('Excel library is still loading. Try again in a moment.', 'warn'); } catch (e) {} return; }
    var db = getDB(), r = build(db), list = r.list;
    if (!list.length) { try { toast('There are no claims in this list to export.', 'warn'); } catch (e) {} return; }
    var prov = (db.providers || []).find(function (p) { return p.id === activeProviderId; }) || {};
    var LBL = { draft: 'Draft', pending: 'Pending', submitted: 'Submitted', accepted: 'Accepted CH', rejected: 'Rejected', denied: 'Denied', on_hold: 'On Hold', paid: 'Paid', partially_paid: 'Partial', partial: 'Partial', voided: 'Voided' };
    var head = ['PCN', 'Acct#', 'Patient Last', 'Patient First', 'DOB', 'Payer', 'Member ID', 'DOS', 'CPTs', 'Lines', 'Total Billed', 'Paid', 'Balance', 'Status'];
    var rows = list.map(function (c) {
      var p = r.pats[c.patId] || {}, tot = claimTotal(c), paid = parseFloat(c.paid) || 0;
      var dos = (typeof claimDosRange === 'function') ? String(claimDosRange(c)).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : (c.dos || '');
      return [c.pcn || '', p.acct || c.acct || '', p.last || '', p.first || '', p.dob || '', p.payerName || p.payerid || '', p.insnum || p.memberId || '', dos,
        (c.lines || []).map(function (l) { return l.cpt || ''; }).join(' '), (c.lines || []).length,
        Math.round(tot * 100) / 100, Math.round(paid * 100) / 100, Math.round(Math.max(0, tot - paid) * 100) / 100, LBL[c.status || 'draft'] || c.status || 'Draft'];
    });
    var ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
    ws['!cols'] = [18, 10, 20, 16, 12, 28, 16, 24, 30, 7, 13, 11, 11, 13].map(function (w) { return { wch: w }; });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    for (var i = 1; i <= rows.length; i++) [10, 11, 12].forEach(function (col) { var cell = ws[XLSX.utils.encode_cell({ r: i, c: col })]; if (cell) cell.z = '$#,##0.00'; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Claims');
    var tabName = (TABS.find(function (t) { return t[0] === S.tab; }) || ['', 'All'])[1].replace(/\s+/g, '');
    var name = 'Claims_' + String(prov.name || 'Provider').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + tabName + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, name);
    try { toast(rows.length + ' claims exported to Excel', 'ok'); } catch (e) {}
  };

  /* ---------------- controls ---------------- */
  window.cdcClaimsTab = function (t) { S.tab = t; S.page = 0; renderClaims(); };
  window.cdcClaimsPage = function (p) { S.page = p; renderClaims(); };
  window.cdcClaimsSort = function (f) { if (S.sort === f) S.asc = !S.asc; else { S.sort = f; S.asc = f !== 'dos' && f !== 'total'; } S.page = 0; renderClaims(); };
  window.cdcClaimsRefilter = function () { S.page = 0; renderClaims(); };
  window.renderClaims = renderClaims;

  // Refit rows per page when the window size changes
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var sec = document.getElementById('sec-claims');
      if (sec && sec.classList.contains('active') && document.getElementById('claims-tbl')) renderClaims();
    }, 150);
  });
})();
