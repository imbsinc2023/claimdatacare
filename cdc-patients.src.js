/*
 * ClaimDataCare  •  Patients list
 * File: cdc-patients.js  •  v1.0
 *
 * Replaces the patients list that lived in script1.js (renderPatients, _patGoPage,
 * _patSetPgSize and the old page markup were removed there). Same look as the Claims list:
 *   • Title row with the pager fixed at the top right, actions on the right
 *   • One filter row (search + payer)
 *   • Rows per page computed from the screen height (no page scrolling); pager also at the bottom
 *   • Patient initials in solid colours: magenta women, blue men, violet when not set
 *   • Clicking the name or file # opens the patient chart
 */
(function () {
  'use strict';
  var S = { page: 0, size: 0, sort: 'last', asc: true, list: [] };
  var ROW_H = 40, HEAD_H = 38;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px"></i>'; }
  function icons() { try { if (typeof _renderLucideIcons === 'function') setTimeout(_renderLucideIcons, 10); } catch (e) {} }
  function isSA() { try { var s = getSession(); return s && s.role === 'Super Admin'; } catch (e) { return false; } }
  function ins(p) {
    var b = {}; try { b = _resolvePatientInsurance(p) || {}; } catch (e) {}
    return { sub: p.subNum || b.subNum || '', pid: p.payerid || b.payerId || '', payer: p.payerName || b.name || '', plan: p.plan || b.plan || '', rel: p.relation || p.rel || b.rel || '' };
  }

  var STYLE = [
    '#sec-patients.section{overflow:hidden}',
    '.pts{display:flex;flex-direction:column;height:100%;min-height:0;gap:10px}',
    '.pts-hd{flex:none;display:flex;align-items:center;gap:12px;min-height:46px;border-bottom:1px solid #E4E9F1;padding-bottom:6px}',
    '.pts-title{margin:0;font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap}',
    '.pts-sp{flex:1}',
    '.pts-flt{flex:none;display:flex;align-items:center;gap:8px;min-width:0}',
    '.pts-flt input{flex:1 1 260px;min-width:160px;max-width:360px;height:34px}',
    '.pts-flt select{height:34px;max-width:240px}',
    '.pts-bar{flex:none;height:40px;display:flex;align-items:center;padding:0 12px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF1F6;font-size:12px;color:#586579}',
    '.pts-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;border:1px solid #EEF1F6;border-radius:14px;background:#fff}',
    '.pts-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px}',
    '.pts-tbl th{height:' + HEAD_H + 'px;padding:0 10px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;background:#F8FAFC;border-bottom:1px solid #EEF1F6;white-space:nowrap;overflow:hidden;cursor:pointer;user-select:none}',
    '.pts-tbl th.ns{cursor:default}',
    '.pts-tbl th .ar{color:#FF6A3D;margin-left:3px}',
    '.pts-tbl td{height:' + ROW_H + 'px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid #F1F4F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}',
    '.pts-tbl tbody tr{transition:background-color .12s}',
    '.pts-tbl tbody tr:hover{background:#F8FAFC}',
    '.pts-who{display:flex;align-items:center;gap:9px;min-width:0;cursor:pointer}',
    '.pts-av{width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#fff;background:#7B2FF7}',
    '.pts-av.f{background:#E8367A}.pts-av.m{background:#00A3D1}',
    '.pts-nm{font-weight:700;color:#0B1526;overflow:hidden;text-overflow:ellipsis;border-radius:6px;padding:2px 4px;margin-left:-4px;transition:background-color .15s,color .15s}',
    '.pts-who:hover .pts-nm{background:rgba(255,106,61,.1);color:#D45C37}',
    '.pts-acct{font-family:var(--mono,monospace);font-size:11.5px;color:#3A475C;cursor:pointer;border-radius:6px;padding:3px 6px;margin-left:-6px;transition:background-color .15s,color .15s}',
    '.pts-acct:hover{background:rgba(255,106,61,.1);color:#D45C37}',
    '.pts-mono{font-family:var(--mono,monospace);font-size:11.5px;color:#3A475C}',
    '.pts-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:700;background:#EEF1F6;color:#586579}',
    '.pts-cnt.on{background:rgba(255,106,61,.12);color:#D45C37}',
    '.pts-acts{display:flex;gap:2px}',
    '.pts-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#586579;font-size:13px}',
    '.pts-empty b{font-size:15px;color:#0B1526}',
    '.pts-foot{flex:none;display:flex;justify-content:flex-end;min-height:30px}',
    /* pager and icon buttons (same rules as the Claims list, so the page works on its own) */
    '.clm-pager{display:flex;align-items:center;gap:6px;justify-content:flex-end}',
    '.clm-pg-info{font-size:11.5px;color:#586579;white-space:nowrap;min-width:120px;text-align:right;font-variant-numeric:tabular-nums}',
    '.clm-pg-b{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}',
    '.clm-pg-b.on{background:#FF6A3D;border-color:#FF6A3D;color:#fff;cursor:default}',
    '.clm-pg-b[disabled]{opacity:.35;cursor:default}',
    '.clm-pg-gap{width:14px;text-align:center;color:#8C98AB;font-size:12px}',
    '.clm-ib{position:relative;width:34px;height:34px;flex:none;border:1px solid #E4E9F1;border-radius:10px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '@media (max-width:1100px){.pts-hd{flex-wrap:wrap}}'
  ].join('\n');

  function skeleton(sec) {
    if (!document.getElementById('pts-style')) { var st = document.createElement('style'); st.id = 'pts-style'; st.textContent = STYLE; document.head.appendChild(st); }
    sec.innerHTML = '<div class="pts">' +
      '<div class="pts-hd"><h1 class="pts-title">Patients</h1><span class="pts-sp"></span>' +
        '<div class="clm-pager" id="pts-pg-top" style="margin:0"></div>' +
        '<button type="button" class="clm-ib" data-tip="Import from CM Clients" aria-label="Import from CM Clients" onclick="openImportFromCMClientsModal()">' + ico('download', 16) + '</button>' +
        '<button type="button" class="cdc-ok" onclick="openPatientModal(-1)">' + ico('user-plus', 15) + 'New patient</button></div>' +
      '<div class="pts-flt"><input type="text" id="pat-q" class="no-upper" placeholder="Search name, File #, subscriber ID, payer" oninput="_ptsRefilter()">' +
        '<select id="pat-payer" onchange="_ptsRefilter()"><option value="">All payers</option></select></div>' +
      '<div class="pts-bar" id="pts-bar"></div>' +
      '<div class="pts-body" id="patients-tbl"></div>' +
      '<div class="pts-foot"><div class="clm-pager" id="pts-pg-bot"></div></div>' +
    '</div>';
  }
  function fitSize() { var b = document.getElementById('patients-tbl'), h = b ? b.clientHeight : 0; return Math.max(5, Math.floor((h - HEAD_H - 2) / ROW_H)); }
  function pager(total) {
    var pages = Math.max(1, Math.ceil(total / S.size)), p = S.page;
    var a = total ? p * S.size + 1 : 0, b = Math.min(total, (p + 1) * S.size);
    var nums = [], lo = Math.max(0, Math.min(p - 2, pages - 5)), hi = Math.min(pages - 1, lo + 4);
    if (lo > 0) { nums.push(0); if (lo > 1) nums.push(-1); }
    for (var i = lo; i <= hi; i++) nums.push(i);
    if (hi < pages - 1) { if (hi < pages - 2) nums.push(-1); nums.push(pages - 1); }
    return '<span class="clm-pg-info">' + a + '\u2013' + b + ' of ' + total + '</span>' +
      '<button type="button" class="clm-pg-b" aria-label="Previous page"' + (p <= 0 ? ' disabled' : ' onclick="_patGoPage(' + (p - 1) + ')"') + '>' + ico('chevron-left', 14) + '</button>' +
      nums.map(function (n) { return n < 0 ? '<span class="clm-pg-gap">\u2026</span>' : '<button type="button" class="clm-pg-b' + (n === p ? ' on' : '') + '"' + (n === p ? '' : ' onclick="_patGoPage(' + n + ')"') + '>' + (n + 1) + '</button>'; }).join('') +
      '<button type="button" class="clm-pg-b" aria-label="Next page"' + (p >= pages - 1 ? ' disabled' : ' onclick="_patGoPage(' + (p + 1) + ')"') + '>' + ico('chevron-right', 14) + '</button>';
  }

  var COLS = [['acct', 'File #', '9%'], ['last', 'Last, first', '22%'], ['dob', 'DOB', '9%'], ['sub', 'Subscriber ID', '12%'], ['pid', 'Payer ID', '8%'], ['payer', 'Payer', '20%'], ['plan', 'Plan', '7%'], ['rel', 'Rel', '5%'], ['claims', 'Claims', '7%'], ['', '', '8%']];

  window.renderPatients = function () {
    var sec = document.getElementById('sec-patients'); if (!sec) return;
    if (!document.getElementById('patients-tbl') || !sec.querySelector('.pts')) skeleton(sec);
    var T = typeof cdcPersonTerm === 'function' ? cdcPersonTerm() : 'Patient';
    var ttl = sec.querySelector('.pts-title'); if (ttl) ttl.textContent = T + 's';
    var nb = sec.querySelector('.pts-hd .cdc-ok'); if (nb) nb.lastChild.textContent = 'New ' + T.toLowerCase();
    var db = getDB(), q = val('pat-q').toLowerCase(), pf = val('pat-payer');
    var all = (db.patients || []).filter(function (p) { return p.providerId === activeProviderId; });
    var counts = {}; (db.claims || []).forEach(function (c) { if (c.providerId === activeProviderId) counts[c.patId] = (counts[c.patId] || 0) + 1; });
    var rows = all.map(function (p) { var i = ins(p); return { p: p, i: i, n: counts[p.id] || 0 }; });
    // payer filter options (kept when re-rendering)
    var sel = document.getElementById('pat-payer');
    if (sel) {
      var payers = {}; rows.forEach(function (r) { if (r.i.payer) payers[r.i.payer] = 1; });
      var cur = sel.value;
      sel.innerHTML = '<option value="">All payers</option>' + Object.keys(payers).sort().map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    }
    if (q) rows = rows.filter(function (r) { return ((r.p.last || '') + ' ' + (r.p.first || '') + ' ' + (r.p.acct || '') + ' ' + r.i.sub + ' ' + r.i.payer + ' ' + r.i.pid).toLowerCase().indexOf(q) >= 0; });
    if (pf) rows = rows.filter(function (r) { return r.i.payer === pf; });
    var key = function (r) {
      switch (S.sort) { case 'acct': return r.p.acct || ''; case 'dob': return r.p.dob || ''; case 'sub': return r.i.sub; case 'pid': return r.i.pid; case 'payer': return r.i.payer; case 'plan': return r.i.plan; case 'rel': return r.i.rel; case 'claims': return r.n; default: return ((r.p.last || '') + ' ' + (r.p.first || '')).toUpperCase(); }
    };
    rows.sort(function (a, b) { var x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (S.asc ? 1 : -1); });
    S.list = rows;
    S.size = Math.min(fitSize(), S._fixing && S.sizeCap ? S.sizeCap : 999); if (!S._fixing) S.sizeCap = 0;
    var pages = Math.max(1, Math.ceil(rows.length / S.size)); if (S.page >= pages) S.page = pages - 1; if (S.page < 0) S.page = 0;
    var view = rows.slice(S.page * S.size, (S.page + 1) * S.size);
    var bar = document.getElementById('pts-bar');
    if (bar) bar.textContent = rows.length + ' patient' + (rows.length === 1 ? '' : 's') + (rows.length !== all.length ? ' of ' + all.length : '') + ' • click a name to open the chart';
    var top = document.getElementById('pts-pg-top'), bot = document.getElementById('pts-pg-bot');
    if (top) top.innerHTML = pager(rows.length); if (bot) bot.innerHTML = pager(rows.length);
    var body = document.getElementById('patients-tbl');
    if (!rows.length) { body.innerHTML = '<div class="pts-empty"><b>' + (all.length ? 'No patients match' : 'No patients yet') + '</b>' + (all.length ? 'Change the search or the payer filter.' : 'Use New patient to add the first one.') + '</div>'; icons(); return; }
    var sa = isSA();
    body.innerHTML = '<table class="pts-tbl"><colgroup>' + COLS.map(function (c) { return '<col style="width:' + c[2] + '">'; }).join('') + '</colgroup><thead><tr>' +
      COLS.map(function (c) { return c[0] ? '<th onclick="_ptsSort(\'' + c[0] + '\')">' + c[1] + (S.sort === c[0] ? '<span class="ar">' + (S.asc ? '\u25B2' : '\u25BC') + '</span>' : '') + '</th>' : '<th class="ns"></th>'; }).join('') + '</tr></thead><tbody>' +
      view.map(function (r) {
        var p = r.p, id = esc(p.id), ini = ((p.first || '?')[0] + (p.last || '?')[0]).toUpperCase(), sx = String(p.sex || '').toUpperCase();
        return '<tr>' +
          '<td><span class="pts-acct" onclick="openPatientChart(\'' + id + '\')">' + esc(p.acct || '') + '</span></td>' +
          '<td><div class="pts-who" onclick="openPatientChart(\'' + id + '\')"><span class="pts-av' + (sx === 'F' ? ' f' : sx === 'M' ? ' m' : '') + '">' + esc(ini) + '</span><span class="pts-nm">' + esc((p.last || '').toUpperCase() + ', ' + (p.first || '').toUpperCase()) + '</span></div></td>' +
          '<td class="pts-mono">' + esc(p.dob || '') + '</td><td class="pts-mono">' + esc(r.i.sub) + '</td><td class="pts-mono">' + esc(r.i.pid) + '</td>' +
          '<td title="' + esc(r.i.payer) + '">' + esc(r.i.payer) + '</td><td>' + esc(r.i.plan || '•') + '</td><td>' + esc(r.i.rel) + '</td>' +
          '<td><span class="pts-cnt' + (r.n ? ' on' : '') + '">' + r.n + '</span></td>' +
          '<td><div class="pts-acts"><button type="button" class="btn-icon sm" data-tip="Edit" aria-label="Edit" onclick="openPatientChart(\'' + id + '\');setTimeout(function(){_renderChartTab(\'demographics\');},100)">' + ico('pencil', 14) + '</button>' +
            (sa ? '<button type="button" class="btn-icon sm" data-tip="Delete" aria-label="Delete" onclick="deletePatientConfirm(\'' + id + '\')">' + ico('trash-2', 14) + '</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table>';
    // if the last row does not fit (fonts, zoom...), show one row less per page instead of hiding it
    if (!S._fixing && body.scrollHeight > body.clientHeight + 1 && S.size > 5) {
      S._fixing = true; S.sizeCap = S.size - Math.ceil((body.scrollHeight - body.clientHeight) / ROW_H); renderPatients(); S._fixing = false; return;
    }
    icons();
  };
  window._patGoPage = function (p) { S.page = p; renderPatients(); };
  window._patSetPgSize = function () { renderPatients(); };   // kept for old callers; size now fits the screen
  window._ptsRefilter = function () { S.page = 0; renderPatients(); };
  window._ptsSort = function (k) { if (S.sort === k) S.asc = !S.asc; else { S.sort = k; S.asc = k !== 'claims'; } renderPatients(); };
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { var s = document.getElementById('sec-patients'); if (s && s.classList.contains('active')) renderPatients(); }, 150);
  });
})();
