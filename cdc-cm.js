/*
 * ClaimDataCare  •  Case Management as a specialty (shared clients)
 * File: cdc-cm.js  •  v1.0
 *
 * Case Management is a SPECIALTY of a provider group, not a separate world:
 *   • Its clients ARE the group's patients. Every specialty of the same provider group
 *     (billing, mental health, TCM...) sees the same people.
 *   • Case-management details (worker, status, plans, notes...) stay on the same record.
 *
 * Before, Case Management kept its own client list in one global document that every
 * practice could read. That list is moved (once) into the patients of the provider group
 * that has the Case Management specialty, keeping a backup copy in the CM document.
 * From then on, CM clients are saved as patients (only the ones that changed) and the
 * CM document no longer carries a client list.
 *
 * Loaded at startup by cdc-login.js. Nothing is stored in the browser.
 */
(function () {
  'use strict';
  if (window.__cdcCM) return;
  window.__cdcCM = true;

  var CM_RX = /case[\s-]?management|\btcm\b/i;
  var cache = { providerId: null, arr: null };   // the client list handed to the CM screens
  var snap = {};                                 // id -> JSON when handed out (to detect edits)
  var warned = false;

  function install() {
    if (typeof window.getCMData !== 'function' || typeof window.saveCMData !== 'function') return false;
    if (window.getCMData.__cdcBridge) return true;
    var origGet = window.getCMData, origSave = window.saveCMData;

    function db() { return (typeof _localDB !== 'undefined' && _localDB) ? _localDB : null; }
    function cmProviders() {
      var d = db(); if (!d) return [];
      return (d.providers || []).filter(function (p) { return (p.specialtyDefs || []).some(function (s) { return s && CM_RX.test(s.name || ''); }); });
    }
    function ready() { var d = db(); return !!(window._cmCloudLoaded && d && Array.isArray(d.patients)); }

    // One-time move of the old global CM client list into the patients of the CM group
    function migrate(cm) {
      if (cm.clientsMigrated === true) return true;
      if (!ready()) return false;
      var provs = cmProviders();
      if (provs.length !== 1) {
        if (!warned) { warned = true; console.warn('[CDC] CM clients not moved yet: ' + provs.length + ' providers have the Case Management specialty (expected 1).'); }
        return false;
      }
      var target = provs[0].id;
      var legacy = Array.isArray(cm.clients) ? cm.clients.slice() : [];
      var have = {};
      db().patients.forEach(function (p) { if (p && p.id) have[p.id] = true; });
      var add = legacy.filter(function (c) { return c && c.id && !have[c.id]; })
                      .map(function (c) { return Object.assign({}, c, { providerId: c.providerId || target }); });
      if (add.length) setDB(function (d2) { add.forEach(function (p) { d2.patients.push(p); }); });
      cm.clientsBackup = legacy;
      cm.clientsMigrated = true;
      cm.clientsMigratedAt = Date.now();
      cm.clientsProviderId = target;
      writeCMDoc(cm);
      console.log('[CDC] Case Management clients moved to patients: ' + add.length + ' added (' + legacy.length + ' kept as backup).');
      return true;
    }

    function writeCMDoc(cm) {
      var copy = Object.assign({}, cm, { clients: [] });   // clients now live in patients
      try { _saveCMToFirestore(copy); } catch (e) { console.warn('[CDC] CM save:', e && e.message); }
    }

    // Keeps ONE stable array per provider group, so a new client pushed by a screen is not
    // lost if another part of the screen asks for the data before saving.
    function groupClients() {
      var d = db(), pid = activeProviderId;
      var group = (d.patients || []).filter(function (p) { return p && p.providerId === pid; });
      if (cache.providerId !== pid || !cache.arr) {
        cache.providerId = pid; cache.arr = group.slice(); snap = {};
      } else {
        var inArr = {}; cache.arr.forEach(function (c) { if (c && c.id) inArr[c.id] = true; });
        var inGroup = {}; group.forEach(function (p) { inGroup[p.id] = true; if (!inArr[p.id]) cache.arr.push(p); });
        var allIds = {}; (d.patients || []).forEach(function (p) { if (p && p.id) allIds[p.id] = p.providerId; });
        // drop records that now belong to another group; keep brand-new unsaved ones
        for (var i = cache.arr.length - 1; i >= 0; i--) {        // in place: the array stays the same
          var c = cache.arr[i];
          if (c && c.id && !inGroup[c.id] && (c.id in allIds)) cache.arr.splice(i, 1);
        }
      }
      cache.arr.forEach(function (c) { if (c && c.id && !(c.id in snap)) snap[c.id] = JSON.stringify(c); });
      return cache.arr;
    }

    var bridgedGet = function () {
      var cm = origGet();
      if (!cm || !migrate(cm)) return cm;
      cm.clients = groupClients();
      return cm;
    };
    bridgedGet.__cdcBridge = true;

    var bridgedSave = function (cm) {
      if (!cm || cm.clientsMigrated !== true) return origSave(cm);
      var d = db(); if (!d) return origSave(cm);
      var arr = Array.isArray(cm.clients) ? cm.clients : [];
      if (arr !== cache.arr) { cache.arr = arr; cache.providerId = activeProviderId; }
      var byId = {}; (d.patients || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
      var news = [], changed = [];
      arr.forEach(function (c) {
        if (!c || !c.id) return;
        if (!byId[c.id]) { if (!c.providerId) c.providerId = activeProviderId; news.push(c); }
        else {
          if (byId[c.id] !== c) Object.assign(byId[c.id], c);   // edited copy -> update the patient record
          var j = JSON.stringify(byId[c.id]);
          if (snap[c.id] !== j) { changed.push(byId[c.id]); snap[c.id] = j; }
        }
      });
      if (news.length) {
        setDB(function (d2) { news.forEach(function (c) { d2.patients.push(c); }); });
        news.forEach(function (c) { snap[c.id] = JSON.stringify(c); });
      }
      if (changed.length && typeof _fsWriteCollection === 'function' && _fbReady && _db) {
        _fsWriteCollection('patients', changed).catch(function (e) { console.warn('[CDC] CM client save:', e && e.message); });
      }
      _localDB.cm = cm;
      writeCMDoc(cm);
    };
    bridgedSave.__cdcBridge = true;

    window.getCMData = bridgedGet;
    window.saveCMData = bridgedSave;
    return true;
  }

  if (!install()) {
    var n = 0, t = setInterval(function () { if (install() || ++n > 100) clearInterval(t); }, 100);
  }
})();
