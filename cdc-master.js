/*
 * ClaimDataCare  •  Master Settings
 * File: cdc-master.js  •  v1.0
 *
 * Only the Super Admin / owner and Managers can open it (checked again on every action).
 * Works for every specialty of the active provider group.
 *
 * Tool: Merge charts
 *   1. Enter the File # of the chart that STAYS (original) and of the DUPLICATE.
 *   2. Review both charts and everything linked to each one.
 *   3. Confirm by typing the duplicate's File #.
 *   4. Everything linked to the duplicate (claims, appointments, notes, case management
 *      notes, plans, authorizations...) moves to the original; empty fields of the
 *      original are completed with the duplicate's data. The merge is recorded.
 *   5. Optional: delete the duplicate chart, after showing it has nothing left.
 * Static window: messages use a fixed space, nothing moves.
 */
(function () {
  'use strict';

  var REF_KEYS = ['patId', 'patientId', 'clientId'];
  var LABELS = {
    claims: 'Claims', appointments: 'Appointments', notes: 'Clinical notes', intakeClients: 'Intake',
    intakeSubmissions: 'Intake submissions', evaluations: 'Evaluations', eobUnmatched: 'Unmatched EOB lines',
    encounters: 'CM notes', plans: 'Care plans', authorizations: 'Authorizations', assessments: 'Assessments',
    tasks: 'Tasks', billing: 'CM billing', referrals: 'Referrals', eligibility: 'Eligibility checks',
    communityReferrals: 'Community referrals', discharges: 'Discharges', documents: 'Documents'
  };
  var state = { orig: null, dup: null, merged: false };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function allowed() { try { return _cdcCanMasterSettings(); } catch (e) { return false; } }
  function fileNo(p) { return String((p && (p.acct || p.fileNo)) || '').trim(); }
  function fullName(p) { return ((p.last || '') + ', ' + (p.first || '')).replace(/^, |, $/, '') || '(no name)'; }

  function groupPatients() {
    var db = getDB();
    return (db.patients || []).filter(function (p) { return p && p.providerId === activeProviderId; });
  }
  function findByFile(no) {
    no = String(no || '').trim().toLowerCase();
    if (!no) return null;
    var hits = groupPatients().filter(function (p) { return fileNo(p).toLowerCase() === no; });
    return hits.length === 1 ? hits[0] : (hits.length > 1 ? 'many' : null);
  }

  // Every place a chart can be linked: app collections + case management data
  function sources() {
    var out = [];
    var db = getDB();
    Object.keys(db).forEach(function (k) {
      if (k === 'patients' || !Array.isArray(db[k])) return;
      out.push({ where: 'db', key: k, list: db[k] });
    });
    try {
      var cm = getCMData();
      Object.keys(cm || {}).forEach(function (k) {
        if (k === 'clients' || k === 'clientsBackup' || !Array.isArray(cm[k])) return;
        out.push({ where: 'cm', key: k, list: cm[k] });
      });
    } catch (e) {}
    return out;
  }
  function linkedCounts(id) {
    var res = {}, total = 0;
    sources().forEach(function (src) {
      var n = 0;
      src.list.forEach(function (o) { if (o && REF_KEYS.some(function (k) { return o[k] === id; })) n++; });
      if (n) { res[src.key] = (res[src.key] || 0) + n; total += n; }
    });
    return { byKey: res, total: total };
  }

  /* ---------------- UI ---------------- */
  var CSS = [
    '#cdm-ov{position:fixed;inset:0;z-index:9500;background:rgba(11,21,38,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto;font-family:inherit}',
    '.cdm{width:100%;max-width:1060px;background:var(--bg2,#fff);color:var(--text,#0B1526);border-radius:22px;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.5)}',
    '.cdm-bar{height:5px;background:linear-gradient(90deg,#FF6A3D,#FF6A3D 38%,#6A1BDB 70%,#00A3D1)}',
    '.cdm-top{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--border,#E4E9F1)}',
    '.cdm-top h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.02em}',
    '.cdm-top small{display:block;color:var(--text3,#586579);font-size:12.5px;margin-top:2px}',
    '.cdm-x{width:38px;height:38px;border:0;border-radius:10px;background:transparent;cursor:pointer;color:var(--text3,#586579);display:flex;align-items:center;justify-content:center}',
    '.cdm-x:hover{background:var(--bg3,#EEF1F6);color:var(--text,#0B1526)}',
    '.cdm-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:520px}',
    '.cdm-nav{border-right:1px solid var(--border,#E4E9F1);padding:14px 10px;display:flex;flex-direction:column;gap:4px;background:var(--bg,#F8FAFD)}',
    '.cdm-nav button{display:flex;align-items:center;gap:10px;border:0;background:transparent;text-align:left;padding:10px 12px;border-radius:10px;font:600 13px inherit;color:var(--text2,#3A475C);cursor:pointer}',
    '.cdm-nav button.on{background:linear-gradient(95deg,rgba(255,106,61,.12),rgba(106,27,219,.12));color:#4B1699}',
    '.cdm-main{padding:22px 26px 26px}',
    '.cdm-main h3{margin:0 0 4px;font-size:17px}',
    '.cdm-lead{margin:0 0 16px;color:var(--text3,#586579);font-size:13.5px;line-height:1.5}',
    '.cdm-msg{height:48px;display:flex;align-items:center;margin-bottom:10px}',
    '.cdm-msg>div{width:100%;padding:11px 14px;border-radius:12px;font-size:13px;font-weight:500;animation:cdmin .18s ease-out}',
    '.cdm-msg .err{background:#FFF1EC;color:#9A3412}.cdm-msg .ok{background:#E3F5FB;color:#065E7C}.cdm-msg .info{background:#F1EAFD;color:#4B1699}',
    '@keyframes cdmin{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}',
    '.cdm-row{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end}',
    '.cdm-f label{display:block;font-size:12px;font-weight:600;margin-bottom:6px}',
    '.cdm-f input{width:100%;box-sizing:border-box;height:44px;padding:0 14px;border:1.5px solid var(--border2,#D6DDE8);border-radius:12px;font:15px inherit;background:var(--bg2,#fff);color:inherit}',
    '.cdm-f input:focus{outline:none;border-color:#D45C37;box-shadow:0 0 0 4px rgba(255,106,61,.18)}',
    '.cdm-btn{height:44px;padding:0 20px;border:0;border-radius:12px;font:700 14px inherit;cursor:pointer;color:#fff;background:linear-gradient(95deg,#C9431C,#D45C37);white-space:nowrap}',
    '.cdm-btn[disabled]{opacity:.45;cursor:not-allowed}',
    '.cdm-btn.ghost{background:transparent;color:var(--text,#0B1526);border:1.5px solid var(--border2,#D6DDE8)}',
    '.cdm-btn.danger{background:linear-gradient(95deg,#D45C37,#9A3412)}',
    '.cdm-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;min-height:250px}',
    '.cdm-card{border:1px solid var(--border,#E4E9F1);border-radius:16px;padding:16px 18px;position:relative}',
    '.cdm-card.keep{border-color:#6A1BDB;box-shadow:0 0 0 3px rgba(106,27,219,.12)}',
    '.cdm-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.1em;padding:3px 9px;border-radius:999px;margin-bottom:10px}',
    '.cdm-tag.keep{background:#F1EAFD;color:#4B1699}.cdm-tag.dup{background:#FFEDE6;color:#8F3314}.cdm-tag.gone{background:#EEF1F6;color:#586579}',
    '.cdm-name{font-size:17px;font-weight:700}',
    '.cdm-meta{font-size:12.5px;color:var(--text3,#586579);margin:4px 0 12px}',
    '.cdm-li{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border,#EEF1F6)}',
    '.cdm-li:last-child{border-bottom:0}',
    '.cdm-total{margin-top:10px;font-weight:700;font-size:13px}',
    '.cdm-confirm{margin-top:18px;padding:16px 18px;border-radius:16px;background:var(--bg,#F8FAFD);border:1px dashed var(--border2,#D6DDE8);display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}',
    '.cdm-empty{display:flex;align-items:center;justify-content:center;color:var(--text3,#586579);font-size:13px;border:1.5px dashed var(--border2,#D6DDE8);border-radius:16px}',
    '@media (max-width:820px){.cdm-body{grid-template-columns:1fr}.cdm-nav{flex-direction:row;border-right:0;border-bottom:1px solid var(--border,#E4E9F1)}.cdm-row,.cdm-cards,.cdm-confirm{grid-template-columns:1fr}}'
  ].join('\n');

  function injectCSS() { if ($('cdm-style')) return; var st = document.createElement('style'); st.id = 'cdm-style'; st.textContent = CSS; document.head.appendChild(st); }
  function msg(text, kind) { var m = $('cdm-msg'); if (!m) return; m.innerHTML = text ? '<div class="' + (kind || 'info') + '"></div>' : ''; if (text) m.firstChild.textContent = text; }

  function card(p, role) {
    var c = linkedCounts(p.id);
    var rows = Object.keys(c.byKey).map(function (k) { return '<div class="cdm-li"><span>' + esc(LABELS[k] || k) + '</span><b>' + c.byKey[k] + '</b></div>'; }).join('') || '<div class="cdm-li"><span>No linked records</span><b>0</b></div>';
    var tag = role === 'keep' ? '<span class="cdm-tag keep">STAYS • ORIGINAL</span>' : role === 'gone' ? '<span class="cdm-tag gone">DUPLICATE • EMPTY</span>' : '<span class="cdm-tag dup">DUPLICATE • WILL MOVE</span>';
    return '<div class="cdm-card' + (role === 'keep' ? ' keep' : '') + '">' + tag +
      '<div class="cdm-name">' + esc(fullName(p)) + '</div>' +
      '<div class="cdm-meta">File #' + esc(fileNo(p)) + ' • DOB ' + esc(p.dob || '•') + (p.medicaidId || p.memberId ? ' • ID ' + esc(p.medicaidId || p.memberId) : '') + '</div>' +
      rows + '<div class="cdm-total">' + c.total + ' linked record(s)</div></div>';
  }

  function mergeView() {
    return '<h3>Merge charts</h3>' +
      '<p class="cdm-lead">Join two charts of the same person. Everything in the duplicate moves to the original; the original is never overwritten, only its empty fields are completed. Works for every specialty of this provider.</p>' +
      '<div id="cdm-msg" class="cdm-msg" role="status" aria-live="polite"></div>' +
      '<div class="cdm-row">' +
        '<div class="cdm-f"><label for="cdm-orig">Original chart File # (stays)</label><input id="cdm-orig" autocomplete="off" placeholder="e.g. 1024"></div>' +
        '<div class="cdm-f"><label for="cdm-dup">Duplicate chart File #</label><input id="cdm-dup" autocomplete="off" placeholder="e.g. 1187"></div>' +
        '<button type="button" class="cdm-btn ghost" id="cdm-find">Find charts</button>' +
      '</div>' +
      '<div class="cdm-cards" id="cdm-cards"><div class="cdm-empty" style="grid-column:1/-1">Enter both File numbers and press Find charts.</div></div>' +
      '<div id="cdm-step"></div>';
  }

  function render() {
    injectCSS();
    var ov = $('cdm-ov'); if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'cdm-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Master Settings');
    var prov = (getDB().providers || []).find(function (p) { return p.id === activeProviderId; }) || {};
    ov.innerHTML = '<div class="cdm"><div class="cdm-bar"></div>' +
      '<div class="cdm-top"><div><h2>Master Settings</h2><small>' + esc(prov.name || '') + ' • Managers and Super Admin only</small></div>' +
      '<button type="button" class="cdm-x" id="cdm-close" title="Close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="cdm-body"><nav class="cdm-nav" aria-label="Master settings sections"><button type="button" class="on" id="cdm-nav-merge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l4-4 4 4M12 2v10.3a4 4 0 0 1-1.2 2.8L4 22M20 22l-5-5"/></svg>Merge charts</button></nav>' +
      '<section class="cdm-main" id="cdm-main">' + mergeView() + '</section></div></div>';
    document.body.appendChild(ov);
    $('cdm-close').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', escKey);
    wireMerge();
    setTimeout(function () { try { $('cdm-orig').focus(); } catch (e) {} }, 60);
  }
  function escKey(e) { if (e.key === 'Escape') close(); }
  function close() { var ov = $('cdm-ov'); if (ov) ov.remove(); document.removeEventListener('keydown', escKey); state = { orig: null, dup: null, merged: false }; }

  function wireMerge() {
    $('cdm-find').addEventListener('click', find);
    ['cdm-orig', 'cdm-dup'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') find(); }); });
  }

  function find() {
    if (!allowed()) { msg('You do not have access to Master Settings.', 'err'); return; }
    state = { orig: null, dup: null, merged: false };
    $('cdm-step').innerHTML = '';
    var a = $('cdm-orig').value.trim(), b = $('cdm-dup').value.trim();
    if (!a || !b) { msg('Enter both File numbers.', 'err'); return; }
    if (a.toLowerCase() === b.toLowerCase()) { msg('The two File numbers are the same chart.', 'err'); return; }
    var o = findByFile(a), d = findByFile(b);
    if (o === 'many' || d === 'many') { msg('More than one chart has that File # in this provider. Fix the File # first.', 'err'); return; }
    if (!o) { msg('No chart with File #' + a + ' in this provider.', 'err'); return; }
    if (!d) { msg('No chart with File #' + b + ' in this provider.', 'err'); return; }
    state.orig = o; state.dup = d;
    $('cdm-cards').innerHTML = card(o, 'keep') + card(d, 'dup');
    var sameName = String(o.last || '').toLowerCase() === String(d.last || '').toLowerCase() && String(o.dob || '') === String(d.dob || '');
    msg(sameName ? 'Charts found. Review them and confirm below.' : 'Warning: the last name or date of birth do not match. Make sure it is the same person.', sameName ? 'info' : 'err');
    $('cdm-step').innerHTML = '<div class="cdm-confirm"><div class="cdm-f"><label for="cdm-typed">To confirm, type the duplicate File # (' + esc(fileNo(d)) + ')</label><input id="cdm-typed" autocomplete="off"></div>' +
      '<button type="button" class="cdm-btn" id="cdm-go" disabled>Merge into original</button></div>';
    var typed = $('cdm-typed'), go = $('cdm-go');
    typed.addEventListener('input', function () { go.disabled = typed.value.trim().toLowerCase() !== fileNo(d).toLowerCase(); });
    go.addEventListener('click', doMerge);
    typed.focus();
  }

  function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length); }

  function doMerge() {
    if (!allowed()) { msg('You do not have access to Master Settings.', 'err'); return; }
    var o = state.orig, d = state.dup;
    if (!o || !d || state.merged) return;
    var oid = o.id, did = d.id, moved = 0;
    try {
      // 1) app collections (claims, appointments, notes...) and 2) the charts themselves
      setDB(function (db) {
        Object.keys(db).forEach(function (k) {
          if (k === 'patients' || !Array.isArray(db[k])) return;
          db[k].forEach(function (x) { if (!x) return; REF_KEYS.forEach(function (rk) { if (x[rk] === did) { x[rk] = oid; moved++; } }); });
        });
        var P = (db.patients || []).find(function (p) { return p.id === oid; });
        var D = (db.patients || []).find(function (p) { return p.id === did; });
        if (P && D) {
          Object.keys(D).forEach(function (k) {
            if (/^(id|acct|fileNo|providerId|createdAt|mergedFrom|mergedInto|mergedAt)$/.test(k)) return;
            if (isEmpty(P[k]) && !isEmpty(D[k])) P[k] = JSON.parse(JSON.stringify(D[k]));
            else if (Array.isArray(P[k]) && Array.isArray(D[k])) {
              var seen = {}; P[k].forEach(function (v) { seen[JSON.stringify(v)] = 1; });
              D[k].forEach(function (v) { if (!seen[JSON.stringify(v)]) P[k].push(JSON.parse(JSON.stringify(v))); });
            }
          });
          var who = (getSession() || {}).email || '';
          P.mergedFrom = (P.mergedFrom || []).concat([{ id: did, file: fileNo(D), at: Date.now(), by: who }]);
          D.mergedInto = oid; D.mergedAt = Date.now(); D.inactive = true;
        }
      });
      // 3) case management data (notes, plans, authorizations...)
      try {
        var cm = getCMData(), cmMoved = 0;
        Object.keys(cm || {}).forEach(function (k) {
          if (k === 'clients' || k === 'clientsBackup' || !Array.isArray(cm[k])) return;
          cm[k].forEach(function (x) { if (!x) return; REF_KEYS.forEach(function (rk) { if (x[rk] === did) { x[rk] = oid; cmMoved++; } }); });
        });
        if (cmMoved) { moved += cmMoved; saveCMData(cm); }
      } catch (e) { console.warn('[CDC] merge CM:', e && e.message); }
      try { auditLog('MERGE_CHARTS', 'Merged File #' + fileNo(d) + ' into File #' + fileNo(o) + ' (' + moved + ' records moved)'); } catch (e) {}
    } catch (e) {
      console.warn('[CDC] merge:', e);
      msg('The merge could not be completed. Nothing was deleted; try again.', 'err');
      return;
    }
    state.merged = true;
    var db2 = getDB();
    state.orig = (db2.patients || []).find(function (p) { return p.id === oid; }) || o;
    state.dup = (db2.patients || []).find(function (p) { return p.id === did; }) || d;
    $('cdm-cards').innerHTML = card(state.orig, 'keep') + card(state.dup, 'gone');
    msg(moved + ' record(s) moved. Everything is now in chart File #' + fileNo(o) + '.', 'ok');
    var left = linkedCounts(did).total;
    $('cdm-step').innerHTML = '<div class="cdm-confirm"><div><b>Delete the duplicate chart?</b><div class="cdm-lead" style="margin:4px 0 0">File #' + esc(fileNo(d)) + ' now has ' + left + ' linked record(s). ' + (left ? 'It still has records, so it cannot be deleted.' : 'It is empty and can be deleted safely.') + '</div></div>' +
      '<div style="display:flex;gap:10px"><button type="button" class="cdm-btn ghost" id="cdm-keepdup">Keep it (inactive)</button><button type="button" class="cdm-btn danger" id="cdm-del"' + (left ? ' disabled' : '') + '>Delete duplicate</button></div></div>';
    $('cdm-keepdup').addEventListener('click', function () { msg('The duplicate was kept as an inactive chart.', 'info'); $('cdm-step').innerHTML = ''; });
    $('cdm-del').addEventListener('click', deleteDup);
  }

  function deleteDup() {
    if (!allowed()) { msg('You do not have access to Master Settings.', 'err'); return; }
    var d = state.dup; if (!d || !state.merged) return;
    if (linkedCounts(d.id).total) { msg('The duplicate still has linked records; it was not deleted.', 'err'); return; }
    if (!window.confirm('Delete chart File #' + fileNo(d) + ' permanently? Everything is already in File #' + fileNo(state.orig) + '.')) return;
    var did = d.id;
    setDB(function (db) { db.patients = (db.patients || []).filter(function (p) { return p.id !== did; }); });
    try { _fsDeleteDoc('patients', did); } catch (e) {}
    try { var cm = getCMData(); if (cm && Array.isArray(cm.clients)) { for (var i = cm.clients.length - 1; i >= 0; i--) if (cm.clients[i] && cm.clients[i].id === did) cm.clients.splice(i, 1); } } catch (e) {}
    try { auditLog('DELETE_DUPLICATE_CHART', 'Deleted File #' + fileNo(d) + ' after merging into File #' + fileNo(state.orig)); } catch (e) {}
    $('cdm-cards').innerHTML = card(state.orig, 'keep') + '<div class="cdm-empty">Duplicate chart deleted.</div>';
    $('cdm-step').innerHTML = '';
    msg('Duplicate deleted. Chart File #' + fileNo(state.orig) + ' has everything.', 'ok');
    state.dup = null;
  }

  window.openMasterSettings = function () {
    if (!allowed()) { try { toast('Master Settings is only for Managers and the Super Admin.', 'warn'); } catch (e) {} return; }
    render();
  };
})();
