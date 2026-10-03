// ===================================================================
// CLINICAL INTAKE MANAGEMENT MODULE • Super Admin Only
// ===================================================================
var _icFormFilter = 'all';

function _icRequireSA() {
  var _s = getSession();
  if (!_s || !(_s.role === 'Super Admin' || _cdcIsOwnerEmail(_s.email))) { go('dashboard'); toast('Access denied. Super Admin only.','err'); return false; }
  return true;
}

function _icAuditLog(action, details) { auditLog('INTAKE_' + String(action||'').toUpperCase(), details); }

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
        var created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '•';
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
          '<td style="font-weight:600">' + escapeHtml(c.lastName||'') + ', ' + escapeHtml(c.firstName||'') + '</td>' +
          '<td style="font-size:12px">' + escapeHtml(c.dob||'') + '</td>' +
          '<td>' + escapeHtml(c.guardianName||'') + '</td>' +
          '<td style="font-size:12px">' + escapeHtml(c.guardianPhone||'') + '</td>' +
          '<td style="font-size:12px">' + escapeHtml(c.guardianEmail||'') + '</td>' +
          '<td style="font-size:12px">' + escapeHtml(c.referralSource||'•') + '</td>' +
          '<td>' + _icStatusBadge(c.status||'Pending Forms') + '</td>' +
          '<td style="white-space:nowrap"><div class="btn-group">' +
            '<button class="btn btn-xs" onclick="openIntakeClientFile(' + realIdx + ')" title="Open Client File"><i data-lucide="folder-open" class="lci" style="width:12px;height:12px"></i></button>' +
            '<button class="btn btn-xs btn-ghost" onclick="icSendIntakeLink(' + realIdx + ')" title="Send Intake Forms"><i data-lucide="mail" class="lci" style="width:12px;height:12px"></i></button>' +
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
// ══════════════════════════════════════════════════════════════════════════
// INTAKE CLIENT FILE • same architecture as Patient Chart
// ══════════════════════════════════════════════════════════════════════════

var _icChartClientIdx = -1;
var _icChartTabActive = 'summary';

function openIntakeClientFile(idx) {
  _icChartClientIdx = idx;
  var db = getDB();
  var client = (db.intakeClients || [])[idx];
  if (!client) { toast('Client not found','err'); return; }
  var existing = document.getElementById('ic-chart-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.className = 'pt-chart-overlay';
  overlay.id = 'ic-chart-overlay';
  overlay.innerHTML = '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">' + _buildICChartShell(client, db) + '</div>';
  (document.querySelector('.app-shell') || document.body).appendChild(overlay);
  // Wire events via addEventListener
  overlay.querySelectorAll('.ptc-tab[data-tabid]').forEach(function(tab) {
    tab.addEventListener('click', function() { _renderICTab(tab.dataset.tabid); });
  });
  var closeBtn = document.getElementById('ic-chart-close');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    var ov = document.getElementById('ic-chart-overlay'); if (ov) ov.remove();
  });
  _renderICTab('summary');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _buildICChartShell(c, db) {
  var age = c.dob ? (function(){ var d=new Date(c.dob); var now=new Date(); var a=now.getFullYear()-d.getFullYear(); if(now.getMonth()<d.getMonth()||(now.getMonth()===d.getMonth()&&now.getDate()<d.getDate()))a--; return a; })() : '•';
  var TABS = [
    {id:'summary',      label:'Summary',      icon:'layout-dashboard'},
    {id:'demographics', label:'Demographics', icon:'user'},
    {id:'coverage',     label:'Coverage',     icon:'shield-check'},
    {id:'records',      label:'Records',      icon:'folder-open'},
  ];
  var tabsHTML = TABS.map(function(t){
    return '<div class="ptc-tab" id="ict-tab-'+t.id+'" data-tabid="'+t.id+'">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;pointer-events:none">' + _icTabIcon(t.icon) + '</svg>' +
      t.label + '</div>';
  }).join('');
  return '<div class="ptc-banner">' +
    '<span class="ptc-banner-title">CLIENT FILE</span>' +
    '<span class="ptc-banner-sep">|</span>' +
    '<span class="ptc-banner-meta-item">' + (c.lastName||'').toUpperCase() + ', ' + (c.firstName||'').toUpperCase() + '</span>' +
    '<span class="ptc-banner-meta-item">' + (c.dob||'') + '</span>' +
    (age !== '•' ? '<span class="ptc-banner-meta-item">' + age + ' yrs</span>' : '') +
    '<span class="ptc-banner-meta-item">' + (c.gender||'') + '</span>' +
    '<span class="ptc-banner-sep">|</span>' +
    '<div class="ptc-tabs-inline">' + tabsHTML + '</div>' +
    '<button class="ptc-banner-close" id="ic-chart-close" title="Close">&times;</button>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:14px 16px;background:#F4F6FA" id="ic-main"></div>';
}

