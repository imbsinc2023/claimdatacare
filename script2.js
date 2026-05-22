// ===================================================================
// CLINICAL INTAKE MANAGEMENT MODULE — Super Admin Only
// ===================================================================
var _icFormFilter = 'all';

function _icRequireSA() {
  var _s = getSession();
  if (!_s || _s.email !== SUPER_ADMIN_EMAIL) { go('dashboard'); toast('Access denied. Super Admin only.','err'); return false; }
  return true;
}

function _icAuditLog(action, details) {
  try {
    var _s = getSession();
    var entry = { ts: Date.now(), action: action, details: details || '', by: (_s?._email||_s?.email||'unknown'), ip: '' };
    var db = getDB();
    if (!db._auditLog) db._auditLog = [];
    db._auditLog.push(entry);
    setDB(function(d){ d._auditLog = db._auditLog; });
    if (db._auditLog.length > 5000) db._auditLog = db._auditLog.slice(-5000);
  } catch(e) {}
}

// ── Intake Center Dashboard ──
function renderIntakeCenter() {
  if (!_icRequireSA()) return;
  var db = getDB();
  var clients = db.intakeClients || [];
  var forms = db.intakeForms || [];
  var evals = db.evaluations || [];
  var submissions = db.intakeSubmissions || [];

  var statsHtml = '<div class="stats" style="margin-bottom:14px">' +
    '<div class="stat"><div class="stat-v" style="color:var(--brand)">' + clients.length + '</div><div class="stat-l">Total Intake Clients</div></div>' +
    '<div class="stat"><div class="stat-v" style="color:var(--amber)">' + clients.filter(function(c){ return c.status === 'Pending Forms' || c.status === 'Forms Sent'; }).length + '</div><div class="stat-l">Pending / Sent</div></div>' +
    '<div class="stat"><div class="stat-v" style="color:var(--green)">' + clients.filter(function(c){ return c.status === 'Signed' || c.status === 'Evaluation Completed'; }).length + '</div><div class="stat-l">Completed</div></div>' +
    '<div class="stat"><div class="stat-v" style="color:var(--purple)">' + evals.length + '</div><div class="stat-l">Evaluations</div></div>' +
    '</div>';

  var recentHtml = '<div class="card"><div class="card-title" style="margin-bottom:10px">Recent Intake Clients</div>';
  var recent = clients.slice(-5).reverse();
  if (!recent.length) {
    recentHtml += '<div class="empty" style="padding:24px"><h3>No intake clients yet</h3><p style="font-size:12px">Click "New Intake Client" to begin</p></div>';
  } else {
    recentHtml += '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Guardian</th><th>Status</th><th>Created</th></tr></thead><tbody>' +
      recent.map(function(c){
        var created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—';
        return '<tr><td style="font-weight:600">' + (c.lastName||'') + ', ' + (c.firstName||'') + '</td><td>' + (c.guardianName||'') + '</td><td>' + _icStatusBadge(c.status||'Pending Forms') + '</td><td style="font-size:12px;color:var(--text3)">' + created + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  recentHtml += '</div>';

  // Render the dashboard into the intake-center section page-body
  var icBody = document.querySelector('#sec-intake-center .page-body');
  if (icBody) {
    icBody.innerHTML = statsHtml + '<div style="margin-top:14px">' + recentHtml + '</div>';
  }
  setTimeout(_renderLucideIcons, 20);
}

function _icStatusBadge(status) {
  var colors = { 'Pending Forms': 'b-gray', 'Forms Sent': 'b-blue', 'Viewed': 'b-amber', 'Partially Completed': 'b-amber', 'Signed': 'b-green', 'Completed': 'b-green', 'Evaluation Pending': 'b-amber', 'Evaluation Completed': 'b-purple', 'Archived': 'b-gray' };
  return '<span class="badge ' + (colors[status]||'b-gray') + '">' + status + '</span>';
}

// ── Intake Clients ──
function renderIntakeClients() {
  if (!_icRequireSA()) return;
  var db = getDB();
  var list = db.intakeClients || [];
  var q = (document.getElementById('ic-client-q')?.value||'').toLowerCase();
  var statusF = document.getElementById('ic-status-filter')?.value || '';

  if (q) list = list.filter(function(c){
    return ((c.firstName||'')+' '+(c.lastName||'')+' '+(c.guardianName||'')+' '+(c.guardianPhone||'')+' '+(c.guardianEmail||'')).toLowerCase().includes(q);
  });
  if (statusF) list = list.filter(function(c){ return (c.status||'Pending Forms') === statusF; });

  // Build referral source filter options
  var refSources = [...new Set(list.map(function(c){ return c.referralSource||''; }).filter(Boolean))].sort();
  var refSel = document.getElementById('ic-client-ref');
  if (refSel) {
    var curVal = refSel.value;
    refSel.innerHTML = '<option value="">All Referral Sources</option>' + refSources.map(function(s){ return '<option value="' + s + '"' + (s === curVal ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  }
  var refF = refSel ? refSel.value : '';
  if (refF) list = list.filter(function(c){ return (c.referralSource||'') === refF; });

  var el = document.getElementById('ic-clients-tbl');
  if (!el) return;
  var fullClients = db.intakeClients || [];
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico"><i data-lucide="users" class="lci" style="width:32px;height:32px"></i></div><h3>No intake clients found</h3><p>Click "New Intake Client" to add one</p></div>';
  } else {
    el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Last, First</th><th>DOB</th><th>Guardian</th><th>Phone</th><th>Email</th><th>Referral</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function(c){
        var realIdx = fullClients.indexOf(c);
        return '<tr>' +
          '<td style="font-weight:600">' + (c.lastName||'') + ', ' + (c.firstName||'') + '</td>' +
          '<td style="font-size:12px">' + (c.dob||'') + '</td>' +
          '<td>' + (c.guardianName||'') + '</td>' +
          '<td style="font-size:12px">' + (c.guardianPhone||'') + '</td>' +
          '<td style="font-size:12px">' + (c.guardianEmail||'') + '</td>' +
          '<td style="font-size:12px">' + (c.referralSource||'—') + '</td>' +
          '<td>' + _icStatusBadge(c.status||'Pending Forms') + '</td>' +
          '<td style="white-space:nowrap"><div class="btn-group">' +
            '<button class="btn btn-xs" onclick="icOpenClientModal(' + realIdx + ')" title="Edit"><i data-lucide="pencil" class="lci" style="width:12px;height:12px"></i></button>' +
            '<button class="btn btn-xs btn-ghost" onclick="icSendIntakeLink(' + realIdx + ')" title="Send Intake Forms"><i data-lucide="mail" class="lci" style="width:12px;height:12px"></i></button>' +
            '<button class="btn btn-xs btn-ghost" onclick="icSendDemoLink(' + realIdx + ')" title="Send Demographic Intake"><i data-lucide="user-round-pen" class="lci" style="width:12px;height:12px"></i></button>' +
            '<button class="btn btn-xs btn-ghost" onclick="icViewSignedForms(' + realIdx + ')" title="View Signed Forms"><i data-lucide="file-check" class="lci" style="width:12px;height:12px"></i></button>' +
            (c.status !== 'Archived' ? '<button class="btn btn-xs btn-ghost" onclick="icOpenEvalForClient(' + realIdx + ')" title="Create Evaluation"><i data-lucide="clipboard-list" class="lci" style="width:12px;height:12px"></i></button>' : '') +
            '<button class="btn btn-xs btn-ghost danger" onclick="icDeleteClient(' + realIdx + ')" title="Delete" style="color:var(--red)"><i data-lucide="trash-2" class="lci" style="width:12px;height:12px"></i></button>' +
          '</div></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  setTimeout(_renderLucideIcons, 20);
}

function icOpenClientModal(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var c = (idx >= 0 && db.intakeClients && db.intakeClients[idx]) ? db.intakeClients[idx] : {};
  document.getElementById('ic-client-title').textContent = idx >= 0 ? 'Edit Intake Client' : 'New Intake Client';
  document.getElementById('ic-client-id').value = idx;
  document.getElementById('ic-c-first').value = c.firstName || '';
  document.getElementById('ic-c-last').value = c.lastName || '';
  document.getElementById('ic-c-dob').value = c.dob || '';
  document.getElementById('ic-c-gender').value = c.gender || '';
  document.getElementById('ic-c-language').value = c.language || '';
  document.getElementById('ic-g-name').value = c.guardianName || '';
  document.getElementById('ic-g-rel').value = c.guardianRel || '';
  document.getElementById('ic-g-phone').value = c.guardianPhone || '';
  document.getElementById('ic-g-phone2').value = c.guardianPhone2 || '';
  document.getElementById('ic-g-email').value = c.guardianEmail || '';
  document.getElementById('ic-g-addr').value = c.address || '';
  document.getElementById('ic-g-city').value = c.city || '';
  document.getElementById('ic-e-name').value = c.emergName || '';
  document.getElementById('ic-e-phone').value = c.emergPhone || '';
  document.getElementById('ic-e-rel').value = c.emergRel || '';
  document.getElementById('ic-ins-provider').value = c.insuranceProvider || '';
  document.getElementById('ic-ins-id').value = c.insuranceId || '';
  document.getElementById('ic-ins-group').value = c.insuranceGroup || '';
  document.getElementById('ic-ref-source').value = c.referralSource || '';
  document.getElementById('ic-pcp').value = c.pcp || '';
  document.getElementById('ic-school').value = c.school || '';
  document.getElementById('ic-grade').value = c.grade || '';
  document.getElementById('ic-aba-provider').value = c.abaProvider || '';
  document.getElementById('ic-dx').value = c.diagnoses || '';
  document.getElementById('ic-custody').value = c.custody || '';
  document.getElementById('ic-status').value = c.status || 'Pending Forms';
  document.getElementById('ic-notes').value = c.notes || '';
  openModal('modal-intake-client');
}

function icSaveClient() {
  if (!_icRequireSA()) return;
  var idx = parseInt(document.getElementById('ic-client-id').value);
  var firstName = document.getElementById('ic-c-first').value.trim();
  var lastName = document.getElementById('ic-c-last').value.trim();
  var guardianName = document.getElementById('ic-g-name').value.trim();
  var guardianEmail = document.getElementById('ic-g-email').value.trim();
  if (!firstName || !lastName) { toast('Child first and last name required','err'); return; }
  if (!guardianName) { toast('Guardian name required','err'); return; }

  var obj = {
    firstName: firstName,
    lastName: lastName,
    dob: document.getElementById('ic-c-dob').value,
    gender: document.getElementById('ic-c-gender').value,
    language: document.getElementById('ic-c-language').value.trim(),
    guardianName: guardianName,
    guardianRel: document.getElementById('ic-g-rel').value,
    guardianPhone: document.getElementById('ic-g-phone').value.trim(),
    guardianPhone2: document.getElementById('ic-g-phone2').value.trim(),
    guardianEmail: guardianEmail,
    address: document.getElementById('ic-g-addr').value.trim(),
    city: document.getElementById('ic-g-city').value.trim(),
    emergName: document.getElementById('ic-e-name').value.trim(),
    emergPhone: document.getElementById('ic-e-phone').value.trim(),
    emergRel: document.getElementById('ic-e-rel').value.trim(),
    insuranceProvider: document.getElementById('ic-ins-provider').value.trim(),
    insuranceId: document.getElementById('ic-ins-id').value.trim(),
    insuranceGroup: document.getElementById('ic-ins-group').value.trim(),
    referralSource: document.getElementById('ic-ref-source').value.trim(),
    pcp: document.getElementById('ic-pcp').value.trim(),
    school: document.getElementById('ic-school').value.trim(),
    grade: document.getElementById('ic-grade').value.trim(),
    abaProvider: document.getElementById('ic-aba-provider').value.trim(),
    diagnoses: document.getElementById('ic-dx').value.trim(),
    custody: document.getElementById('ic-custody').value.trim(),
    status: document.getElementById('ic-status').value,
    notes: document.getElementById('ic-notes').value.trim(),
  };

  setDB(function(db){
    if (!db.intakeClients) db.intakeClients = [];
    if (idx >= 0 && idx < db.intakeClients.length) {
      var existing = db.intakeClients[idx];
      Object.assign(existing, obj);
      existing.updatedAt = Date.now();
    } else {
      obj.id = uid();
      obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
      db.intakeClients.push(obj);
    }
  });

  closeModal('modal-intake-client');
  _icAuditLog('intake-client-save', 'Client: ' + lastName + ', ' + firstName);
  renderIntakeClients();
  toast('Intake client saved <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── Send Intake Forms ──
function icSendIntakeLink(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var c = (db.intakeClients || [])[idx];
  if (!c) { toast('Client not found','err'); return; }

  document.getElementById('si-client-id').value = idx;
  document.getElementById('si-email').value = c.guardianEmail || '';
  document.getElementById('si-message').value = '';
  document.getElementById('si-client-info').innerHTML =
    '<strong>' + (c.lastName||'') + ', ' + (c.firstName||'') + '</strong><br>' +
    'Guardian: ' + (c.guardianName||'') + ' &middot; DOB: ' + (c.dob||'—') + '<br>' +
    'Current Status: ' + (c.status||'Pending Forms');

  // List available active forms
  var forms = (db.intakeForms || []).filter(function(f){ return f.active !== false; });
  var formList = document.getElementById('si-form-list');
  if (!forms.length) {
    formList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">No active form templates. Create one in Consent Forms first.</div>';
  } else {
    formList.innerHTML = forms.map(function(f, fi){
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px">' +
        '<input type="checkbox" class="si-form-cb" value="' + fi + '" checked style="width:15px;height:15px;accent-color:var(--brand)"> ' +
        '<strong>' + (f.name||'Untitled') + '</strong> <span style="color:var(--text3);font-size:11px">(' + (f.type||'') + ')</span>' +
        '</label>';
    }).join('');
  }

  openModal('modal-send-intake');
}

function icSendIntakeForms() {
  var idx = parseInt(document.getElementById('si-client-id').value);
  var email = document.getElementById('si-email').value.trim();
  var message = document.getElementById('si-message').value.trim();
  if (!email) { toast('Guardian email is required','err'); return; }

  var db = getDB();
  var c = (db.intakeClients || [])[idx];
  if (!c) { toast('Client not found','err'); return; }

  // Collect selected form indices
  var selectedIndices = [];
  document.querySelectorAll('.si-form-cb:checked').forEach(function(cb){ selectedIndices.push(parseInt(cb.value)); });
  if (!selectedIndices.length) { toast('Select at least one form to send','warn'); return; }

  // Generate secure token + embed client data for standalone portal access
  var token = btoa(c.id + '|' + email + '|' + Date.now() + '|' + Math.random().toString(36).slice(2)).replace(/[+/=]/g, function(ch){
    return ch === '+' ? '-' : ch === '/' ? '_' : '';
  });

  // Build sign.html link — all data embedded, no login needed
  // Get active provider info + logo for sign.html branding
  var sess = typeof getSession === 'function' ? getSession() : {};
  var provId = typeof activeProviderId !== 'undefined' ? activeProviderId : (sess.providerId||'');
  var prov = (db.providers||[]).find(function(p){ return p.id===provId; }) || {};

  // Build full payload for Firestore (includes form content)
  var fullPayload = {
    token: token,
    ts: Date.now(),
    clientId: c.id,
    email: email,
    client: {
      firstName: c.firstName||'', lastName: c.lastName||'', dob: c.dob||'', gender: c.gender||'',
      guardianName: c.guardianName||'', guardianRel: c.guardianRel||'', guardianPhone: c.guardianPhone||'',
      guardianEmail: email, address: c.address||'', city: c.city||'',
      insuranceProvider: c.insuranceProvider||'', insuranceId: c.insuranceId||''
    },
    provider: {
      name: prov.name||'', logo: prov.logo||'',
      addr1: prov.addr1||'', city: prov.city||'', state: prov.state||'',
      phone: prov.phone||'', npi: prov.npi||''
    },
    forms: selectedIndices.map(function(fi){
      var f = (db.intakeForms||[])[fi]||{};
      return { id: f.id||('f'+fi), name: f.name||'Consent Form', type: f.type||'Consent', content: f.content||f.body||'' };
    })
  };

  // Save full payload to Firestore so sign.html can load it by token (no size limit)
  var intakeLink = window.location.origin + '/sign.html?token=' + encodeURIComponent(token);
  if (typeof _db !== 'undefined' && _db) {
    try {
      _db.collection('signTokens').doc(token).set(Object.assign({}, fullPayload, {
        expiresAt: new Date(Date.now() + 72*60*60*1000),
        signedAt: null
      }));
    } catch(fsErr) {
      console.warn('Firestore token save skipped:', fsErr);
      // Fallback: embed lightweight payload in URL (no form content)
      var lightPayload = JSON.parse(JSON.stringify(fullPayload));
      lightPayload.forms = lightPayload.forms.map(function(f){ return {id:f.id,name:f.name,type:f.type,content:''}; });
      delete lightPayload.provider.logo; // remove logo from URL
      intakeLink = window.location.origin + '/sign.html?d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(lightPayload)))));
    }
  } else {
    // No Firestore — embed in URL without form content
    var lightPayload2 = JSON.parse(JSON.stringify(fullPayload));
    lightPayload2.forms = lightPayload2.forms.map(function(f){ return {id:f.id,name:f.name,type:f.type,content:''}; });
    delete lightPayload2.provider.logo;
    intakeLink = window.location.origin + '/sign.html?d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(lightPayload2)))));
  }

  // Build email HTML
  var formNames = selectedIndices.map(function(fi){ return (db.intakeForms[fi]?.name||'Form'); }).join(', ');
  var childName = (c.firstName||'') + ' ' + (c.lastName||'');
  var logoHtml = '<svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#c96442"/><path d="M50 15 L80 28 L80 55 C80 72 65 84 50 90 C35 84 20 72 20 55 L20 28 Z" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/><line x1="50" y1="38" x2="50" y2="68" stroke="white" stroke-width="6" stroke-linecap="round"/><line x1="35" y1="53" x2="65" y2="53" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';

  var emailHtml = [
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">',
    '<div style="background:#141413;padding:20px 28px;display:flex;align-items:center;gap:14px">',
      logoHtml,
      '<div><div style="color:white;font-weight:700;font-size:20px">ClaimDataCare</div><div style="color:#87867f;font-size:11px;margin-top:1px">Secure Intake Portal</div></div>',
    '</div>',
    '<div style="background:#f5f4ed;padding:24px 28px;border:1px solid #e8e6dc;border-top:none">',
      '<p style="color:#141413;font-size:15px;font-weight:600;margin:0 0 6px">Secure Intake Forms for ' + childName + '</p>',
      '<p style="color:#4d4c48;font-size:13px;margin:0 0 18px;line-height:1.5">Dear ' + (c.guardianName||'Guardian') + ',</p>',
      '<p style="color:#4d4c48;font-size:13px;margin:0 0 14px;line-height:1.5">The following intake forms are ready for your review and electronic signature:</p>',
      '<div style="background:#fff;border:1px solid #e8e6dc;border-radius:8px;padding:14px 18px;margin-bottom:18px">',
        '<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#141413">Forms to complete:</p>',
        '<p style="margin:0;font-size:13px;color:#4d4c48">' + formNames + '</p>',
      '</div>',
      (message ? '<p style="color:#4d4c48;font-size:13px;margin:0 0 14px;line-height:1.5"><em>' + message + '</em></p>' : ''),
      '<div style="text-align:center;margin-bottom:18px">',
        '<a href="' + intakeLink + '" style="display:inline-block;background:#c96442;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">Complete Forms Now</a>',
        '<p style="color:#87867f;font-size:10px;margin-top:8px">This link is unique and expires in 72 hours. Do not share.</p>',
      '</div>',
      '<p style="color:#87867f;font-size:10px;border-top:1px solid #e8e6dc;padding-top:12px;margin:0">If you did not expect this email, please ignore it. &middot; ClaimDataCare &copy; 2026</p>',
    '</div></div>',
  ].join('');

  sendEmail(email, 'ClaimDataCare — Secure Intake Forms for ' + childName, emailHtml, 'intake').then(function(sent){
    if (sent) {
      // Update client status
      setDB(function(db){
        var client = (db.intakeClients || [])[idx];
        if (client && (client.status === 'Pending Forms' || !client.status)) {
          client.status = 'Forms Sent';
          client.updatedAt = Date.now();
        }
        if (!db.intakeSubmissions) db.intakeSubmissions = [];
        selectedIndices.forEach(function(fi){
          var form = (db.intakeForms || [])[fi];
          if (form) {
            db.intakeSubmissions.push({
              id: uid(),
              clientIdx: idx,
              clientId: c.id,
              formIdx: fi,
              formId: form.id,
              formName: form.name,
              guardianEmail: email,
              token: token,
              sentAt: Date.now(),
              status: 'Sent',
              childName: childName,
              guardianName: c.guardianName,
            });
          }
        });
      });
      _icAuditLog('intake-forms-sent', 'Forms: ' + formNames + ' to ' + email + ' for ' + childName);
      closeModal('modal-send-intake');
      renderIntakeClients();
      toast('Intake forms sent to ' + email + ' <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
    } else {
      toast('Failed to send email. Check email configuration.','err');
    }
  });
}

// ── Send Demographic Intake Link ──
function icSendDemoLink(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var c = (db.intakeClients || [])[idx];
  if (!c) { toast('Client not found','err'); return; }
  if (!c.guardianEmail) { toast('Guardian email required — edit client first','warn'); return; }

  var childName = (c.firstName||'') + ' ' + (c.lastName||'');
  var token = btoa(c.id + '|' + c.guardianEmail + '|' + Date.now() + '|' + Math.random().toString(36).slice(2)).replace(/[+/=]/g, function(ch){
    return ch === '+' ? '-' : ch === '/' ? '_' : '';
  });
  var baseUrl = window.location.origin + window.location.pathname;
  var idata = encodeURIComponent(btoa(JSON.stringify({
    firstName: c.firstName||'', lastName: c.lastName||'', dob: c.dob||'', gender: c.gender||'',
    guardianName: c.guardianName||'', guardianRel: c.guardianRel||'', guardianPhone: c.guardianPhone||'',
    guardianPhone2: c.guardianPhone2||'', guardianEmail: c.guardianEmail||'', address: c.address||'', city: c.city||'',
    emergName: c.emergName||'', emergPhone: c.emergPhone||'', emergRel: c.emergRel||'',
    insuranceProvider: c.insuranceProvider||'', insuranceId: c.insuranceId||'', insuranceGroup: c.insuranceGroup||'',
    referralSource: c.referralSource||'', pcp: c.pcp||'', school: c.school||'', grade: c.grade||'',
    abaProvider: c.abaProvider||'', diagnoses: c.diagnoses||'', custody: c.custody||'', language: c.language||''
  })));
  var demoLink = baseUrl + '?demographics=' + token + '&idata=' + idata;

  // Save token to submissions
  setDB(function(db){
    if (!db.intakeSubmissions) db.intakeSubmissions = [];
    db.intakeSubmissions.push({
      id: uid(), clientIdx: idx, clientId: c.id,
      guardianEmail: c.guardianEmail, token: token,
      sentAt: Date.now(), type: 'demographic', status: 'Sent',
      childName: childName, guardianName: c.guardianName,
    });
    var client = (db.intakeClients || [])[idx];
    if (client) { client.status = 'Forms Sent'; client.updatedAt = Date.now(); }
  });

  // Offer copy link or send email
  if (confirm('Send demographic intake link to ' + c.guardianEmail + '?\n\nClick OK to send via email.\nClick Cancel to copy link to clipboard.')) {
    var logoHtml = '<svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#c96442"/><path d="M50 15 L80 28 L80 55 C80 72 65 84 50 90 C35 84 20 72 20 55 L20 28 Z" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/><line x1="50" y1="38" x2="50" y2="68" stroke="white" stroke-width="6" stroke-linecap="round"/><line x1="35" y1="53" x2="65" y2="53" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';
    var emailHtml = [
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">',
      '<div style="background:#141413;padding:20px 28px;display:flex;align-items:center;gap:14px">',
        logoHtml,
        '<div><div style="color:white;font-weight:700;font-size:20px">ClaimDataCare</div><div style="color:#87867f;font-size:11px;margin-top:1px">Secure Demographic Intake</div></div>',
      '</div>',
      '<div style="background:#f5f4ed;padding:24px 28px;border:1px solid #e8e6dc;border-top:none">',
        '<p style="color:#141413;font-size:15px;font-weight:600;margin:0 0 6px">Demographic Intake for ' + childName + '</p>',
        '<p style="color:#4d4c48;font-size:13px;margin:0 0 18px;line-height:1.5">Dear ' + (c.guardianName||'Guardian') + ',</p>',
        '<p style="color:#4d4c48;font-size:13px;margin:0 0 14px;line-height:1.5">Please complete the demographic intake form for your child. This collects demographic, contact, and insurance information needed to set up your child\'s record.</p>',
        '<div style="text-align:center;margin-bottom:18px">',
          '<a href="' + demoLink + '" style="display:inline-block;background:#c96442;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">Complete Demographic Intake</a>',
          '<p style="color:#87867f;font-size:10px;margin-top:8px">This link is unique and expires in 72 hours.</p>',
        '</div>',
        '<p style="color:#87867f;font-size:10px;border-top:1px solid #e8e6dc;padding-top:12px;margin:0">ClaimDataCare &copy; 2026</p>',
      '</div></div>',
    ].join('');
    sendEmail(c.guardianEmail, 'ClaimDataCare — Demographic Intake for ' + childName, emailHtml, 'demographic').then(function(sent){
      if (sent) { toast('Demographic link sent to ' + c.guardianEmail + ' <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>'); }
      else { toast('Failed to send email. Link copied to clipboard instead.','warn'); copyToClipboard(demoLink); }
    });
  } else {
    copyToClipboard(demoLink);
    toast('Demographic intake link copied! <i data-lucide="clipboard" class="lci" style="width:13px;height:13px"></i>');
  }
  _icAuditLog('intake-demo-sent', 'Demographic link to ' + c.guardianEmail + ' for ' + childName);
  renderIntakeClients();
}

// ── Intake Forms (Consent Forms) ──
function _icSeedDefaultForms() {
  var db = getDB();
  if (db.intakeForms && db.intakeForms.length > 0) return;
  var defaults = [
    {
      name: 'HIPAA Acknowledgment & Authorization',
      type: 'HIPAA',
      category: 'Legal',
      required: true,
      electronicSig: true,
      active: true,
      description: 'Authorization to use and disclose protected health information (PHI) for treatment, payment, and healthcare operations.',
      content: '<h3>ACKNOWLEDGMENT OF NOTICE OF PRIVACY PRACTICES</h3><p>I acknowledge that I have received a copy of the Notice of Privacy Practices for {{childName}}. I understand that my protected health information may be used and disclosed for treatment, payment, and healthcare operations as described in the Notice.</p><p>I have the right to request restrictions on the use and disclosure of my protected health information. The practice is not required to agree to these restrictions.</p><p>I have the right to revoke this authorization in writing at any time, except to the extent that action has already been taken in reliance on this authorization.</p><p><strong>Child:</strong> {{childName}}<br><strong>Parent/Guardian:</strong> {{guardianName}}<br><strong>Date:</strong> {{date}}</p><p>Signature: {{signature}}</p>',
    },
    {
      name: 'Consent for Evaluation & Treatment',
      type: 'Consent',
      category: 'Clinical',
      required: true,
      electronicSig: true,
      active: true,
      description: 'Consent for comprehensive diagnostic evaluation and behavioral health treatment services.',
      content: '<h3>CONSENT FOR COMPREHENSIVE EVALUATION AND TREATMENT</h3><p>I, {{guardianName}}, as the parent/legal guardian of {{childName}}, hereby consent to a comprehensive diagnostic evaluation and/or behavioral health treatment services at ClaimDataCare Behavioral Health.</p><p>I understand that the evaluation may include clinical interviews, behavioral observations, standardized assessments, and review of records. I consent to the administration of these procedures as deemed clinically appropriate.</p><p>I understand that treatment may include behavioral health interventions, parent training, and coordination of care with other providers. I have been informed of the nature and purpose of the proposed services.</p><p>I understand that my consent is voluntary and may be withdrawn at any time.</p><p><strong>Child:</strong> {{childName}}<br><strong>Parent/Guardian:</strong> {{guardianName}}<br><strong>Date:</strong> {{date}}</p><p>Signature: {{signature}}</p>',
    },
    {
      name: 'Financial Responsibility Agreement',
      type: 'Financial',
      category: 'Administrative',
      required: true,
      electronicSig: true,
      active: true,
      description: 'Agreement regarding financial responsibility for services not covered by insurance.',
      content: '<h3>FINANCIAL RESPONSIBILITY AGREEMENT</h3><p>I, {{guardianName}}, as the parent/legal guardian of {{childName}}, agree to be financially responsible for all services provided to {{childName}} by ClaimDataCare Behavioral Health.</p><p>I understand that:</p><ul><li>I am responsible for any co-payments, co-insurance, deductibles, or non-covered services as determined by my insurance plan.</li><li>Payment is due at the time of service unless other arrangements have been made.</li><li>A valid credit/debit card may be kept on file for automatic payment of balances.</li><li>I will provide accurate and updated insurance information as changes occur.</li></ul><p><strong>Parent/Guardian:</strong> {{guardianName}}<br><strong>Date:</strong> {{date}}</p><p>Signature: {{signature}}</p>',
    },
    {
      name: 'Release of Information',
      type: 'Release',
      category: 'Legal',
      required: false,
      electronicSig: true,
      active: true,
      description: 'Authorization to exchange protected health information with specified providers, schools, or agencies.',
      content: '<h3>AUTHORIZATION FOR RELEASE OF INFORMATION</h3><p>I, {{guardianName}}, as the parent/legal guardian of {{childName}}, authorize ClaimDataCare Behavioral Health to exchange protected health information with:</p><p><strong>Organization:</strong> _________________________________<br><strong>Contact:</strong> _________________________________<br><strong>Phone:</strong> _________________________________<br><strong>Fax:</strong> _________________________________</p><p>This authorization permits the use and disclosure of the following information (check all that apply):<br>[ ] Diagnostic evaluations and reports<br>[ ] Treatment plans and progress notes<br>[ ] Psychological or developmental testing results<br>[ ] Medication records<br>[ ] Educational records and IEP/504 plans<br>[ ] Billing and insurance information</p><p>This authorization expires one year from the date of signature unless revoked earlier.</p><p><strong>Parent/Guardian:</strong> {{guardianName}}<br><strong>Date:</strong> {{date}}</p><p>Signature: {{signature}}</p>',
    },
    {
      name: 'Telehealth Consent',
      type: 'Telehealth',
      category: 'Clinical',
      required: false,
      electronicSig: true,
      active: true,
      description: 'Consent for the delivery of behavioral health services via telehealth/telemedicine.',
      content: '<h3>TELEHEALTH INFORMED CONSENT</h3><p>I, {{guardianName}}, as the parent/legal guardian of {{childName}}, hereby consent to the use of telehealth for the delivery of behavioral health services.</p><p>I understand that:</p><ul><li>Telehealth involves the use of secure video conferencing technology to provide services remotely.</li><li>I have the right to decline telehealth services and request in-person services at any time.</li><li>There are potential risks including possible technical failures and limitations in the assessment process.</li><li>Emergency procedures have been explained to me.</li><li>My privacy will be protected through encrypted, HIPAA-compliant technology.</li></ul><p><strong>Parent/Guardian:</strong> {{guardianName}}<br><strong>Date:</strong> {{date}}</p><p>Signature: {{signature}}</p>',
    },
  ];
  setDB(function(db){
    if (!db.intakeForms) db.intakeForms = [];
    if (db.intakeForms.length > 0) return;
    defaults.forEach(function(tpl){
      tpl.id = uid();
      tpl.createdAt = Date.now();
      tpl.updatedAt = Date.now();
      db.intakeForms.push(tpl);
    });
  });
}

function renderIntakeConsentForms() {
  if (!_icRequireSA()) return;
  var db = getDB();
  _icSeedDefaultForms();
  var list = db.intakeForms || [];
  var q = (document.getElementById('ic-form-q')?.value||'').toLowerCase();
  var type = document.getElementById('ic-form-type')?.value || '';
  if (q) list = list.filter(function(f){ return (f.name||'').toLowerCase().includes(q) || (f.type||'').toLowerCase().includes(q); });
  if (type) list = list.filter(function(f){ return (f.type||'') === type; });
  if (_icFormFilter === 'active') list = list.filter(function(f){ return f.active !== false; });
  if (_icFormFilter === 'archived') list = list.filter(function(f){ return f.active === false; });

  var el = document.getElementById('ic-forms-tbl');
  if (!el) return;
  var fullForms = db.intakeForms || [];
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico"><i data-lucide="file-signature" class="lci" style="width:32px;height:32px"></i></div><h3>No consent form templates</h3><p>Click "New Template" to create one</p></div>';
  } else {
    el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Electronic Sig</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' +
      list.map(function(f){
        var realIdx = fullForms.indexOf(f);
        var created = f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—';
        return '<tr>' +
          '<td style="font-weight:600">' + (f.name||'') + '</td>' +
          '<td><span class="badge b-blue" style="font-size:10px">' + (f.type||'') + '</span></td>' +
          '<td style="font-size:12px;color:var(--text2)">' + (f.category||'—') + '</td>' +
          '<td>' + (f.electronicSig !== false ? '<span style="color:var(--green);font-size:12px">Yes</span>' : '<span style="color:var(--text3);font-size:12px">No</span>') + '</td>' +
          '<td>' + (f.active !== false ? '<span class="badge b-green">Active</span>' : '<span class="badge b-gray">Archived</span>') + '</td>' +
          '<td style="font-size:12px;color:var(--text3)">' + created + '</td>' +
           '<td><div class="btn-group"><button class="btn btn-xs" onclick="icOpenFormModal(' + realIdx + ')" title="Edit"><i data-lucide="pencil" class="lci" style="width:12px;height:12px"></i></button>' +
           '<button class="btn btn-xs btn-ghost" onclick="icDeleteForm(' + realIdx + ')" title="Delete" style="color:var(--red)"><i data-lucide="trash-2" class="lci" style="width:12px;height:12px"></i></button></div></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  setTimeout(_renderLucideIcons, 20);
}

function icFormFilterSet(filter, btn) {
  _icFormFilter = filter;
  document.querySelectorAll('#sec-intake-forms .stab').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderIntakeConsentForms();
}

function icOpenFormModal(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var f = (idx >= 0 && db.intakeForms && db.intakeForms[idx]) ? db.intakeForms[idx] : {};
  document.getElementById('ic-form-title').textContent = idx >= 0 ? 'Edit Form Template' : 'New Consent Form Template';
  document.getElementById('ic-form-id').value = idx;
  document.getElementById('ic-form-name').value = f.name || '';
  document.getElementById('ic-form-type-modal').value = f.type || 'HIPAA';
  document.getElementById('ic-form-cat').value = f.category || '';
  document.getElementById('ic-form-required').checked = f.required !== false;
  document.getElementById('ic-form-desc').value = f.description || '';
  document.getElementById('ic-form-content').value = f.content || '';
  document.getElementById('ic-form-active').checked = f.active !== false;
  document.getElementById('ic-form-electronic').checked = f.electronicSig !== false;
  openModal('modal-intake-form');
}

function icSaveForm() {
  if (!_icRequireSA()) return;
  var idx = parseInt(document.getElementById('ic-form-id').value);
  var name = document.getElementById('ic-form-name').value.trim();
  if (!name) { toast('Form name is required','err'); return; }

  var obj = {
    name: name,
    type: document.getElementById('ic-form-type-modal').value,
    category: document.getElementById('ic-form-cat').value.trim(),
    required: document.getElementById('ic-form-required').checked,
    description: document.getElementById('ic-form-desc').value.trim(),
    content: document.getElementById('ic-form-content').value,
    active: document.getElementById('ic-form-active').checked,
    electronicSig: document.getElementById('ic-form-electronic').checked,
  };

  setDB(function(db){
    if (!db.intakeForms) db.intakeForms = [];
    if (idx >= 0 && idx < db.intakeForms.length) {
      Object.assign(db.intakeForms[idx], obj);
      db.intakeForms[idx].updatedAt = Date.now();
    } else {
      obj.id = uid();
      obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
      db.intakeForms.push(obj);
    }
  });

  closeModal('modal-intake-form');
  _icAuditLog('intake-form-save', 'Form: ' + name);
  renderIntakeConsentForms();
  toast('Form template saved <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── Signed Forms Viewer ──
function icViewSignedForms(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var c = (db.intakeClients || [])[idx];
  if (!c) return;
  var submissions = (db.intakeSubmissions || []).filter(function(s){
    return s.clientId === c.id || s.clientIdx === idx;
  });
  if (!submissions.length) {
    toast('No forms sent yet. Click the mail icon to send intake forms.','info');
    return;
  }
  var html = '<div style="padding:16px"><h3 style="margin-bottom:12px">Signed Forms for ' + (c.lastName||'') + ', ' + (c.firstName||'') + '</h3>';
  html += '<div class="tbl-wrap"><table><thead><tr><th>Form</th><th>Sent</th><th>Status</th><th>Signed At</th><th></th></tr></thead><tbody>';
  submissions.forEach(function(s){
    var sent = s.sentAt ? new Date(s.sentAt).toLocaleDateString() : '—';
    var signed = s.signedAt ? new Date(s.signedAt).toLocaleString() : '—';
    html += '<tr><td>' + (s.formName||'') + '</td><td style="font-size:12px">' + sent + '</td><td>' + _icStatusBadge(s.status || 'Sent') + '</td><td style="font-size:12px">' + signed + '</td>' +
      '<td>' + (s.signedAt ? '<button class="btn btn-xs" onclick="icDownloadSignedPDF(\'' + s.id + '\')"><i data-lucide="download" class="lci"></i> PDF</button>' : '') + '</td></tr>';
  });
  html += '</tbody></table></div></div>';

  var existing = document.getElementById('modal-signed-forms');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.className = 'overlay modal-ov open';
  overlay.id = 'modal-signed-forms';
  overlay.onclick = function(e) { if (e.target === overlay) { closeModal('modal-signed-forms'); } };
  overlay.innerHTML = '<div class="modal modal-lg"><div class="modal-hdr"><div><div class="modal-t">Signed Forms</div></div><button class="btn btn-ghost btn-sm" onclick="closeModal(\'modal-signed-forms\')"><i data-lucide="x" class="lci"></i></button></div><div class="modal-body">' + html + '</div></div>';
  document.body.appendChild(overlay);
  setTimeout(_renderLucideIcons, 50);
}

function icDownloadSignedPDF(submissionId) {
  var db = getDB();
  var sub = (db.intakeSubmissions || []).find(function(s){ return s.id === submissionId; });
  if (!sub) { toast('Submission not found','err'); return; }
  try {
    var client = (db.intakeClients || []).find(function(c){ return c.id === sub.clientId; });
    var form = (db.intakeForms || []).find(function(f){ return f.id === sub.formId; }) || (db.intakeForms || [])[sub.formIdx];
    var prov = (db.providers || []).find(function(p){ return p.id === activeProviderId; }) || {};
    var pdfData = _icBuildSignedPDF(sub, client, form, prov);
    if (!pdfData) { toast('PDF generation requires jsPDF library.','warn'); return; }
    var link = document.createElement('a');
    link.href = pdfData;
    link.download = 'Signed_' + (sub.formName||'Form').replace(/\s+/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    toast('Signed PDF downloaded','ok');
  } catch(e) { toast('PDF generation failed','err'); console.error(e); }
}

// ── Comprehensive Evaluation ──
function renderIntakeEvaluation() {
  if (!_icRequireSA()) return;
  var db = getDB();
  var list = db.evaluations || [];
  var q = (document.getElementById('ic-eval-q')?.value||'').toLowerCase();
  var statusF = document.getElementById('ic-eval-status')?.value || '';
  if (q) list = list.filter(function(e){
    var c = (db.intakeClients || []).find(function(cl){ return cl.id === e.clientId; });
    var name = (c ? (c.lastName||'') + ' ' + (c.firstName||'') : e.clientName||'');
    return name.toLowerCase().includes(q);
  });
  if (statusF) list = list.filter(function(e){ return (e.status||'Draft') === statusF; });

  var el = document.getElementById('ic-eval-tbl');
  if (!el) return;
  var fullEvals = db.evaluations || [];
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico"><i data-lucide="clipboard-list" class="lci" style="width:32px;height:32px"></i></div><h3>No evaluations yet</h3><p>Click "New Evaluation" to start one</p></div>';
  } else {
    el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Client</th><th>DOB</th><th>Evaluation Date</th><th>Status</th><th>Last Updated</th><th></th></tr></thead><tbody>' +
      list.map(function(e){
        var realIdx = fullEvals.indexOf(e);
        var c = (db.intakeClients || []).find(function(cl){ return cl.id === e.clientId; });
        var name = c ? (c.lastName||'') + ', ' + (c.firstName||'') : (e.clientName||'Unknown');
        var dob = c ? (c.dob||'') : '';
        var updated = e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : (e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '—');
        return '<tr>' +
          '<td style="font-weight:600">' + name + '</td>' +
          '<td style="font-size:12px">' + dob + '</td>' +
          '<td style="font-size:12px">' + (e.evalDate||'') + '</td>' +
          '<td>' + _icEvalStatusBadge(e.status||'Draft') + '</td>' +
          '<td style="font-size:12px;color:var(--text3)">' + updated + '</td>' +
           '<td><div class="btn-group"><button class="btn btn-xs" onclick="icOpenEvalModal(' + realIdx + ')" title="Edit"><i data-lucide="pencil" class="lci" style="width:12px;height:12px"></i></button>' +
           '<button class="btn btn-xs btn-ghost" onclick="icDeleteEval(' + realIdx + ')" title="Delete" style="color:var(--red)"><i data-lucide="trash-2" class="lci" style="width:12px;height:12px"></i></button>' +
           '<button class="btn btn-xs btn-ghost" onclick="icGenerateWordDoc(\'' + e.id + '\')" title="Generate Word Doc"><i data-lucide="file-text" class="lci" style="width:12px;height:12px"></i></button></div></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  setTimeout(_renderLucideIcons, 20);
}

function _icEvalStatusBadge(status) {
  var colors = { 'Draft': 'b-gray', 'In Progress': 'b-blue', 'Completed': 'b-green' };
  return '<span class="badge ' + (colors[status]||'b-gray') + '">' + status + '</span>';
}

function icOpenEvalForClient(idx) {
  var db = getDB();
  var c = (db.intakeClients || [])[idx];
  if (!c) { toast('Client not found','err'); return; }
  // Check if evaluation already exists
  var existing = (db.evaluations || []).findIndex(function(e){ return e.clientId === c.id; });
  if (existing >= 0) {
    icOpenEvalModal(existing);
  } else {
    // Create a new one
    icOpenEvalModal(-1);
    document.getElementById('ic-eval-client-id').value = c.id || '';
    document.getElementById('ic-eval-client-sel').value = c.id || '';
  }
}

function icOpenEvalModal(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var e = (idx >= 0 && db.evaluations && db.evaluations[idx]) ? db.evaluations[idx] : {};

  // Populate client dropdown
  var clients = db.intakeClients || [];
  var clientSel = document.getElementById('ic-eval-client-sel');
  clientSel.innerHTML = '<option value="">Select client...</option>' +
    clients.map(function(c){ return '<option value="' + (c.id||'') + '">' + (c.lastName||'') + ', ' + (c.firstName||'') + '</option>'; }).join('');

  document.getElementById('ic-eval-title').textContent = idx >= 0 ? 'Edit Comprehensive Evaluation' : 'New Comprehensive Evaluation';
  document.getElementById('ic-eval-id').value = idx;
  document.getElementById('ic-eval-uuid').value = e.id || '';
  document.getElementById('ic-eval-client-id').value = e.clientId || '';
  clientSel.value = e.clientId || '';
  document.getElementById('ic-eval-date').value = e.evalDate || '';
  document.getElementById('ic-eval-status-modal').value = e.status || 'Draft';

  // Fill all fields
  var fields = ['prenatal','milestones','behavior','communication','sensory','repetitive','social','emotional',
    'education','schoolPerf','therapies','priorDx','family','medical','psych','meds','sleep','eating','adaptive',
    'safety','trauma','strengths','goals','subjective'];
  fields.forEach(function(f){
    var el = document.getElementById('ic-e-' + f);
    if (el) el.value = e[f] || '';
  });

  openModal('modal-intake-eval');
}

function icEvalClientChanged(clientId) {
  document.getElementById('ic-eval-client-id').value = clientId || '';
}

function icSaveEval() {
  if (!_icRequireSA()) return;
  var idx = parseInt(document.getElementById('ic-eval-id').value);
  var clientId = document.getElementById('ic-eval-client-id').value;
  if (!clientId) { toast('Please select a client','err'); return; }

  var obj = { clientId: clientId };
  obj.evalDate = document.getElementById('ic-eval-date').value;
  obj.status = document.getElementById('ic-eval-status-modal').value;

  var fields = ['prenatal','milestones','behavior','communication','sensory','repetitive','social','emotional',
    'education','schoolPerf','therapies','priorDx','family','medical','psych','meds','sleep','eating','adaptive',
    'safety','trauma','strengths','goals','subjective'];
  fields.forEach(function(f){
    var el = document.getElementById('ic-e-' + f);
    if (el) obj[f] = el.value;
  });

  setDB(function(db){
    if (!db.evaluations) db.evaluations = [];
    if (idx >= 0 && idx < db.evaluations.length) {
      Object.assign(db.evaluations[idx], obj);
      db.evaluations[idx].updatedAt = Date.now();
      document.getElementById('ic-eval-uuid').value = db.evaluations[idx].id;
    } else {
      obj.id = uid();
      obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
      db.evaluations.push(obj);
      document.getElementById('ic-eval-uuid').value = obj.id;
    }
  });

  closeModal('modal-intake-eval');
  _icAuditLog('intake-eval-save', 'Evaluation for client: ' + clientId);
  renderIntakeEvaluation();
  toast('Evaluation saved <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── Delete Functions ──
function icDeleteClient(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var c = db.intakeClients && db.intakeClients[idx];
  if (!c) { toast('Client not found','err'); return; }
  if (!confirm('Delete intake client "' + (c.firstName||'') + ' ' + (c.lastName||'') + '"?\nThis action cannot be undone.')) return;
  setDB(function(db){
    if (db.intakeClients) db.intakeClients.splice(idx, 1);
  });
  _icAuditLog('intake-client-delete', 'Deleted: ' + (c.firstName||'') + ' ' + (c.lastName||''));
  renderIntakeEvaluation();
  toast('Client deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

function icDeleteForm(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var f = db.intakeForms && db.intakeForms[idx];
  if (!f) { toast('Form not found','err'); return; }
  if (!confirm('Delete form template "' + (f.name||'') + '"?\nThis action cannot be undone.')) return;
  setDB(function(db){
    if (db.intakeForms) db.intakeForms.splice(idx, 1);
  });
  _icAuditLog('intake-form-delete', 'Deleted: ' + (f.name||''));
  renderIntakeConsentForms();
  toast('Form deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

function icDeleteEval(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var e = db.evaluations && db.evaluations[idx];
  if (!e) { toast('Evaluation not found','err'); return; }
  if (!confirm('Delete evaluation for client "' + (e.clientId||'') + '"?\nThis action cannot be undone.')) return;
  setDB(function(db){
    if (db.evaluations) db.evaluations.splice(idx, 1);
  });
  _icAuditLog('intake-eval-delete', 'Deleted evaluation for client: ' + (e.clientId||''));
  renderIntakeEvaluation();
  toast('Evaluation deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── AI Narrative Generation ──
function icGenerateNarrative() {
  var fields = {
    prenatal: { label: 'Prenatal/Perinatal History', el: 'ic-e-prenatal' },
    milestones: { label: 'Developmental Milestones', el: 'ic-e-milestones' },
    behavior: { label: 'Behavioral Concerns', el: 'ic-e-behavior' },
    communication: { label: 'Communication History', el: 'ic-e-communication' },
    sensory: { label: 'Sensory Concerns', el: 'ic-e-sensory' },
    repetitive: { label: 'Repetitive Behaviors', el: 'ic-e-repetitive' },
    social: { label: 'Social Functioning', el: 'ic-e-social' },
    emotional: { label: 'Emotional/Behavioral Regulation', el: 'ic-e-emotional' },
    education: { label: 'Educational History', el: 'ic-e-education' },
    schoolPerf: { label: 'School Performance', el: 'ic-e-school-perf' },
    therapies: { label: 'Therapies Received', el: 'ic-e-therapies' },
    priorDx: { label: 'Prior Diagnoses', el: 'ic-e-prior-dx' },
    family: { label: 'Family/Social History', el: 'ic-e-family' },
    medical: { label: 'Medical History', el: 'ic-e-medical' },
    psych: { label: 'Psychiatric History', el: 'ic-e-psych' },
    meds: { label: 'Medications', el: 'ic-e-meds' },
    sleep: { label: 'Sleep Patterns', el: 'ic-e-sleep' },
    eating: { label: 'Eating Patterns', el: 'ic-e-eating' },
    adaptive: { label: 'Adaptive Functioning', el: 'ic-e-adaptive' },
    safety: { label: 'Safety Concerns', el: 'ic-e-safety' },
    trauma: { label: 'Trauma/Stressors', el: 'ic-e-trauma' },
    strengths: { label: 'Strengths & Interests', el: 'ic-e-strengths' },
    goals: { label: 'Parent Concerns & Goals', el: 'ic-e-goals' },
  };

  var parts = [];
  var hasData = false;
  Object.keys(fields).forEach(function(k){
    var val = (document.getElementById(fields[k].el)?.value||'').trim();
    if (val) {
      hasData = true;
      parts.push(fields[k].label + ': ' + val);
    }
  });

  if (!hasData) {
    toast('No data entered yet. Fill in evaluation fields first.','warn');
    return;
  }

  // Build a structured SUBJECTIVE narrative
  var clientName = '';
  var clientId = document.getElementById('ic-eval-client-id').value;
  if (clientId) {
    var db = getDB();
    var c = (db.intakeClients || []).find(function(cl){ return cl.id === clientId; });
    if (c) clientName = (c.firstName||'') + ' ' + (c.lastName||'');
  }

  var narrative = 'SUBJECTIVE\n\n';
  narrative += clientName ? clientName + ' is a ' + (document.getElementById('ic-c-dob')?.value ? '' : '') + 'year-old ' + (document.getElementById('ic-c-gender')?.value||'').toLowerCase() + ' ' : 'The client ';
  narrative += 'presented for a comprehensive diagnostic evaluation. The following information was obtained through clinical interview with the parent/guardian and review of available records.\n\n';

  // Organize into sections
  var sectionOrder = [
    { title: 'Developmental History', keys: ['prenatal','milestones','behavior'] },
    { title: 'Communication and Social Functioning', keys: ['communication','social'] },
    { title: 'Behavioral and Emotional Presentation', keys: ['behavior','emotional','repetitive','sensory'] },
    { title: 'Educational History and School Performance', keys: ['education','schoolPerf'] },
    { title: 'Medical and Psychiatric History', keys: ['medical','psych','meds','priorDx'] },
    { title: 'Therapeutic History', keys: ['therapies'] },
    { title: 'Family and Social History', keys: ['family'] },
    { title: 'Daily Functioning', keys: ['sleep','eating','adaptive'] },
    { title: 'Safety and Risk Considerations', keys: ['safety','trauma'] },
    { title: 'Strengths and Interests', keys: ['strengths'] },
    { title: 'Parent/Guardian Concerns and Goals', keys: ['goals'] },
  ];

  sectionOrder.forEach(function(sec){
    var secParts = [];
    sec.keys.forEach(function(k){
      var val = (document.getElementById(fields[k]?.el)?.value||'').trim();
      if (val) secParts.push(val);
    });
    if (secParts.length) {
      narrative += '\n' + sec.title.toUpperCase() + '\n';
      secParts.forEach(function(p){ narrative += '  ' + p + '\n'; });
    }
  });

  narrative += '\nThe above represents the subjective history as reported by the parent/guardian and is based on clinical interview. This information is intended to inform the diagnostic formulation and is subject to review and interpretation by the evaluating clinician.\n';
  narrative += '\n--- THIS IS THE SUBJECTIVE SECTION ONLY ---\n';
  narrative += 'Assessment, Plan, and diagnostic conclusions must be added separately by the evaluating provider.\n';

  document.getElementById('ic-e-subjective').value = narrative;
  _icAuditLog('intake-narrative-generated', 'Client: ' + clientName);
  toast('Narrative generated. Review and edit before finalizing.','info');
}

// ── Word Document Generation ──
function icGenerateWordDoc(evalId) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var e = (db.evaluations || []).find(function(ev){ return ev.id === evalId; });
  if (!e) { toast('Evaluation not found','err'); return; }

  var c = (db.intakeClients || []).find(function(cl){ return cl.id === e.clientId; });
  var clientName = c ? ((c.firstName||'') + ' ' + (c.lastName||'')) : (e.clientName||'Unknown');
  var dob = c ? (c.dob||'') : '';
  var gender = c ? (c.gender||'') : '';
  var guardian = c ? (c.guardianName||'') : '';
  var evalDate = e.evalDate || new Date().toISOString().slice(0,10);

  // Build HTML for Word document
  var htmlContent = [
    '<html xmlns:o="http://www.w3.org/TR/REC-html-RDFa-2" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="UTF-8"><style>',
    'body { font-family: "Calibri", "Times New Roman", serif; font-size: 12pt; color: #1a1a1a; margin: 1in; line-height: 1.8; }',
    'h1 { font-size: 18pt; font-weight: 700; color: #1a1a1a; text-align: center; margin-bottom: 4pt; letter-spacing: 0.5pt; }',
    'h2 { font-size: 14pt; font-weight: 700; color: #2c2c2c; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #666; padding-bottom: 3pt; }',
    'h3 { font-size: 12pt; font-weight: 700; color: #333; margin-top: 12pt; margin-bottom: 4pt; }',
    'p { margin: 0 0 6pt 0; text-align: justify; }',
    '.header { text-align: center; margin-bottom: 24pt; }',
    '.header .practice { font-size: 16pt; font-weight: 700; }',
    '.header .info { font-size: 10pt; color: #555; }',
    '.demographics { margin-bottom: 18pt; }',
    '.demographics table { width: 100%; border-collapse: collapse; font-size: 11pt; }',
    '.demographics td { padding: 3pt 6pt; border: 1px solid #ccc; }',
    '.demographics .label { font-weight: 700; width: 30%; background: #f5f5f5; }',
    '.subjective { margin-top: 18pt; }',
    '.subjective p { text-indent: 0; margin-bottom: 8pt; }',
    '.note { font-size: 10pt; color: #888; font-style: italic; margin-top: 18pt; border-top: 1px solid #ccc; padding-top: 8pt; }',
    '.page-break { page-break-before: always; }',
    '</style></head><body>',
    '<div class="header">',
    '<div class="practice">ClaimDataCare Behavioral Health</div>',
    '<div class="info">Comprehensive Diagnostic Evaluation &mdash; SUBJECTIVE Section</div>',
    '<div class="info">Date of Evaluation: ' + evalDate + '</div>',
    '</div>',
    '<h2>Demographic Information</h2>',
    '<div class="demographics"><table>',
    '<tr><td class="label">Client Name</td><td>' + clientName + '</td></tr>',
    '<tr><td class="label">Date of Birth</td><td>' + dob + '</td></tr>',
    '<tr><td class="label">Gender</td><td>' + gender + '</td></tr>',
    '<tr><td class="label">Parent/Guardian</td><td>' + guardian + '</td></tr>',
    '<tr><td class="label">Evaluation Date</td><td>' + evalDate + '</td></tr>',
    '</table></div>',
    '<h2>Subjective Clinical Documentation</h2>',
    '<div class="subjective">'
  ];

  // Add sections that have content
  var sections = [
    { title: 'Developmental History', fields: ['prenatal','milestones','behavior'] },
    { title: 'Communication History', fields: ['communication'] },
    { title: 'Sensory and Repetitive Behaviors', fields: ['sensory','repetitive'] },
    { title: 'Social and Emotional Functioning', fields: ['social','emotional'] },
    { title: 'Educational History', fields: ['education','schoolPerf'] },
    { title: 'Therapeutic and Intervention History', fields: ['therapies'] },
    { title: 'Medical and Psychiatric History', fields: ['medical','psych','meds','priorDx'] },
    { title: 'Family and Social History', fields: ['family'] },
    { title: 'Daily Living and Adaptive Functioning', fields: ['sleep','eating','adaptive'] },
    { title: 'Safety and Risk Assessment', fields: ['safety','trauma'] },
    { title: 'Strengths and Interests', fields: ['strengths'] },
    { title: 'Parent/Guardian Concerns and Goals for Evaluation', fields: ['goals'] },
    { title: 'Additional Clinical Observations', fields: ['subjective'] },
  ];

  var hasContent = false;
  sections.forEach(function(sec){
    var secTexts = [];
    sec.fields.forEach(function(f){
      if (e[f] && e[f].trim()) secTexts.push(e[f].trim());
    });
    if (secTexts.length) {
      hasContent = true;
      htmlContent.push('<h3>' + sec.title + '</h3>');
      secTexts.forEach(function(t){
        htmlContent.push('<p>' + t.replace(/\n/g, '<br>') + '</p>');
      });
    }
  });

  if (!hasContent) {
    htmlContent.push('<p><em>No subjective data has been documented for this domain at this time. Further information may be obtained through additional clinical interview and record review.</em></p>');
  }

  htmlContent.push(
    '</div>',
    '<p class="note">',
    '<strong>Clinical Note:</strong> This document represents the SUBJECTIVE portion of the comprehensive diagnostic evaluation only. The information contained herein is based on parent/guardian report and clinical interview. Assessment, diagnostic impressions, and treatment recommendations are not included in this section and must be documented separately by the evaluating clinician.<br><br>',
    'Document generated: ' + new Date().toLocaleString() + '<br>',
    'Electronic signature: ___________________________________ &nbsp;&nbsp; Date: _______________<br>',
    '</p>',
    '</body></html>'
  );

  var fullHtml = htmlContent.join('\n');
  var blob = new Blob([fullHtml], { type: 'application/msword;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'Comprehensive_Evaluation_' + clientName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + evalDate + '.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  _icAuditLog('intake-word-generated', 'Evaluation: ' + evalId + ' for ' + clientName);
  toast('Word document generated <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── Signature Pad ──
var _sigCanvas = null;
var _sigCtx = null;
var _sigDrawing = false;
var _sigMode = 'draw';
var _sigCallback = null;

function icOpenSignaturePad(signerName, signerEmail, callback) {
  document.getElementById('sig-signer-info').innerHTML = 'Signing as: <strong>' + (signerName||'') + '</strong> &middot; ' + (signerEmail||'');
  document.getElementById('sig-result-data').value = '';
  document.getElementById('sig-result-type').value = '';
  _sigCallback = callback ? callback.toString() : '';
  document.getElementById('sig-callback').value = _sigCallback;

  // Reset mode
  icSetSigMode('draw');
  openModal('modal-signature');

  setTimeout(function(){
    _sigCanvas = document.getElementById('sig-canvas');
    if (!_sigCanvas) return;
    _sigCtx = _sigCanvas.getContext('2d');
    _sigCtx.fillStyle = '#fff';
    _sigCtx.fillRect(0, 0, _sigCanvas.width, _sigCanvas.height);
    _sigCtx.strokeStyle = '#141413';
    _sigCtx.lineWidth = 2;
    _sigCtx.lineCap = 'round';
    _sigCtx.lineJoin = 'round';

    // Mouse events
    _sigCanvas.onmousedown = function(e){
      _sigDrawing = true;
      var rect = _sigCanvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (_sigCanvas.width / rect.width);
      var y = (e.clientY - rect.top) * (_sigCanvas.height / rect.height);
      _sigCtx.beginPath();
      _sigCtx.moveTo(x, y);
    };
    _sigCanvas.onmousemove = function(e){
      if (!_sigDrawing) return;
      var rect = _sigCanvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (_sigCanvas.width / rect.width);
      var y = (e.clientY - rect.top) * (_sigCanvas.height / rect.height);
      _sigCtx.lineTo(x, y);
      _sigCtx.stroke();
    };
    _sigCanvas.onmouseup = function(){ _sigDrawing = false; _sigCtx.closePath(); };
    _sigCanvas.onmouseleave = function(){ _sigDrawing = false; };

    // Touch events
    _sigCanvas.ontouchstart = function(e){
      e.preventDefault();
      var touch = e.touches[0];
      var rect = _sigCanvas.getBoundingClientRect();
      var x = (touch.clientX - rect.left) * (_sigCanvas.width / rect.width);
      var y = (touch.clientY - rect.top) * (_sigCanvas.height / rect.height);
      _sigCtx.beginPath();
      _sigCtx.moveTo(x, y);
    };
    _sigCanvas.ontouchmove = function(e){
      e.preventDefault();
      if (!e.touches.length) return;
      var touch = e.touches[0];
      var rect = _sigCanvas.getBoundingClientRect();
      var x = (touch.clientX - rect.left) * (_sigCanvas.width / rect.width);
      var y = (touch.clientY - rect.top) * (_sigCanvas.height / rect.height);
      _sigCtx.lineTo(x, y);
      _sigCtx.stroke();
    };
    _sigCanvas.ontouchend = function(e){ e.preventDefault(); };
  }, 200);
}

function icClearSignature() {
  if (!_sigCtx || !_sigCanvas) return;
  _sigCtx.fillStyle = '#fff';
  _sigCtx.fillRect(0, 0, _sigCanvas.width, _sigCanvas.height);
  document.getElementById('sig-type-input').value = '';
  document.getElementById('sig-type-preview').innerHTML = '';
  document.getElementById('sig-result-data').value = '';
}

function icSetSigMode(mode) {
  _sigMode = mode;
  document.getElementById('sig-canvas-wrap').style.display = mode === 'draw' ? '' : 'none';
  document.getElementById('sig-type-wrap').style.display = mode === 'type' ? '' : 'none';
  document.querySelectorAll('#modal-signature [id^="sig-mode-"]').forEach(function(b){
    b.style.background = '';
    b.style.color = '';
  });
  var btn = document.getElementById('sig-mode-' + mode);
  if (btn) { btn.style.background = 'var(--brand)'; btn.style.color = '#fff'; }
}

function icPreviewTypeSig(val) {
  document.getElementById('sig-type-preview').textContent = val || '';
}

function icConfirmSignature() {
  var sigData = '';
  var sigType = _sigMode;

  if (_sigMode === 'draw') {
    if (!_sigCanvas) { toast('Signature pad not ready','err'); return; }
    sigData = _sigCanvas.toDataURL('image/png');
    // Check if anything was drawn
    var pixels = _sigCtx.getImageData(0, 0, _sigCanvas.width, _sigCanvas.height).data;
    var hasDrawing = false;
    for (var i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) { hasDrawing = true; break; }
    }
    if (!hasDrawing) { toast('Please draw your signature','warn'); return; }
  } else {
    var typedName = document.getElementById('sig-type-input').value.trim();
    if (!typedName) { toast('Please type your full name','warn'); return; }
    sigData = typedName;
  }

  document.getElementById('sig-result-data').value = sigData;
  document.getElementById('sig-result-type').value = sigType;

  var sigObj = {
    data: sigData,
    type: sigType,
    timestamp: Date.now(),
    signerIp: '',
  };

  closeModal('modal-signature');
  _icAuditLog('signature-captured', 'Mode: ' + sigType);

  // Execute callback if set
  var cbStr = document.getElementById('sig-callback').value || _sigCallback;
  if (cbStr && cbStr !== '') {
    try {
      var cb = new Function('sig', cbStr);
      cb(sigObj);
    } catch(e) {
      console.warn('Signature callback error:', e);
    }
  }

  toast('Signature captured <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
}

// ── Legacy Intake Center tab support ──
function icSetTab(tab, btn) {
  document.querySelectorAll('#sec-intake-center .stab').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('ic-panel-clients').style.display = tab === 'clients' ? '' : 'none';
  document.getElementById('ic-panel-forms').style.display = tab === 'forms' ? '' : 'none';
  document.getElementById('ic-panel-eval').style.display = tab === 'eval' ? '' : 'none';
  if (tab === 'clients') renderIntakeClients();
  else if (tab === 'forms') renderIntakeConsentForms();
  else if (tab === 'eval') renderIntakeEvaluation();
}

// ── Intake Link Firestore Helper (anonymous/public sessions) ──
function _icExtractIData() {
  try {
    var m = window.location.search.match(/[?&]idata=([^&]+)/);
    if (!m) return null;
    var json = atob(decodeURIComponent(m[1]));
    var data = JSON.parse(json);
    if (data.firstName || data.lastName) return data;
  } catch(e) {}
  return null;
}

function _icTryFirestoreLoad(clientId, callback) {
  if (!_db || !firebase || !firebase.firestore) { callback(false); return; }
  document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif"><div style="text-align:center;color:#87867f;font-size:14px"><div style="width:40px;height:40px;border:3px solid #e8e6dc;border-top-color:#c96442;border-radius:50%;animation:spinner .8s linear infinite;margin:0 auto 16px"></div>Loading your secure intake forms...</div></div>';
  var db = getDB();
  // Try direct Firestore query for this intake client
  _db.collection('intakeClients').where('id', '==', clientId).get().then(function(snap) {
    if (!snap.empty) {
      var data = snap.docs[0].data();
      if (!db.intakeClients) db.intakeClients = [];
      // Avoid duplicates
      var existing = db.intakeClients.find(function(c){ return c.id === data.id; });
      if (!existing) db.intakeClients.push(data);
      // Also try to load intake forms and submissions for full portal functionality
      Promise.all([
        _db.collection('intakeForms').get().then(function(sf) {
          if (!sf.empty) {
            if (!db.intakeForms) db.intakeForms = [];
            sf.docs.forEach(function(d){
              var f = d.data();
              if (!db.intakeForms.find(function(x){ return x.id === f.id; })) db.intakeForms.push(f);
            });
          }
        }).catch(function(){}),
        _db.collection('intakeSubmissions').get().then(function(ss) {
          if (!ss.empty) {
            if (!db.intakeSubmissions) db.intakeSubmissions = [];
            ss.docs.forEach(function(d){
              var s = d.data();
              if (!db.intakeSubmissions.find(function(x){ return x.id === s.id; })) db.intakeSubmissions.push(s);
            });
          }
        }).catch(function(){})
      ]).then(function() { callback(true); }).catch(function() { callback(true); });
    } else {
      // Try older format where documents use auto-ID with id field
      _db.collection('intakeClients').get().then(function(allSnap) {
        if (!allSnap.empty) {
          var found = false;
          allSnap.docs.forEach(function(d){
            var data = d.data();
            if (data.id === clientId) {
              if (!db.intakeClients) db.intakeClients = [];
              var existing = db.intakeClients.find(function(c){ return c.id === data.id; });
              if (!existing) db.intakeClients.push(data);
              found = true;
            }
          });
          callback(found);
        } else {
          callback(false);
        }
      }).catch(function() { callback(false); });
    }
  }).catch(function(e) {
    // Firestore query failed (permissions/offline) — try loading from localStorage backup
    try {
      var backup = localStorage.getItem('cdc_firestore_backup_intakeClients');
      if (backup) {
        var parsed = JSON.parse(backup);
        var match = parsed.find(function(c){ return c.id === clientId; });
        if (match) {
          if (!db.intakeClients) db.intakeClients = [];
          var existing = db.intakeClients.find(function(c){ return c.id === match.id; });
          if (!existing) db.intakeClients.push(match);
          callback(true);
          return;
        }
      }
    } catch(_) {}
    callback(false);
  });
}

// ── Intake Link Verification Handler ──
function checkIntakeToken() {
  var search = window.location.search;
  if (!search.startsWith('?intake=')) { checkDemographicToken(); return; }
  var token = search.slice(8);
  var raw = '';
  try { raw = atob(token.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) { return; }
  var parts = raw.split('|');
  if (parts.length < 3) return;
  var intakeClientId = parts[0];
  var intakeEmail = parts[1];
  var ts = parseInt(parts[2]);

  if (Date.now() - ts > 72 * 60 * 60 * 1000) {
    document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif;padding:20px"><div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;text-align:center;max-width:400px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><h3 style="margin:16px 0 8px;color:#141413">Link Expired</h3><p style="color:#87867f;font-size:14px;line-height:1.5">This intake link has expired (72 hours). Please contact the provider for a new link.</p></div></div>';
    return;
  }

  function _tryLoad(tries) {
    var db = getDB();
    var c = (db.intakeClients || []).find(function(cl){ return cl.id === intakeClientId; });
    if (!c) {
      var _idx = parseInt(intakeClientId);
      if (!isNaN(_idx)) c = (db.intakeClients || [])[_idx];
    }
    if (!c) {
      if (tries > 0) {
        document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif"><div style="text-align:center;color:#87867f;font-size:14px"><div style="width:40px;height:40px;border:3px solid #e8e6dc;border-top-color:#c96442;border-radius:50%;animation:spinner .8s linear infinite;margin:0 auto 16px"></div>Loading your secure intake forms...</div></div>';
        setTimeout(function(){ _tryLoad(tries - 1); }, 800);
      } else {
        // Retries exhausted — try embedded client data from URL (standalone portal)
        var _idata = _icExtractIData();
        if (_idata) {
          var db2 = getDB();
          if (!db2.intakeClients) db2.intakeClients = [];
          _idata.id = intakeClientId;
          db2.intakeClients.push(_idata);
          _tryLoad(15);
        } else {
          _icTryFirestoreLoad(intakeClientId, function(found) {
            if (found) { _tryLoad(15); }
            else {
              document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif;padding:20px"><div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;text-align:center;max-width:400px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><h3 style="margin:16px 0 8px;color:#141413">Unable to Load</h3><p style="color:#87867f;font-size:14px;line-height:1.5">We could not find your intake record. Please contact the provider and request a new link.</p></div></div>';
            }
          });
        }
      }
      return;
    }

    var pendingSubs = (db.intakeSubmissions || []).filter(function(s){ return s.token === token && s.status !== 'Signed'; });
    // If no submissions found in DB (unauthenticated visitor), 
    // synthesize from all active forms so the portal still loads
    if (!pendingSubs.length) {
      var allForms = db.intakeForms || [];
      var activeForms = allForms.filter(function(f){ return f.active !== false; });
      if (activeForms.length) {
        pendingSubs = activeForms.map(function(f, fi) {
          return {
            id: 'syn_' + fi,
            clientId: c.id,
            formId: f.id,
            formIdx: fi,
            formName: f.name,
            guardianEmail: intakeEmail,
            token: token,
            status: 'Sent',
            childName: (c.firstName||'') + ' ' + (c.lastName||''),
            guardianName: c.guardianName,
          };
        });
      }
    }
    if (!pendingSubs.length) {
      document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif;padding:20px"><div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;text-align:center;max-width:400px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><h3 style="margin:16px 0 8px;color:#141413">All Completed!</h3><p style="color:#87867f;font-size:14px;line-height:1.5">All forms have already been completed. Thank you! You may close this page.</p></div></div>';
      return;
    }

    renderIntakePortal(c, pendingSubs, token);
  }

  _tryLoad(15);
}

function renderIntakePortal(client, pendingSubs, token) {
  document.getElementById('root').innerHTML = _icPortalLayout(client, pendingSubs, token);
  document.getElementById('intake-portal-forms').innerHTML = pendingSubs.map(function(sub, si){
    return _icPortalFormCard(client, sub, si, token);
  }).join('');
  pendingSubs.forEach(function(_, si){
    setTimeout(function(){ _icPortalInitCanvas(si); }, 100);
  });
  // Mark as Viewed
  setDB(function(db){
    pendingSubs.forEach(function(s){
      var sub = (db.intakeSubmissions || []).find(function(x){ return x.id === s.id; });
      if (sub && sub.status === 'Sent') sub.status = 'Viewed';
    });
    var cl = (db.intakeClients || []).find(function(c){ return c.id === client.id; });
    if (cl && (cl.status === 'Pending Forms' || cl.status === 'Forms Sent')) cl.status = 'Viewed';
  });
}

function _icPortalLayout(client, pendingSubs, token) {
  var childName = (client.firstName||'') + ' ' + (client.lastName||'');
  var logoHtml = '<svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#c96442"/><path d="M50 15 L80 28 L80 55 C80 72 65 84 50 90 C35 84 20 72 20 55 L20 28 Z" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/><line x1="50" y1="38" x2="50" y2="68" stroke="white" stroke-width="6" stroke-linecap="round"/><line x1="35" y1="53" x2="65" y2="53" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';
  var css = '#intake-portal-forms .pf-toggle{cursor:pointer;user-select:none}#intake-portal-forms .pf-toggle:hover{opacity:.8}#intake-portal-forms .pf-content{display:none;font-size:13px;color:#4d4c48;line-height:1.7;padding:0}#intake-portal-forms .pf-content.open{display:block}#intake-portal-forms .pf-canvas-wrap{display:none}#intake-portal-forms .pf-canvas-wrap.open{display:block}#intake-portal-forms .pf-upload-wrap{display:none}#intake-portal-forms .pf-upload-wrap.open{display:block}#intake-portal-forms .sig-tab{background:#f0efe8;border:1px solid #e8e6dc;color:#4d4c48;padding:8px 14px;font-size:12px;cursor:pointer;border-radius:6px 6px 0 0;margin-right:2px;font-weight:600;transition:all .15s}#intake-portal-forms .sig-tab.active{background:#fff;border-bottom-color:#fff;color:#141413}#intake-portal-forms .sig-panel{display:none}#intake-portal-forms .sig-panel.active{display:block}#intake-portal-forms .portal-canvas{border:1.5px solid #e8e6dc;border-radius:8px;width:100%;height:120px;touch-action:none;cursor:crosshair}@keyframes spinner{to{transform:rotate(360deg)}}';
  return [
    '<style>' + css + '</style>',
    '<div style="min-height:100vh;background:#f5f4ed;padding:20px;font-family:Arial,sans-serif">',
    '<div style="max-width:640px;margin:0 auto">',
    '<div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.12);overflow:hidden;margin-bottom:16px">',
    '<div style="background:#141413;padding:24px 28px;display:flex;align-items:center;gap:12px">',
    logoHtml,
    '<div><div style="color:white;font-weight:700;font-size:18px">ClaimDataCare</div><div style="color:#87867f;font-size:11px;margin-top:2px">Secure Intake Portal</div></div>',
    '</div>',
    '<div style="padding:28px">',
    '<h2 style="margin:0 0 6px;font-size:20px;color:#141413">Welcome, ' + (client.guardianName||'Guardian') + '</h2>',
    '<p style="margin:0 0 4px;color:#87867f;font-size:14px">Please complete the intake forms for <strong>' + childName + '</strong></p>',
    '<p style="margin:0 0 20px;color:#87867f;font-size:12px">' + pendingSubs.length + ' form(s) need your review and signature</p>',
    '<div id="intake-portal-forms"></div>',
    '<div id="portal-thanks" style="display:none;text-align:center;padding:30px 20px">',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    '<h3 style="margin:16px 0 6px;color:#141413;font-size:20px">Thank You!</h3>',
    '<p style="color:#87867f;font-size:14px;line-height:1.5">All forms have been submitted successfully. Your responses have been securely saved. You may close this page.</p>',
    '</div>',
    '</div></div></div></div>'
  ].join('');
}

function _icPortalFormContent(form, client) {
  if (!form || !form.content) return '';
  var html = form.content
    .replace(/\{\{childName\}\}/g, (client.firstName||'') + ' ' + (client.lastName||''))
    .replace(/\{\{guardianName\}\}/g, client.guardianName||'')
    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{signature\}\}/g, '_________________________');
  return html;
}

function _icPortalFormCard(client, sub, si, token) {
  var db = getDB();
  var form = (db.intakeForms || []).find(function(f){ return f.id === sub.formId; }) || (db.intakeForms || [])[sub.formIdx] || {};
  var childName = (client.firstName||'') + ' ' + (client.lastName||'');
  var formContent = _icPortalFormContent(form, client);

  var formHtml = '<div style="margin-bottom:12px;border:1.5px solid #e8e6dc;border-radius:12px;overflow:hidden;background:#fff">';
  formHtml += '<div style="padding:14px 18px;background:#faf9f5;border-bottom:1px solid #e8e6dc;display:flex;justify-content:space-between;align-items:center">';
  formHtml += '<span style="font-weight:700;font-size:14px;color:#141413">' + (form.name||'Form') + ' <span style="font-size:11px;color:#87867f;font-weight:400;background:#e8e6dc;padding:2px 10px;border-radius:20px;margin-left:6px">' + (form.type||'') + '</span></span>';
  formHtml += '<span id="pf-badge-' + si + '" style="font-size:11px;background:#e8e6dc;padding:2px 10px;border-radius:20px;color:#87867f">Pending</span>';
  formHtml += '</div>';
  formHtml += '<div style="padding:14px 18px">';

  // Form content — collapsible
  if (formContent) {
    formHtml += '<div class="pf-toggle" onclick="var e=document.getElementById(\'pf-content-' + si + '\');e.classList.toggle(\'open\');this.textContent=e.classList.contains(\'open\')?\'\u25B2 Click to hide form\':\'\u25BC Click to read form\';" style="font-size:12px;font-weight:600;color:#c96442;margin-bottom:8px;cursor:pointer">&#x25BC; Click to read form</div>';
    formHtml += '<div id="pf-content-' + si + '" class="pf-content" style="font-size:13px;color:#4d4c48;line-height:1.7;padding:12px;background:#faf9f5;border-radius:8px;margin-bottom:14px;display:none;border:1px solid #e8e6dc">' + formContent + '</div>';
  }

  // Info box
  formHtml += '<div style="background:#f5f4ed;border-radius:8px;padding:12px;font-size:12px;color:#4d4c48;line-height:1.6;margin-bottom:14px">' +
    '<strong>Child:</strong> ' + childName + '<br>' +
    '<strong>Guardian:</strong> ' + (client.guardianName||'') + '<br>' +
    '<strong>Date:</strong> ' + new Date().toLocaleDateString() +
    '</div>';

  // Signature section
  formHtml += '<div style="border-top:1px solid #e8e6dc;padding-top:14px">';
  formHtml += '<p style="font-size:12px;color:#87867f;margin:0 0 12px;font-weight:600">Your Signature</p>';

  // Signature tabs
  formHtml += '<div style="display:flex;flex-wrap:wrap;margin-bottom:0">';
  formHtml += '<button class="sig-tab active" id="pf-stab-draw-' + si + '" onclick="_icPortalSigTab(' + si + ',\'draw\')">Draw</button>';
  formHtml += '<button class="sig-tab" id="pf-stab-type-' + si + '" onclick="_icPortalSigTab(' + si + ',\'type\')">Type</button>';
  formHtml += '<button class="sig-tab" id="pf-stab-upload-' + si + '" onclick="_icPortalSigTab(' + si + ',\'upload\')">Upload</button>';
  formHtml += '</div>';

  // Draw panel
  formHtml += '<div id="pf-sig-panel-draw-' + si + '" class="sig-panel active" style="border:1px solid #e8e6dc;border-top:none;border-radius:0 0 8px 8px;padding:12px;background:#fff">';
  formHtml += '<canvas id="portal-canvas-' + si + '" class="portal-canvas" width="540" height="140" style="border:1px solid #e8e6dc;border-radius:6px;width:100%;height:120px;touch-action:none;cursor:crosshair;background:#fff"></canvas>';
  formHtml += '<button style="margin-top:6px;font-size:11px;color:#87867f;background:none;border:none;cursor:pointer;text-decoration:underline" onclick="_icPortalClearDraw(' + si + ')">Clear drawing</button>';
  formHtml += '</div>';

  // Type panel
  formHtml += '<div id="pf-sig-panel-type-' + si + '" class="sig-panel" style="border:1px solid #e8e6dc;border-top:none;border-radius:0 0 8px 8px;padding:12px;background:#fff">';
  formHtml += '<input id="portal-sig-type-' + si + '" type="text" placeholder="Type your full legal name" style="width:100%;padding:10px 12px;border:1.5px solid #e8e6dc;border-radius:6px;font-size:18px;font-family:\'Brush Script MT\',cursive;box-sizing:border-box;text-transform:none" oninput="document.getElementById(\'portal-sig-preview-' + si + '\').textContent=this.value">';
  formHtml += '<div id="portal-sig-preview-' + si + '" style="margin-top:8px;font-size:22px;font-family:\'Brush Script MT\',cursive;color:#4d4c48;min-height:30px;padding:4px 8px;border-bottom:1px solid #e8e6dc"></div>';
  formHtml += '</div>';

  // Upload panel
  formHtml += '<div id="pf-sig-panel-upload-' + si + '" class="sig-panel" style="border:1px solid #e8e6dc;border-top:none;border-radius:0 0 8px 8px;padding:12px;background:#fff">';
  formHtml += '<p style="font-size:12px;color:#87867f;margin:0 0 8px">Upload an image of your signature (PNG or JPEG)</p>';
  formHtml += '<input id="portal-sig-upload-' + si + '" type="file" accept="image/*" style="font-size:12px" onchange="_icPortalLoadUpload(' + si + ',this)">';
  formHtml += '<div id="portal-sig-upload-preview-' + si + '" style="margin-top:8px;display:none"><img style="max-height:60px;border:1px solid #e8e6dc;border-radius:4px"></div>';
  formHtml += '</div>';

  // Hidden result
  formHtml += '<input type="hidden" id="portal-sig-result-' + si + '" value="">';
  formHtml += '<input type="hidden" id="portal-sig-type-result-' + si + '" value="">';

  // Sign button
  formHtml += '<div style="display:flex;gap:8px;margin-top:12px">';
  formHtml += '<button class="btn btn-primary" style="flex:1;padding:10px;font-size:14px" onclick="icPortalSign(' + si + ',\'' + sub.id + '\',\'' + token + '\',\'' + (client.guardianName||'').replace(/'/g,"\\'") + '\')">Sign & Complete</button>';
  formHtml += '</div>';
  formHtml += '<div id="portal-sig-status-' + si + '" style="margin-top:8px;font-size:12px"></div>';
  formHtml += '</div></div></div>';

  return formHtml;
}

function _icPortalSigTab(si, mode) {
  ['draw','type','upload'].forEach(function(m){
    var tab = document.getElementById('pf-stab-' + m + '-' + si);
    var panel = document.getElementById('pf-sig-panel-' + m + '-' + si);
    if (tab) tab.className = 'sig-tab' + (m === mode ? ' active' : '');
    if (panel) panel.className = 'sig-panel' + (m === mode ? ' active' : '');
  });
}

function _icPortalClearDraw(si) {
  var canvas = document.getElementById('portal-canvas-' + si);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function _icPortalLoadUpload(si, input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var preview = document.getElementById('portal-sig-upload-preview-' + si);
    if (preview) {
      preview.style.display = '';
      preview.innerHTML = '<img src="' + e.target.result + '" style="max-height:60px;border:1px solid #e8e6dc;border-radius:4px">';
    }
  };
  reader.readAsDataURL(input.files[0]);
}

function _icPortalInitCanvas(si) {
  var canvas = document.getElementById('portal-canvas-' + si);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#141413';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  var drawing = false;
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  }

  canvas.onmousedown = function(e) { drawing = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  canvas.onmousemove = function(e) { if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  canvas.onmouseup = function() { drawing = false; ctx.closePath(); };
  canvas.onmouseleave = function() { drawing = false; };

  canvas.ontouchstart = function(e) { e.preventDefault(); drawing = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  canvas.ontouchmove = function(e) { e.preventDefault(); if (!drawing || !e.touches.length) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  canvas.ontouchend = function(e) { e.preventDefault(); drawing = false; };
}

function _icPortalGetSigData(si) {
  // Draw mode
  var drawPanel = document.getElementById('pf-sig-panel-draw-' + si);
  if (drawPanel && drawPanel.className.indexOf('active') >= 0) {
    var canvas = document.getElementById('portal-canvas-' + si);
    if (!canvas) return null;
    // Check if anything was drawn
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var hasContent = false;
    for (var i = 3; i < imgData.length; i += 4) { if (imgData[i] > 0) { hasContent = true; break; } }
    if (!hasContent) return null;
    return { data: canvas.toDataURL('image/png'), type: 'draw' };
  }

  // Type mode
  var typeInput = document.getElementById('portal-sig-type-' + si);
  if (typeInput && typeInput.value && typeInput.value.trim()) {
    return { data: typeInput.value.trim(), type: 'typed' };
  }

  // Upload mode
  var uploadInput = document.getElementById('portal-sig-upload-' + si);
  var uploadPreview = document.getElementById('portal-sig-upload-preview-' + si);
  if (uploadInput && uploadInput.files && uploadInput.files[0]) {
    return null; // Will be handled in sign function
  }

  return null;
}

function icPortalSign(si, submissionId, token, signerName) {
  var db = getDB();
  var sub = (db.intakeSubmissions || []).find(function(s){ return s.id === submissionId; });
  if (!sub) { alert('Submission not found.'); return; }

  var sigData = null;
  var sigType = '';

  // Draw mode
  var drawPanel = document.getElementById('pf-sig-panel-draw-' + si);
  if (drawPanel && drawPanel.className.indexOf('active') >= 0) {
    var canvas = document.getElementById('portal-canvas-' + si);
    if (canvas) {
      var ctx = canvas.getContext('2d');
      var px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i = 3; i < px.length; i += 4) { if (px[i] > 0) { sigData = canvas.toDataURL('image/png'); sigType = 'draw'; break; } }
    }
    if (!sigData) { toast('Please draw your signature on the canvas','warn'); return; }
  }

  // Type mode
  if (!sigData) {
    var typePanel = document.getElementById('pf-sig-panel-type-' + si);
    if (typePanel && typePanel.className.indexOf('active') >= 0) {
      var typeInput = document.getElementById('portal-sig-type-' + si);
      if (typeInput && typeInput.value && typeInput.value.trim()) {
        sigData = typeInput.value.trim();
        sigType = 'typed';
      } else {
        toast('Please type your full name to sign','warn'); return;
      }
    }
  }

  // Upload mode
  if (!sigData) {
    var uploadPanel = document.getElementById('pf-sig-panel-upload-' + si);
    if (uploadPanel && uploadPanel.className.indexOf('active') >= 0) {
      var uploadInput = document.getElementById('portal-sig-upload-' + si);
      if (uploadInput && uploadInput.files && uploadInput.files[0]) {
        sigData = URL.createObjectURL(uploadInput.files[0]);
        sigType = 'upload';
      } else {
        toast('Please upload a signature image','warn'); return;
      }
    }
  }

  // Build audit metadata
  var audit = {
    signedAt: Date.now(),
    signerName: signerName || sigData,
    signerIp: '',
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    language: navigator.language || '',
  };
  try {
    var rtc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    rtc.createDataChannel('');
    rtc.createOffer().then(function(offer){ rtc.setLocalDescription(offer); });
    rtc.onicecandidate = function(e) { if (e.candidate) { audit.signerIp = e.candidate.address || e.candidate.ip || ''; } };
  } catch(e) {}

  // Update submission in DB
  setDB(function(db){
    var s = (db.intakeSubmissions || []).find(function(x){ return x.id === submissionId; });
    if (s) {
      s.status = 'Signed';
      s.signedAt = audit.signedAt;
      s.signedByName = signerName || sigData;
      s.signerIp = audit.signerIp;
      s.userAgent = audit.userAgent;
      s.platform = audit.platform;
      s.language = audit.language;
      s.signatureData = sigData;
      s.signatureType = sigType;
    }
  });

  // Update UI
  var badge = document.getElementById('pf-badge-' + si);
  if (badge) { badge.textContent = 'Signed'; badge.style.background = '#c8e6c9'; badge.style.color = '#2e7d32'; }
  document.getElementById('portal-sig-status-' + si).innerHTML = '<span style="color:#2e7d32;font-weight:600">&#10003; Signed on ' + new Date().toLocaleString() + '</span>';

  // Disable all signature inputs for this form
  var drawTab = document.getElementById('pf-stab-draw-' + si);
  var typeTab = document.getElementById('pf-stab-type-' + si);
  var uploadTab = document.getElementById('pf-stab-upload-' + si);
  [drawTab, typeTab, uploadTab].forEach(function(el){ if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '.5'; }});
  var signBtn = document.querySelector('#pf-sig-panel-draw-' + si + ' button, #pf-sig-panel-type-' + si + ' button, #pf-sig-panel-upload-' + si + ' button');
  if (signBtn) signBtn.style.display = 'none';

  toast('Form signed successfully','ok');

  // Generate signed PDF and save to records
  _icFinalizeSignedForm(submissionId);

  // Check if all forms done
  var allDone = true;
  document.querySelectorAll('[id^="pf-badge-"]').forEach(function(el){
    if (el.textContent !== 'Signed') allDone = false;
  });
  if (allDone) {
    setTimeout(function(){
      document.getElementById('intake-portal-forms').style.display = 'none';
      document.getElementById('portal-thanks').style.display = '';
      // Update client status to Completed
      setDB(function(db){
        var cl = (db.intakeClients || []).find(function(c){ return c.id === sub.clientId; });
        if (cl) { cl.status = 'Completed'; cl.updatedAt = Date.now(); }
      });
    }, 1200);
  }
}

function _icFinalizeSignedForm(submissionId) {
  try {
    var db = getDB();
    var sub = (db.intakeSubmissions || []).find(function(s){ return s.id === submissionId; });
    if (!sub || !sub.signatureData) return;

    var client = (db.intakeClients || []).find(function(c){ return c.id === sub.clientId; });
    var form = (db.intakeForms || []).find(function(f){ return f.id === sub.formId; }) || (db.intakeForms || [])[sub.formIdx];
    var prov = (db.providers || []).find(function(p){ return p.id === activeProviderId; }) || {};

    // Generate signed PDF
    var pdfData = _icBuildSignedPDF(sub, client, form, prov);

    // Save to patient records if we can find a matching patient
    if (client && pdfData) {
      var patient = (db.patients || []).find(function(p){
        return (p.lastName||'').toLowerCase() === (client.lastName||'').toLowerCase() &&
               (p.firstName||'').toLowerCase() === (client.firstName||'').toLowerCase();
      });
      if (patient) {
        if (!patient.documents) patient.documents = [];
        patient.documents.unshift({
          id: sub.id,
          name: (form ? form.name : 'Signed Form') + ' — ' + (client.firstName||'') + ' ' + (client.lastName||''),
          category: 'Intake Forms',
          type: 'pdf',
          data: pdfData,
          date: new Date().toISOString().slice(0,10),
          uploadedBy: 'Intake Portal',
          signedAt: sub.signedAt,
          signedByName: sub.signedByName,
          formName: form ? form.name : '',
          createdAt: Date.now(),
        });
        setDB(function(db2){
          var p = db2.patients.find(function(x){ return x.id === patient.id; });
          if (p) p.documents = patient.documents;
        });
      }
    }
  } catch(e) { console.warn('Finalize signed form error:', e); }
}

function _icBuildSignedPDF(sub, client, form, prov) {
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) return null;
  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  var W = 210, M = 16, RX = W - M;
  var ACCENT = [201, 100, 66], DARK = [50, 48, 44], MID = [130, 128, 124], LIGHT = [248, 247, 244], BORDER = [235, 234, 230];

  // Branding header
  doc.setFillColor(...ACCENT); doc.rect(0, 0, 3, 297, 'F');

  // Provider logo
  var logoY = M;
  if (prov && prov.logo) {
    try {
      var _ld = typeof _fitLogo === 'function' ? _fitLogo(prov.logo, 20) : { w: 20, h: 20 };
      doc.addImage(prov.logo, typeof _imgFmt === 'function' ? _imgFmt(prov.logo) : 'PNG', M+2, logoY, _ld.w, _ld.h);
      logoY += _ld.h + 4;
    } catch(e) { logoY += 4; }
  }

  // Title
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...DARK);
  doc.text(form ? form.name : 'Signed Document', RX, M+10, { align:'right' });
  if (form && form.type) {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...MID);
    doc.text(form.type, RX, M+16, { align:'right' });
  }

  // Signed info bar
  var infoY = Math.max(logoY + 6, M + 22);
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.line(M+2, infoY, RX, infoY);
  infoY += 6;

  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text('Signed by: ' + (sub.signedByName||''), M+2, infoY);
  doc.text('Date: ' + (sub.signedAt ? new Date(sub.signedAt).toLocaleString() : ''), RX, infoY, { align:'right' });
  infoY += 4;
  doc.text('Client: ' + (client ? (client.firstName||'') + ' ' + (client.lastName||'') : ''), M+2, infoY);
  doc.text('Guardian: ' + (client ? (client.guardianName||'') : ''), RX, infoY, { align:'right' });
  infoY += 4;
  if (sub.signerIp) doc.text('IP: ' + sub.signerIp, M+2, infoY);
  doc.text('ID: ' + sub.id.slice(0,8) + '...', RX, infoY, { align:'right' });
  infoY += 3;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.line(M+2, infoY, RX, infoY);
  infoY += 6;

  // Form content
  if (form && form.content) {
    var contentHtml = form.content
      .replace(/\{\{childName\}\}/g, (client ? (client.firstName||'') + ' ' + (client.lastName||'') : ''))
      .replace(/\{\{guardianName\}\}/g, client ? (client.guardianName||'') : '')
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{signature\}\}/g, '_________________________');

    // Strip HTML tags for PDF text rendering
    var plainText = contentHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    var lines = doc.splitTextToSize(plainText, CW - 6);

    var textY = infoY;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    for (var li = 0; li < lines.length; li++) {
      if (textY > 268) {
        doc.addPage();
        doc.setFillColor(...ACCENT); doc.rect(0, 0, 3, 297, 'F');
        textY = M;
      }
      doc.text(lines[li], M+5, textY);
      textY += 4.5;
    }
    infoY = textY + 8;
  }

  // Signature block
  if (infoY > 260) { doc.addPage(); doc.setFillColor(...ACCENT); doc.rect(0, 0, 3, 297, 'F'); infoY = M; }
  doc.setDrawColor(...DARK); doc.setLineWidth(0.5);
  doc.line(M+2, infoY, M+70, infoY);
  infoY += 4;

  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Signature', M+2, infoY);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text('Signed electronically by ' + (sub.signedByName||''), M+2, infoY+4);

  // Embed signature image if it's a draw/upload
  if (sub.signatureType === 'draw' || sub.signatureType === 'upload') {
    infoY += 8;
    try {
      if (sub.signatureData && sub.signatureData.length > 100) {
        var sigFmt = sub.signatureData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(sub.signatureData, sigFmt, M+2, infoY-4, 50, 14);
        infoY += 16;
      }
    } catch(e) {}
  }

  // Footer
  if (infoY > 280) infoY = 280;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.line(M+2, 280, RX, 280, BORDER, 0.3);
  doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor([190,188,184]);
  doc.text('Powered by ClaimDataCare', RX, 290, { align:'right' });
  doc.text('Document ID: ' + sub.id, M+2, 290);

  return doc.output('datauristring');
}

// ── Demographic Intake Portal ──
function checkDemographicToken() {
  var search = window.location.search;
  if (!search.startsWith('?demographics=')) return;
  var token = search.slice(14);
  var raw = '';
  try { raw = atob(token.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) { return; }
  var parts = raw.split('|');
  if (parts.length < 3) return;
  var intakeClientId = parts[0];
  var intakeEmail = parts[1];
  var ts = parseInt(parts[2]);
  if (Date.now() - ts > 72 * 60 * 60 * 1000) {
    document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif;padding:20px"><div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;text-align:center;max-width:400px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><h3 style="margin:16px 0 8px;color:#141413">Link Expired</h3><p style="color:#87867f;font-size:14px;line-height:1.5">This demographic intake link has expired (72 hours). Please contact the provider for a new link.</p></div></div>';
    return;
  }
  function _tryLoad(tries) {
    var db = getDB();
    var c = (db.intakeClients || []).find(function(cl){ return cl.id === intakeClientId; });
    if (!c) {
      var _idx = parseInt(intakeClientId);
      if (!isNaN(_idx)) c = (db.intakeClients || [])[_idx];
    }
    if (!c) {
      if (tries > 0) {
        document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif"><div style="text-align:center;color:#87867f;font-size:14px"><div style="width:40px;height:40px;border:3px solid #e8e6dc;border-top-color:#c96442;border-radius:50%;animation:spinner .8s linear infinite;margin:0 auto 16px"></div>Loading your demographic intake form...</div></div>';
        setTimeout(function(){ _tryLoad(tries - 1); }, 800);
      } else {
        // Retries exhausted — try embedded client data from URL (standalone portal)
        var _idata = _icExtractIData();
        if (_idata) {
          var db2 = getDB();
          if (!db2.intakeClients) db2.intakeClients = [];
          _idata.id = intakeClientId;
          db2.intakeClients.push(_idata);
          _tryLoad(15);
        } else {
          _icTryFirestoreLoad(intakeClientId, function(found) {
            if (found) { _tryLoad(15); }
            else {
              document.getElementById('root').innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif;padding:20px"><div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;text-align:center;max-width:400px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><h3 style="margin:16px 0 8px;color:#141413">Unable to Load</h3><p style="color:#87867f;font-size:14px;line-height:1.5">We could not find your intake record. Please contact the provider and request a new link.</p></div></div>';
            }
          });
        }
      }
      return;
    }
    // Mark as Viewed
    setDB(function(db){
      var cl = (db.intakeClients || []).find(function(x){ return x.id === c.id; });
      if (cl && (cl.status === 'Pending Forms' || cl.status === 'Forms Sent')) cl.status = 'Viewed';
    });
    renderDemographicPortal(c, token);
  }
  _tryLoad(15);
}

function renderDemographicPortal(client, token) {
  var childName = (client.firstName||'') + ' ' + (client.lastName||'');
  var logoHtml = '<svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#c96442"/><path d="M50 15 L80 28 L80 55 C80 72 65 84 50 90 C35 84 20 72 20 55 L20 28 Z" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/><line x1="50" y1="38" x2="50" y2="68" stroke="white" stroke-width="6" stroke-linecap="round"/><line x1="35" y1="53" x2="65" y2="53" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';

  var html = [
    '<div style="min-height:100vh;background:#f5f4ed;padding:20px;font-family:Arial,sans-serif">',
    '<div style="max-width:640px;margin:0 auto">',
    '<div style="background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.12);overflow:hidden;margin-bottom:16px">',
    '<div style="background:#141413;padding:24px 28px;display:flex;align-items:center;gap:12px">',
    logoHtml,
    '<div><div style="color:white;font-weight:700;font-size:18px">ClaimDataCare</div><div style="color:#87867f;font-size:11px;margin-top:2px">Demographic Intake Form</div></div>',
    '</div>',
    '<div style="padding:28px">',
    '<h2 style="margin:0 0 6px;font-size:20px;color:#141413">Demographic Information</h2>',
    '<p style="margin:0 0 20px;color:#87867f;font-size:13px">Please complete the demographic information for <strong>' + childName + '</strong>. Fields marked with * are required.</p>',
    '<form onsubmit="icSubmitDemographic(\'' + client.id + '\',\'' + token.replace(/'/g,"\\'") + '\');return false">',

    // Child information
    '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:#141413;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8e6dc;text-transform:uppercase;letter-spacing:.04em">Child Information</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">First Name *</label><input id="demo-first" value="' + (client.firstName||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Last Name *</label><input id="demo-last" value="' + (client.lastName||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Date of Birth *</label><input id="demo-dob" type="date" value="' + (client.dob||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Gender</label><select id="demo-gender" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box;background:#fff"><option value="">Select</option><option' + (client.gender==='Male'?' selected':'') + '>Male</option><option' + (client.gender==='Female'?' selected':'') + '>Female</option><option' + (client.gender==='Other'?' selected':'') + '>Other</option></select></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Preferred Language</label><input id="demo-language" value="' + (client.language||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div></div>',

    // Guardian information
    '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:#141413;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8e6dc;text-transform:uppercase;letter-spacing:.04em">Parent / Guardian Information</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Full Name *</label><input id="demo-gname" value="' + (client.guardianName||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Relationship *</label><select id="demo-grel" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box;background:#fff"><option value="">Select</option><option' + (client.guardianRel==='Mother'?' selected':'') + '>Mother</option><option' + (client.guardianRel==='Father'?' selected':'') + '>Father</option><option' + (client.guardianRel==='Legal Guardian'?' selected':'') + '>Legal Guardian</option><option' + (client.guardianRel==='Grandparent'?' selected':'') + '>Grandparent</option><option' + (client.guardianRel==='Other'?' selected':'') + '>Other</option></select></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Phone *</label><input id="demo-gphone" value="' + (client.guardianPhone||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Alternate Phone</label><input id="demo-gphone2" value="' + (client.guardianPhone2||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Email *</label><input id="demo-gemail" type="email" value="' + (client.guardianEmail||'') + '" required style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Address</label><input id="demo-addr" value="' + (client.address||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">City, State ZIP</label><input id="demo-city" value="' + (client.city||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div></div>',

    // Emergency contact
    '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:#141413;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8e6dc;text-transform:uppercase;letter-spacing:.04em">Emergency Contact</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Name</label><input id="demo-emerg-name" value="' + (client.emergName||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Phone</label><input id="demo-emerg-phone" value="' + (client.emergPhone||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Relationship</label><input id="demo-emerg-rel" value="' + (client.emergRel||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div></div>',

    // Insurance & Referral
    '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;color:#141413;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8e6dc;text-transform:uppercase;letter-spacing:.04em">Insurance &amp; Referral</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Insurance Provider</label><input id="demo-ins-provider" value="' + (client.insuranceProvider||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Member ID</label><input id="demo-ins-id" value="' + (client.insuranceId||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Group Number</label><input id="demo-ins-group" value="' + (client.insuranceGroup||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Referral Source</label><input id="demo-ref-source" value="' + (client.referralSource||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">PCP Name &amp; Phone</label><input id="demo-pcp" value="' + (client.pcp||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">School / District</label><input id="demo-school" value="' + (client.school||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Grade</label><input id="demo-grade" value="' + (client.grade||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Existing ABA Provider</label><input id="demo-aba" value="' + (client.abaProvider||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Existing Diagnoses</label><input id="demo-dx" value="' + (client.diagnoses||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '<div><label style="font-size:11px;font-weight:600;color:#4d4c48;display:block;margin-bottom:3px">Custody/Legal Notes</label><input id="demo-custody" value="' + (client.custody||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid #e8e6dc;border-radius:8px;font-size:13px;box-sizing:border-box"></div>',
    '</div></div>',

    // Submit
    '<div style="display:flex;gap:10px;margin-top:20px">',
    '<button type="submit" id="demo-submit-btn" style="flex:1;padding:12px 20px;background:var(--brand,#c96442);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">Submit Demographic Information</button>',
    '</div>',
    '<div id="demo-status" style="margin-top:10px;font-size:12px;color:#87867f;text-align:center"></div>',
    '</form>',
    '<div id="demo-thanks" style="display:none;text-align:center;padding:30px 20px">',
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    '<h3 style="margin:16px 0 6px;color:#141413;font-size:20px">Thank You!</h3>',
    '<p style="color:#87867f;font-size:14px;line-height:1.5">Your demographic information has been submitted successfully. You may close this page.</p>',
    '</div>',
    '</div></div></div></div>'
  ].join('');
  document.getElementById('root').innerHTML = html;
}

function icSubmitDemographic(clientId, token) {
  var btn = document.getElementById('demo-submit-btn');
  var statusEl = document.getElementById('demo-status');
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Submitting...';
  statusEl.innerHTML = '<span style="color:#87867f">Please wait while we process your submission...</span>';

  var data = {
    firstName: document.getElementById('demo-first')?.value?.trim() || '',
    lastName: document.getElementById('demo-last')?.value?.trim() || '',
    dob: document.getElementById('demo-dob')?.value || '',
    gender: document.getElementById('demo-gender')?.value || '',
    language: document.getElementById('demo-language')?.value?.trim() || '',
    guardianName: document.getElementById('demo-gname')?.value?.trim() || '',
    guardianRel: document.getElementById('demo-grel')?.value || '',
    guardianPhone: document.getElementById('demo-gphone')?.value?.trim() || '',
    guardianPhone2: document.getElementById('demo-gphone2')?.value?.trim() || '',
    guardianEmail: document.getElementById('demo-gemail')?.value?.trim() || '',
    address: document.getElementById('demo-addr')?.value?.trim() || '',
    city: document.getElementById('demo-city')?.value?.trim() || '',
    emergName: document.getElementById('demo-emerg-name')?.value?.trim() || '',
    emergPhone: document.getElementById('demo-emerg-phone')?.value?.trim() || '',
    emergRel: document.getElementById('demo-emerg-rel')?.value?.trim() || '',
    insuranceProvider: document.getElementById('demo-ins-provider')?.value?.trim() || '',
    insuranceId: document.getElementById('demo-ins-id')?.value?.trim() || '',
    insuranceGroup: document.getElementById('demo-ins-group')?.value?.trim() || '',
    referralSource: document.getElementById('demo-ref-source')?.value?.trim() || '',
    pcp: document.getElementById('demo-pcp')?.value?.trim() || '',
    school: document.getElementById('demo-school')?.value?.trim() || '',
    grade: document.getElementById('demo-grade')?.value?.trim() || '',
    abaProvider: document.getElementById('demo-aba')?.value?.trim() || '',
    diagnoses: document.getElementById('demo-dx')?.value?.trim() || '',
    custody: document.getElementById('demo-custody')?.value?.trim() || '',
  };

  setDB(function(db){
    // Update intake client record
    var client = (db.intakeClients || []).find(function(c){ return c.id === clientId; });
    if (client) {
      Object.assign(client, data);
      client.status = 'Completed';
      client.updatedAt = Date.now();
    }

    // Auto-populate patient record
    var patient = (db.patients || []).find(function(p){
      return (p.lastName||'').toLowerCase() === data.lastName.toLowerCase() &&
             (p.firstName||'').toLowerCase() === data.firstName.toLowerCase();
    });
    if (!patient) {
      // Create new patient record
      var newPat = {
        id: uid(),
        firstName: data.firstName,
        lastName: data.lastName,
        dob: data.dob,
        gender: data.gender,
        guardianName: data.guardianName,
        guardianRel: data.guardianRel,
        guardianPhone: data.guardianPhone,
        guardianPhone2: data.guardianPhone2,
        guardianEmail: data.guardianEmail,
        address: data.address,
        city: data.city,
        emergName: data.emergName,
        emergPhone: data.emergPhone,
        emergRel: data.emergRel,
        insuranceProvider: data.insuranceProvider,
        insuranceId: data.insuranceId,
        insuranceGroup: data.insuranceGroup,
        referralSource: data.referralSource,
        pcp: data.pcp,
        school: data.school,
        grade: data.grade,
        abaProvider: data.abaProvider,
        diagnoses: data.diagnoses,
        language: data.language,
        custody: data.custody,
        createdBy: 'Demographic Intake Portal',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (!db.patients) db.patients = [];
      db.patients.push(newPat);
      patient = newPat;
    } else {
      // Update existing patient
      Object.assign(patient, data);
      patient.updatedAt = Date.now();
    }

    // Save submission record
    if (!db.intakeSubmissions) db.intakeSubmissions = [];
    db.intakeSubmissions.push({
      id: uid(), clientId: clientId, token: token,
      submittedAt: Date.now(), type: 'demographic',
      status: 'Completed', childName: data.firstName + ' ' + data.lastName,
      guardianName: data.guardianName, data: data,
    });
  });

  // Show thank you
  document.getElementById('demo-thanks').style.display = '';
  document.querySelector('form').style.display = 'none';
  statusEl.innerHTML = '<span style="color:#2e7d32;font-weight:600">&#10003; Submitted successfully!</span>';
  _icAuditLog('intake-demo-completed', 'Demographic completed for ' + data.firstName + ' ' + data.lastName);
}

// ── Init on load ──
// Only run intake token check when there is actually a token in the URL.
// This prevents any risk of wiping #root on a normal admin login.
(function() {
  var _qs = window.location.search;
  if (!_qs.startsWith('?intake=') && !_qs.startsWith('?demographics=')) return;

  // Show loading spinner immediately so page is never blank
  var rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4ed;font-family:Arial,sans-serif"><div style="text-align:center;color:#87867f;font-size:14px"><div style="width:40px;height:40px;border:3px solid #e8e6dc;border-top-color:#c96442;border-radius:50%;animation:spinner .8s linear infinite;margin:0 auto 16px"></div><p>Loading your secure intake forms…</p></div></div><style>@keyframes spinner{to{transform:rotate(360deg)}}</style>';
  }

  // Wait for Firebase + DB to be ready, then run token check
  var _attempts = 0;
  function _waitAndCheck() {
    _attempts++;
    var ready = (typeof getDB === 'function' && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0);
    if (ready || _attempts > 40) {
      try { checkIntakeToken(); } catch(e) { console.error('checkIntakeToken error:', e); }
    } else {
      setTimeout(_waitAndCheck, 250);
    }
  }
  setTimeout(_waitAndCheck, 400);
})();

