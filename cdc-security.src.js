/* =====================================================================
 * ClaimDataCare • cdc-security.js (2026-09-29)
 * Security core loaded BEFORE script1.js. HIPAA Security Rule support:
 *   • escapeHtml / jsq / cdcSafeUrl: output encoding for every screen
 *   • auditLog(): central audit trail in Firestore (164.312(b)),
 *     append-only (enforced by firestore.rules), replaces the old
 *     per-browser localStorage logs
 *   • PHI access logging: opening a chart, printing, exporting
 *   • Session re-validation: role / provider / active status are re-read
 *     from the cloud user list on every load, so a value edited in the
 *     browser or a deactivated account never keeps access
 *   • userRoles sync: the Super Admin session publishes each user's role to
 *     userRoles/{email}; firestore.rules read it to authorize every request
 *   • Purge of legacy PHI left in the browser by older versions
 * ===================================================================== */
(function () {
  'use strict';

  /* ---------------- Output encoding ---------------- */
  var _HE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, function (c) { return _HE[c]; });
  }
  // For values placed inside a JS string in an inline handler: onclick="fn('+jsq(x)+')"
  // (HTML escaping alone does not protect there: the browser decodes &#39; before running it)
  function jsq(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[\\'"<>&`\n\r\u2028\u2029]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }
  // Only URLs that cannot run code: https, blob, same-site relative, and data: images / PDF
  function cdcSafeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (/^data:(image\/(png|jpe?g|gif|webp)|application\/pdf);base64,[a-z0-9+\/=\s]+$/i.test(s)) return s;
    if (/^(https:|blob:)/i.test(s)) return s;
    if (/^(\/(?!\/)|\.\/|[a-z0-9_\-]+\.(html|pdf|png|jpg|svg))/i.test(s) && !/^[a-z]+:/i.test(s)) return s;
    return '';
  }
  window.escapeHtml = escapeHtml;
  window.jsq = jsq;
  window.cdcSafeUrl = cdcSafeUrl;

  /* ---------------- Stored-XSS neutralizer ---------------- */
  // Identity and label fields (names, emails, phones, addresses, payer, ids...) never
  // legitimately contain < or >. Every record read from or written to the cloud passes
  // through here, so a name like <img onerror=...> can never become markup on another
  // user's screen. ONLY the fields listed below are touched: clinical text, notes,
  // templates and images are never modified (record integrity); screens escape those.
  var ID_KEY = /^(name|first|last|mid|middle|nickname|fullName|firstName|lastName|middleName|guardianName|emergName|signerName|author|by|user|createdBy|updatedBy|email|guardianEmail|authEmail|phone|phone2|mobile|guardianPhone|guardianPhone2|emergPhone|fax|addr|addr1|addr2|address|city|state|zip|county|payerName|payer|payerId|payerid|insuranceName|insuranceProvider|insuranceId|insuranceGroup|group|policy|memberId|subNum|subscriber|acct|fileNo|npi|taxId|title|label|category|type|status|pcn|checkNum|school|grade|pcp|pcpName|language|prefLang|relation|relationship|guardianRel|emergRel|referralSource|specialty|role|facility|company|companyName|formName|id|patId|patientId|clientId|providerId|claimId|eraId)$/i;
  function _str(v) { return (v.indexOf('<') === -1 && v.indexOf('>') === -1) || v.indexOf('data:') === 0 ? v : v.replace(/</g, '\u2039').replace(/>/g, '\u203A'); }
  function _clean(v, depth) {
    if (!v || typeof v !== 'object' || depth > 6) return v;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object') _clean(v[i], depth + 1); return v; }
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var x = v[k];
      if (typeof x === 'string') { if (ID_KEY.test(k) && x.length <= 300) v[k] = _str(x); }
      else if (x && typeof x === 'object') _clean(x, depth + 1);
    }
    return v;
  }
  window.cdcNeutralize = function (obj) { try { return _clean(obj, 0); } catch (e) { return obj; } };

  /* ---------------- Legacy PHI purge ---------------- */
  // Older versions copied patient data, clearinghouse settings and audit logs into
  // this browser. None of it is needed now that the cloud is the source.
  function _purgeLegacyBrowserData() {
    try {
      var drop = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (k === 'cdc_cache_v2' || k === 'cdc_openai_cfg' || k === 'rcmpro_api_cfg' ||
            k.indexOf('cdc_firestore_backup_') === 0 || k.indexOf('cdc_audit_') === 0) drop.push(k);
      }
      drop.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
  }
  _purgeLegacyBrowserData();

  /* ---------------- Audit trail (Firestore auditLog) ---------------- */
  var _lc = function (e) { return String(e || '').toLowerCase(); };
  var _queue = [];
  window._cdcAuditMem = [];

  function _sess() { try { return (typeof getSession === 'function') ? getSession() : null; } catch (e) { return null; } }
  function _fs() {
    try { if (typeof _db !== 'undefined' && _db && typeof _fbReady !== 'undefined' && _fbReady) return _db; } catch (e) {}
    return null;
  }
  function _fbUser() { try { return (typeof _auth !== 'undefined' && _auth) ? _auth.currentUser : null; } catch (e) { return null; } }

  function _flush() {
    var db = _fs(), u = _fbUser();
    if (!db || !u || !_queue.length) return;
    var items = _queue.splice(0, _queue.length);
    items.forEach(function (e) {
      e.uid = u.uid;
      e.authEmail = _lc(u.email);
      try { e.at = firebase.firestore.FieldValue.serverTimestamp(); } catch (x) {}
      db.collection('auditLog').add(e).catch(function (err) {
        console.warn('[CDC][audit] write failed:', err && err.code);
      });
    });
  }
  setInterval(_flush, 3000);

  // auditLog(action, details[, extra]): details must not carry clinical text; use ids.
  function auditLog(action, details, extra) {
    try {
      var s = _sess() || {};
      var e = {
        ts: Date.now(),
        action: String(action || 'EVENT').slice(0, 60),
        details: String(details == null ? '' : details).slice(0, 500),
        user: s.email || '',
        name: s.name || '',
        role: s.role || '',
        providerId: (typeof activeProviderId !== 'undefined' && activeProviderId) || s.providerId || '',
        ua: String(navigator.userAgent || '').slice(0, 160)
      };
      if (extra && typeof extra === 'object') {
        if (extra.patientId) e.patientId = String(extra.patientId).slice(0, 80);
        if (extra.recordId) e.recordId = String(extra.recordId).slice(0, 80);
        if (extra.collection) e.collection = String(extra.collection).slice(0, 40);
      }
      window._cdcAuditMem.unshift(e);
      if (window._cdcAuditMem.length > 2000) window._cdcAuditMem.length = 2000;
      _queue.push(e);
      if (_fbUser()) _flush();
    } catch (x) {}
  }
  window.auditLog = auditLog;
  window.addEventListener('pagehide', _flush);

  // Loads the recent trail for the Audit Log screens (Super Admin / Managers only; the
  // rules refuse everyone else).
  window._cdcLoadAuditTrail = function (limit) {
    var db = _fs();
    if (!db) return Promise.resolve([]);
    return db.collection('auditLog').orderBy('ts', 'desc').limit(limit || 1000).get().then(function (snap) {
      var list = snap.docs.map(function (d) { return d.data(); });
      window._cdcAuditMem = list;
      return list;
    }).catch(function (e) { console.warn('[CDC][audit] read:', e && e.code); return window._cdcAuditMem; });
  };

  /* ---------------- PHI access logging ---------------- */
  // Wraps the global entry points that open or output patient records.
  var WATCH = {
    openPatientChart: 'PATIENT_VIEW', openPatientSummary: 'PATIENT_VIEW', openCMPatientSummary: 'PATIENT_VIEW',
    openCMClientChart: 'PATIENT_VIEW', openPatientModal: 'PATIENT_OPEN_EDIT', openClaimModal: 'CLAIM_VIEW',
    openClaimDetail: 'CLAIM_VIEW', openClaimById: 'CLAIM_VIEW', _ceDownloadCMS1500: 'CLAIM_PRINT',
    _doExportPatientPDF: 'PATIENT_EXPORT', exportAuditLogPDF: 'AUDIT_EXPORT', exportAuditLogXLSX: 'AUDIT_EXPORT',
    openEncounterEditor: 'NOTE_VIEW', openAINoteModal: 'NOTE_VIEW', deletePatient: 'PATIENT_DELETE', delClaim: 'CLAIM_DELETE'
  };
  function _wrapAll() {
    try {
      Object.keys(window).forEach(function (n) {
        if (/^exportBulk(Patients|Claims)/.test(n) && !WATCH[n]) WATCH[n] = /Patients/.test(n) ? 'PATIENT_EXPORT' : 'CLAIM_EXPORT';
      });
    } catch (e) {}
    Object.keys(WATCH).forEach(function (n) {
      var f = window[n];
      if (typeof f !== 'function' || f.__cdcAudited) return;
      var w = function () {
        try {
          var a0 = arguments[0];
          var id = (typeof a0 === 'string' || typeof a0 === 'number') ? String(a0) : '';
          auditLog(WATCH[n], n + (id ? ' ' + id : ''), /PATIENT/.test(WATCH[n]) ? { patientId: id } : { recordId: id });
        } catch (e) {}
        return f.apply(this, arguments);
      };
      w.__cdcAudited = true;
      window[n] = w;
    });
  }
  // Some entry points are defined later or loaded on demand: wrap now and again shortly.
  window.addEventListener('load', function () { _wrapAll(); setTimeout(_wrapAll, 4000); setTimeout(_wrapAll, 15000); });

  /* ---------------- Session re-validation ---------------- */
  function _inactive(u) { return !!u && (u.inactive === true || _lc(u.status) === 'inactive'); }
  function _ownerEmail() { try { return _lc(SUPER_ADMIN_EMAIL); } catch (e) { return ''; } }

  // Called by loadFromFirestore with the user list just read from the cloud.
  // Same matching as sign-in (cdc-login.js _userForFirebase), so no new lock-outs.
  window._cdcRevalidateSession = function (list) {
    try {
      var s = _sess(), fb = _fbUser();
      if (!s || !fb || !Array.isArray(list) || !list.length) return;
      var em = _lc(fb.email);
      var u = list.find(function (x) { return x && x.firebaseUid && x.firebaseUid === fb.uid; }) ||
              list.find(function (x) { return x && _lc(x.authEmail) === em; }) ||
              list.find(function (x) { return x && _lc(x.email) === em; });
      if (!u && em === _ownerEmail()) {
        u = list.find(function (x) { return x && x.ownerAccount === true; }) || { role: 'Super Admin' };
      }
      if (!u || _inactive(u)) {
        auditLog('SESSION_REVOKED', !u ? 'No user record for this sign-in' : 'Account inactive');
        _flush();
        setTimeout(function () {
          try { _performLogout(); } catch (e) { try { clearSession(); location.reload(); } catch (x) {} }
          setTimeout(function () { try { toast('Your access has changed. Please contact your administrator.', 'warn'); } catch (e) {} }, 400);
        }, 300);
        return;
      }
      var role = u.role || (em === _ownerEmail() || u.ownerAccount === true ? 'Super Admin' : 'User');
      var changed = false;
      if (s.role !== role) { s.role = role; changed = true; }
      if ((s.providerId || null) !== (u.providerId || null)) { s.providerId = u.providerId || null; changed = true; }
      if (JSON.stringify(s.specialties || []) !== JSON.stringify(u.specialties || [])) { s.specialties = u.specialties || []; changed = true; }
      if (Array.isArray(u.permissions) && JSON.stringify(s.permissions || []) !== JSON.stringify(u.permissions)) { s.permissions = u.permissions; changed = true; }
      if (changed) {
        setSession(s);
        try { if (typeof updateAdminUI === 'function') updateAdminUI(); } catch (e) {}
        try { if (typeof rebuildProvSel === 'function') rebuildProvSel(); } catch (e) {}
      }
      window._cdcSessionValidated = true;
      if (role === 'Super Admin' || /manager/i.test(role)) {
        window._cdcSyncUserRoles(list);
        window._cdcLoadAuditTrail(1000);
      }
    } catch (e) { console.warn('[CDC][session] revalidate:', e && e.message); }
  };

  /* ---------------- userRoles (authorization source for firestore.rules) ---------------- */
  // userRoles/{lowercase sign-in email} = { role, providerId, active, ... }
  // Only Super Admins can write it (rules). Runs when a Super Admin loads the app and
  // whenever the user list is saved.
  var _syncing = false, _pendingList = null;
  function _isMgrRec(u) {
    var r = [u.role].concat(Array.isArray(u.roles) ? u.roles : []);
    return r.some(function (x) { return /manager/i.test(String(x || '')); });
  }
  window._cdcSyncUserRoles = function (list) {
    var db = _fs(), s = _sess();
    var isSA = s && s.role === 'Super Admin';
    var isMgr = s && (isSA || /manager/i.test(String(s.role || '')));
    if (!db || !isMgr || !window._cdcSessionValidated || !Array.isArray(list)) return;
    if (_syncing) { _pendingList = list; return; }   // run again when the current sync ends
    _syncing = true;
    var want = {};
    list.forEach(function (u) {
      if (!u) return;
      var doc = {
        role: String(u.role || 'User'),
        isManager: _isMgrRec(u),
        providerId: u.providerId || null,
        active: !_inactive(u),
        email: _lc(u.email),
        uid: u.firebaseUid || null,
        userId: String(u.id || ''),
        updatedAt: Date.now(),
        updatedBy: _lc(s.email)
      };
      [_lc(u.authEmail), _lc(u.email)].forEach(function (k) {
        if (!k || k.indexOf('@') < 1 || k.indexOf('/') !== -1) return;
        var prev = want[k];
        // Same priority as sign-in: the first record wins, but an active record always
        // beats an inactive duplicate, and a record bound to a sign-in account beats one that is not.
        if (!prev || (!prev.active && doc.active) || (!prev.uid && doc.uid && prev.active === doc.active)) want[k] = doc;
      });
    });
    var unbound = [];
    db.collection('userRoles').get().then(function (snap) {
      var have = {};
      snap.docs.forEach(function (d) { have[d.id] = d.data(); });
      var batch = db.batch(), n = 0;
      // Managers may not create or change Super Admin access (the rules refuse it too)
      var mine = function (d) { return isSA || !d || d.role !== 'Super Admin'; };
      Object.keys(want).forEach(function (k) {
        var h = have[k], w = want[k];
        if (w.active && !w.uid) unbound.push(k);
        if (!mine(h) || !mine(w)) return;
        if (!h || h.role !== w.role || h.providerId !== w.providerId || h.active !== w.active || (h.uid || null) !== w.uid || h.isManager !== w.isManager) {
          batch.set(db.collection('userRoles').doc(k), w); n++;
        }
      });
      Object.keys(have).forEach(function (k) {
        if (!want[k] && mine(have[k])) { batch.delete(db.collection('userRoles').doc(k)); n++; }
      });
      if (unbound.length) console.warn('[CDC][roles] users not linked to a sign-in account (they must verify their email to get access):', unbound);
      if (!n) return;
      return batch.commit().then(function () { auditLog('ROLES_SYNC', n + ' access records updated'); });
    }).catch(function (e) {
      console.warn('[CDC][roles] sync:', e && e.code);
      try { toast('Could not update user access records. Try again or contact support.', 'err'); } catch (x) {}
    }).then(function () {
      _syncing = false;
      if (_pendingList) { var l = _pendingList; _pendingList = null; window._cdcSyncUserRoles(l); }
    });
  };

  /* ---------------- Access refused by the database ---------------- */
  // Called when the cloud refuses to load data. If the account is not yet linked to its
  // user record, verifying the email grants access (firestore.rules). One email a day.
  window._cdcOnPermissionDenied = function () {
    try {
      var u = _fbUser();
      if (!u) return;
      if (!u.emailVerified && typeof u.sendEmailVerification === 'function') {
        var key = 'cdc_verify_sent_' + u.uid, last = 0;
        try { last = +localStorage.getItem(key) || 0; } catch (e) {}
        if (Date.now() - last > 24 * 3600 * 1000) {
          u.sendEmailVerification().then(function () { try { localStorage.setItem(key, String(Date.now())); } catch (e) {} });
        }
        try { toast('To finish securing your account, open the verification link we sent to ' + u.email + ', then sign in again.', 'warn'); } catch (e) {}
      } else {
        try { toast('Your account does not have access yet. Contact your administrator.', 'warn'); } catch (e) {}
      }
    } catch (e) {}
  };
})();
