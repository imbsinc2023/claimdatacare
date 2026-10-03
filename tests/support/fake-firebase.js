/* ClaimDataCare tests • in-memory Firebase (compat API subset used by the app).
 * Loaded in place of firebase-app-compat.js. Reads its starting data from
 * window.__SEED and its sign-in accounts from window.__ACCOUNTS ({email: password}).
 * Every write is applied to window.__STORE so tests can inspect what the app saved.
 * The signed-in user survives reloads through sessionStorage (like Firebase persistence). */
window.firebase = (function () {
  'use strict';
  var store = window.__STORE = window.__SEED ? JSON.parse(JSON.stringify(window.__SEED)) : {};
  var accounts = window.__ACCOUNTS || {};
  try { var saved = JSON.parse(sessionStorage.getItem('__fakeAccounts') || 'null'); if (saved) accounts = saved; } catch (e) {}
  function saveAccounts() { try { sessionStorage.setItem('__fakeAccounts', JSON.stringify(accounts)); localStorage.setItem('__fakeAccountsAll', JSON.stringify(accounts)); } catch (e) {} }
  window.__LOG = { writes: [], signIns: [], resets: [], denied: [] };
  var clone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  var autoId = function () { return 'id' + Math.random().toString(36).slice(2, 12); };

  // optional access rule for tests: window.__DENY(collection, op) -> true blocks the call
  function guard(coll, op) {
    if (typeof window.__DENY === 'function' && window.__DENY(coll, op)) {
      window.__LOG.denied.push(coll + ':' + op);
      var e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
    }
  }
  function snapOf(coll, id) {
    var d = (store[coll] || {})[id];
    return { id: id, exists: d !== undefined, data: function () { return clone(d); } };
  }
  function query(coll, filters, order, lim) {
    return {
      where: function (f, op, v) { return query(coll, filters.concat([[f, op, v]]), order, lim); },
      orderBy: function (f, dir) { return query(coll, filters, [f, dir || 'asc'], lim); },
      limit: function (n) { return query(coll, filters, order, n); },
      get: function () {
        return new Promise(function (ok, ko) {
          try { guard(coll, 'list'); } catch (e) { ko(e); return; }
          var o = store[coll] || {};
          var ids = Object.keys(o).filter(function (id) {
            return filters.every(function (f) {
              var x = o[id] && o[id][f[0]];
              return f[1] === '==' ? x === f[2] : f[1] === 'in' ? (f[2] || []).indexOf(x) >= 0 : true;
            });
          });
          if (order) ids.sort(function (a, b) { var x = o[a][order[0]], y = o[b][order[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (order[1] === 'desc' ? -1 : 1); });
          if (lim) ids = ids.slice(0, lim);
          var docs = ids.map(function (id) { return snapOf(coll, id); });
          ok({ empty: !docs.length, size: docs.length, docs: docs, forEach: function (fn) { docs.forEach(fn); } });
        });
      }
    };
  }
  function docRef(coll, id) {
    return {
      id: id, _c: coll,
      get: function () { return new Promise(function (ok, ko) { try { guard(coll, 'get'); ok(snapOf(coll, id)); } catch (e) { ko(e); } }); },
      set: function (v, opt) {
        return new Promise(function (ok, ko) {
          try { guard(coll, 'write'); } catch (e) { ko(e); return; }
          store[coll] = store[coll] || {};
          store[coll][id] = (opt && opt.merge) ? Object.assign({}, store[coll][id] || {}, clone(v)) : clone(v);
          window.__LOG.writes.push(coll + '/' + id); ok();
        });
      },
      update: function (v) { return this.set(v, { merge: true }); },
      delete: function () { return new Promise(function (ok, ko) { try { guard(coll, 'delete'); } catch (e) { ko(e); return; } if (store[coll]) delete store[coll][id]; window.__LOG.writes.push('DEL ' + coll + '/' + id); ok(); }); }
    };
  }
  function collection(name) {
    var q = query(name, [], null, 0);
    q.doc = function (id) { return docRef(name, String(id == null ? autoId() : id)); };
    q.add = function (v) { var r = docRef(name, autoId()); return r.set(v).then(function () { return r; }); };
    return q;
  }
  var fs = {
    collection: collection,
    batch: function () {
      var ops = [];
      return {
        set: function (ref, v, opt) { ops.push(function () { return ref.set(v, opt); }); },
        delete: function (ref) { ops.push(function () { return ref.delete(); }); },
        update: function (ref, v) { ops.push(function () { return ref.update(v); }); },
        commit: function () { return ops.reduce(function (p, f) { return p.then(f); }, Promise.resolve()); }
      };
    },
    enablePersistence: function () { return Promise.resolve(); }, settings: function () {}
  };
  var fsFn = function () { return fs; };
  fsFn.FieldValue = { serverTimestamp: function () { return '__ts'; }, delete: function () { return null; }, arrayUnion: function () { return []; } };

  // ---------------- auth ----------------
  var listeners = [], user = null;
  function mkUser(email) {
    var u = { uid: 'uid-' + email, email: email, emailVerified: true };
    u.getIdToken = function () { return Promise.resolve('test-token-' + email); };
    u.verifyBeforeUpdateEmail = function () { return Promise.resolve(); };
    u.sendEmailVerification = function () { return Promise.resolve(); };
    return u;
  }
  try { var su = sessionStorage.getItem('__fakeUser'); if (su) user = mkUser(su); } catch (e) {}
  function setUser(u) { user = u; try { if (u) sessionStorage.setItem('__fakeUser', u.email); else sessionStorage.removeItem('__fakeUser'); } catch (e) {} listeners.forEach(function (cb) { try { cb(user); } catch (e) {} }); }
  var codes = {};
  try { codes = JSON.parse(localStorage.getItem('__fakeCodesAll') || '{}'); } catch (e) {}
  function saveCodes() { try { localStorage.setItem('__fakeCodesAll', JSON.stringify(codes)); localStorage.setItem('__fakeAccountsAll', JSON.stringify(accounts)); } catch (e) {} }
  try { var allAcc = JSON.parse(localStorage.getItem('__fakeAccountsAll') || 'null'); if (allAcc) accounts = allAcc; } catch (e) {}
  var auth = {
    get currentUser() { return user; },
    onAuthStateChanged: function (cb) { listeners.push(cb); setTimeout(function () { cb(user); }, 5); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },
    signInWithEmailAndPassword: function (email, pass) {
      window.__LOG.signIns.push(email);
      if (accounts[email] && accounts[email] === pass) { var u = mkUser(email); setUser(u); return Promise.resolve({ user: u }); }
      var e = new Error('invalid'); e.code = 'auth/invalid-credential'; return Promise.reject(e);
    },
    createUserWithEmailAndPassword: function (email, pass) {
      if (accounts[email]) { var e = new Error('in use'); e.code = 'auth/email-already-in-use'; return Promise.reject(e); }
      accounts[email] = pass; saveAccounts(); var u = mkUser(email); setUser(u); return Promise.resolve({ user: u });
    },
    signOut: function () { setUser(null); return Promise.resolve(); },
    sendPasswordResetEmail: function (email, settings) {
      window.__LOG.resets.push(email);
      if (accounts[email]) { var c = 'RESET' + Math.random().toString(36).slice(2, 14) + 'abcdefghijklmn'; codes[c] = email; saveCodes(); try { localStorage.setItem('__lastResetCode', c); } catch (e) {} }
      return Promise.resolve();
    },
    verifyPasswordResetCode: function (c) {
      return codes[c] ? Promise.resolve(codes[c]) : Promise.reject({ code: 'auth/invalid-action-code' });
    },
    confirmPasswordReset: function (c, p) {
      var email = codes[c]; if (!email) return Promise.reject({ code: 'auth/invalid-action-code' });
      accounts[email] = p; saveAccounts(); delete codes[c]; saveCodes(); window.__LOG.newPassword = p; return Promise.resolve();
    },
    applyActionCode: function () { return Promise.resolve(); },
    checkActionCode: function () { return Promise.resolve({ data: {} }); }
  };
  var provisionAuth = {
    currentUser: null,
    createUserWithEmailAndPassword: function (email, pass) {
      if (accounts[email]) { var e = new Error('in use'); e.code = 'auth/email-already-in-use'; return Promise.reject(e); }
      accounts[email] = pass; saveAccounts(); window.__LOG.provisioned = (window.__LOG.provisioned || []).concat([email]);
      return Promise.resolve({ user: mkUser(email) });
    },
    sendPasswordResetEmail: function (e, s) { return auth.sendPasswordResetEmail(e, s); },
    signOut: function () { return Promise.resolve(); }
  };
  // ---------------- storage ----------------
  var storage = { ref: function () { return { child: function (p) { return { putString: function () { return Promise.resolve(); }, getDownloadURL: function () { return Promise.resolve('https://firebasestorage.googleapis.com/test/' + encodeURIComponent(p)); } }; } }; } };

  var app = { name: '[DEFAULT]', auth: function () { return auth; } }, apps = [app];
  return {
    apps: apps, SDK_VERSION: '10.12.0',
    app: function () { return app; },
    initializeApp: function (cfg, name) { if (name) { var a = { name: name, auth: function () { return provisionAuth; } }; apps.push(a); return a; } return app; },
    firestore: fsFn, auth: function (a) { return (a && a.name && a.name !== '[DEFAULT]') ? provisionAuth : auth; }, storage: function () { return storage; }
  };
})();
