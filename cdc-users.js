/*
 * ClaimDataCare  •  Users & Account module
 * File: cdc-users.js  •  v1.0
 *
 * Moved out of script1.js (2026-09-28). script1.js downloads this file the first
 * time someone opens Users & Account (or an activation link), so the app starts faster.
 *
 * Cloud only: the user list lives in Firestore (meta/users); nothing is kept in the browser.
 * Every user gets a Firebase sign-in account: when a user is created (or "Resend
 * invitation" is used) the account is created and Firebase emails a secure link to
 * set their own password. Administrators never type or see passwords.
 * Messages in the user window use a fixed space, so nothing moves on screen.
 */

// ── Firebase sign-in account for a user (created with a secondary Firebase app so
//    the administrator stays signed in) ─────────────────────────────────────────────
function _cdcRandomPassword() {
  var a = new Uint32Array(6); crypto.getRandomValues(a);
  return Array.prototype.map.call(a, function (n) { return n.toString(36); }).join('') + 'Aa1!';
}
async function _cdcProvisionAccount(email) {
  var res = { uid: null, existed: false };
  var app = (firebase.apps || []).find(function (x) { return x.name === 'cdc-provision'; }) || firebase.initializeApp(FB_CONFIG, 'cdc-provision');
  var a2 = app.auth();
  try {
    var cred = await a2.createUserWithEmailAndPassword(email, _cdcRandomPassword());
    res.uid = cred.user.uid;
  } catch (e) {
    if (e && e.code === 'auth/email-already-in-use') res.existed = true; else throw e;
  }
  try { await a2.signOut(); } catch (e) {}
  // Firebase sends the secure "set your password" link (returns to the app afterwards)
  try {
    await _auth.sendPasswordResetEmail(email, { url: location.origin + location.pathname });
  } catch (e) {
    if (e && /continue-uri|unauthorized/i.test(e.code || '')) await _auth.sendPasswordResetEmail(email); else throw e;
  }
  return res;
}

function _cdcInviteHtml(u, providerName) {
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var first = (u.first || u.name || 'there').split('.')[0];
  var appUrl = location.origin + location.pathname;
  return [
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #E4E9F1">',
    '<div style="height:5px;background:linear-gradient(90deg,#FF6A3D,#E8367A,#6A1BDB,#00A3D1)"></div>',
    '<div style="background:#0B1526;padding:20px 28px;color:#fff;font-size:20px;font-weight:700">ClaimDataCare</div>',
    '<div style="background:#fff;padding:24px 28px;color:#0B1526;font-size:14px;line-height:1.6">',
    '<p style="margin:0 0 10px;font-weight:600">Welcome, ' + esc(first) + '!</p>',
    '<p style="margin:0 0 14px">Your ClaimDataCare account was created' + (providerName ? ' for <b>' + esc(providerName) + '</b>' : '') + ' with the role <b>' + esc(u.role || 'User') + '</b>.</p>',
    '<p style="margin:0 0 14px"><b>Next step:</b> you will receive a separate email from ClaimDataCare with a secure link to <b>set your password</b>. Then sign in with this email address:</p>',
    '<p style="margin:0 0 18px;font-family:monospace;font-size:15px">' + esc(u.email) + '</p>',
    '<p style="margin:0 0 20px"><a href="' + esc(appUrl) + '" style="display:inline-block;background:#B32660;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:700">Open ClaimDataCare</a></p>',
    '<p style="margin:0;color:#586579;font-size:12px">We will never ask for your password by email or phone. If you did not expect this message, contact your administrator.</p>',
    '</div></div>'
  ].join('');
}

// Creates the sign-in account (if needed) and sends the invitation. Replaces the old
// code + link activation, which only worked on a computer that had the user list saved.
async function sendUserVerifyEmail(userId) {
  var users = getUsers ? getUsers() : [];
  var u = users.find(function (x) { return x.id === userId; });
  if (!u) { toast('User not found', 'error'); return; }
  if (!u.email) { toast('This user has no email address', 'error'); return; }
  if (!(isAdmin() || hasPermission('Manage Users'))) { toast('You do not have permission to invite users.', 'error'); return; }
  try {
    var r = await _cdcProvisionAccount(u.email.trim().toLowerCase());
    if (r.uid) u.firebaseUid = r.uid;
    u.authEmail = u.email.trim().toLowerCase();
    u.inviteSentAt = Date.now();
    if (!u.firebaseUid) u.emailVerified = false;
    delete u.otpHash; delete u.verifyToken; delete u.passHash;   // passwords live only in Firebase now
    await saveUsers(users);
    var providerName = '';
    try { var pm = (getDB().providers || []).find(function (p) { return p.id === (u.providerId || activeProviderId); }); providerName = pm ? (pm.name || '') : ''; } catch (e) {}
    try { sendEmail(u.email, 'Welcome to ClaimDataCare', _cdcInviteHtml(u, providerName), 'onboarding'); } catch (e) {}
    try { renderUserManagement(); } catch (e) {}
    toast('Invitation sent to ' + u.email + '. They will set their own password from the email.', 'ok');
  } catch (e) {
    console.warn('[CDC] invite:', e && (e.code || e.message));
    var m = { 'auth/invalid-email': 'That email address is not valid.', 'auth/too-many-requests': 'Too many requests. Try again in a few minutes.', 'auth/network-request-failed': 'No connection. Try again.' };
    toast(m[e && e.code] || 'Could not send the invitation. Try again.', 'error');
  }
}

// Old activation links (?verify=…) are no longer used: explain and go to sign in
function checkVerifyToken() {
  var q = location.search;
  if (!q || q.indexOf('?verify=') !== 0) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  renderLoginScreen();
  setTimeout(function () {
    var a = document.getElementById('login-alert');
    if (!a) return;
    a.innerHTML = '<div class="alert cdcx-lock"></div>';
    a.firstChild.textContent = 'This activation link is no longer used. Use the "set your password" email, or Forgot password.';
  }, 400);
}

