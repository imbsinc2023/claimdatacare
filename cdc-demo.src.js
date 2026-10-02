/*
 * ClaimDataCare  •  Patient chart • Info (demographics)
 * File: cdc-demo.js  •  v1.0
 *
 * Replaces _buildDemoTab, _saveDemoTab, _pcdSelectChip and openPatientModal from script1.js.
 *   • New patient / client opens the same patient file at Info; created only when Save passes
 *   • Compact two-column layout (horizontal space first), short choices as segmented buttons,
 *     long lists as drop-downs, a fixed message line under the title (nothing moves)
 *   • Faster entry: ZIP fills city and state, phone numbers format as you type,
 *     SSN accepts 4 digits, state 2 letters, Ctrl+S saves
 *   • On save the address is checked with USPS; if USPS suggests a different address the user
 *     sees both, can edit the suggestion, and decides which one to keep
 *
 * USPS needs the usps worker (Cloudflare) with the USPS API credentials. Without it, ZIP lookup
 * uses a public ZIP directory and the address is saved as typed.
 */
(function () {
  'use strict';
  var USPS_URL = 'https://usps.imbsinc2023.workers.dev';
  var uspsOK = null;   // null = not tried yet, false = not available

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci"></i>'; }
  function $(id) { return document.getElementById('pcd-' + id); }
  function v(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  // some specialties (case management / TCM) call the person a "client"
  function term() { try { return typeof _isCMSpecialtyActive === 'function' && _isCMSpecialtyActive() ? 'Client' : 'Patient'; } catch (e) { return 'Patient'; } }
  window.cdcPersonTerm = term;
  function msg(t, kind) { var m = document.getElementById('pcd-msg'); if (!m) return; m.textContent = t || ''; m.className = (m.classList.contains('sum') ? 'sum ' : '') + 'pcd-msg' + (kind ? ' ' + kind : ''); }

  var CSS = [
    '.pcd{display:flex;flex-direction:column;gap:12px}',
    '.pcd-top{display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid #E4E9F1;border-radius:14px;background:#fff}',
    '.pcd-ph{position:relative;width:48px;height:48px;border-radius:12px;overflow:hidden;flex:none;cursor:pointer}',
    '.pcd-ph img{width:100%;height:100%;object-fit:cover}',
    '.pcd-ph .cam{position:absolute;right:0;bottom:0;width:20px;height:20px;border-radius:7px 0 0 0;background:rgba(11,21,38,.65);color:#fff;display:flex;align-items:center;justify-content:center}',
    '.pcd-who{min-width:0}',
    '.pcd-who b{display:block;font-size:15px;color:#0B1526;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pcd-who span{font-size:12px;color:#586579}',
    '.pcd-msg{flex:1;min-width:0;height:20px;font-size:12.5px;font-weight:600;color:#586579;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pcd-msg.err{color:#C8286A}.pcd-msg.ok{color:#007FA3}',
    /* one grid over the whole area: rows of equal-height cards, last row stretches to the bottom */
    '#pcd-root{min-height:0}',
    '.pcd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-areas:"pt pt id" "ad ct ec" "pv fl fl";gap:14px;align-items:stretch;align-content:start}',
    '.pcd-grid .pcd-sec{display:flex;flex-direction:column;min-width:0}',
    '.pcd-sec{border:1px solid #E6EAF1;border-radius:16px;background:#fff;padding:14px 16px;box-shadow:0 1px 2px rgba(11,21,38,.04),0 10px 24px -20px rgba(11,21,38,.25)}',
    '.pcd-sec h4{margin:0 0 10px;display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
    '.pcd-sec h4 .lci{color:#FF6A3D}',
    '.pcd-pr{display:grid;grid-template-columns:112px minmax(0,1fr);gap:16px;align-items:start}',
    '.pcd-photo{position:relative;width:112px;height:178px;margin-top:1px;border-radius:16px;overflow:hidden;cursor:pointer;background:#F4F6FA;border:1px solid #E4E9F1;display:flex;align-items:center;justify-content:center}',
    '.pcd-photo img{width:100%;height:100%;object-fit:cover}',
    '.pcd-photo .ini{font-size:28px;font-weight:700;color:#8C98AB;display:flex;align-items:center;justify-content:center}',
    '.pcd-photo .cam{position:absolute;right:0;bottom:0;width:26px;height:26px;border-radius:10px 0 0 0;background:rgba(11,21,38,.7);color:#fff;display:flex;align-items:center;justify-content:center}',
    '.pcd-g{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px 10px}',
    '.pcd-f{min-width:0}.pcd-f.s2{grid-column:span 2}.pcd-f.s3{grid-column:span 3}.pcd-f.s4{grid-column:span 4}.pcd-f.s6{grid-column:span 6}',
    '.pcd-f label{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7689;margin-bottom:5px;white-space:nowrap}',
    '.pcd-f label .opt{margin-left:4px;font-weight:600;letter-spacing:0;text-transform:none;color:#A3ADBD}',
    '.pcd-note{grid-column:span 6;margin:2px 0 0;font-size:11.5px;color:#8C98AB}',
    '.pcd-f label .rq{color:#C8286A}',
    '.pcd-f label .hint{margin-left:auto;font-weight:600;letter-spacing:0;text-transform:none;color:#007FA3;font-size:10.5px;overflow:hidden;text-overflow:ellipsis}',
    '.pcd-f input,.pcd-f select{width:100%;box-sizing:border-box;height:36px;padding:0 11px;border:1px solid #E2E7EF;border-radius:10px;font-family:inherit;font-size:13px;background:#FAFBFD;color:#0B1526;transition:border-color .15s,background-color .15s,box-shadow .15s}',
    '.pcd-f input:hover,.pcd-f select:hover{border-color:#CDD5E1}',
    '.pcd-f input::placeholder{color:#A3ADBD}',
    '.pcd-f input:focus,.pcd-f select:focus{outline:none;border-color:#FF6A3D;background:#fff;box-shadow:0 0 0 4px rgba(255,106,61,.12)}',
    '.pcd-f input.ok{border-color:rgba(0,163,209,.55);background:rgba(0,163,209,.04)}',
    '.pcd-f input.bad{border-color:#E8367A;box-shadow:0 0 0 3px rgba(232,54,122,.12)}',
    '.pcd-seg{display:flex;height:36px;border:1px solid #E4E9F1;border-radius:9px;overflow:hidden;background:#fff}',
    '.pcd-seg button{flex:1;min-width:0;border:0;background:transparent;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;white-space:nowrap;transition:background-color .15s,color .15s}',
    '.pcd-seg button+button{border-left:1px solid #E4E9F1}',
    '.pcd-seg button:hover{background:#F4F6FA}',
    '.pcd-seg button.on{background:#FF6A3D;color:#fff}',
    '.pcd-flags{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 14px}',
    '.pcd-flags label{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#0B1526;cursor:pointer;padding:4px 0}',
    '.pcd-flags input{width:16px;height:16px;margin:0;accent-color:#FF6A3D}',
    /* USPS suggestion window */
    '.usps{width:94vw!important;max-width:760px!important;display:flex!important;flex-direction:column;border-radius:18px!important;padding:0!important;overflow:hidden}',
    '.usps-b{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;padding:16px 20px}',
    '.usps-col{border:1px solid #E4E9F1;border-radius:12px;padding:12px 14px}',
    '.usps-col h5{margin:0 0 8px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
    '.usps-col.sug{border-color:rgba(0,163,209,.45);background:rgba(0,163,209,.04)}',
    '.usps-col.sug h5{color:#007FA3}',
    '.usps-col p{margin:0;font-size:13px;line-height:1.55;color:#0B1526}',
    '.usps-col .pcd-g{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '.usps-note{padding:0 20px 4px;font-size:12px;color:#586579}',
    '@media (max-width:1200px){.pcd-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:none;grid-template-areas:"pt pt" "id id" "ad ct" "ec pv" "fl fl"}}',
    '.adr{width:94vw!important;max-width:820px!important;display:flex!important;flex-direction:column;border-radius:18px!important;padding:0!important;overflow:hidden}',
    '.adr-b{padding:16px 20px;display:flex;flex-direction:column;gap:6px;background:#F8FAFC}',
    '.adr-intro{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;border-radius:12px;background:rgba(0,163,209,.08);color:#00607A;font-size:12.5px;font-weight:600}',
    '.adr-intro.bad{background:rgba(232,54,122,.08);color:#A81D57}',
    '.adr-head,.adr-row{display:grid;grid-template-columns:130px minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center}',
    '.adr-head span{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB;padding:0 10px}',
    '.adr-row{padding:6px 0;border-bottom:1px solid #EEF1F6}',
    '.adr-row .l{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#586579;display:flex;flex-direction:column;gap:2px}',
    '.adr-row .l em{font-style:normal;font-size:10px;letter-spacing:0;text-transform:none;color:#C8286A}',
    '.adr-row .m{height:36px;display:flex;align-items:center;padding:0 11px;border-radius:10px;background:#fff;border:1px solid #E2E7EF;font-size:13px;color:#0B1526;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.adr-row .s input{width:100%;box-sizing:border-box;height:36px;padding:0 11px;border:1px solid #E2E7EF;border-radius:10px;font-family:inherit;font-size:13px;background:#fff;color:#0B1526}',
    '.adr-row .s.none{height:36px;display:flex;align-items:center;padding:0 11px;color:#8C98AB;font-size:12.5px}',
    '.adr-row.d .m{background:rgba(232,54,122,.06);border-color:rgba(232,54,122,.45);color:#A81D57;text-decoration:line-through;text-decoration-color:rgba(232,54,122,.5)}',
    '.adr-row.d .s input{background:rgba(0,163,209,.07);border-color:rgba(0,163,209,.55);font-weight:700;color:#00607A}',
    '@media (max-width:640px){.usps-b{grid-template-columns:1fr}}'
  ].join('\n');
  window.cdcDemoCss = function () { css(); };
  function css() { if (document.getElementById('pcd-style')) return; var s = document.createElement('style'); s.id = 'pcd-style'; s.textContent = CSS; document.head.appendChild(s); }

  function f(id, lbl, val, o) {
    o = o || {};
    return '<div class="pcd-f ' + (o.span || '') + '"><label for="pcd-' + id + '">' + lbl + (o.req ? ' <span class="rq">*</span>' : '') + (o.hint ? '<span class="hint" id="pcd-' + id + '-hint"></span>' : '') + '</label>' +
      '<input id="pcd-' + id + '" type="' + (o.type || 'text') + '" value="' + esc(val || '') + '"' + (o.cls ? ' class="' + o.cls + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.max ? ' maxlength="' + o.max + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.on ? ' ' + o.on : '') + '></div>';
  }
  function sel(id, lbl, val, opts, o) {
    o = o || {};
    return '<div class="pcd-f ' + (o.span || '') + '"><label for="pcd-' + id + '">' + lbl + (o.req ? ' <span class="rq">*</span>' : '') + '</label><select id="pcd-' + id + '">' +
      '<option value="">Select</option>' + opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === val ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function seg(id, lbl, val, opts, o) {
    o = o || {};
    return '<div class="pcd-f ' + (o.span || '') + '"><label>' + lbl + (o.req ? ' <span class="rq">*</span>' : '') + '</label><input type="hidden" id="pcd-' + id + '" value="' + esc(val || '') + '">' +
      '<div class="pcd-seg" role="group">' + opts.map(function (x) { return '<button type="button" data-v="' + esc(x[0]) + '"' + (x[0] === val ? ' class="on"' : '') + ' onclick="_pcdSelectChip(this)">' + esc(x[1]) + '</button>'; }).join('') + '</div></div>';
  }
  function chk(id, lbl, on) { return '<label><input type="checkbox" id="pcd-' + id + '"' + (on ? ' checked' : '') + '>' + esc(lbl) + '</label>'; }

  window._pcdSelectChip = function (btn) {
    var wrap = btn.closest('.pcd-f'); if (!wrap) return;
    wrap.querySelectorAll('.pcd-seg button').forEach(function (b) { b.classList.toggle('on', b === btn); });
    var h = wrap.querySelector('input[type=hidden]'); if (h) h.value = btn.getAttribute('data-v');
    emailMark();
  };
  // the email field shows the required mark while Email is the preferred contact or reminder
  function emailMark() {
    var need = v('prefContact') === 'email' || v('apptReminder') === 'email', lab = document.querySelector('label[for="pcd-email"]');
    if (!lab) return;
    var rq = lab.querySelector('.rq');
    if (need && !rq) lab.insertAdjacentHTML('beforeend', ' <span class="rq">*</span>');
    if (!need && rq) rq.remove();
  }

  function formHTML(pat) {
    var T = term();
    return '<div class="pcd-grid">' +
        '<section class="pcd-sec" style="grid-area:pt"><h4>' + ico('user', 14) + T + '</h4><div class="pcd-pr">' +
          '<div class="pcd-photo" data-tip="Photo" onclick="' + (pat._draft ? 'cdcToastPhotoLater()' : '_openPhotoOptions(\'' + esc(pat.id) + '\')') + '">' +
            (pat.photo ? '<img src="' + esc(pat.photo) + '" alt="">' : '<span class="ini">' + (function () { var ini = ((pat.first || ' ')[0] + (pat.last || ' ')[0]).trim().toUpperCase(); return ini ? esc(ini) : ico('user', 30); })() + '</span>') +
            '<span class="cam">' + ico('camera', 12) + '</span></div><div class="pcd-g">' +
          f('last', 'Last name', pat.last, { req: 1, span: 's2' }) + f('first', 'First name', pat.first, { req: 1, span: 's2' }) + f('mid', 'Middle', pat.mid) + f('nickname', 'Nickname', pat.nickname) +
          f('dob', 'Date of birth', pat.dob, { req: 1, type: 'date', span: 's2' }) +
          seg('sex', 'Sex', pat.sex, [['M', 'Male'], ['F', 'Female'], ['O', 'Other']], { req: 1, span: 's2' }) +
          f('acct', 'Account #', pat.acct, { req: 1 }) +
          seg('inactive', 'Status', pat.inactive ? 'inactive' : 'active', [['active', 'Active'], ['inactive', 'Inactive']]) +
          sel('suffix', 'Suffix', pat.suffix, [['Jr', 'Jr'], ['Sr', 'Sr'], ['II', 'II'], ['III', 'III'], ['IV', 'IV']]) +
          f('prevName', 'Previous / maiden name', pat.prevName) +
          f('occupation', 'Occupation', pat.occupation) +
          sel('employment', 'Employment', pat.employment, [['Employed', 'Employed'], ['Self-employed', 'Self-employed'], ['Unemployed', 'Unemployed'], ['Retired', 'Retired'], ['Student', 'Student'], ['Disabled', 'Disabled']]) +
        '</div></div></section>' +
        '<section class="pcd-sec" style="grid-area:id"><h4>' + ico('contact', 14) + 'Identity &amp; clinical</h4><div class="pcd-g">' +
          sel('ethnicity', 'Ethnicity', pat.ethnicity, [['Hispanic', 'Hispanic/Latino'], ['Non-Hispanic', 'Not Hispanic'], ['Unknown', 'Unknown']], { req: 1, span: 's2' }) +
          sel('race', 'Race', pat.race, [['White', 'White'], ['Black', 'Black/African Am.'], ['Asian', 'Asian'], ['AI', 'AI/Alaska Native'], ['PI', 'Native HI/Pacific Isl.'], ['Multi', 'Two or more'], ['Other', 'Other'], ['Unknown', 'Unknown']], { req: 1, span: 's2' }) +
          sel('marital', 'Marital status', pat.marital, [['Single', 'Single'], ['Married', 'Married'], ['Divorced', 'Divorced'], ['Widowed', 'Widowed'], ['Partner', 'Dom. partner']], { span: 's2' }) +
          f('language', 'Preferred language', pat.language, { span: 's2' }) + f('genderid', 'Gender identity', pat.genderid, { span: 's2' }) + f('orientation', 'Sexual orientation', pat.orientation, { span: 's2' }) +
          f('codeStatus', 'Code status', pat.codeStatus, { span: 's2' }) + f('ssn', 'SSN (last 4)', pat.ssn, { max: 4, mode: 'numeric', on: 'oninput="this.value=this.value.replace(/\\D/g,\'\')"' }) +
          f('oldChart', 'Old chart #', pat.oldChart) + f('dateOfDeath', 'Date of death', pat.dateOfDeath, { type: 'date', span: 's2' }) +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-area:ad"><h4>' + ico('map-pin', 14) + 'Address</h4><div class="pcd-g">' +
          f('addr1', 'Address 1', pat.addr1, { req: 1, span: 's4' }) + f('addr2', 'Apt / suite', pat.addr2, { span: 's2' }) +
          f('zip', 'ZIP', pat.zip, { req: 1, max: 10, mode: 'numeric', on: 'oninput="_pcdZip(this)"' }) +
          f('city', 'City', pat.city, { req: 1, span: 's2' }) + f('state', 'State', pat.state, { req: 1, max: 2 }) +
          f('country', 'Country', pat.country || 'USA', { req: 1, span: 's2' }) +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-area:ct"><h4>' + ico('phone', 14) + 'Contact</h4><div class="pcd-g">' +
          f('phone', 'Primary phone', pat.phone, { req: 1, type: 'tel', span: 's2', on: 'oninput="_pcdPhone(this)"' }) +
          f('phone2', 'Secondary phone', pat.phone2, { type: 'tel', span: 's2', on: 'oninput="_pcdPhone(this)"' }) +
          f('email', 'Email', pat.email, { type: 'email', span: 's2' }) +
          seg('prefContact', 'Preferred contact', pat.prefContact, [['phone', 'Phone'], ['text', 'Text'], ['email', 'Email'], ['mail', 'Mail']], { span: 's3' }) +
          seg('apptReminder', 'Appointment reminder', pat.apptReminder, [['phone', 'Phone'], ['text', 'Text'], ['email', 'Email']], { span: 's3' }) +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-area:ec"><h4>' + ico('siren', 14) + 'Emergency contact</h4><div class="pcd-g">' +
          f('ecName', 'Full name', pat.ecName, { span: 's4' }) + f('ecRel', 'Relationship', pat.ecRel, { span: 's2', ph: 'Daughter, spouse...' }) +
          f('ecPhone', 'Phone', pat.ecPhone, { type: 'tel', span: 's3', on: 'oninput="_pcdPhone(this)"' }) + f('ecEmail', 'Email', pat.ecEmail, { type: 'email', span: 's3' }) +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-area:pv"><h4>' + ico('stethoscope', 14) + 'Assigned provider</h4><div class="pcd-g">' +
          (function () {
            var rs = (getDB().rendering || []).filter(function (r) { return r.providerId === (pat.providerId || activeProviderId); });
            return '<div class="pcd-f s6"><label for="pcd-renderingId">Provider of this practice <span class="opt">optional</span></label><select id="pcd-renderingId"><option value="">Not assigned</option>' +
              rs.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === pat.renderingId ? ' selected' : '') + '>' + esc(((r.last || '') + ', ' + (r.first || '')).toUpperCase() + (r.npi ? '  •  NPI ' + r.npi : '')) + '</option>'; }).join('') + '</select></div>';
          })() +
          (function () {
            var fs2 = (getDB().facilities || []).filter(function (x) { return !x.providerId || x.providerId === (pat.providerId || activeProviderId); });
            return '<div class="pcd-f s6"><label for="pcd-facilityId">Main location <span class="opt">optional</span></label><select id="pcd-facilityId"><option value="">Not set</option>' +
              fs2.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === pat.facilityId ? ' selected' : '') + '>' + esc(String(x.name || '').toUpperCase()) + '</option>'; }).join('') + '</select></div>';
          })() +
          '<p class="pcd-note">Identifies the ' + T.toLowerCase() + ' as part of this provider\'s caseload and main location.</p>' +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-area:fl"><h4>' + ico('flag', 14) + 'Flags</h4><div class="pcd-flags">' +
          chk('selfInsSync', 'Self insured demographic sync', pat.selfInsSync) + chk('addrSync', 'Address sync with insurance', pat.addrSync) +
          chk('specialNeeds', 'Special needs patient', pat.specialNeeds) + chk('consentShare', 'Consent to share records', pat.consentShare) +
          chk('transportation', 'Transportation needed', pat.transportation) + chk('wheelchair', 'Wheelchair required', pat.wheelchair) +
        '</div></section>' +
      '</div>';
  }
  function wire(pat) {
    setTimeout(function () {
      var root = document.getElementById('pcd-root'); if (!root) return;
      root.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); _saveDemoTab(pat.id); } });
      var st = $('state'); if (st) st.addEventListener('input', function () { st.value = st.value.replace(/[^a-z]/gi, '').toUpperCase(); });
      emailMark();
      if (!pat.last) { var l = $('last'); if (l) l.focus(); }
    }, 30);
  }

  // Info tab of the patient file (existing record or a new one that is not saved yet).
  // Save / Cancel and the message line live in the window footer (cdc-chart.js).
  window._buildDemoTab = function (pat, db) {
    css();
    var html = '<div class="pcd" id="pcd-root" data-pid="' + esc(pat.id) + '">' + formHTML(pat) + '</div>';
    wire(pat);
    return html;
  };
  window.cdcToastPhotoLater = function () { msg('Save first, then add the photo', 'err'); };

  /* ---------------- New patient / client: nothing is created until Save passes ---------------- */
  var draft = null;
  function nextAcct(db) {
    var mine = (db.patients || []).filter(function (p) { return p.providerId === activeProviderId; });
    var max = mine.reduce(function (m, p) { return Math.max(m, parseInt(String(p.acct || '0').replace(/\D/g, ''), 10) || 0); }, 0), n = max + 1;
    while (mine.some(function (p) { return String(p.acct || '').trim().toLowerCase() === String(n); })) n++;
    return String(n);
  }
  // blank records left by the old "New patient" button (no name, no data, no claims) are removed once
  var cleaned = false;
  function cleanBlanks() {
    if (cleaned) return; cleaned = true;
    var db = getDB(), used = {};
    (db.claims || []).forEach(function (c) { used[c.patId] = 1; });
    (db.notes || []).forEach(function (n) { used[n.patId || n.patientId] = 1; });
    (db.appointments || []).forEach(function (a) { used[a.patId || a.patientId] = 1; });
    var blank = (db.patients || []).filter(function (p) {
      return !String(p.last || '').trim() && !String(p.first || '').trim() && !p.dob && !String(p.addr1 || '').trim() && !String(p.phone || '').trim() && !(p.insurances || []).length && !used[p.id];
    }).map(function (p) { return p.id; });
    if (!blank.length) return;
    setDB(function (d) { d.patients = (d.patients || []).filter(function (p) { return blank.indexOf(p.id) < 0; }); });
  }
  window.cdcDemoDraft = function () { return draft; };
  window.cdcDemoClearDraft = function () { draft = null; };
  window.openPatientModal = function (idx) {
    var db = getDB();
    try { cleanBlanks(); } catch (e) {}
    db = getDB();
    if (idx >= 0) {
      var pat = db.patients[idx];
      if (!pat) { try { toast('Not found', 'err'); } catch (e) {} return; }
      openPatientChart(pat.id); return;
    }
    if (!activeProviderId) { try { toast('Select a billing provider first', 'warn'); } catch (e) {} return; }
    draft = { id: uid(), _draft: true, providerId: activeProviderId, acct: nextAcct(db), sex: '', country: 'USA', insurances: [], inactive: false };
    if (typeof cdcOpenChartDraft === 'function') cdcOpenChartDraft(draft);
  };

  /* ---------------- faster entry ---------------- */
  window._pcdPhone = function (el) {
    var d = el.value.replace(/\D/g, '').slice(0, 10), out = d;
    if (d.length > 6) out = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    else if (d.length > 3) out = '(' + d.slice(0, 3) + ') ' + d.slice(3);
    if (el.value !== out) el.value = out;
  };
  function lookupZip(zip) {
    var viaUSPS = uspsOK === false ? Promise.reject() : fetch(USPS_URL + '/city-state?zip=' + zip).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { uspsOK = true; if (!j || !j.city) throw 0; return { city: j.city, state: j.state, src: 'USPS' }; });
    return viaUSPS.catch(function () {
      if (uspsOK === null) uspsOK = false;
      return fetch('https://api.zippopotam.us/us/' + zip).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { var p = j.places && j.places[0]; if (!p) throw 0; return { city: String(p['place name']).toUpperCase(), state: p['state abbreviation'], src: 'ZIP directory' }; });
    });
  }
  window._pcdZip = function (el) {
    el.value = el.value.replace(/[^\d-]/g, '');
    var zip = el.value.slice(0, 5);
    if (!/^\d{5}$/.test(zip) || el.dataset.last === zip) return;
    el.dataset.last = zip;
    lookupZip(zip).then(function (r) {
      // city and state are filled (or replaced) from the ZIP
      var c = $('city'), s = $('state');
      if (c) { c.value = r.city; c.classList.remove('bad'); }
      if (s) { s.value = r.state; s.classList.remove('bad'); }
    }, function () { msg('ZIP ' + zip + ' was not found', 'err'); });
  };

  /* ---------------- Address check: USPS (worker) first, U.S. Census geocoder as fallback ---------------- */
  function census(a) {
    var u = 'https://geocoding.geo.census.gov/geocoder/locations/address?benchmark=Public_AR_Current&format=json' +
      '&street=' + encodeURIComponent(a.addr1) + '&city=' + encodeURIComponent(a.city) + '&state=' + encodeURIComponent(a.state) + '&zip=' + encodeURIComponent(String(a.zip).slice(0, 5));
    return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      var m = j && j.result && (j.result.addressMatches || [])[0];
      if (!m) return { found: false, source: 'U.S. Census' };
      var parts = String(m.matchedAddress || '').split(',').map(function (x) { return x.trim(); });
      return { found: true, source: 'U.S. Census', address: { addr1: parts[0] || '', addr2: a.addr2 || '', city: parts[1] || '', state: parts[2] || '', zip: parts[3] || '' } };
    });
  }
  function verify(a) {
    var viaUsps = uspsOK === false ? Promise.reject() : fetch(USPS_URL + '/address', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) })
      .then(function (r) { if (!r.ok) throw 0; uspsOK = true; return r.json(); }).then(function (j) { j.source = j.source || 'USPS'; return j; });
    return viaUsps.catch(function () { uspsOK = false; return census(a); }).catch(function () { return null; });
  }
  var NORM = function (x) { return String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  function same(a, b) { return NORM(a.addr1) === NORM(b.addr1) && NORM(a.addr2) === NORM(b.addr2) && NORM(a.city) === NORM(b.city) && NORM(a.state) === NORM(b.state) && NORM(a.zip).slice(0, 5) === NORM(b.zip).slice(0, 5); }
  // both addresses side by side, field by field; the fields that differ are highlighted
  function chooseAddress(mine, sug, notFound, source) {
    return new Promise(function (resolve) {
      var w = document.getElementById('modal-usps'); if (w) w.remove();
      w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-usps';
      var F = [['addr1', 'Address 1'], ['addr2', 'Apt / suite'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP']];
      var diff = function (k) { return !notFound && (k === 'zip' ? NORM(mine.zip).slice(0, 5) !== NORM(sug.zip).slice(0, 5) : NORM(mine[k]) !== NORM(sug[k])); };
      var nd = notFound ? 0 : F.filter(function (f) { return diff(f[0]); }).length;
      var rows = F.map(function (f) {
        var d = diff(f[0]);
        return '<div class="adr-row' + (d ? ' d' : '') + '"><span class="l">' + f[1] + (d ? '<em>differs</em>' : '') + '</span>' +
          '<span class="m">' + esc(mine[f[0]] || '•') + '</span>' +
          (notFound ? '<span class="s none">No match</span>' : '<span class="s"><input id="usps-' + f[0] + '" value="' + esc(sug[f[0]] || '') + '"' + (f[0] === 'state' ? ' maxlength="2"' : '') + '></span>') + '</div>';
      }).join('');
      w.innerHTML = '<div class="modal adr">' +
        '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('map-pin', 17) + 'Address check • ' + esc(source || 'USPS') + '</span>' +
          '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" data-a="mine">' + ico('x', 17) + '</button></div>' +
        '<div class="adr-b"><div class="adr-intro ' + (notFound ? 'bad' : '') + '">' + ico(notFound ? 'alert-triangle' : 'sparkles', 18) +
          (notFound ? 'This address could not be found. Check the street number, the street name and the ZIP.' : nd + (nd === 1 ? ' field differs' : ' fields differ') + ' from the standard address. You can edit the suggestion before using it.') + '</div>' +
          '<div class="adr-head"><span></span><span>You entered</span><span>' + (notFound ? 'Suggestion' : 'Suggested (editable)') + '</span></div>' + rows + '</div>' +
        '<div class="cdc-ftr"><span class="sum">Choosing the suggestion is optional. The address is saved exactly as you decide.</span>' +
          (notFound ? '<button type="button" class="cdc-neutral" data-a="edit">' + ico('pencil', 15) + 'Edit address</button><button type="button" class="cdc-ok" data-a="mine">' + ico('check', 15) + 'Keep as entered</button>'
            : '<button type="button" class="cdc-neutral" data-a="mine">' + ico('undo-2', 15) + 'Keep mine</button><button type="button" class="cdc-ok" data-a="sug">' + ico('check', 15) + 'Use suggestion</button>') +
        '</div></div>';
      document.body.appendChild(w);
      w.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a'), out = null, gv = function (k) { var el = document.getElementById('usps-' + k); return el ? el.value.trim() : ''; };
        if (a === 'sug') out = { addr1: gv('addr1').toUpperCase(), addr2: gv('addr2').toUpperCase(), city: gv('city').toUpperCase(), state: gv('state').toUpperCase(), zip: gv('zip'), chosen: 'suggestion' };
        closeModal('modal-usps'); w.remove();
        resolve(a === 'edit' ? 'edit' : out || Object.assign({}, mine, { chosen: 'mine' }));
      });
      openModal('modal-usps');
    });
  }
  function formAddr() { return { addr1: v('addr1').toUpperCase(), addr2: v('addr2').toUpperCase(), city: v('city').toUpperCase(), state: v('state').toUpperCase(), zip: v('zip') }; }
  function putAddr(a) { ['addr1', 'addr2', 'city', 'state', 'zip'].forEach(function (k) { var el = $(k); if (el) { el.value = a[k] || ''; el.classList.add('ok'); el.classList.remove('bad'); } }); }
  var decided = '';   // address already checked and decided (no second prompt on Save)
  // runs the check; returns the address to keep, 'edit', or null when no service answered
  async function checkAddress(force) {
    var a = formAddr();
    if (!a.addr1 || !a.city || !a.state || !/^\d{5}/.test(a.zip)) { msg('Fill address, city, state and ZIP first', 'err'); return 'edit'; }
    var key = JSON.stringify(a);
    if (!force && decided === key) return a;
    msg('Checking the address...');
    var r = await verify(a);
    if (!r) { msg('Address could not be checked: no validation service answered', 'err'); return null; }
    var out = a;
    if (r.found === false) out = await chooseAddress(a, null, true, r.source);
    else if (r.address) {
      var sug = { addr1: r.address.addr1 || '', addr2: r.address.addr2 || '', city: r.address.city || '', state: r.address.state || '', zip: r.address.zip || '' };
      if (!same(a, sug)) out = await chooseAddress(a, sug, false, r.source);
      else { putAddr(a); msg('Address confirmed by ' + r.source, 'ok'); }
    }
    if (out === 'edit') { msg('Edit the address and check it again', 'err'); var el = $('addr1'); if (el) { el.classList.add('bad'); el.focus(); } return 'edit'; }
    if (out.chosen === 'suggestion') { putAddr(out); msg('Suggested address applied • remember to Save', 'ok'); }
    else if (out.chosen === 'mine') msg('Address kept as entered');
    delete out.chosen;
    decided = JSON.stringify(formAddr());
    return out;
  }
  window._pcdValidateAddr = function () { checkAddress(true); };

  window._saveDemoTab = async function (patId) {
    document.querySelectorAll('#pcd-root input.bad').forEach(function (e) { e.classList.remove('bad'); });
    var required = [['last', 'Last name'], ['first', 'First name'], ['dob', 'Date of birth'], ['acct', 'Account #'], ['addr1', 'Address 1'], ['zip', 'ZIP'], ['city', 'City'], ['state', 'State'], ['country', 'Country'], ['sex', 'Sex'], ['ethnicity', 'Ethnicity'], ['race', 'Race'], ['phone', 'Primary phone']];
    for (var i = 0; i < required.length; i++) {
      if (!v(required[i][0])) { msg(required[i][1] + ' is required', 'err'); var el = $(required[i][0]); if (el) { if (el.type !== 'hidden') { el.classList.add('bad'); el.focus(); } } return; }
    }
    // rules that depend on other answers, and formats
    var bad = function (id, text) { msg(text, 'err'); var el = $(id); if (el) { el.classList.add('bad'); el.focus(); } return true; };
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, digits = function (x) { return String(x || '').replace(/\D/g, ''); };
    var pc = v('prefContact'), ar = v('apptReminder');
    if ((pc === 'email' || ar === 'email') && !v('email')) return void bad('email', 'Email is required when ' + (pc === 'email' ? 'the preferred contact' : 'the appointment reminder') + ' is Email');
    if (v('email') && !emailRe.test(v('email'))) return void bad('email', 'Email is not valid');
    if (digits(v('phone')).length !== 10) return void bad('phone', 'Primary phone must have 10 digits');
    if (v('phone2') && digits(v('phone2')).length !== 10) return void bad('phone2', 'Secondary phone must have 10 digits');
    if (!/^\d{5}(-?\d{4})?$/.test(v('zip'))) return void bad('zip', 'ZIP must be 5 digits (or ZIP+4)');
    if (!/^[A-Za-z]{2}$/.test(v('state'))) return void bad('state', 'State must be the 2-letter code');
    var today = new Date().toISOString().slice(0, 10);
    if (v('dob') > today) return void bad('dob', 'Date of birth cannot be in the future');
    if (v('dateOfDeath') && v('dateOfDeath') < v('dob')) return void bad('dateOfDeath', 'Date of death cannot be before the date of birth');
    if (v('ssn') && !/^\d{4}$/.test(v('ssn'))) return void bad('ssn', 'SSN last 4 must be 4 digits');
    if ((v('ecName') || v('ecPhone')) && !(v('ecName') && v('ecPhone'))) return void bad(v('ecName') ? 'ecPhone' : 'ecName', 'Emergency contact needs a name and a phone');
    if (v('ecPhone') && digits(v('ecPhone')).length !== 10) return void bad('ecPhone', 'Emergency contact phone must have 10 digits');
    if (v('ecEmail') && !emailRe.test(v('ecEmail'))) return void bad('ecEmail', 'Emergency contact email is not valid');
    msg('');

    var db = getDB(), idx = (db.patients || []).findIndex(function (p) { return p.id === patId; });
    var isNew = idx < 0 && !!draft && draft.id === patId;
    if (idx < 0 && !isNew) { msg(term() + ' not found', 'err'); return; }
    var prev = isNew ? draft : db.patients[idx], acct = v('acct');
    var dup = db.patients.find(function (p) { return p.id !== patId && p.providerId === prev.providerId && String(p.acct || '').trim().toLowerCase() === acct.toLowerCase(); });
    if (dup) { msg('Account # ' + acct + ' is already used by ' + (dup.last || '') + ', ' + (dup.first || ''), 'err'); $('acct').classList.add('bad'); $('acct').focus(); return; }

    // address check with USPS (only when the address changed)
    var addr = { addr1: v('addr1'), addr2: v('addr2'), city: v('city'), state: v('state').toUpperCase(), zip: v('zip') };
    // every save checks the address (USPS, or the Census geocoder when USPS is not set up)
    var btn = document.getElementById('pcd-save'); if (btn) btn.disabled = true;
    var chk = await checkAddress(false);
    if (btn) btn.disabled = false;
    if (chk === 'edit') return;
    if (chk) addr = chk; else msg('Saved without address check (no validation service answered)');

    setDB(function (d) {
      var p;
      if (isNew) { p = Object.assign({}, draft, { createdAt: Date.now() }); delete p._draft; d.patients = d.patients || []; d.patients.push(p); }
      else p = d.patients[idx];
      Object.assign(p, {
        last: v('last'), first: v('first'), mid: v('mid'), dob: v('dob'), sex: v('sex'), acct: acct,
        addr1: addr.addr1, addr2: addr.addr2, zip: addr.zip, city: addr.city, state: addr.state, country: v('country'),
        ethnicity: v('ethnicity'), race: v('race'), language: v('language'), genderid: v('genderid'), orientation: v('orientation'), marital: v('marital'),
        codeStatus: v('codeStatus'), ssn: v('ssn'), oldChart: v('oldChart'), dateOfDeath: v('dateOfDeath'),
        phone: v('phone'), phone2: v('phone2'), email: v('email').toLowerCase(), prefContact: v('prefContact'), apptReminder: v('apptReminder'),
        renderingId: v('renderingId'), facilityId: v('facilityId'), suffix: v('suffix'), prevName: v('prevName').toUpperCase(), occupation: v('occupation').toUpperCase(), employment: v('employment'), ecName: v('ecName'), ecRel: v('ecRel'), ecPhone: v('ecPhone'), ecEmail: v('ecEmail').toLowerCase(), nickname: v('nickname'), inactive: v('inactive') === 'inactive',
        selfInsSync: !!($('selfInsSync') || {}).checked, addrSync: !!($('addrSync') || {}).checked, specialNeeds: !!($('specialNeeds') || {}).checked,
        consentShare: !!($('consentShare') || {}).checked, transportation: !!($('transportation') || {}).checked, wheelchair: !!($('wheelchair') || {}).checked,
        updatedAt: Date.now()
      });
    });
    if (isNew) {
      draft = null;
      try { toast(term() + ' created', 'ok'); } catch (e) {}
      try { if (typeof renderPatients === 'function') renderPatients(); } catch (e) {}
      openPatientChart(patId, 'insurance');
      return;
    }
    try { _refreshChartBanner(patId); } catch (e) {}
    try { toast('Saved', 'ok'); } catch (e) {}
    _renderChartTab('insurance');
  };
})();
