/*
 * ClaimDataCare  •  Patient file • Coverage
 * File: cdc-coverage.js  •  v1.0
 *
 * Replaces in script1.js: _buildInsuranceTab, _editInsurance, _showInsuranceForm,
 * _onInsPayerSelect, _saveInsuranceForm and _saveInsuranceFormAndAdd.
 *   • Coverage: Primary, Secondary and Tertiary side by side (empty slots invite to add one),
 *     self pay and "do not collect" switches, eligibility status on every plan
 *   • Insurance window: standard size, sections side by side, segmented choices, Self fills the
 *     subscriber from the patient, ZIP fills city and state, messages in the footer
 *   • Eligibility: runs a real-time 270/271 check through ClaimMD (API) with the billing
 *     provider's Account Key, shows coverage and benefits, and keeps the last result on the plan
 */
(function () {
  'use strict';
  var ELIG_URL = 'https://claimmd-elig.imbsinc2023.workers.dev';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci"></i>'; }
  function icons() { try { setTimeout(_renderLucideIcons, 20); } catch (e) {} }
  function term() { return typeof cdcPersonTerm === 'function' ? cdcPersonTerm() : 'Patient'; }
  function g(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function kindOf(iv) { var t = String(iv.insType || iv.type || 'Primary').toLowerCase(); return t.indexOf('secondary') >= 0 ? 'secondary' : t.indexOf('tertiary') >= 0 ? 'tertiary' : t.indexOf('case') >= 0 ? 'case' : 'primary'; }
  function us(d) { var s = String(d || ''); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + '/' + m[3] + '/' + m[1] : s; }

  var CSS = [
    '.cov{display:flex;flex-direction:column;gap:14px}',
    '.cov-bar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 14px;border:1px solid #E4E9F1;border-radius:14px;background:#fff}',
    '.cov-sw{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#3A475C;cursor:pointer;user-select:none}',
    '.cov-sw i{position:relative;width:36px;height:20px;border-radius:999px;background:#D5DCE7;transition:background-color .15s;font-style:normal}',
    '.cov-sw i:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(11,21,38,.25);transition:left .15s}',
    '.cov-sw.on i{background:#FF6A3D}.cov-sw.on i:after{left:18px}',
    '.cov-sp{flex:1}',
    '.cov-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
    '.cov-card{position:relative;display:flex;flex-direction:column;border:1px solid #E4E9F1;border-radius:16px;background:#fff;overflow:hidden}',
    '.cov-card.off{opacity:.6}',
    '.cov-top{display:flex;align-items:flex-start;gap:10px;padding:14px 14px 10px}',
    '.cov-badge{display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff}',
    '.cov-badge.primary{background:#0B1526}.cov-badge.secondary{background:#5B17C2}.cov-badge.tertiary{background:#0089B3}.cov-badge.case{background:#586579}',
    '.cov-name{font-size:15px;font-weight:700;color:#0B1526;margin-top:6px;line-height:1.25}',
    '.cov-sub{font-size:12px;color:#586579;margin-top:2px}',
    '.cov-acts{display:flex;gap:4px;margin-left:auto;flex:none}',
    '.cov-ib{width:30px;height:30px;border:1px solid #E4E9F1;border-radius:9px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s,border-color .15s}',
    '.cov-ib:hover{background:rgba(255,106,61,.09);color:#D45C37;border-color:rgba(255,106,61,.35)}',
    '.cov-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;padding:4px 14px 12px}',
    '.cov-kv div small{display:block;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.cov-kv div b{display:block;font-size:12.5px;font-weight:600;color:#0B1526;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
    '.cov-elig{margin-top:auto;display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #EEF1F6;background:#F8FAFC}',
    '.cov-st{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:700}',
    '.cov-st b{width:7px;height:7px;border-radius:50%;background:currentColor}',
    '.cov-st.active{background:rgba(0,163,209,.12);color:#007FA3}.cov-st.inactive{background:rgba(232,54,122,.1);color:#C21F62}.cov-st.none{background:#EEF1F6;color:#586579}.cov-st.error{background:rgba(214,158,46,.14);color:#9A6A10}',
    '.cov-elig small{font-size:11px;color:#8C98AB}',
    '.cov-elig .cdc-alt{height:30px;min-width:0;margin-left:auto;padding:0 12px;font-size:12px}',
    '.cov-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:220px;border:1.5px dashed #D5DCE7;border-radius:16px;background:#fff;color:#8C98AB;font-size:12.5px;cursor:pointer;transition:border-color .15s,background-color .15s,color .15s}',
    '.cov-empty:hover{border-color:rgba(255,106,61,.5);background:rgba(255,106,61,.03);color:#D45C37}',
    '.cov-empty b{font-size:13.5px;color:#3A475C}',
    '.cov-sec{border:1px solid #E4E9F1;border-radius:14px;background:#fff;padding:12px 14px}',
    '.cov-sec h4{margin:0 0 8px;display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
    '.cov-sec h4 .lci{color:#FF6A3D}',
    '.cov-sec h4 a{margin-left:auto;font-size:11.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#007FA3;cursor:pointer}',
    '.cov-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#F8FAFC;font-size:12.5px;margin-top:6px}',
    '.cov-muted{font-size:12.5px;color:#8C98AB}',
    '.cov-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
    /* eligibility window */
    /* eligibility window */
    '.elx{flex:1;min-height:0;display:grid;grid-template-columns:330px minmax(0,1fr)}',
    '.elx-side{min-height:0;display:flex;flex-direction:column;gap:12px;padding:14px;border-right:1px solid #E4E9F1;background:#F8FAFC;overflow:hidden}',
    '.elx-card{background:#fff;border:1px solid #E4E9F1;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
    '.elx-card.grow{flex:1;min-height:0}',
    '.elx-card h5{margin:0;display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
    '.elx-card h5 .lci{color:#FF6A3D}',
    '.elx-card h5 .n{margin-left:auto;min-width:20px;height:18px;padding:0 6px;border-radius:999px;background:#EEF1F6;color:#3A475C;font-size:10.5px;display:flex;align-items:center;justify-content:center;letter-spacing:0}',
    '.elx-dl{display:grid;grid-template-columns:88px minmax(0,1fr);gap:5px 10px;margin:0;font-size:12.5px}',
    '.elx-dl dt{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8C98AB;padding-top:2px}',
    '.elx-dl dd{margin:0;color:#0B1526;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.elx-in label{display:block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#586579;margin-bottom:4px}',
    '.elx-in input,.elx-in select{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:1px solid #E4E9F1;border-radius:9px;font-family:inherit;font-size:12.5px;background:#fff}',
    '.elx-hist{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin:0 -6px}',
    '.elx-hi{display:flex;align-items:center;gap:10px;width:100%;padding:8px 8px;border:0;border-radius:10px;background:transparent;font-family:inherit;text-align:left;cursor:pointer;transition:background-color .12s}',
    '.elx-hi:hover{background:#F4F6FA}',
    '.elx-hi.on{background:rgba(255,106,61,.08);box-shadow:inset 3px 0 0 #FF6A3D}',
    '.elx-hi .tx{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.elx-hi b{font-size:12.5px;color:#0B1526}',
    '.elx-hi small{font-size:11px;color:#8C98AB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.elx-hi .pdf{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#586579}',
    '.elx-hi .pdf:hover{background:rgba(106,27,219,.1);color:#5B17C2}',
    '.elx-dot{width:10px;height:10px;border-radius:50%;flex:none;background:#8C98AB}',
    '.elx-dot.active{background:#0E8A5F;box-shadow:0 0 0 3px rgba(14,138,95,.15)}.elx-dot.inactive,.elx-dot.error{background:#C8286A}',
    '.elx-none{font-size:12px;color:#8C98AB;padding:6px}',
    '.elx-main{min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px}',
    '.elx-hero{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;border:1px solid #E4E9F1;background:#fff}',
    '.elx-hero .ic{width:52px;height:52px;border-radius:14px;flex:none;display:flex;align-items:center;justify-content:center;background:#EEF1F6;color:#586579}',
    '.elx-hero small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.elx-hero b{display:block;font-size:22px;color:#0B1526;letter-spacing:-.01em}',
    '.elx-hero span{font-size:12px;color:#586579}',
    '.elx-hero.active{border-color:rgba(14,138,95,.35);background:linear-gradient(90deg,rgba(14,138,95,.07),#fff 60%)}.elx-hero.active .ic{background:#0E8A5F;color:#fff}',
    '.elx-hero.inactive,.elx-hero.error{border-color:rgba(200,40,106,.3);background:linear-gradient(90deg,rgba(200,40,106,.06),#fff 60%)}.elx-hero.inactive .ic,.elx-hero.error .ic{background:#C8286A;color:#fff}',
    '.elx-err{padding:12px 14px;border-radius:12px;background:#FDF2F6;color:#A81D57;font-size:12.5px}',
    '.elx-kv{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}',
    '.elx-kv div{padding:9px 11px;border:1px solid #E4E9F1;border-radius:12px;background:#fff;min-width:0}',
    '.elx-kv small{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8C98AB}',
    '.elx-kv b{display:block;font-size:13px;color:#0B1526;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.elx-tw{border:1px solid #E4E9F1;border-radius:12px;overflow:hidden;background:#fff}',
    '.elx-tbl{width:100%;border-collapse:collapse;font-size:12px}',
    '.elx-tbl th{background:#F8FAFC;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;border-bottom:1px solid #EEF1F6}',
    '.elx-tbl td{padding:7px 10px;border-bottom:1px solid #F1F4F8;vertical-align:top;color:#0B1526}',
    '.elx-tbl td.nt{color:#8C98AB}',
    '.elx-raw{font-size:11px;color:#586579}.elx-raw pre{max-height:220px;overflow:auto;background:#0B1526;color:#D5DCE7;padding:10px;border-radius:10px;font-size:10.5px;white-space:pre-wrap}',
    '.elx-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#8C98AB;text-align:center;font-size:13px;max-width:460px;margin:0 auto}',
    '.elx-empty b{font-size:15px;color:#0B1526}',
    '@media (max-width:1100px){.elx{grid-template-columns:minmax(0,1fr)}.elx-kv{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@media (max-width:1100px){.cov-slots{grid-template-columns:minmax(0,1fr)}.cov-2{grid-template-columns:minmax(0,1fr)}}'
  ].join('\n');
  function css() { if (document.getElementById('cov-style')) return; var s = document.createElement('style'); s.id = 'cov-style'; s.textContent = CSS; document.head.appendChild(s); }

  function eligChip(iv) {
    var e = iv.elig || {}, st = e.status || 'none';
    var lab = { active: 'Active', inactive: 'Inactive', error: 'Check failed', none: 'Not verified' }[st] || 'Not verified';
    return '<span class="cov-st ' + st + '"><b></b>' + lab + '</span>' + (e.checkedAt ? '<small>' + esc(new Date(e.checkedAt).toLocaleDateString('en-US')) + '</small>' : '');
  }

  /* ---------------- Coverage tab ---------------- */
  window._buildInsuranceTab = function (pat, db) {
    css();
    var ins = pat.insurances || [], pid = esc(pat.id), showOff = !!window._ptInsShowInactive;
    var act = ins.map(function (iv, i) { return { iv: iv, i: i }; }).filter(function (x) { return !x.iv.inactive; });
    var hasActive = act.length > 0, selfPayOn = pat.selfPay === true || (pat.selfPay !== false && !hasActive);
    var card = function (x) {
      var iv = x.iv, k = kindOf(iv);
      var kv = function (l, v) { return '<div><small>' + l + '</small><b title="' + esc(v || '') + '">' + esc(v || '•') + '</b></div>'; };
      return '<div class="cov-card' + (iv.inactive ? ' off' : '') + '">' +
        '<div class="cov-top"><div style="min-width:0"><span class="cov-badge ' + k + '">' + esc(iv.insType || iv.type || 'Primary') + '</span>' +
          '<div class="cov-name">' + esc(iv.name || iv.insuranceName || '•') + '</div><div class="cov-sub">' + esc(iv.subscriberName || ((pat.last || '') + ', ' + (pat.first || ''))) + ' • ' + esc(iv.relation || 'Self') + '</div></div>' +
          '<div class="cov-acts"><button type="button" class="cov-ib" data-tip="Edit" aria-label="Edit" onclick="_editInsurance(\'' + pid + '\',' + x.i + ')">' + ico('pencil', 14) + '</button>' +
          '<button type="button" class="cov-ib" data-tip="' + (iv.inactive ? 'Activate' : 'Deactivate') + '" aria-label="Toggle" onclick="_toggleInsuranceActive(\'' + pid + '\',' + x.i + ')">' + ico(iv.inactive ? 'toggle-left' : 'toggle-right', 14) + '</button>' +
          '<button type="button" class="cov-ib" data-tip="Delete" aria-label="Delete" onclick="_deleteInsurance(\'' + pid + '\',' + x.i + ')">' + ico('trash-2', 14) + '</button></div></div>' +
        '<div class="cov-kv">' + kv('Payer ID', iv.payerId) + kv('Member ID', iv.policy || iv.memberId) + kv('Group', iv.group) + kv('Plan', iv.plan || iv.planType) +
          kv('Effective', [us(iv.effFrom), us(iv.effTo)].filter(Boolean).join(' to ')) + kv('Copay / deductible', [iv.copay ? '$' + iv.copay : '', iv.deductible ? '$' + iv.deductible : ''].filter(Boolean).join(' / ')) + '</div>' +
        '<div class="cov-elig">' + eligChip(iv) + '<button type="button" class="cdc-alt" onclick="cdcEligOpen(\'' + pid + '\',' + x.i + ')">' + ico('shield-question', 14) + 'Check eligibility</button></div>' +
      '</div>';
    };
    var slot = function (k, label) {
      var x = act.find(function (y) { return kindOf(y.iv) === k; });
      if (x) return card(x);
      return '<div class="cov-empty" role="button" onclick="cdcInsNew(\'' + pid + '\',\'' + label + '\')">' + ico('plus-circle', 26) + '<b>Add ' + label.toLowerCase() + ' insurance</b>' + (k === 'primary' && selfPayOn ? 'Self pay while there is no insurance' : 'Optional') + '</div>';
    };
    var others = ins.map(function (iv, i) { return { iv: iv, i: i }; }).filter(function (x) { return x.iv.inactive ? showOff : kindOf(x.iv) === 'case'; });
    var offCount = ins.filter(function (iv) { return iv.inactive; }).length;
    var auths = []; try { auths = _activeAuths(pat); } catch (e) {}
    return '<div class="cov">' +
      '<div class="cov-bar">' +
        '<button type="button" class="cdc-ok" onclick="cdcInsNew(\'' + pid + '\')">' + ico('plus', 15) + 'Add insurance</button>' +
        '<span class="cov-sw' + (selfPayOn ? ' on' : '') + '" role="switch" aria-checked="' + selfPayOn + '" onclick="_toggleSelfPay(\'' + pid + '\')"><i></i>Self pay' + (selfPayOn && !hasActive && pat.selfPay === undefined ? ' <span style="font-weight:400;color:#8C98AB">(no insurance)</span>' : '') + '</span>' +
        '<span class="cov-sw' + (pat.noPatResp ? ' on' : '') + '" role="switch" aria-checked="' + !!pat.noPatResp + '" onclick="cdcCovNoResp(\'' + pid + '\')"><i></i>Do not collect patient responsibility</span>' +
        '<span class="cov-sp"></span>' +
        (offCount ? '<button type="button" class="cdc-neutral" style="height:32px;min-width:0" onclick="window._ptInsShowInactive=' + !showOff + ';_renderChartTab(\'insurance\')">' + ico(showOff ? 'eye-off' : 'archive', 14) + (showOff ? 'Hide' : 'Show') + ' inactive (' + offCount + ')</button>' : '') +
      '</div>' +
      '<div class="cov-slots">' + slot('primary', 'Primary') + slot('secondary', 'Secondary') + slot('tertiary', 'Tertiary') + '</div>' +
      (others.length ? '<div class="cov-slots">' + others.map(card).join('') + '</div>' : '') +
      '<div class="cov-2">' +
        '<div class="cov-sec"><h4>' + ico('key-round', 13) + 'Active authorizations<a onclick="_renderChartTab(\'auth\')">View all</a></h4>' +
          (auths.length ? auths.map(function (a) { return '<div class="cov-row"><span class="cov-st active"><b></b>Active</span><b>' + esc(a.payerName || '') + '</b><span style="color:#586579">Auth # ' + esc(a.authNum || '') + '</span><span style="margin-left:auto;color:#586579">thru ' + esc(us(a.endDate || '')) + '</span></div>'; }).join('') : '<div class="cov-muted">No active authorizations on file.</div>') + '</div>' +
        '<div class="cov-sec"><h4>' + ico('briefcase', 13) + 'Case insurance<a onclick="cdcInsNew(\'' + pid + '\',\'Case Insurance\')">Add</a></h4>' +
          (ins.some(function (iv) { return kindOf(iv) === 'case'; }) ? '<div class="cov-muted">Case insurance is listed above.</div>' : '<div class="cov-muted">No case insurance (auto accident, workers compensation...).</div>') + '</div>' +
      '</div></div>';
  };
  window.cdcCovNoResp = function (pid) { setDB(function (d) { var p = (d.patients || []).find(function (x) { return x.id === pid; }); if (p) p.noPatResp = !p.noPatResp; }); _renderChartTab('insurance'); };

  /* ---------------- Insurance window ---------------- */
  window._editInsurance = function (patId, idx) { _showInsuranceForm(patId, idx); };
  window.cdcInsNew = function (patId, type) { _showInsuranceForm(patId, null, type); };
  window._onInsPayerSelect = function (sel) {
    var o = sel.options[sel.selectedIndex];
    var hc = document.getElementById('pif-ins-company'), hp = document.getElementById('pif-payerid-val'), dp = document.getElementById('pif-payerid-disp');
    if (hc) hc.value = o ? (o.dataset.name || '') : ''; if (hp) hp.value = o ? (o.dataset.payerid || '') : ''; if (dp) dp.textContent = (o && o.dataset.payerid) || '•';
  };
  function F(id, label, val, o) {
    o = o || {};
    return '<div class="pcd-f ' + (o.span || '') + '"><label for="' + id + '">' + label + (o.req ? ' <span class="rq">*</span>' : '') + '</label><input id="' + id + '" type="' + (o.type || 'text') + '" value="' + esc(val || '') + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + (o.on ? ' ' + o.on : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + '></div>';
  }
  function SEG(name, label, val, opts, o) {
    o = o || {};
    return '<div class="pcd-f ' + (o.span || '') + '"><label>' + label + (o.req ? ' <span class="rq">*</span>' : '') + '</label><input type="hidden" id="' + name + '" value="' + esc(val) + '">' +
      '<div class="pcd-seg">' + opts.map(function (x) { return '<button type="button" data-v="' + esc(x) + '"' + (x === val ? ' class="on"' : '') + ' onclick="cdcInsSeg(this,\'' + name + '\')">' + esc(x) + '</button>'; }).join('') + '</div></div>';
  }
  function toISO(d) { var s = String(d || ''), m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : s; }
  window.cdcInsSeg = function (btn, name) {
    var wrap = btn.parentNode; wrap.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === btn); });
    var h = document.getElementById(name); if (h) h.value = btn.getAttribute('data-v');
    if (name === 'pif-relation' && h.value === 'Self') cdcInsSelf();
  };
  window.cdcInsSelf = function () {
    var p = (getDB().patients || []).find(function (x) { return x.id === window._insPatId; }) || {}, set = function (id, v) { var e = document.getElementById(id); if (e) e.value = v || ''; };
    set('pif-lname', p.last); set('pif-fname', p.first); set('pif-mid', p.mid); set('pif-dob', p.dob); set('pif-ssn', p.ssn);
    set('pif-addr1', p.addr1); set('pif-addr2', p.addr2); set('pif-city', p.city); set('pif-state', p.state); set('pif-zip', p.zip);
    set('pif-phone', p.phone); set('pif-mobile', p.phone2); set('pif-email', p.email);
    var sx = p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : 'Unknown', h = document.getElementById('pif-sex');
    if (h) { h.value = sx; h.parentNode.querySelectorAll('.pcd-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === sx); }); }
  };
  window._showInsuranceForm = function (patId, idx, forceType) {
    css(); if (window.cdcDemoCss) cdcDemoCss();
    var db = getDB(), pat = (db.patients || []).find(function (p) { return p.id === patId; }) || {}, iv = idx !== null && idx !== undefined ? (pat.insurances || [])[idx] || {} : {};
    window._insPatId = patId;
    var hasPri = (pat.insurances || []).some(function (x) { return kindOf(x) === 'primary' && !x.inactive; });
    var type = forceType || iv.insType || iv.type || (hasPri ? 'Secondary' : 'Primary');
    if (['Primary', 'Secondary', 'Tertiary', 'Case Insurance'].indexOf(type) < 0) type = 'Primary';
    var sx = iv.sex || (pat.sex === 'M' ? 'Male' : pat.sex === 'F' ? 'Female' : 'Unknown'), rel = iv.relation || 'Self';
    var payers = (typeof getInsurances === 'function' ? getInsurances() : []) || [];
    var old = document.getElementById('pt-ins-form'); if (old) old.remove();
    var w = document.createElement('div'); w.className = 'overlay'; w.id = 'pt-ins-form';
    var isEdit = idx !== null && idx !== undefined;
    w.innerHTML = '<div class="modal cdc-win">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('shield-check', 17) + (isEdit ? 'Edit insurance' : 'Add insurance') + '</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="cdcInsClose()">' + ico('x', 17) + '</button></div>' +
      '<div style="flex:1;min-height:0;overflow-y:auto;padding:14px 20px;background:#F8FAFC"><div class="pcd" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch">' +
        '<section class="pcd-sec" style="grid-column:span 2"><h4>' + ico('shield-check', 14) + 'Coverage</h4><div class="pcd-g">' +
          SEG('pif-type', 'Type', type, ['Primary', 'Secondary', 'Tertiary', 'Case Insurance'], { req: 1, span: 's4' }) +
          '<div class="pcd-f s2"><label>Payer ID</label><div style="height:34px;display:flex;align-items:center;padding:0 10px;border:1px dashed #D5DCE7;border-radius:9px;font-family:var(--mono,monospace);font-weight:700;color:#0B1526" id="pif-payerid-disp">' + esc(iv.payerId || '•') + '</div></div>' +
          '<div class="pcd-f s4"><label for="pif-payer-sel">Insurance company <span class="rq">*</span></label><select id="pif-payer-sel" onchange="_onInsPayerSelect(this)"><option value="">Select insurance / payer</option>' +
            payers.map(function (x) { var on = iv.name === x.name || (iv.payerId && iv.payerId === x.payerId); return '<option value="' + esc(x.id) + '" data-name="' + esc(x.name || '') + '" data-payerid="' + esc(x.payerId || '') + '"' + (on ? ' selected' : '') + '>' + esc(x.name || '') + '  •  ' + esc(x.payerId || '') + '</option>'; }).join('') + '</select>' +
            '<input type="hidden" id="pif-ins-company" value="' + esc(iv.name || iv.insuranceName || '') + '"><input type="hidden" id="pif-payerid-val" value="' + esc(iv.payerId || '') + '"></div>' +
          F('pif-policy', 'Member / policy ID', iv.policy || iv.memberId, { req: 1, span: 's2', ph: 'Letters and numbers only', max: 30, on: 'oninput="_pifPolicy(this)" autocomplete="off" spellcheck="false"' }) +
          F('pif-group', 'Group #', iv.group, { span: 's2' }) + F('pif-plan-text', 'Plan', iv.plan, { span: 's2' }) +
          '<div class="pcd-f s2"><label>Plan type</label><select id="pif-plan-type">' + ['Medical', 'Dental', 'Vision', 'Other'].map(function (x) { return '<option' + ((iv.planType || 'Medical') === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
          F('pif-eff-from', 'Effective from', toISO(iv.effFrom), { type: 'date', span: 's2' }) + F('pif-eff-to', 'Effective to', toISO(iv.effTo), { type: 'date', span: 's2' }) +
          '<div class="pcd-f s2"><label>Accept assignment</label><select id="pif-accept-assign"><option' + ((iv.acceptAssign || 'Accepted') === 'Accepted' ? ' selected' : '') + '>Accepted</option><option' + (iv.acceptAssign === 'Not Accepted' ? ' selected' : '') + '>Not Accepted</option></select></div>' +
          F('pif-ins-phone', 'Insurance phone', iv.insPhone, { type: 'tel', span: 's2', on: 'oninput="_pcdPhone&&_pcdPhone(this)"' }) +
          '<div class="pcd-f s2" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:8px;height:34px;font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#0B1526;cursor:pointer;margin:0"><input type="checkbox" id="pif-preauth"' + (iv.preAuth ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:#FF6A3D"> Pre-authorization required</label></div>' +
        '</div></section>' +
        '<section class="pcd-sec"><h4>' + ico('wallet', 14) + 'Patient cost</h4><div class="pcd-g">' +
          F('pif-copay', 'Copay $', iv.copay, { span: 's3', type: 'number' }) + F('pif-deductible', 'Deductible $', iv.deductible, { span: 's3', type: 'number' }) +
          F('pif-coins', 'Coinsurance %', iv.coins, { span: 's3', type: 'number' }) +
          '<div class="pcd-f s6" style="font-size:11.5px;color:#8C98AB;line-height:1.5;margin-top:4px">Run eligibility after saving to confirm coverage and benefits with the payer.</div>' +
        '</div></section>' +
        '<section class="pcd-sec" style="grid-column:span 2"><h4>' + ico('user', 14) + 'Subscriber (insured)</h4><div class="pcd-g">' +
          SEG('pif-relation', 'Relation to ' + term().toLowerCase(), rel, ['Self', 'Spouse', 'Child', 'Parent', 'Other'], { req: 1, span: 's4' }) +
          SEG('pif-sex', 'Sex', sx, ['Male', 'Female', 'Unknown'], { req: 1, span: 's2' }) +
          F('pif-lname', 'Last name', iv.lname || pat.last, { req: 1, span: 's2' }) + F('pif-fname', 'First name', iv.fname || pat.first, { req: 1, span: 's2' }) + F('pif-mid', 'Middle', iv.mid || pat.mid) +
          F('pif-dob', 'Date of birth', toISO(iv.dob || pat.dob), { req: 1, type: 'date' }) +
          F('pif-ssn', 'SSN', iv.ssn || pat.ssn, { span: 's2', max: 11 }) + F('pif-employer', 'Employer', iv.employer, { span: 's4' }) +
        '</div></section>' +
        '<section class="pcd-sec"><h4>' + ico('map-pin', 14) + 'Subscriber address &amp; contact</h4><div class="pcd-g">' +
          F('pif-addr1', 'Address 1', iv.addr1 || pat.addr1, { req: 1, span: 's6' }) + F('pif-addr2', 'Apt / suite', iv.addr2 || pat.addr2, { span: 's2' }) +
          F('pif-zip', 'ZIP', iv.zip || pat.zip, { req: 1, span: 's2', on: 'oninput="cdcInsZip(this)"', max: 10 }) + F('pif-state', 'State', iv.state || pat.state, { req: 1, span: 's2', max: 2 }) +
          F('pif-city', 'City', iv.city || pat.city, { req: 1, span: 's6' }) +
          F('pif-phone', 'Phone', iv.phone || pat.phone, { req: 1, span: 's3', type: 'tel', on: 'oninput="_pcdPhone&&_pcdPhone(this)"' }) + F('pif-mobile', 'Mobile', iv.mobile || pat.phone2, { span: 's3', type: 'tel', on: 'oninput="_pcdPhone&&_pcdPhone(this)"' }) +
          F('pif-email', 'Email', iv.email || pat.email, { span: 's4', type: 'email' }) + F('pif-fax', 'Fax', iv.fax, { span: 's2' }) +
        '</div></section>' +
      '</div></div>' +
      '<div class="cdc-ftr"><span class="sum pcd-msg" id="pif-msg"></span>' +
        '<button type="button" class="cdc-no" onclick="cdcInsClose()">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-alt" onclick="_saveInsuranceFormAndAdd(\'' + esc(patId) + '\',' + (isEdit ? idx : 'null') + ')">' + ico('copy-plus', 15) + 'Save &amp; add another</button>' +
        '<button type="button" class="cdc-ok" onclick="_saveInsuranceForm(\'' + esc(patId) + '\',' + (isEdit ? idx : 'null') + ')">' + ico('save', 15) + 'Save</button></div>' +
    '</div>';
    document.body.appendChild(w);
    openModal('pt-ins-form');
    icons();
  };
  window.cdcInsClose = function () { var w = document.getElementById('pt-ins-form'); if (w) { closeModal('pt-ins-form'); w.remove(); } };
  window.cdcInsZip = function (el) {
    var z = el.value.replace(/[^\d-]/g, ''); el.value = z; z = z.slice(0, 5);
    if (!/^\d{5}$/.test(z) || el.dataset.last === z) return; el.dataset.last = z;
    fetch('https://api.zippopotam.us/us/' + z).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      var p = j.places && j.places[0]; if (!p) return;
      var c = document.getElementById('pif-city'), s = document.getElementById('pif-state');
      if (c) c.value = String(p['place name']).toUpperCase(); if (s) s.value = p['state abbreviation'];
    }).catch(function () {});
  };
  // policy / member ID: only letters and numbers; anything else is removed as it is typed or pasted
  window._pifPolicy = function (el) {
    var raw = el.value, clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (raw !== clean) {
      var pos = el.selectionStart - (raw.length - clean.length);
      el.value = clean;
      try { el.setSelectionRange(Math.max(0, pos), Math.max(0, pos)); } catch (e) {}
      if (/[^A-Za-z0-9]/.test(raw)) { var m = document.getElementById('pif-msg'); if (m) { m.textContent = 'Spaces, dashes and symbols are not allowed in the policy ID; they were removed'; m.className = 'sum pcd-msg err'; } }
    }
  };
  function fail(id, text) { var m = document.getElementById('pif-msg'); if (m) { m.textContent = text; m.className = 'sum pcd-msg err'; } var e = document.getElementById(id); if (e) { e.classList.add('bad'); e.focus(); } return false; }
  window._saveInsuranceForm = function (patId, idx, goNext) {
    document.querySelectorAll('#pt-ins-form .bad').forEach(function (e) { e.classList.remove('bad'); });
    var company = g('pif-ins-company');
    if (!company) return fail('pif-payer-sel', 'Insurance company is required');
    var policy = g('pif-policy').toUpperCase();
    if (!policy) return fail('pif-policy', 'Member / policy ID is required');
    if (!/^[A-Z0-9]+$/.test(policy)) return fail('pif-policy', 'Member / policy ID: letters and numbers only, no spaces, dashes or symbols');
    var need = [['pif-lname', 'Subscriber last name'], ['pif-fname', 'Subscriber first name'], ['pif-dob', 'Subscriber date of birth'], ['pif-addr1', 'Address 1'], ['pif-zip', 'ZIP'], ['pif-city', 'City'], ['pif-state', 'State'], ['pif-phone', 'Phone']];
    for (var i = 0; i < need.length; i++) if (!g(need[i][0])) return fail(need[i][0], need[i][1] + ' is required');
    if (g('pif-eff-to') && g('pif-eff-from') && g('pif-eff-to') < g('pif-eff-from')) return fail('pif-eff-to', 'Effective to cannot be before effective from');
    var type = g('pif-type') || 'Primary', s = (typeof getSession === 'function' && getSession()) || {};
    var entry = {
      insType: type, type: type, planType: g('pif-plan-type') || 'Medical', relation: g('pif-relation') || 'Self',
      lname: g('pif-lname'), fname: g('pif-fname'), mid: g('pif-mid'), sex: g('pif-sex') || 'Unknown', dob: g('pif-dob'), ssn: g('pif-ssn'),
      name: company, insuranceName: company, payerId: g('pif-payerid-val'), policy: policy, memberId: policy, group: g('pif-group'), plan: g('pif-plan-text'),
      copay: g('pif-copay'), deductible: g('pif-deductible'), coins: g('pif-coins'), insPhone: g('pif-ins-phone'),
      addr1: g('pif-addr1'), addr2: g('pif-addr2'), city: g('pif-city'), state: g('pif-state').toUpperCase(), zip: g('pif-zip'),
      email: g('pif-email').toLowerCase(), phone: g('pif-phone'), mobile: g('pif-mobile'), fax: g('pif-fax'), employer: g('pif-employer'),
      acceptAssign: g('pif-accept-assign') || 'Accepted', effFrom: g('pif-eff-from'), effTo: g('pif-eff-to'),
      preAuth: !!(document.getElementById('pif-preauth') || {}).checked, subscriberName: (g('pif-lname') + ', ' + g('pif-fname')).trim(), inactive: false
    };
    var isNew = idx === null || idx === undefined || idx < 0;
    setDB(function (d) {
      var p = (d.patients || []).find(function (x) { return x.id === patId; }); if (!p) return;
      p.insurances = p.insurances || [];
      // a new plan of a type replaces (deactivates) the active plan of that same type
      if (isNew && type !== 'Case Insurance') p.insurances.forEach(function (x) { if (kindOf(x) === kindOf(entry) && !x.inactive) { x.inactive = true; x.status = 'inactive'; x.inactivatedAt = new Date().toISOString(); } });
      if (isNew) p.insurances.push(Object.assign(entry, { createdBy: s.name || s.email || '', createdOn: new Date().toLocaleDateString('en-US') }));
      else p.insurances[idx] = Object.assign({}, p.insurances[idx], entry);
      if (type === 'Primary') Object.assign(p, { payerName: company, payerid: entry.payerId, subNum: policy, groupNum: entry.group, copay: entry.copay, deductible: entry.deductible, coins: entry.coins, relation: entry.relation, acceptAssign: entry.acceptAssign, effFrom: entry.effFrom, insStatus: 'Not Verified', selfPay: false });
    });
    cdcInsClose();
    try { toast('Insurance saved'); } catch (e) {}
    try { _refreshChartBanner(patId); } catch (e) {}
    _renderChartTab(goNext ? 'auth' : 'insurance');
    return true;
  };
  window._saveInsuranceFormAndAdd = function (patId, idx) { if (_saveInsuranceForm(patId, idx)) setTimeout(function () { cdcInsNew(patId); }, 60); };

  /* ---------------- Eligibility (ClaimMD 270/271) ---------------- */
  var STC = [['30', 'Health benefit plan coverage'], ['98', 'Professional (physician) office visit'], ['MH', 'Mental health'], ['A6', 'Psychotherapy'], ['AI', 'Substance abuse'], ['33', 'Chiropractic'], ['PT', 'Physical therapy'], ['1', 'Medical care']];
  // every check is kept on the plan (newest first) as proof of coverage on the date of service
  function history(iv) {
    var h = (iv.eligHistory || []).slice();
    if (!h.length && iv.elig && iv.elig.checkedAt) h.push(iv.elig);
    return h.sort(function (x, y) { return (y.checkedAt || 0) - (x.checkedAt || 0); });
  }
  var EL = { pat: null, idx: 0, sel: 0 };
  var STL = { active: 'Active', inactive: 'Inactive', error: 'Check failed', none: 'Not confirmed' };
  function histHTML(h) {
    if (!h.length) return '<div class="elx-none">No checks yet. Each check is saved here with the payer\'s answer.</div>';
    return h.map(function (r, i) {
      var st = (r.result && r.result.status) || r.status || 'none';
      return '<button type="button" class="elx-hi' + (i === EL.sel ? ' on' : '') + '" onclick="cdcEligShow(' + i + ')">' +
        '<span class="elx-dot ' + st + '"></span><span class="tx"><b>' + esc(STL[st] || 'Not confirmed') + ' • DOS ' + esc(us(r.dos)) + '</b>' +
        '<small>' + esc(new Date(r.checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) + (r.by ? ' • ' + esc(r.by) : '') + '</small></span>' +
        '<span class="pdf" data-tip="Download PDF" role="button" onclick="event.stopPropagation();cdcEligPDF(' + i + ')">' + ico('file-down', 15) + '</span></button>';
    }).join('');
  }
  window.cdcEligOpen = function (patId, idx) {
    css();
    var db = getDB(), pat = (db.patients || []).find(function (p) { return p.id === patId; }) || {}, iv = (pat.insurances || [])[idx] || {};
    var prov = (db.providers || []).find(function (p) { return p.id === pat.providerId; }) || {};
    EL = { pat: patId, idx: idx, sel: 0 };
    var old = document.getElementById('modal-elig'); if (old) old.remove();
    var w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-elig';
    var kv = function (l, v) { return '<dt>' + l + '</dt><dd>' + esc(v || '•') + '</dd>'; };
    var h = history(iv);
    w.innerHTML = '<div class="modal cdc-win">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('shield-question', 17) + 'Eligibility • ' + esc(iv.name || '') + '</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="cdcEligClose()">' + ico('x', 17) + '</button></div>' +
      '<div class="elx">' +
        '<aside class="elx-side">' +
          '<section class="elx-card"><h5>' + ico('user', 13) + 'Request</h5><dl class="elx-dl">' +
            kv('Subscriber', (iv.lname || pat.last || '') + ', ' + (iv.fname || pat.first || '')) + kv('Member ID', iv.policy || iv.memberId) +
            kv('Payer', (iv.name || '') + (iv.payerId ? ' • ' + iv.payerId : '')) + kv('Relation', iv.relation || 'Self') +
            kv('Provider', prov.name) + kv('NPI', prov.npi) + '</dl>' +
            '<div class="elx-in"><label for="elg-dos">Date of service</label><input type="date" id="elg-dos" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
            '<div class="elx-in"><label for="elg-stc">Service type</label><select id="elg-stc">' + STC.map(function (x) { return '<option value="' + x[0] + '">' + x[0] + ' • ' + x[1] + '</option>'; }).join('') + '</select></div>' +
          '</section>' +
          '<section class="elx-card grow"><h5>' + ico('history', 13) + 'History <span class="n" id="elg-hn">' + h.length + '</span></h5><div class="elx-hist" id="elg-hist">' + histHTML(h) + '</div></section>' +
        '</aside>' +
        '<div class="elx-main" id="elg-res">' + (h.length ? resultHTML(h[0]) : '<div class="elx-empty">' + ico('shield-question', 36) + '<b>No eligibility check yet</b>Run the check to ask the payer, in real time, if this plan is active on the date of service and what it covers. Every answer is saved in the history and can be downloaded as PDF.</div>') + '</div>' +
      '</div>' +
      '<div class="cdc-ftr"><span class="sum" id="elg-msg">Real-time check through ClaimMD with this provider\'s Account Key.</span>' +
        '<button type="button" class="cdc-no" onclick="cdcEligClose()">' + ico('x', 15) + 'Close</button>' +
        '<button type="button" class="cdc-alt" id="elg-pdf" onclick="cdcEligPDF(EL_SEL())"' + (h.length ? '' : ' disabled') + '>' + ico('file-down', 15) + 'PDF</button>' +
        '<button type="button" class="cdc-ok" id="elg-run" onclick="cdcEligRun(\'' + esc(patId) + '\',' + idx + ')">' + ico('refresh-cw', 15) + 'Run eligibility</button></div>' +
    '</div>';
    document.body.appendChild(w);
    openModal('modal-elig'); icons();
  };
  window.EL_SEL = function () { return EL.sel; };
  function curPlan() { var p = (getDB().patients || []).find(function (x) { return x.id === EL.pat; }) || {}; return { pat: p, iv: (p.insurances || [])[EL.idx] || {} }; }
  window.cdcEligShow = function (i) {
    var c = curPlan(), h = history(c.iv); if (!h[i]) return;
    EL.sel = i;
    var res = document.getElementById('elg-res'); if (res) res.innerHTML = resultHTML(h[i]);
    var hl = document.getElementById('elg-hist'); if (hl) hl.innerHTML = histHTML(h);
    icons();
  };
  window.cdcEligClose = function () { var w = document.getElementById('modal-elig'); if (w) { closeModal('modal-elig'); w.remove(); } };
  function ymd(d) { return String(d || '').replace(/-/g, ''); }
  function arr(x) { return Array.isArray(x) ? x : x ? [x] : []; }
  // the 271 answer, whatever its exact shape, reduced to status, plan and a list of benefits
  function digest(resp) {
    var root = resp && (resp.elig || resp.result || resp.eligibility || resp) || {};
    var err = resp && (resp.error || root.error);
    if (err) return { status: 'error', message: typeof err === 'string' ? err : (err.error_mesg || err.message || JSON.stringify(err)).slice(0, 300) };
    var ben = arr(root.benefit || root.benefits);
    var txt = function (b) { return [b.benefit_description, b.benefit_coverage_description, b.benefit_code_description].filter(Boolean).join(' '); };
    var active = ben.some(function (b) { return String(b.benefit_code) === '1' || /active coverage/i.test(txt(b)); });
    var inactive = ben.some(function (b) { return /^(6|7|8)$/.test(String(b.benefit_code)) || /inactive/i.test(txt(b)); });
    var plan = root.plan_name || root.group_name || root.ins_plan || (ben.find(function (b) { return b.plan_coverage_description || b.insurance_plan_description; }) || {}).plan_coverage_description || '';
    var amt = function (re) { var b = ben.find(function (x) { return re.test(txt(x)) && (x.benefit_amount || x.benefit_percent); }); return b ? (b.benefit_amount ? '$' + b.benefit_amount : Math.round(parseFloat(b.benefit_percent) * 100) + '%') : ''; };
    return {
      status: active && !inactive ? 'active' : inactive && !active ? 'inactive' : active ? 'active' : 'none',
      plan: plan, group: root.group_number || root.ins_group || '', from: root.plan_begin_date || root.elig_begin || '', to: root.plan_end_date || root.elig_end || '',
      copay: amt(/co-?payment|copay/i), deductible: amt(/deductible/i), coins: amt(/co-?insurance/i),
      benefits: ben.slice(0, 200).map(function (b) { return { svc: b.benefit_coverage_description || b.service_type_description || b.benefit_code_description || '', type: b.benefit_description || b.benefit_code || '', level: b.benefit_level_description || b.coverage_level || '', amount: b.benefit_amount ? '$' + b.benefit_amount : b.benefit_percent ? Math.round(parseFloat(b.benefit_percent) * 100) + '%' : '', period: b.benefit_period_description || b.time_period || '', net: b.inplan_network || b.network || '', note: [b.benefit_notes, b.message].filter(Boolean).join(' ').slice(0, 160) }; }),
      message: root.message || '', trace: root.trace_number || root.trn || root.eligid || ''
    };
  }
  function resultHTML(e) {
    var r = e.result || {}, st = r.status || 'none';
    var head = '<div class="elx-hero ' + st + '"><span class="ic">' + ico(st === 'active' ? 'shield-check' : st === 'error' ? 'alert-triangle' : st === 'inactive' ? 'shield-off' : 'shield-question', 26) + '</span>' +
      '<div><small>Coverage on ' + esc(us(e.dos)) + '</small><b>' + esc(STL[st] || 'Not confirmed') + '</b><span>Checked ' + esc(new Date(e.checkedAt).toLocaleString('en-US')) + (e.by ? ' by ' + esc(e.by) : '') + (r.trace ? ' • Trace ' + esc(r.trace) : '') + ' • ID ' + esc(e.vid || ('EV' + new Date(e.checkedAt).toISOString().slice(0, 10).replace(/-/g, '') + '-' + Number(e.checkedAt || 0).toString(36).toUpperCase().slice(-6))) + '</span></div></div>';
    if (st === 'error') return head + '<div class="elx-err">' + esc(r.message || 'The payer did not answer.') + '</div>';
    var card = function (l, v) { return '<div><small>' + l + '</small><b>' + esc(v || '•') + '</b></div>'; };
    return head +
      '<div class="elx-kv">' + card('Plan', r.plan) + card('Group', r.group) + card('Plan dates', [us(r.from), us(r.to)].filter(Boolean).join(' to ')) + card('Copay', r.copay) + card('Deductible', r.deductible) + card('Coinsurance', r.coins) + '</div>' +
      '<div class="elx-tw"><table class="elx-tbl"><thead><tr><th>Service</th><th>Benefit</th><th>Level</th><th>Amount</th><th>Period</th><th>Network</th><th>Notes</th></tr></thead><tbody>' +
      ((r.benefits || []).length ? r.benefits.map(function (b) { return '<tr><td>' + esc(b.svc) + '</td><td>' + esc(b.type) + '</td><td>' + esc(b.level) + '</td><td>' + esc(b.amount) + '</td><td>' + esc(b.period) + '</td><td>' + esc(b.net) + '</td><td class="nt">' + esc(b.note) + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="nt">The payer did not return benefit details.</td></tr>') +
      '</tbody></table></div>' +
      (e.raw ? '<details class="elx-raw"><summary>Payer response (technical)</summary><pre>' + esc(e.raw) + '</pre></details>' : '');
  }
  // printable proof of the eligibility answer (same document style as the invoice, black and greys)
  window.cdcEligPDF = async function (i) {
    var cp = curPlan(), h = history(cp.iv), e = h[i]; if (!e) return;
    try {
      if (typeof cdcEligPDFDoc !== 'function' && typeof cdcLoadPatientPdf === 'function') await cdcLoadPatientPdf();
      await cdcEligPDFDoc(EL.pat, EL.idx, e);
    } catch (x) { var m = document.getElementById('elg-msg'); if (m) m.textContent = 'The PDF could not be created: ' + (x && x.message || x); }
  };
  window.cdcEligRun = async function (patId, idx) {
    var chk = null; try { chk = _requireCHKey('Check eligibility'); } catch (e) {}
    if (!chk) return;
    var db = getDB(), pat = (db.patients || []).find(function (p) { return p.id === patId; }) || {}, iv = (pat.insurances || [])[idx] || {};
    var prov = (db.providers || []).find(function (p) { return p.id === pat.providerId; }) || {};
    var btn = document.getElementById('elg-run'), msg = document.getElementById('elg-msg');
    if (!iv.payerId) { if (msg) msg.textContent = 'This plan has no payer ID. Edit the insurance and choose the company from the list.'; return; }
    if (btn) btn.disabled = true; if (msg) msg.textContent = 'Asking the payer...';
    var rel = { Self: '18', Spouse: '01', Child: '19', Parent: '32', Other: 'G8' }[iv.relation || 'Self'] || '18';
    var params = {
      AccountKey: chk.acctKey, payerid: iv.payerId, ins_number: iv.policy || iv.memberId || '',
      ins_name_l: iv.lname || pat.last || '', ins_name_f: iv.fname || pat.first || '', ins_dob: ymd(iv.dob || pat.dob), ins_sex: (iv.sex || 'U').charAt(0),
      pat_rel: rel, fdos: ymd(g('elg-dos')), service_code: g('elg-stc') || '30',
      prov_npi: prov.npi || '', prov_taxid: String(prov.taxid || '').replace(/\D/g, ''), prov_name_l: prov.name || ''
    };
    if (rel !== '18') { params.pat_name_l = pat.last || ''; params.pat_name_f = pat.first || ''; params.pat_dob = ymd(pat.dob); params.pat_sex = (pat.sex || 'U').charAt(0); }
    var resp = null, raw = '';
    try {
      var body = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
      var r = await fetch(ELIG_URL + '/eligdata', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body });
      raw = await r.text();
      try { resp = JSON.parse(raw); } catch (e) { resp = { error: 'Unexpected answer from the eligibility service' }; }
    } catch (e) { resp = { error: 'The eligibility service is not reachable (claimmd-elig worker)' }; }
    var result = digest(resp), sess = null; try { sess = getSession(); } catch (e) {}
    result.benefits = (result.benefits || []).slice(0, 80);
    var now = Date.now();
    var rec = { checkedAt: now, vid: 'EV' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '') + '-' + now.toString(36).toUpperCase().slice(-6), status: result.status, dos: g('elg-dos'), stc: params.service_code, by: sess ? (sess.name || sess.email || '') : '',
      subscriber: params.ins_name_l + ', ' + params.ins_name_f, member: params.ins_number, payer: iv.name || '', payerId: iv.payerId || '', provider: prov.name || '', npi: prov.npi || '',
      result: result, raw: raw.slice(0, 6000) };
    setDB(function (d) {
      var p = (d.patients || []).find(function (x) { return x.id === patId; }); if (!p || !p.insurances || !p.insurances[idx]) return;
      var ins = p.insurances[idx];
      var h = (ins.eligHistory || []).slice(); if (!h.length && ins.elig && ins.elig.checkedAt) h.push(ins.elig);
      h.unshift(rec); ins.eligHistory = h.slice(0, 40);   // the last 40 checks of this plan
      ins.elig = rec;
      if (kindOf(p.insurances[idx]) === 'primary') p.insStatus = result.status === 'active' ? 'Verified' : result.status === 'inactive' ? 'Inactive' : 'Not Verified';
    });
    EL.sel = 0;
    var res = document.getElementById('elg-res'); if (res) res.innerHTML = resultHTML(rec);
    var c2 = curPlan(), h2 = history(c2.iv), hl = document.getElementById('elg-hist'); if (hl) hl.innerHTML = histHTML(h2);
    var hn = document.getElementById('elg-hn'); if (hn) hn.textContent = h2.length;
    var pb = document.getElementById('elg-pdf'); if (pb) pb.disabled = false;
    if (msg) msg.textContent = 'Saved in the history • ' + new Date(rec.checkedAt).toLocaleString('en-US');
    if (btn) btn.disabled = false;
    icons();
    try { if (_chartTabActive === 'insurance') _renderChartTab('insurance'); } catch (e) {}
  };
})();