// Fixed space for messages in the user window (nothing moves when an error appears)
(function () {
  if (document.getElementById('cdc-users-style')) return;
  var st = document.createElement('style');
  st.id = 'cdc-users-style';
  st.textContent =
    '#nu-alert{height:52px;display:flex;align-items:center;box-sizing:border-box}' +
    '#nu-alert>.alert{width:100%;margin:0}' +
    '#modal-add-user [id^="nu-"][id$="-err"]{display:block!important;min-height:16px}' +
    '#modal-add-user [id^="nu-"][id$="-err"][style*="display: none"],#modal-add-user [id^="nu-"][id$="-err"][style*="display:none"]{visibility:hidden}';
  document.head.appendChild(st);
})();

function renderUserManagement() {
  var el = document.getElementById('users-list');
  if (!el) return;
  var allUsers = getUsers ? getUsers() : (_usersCache || []);

  // Only show users belonging to the active billing provider
  var session = getSession ? getSession() : {};
  var isSuperAdmin = session && _cdcIsOwnerEmail(session.email);

  var users = allUsers.filter(function(u) {
    // Super admin (no providerId) always shows for the master account
    var isSystemAdmin = _cdcIsOwnerEmail(u.email);
    if (isSystemAdmin) return _userTab === 'active'; // always show in active tab only

    if (!isSuperAdmin) {
      // Non-super-admin: only show users of the active provider
      // Users with no providerId are legacy — hide them
      if (!u.providerId) return false;
      if (u.providerId !== activeProviderId) return false;
    } else {
      // Super admin: filter by active provider unless no provider set
      if (u.providerId && u.providerId !== activeProviderId) return false;
    }

    var inactive = u.inactive || u.status === 'inactive';
    return _userTab === 'inactive' ? inactive : !inactive;
  });

  // ── Authorization: users without "Manage Users" (and who aren't
  // Super Admin) may only ever see their own account, never the rest
  // of the team's. Also hide the Search and Add controls for them.
  var _canManageUsers2 = isSuperAdmin || hasPermission('Manage Users');
  var _searchBtn = document.querySelector('#sec-account button[onclick="openUserSearch()"]');
  var _addBtn = document.querySelector('#sec-account button[onclick="openAddUserModal()"]');
  if (_searchBtn) _searchBtn.style.display = _canManageUsers2 ? '' : 'none';
  if (_addBtn) _addBtn.style.display = _canManageUsers2 ? '' : 'none';
  if (!_canManageUsers2) {
    var _searchBar = document.getElementById('user-search-bar');
    if (_searchBar) _searchBar.style.display = 'none';
    users = users.filter(function(u){ return u.email === session.email; });
  }

  var qEmail = (document.getElementById('us-email')?.value||'').toLowerCase().trim();
  var qFirst = (document.getElementById('us-first')?.value||'').toLowerCase().trim();
  var qLast  = (document.getElementById('us-last')?.value||'').toLowerCase().trim();
  var qRole  = (document.getElementById('us-role')?.value||'').toLowerCase();

  if (qEmail) users = users.filter(function(u){ return (u.email||u.name||'').toLowerCase().includes(qEmail); });
  if (qFirst) users = users.filter(function(u){ return (u.name||'').toLowerCase().includes(qFirst); });
  if (qLast)  users = users.filter(function(u){ return (u.name||'').toLowerCase().includes(qLast); });
  if (qRole)  users = users.filter(function(u){ return (u.roles||[u.role||'']).join(' ').toLowerCase().includes(qRole); });

  if (!users.length) {
    el.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:32px;font-size:13px">No users found.</td></tr>';
    return;
  }

  var roleColors = {
    'Super Admin':'b-amber','Admin':'b-red','Office Manager':'b-blue',
    'Billing Manager':'b-green','Billing Staff':'b-green','Clinical Staff':'b-blue',
    'Front Desk':'b-gray','Reporting':'b-gray','Read Only':'b-gray','User':'b-gray','Manager':'b-blue'
  };

  el.innerHTML = users.map(function(u) {
    var isAdmin = _cdcIsOwnerEmail(u.email);
    var roles   = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : ['User']);
    var roleTag = roles.slice(0,2).map(function(r){
      return '<span class="badge ' + (roleColors[r]||'b-gray') + '" style="font-size:10px;margin-right:2px">' + r + '</span>';
    }).join('') + (roles.length>2 ? '<span style="font-size:10px;color:var(--text3)">+' + (roles.length-2) + '</span>' : '');
    var created = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
    var phone   = u.phone || '—';
    var twoFA   = u.twoFA ? '<span style="color:var(--brand);font-size:12px">Yes</span>' : '<span style="color:var(--text3);font-size:12px">No</span>';
    var verified = u.emailVerified
      ? '<span style="color:var(--brand);font-size:10px;font-weight:600">Verified</span>'
      : '<span style="color:#c77c3e;font-size:10px">Pending</span>';
    var status  = u.inactive
      ? '<span class="badge b-gray" style="font-size:10px">Inactive</span>'
      : '<span class="badge b-green" style="font-size:10px">Active</span>';
    var parts = (u.name||'').trim().split(' ');
    var nameParts2 = (u.name||'').includes('.') ? (u.name||'').split('.') : (u.name||'').split(' ');
    var first = u.first || (nameParts2[0]||'');
    first = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
    var last = u.last || nameParts2.slice(1).join(' ');
    last = last ? last.charAt(0).toUpperCase() + last.slice(1) : '';

    var provName = '';
    try {
      var db2 = getDB();
      var prov2 = (db2.providers||[]).find(function(p){ return p.id === u.providerId; });
      provName = prov2 ? (prov2.name||'') : (isAdmin ? 'All' : '—');
    } catch(e) { provName = '—'; }

    return '<tr>' +
      '<td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (u.email||u.name||'') + '</td>' +
      '<td style="font-size:12px">' + first + '</td>' +
      '<td style="font-size:12px">' + last + '</td>' +
      '<td style="font-size:12px">' + phone + '</td>' +
      '<td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + provName + '</td>' +
      '<td>' + roleTag + '</td>' +
      '<td>' + status + ' ' + verified + '</td>' +
      '<td style="text-align:center">' + twoFA + '</td>' +
      '<td style="font-size:11px;color:var(--text3)">' + created + '</td>' +
      '<td style="white-space:nowrap"><div style="display:flex;flex-direction:row;gap:4px;align-items:center;justify-content:center">' +
        '<button class="btn btn-xs" onclick="openUserInfoView(\'' + u.id + '\')" title="View info (read-only)" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center;background:#fdf5f0;border:1px solid #c96442;color:#c96442"><i data-lucide="eye" class="lci" style="width:12px;height:12px"></i></button>' +
        '<button class="btn btn-xs" onclick="editUser(\'' + u.id + '\')" title="Edit" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center"><i data-lucide="pencil" class="lci" style="width:12px;height:12px"></i></button>' +
        '<button class="btn btn-xs ' + (u.twoFA?'btn-primary':'btn-ghost') + '" onclick="toggle2FA(\'' + u.id + '\')" title="' + (u.twoFA?'2FA Active — Click to disable':'Enable 2FA') + '" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center"><i data-lucide="shield' + (u.twoFA?'-check':'') + '" class="lci" style="width:12px;height:12px"></i></button>' +
        '<button class="btn btn-xs btn-ghost" onclick="toggleUserStatus(\'' + u.id + '\')" title="' + (u.inactive?'Activate':'Deactivate') + '" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center"><i data-lucide="' + (u.inactive?'user-check':'user-x') + '" class="lci" style="width:12px;height:12px"></i></button>' +
        (!isAdmin ? '<button class="btn btn-xs btn-danger" onclick="deleteUser(\'' + u.id + '\')" title="Delete" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center"><i data-lucide="trash-2" class="lci" style="width:12px;height:12px"></i></button>' : '') +
        (!isAdmin ? '<button class="btn btn-xs btn-ghost" onclick="sendUserVerifyEmail(\'' + u.id + '\')" title="Re-send activation email" style="height:26px;width:26px;padding:0;display:flex;align-items:center;justify-content:center"><i data-lucide="mail" class="lci" style="width:12px;height:12px"></i></button>' : '') +
      '</div></td>' +
    '</tr>';
  }).join('');
  setTimeout(_renderLucideIcons, 30);
}