function _icTabIcon(icon) {
  var icons = {
    'layout-dashboard': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'user': '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    'folder-open': '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  };
  return icons[icon] || '';
}

function _renderICTab(tabId) {
  _icChartTabActive = tabId;
  document.querySelectorAll('.ptc-tab[id^="ict-tab-"]').forEach(function(t){ t.classList.remove('active'); });
  var tabEl = document.getElementById('ict-tab-' + tabId);
  if (tabEl) tabEl.classList.add('active');
  var main = document.getElementById('ic-main');
  if (!main) return;
  var db = getDB();
  var client = (db.intakeClients || [])[_icChartClientIdx];
  if (!client) { main.innerHTML = '<p style="color:#586579">Client not found.</p>'; return; }
  switch(tabId) {
    case 'summary':      main.innerHTML = _buildICSummaryTab(client, db); break;
    case 'demographics': main.innerHTML = _buildICDemoTab(client, db); break;
    case 'coverage':     main.innerHTML = _buildICCoverageTab(client, db); break;
    case 'records':      _buildICRecordsTab(client, db, main); break;
    default: main.innerHTML = '<p style="color:#586579">Tab not found.</p>';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Summary Tab ─────────────────────────────────────────────────────────────
function _buildICSummaryTab(c, db) {
  var R = function(l,v){ return v ? '<div style="padding:6px 0;border-bottom:1px solid #F1F4F8;display:flex;gap:8px"><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#586579;width:110px;flex-shrink:0">'+l+'</span><span style="font-size:12px;color:#0B1526;font-weight:600">'+v+'</span></div>' : ''; };
  var age = c.dob ? (function(){ var d=new Date(c.dob); var now=new Date(); var a=now.getFullYear()-d.getFullYear(); if(now.getMonth()<d.getMonth()||(now.getMonth()===d.getMonth()&&now.getDate()<d.getDate()))a--; return a+''; })() : '';
  var ini = ((c.firstName||'?')[0]+(c.lastName||'?')[0]).toUpperCase();
  var bg = c.gender==='Female'?'#D45C37':c.gender==='Male'?'#2d6a4f':'#3A475C';
  var statusColor = c.status==='Signed'?'#16a34a':c.status==='Forms Sent'?'#d97706':'#586579';
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    // LEFT
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr">Client Information</div>' +
    '<div style="display:flex;gap:14px;padding:14px;align-items:flex-start">' +
    '<div style="width:52px;height:52px;border-radius:50%;background:'+bg+';color:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+ini+'</div>' +
    '<div style="flex:1">' +
    '<div style="font-size:16px;font-weight:700;color:#0B1526">'+(c.lastName||'').toUpperCase()+', '+(c.firstName||'')+'</div>' +
    '<div style="font-size:11px;color:#586579;margin-bottom:10px">'+(age?age+' yrs · ':'')+' '+(c.gender||'') + ' · <span style="color:'+statusColor+';font-weight:700">'+(c.status||'Pending')+'</span></div>' +
    R('DOB', c.dob||'') + R('Language', c.language||'') + R('Diagnoses', c.diagnoses||'') + R('School', c.school||'') + R('Grade', c.grade||'') +
    '</div></div></div>' +
    '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr">Guardian / Parent</div>' +
    '<div style="padding:12px 14px">' +
    R('Name', c.guardianName||'') + R('Relationship', c.guardianRel||'') + R('Phone', c.guardianPhone||'') + R('Phone 2', c.guardianPhone2||'') + R('Email', c.guardianEmail||'') + R('Address', (c.address||'')+(c.city?', '+c.city:'')) +
    '</div></div></div>' +
    // RIGHT
    '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr">Insurance</div>' +
    '<div style="padding:12px 14px">' +
    R('Provider', c.insuranceProvider||'') + R('Member ID', c.insuranceId||'') + R('Group', c.insuranceGroup||'') +
    '</div></div>' +
    '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr">Emergency Contact</div>' +
    '<div style="padding:12px 14px">' +
    R('Name', c.emergName||'') + R('Phone', c.emergPhone||'') + R('Relationship', c.emergRel||'') +
    '</div></div>' +
    '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr">Clinical</div>' +
    '<div style="padding:12px 14px">' +
    R('ABA Provider', c.abaProvider||'') + R('PCP', c.pcp||'') + R('Referral Source', c.referralSource||'') + R('Custody', c.custody||'') +
    '</div></div>' +
    (c.notes ? '<div class="ptc-panel"><div class="ptc-panel-hdr">Notes</div><div style="padding:12px 14px;font-size:13px;color:#3A475C;line-height:1.6">'+escapeHtml(c.notes)+'</div></div>' : '') +
    '</div></div>';
}

// ── Demographics Tab ─────────────────────────────────────────────────────────
function _buildICDemoTab(c, db) {
  var idx = _icChartClientIdx;
  var F = function(id,lbl,val,type){ return '<div class="field"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">'+lbl+'</label><input id="icd-'+id+'" value="'+escapeHtml(val||'')+'" '+(type?'type="'+type+'"':'')+' style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526"></div>'; };
  var S = function(id,lbl,val,opts){ return '<div class="field"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">'+lbl+'</label><select id="icd-'+id+'" style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526">'+opts.map(function(o){ return '<option'+(o===val?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'; };
  return '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr" style="display:flex;align-items:center;justify-content:space-between">Demographics' +
    '<button class="btn btn-primary btn-sm" onclick="_saveICDemo()">Save Changes</button></div>' +
    '<div class="ptc-panel-body">' +
    '<div class="fg g2">' +
    F('first','First Name *',c.firstName) + F('last','Last Name *',c.lastName) +
    F('dob','Date of Birth',c.dob,'date') + S('gender','Gender',c.gender,['','Male','Female','Other']) +
    F('language','Language',c.language) + S('status','Status',c.status,['Pending Forms','Forms Sent','Signed','Evaluation Completed','Archived']) +
    '</div><div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Guardian / Parent</div>' +
    '<div class="fg g2">' +
    F('g-name','Guardian Name *',c.guardianName) + F('g-rel','Relationship',c.guardianRel) +
    F('g-phone','Phone',c.guardianPhone) + F('g-phone2','Phone 2',c.guardianPhone2) +
    '<div class="field" style="grid-column:1/-1"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Email</label><input id="icd-g-email" value="'+(c.guardianEmail||'')+'" type="email" style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526"></div>' +
    '<div class="field" style="grid-column:1/-1"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Address</label><input id="icd-addr" value="'+(c.address||'')+'" style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526"></div>' +
    F('city','City',c.city) +
    '</div><div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Emergency Contact</div>' +
    '<div class="fg g2">' + F('e-name','Name',c.emergName) + F('e-phone','Phone',c.emergPhone) + F('e-rel','Relationship',c.emergRel) + '</div>' +
    '<div style="margin:14px 0 6px;font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Clinical</div>' +
    '<div class="fg g2">' +
    F('ins-provider','Insurance Provider',c.insuranceProvider) + F('ins-id','Insurance ID',c.insuranceId) +
    F('ins-group','Group',c.insuranceGroup) + F('ref-source','Referral Source',c.referralSource) +
    F('pcp','PCP',c.pcp) + F('school','School',c.school) +
    F('grade','Grade',c.grade) + F('aba-provider','ABA Provider',c.abaProvider) +
    '<div class="field" style="grid-column:1/-1"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Diagnoses</label><input id="icd-dx" value="'+escapeHtml(c.diagnoses||'')+'" style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526"></div>' +
    F('custody','Custody',c.custody) +
    '</div><div style="margin-top:12px"><label style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.05em">Notes</label><textarea id="icd-notes" rows="3" style="width:100%;padding:7px 10px;border:1.5px solid #E4E9F1;border-radius:7px;font-size:13px;background:#fff;color:#0B1526;resize:vertical">'+escapeHtml(c.notes||'')+'</textarea></div>' +
    '</div></div>';
}

function _saveICDemo() {
  var g = function(id){ var el=document.getElementById('icd-'+id); return el?el.value.trim():''; };
  setDB(function(db){
    var client = (db.intakeClients || [])[_icChartClientIdx];
    if (!client) return;
    client.firstName = g('first'); client.lastName = g('last');
    client.dob = g('dob'); client.gender = g('gender'); client.language = g('language'); client.status = g('status');
    client.guardianName = g('g-name'); client.guardianRel = g('g-rel');
    client.guardianPhone = g('g-phone'); client.guardianPhone2 = g('g-phone2');
    client.guardianEmail = g('g-email'); client.address = g('addr'); client.city = g('city');
    client.emergName = g('e-name'); client.emergPhone = g('e-phone'); client.emergRel = g('e-rel');
    client.insuranceProvider = g('ins-provider'); client.insuranceId = g('ins-id'); client.insuranceGroup = g('ins-group');
    client.referralSource = g('ref-source'); client.pcp = g('pcp'); client.school = g('school');
    client.grade = g('grade'); client.abaProvider = g('aba-provider'); client.diagnoses = g('dx');
    client.custody = g('custody'); client.notes = g('notes'); client.updatedAt = Date.now();
  });
  toast('Client saved');
  if (typeof renderIntakeClients === 'function') renderIntakeClients();
}

// ── Coverage Tab ─────────────────────────────────────────────────────────────
function _buildICCoverageTab(c, db) {
  var R = function(l,v){ return '<div style="padding:7px 0;border-bottom:1px solid #F1F4F8;display:flex;gap:8px"><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#586579;width:120px;flex-shrink:0">'+l+'</span><span style="font-size:13px;color:#0B1526;font-weight:600">'+(v||'•')+'</span></div>'; };
  return '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr" style="display:flex;align-items:center;justify-content:space-between">Primary Insurance' +
    '<button class="btn btn-sm" onclick="_renderICTab(&quot;demographics&quot;)">Edit</button></div>' +
    '<div class="ptc-panel-body">' +
    R('Provider', c.insuranceProvider) + R('Member ID', c.insuranceId) + R('Group #', c.insuranceGroup) +
    '</div></div>';
}

// ── Records Tab ─────────────────────────────────────────────────────────────
function _buildICRecordsTab(c, db, main) {
  main.innerHTML = '<div class="ptc-panel">' +
    '<div class="ptc-panel-hdr" style="display:flex;align-items:center;justify-content:space-between">' +
    '<span>Records • Forms (Signed Consent Documents)</span>' +
    '<button class="btn btn-sm" onclick="_loadICRecords()">Refresh</button></div>' +
    '<div class="ptc-panel-body" id="ic-records-body">' +
    '<div style="text-align:center;padding:24px;color:#586579;font-size:13px">Loading...</div>' +
    '</div></div>';
  _loadICRecords();
}

// Icon-only action button with tooltip
function _icRecBtn(title, svgPath, onclick, style) {
  return '<button title="'+title+'" onclick="'+onclick+'" class="icoBtn" style="'+(style||'')+'">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none">'+svgPath+'</svg>' +
    '</button>';
}

// Preview PDF in a floating overlay
function _icPreviewPDF(docId) {
  var existing = document.getElementById('ic-pdf-preview-overlay');
  if (existing) existing.remove();
  // Find the doc data from stored map
  var pdfData = window._icPdfDataMap && window._icPdfDataMap[docId];
  if (!pdfData) { toast('No PDF available for preview','warn'); return; }
  var overlay = document.createElement('div');
  overlay.id = 'ic-pdf-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';

  var modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;overflow:hidden;width:90%;max-width:860px;height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4)';

  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#F8FAFC;border-bottom:1px solid #E4E9F1;flex-shrink:0';
  hdr.innerHTML = '<span style="font-size:13px;font-weight:700;color:#0B1526">Document Preview</span><div style="display:flex;gap:6px" id="ic-preview-actions"></div>';

  var ifr = document.createElement('iframe');
  ifr.src = pdfData; ifr.style.cssText = 'flex:1;border:none;width:100%';

  modal.appendChild(hdr); modal.appendChild(ifr);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  var actions = document.getElementById('ic-preview-actions');
  var bPrint = document.createElement('button');
  bPrint.className = 'icoBtn'; bPrint.title = 'Print';
  bPrint.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  bPrint.addEventListener('click', function(){ _icPrintPDF(docId); });

  var bClose = document.createElement('button');
  bClose.className = 'icoBtn icoBtn--danger'; bClose.title = 'Close';
  bClose.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  bClose.addEventListener('click', function(){ overlay.remove(); });

  actions.appendChild(bPrint); actions.appendChild(bClose);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
}

function _icPrintPDF(docId) {
  var pdfData = window._icPdfDataMap && window._icPdfDataMap[docId];
  if (!pdfData) return;
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = pdfData;
  document.body.appendChild(iframe);
  iframe.onload = function() { iframe.contentWindow.print(); setTimeout(function(){ document.body.removeChild(iframe); }, 2000); };
}

async function _icDeleteRecord(docId) {
  return cdcConfirm('Delete this signed document? This cannot be undone.').then(async (__ok)=>{if(!__ok)return;
  try {
    await _db.collection('intakeSigned').doc(docId).delete();
    toast('Document deleted');
    _loadICRecords();
  } catch(e) {
    toast('Error deleting: '+e.message,'err');
  }

});}

async function _loadICRecords() {
  var el = document.getElementById('ic-records-body');
  if (!el) return;
  var db2 = getDB();
  var client = (db2.intakeClients || [])[_icChartClientIdx];
  if (!client) { el.innerHTML = '<p style="color:#586579;font-size:13px;text-align:center;padding:24px">Save the client first.</p>'; return; }
  el.innerHTML = '<div style="text-align:center;padding:24px;color:#586579;font-size:13px">Loading...</div>';
  try {
    if (!_db) throw new Error('Not connected');
    var snap = await _db.collection('intakeSigned').where('clientId','==',client.id).get();
    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:#586579">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E4E9F1" stroke-width="1.5" style="display:block;margin:0 auto 12px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>' +
        '<div style="font-size:14px;font-weight:600;color:#3A475C">No signed forms yet</div>' +
        '<div style="font-size:12px;margin-top:4px;color:#586579">Signed consent documents will appear here after the guardian signs</div></div>';
      return;
    }
    // Store pdf data in a map keyed by doc id for preview/print
    window._icPdfDataMap = window._icPdfDataMap || {};
    var rows = '';
    snap.forEach(function(docSnap) {
      var d = docSnap.data();
      var docId = docSnap.id;
      var ts = d.signedTs || '';
      var fname = (d.formName||'Consent Form');
      var ftype = (d.formType||d.type||'');
      if (d.pdfData) window._icPdfDataMap[docId] = d.pdfData;
      var hasPdf = !!d.pdfData;
      // SVG paths for buttons
      var svgDownload = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
      var svgEye = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      var svgPrint = '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>';
      var svgTrash = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>';
      rows +=
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #F4F6FA">' +
        // Icon
        '<div style="width:36px;height:36px;border-radius:8px;background:#FFF1EC;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D45C37" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
        '</div>' +
        // Info
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:#0B1526;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+fname+'</div>' +
        '<div style="font-size:10px;color:#586579;margin-top:2px">' +
        (ftype?'<span style="background:#F4F6FA;border-radius:4px;padding:1px 5px;margin-right:6px;font-weight:600">'+ftype+'</span>':'')+
        'Signed: '+ts+
        '</div>' +
        '</div>' +
        // Action buttons with data attributes • wired via addEventListener below
        '<div style="display:flex;gap:4px;align-items:center;flex-shrink:0" data-rowid="'+docId+'">' +
        (hasPdf ? '<button class="icoBtn" title="Preview" data-action="preview" data-docid="'+docId+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' : '') +
        (hasPdf ? '<button class="icoBtn" title="Print" data-action="print" data-docid="'+docId+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>' : '') +
        (hasPdf ? '<button class="icoBtn" title="Download PDF" data-action="download" data-docid="'+docId+'" data-pdf="1" data-fname="'+(fname).replace(/[^a-z0-9]/gi,'_')+'.pdf"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>' : '') +
        '<button class="icoBtn" title="Delete" data-action="delete" data-docid="'+docId+'" style="color:#dc2626;border-color:#fca5a5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>' +
        '</div>' +
        '</div>';
    });
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'background:#fff;border-radius:10px;overflow:hidden';
    wrapper.innerHTML = rows;
    el.innerHTML = '';
    el.appendChild(wrapper);
    // Wire all action buttons
    wrapper.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.action;
        var docId = btn.dataset.docid;
        if (action === 'preview') _icPreviewPDF(docId);
        else if (action === 'print') _icPrintPDF(docId);
        else if (action === 'delete') _icDeleteRecord(docId);
        else if (action === 'download') {
          var pdf = window._icPdfDataMap && window._icPdfDataMap[docId];
          if (!pdf) return;
          var a = document.createElement('a');
          a.href = pdf; a.download = btn.dataset.fname || 'document.pdf'; a.click();
        }
      });
    });
  } catch(e) {
    el.innerHTML = '<p style="color:#dc2626;font-size:12px;padding:16px">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// End of Client File
// ═══════════════════════════════════════════════════════════════════════════

function icClientTab(tab) {
  document.getElementById('icp-info').style.display = tab === 'info' ? '' : 'none';
  document.getElementById('icp-records').style.display = tab === 'records' ? '' : 'none';
  var btnInfo = document.getElementById('ict-info');
  var btnRec = document.getElementById('ict-records');
  if (btnInfo) { btnInfo.style.color = tab==='info'?'#D45C37':'#586579'; btnInfo.style.borderBottomColor = tab==='info'?'#D45C37':'transparent'; }
  if (btnRec) { btnRec.style.color = tab==='records'?'#D45C37':'#586579'; btnRec.style.borderBottomColor = tab==='records'?'#D45C37':'transparent'; }
  if (tab === 'records') icLoadClientRecords();
}

async function icLoadClientRecords() {
  var listEl = document.getElementById('ic-records-list');
  if (!listEl) return;
  var clientIdx = parseInt(document.getElementById('ic-client-id').value);
  var db2 = getDB();
  var client = (db2.intakeClients || [])[clientIdx];
  if (!client) { listEl.innerHTML = '<p style="color:#586579;font-size:13px;text-align:center;padding:24px">Save the client first to view records.</p>'; return; }
  listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#586579;font-size:13px">Loading from Firestore...</div>';
  try {
    if (!_db) throw new Error('Firestore not ready');
    var snap = await _db.collection('intakeSigned').where('clientId','==',client.id).get();
    if (snap.empty) {
      listEl.innerHTML = '<p style="color:#586579;font-size:13px;text-align:center;padding:32px">No signed documents yet.</p>';
      return;
    }
    var html = '';
    snap.forEach(function(doc) {
      var d = doc.data();
      var ts = d.signedTs || (d.signedAt && d.signedAt.toDate ? d.signedAt.toDate().toLocaleString() : '');
      html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F8FAFC;border-radius:8px;margin-bottom:8px;border:1px solid #E4E9F1">';
      html += '<div style="width:36px;height:36px;border-radius:8px;background:#FFF1EC;display:flex;align-items:center;justify-content:center;flex-shrink:0">';
      html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D45C37" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:13px;font-weight:700;color:#0B1526">' + escapeHtml(d.formName || 'Signed Document') + '</div>';
      html += '<div style="font-size:10px;color:#586579;margin-top:2px">Signed: ' + ts + '</div>';
      html += '</div>';
      if (cdcSafeUrl(d.pdfData)) {
        html += '<a href="' + escapeHtml(cdcSafeUrl(d.pdfData)) + '" download="' + (d.formName||'document').replace(/[^a-z0-9]/gi,'_') + '.pdf" ';
        html += 'style="flex-shrink:0;padding:5px 12px;background:#D45C37;color:#fff;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px">';
        html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>PDF</a>';
      }
      html += '</div>';
    });
    listEl.innerHTML = html;
  } catch(e) {
    listEl.innerHTML = '<p style="color:#dc2626;font-size:12px;padding:16px">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

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
    'Guardian: ' + (c.guardianName||'') + ' &middot; DOB: ' + (c.dob||'•') + '<br>' +
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

  // Build sign.html link • all data embedded, no login needed
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

  // Compress payload for URL embedding • strip HTML tags from form content
  // keeping only plain text (reduces payload 60-80%)
  function _stripHtml(html) {
    var tmp = new DOMParser().parseFromString(html || '', 'text/html').body;
    return (tmp.textContent || '').replace(/\s+/g,' ').trim();
  }
  var urlPayload = {
    token: token,
    ts: fullPayload.ts,
    clientId: fullPayload.clientId,
    email: fullPayload.email,
    client: fullPayload.client,
    provider: {
      name: fullPayload.provider.name || '',
      addr1: fullPayload.provider.addr1 || '',
      city: fullPayload.provider.city || '',
      state: fullPayload.provider.state || '',
      phone: fullPayload.provider.phone || '',
      npi: fullPayload.provider.npi || ''
      // logo excluded from URL • too large
    },
    forms: fullPayload.forms.map(function(f) {
      return {
        id: f.id,
        name: f.name,
        type: f.type,
        content: _stripHtml(f.content) // plain text only • removes all HTML tags
      };
    })
  };
  var jsonStr = JSON.stringify(urlPayload);
  var intakeLink = window.location.origin + '/sign.html#d=' + encodeURIComponent(btoa(unescape(encodeURIComponent(jsonStr))));
  console.log('[CDC] sign link chars:', intakeLink.length, '| payload chars:', jsonStr.length);

  // Build email HTML
  var formNames = selectedIndices.map(function(fi){ return (db.intakeForms[fi]?.name||'Form'); }).join(', ');
  var childName = (c.firstName||'') + ' ' + (c.lastName||'');
  var logoHtml = '<svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="18" fill="#D45C37"/><path d="M50 15 L80 28 L80 55 C80 72 65 84 50 90 C35 84 20 72 20 55 L20 28 Z" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/><line x1="50" y1="38" x2="50" y2="68" stroke="white" stroke-width="6" stroke-linecap="round"/><line x1="35" y1="53" x2="65" y2="53" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';

  var emailHtml = [
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">',
    '<div style="background:#0B1526;padding:20px 28px;display:flex;align-items:center;gap:14px">',
      logoHtml,
      '<div><div style="color:white;font-weight:700;font-size:20px">ClaimDataCare</div><div style="color:#586579;font-size:11px;margin-top:1px">Secure Intake Portal</div></div>',
    '</div>',
    '<div style="background:#F6F8FB;padding:24px 28px;border:1px solid #E4E9F1;border-top:none">',
      '<p style="color:#0B1526;font-size:15px;font-weight:600;margin:0 0 6px">Secure Intake Forms for ' + escapeHtml(childName) + '</p>',
      '<p style="color:#3A475C;font-size:13px;margin:0 0 18px;line-height:1.5">Dear ' + escapeHtml(c.guardianName||'Guardian') + ',</p>',
      '<p style="color:#3A475C;font-size:13px;margin:0 0 14px;line-height:1.5">The following intake forms are ready for your review and electronic signature:</p>',
      '<div style="background:#fff;border:1px solid #E4E9F1;border-radius:8px;padding:14px 18px;margin-bottom:18px">',
        '<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#0B1526">Forms to complete:</p>',
        '<p style="margin:0;font-size:13px;color:#3A475C">' + escapeHtml(formNames) + '</p>',
      '</div>',
      (message ? '<p style="color:#3A475C;font-size:13px;margin:0 0 14px;line-height:1.5"><em>' + escapeHtml(message) + '</em></p>' : ''),
      '<div style="text-align:center;margin-bottom:18px">',
        '<a href="' + intakeLink + '" style="display:inline-block;background:#D45C37;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">Complete Forms Now</a>',
        '<p style="color:#586579;font-size:10px;margin-top:8px">This link is unique and expires in 72 hours. Do not share.</p>',
      '</div>',
      '<p style="color:#586579;font-size:10px;border-top:1px solid #E4E9F1;padding-top:12px;margin:0">If you did not expect this email, please ignore it. &middot; ClaimDataCare &copy; 2026</p>',
    '</div></div>',
  ].join('');

  sendEmail(email, 'ClaimDataCare • Secure Intake Forms for ' + childName, emailHtml, 'intake').then(function(sent){
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
      _icAuditLog('intake-forms-sent', 'Client ' + (c.id||'') + ': ' + selectedIndices.length + ' form(s) sent');
      closeModal('modal-send-intake');
      renderIntakeClients();
      toast('Intake forms sent to ' + email + ' <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');
    } else {
      toast('Failed to send email. Check email configuration.','err');
    }
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
        var created = f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '•';
        return '<tr>' +
          '<td style="font-weight:600">' + (f.name||'') + '</td>' +
          '<td><span class="badge b-blue" style="font-size:10px">' + (f.type||'') + '</span></td>' +
          '<td style="font-size:12px;color:var(--text2)">' + (f.category||'•') + '</td>' +
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
    var sent = s.sentAt ? new Date(s.sentAt).toLocaleDateString() : '•';
    var signed = s.signedAt ? new Date(s.signedAt).toLocaleString() : '•';
    html += '<tr><td>' + escapeHtml(s.formName||'') + '</td><td style="font-size:12px">' + sent + '</td><td>' + _icStatusBadge(s.status || 'Sent') + '</td><td style="font-size:12px">' + signed + '</td>' +
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
        var updated = e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : (e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '•');
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
  return cdcConfirm('Delete intake client "' + (c.firstName||'') + ' ' + (c.lastName||'') + '"?\nThis action cannot be undone.').then((__ok)=>{if(!__ok)return;
  setDB(function(db){
    if (db.intakeClients) db.intakeClients.splice(idx, 1);
  });
  _icAuditLog('intake-client-delete', 'Deleted: ' + (c.firstName||'') + ' ' + (c.lastName||''));
  renderIntakeEvaluation();
  toast('Client deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');

});}

function icDeleteForm(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var f = db.intakeForms && db.intakeForms[idx];
  if (!f) { toast('Form not found','err'); return; }
  return cdcConfirm('Delete form template "' + (f.name||'') + '"?\nThis action cannot be undone.').then((__ok)=>{if(!__ok)return;
  setDB(function(db){
    if (db.intakeForms) db.intakeForms.splice(idx, 1);
  });
  _icAuditLog('intake-form-delete', 'Deleted: ' + (f.name||''));
  renderIntakeConsentForms();
  toast('Form deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');

});}

function icDeleteEval(idx) {
  if (!_icRequireSA()) return;
  var db = getDB();
  var e = db.evaluations && db.evaluations[idx];
  if (!e) { toast('Evaluation not found','err'); return; }
  return cdcConfirm('Delete evaluation for client "' + (e.clientId||'') + '"?\nThis action cannot be undone.').then((__ok)=>{if(!__ok)return;
  setDB(function(db){
    if (db.evaluations) db.evaluations.splice(idx, 1);
  });
  _icAuditLog('intake-eval-delete', 'Deleted evaluation for client: ' + (e.clientId||''));
  renderIntakeEvaluation();
  toast('Evaluation deleted <i data-lucide="check" class="lci" style="width:13px;height:13px;color:var(--green)"></i>');

});}

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
  document.getElementById('sig-signer-info').innerHTML = 'Signing as: <strong>' + escapeHtml(signerName||'') + '</strong> &middot; ' + escapeHtml(signerEmail||'');
  document.getElementById('sig-result-data').value = '';
  document.getElementById('sig-result-type').value = '';
  _sigCallback = (typeof callback === 'function') ? callback : null;

  // Reset mode
  icSetSigMode('draw');
  openModal('modal-signature');

  setTimeout(function(){
    _sigCanvas = document.getElementById('sig-canvas');
    if (!_sigCanvas) return;
    _sigCtx = _sigCanvas.getContext('2d');
    _sigCtx.fillStyle = '#fff';
    _sigCtx.fillRect(0, 0, _sigCanvas.width, _sigCanvas.height);
    _sigCtx.strokeStyle = '#0B1526';
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
  if (typeof _sigCallback === 'function') {
    try { _sigCallback(sigObj); } catch(e) { console.warn('Signature callback error:', e); }
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

// ── Public intake / demographic portal links (removed 2026-09-29) ──
// SECURITY/HIPAA: these portals ran on the app's own address without sign-in, read
// patient records from the cloud without authentication, trusted forgeable tokens and
// carried PHI in the URL. They were removed at the source. Old links now show a
// neutral message; forms are sent for signature with "Send Intake Forms" (sign.html).
function checkIntakeToken() {
  var qs = window.location.search || '';
  if (!/^\?(intake|demographics)=/.test(qs)) return;
  var root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F6F8FB;font-family:Arial,sans-serif;padding:20px">' +
      '<div style="max-width:420px;text-align:center;background:#fff;border:1px solid #E4E9F1;border-radius:12px;padding:32px 28px">' +
      '<div style="font-size:18px;font-weight:700;color:#0B1526;margin-bottom:8px">This link is no longer valid</div>' +
      '<div style="font-size:13px;color:#586579;line-height:1.6">For your privacy, this link was deactivated. Please contact your provider to receive a new secure link.</div>' +
      '</div></div>';
  }
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