function deleteUser(id) {
const users = getUsers ? getUsers() : (_usersCache || []);
const u = users.find(x => x.id === id);
if (!u || !confirm('Delete user ' + u.email + '?')) return;
const updated = users.filter(x => x.id !== id);
if (saveUsers) saveUsers(updated);
else _usersCache = updated;
renderUserManagement();
toast('User deleted');
}

function openUserInfoView(userId){
  var users = getUsers ? getUsers() : (_usersCache||[]);
  var u = users.find(function(x){ return x.id === userId; });
  if (!u){ toast('User not found','err'); return; }
  var db = getDB();
  var sess = getSession();
  var prov = (db.providers||[]).find(function(p){ return p.id === u.providerId; });
  var canEdit = !!sess && (sess.role === 'Super Admin' || (typeof hasPermission==='function' && hasPermission('Manage Users')));
  var fullName = ((u.first||'') + ' ' + (u.last||'')).trim() || u.name || u.email || '?';
  var initials = fullName.split(/\s+/).map(function(p){return p[0]||'';}).join('').slice(0,2).toUpperCase();

  // Remove any prior instance
  var existing = document.getElementById('modal-user-view');
  if (existing) existing.remove();

  function row(label, value){
    return '<div style="display:flex;flex-direction:column;gap:2px;padding:8px 0;border-bottom:1px solid var(--border)">'+
      '<div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">'+label+'</div>'+
      '<div style="font-size:13px;color:var(--text);word-break:break-word">'+(value?_escHtml(value):'<span style="color:var(--text3);font-style:italic">Not set</span>')+'</div>'+
      '</div>';
  }

  var roleText = Array.isArray(u.roles) && u.roles.length ? u.roles.join(', ') : (u.role || '—');
  var specText = (u.specialties||[]).map(function(s){
    var n = _specEntryName(s);
    var r = _specEntryRole(s);
    return r ? (n+' — '+r) : n;
  }).filter(Boolean).join(', ');
  var permsText = Array.isArray(u.permissions) && u.permissions.length ? u.permissions.join(', ') : '—';
  var statusText = u.inactive ? 'Inactive' : 'Active';
  var verifiedText = u.verified ? 'Verified' : 'Pending';
  var twoFAText = u.twoFA ? 'Enabled' : 'Disabled';
  var createdText = u.createdAt ? new Date(u.createdAt).toLocaleString() : (u.created || '—');

  var overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'modal-user-view';
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div class="modal" style="max-width:560px;width:96%;display:flex;flex-direction:column;max-height:90vh">'+
    '<div class="modal-hdr" style="flex-shrink:0">'+
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div style="width:44px;height:44px;border-radius:50%;background:#c96442;color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+initials+'</div>'+
        '<div>'+
          '<div class="modal-t">'+_escHtml(fullName)+'</div>'+
          '<div class="modal-sub">'+_escHtml(u.email||'')+(u.role?' · '+_escHtml(u.role):'')+'</div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'modal-user-view\').remove()"><i data-lucide="x" class="lci"></i></button>'+
    '</div>'+
    '<div class="modal-body" style="flex:1;overflow-y:auto;padding:16px 20px">'+
      // Notice banner
      '<div style="padding:10px 14px;background:#fdf5f0;border:1px solid #c96442;border-radius:8px;margin-bottom:14px;display:flex;align-items:center;gap:10px">'+
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c96442" stroke-width="2.2" stroke-linecap="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'+
        '<div style="font-size:12px;color:var(--text2);line-height:1.4">Read-only view. '+(canEdit?'To edit, use the pencil icon on the users list.':'To request changes to your info, submit a support ticket below.')+'</div>'+
      '</div>'+
      // Info grid
      row('Username', u.name)+
      row('Email', u.email)+
      row('Phone', u.phone)+
      (u.phone2 ? row('Secondary Phone', u.phone2) : '')+
      row('Billing Provider', prov ? prov.name : (u.providerId||'—'))+
      row('Role(s)', roleText)+
      row('Specialties', specText)+
      row('Permissions', permsText)+
      row('Status', statusText+' · '+verifiedText)+
      row('Two-Factor Auth', twoFAText)+
      row('Created', createdText)+
    '</div>'+
    '<div class="modal-ftr" style="flex-shrink:0;display:flex;gap:8px;justify-content:'+(canEdit?'flex-end':'space-between')+'">'+
      (!canEdit ? '<button class="btn btn-primary" onclick="_openTicketForUserInfoChange(\''+userId+'\')"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>Request Change (Create Ticket)</button>' : '')+
      '<button class="btn" onclick="document.getElementById(\'modal-user-view\').remove()">Close</button>'+
    '</div>'+
    '</div>';

  document.body.appendChild(overlay);
  setTimeout(_renderLucideIcons, 20);
}

function _openTicketForUserInfoChange(userId){
  var m = document.getElementById('modal-user-view');
  if (m) m.remove();
  openTicketsModal();
  setTimeout(function(){
    window._ticketsTab = 'new';
    _renderTicketsModal();
    setTimeout(function(){
      var cat = document.getElementById('tk-cat');
      if (cat) cat.value = 'user-info';
      var subj = document.getElementById('tk-subj');
      if (subj && !subj.value) subj.value = 'Request to update my info';
      var msg = document.getElementById('tk-msg');
      if (msg) msg.focus();
    }, 50);
  }, 100);
}

function openUserSpecialtiesModal(userId){
  var sess = getSession();
  if (!sess || (sess.role !== 'Super Admin' && !hasPermission('Manage Users'))){
    toast('Only admins can manage specialties','err'); return;
  }
  var users = getUsers ? getUsers() : (_usersCache||[]);
  var u = users.find(function(x){ return x.id === userId; });
  if (!u){ toast('User not found','err'); return; }
  var db = getDB();

  // Collect ALL unique specialties across ALL providers the user could work under.
  // This ensures we always show the full menu — Frank may want to assign a
  // specialty even from a provider the user isn't currently linked to.
  var allDefs = [];
  var seen = {};
  (db.providers||[]).forEach(function(p){
    (p.specialtyDefs||[]).forEach(function(sd){
      var k = String(sd.name||'').toLowerCase().trim();
      if (!k || seen[k]) return;
      seen[k] = true;
      allDefs.push({ name: sd.name, taxonomy: sd.taxonomy||'', providerName: p.name||'' });
    });
  });

  var userSpecs = Array.isArray(u.specialties) ? u.specialties : [];
  var userSpecMap = {};
  userSpecs.forEach(function(s){
    var name = _specEntryName(s);
    if (name) userSpecMap[String(name).toLowerCase().trim()] = { role: _specEntryRole(s), active: (s && typeof s==='object') ? (s.active !== false) : true };
  });

  // Remove any prior instance
  var existing = document.getElementById('modal-user-specialties');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'modal-user-specialties';
  overlay.style.display = 'flex';

  var items = '';
  if (!allDefs.length){
    items = '<div style="padding:32px 20px;text-align:center;color:var(--text3);font-size:12px">'+
      '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#e4e1d8" stroke-width="1.8" stroke-linecap="round" style="margin:0 auto 10px;display:block"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'+
      'No specialties defined in any billing provider yet.<br>Add them in <strong>Provider Information → Specialties</strong> first.'+
      '</div>';
  } else {
    items = allDefs.map(function(sd){
      var key = String(sd.name).toLowerCase().trim();
      var assignment = userSpecMap[key];
      var checked = !!assignment;
      var role = assignment ? assignment.role : '';
      var escName = String(sd.name).replace(/"/g,'&quot;');
      return '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;background:'+(checked?'#fdf5f0':'#fff')+';transition:all .15s">'+
        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">'+
          '<input type="checkbox" class="us-spec-cb" data-name="'+escName+'" '+(checked?'checked':'')+' onchange="_usToggleRole(this)" style="accent-color:#c96442;width:16px;height:16px;flex-shrink:0;margin-top:2px">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:700;color:var(--text)">'+_escHtml(sd.name)+'</div>'+
            '<div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:1px">'+_escHtml(sd.taxonomy||'')+(sd.providerName?' · '+_escHtml(sd.providerName):'')+'</div>'+
          '</div>'+
        '</label>'+
        '<input type="text" class="us-spec-role" data-name="'+escName+'" placeholder="Role in this specialty (e.g. Therapist, Manager)" value="'+String(role).replace(/"/g,'&quot;')+'" style="width:100%;margin-top:8px;padding:6px 10px;border:1px solid var(--border2);border-radius:6px;font-size:12px;background:var(--bg2);color:var(--text);display:'+(checked?'block':'none')+'">'+
        '</div>';
    }).join('');
  }

  overlay.innerHTML =
    '<div class="modal" style="max-width:560px;width:96%;display:flex;flex-direction:column;max-height:85vh">'+
    '<div class="modal-hdr" style="flex-shrink:0">'+
      '<div>'+
        '<div class="modal-t" style="display:flex;align-items:center;gap:8px">'+
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c96442" stroke-width="2.2" stroke-linecap="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'+
          'Manage Specialties'+
        '</div>'+
        '<div class="modal-sub">'+_escHtml(((u.first||'')+' '+(u.last||'')).trim()||u.name||u.email)+' — assign or remove specialty access</div>'+
      '</div>'+
      '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'modal-user-specialties\').remove()"><i data-lucide="x" class="lci"></i></button>'+
    '</div>'+
    '<div class="modal-body" style="flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 20px">'+
      '<input type="hidden" id="us-user-id" value="'+userId+'">'+
      items+
    '</div>'+
    '<div class="modal-ftr" style="flex-shrink:0;display:flex;gap:8px;justify-content:flex-end">'+
      '<button class="btn" onclick="document.getElementById(\'modal-user-specialties\').remove()">Cancel</button>'+
      '<button class="btn btn-primary" onclick="saveUserSpecialties()"><i data-lucide="save" class="lci" style="width:14px;height:14px"></i> Save Specialties</button>'+
    '</div>'+
    '</div>';

  document.body.appendChild(overlay);
  setTimeout(_renderLucideIcons, 20);
}

function saveUserSpecialties(){
  var uid = document.getElementById('us-user-id')?.value;
  if (!uid){ toast('No user id','err'); return; }
  var users = getUsers ? getUsers() : (_usersCache||[]);
  var u = users.find(function(x){ return x.id === uid; });
  if (!u){ toast('User not found','err'); return; }

  var picked = Array.from(document.querySelectorAll('.us-spec-cb:checked')).map(function(cb){
    var name = cb.getAttribute('data-name');
    var role = '';
    try {
      var ri = document.querySelector('.us-spec-role[data-name="'+String(name).replace(/"/g,'\\"')+'"]');
      if (ri) role = ri.value.trim();
    } catch(e){}
    return { name: name, role: role, active: true };
  });

  u.specialties = picked;
  if (typeof saveUsers === 'function') saveUsers(users);
  // Also push to Firestore users collection so it syncs across devices
  try {
    if (typeof _saveUserToFirestore === 'function') _saveUserToFirestore(u);
  } catch(e){ console.warn('users firestore save err', e); }
  // If the edited user IS the currently logged-in user, refresh the session
  // specialties immediately so the topnav chip updates without re-login.
  try {
    var sess = getSession();
    if (sess && (sess.email||'').toLowerCase() === (u.email||'').toLowerCase()){
      sess.specialties = picked;
      setSession(sess);
      try { _renderTopnavSpecialtyChip(); } catch(e){}
      try { applyActiveSpecialty(); } catch(e){}
    }
  } catch(e){}

  toast('Specialties updated','ok');
  var modal = document.getElementById('modal-user-specialties');
  if (modal) modal.remove();
  try { renderUserManagement(); } catch(e){}
}

var _userTab = 'active';

var _userSearchActive = false;

function setUserTab(tab) {
  _userTab = tab;
  ['active','inactive'].forEach(function(t) {
    var btn = document.getElementById('utab-' + t);
    if (!btn) return;
    var on = t === tab;
    btn.style.borderBottomColor = on ? 'var(--brand)' : 'transparent';
    btn.style.color = on ? 'var(--brand)' : 'var(--text3)';
    btn.style.background = on ? 'var(--bg3)' : 'none';
  });
  renderUserManagement();
}

function openUserSearch() {
  var bar = document.getElementById('user-search-bar');
  if (!bar) return;
  _userSearchActive = !_userSearchActive;
  bar.style.display = _userSearchActive ? '' : 'none';
  if (_userSearchActive) setTimeout(function(){ document.getElementById('us-email')?.focus(); }, 100);
}

function toggle2FA(userId) {
  var users = getUsers ? getUsers() : [];
  var u = users.find(function(x){ return x.id === userId; });
  if (!u) return;
  u.twoFA = !u.twoFA;
  if (saveUsers) saveUsers(users);
  renderUserManagement();
  toast(u.twoFA ? '2FA enabled for ' + (u.name||u.email) : '2FA disabled for ' + (u.name||u.email), 'ok');
}

function toggleUserStatus(userId) {
  var users = getUsers ? getUsers() : [];
  var u = users.find(function(x){ return x.id === userId; });
  if (!u) return;
  u.inactive = !u.inactive;
  if (saveUsers) saveUsers(users);
  renderUserManagement();
  toast(u.inactive ? 'User deactivated' : 'User activated', 'ok');
}

function editUser(userId) {
  var users = getUsers ? getUsers() : [];
  var u = users.find(function(x){ return x.id === userId; });
  if (u) openAddUserModal(u);
}

function saveNewUser() {
  var alertEl = document.getElementById('nu-alert');
  var id        = document.getElementById('nu-id')?.value||'';
  var first     = (document.getElementById('nu-first')?.value||'').trim();
  var last      = (document.getElementById('nu-last')?.value||'').trim();
  var name      = (document.getElementById('nu-name')?.value||'').trim();
  var email     = (document.getElementById('nu-email')?.value||'').trim().toLowerCase();
  var pass      = document.getElementById('nu-pass')?.value||'';
  var phone     = (document.getElementById('nu-phone')?.value||'').trim();
  var phone2    = (document.getElementById('nu-phone2')?.value||'').trim();
  var inactive  = document.getElementById('nu-inactive')?.value === '1';
  var trackTime    = !!document.getElementById('nu-track-time')?.checked;
  var passExpire   = !!document.getElementById('nu-pass-expire')?.checked;
  var autoInactive = !!document.getElementById('nu-auto-inactive')?.checked;
  var twoFA        = !!document.getElementById('nu-twofa')?.checked;
  var specialties = Array.from(document.querySelectorAll('.nu-spec-cb:checked')).map(function(cb){
    var roleInput = document.querySelector('.nu-spec-role[data-spec="'+cb.value.replace(/"/g,'\\"')+'"]');
    return {name: cb.value, role: (roleInput?roleInput.value.trim():''), active: true};
  });
  var roles       = Array.from(document.querySelectorAll('.nu-role-cb:checked')).map(function(cb){ return cb.value; });
  var perms       = Array.from(document.querySelectorAll('.nu-perm-cb:checked')).map(function(cb){ return cb.value; });

  // Validate
  var hasErr = false;
  alertEl.innerHTML = '';
  ['nu-name-err','nu-email-err','nu-pass-err','nu-phone-err'].forEach(function(eid){
    var el = document.getElementById(eid); if (el) el.style.display = 'none';
  });

  if (!first) { alertEl.innerHTML = '<div class="alert al-error">First name is required.</div>'; return; }
  if (!last)  { alertEl.innerHTML = '<div class="alert al-error">Last name is required.</div>'; return; }

  // Username validation
  var nameErr = document.getElementById('nu-name-err');
  if (!name || !name.includes('.')) {
    if (nameErr) { nameErr.textContent = 'Username must contain a period (.) — e.g. firstname.lastname'; nameErr.style.display = ''; }
    hasErr = true;
  }

  if (!phone) { var pe = document.getElementById('nu-phone-err'); if(pe) pe.style.display=''; hasErr = true; }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { var ee = document.getElementById('nu-email-err'); if(ee) ee.style.display=''; hasErr = true; }
  // Passwords are never set by an administrator: the user sets it from the invitation email
  if (hasErr) return;

  var users = getUsers ? getUsers() : [];

  // ── Authorization guard ──────────────────────────────────────────
  // Only Super Admin or a user with the "Manage Users" permission may
  // create new users or edit OTHER users' accounts. A user editing their
  // own account without that permission may update their own contact
  // info/password but cannot change their own role, permissions, or
  // specialties (that would be self-escalation).
  var _canManageUsers = isAdmin() || hasPermission('Manage Users');
  if (!_canManageUsers) {
    if (!id) {
      alertEl.innerHTML = '<div class="alert al-error">You do not have permission to create users.</div>';
      return;
    }
    if (!isSelfUserId(id)) {
      alertEl.innerHTML = '<div class="alert al-error">You do not have permission to edit other users.</div>';
      return;
    }
    // Self-editing without Manage Users — ignore any submitted changes to
    // role/permissions/specialties and keep the existing values instead.
    var _existingSelf = users.find(function(x){ return x.id === id; });
    if (_existingSelf) {
      roles = Array.isArray(_existingSelf.roles) ? _existingSelf.roles.slice() : (_existingSelf.role ? [_existingSelf.role] : []);
      perms = Array.isArray(_existingSelf.permissions) ? _existingSelf.permissions.slice() : [];
      specialties = Array.isArray(_existingSelf.specialties) ? _existingSelf.specialties.slice() : [];
    }
  }

  // Check username duplicity
  var dupName = users.find(function(u){ return (u.name||'').toLowerCase() === name.toLowerCase() && u.id !== id; });
  if (dupName) {
    var ne = document.getElementById('nu-name-err');
    if (ne) { ne.textContent = 'Username "' + name + '" already exists. Choose a different one.'; ne.style.display = ''; }
    alertEl.innerHTML = '<div class="alert al-error">Username already exists.</div>';
    return;
  }

  // Email duplicate check removed per user request

  var primaryRole = roles[0] || 'User';

  if (!id) {
    users.push({
      id: uid(), name, first, last, email, phone, phone2,
      role: primaryRole, roles, permissions: perms, specialties,
      inactive, trackTime, passExpire, autoInactive, twoFA,
      providerId: activeProviderId, createdAt: Date.now()
    });
    if (saveUsers) saveUsers(users);
    // Close modal immediately
    var modal = document.getElementById('modal-add-user');
    if (modal) modal.remove();
    toast('User "' + name + '" created. Sending the invitation to ' + email + '…', 'ok');
    renderUserManagement();
    // Create the sign-in account in Firebase and send the invitation (set your own password)
    sendUserVerifyEmail(users[users.length-1].id);
  } else {
    var u2 = users.find(function(x){ return x.id === id; });
    if (u2) Object.assign(u2, { name, first, last, email, phone, phone2, role: primaryRole, roles, permissions: perms, specialties, inactive, trackTime, passExpire, autoInactive });
    if (saveUsers) saveUsers(users);
    var m = document.getElementById('modal-add-user');
    if (m) m.remove();
    toast('User "' + name + '" updated', 'ok');
    renderUserManagement();
  }
}

function _suggestUser(first, last) {
  var f = (first||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  var l = (last||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  if (!f || !l) return '';
  return f + '.' + l;
}

function _suggestUserName() {
  if (window._nuNameEdited) return;
  var first = document.getElementById('nu-first')?.value||'';
  var last = document.getElementById('nu-last')?.value||'';
  var suggested = _suggestUser(first, last);
  var nameEl = document.getElementById('nu-name');
  if (nameEl && suggested) nameEl.value = suggested;
}

function openAddUserModal(existingUser) {
  var prev = document.getElementById('modal-add-user');
  if (prev) prev.remove();

  var u = existingUser || {};
  var isEdit = !!u.id;

  // ── Authorization guard ──────────────────────────────────────────
  var _canManageUsers0 = isAdmin() || hasPermission('Manage Users');
  var _isSelfEdit0 = isEdit && isSelfUserId(u.id);
  if (!_canManageUsers0 && !_isSelfEdit0) {
    toast('You do not have permission to manage users', 'err');
    return;
  }
  // Self-editing without Manage Users: contact info/password OK, but
  // role/permissions/specialties must stay locked (no self-escalation).
  var _lockRolePerm = !_canManageUsers0 && _isSelfEdit0;

  var db = getDB();
  var prov = db.providers.find(function(p2){ return p2.id === activeProviderId; }) || {};
  var provSpecDefs = (prov.specialtyDefs && prov.specialtyDefs.length) ? prov.specialtyDefs : [];
  if (!provSpecDefs.length && prov.specialties && prov.specialties.length) {
    provSpecDefs = prov.specialties.map(function(s){ return { id:s, name:s, taxonomy:'', menus:[] }; });
  }
  var userSpecs = Array.isArray(u.specialties) ? u.specialties : (u.specialty ? [u.specialty] : []);
  function _findSpecEntry(name) { return userSpecs.find(function(s){ return _specEntryName(s) === name; }); }

  var session = getSession ? getSession() : {};
  var isSuperAdmin = session && _cdcIsOwnerEmail(session.email);
  var availableRoles = isSuperAdmin ? USER_ROLES : USER_ROLES.filter(function(r){ return r !== 'Super Admin'; });

  // Style helpers
  var inp = 'width:100%;box-sizing:border-box;padding:9px 11px;border:1.5px solid var(--border2);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px;outline:none;transition:border .15s';
  var secHdr = function(icon, title) {
    return '<div style="display:flex;align-items:center;gap:7px;margin:18px 0 10px;padding-bottom:6px;border-bottom:1.5px solid var(--border)">'
      + '<i data-lucide="'+icon+'" class="lci" style="width:13px;height:13px;color:var(--brand)"></i>'
      + '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3)">'+title+'</span>'
      + '</div>';
  };

  // Roles
  var rolesHtml = availableRoles.map(function(r) {
    var userRoles = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
    var chk = userRoles.indexOf(r) >= 0 ? 'checked' : '';
    var dis = _lockRolePerm ? 'disabled' : '';
    return '<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:'+(_lockRolePerm?'not-allowed':'pointer')+';padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);opacity:'+(_lockRolePerm?'.6':'1')+(chk?';border-color:var(--brand);background:var(--brand-bg)':'')+'">'+
      '<input type="checkbox" class="nu-role-cb" value="'+r+'" '+chk+' '+dis+' style="accent-color:var(--brand);width:14px;height:14px;flex-shrink:0"> '+r+'</label>';
  }).join('');

  // Permissions — 2-col grid
  var permsHtml = USER_PERMISSIONS.map(function(p3) {
    var userPerms = u.permissions || [];
    var chk = userPerms.indexOf(p3) >= 0 ? 'checked' : '';
    var dis = _lockRolePerm ? 'disabled' : '';
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:'+(_lockRolePerm?'not-allowed':'pointer')+';padding:4px 0;opacity:'+(_lockRolePerm?'.6':'1')+'">'+
      '<input type="checkbox" class="nu-perm-cb" value="'+p3+'" '+chk+' '+dis+' style="accent-color:var(--brand);width:13px;height:13px;flex-shrink:0"> '+p3+'</label>';
  }).join('');

  // Specialties
  var specsHtml = provSpecDefs.length
    ? provSpecDefs.map(function(sd) {
        var entry = _findSpecEntry(sd.name);
        var chk = entry ? 'checked' : '';
        var roleVal = entry ? _specEntryRole(entry) : '';
        var dis = _lockRolePerm ? 'disabled' : '';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg3);opacity:'+(_lockRolePerm?'.6':'1')+';transition:all .15s">'+
          '<label style="display:flex;align-items:center;gap:10px;cursor:'+(_lockRolePerm?'not-allowed':'pointer')+';flex:1;min-width:0">'+
          '<input type="checkbox" class="nu-spec-cb" value="'+sd.name+'" '+chk+' '+dis+' onchange="_nuToggleSpecRole(this)" style="accent-color:var(--brand);width:16px;height:16px;flex-shrink:0">'+
          '<div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text)">'+sd.name+'</div>'+
          (sd.taxonomy?'<div style="font-size:10px;color:var(--text3);font-family:monospace;margin-top:2px">'+sd.taxonomy+'</div>':'')+
          '</div></label>'+
          '<input type="text" class="nu-spec-role" data-spec="'+sd.name.replace(/"/g,'&quot;')+'" placeholder="Role (e.g. Therapist)" value="'+roleVal.replace(/"/g,'&quot;')+'" '+dis+' style="width:150px;flex-shrink:0;padding:6px 10px;border:1px solid var(--border2);border-radius:6px;font-size:12px;background:var(--bg);color:var(--text);display:'+(chk?'block':'none')+'">'+
          '</div>';
      }).join('')
    : '<div style="padding:14px;text-align:center;background:var(--bg3);border-radius:8px;border:1px dashed var(--border);font-size:12px;color:var(--text3)">No specialties configured.<br>Add them in <strong>Admin → Billing Providers</strong>.</div>';

  var lockNotice = _lockRolePerm
    ? '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--amber-bg,#fdf3e3);border:1px solid var(--amber-bdr,#e8c468);border-radius:8px;font-size:11px;color:var(--text2);margin-bottom:10px"><i data-lucide="lock" class="lci" style="width:13px;height:13px;flex-shrink:0"></i> Roles, permissions and specialties are locked — only a Super Admin or a user with the Manage Users permission can change these.</div>'
    : '';

  var passPlaceholder = isEdit ? 'Leave blank to keep current password' : 'Set initial password (min 6 chars)';

  var overlay = document.createElement('div');
  overlay.id = 'modal-add-user';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,19,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };

  overlay.innerHTML =
    '<input type="hidden" id="nu-id" value="'+(u.id||'')+'">'
    // Modal container
    + '<div style="background:var(--bg2);border-radius:14px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.28);overflow:hidden">'

    // ── Header ──
    + '<div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg3)">'
      + '<div style="width:36px;height:36px;background:var(--brand);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<i data-lucide="user-plus" class="lci" style="width:18px;height:18px;color:#fff"></i>'
      + '</div>'
      + '<div style="flex:1">'
        + '<div style="font-size:15px;font-weight:700;color:var(--text)">'+(isEdit?'Edit User':'Add User')+'</div>'
        + '<div style="font-size:12px;color:var(--text3)">'+(isEdit?'Update user account settings':'Create a new user account')+'</div>'
      + '</div>'
      + '<button onclick="document.getElementById(\'modal-add-user\').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;line-height:1;color:var(--text3);padding:4px">&times;</button>'
    + '</div>'

    // ── Alert area ──
    + '<div id="nu-alert" style="padding:0 20px"></div>'

    // ── Scrollable body ──
    + '<div style="padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:0">'

      // Personal info — 2-col grid
      + secHdr('user', 'Personal Information')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px">'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">First Name <span style="color:var(--red)">*</span></label><input id="nu-first" class="no-upper" value="'+(u.first||'')+'" oninput="_suggestUserName()" style="'+inp+'"></div>'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Last Name <span style="color:var(--red)">*</span></label><input id="nu-last" class="no-upper" value="'+(u.last||'')+'" oninput="_suggestUserName()" style="'+inp+'"></div>'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Username <span style="color:var(--red)">*</span> <span style="font-weight:400;color:var(--text3);font-size:10px">must contain .</span></label><input id="nu-name" class="no-upper" value="'+(u.name||_suggestUser(u.first,u.last))+'" oninput="window._nuNameEdited=true" style="'+inp+'"><div id="nu-name-err" style="display:none;color:var(--red);font-size:11px;margin-top:3px"></div></div>'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Email <span style="color:var(--red)">*</span></label><input id="nu-email" type="email" value="'+(u.email||'')+'" style="'+inp+'"><div id="nu-email-err" style="display:none;color:var(--red);font-size:11px;margin-top:3px"></div></div>'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Phone <span style="color:var(--red)">*</span></label><input id="nu-phone" class="no-upper" value="'+(u.phone||'')+'" style="'+inp+'"><div id="nu-phone-err" style="display:none;color:var(--red);font-size:11px;margin-top:3px"></div></div>'
        + '<div class="field" style="margin:0"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Phone 2</label><input id="nu-phone2" class="no-upper" value="'+(u.phone2||'')+'" style="'+inp+'"></div>'
      + '</div>'

      // Password: always set by the user from the invitation email, never by an administrator
      + '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--bg3);font-size:12px;color:var(--text2);display:flex;align-items:center;justify-content:space-between;gap:10px">'
        + '<span>'+(isEdit?'The user manages their own password.':'The user will receive an email to set their own password.')+'</span>'
        + (isEdit?('<button type="button" class="btn btn-xs btn-ghost" onclick="sendUserVerifyEmail(\''+(u.id||'')+'\')" title="Send a new invitation to set the password">Resend invitation</button>'):'')
      + '</div>'

      // Roles
      + lockNotice
      + secHdr('shield', 'Roles')
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'+rolesHtml+'</div>'

      // Permissions — 2-col
      + secHdr('lock', 'Permissions')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">'+permsHtml+'</div>'

      // Settings checkboxes
      + secHdr('settings-2', 'Settings')
      + '<div style="display:flex;flex-wrap:wrap;gap:10px">'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="nu-track-time" '+(u.trackTime?'checked':'')+' style="accent-color:var(--brand);width:14px;height:14px"> Track Time</label>'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="nu-pass-expire" '+(u.passExpire?'checked':'')+' style="accent-color:var(--brand);width:14px;height:14px"> Password Expires</label>'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="nu-auto-inactive" '+(u.autoInactive?'checked':'')+' style="accent-color:var(--brand);width:14px;height:14px"> Auto Inactive</label>'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="nu-twofa" '+(u.twoFA?'checked':'')+' style="accent-color:var(--brand);width:14px;height:14px"> Two-Factor Auth</label>'
        + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="nu-inactive" '+(u.inactive?'checked':'')+' style="accent-color:var(--brand);width:14px;height:14px"> Inactive</label>'
      + '</div>'

      // Specialties
      + secHdr('layers', 'Specialties')
      + '<div id="nu-specs" style="display:flex;flex-direction:column;gap:6px">'+specsHtml+'</div>'

    + '</div>'

    // ── Footer ──
    + '<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--bg3)">'
      + '<button class="btn" onclick="document.getElementById(\'modal-add-user\').remove()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="saveNewUser()">'+(isEdit?'Update User':'Create User')+'</button>'
    + '</div>'

  + '</div>';

  document.body.appendChild(overlay);
  // Scroll body to top
  setTimeout(function(){
    var body = overlay.querySelector('[style*="overflow-y:auto"]');
    if (body) body.scrollTop = 0;
    setTimeout(_renderLucideIcons, 30);
  }, 10);
}

function parseVerifyToken(token) {
  try {
    var raw = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    var parts = raw.split('|');
    return { userId: parts[0], email: parts[1], ts: parseInt(parts[2]) };
  } catch(e) { return null; }
}
