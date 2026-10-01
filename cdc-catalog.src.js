/*
 * ClaimDataCare  •  Service catalog (CPT and HCPCS) with Medicare / Medicaid fee schedules
 * File: cdc-catalog.js  •  v1.0
 *
 * Replaces the old "Add from catalog" box of the service group editor (openSGCatalog,
 * closeSGCatalog, renderSGCatalog, toggleSGCatalogSvc and its markup were removed from script1.js).
 *   • Standard-size window, search, type and source filters, paged table
 *   • Fee schedules imported once a year from the Medicare and Medicaid files (CSV or Excel):
 *     codes, descriptions and fees are stored in the shared catalog (db.services), per source and year
 *   • Each billing provider chooses its price: Medicare or Medicaid fee x 100, 120, 150, 200 % (or custom)
 *   • Codes without an imported fee keep their own manual rate
 */
(function () {
  'use strict';
  var C = { page: 0, size: 10, sel: null, stage: null }, ROW = 40;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return '<i data-lucide="' + n + '" class="lci" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px"></i>'; }
  function icons() { try { setTimeout(_renderLucideIcons, 20); } catch (e) {} }
  function money(n) { return n == null || isNaN(n) ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function g(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function typeOf(code) { var c = String(code || '').toUpperCase(); return /^[A-V]\d{4}$/.test(c) ? 'HCPCS' : /^\d{4}[0-9A-Z]$/.test(c) ? 'CPT' : 'Other'; }
  function prov() { return (getDB().providers || []).find(function (p) { return p.id === activeProviderId; }) || {}; }
  function pricing() { var p = prov().feePricing || {}; return { basis: p.basis || 'medicare', pct: parseFloat(p.pct) || 100 }; }
  function feeOf(s, src) { var f = s.fees && s.fees[src]; return f && f.fee != null ? parseFloat(f.fee) : null; }
  // the price this provider bills for a code
  window.cdcServicePrice = function (s) {
    var pr = pricing(), base = feeOf(s, pr.basis);
    if (base == null) base = feeOf(s, pr.basis === 'medicare' ? 'medicaid' : 'medicare');
    if (base != null) return Math.round(base * pr.pct) / 100;
    return parseFloat(s.rate) || 0;
  };

  var CSS = [
    '.ctl-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:14px 20px}',
    '.ctl-flt{flex:none;display:grid;grid-template-columns:minmax(0,2fr) 120px 140px minmax(0,1.6fr);gap:10px;align-items:end}',
    '.ctl-price{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:1px solid #E4E9F1;border-radius:10px;background:#F8FAFC;font-size:12px;color:#3A475C;white-space:nowrap}',
    '.ctl-price select{height:26px!important;padding:0 6px!important;font-size:12px!important;border-radius:7px!important;width:auto!important}',
    '.ctl-price input{width:58px!important;height:26px!important;padding:0 6px!important;font-size:12px!important;border-radius:7px!important}',
    '.ctl-bar{flex:none;height:40px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF1F6;font-size:12px;color:#586579;white-space:nowrap;overflow:hidden}',
    '.ctl-bar b{color:#0B1526}',
    '.ctl-bar .warn{color:#C8286A;font-weight:700}',
    '.ctl-list{flex:1;min-height:0;overflow:hidden;border:1px solid #EEF1F6;border-radius:14px;background:#fff}',
    '.ctl-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px}',
    '.ctl-tbl th{height:36px;padding:0 10px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;background:#F8FAFC;border-bottom:1px solid #EEF1F6;white-space:nowrap}',
    '.ctl-tbl th.n,.ctl-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}',
    '.ctl-tbl td{height:' + ROW + 'px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid #F1F4F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}',
    '.ctl-tbl tbody tr{cursor:pointer;transition:background-color .12s}',
    '.ctl-tbl tbody tr:hover{background:#F8FAFC}',
    '.ctl-tbl tbody tr.on{background:rgba(255,106,61,.07)}',
    '.ctl-tbl tbody tr.in{cursor:default;color:#8C98AB}',
    '.ctl-tbl input[type=checkbox]{width:16px;height:16px;margin:0;accent-color:#FF6A3D;pointer-events:none}',
    '.ctl-code{font-family:var(--mono,monospace);font-weight:700;color:#0B1526}',
    '.ctl-ty{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700}',
    '.ctl-ty.CPT{background:rgba(0,163,209,.1);color:#007FA3}.ctl-ty.HCPCS{background:rgba(106,27,219,.08);color:#5B17C2}.ctl-ty.Other{background:#EEF1F6;color:#586579}',
    '.ctl-in{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(0,163,209,.1);color:#007FA3}',
    '.ctl-yp{font-weight:700;color:#0B1526}',
    '.ctl-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#586579;font-size:13px;text-align:center;padding:20px}',
    '.ctl-empty b{font-size:15px;color:#0B1526}',
    '.ctl-pg{display:flex;align-items:center;gap:6px;margin-left:auto}',
    '.ctl-pg span{font-size:11.5px;color:#586579;font-variant-numeric:tabular-nums;min-width:120px;text-align:right}',
    '.ctl-pg button{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:12px;font-weight:600}',
    '.ctl-pg button.on{background:#FF6A3D;border-color:#FF6A3D;color:#fff;cursor:default}',
    '.ctl-pg button[disabled]{opacity:.35;cursor:default}',
    /* import window */
    '.fsi{width:92vw!important;max-width:820px!important;height:min(560px,90vh)!important;display:flex!important;flex-direction:column;border-radius:18px!important;padding:0!important;overflow:hidden}',
    '.fsi-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:16px 20px}',
    '.fsi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
    '.fsi-drop{display:flex;align-items:center;gap:12px;padding:14px;border:1.5px dashed #D5DCE7;border-radius:12px;background:#F8FAFC;cursor:pointer;font-size:12.5px;color:#3A475C;transition:border-color .15s,background-color .15s}',
    '.fsi-drop:hover{border-color:rgba(255,106,61,.5);background:rgba(255,106,61,.04)}',
    '.fsi-st{min-height:66px;padding:10px 12px;border-radius:12px;border:1px solid #EEF1F6;font-size:12.5px;line-height:1.55;color:#3A475C;background:#fff}',
    '.fsi-st b{color:#0B1526}',
    '.fsi-hint{font-size:11.5px;line-height:1.5;color:#586579}',
    '@media (max-width:900px){.ctl-flt,.fsi-grid{grid-template-columns:1fr 1fr}}'
  ].join('\n');
  function css() { if (document.getElementById('ctl-style')) return; var st = document.createElement('style'); st.id = 'ctl-style'; st.textContent = CSS; document.head.appendChild(st); }

  function ensureWin() {
    css();
    if (document.getElementById('modal-sg-catalog')) return;
    var w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-sg-catalog';
    w.innerHTML = '<div class="modal cdc-win">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('book-open', 17) + 'Service catalog</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeSGCatalog()">' + ico('x', 17) + '</button></div>' +
      '<div class="ctl-body">' +
        '<div class="ctl-flt">' +
          '<div class="sgx-f"><label>Search</label><input id="sgcat-q" class="no-upper" placeholder="Code or description" oninput="_ctlFilter()"></div>' +
          '<div class="sgx-f"><label>Type</label><select id="sgcat-type" onchange="_ctlFilter()"><option value="">All</option><option>CPT</option><option>HCPCS</option></select></div>' +
          '<div class="sgx-f"><label>Source</label><select id="sgcat-src" onchange="_ctlFilter()"><option value="">All</option><option value="medicare">Medicare</option><option value="medicaid">Medicaid</option><option value="custom">Custom rate</option></select></div>' +
          '<div class="sgx-f"><label>This provider\'s price</label><div class="ctl-price">' +
            '<select id="sgcat-basis" onchange="_ctlSavePricing()"><option value="medicare">Medicare fee</option><option value="medicaid">Medicaid fee</option></select> x ' +
            '<select id="sgcat-pct" onchange="_ctlPct()"><option value="100">100%</option><option value="120">120%</option><option value="150">150%</option><option value="200">200%</option><option value="custom">Custom</option></select>' +
            '<input id="sgcat-pct-c" type="number" min="1" step="1" style="display:none" onchange="_ctlSavePricing()" placeholder="%"></div></div>' +
        '</div>' +
        '<div class="ctl-bar"><span id="sgcat-info"></span><span style="flex:1"></span>' +
          '<button type="button" class="cdc-alt" style="height:30px;min-width:0" onclick="openFeeImport()">' + ico('upload', 14) + 'Import fee schedule</button>' +
          '<div class="ctl-pg" id="sgcat-pg"></div></div>' +
        '<div class="ctl-list" id="sgcat-list"></div>' +
      '</div>' +
      '<div class="cdc-ftr"><span class="sum" id="sgcat-sum"></span>' +
        '<button type="button" class="cdc-no" onclick="closeSGCatalog()">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-ok" id="sgcat-add" onclick="_ctlAdd()">' + ico('plus', 15) + 'Add selected</button></div>' +
    '</div>';
    document.body.appendChild(w);
  }

  window.openSGCatalog = function () {
    ensureWin(); C.sel = new Set(); C.page = 0;
    ['sgcat-q', 'sgcat-type', 'sgcat-src'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
    var pr = pricing(), b = document.getElementById('sgcat-basis'), p = document.getElementById('sgcat-pct'), c = document.getElementById('sgcat-pct-c');
    if (b) b.value = pr.basis;
    var std = [100, 120, 150, 200].indexOf(pr.pct) >= 0;
    if (p) p.value = std ? String(pr.pct) : 'custom';
    if (c) { c.style.display = std ? 'none' : ''; c.value = std ? '' : pr.pct; }
    openModal('modal-sg-catalog');
    setTimeout(function () { renderSGCatalog(); var q = document.getElementById('sgcat-q'); if (q) q.focus(); icons(); }, 30);
  };
  window.closeSGCatalog = function () { closeModal('modal-sg-catalog'); try { renderSGLines(); } catch (e) {} };
  window._ctlFilter = function () { C.page = 0; renderSGCatalog(); };
  window._ctlPct = function () {
    var v = g('sgcat-pct'), c = document.getElementById('sgcat-pct-c');
    if (c) c.style.display = v === 'custom' ? '' : 'none';
    if (v === 'custom') { if (c) c.focus(); return; }
    _ctlSavePricing();
  };
  window._ctlSavePricing = function () {
    var basis = g('sgcat-basis') || 'medicare', v = g('sgcat-pct'), pct = v === 'custom' ? parseFloat(g('sgcat-pct-c')) : parseFloat(v);
    if (!(pct > 0)) return;
    setDB(function (d) { var p = (d.providers || []).find(function (x) { return x.id === activeProviderId; }); if (p) p.feePricing = { basis: basis, pct: pct }; });
    renderSGCatalog();
  };

  function list() {
    var q = g('sgcat-q').toLowerCase(), ty = g('sgcat-type'), src = g('sgcat-src');
    var arr = (getDB().services || []).filter(function (s) { return s && s.code; });
    if (ty) arr = arr.filter(function (s) { return (s.category === 'CPT' || s.category === 'HCPCS' ? s.category : typeOf(s.code)) === ty; });
    if (src === 'custom') arr = arr.filter(function (s) { return feeOf(s, 'medicare') == null && feeOf(s, 'medicaid') == null; });
    else if (src) arr = arr.filter(function (s) { return feeOf(s, src) != null; });
    if (q) arr = arr.filter(function (s) { return (String(s.code) + ' ' + String(s.desc || '')).toLowerCase().indexOf(q) >= 0; });
    arr.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); });
    return arr;
  }
  function infoLine() {
    var m = (getDB().settings || {}).feeSchedules || {}, y = new Date().getFullYear(), out = [];
    ['medicare', 'medicaid'].forEach(function (k) {
      var f = m[k], nm = k === 'medicare' ? 'Medicare' : 'Medicaid';
      if (!f) out.push(nm + ': <span class="warn">not imported</span>');
      else out.push(nm + ' <b>' + esc(f.year) + '</b> (' + Number(f.count || 0).toLocaleString() + ' codes)' + (Number(f.year) < y ? ' <span class="warn">• import ' + y + '</span>' : ''));
    });
    return out.join('  •  ');
  }

  window.renderSGCatalog = function () {
    var el = document.getElementById('sgcat-list'); if (!el) return;
    if (!C.sel) C.sel = new Set();
    var arr = list(), inGroup = {};
    ((typeof _sgForm !== 'undefined' && _sgForm && _sgForm.lines) || []).forEach(function (l) { inGroup[String(l.cpt || '').toUpperCase()] = 1; });
    C.size = Math.max(5, Math.floor(((el.clientHeight || 460) - 38) / ROW));
    var pages = Math.max(1, Math.ceil(arr.length / C.size)); if (C.page >= pages) C.page = pages - 1;
    var view = arr.slice(C.page * C.size, (C.page + 1) * C.size);
    var info = document.getElementById('sgcat-info'); if (info) info.innerHTML = infoLine();
    var a = arr.length ? C.page * C.size + 1 : 0, b = Math.min(arr.length, (C.page + 1) * C.size);
    var pg = document.getElementById('sgcat-pg');
    if (pg) pg.innerHTML = '<span>' + a.toLocaleString() + '\u2013' + b.toLocaleString() + ' of ' + arr.length.toLocaleString() + '</span>' +
      '<button type="button" aria-label="Previous page"' + (C.page <= 0 ? ' disabled' : ' onclick="_ctlPage(' + (C.page - 1) + ')"') + '>' + ico('chevron-left', 14) + '</button>' +
      '<button type="button" class="on">' + (C.page + 1) + '</button>' +
      '<button type="button" aria-label="Next page"' + (C.page >= pages - 1 ? ' disabled' : ' onclick="_ctlPage(' + (C.page + 1) + ')"') + '>' + ico('chevron-right', 14) + '</button>';
    var sum = document.getElementById('sgcat-sum'); if (sum) sum.textContent = C.sel.size ? C.sel.size + ' code' + (C.sel.size === 1 ? '' : 's') + ' will be added to the group' : 'Click rows to select codes';
    var add = document.getElementById('sgcat-add'); if (add) add.disabled = !C.sel.size;
    if (!arr.length) {
      el.innerHTML = '<div class="ctl-empty"><b>' + ((getDB().services || []).length ? 'No codes match' : 'The catalog is empty') + '</b>' +
        ((getDB().services || []).length ? 'Change the search or the filters.' : 'Import the Medicare or Medicaid fee schedule to load every CPT and HCPCS code with its fee.') + '</div>';
      icons(); return;
    }
    el.innerHTML = '<table class="ctl-tbl"><colgroup><col style="width:44px"><col style="width:10%"><col style="width:9%"><col><col style="width:11%"><col style="width:11%"><col style="width:12%"></colgroup>' +
      '<thead><tr><th></th><th>Code</th><th>Type</th><th>Description</th><th class="n">Medicare</th><th class="n">Medicaid</th><th class="n">Your price</th></tr></thead><tbody>' +
      view.map(function (s) {
        var code = String(s.code).toUpperCase(), isIn = !!inGroup[code], on = C.sel.has(code), ty = s.category === 'CPT' || s.category === 'HCPCS' ? s.category : typeOf(code);
        return '<tr class="' + (isIn ? 'in' : on ? 'on' : '') + '"' + (isIn ? '' : ' onclick="_ctlToggle(\'' + esc(code) + '\')"') + '>' +
          '<td>' + (isIn ? '<span class="ctl-in">In group</span>' : '<input type="checkbox"' + (on ? ' checked' : '') + ' tabindex="-1">') + '</td>' +
          '<td class="ctl-code">' + esc(code) + '</td><td><span class="ctl-ty ' + ty + '">' + ty + '</span></td>' +
          '<td title="' + esc(s.desc || '') + '">' + esc(s.desc || '') + '</td>' +
          '<td class="n">' + money(feeOf(s, 'medicare')) + '</td><td class="n">' + money(feeOf(s, 'medicaid')) + '</td>' +
          '<td class="n ctl-yp">' + money(cdcServicePrice(s)) + '</td></tr>';
      }).join('') + '</tbody></table>';
    icons();
  };
  window._ctlPage = function (n) { C.page = n; renderSGCatalog(); };
  window._ctlToggle = function (code) { if (C.sel.has(code)) C.sel.delete(code); else C.sel.add(code); renderSGCatalog(); };
  window._ctlAdd = function () {
    if (!C.sel || !C.sel.size || typeof _sgForm === 'undefined' || !_sgForm) return;
    var svcs = getDB().services || [];
    C.sel.forEach(function (code) {
      var s = svcs.find(function (x) { return String(x.code).toUpperCase() === code; }); if (!s) return;
      var price = cdcServicePrice(s);
      _sgForm.lines.push({ id: uid(), cpt: code, mod1: s.mod1 || '', mod2: s.mod2 || '', mod3: s.mod3 || '', mod4: s.mod4 || '', units: '1', pricePerUnit: price, charge: price.toFixed(2) });
    });
    var n = C.sel.size; C.sel = new Set();
    closeSGCatalog();
    try { toast(n + ' code' + (n === 1 ? '' : 's') + ' added', 'ok'); } catch (e) {}
  };

  /* ---------------- yearly fee schedule import ---------------- */
  function ensureImport() {
    css();
    if (document.getElementById('modal-fee-import')) return;
    var y = new Date().getFullYear(), w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-fee-import';
    w.innerHTML = '<div class="modal fsi">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('upload', 17) + 'Import fee schedule</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-fee-import\')">' + ico('x', 17) + '</button></div>' +
      '<div class="fsi-body">' +
        '<div class="fsi-grid">' +
          '<div class="sgx-f"><label>Fee schedule</label><select id="fsi-src" onchange="_fsiParse()"><option value="medicare">Medicare (Physician Fee Schedule)</option><option value="medicaid">Medicaid (state fee schedule)</option></select></div>' +
          '<div class="sgx-f"><label>Year</label><input id="fsi-year" type="number" value="' + y + '" min="2020" max="2040"></div>' +
          '<div class="sgx-f"><label>Fee column</label><select id="fsi-col" onchange="_fsiParse(true)"><option value="">Choose a file first</option></select></div>' +
        '</div>' +
        '<label class="fsi-drop">' + ico('file-spreadsheet', 22) + '<span id="fsi-file">Choose the fee schedule file (CSV or Excel)</span>' +
          '<input type="file" id="fsi-input" accept=".csv,.xlsx,.xls,.txt" style="display:none" onchange="_fsiRead(event)"></label>' +
        '<div class="fsi-st" id="fsi-st">No file loaded.</div>' +
        '<div class="fsi-hint">Medicare: CMS Physician Fee Schedule Look-up Tool, download the pricing for your locality (non-facility price). ' +
          'Medicaid: the state practitioner fee schedule (Excel). Both CPT and HCPCS codes are read; rows with a modifier (26, TC...) are skipped when the plain code exists. ' +
          'Import once a year; codes already in the catalog are updated, nothing is deleted.</div>' +
      '</div>' +
      '<div class="cdc-ftr"><span class="sum"></span>' +
        '<button type="button" class="cdc-no" onclick="closeModal(\'modal-fee-import\')">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-ok" id="fsi-go" disabled onclick="_fsiImport()">' + ico('check', 15) + 'Import</button></div>' +
    '</div>';
    document.body.appendChild(w);
  }
  window.openFeeImport = function () { ensureImport(); C.stage = null; var s = document.getElementById('fsi-st'); if (s) s.textContent = 'No file loaded.'; var f = document.getElementById('fsi-file'); if (f) f.textContent = 'Choose the fee schedule file (CSV or Excel)'; var go = document.getElementById('fsi-go'); if (go) go.disabled = true; openModal('modal-fee-import'); icons(); };

  window._fsiRead = function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    document.getElementById('fsi-file').textContent = f.name;
    var rd = new FileReader();
    rd.onload = function (e) {
      try {
        if (typeof XLSX === 'undefined') throw new Error('Excel reader not available');
        var wb = /\.csv$|\.txt$/i.test(f.name) ? XLSX.read(String(e.target.result), { type: 'string' }) : XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        C.stage = { rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), name: f.name };
        _fsiParse();
      } catch (err) { document.getElementById('fsi-st').textContent = 'Could not read the file: ' + (err && err.message); }
    };
    if (/\.csv$|\.txt$/i.test(f.name)) rd.readAsText(f); else rd.readAsArrayBuffer(f);
    ev.target.value = '';
  };
  // find the header row and the code / modifier / description / fee columns
  function detect(rows) {
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var h = rows[r].map(function (x) { return String(x || '').trim().toLowerCase(); });
      var code = h.findIndex(function (x) { return /^(hcpcs|cpt|procedure|proc|code)\b|hcpcs code|cpt\/hcpcs|procedure code/.test(x); });
      if (code < 0) continue;
      var mod = h.findIndex(function (x, i) { return i !== code && /^mod(ifier)?\b|modifier/.test(x); });
      var desc = h.findIndex(function (x) { return /descr|descriptor/.test(x); });
      var fees = []; h.forEach(function (x, i) { if (i !== code && i !== mod && /fee|price|rate|amount|allow|payment|max/.test(x) && !/indicator|code|date|effective|status|percent|%/.test(x)) fees.push(i); });
      if (!fees.length) continue;
      return { row: r, code: code, mod: mod, desc: desc, fees: fees, head: rows[r] };
    }
    return null;
  }
  function num(v) { if (typeof v === 'number') return v; var n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; }
  window._fsiParse = function (keepCol) {
    var st = document.getElementById('fsi-st'), go = document.getElementById('fsi-go');
    if (!C.stage) return;
    var d = detect(C.stage.rows);
    if (!d) { st.innerHTML = '<b>No code and fee columns were found.</b> Make sure the file has a header row with the procedure code and a fee or price column.'; go.disabled = true; return; }
    var sel = document.getElementById('fsi-col');
    if (!keepCol) {
      var pref = d.fees.find(function (i) { return /non.?fac/i.test(String(d.head[i])); });
      sel.innerHTML = d.fees.map(function (i) { return '<option value="' + i + '"' + (i === pref ? ' selected' : '') + '>' + esc(String(d.head[i]).trim()) + '</option>'; }).join('');
    }
    var fc = parseInt(sel.value, 10), out = {}, withMod = {};
    for (var r = d.row + 1; r < C.stage.rows.length; r++) {
      var row = C.stage.rows[r], code = String(row[d.code] || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(code)) continue;
      var fee = num(row[fc]); if (fee == null) continue;
      var mod = d.mod >= 0 ? String(row[d.mod] || '').trim() : '';
      var rec = { code: code, desc: d.desc >= 0 ? String(row[d.desc] || '').trim() : '', fee: Math.round(fee * 100) / 100 };
      if (mod) { if (!withMod[code]) withMod[code] = rec; continue; }
      out[code] = rec;
    }
    Object.keys(withMod).forEach(function (c) { if (!out[c]) out[c] = withMod[c]; });
    var codes = Object.keys(out), cpt = codes.filter(function (c) { return typeOf(c) === 'CPT'; }).length, hc = codes.filter(function (c) { return typeOf(c) === 'HCPCS'; }).length;
    C.stage.parsed = out;
    st.innerHTML = '<b>' + codes.length.toLocaleString() + ' codes</b> found in ' + esc(C.stage.name) + ' • ' + cpt.toLocaleString() + ' CPT • ' + hc.toLocaleString() + ' HCPCS' +
      (codes.length ? '<br>Example: ' + esc(codes[0]) + ' ' + esc(out[codes[0]].desc).slice(0, 60) + ' ' + money(out[codes[0]].fee) : '');
    go.disabled = !codes.length;
  };
  window._fsiImport = function () {
    if (!C.stage || !C.stage.parsed) return;
    var src = g('fsi-src') || 'medicare', year = parseInt(g('fsi-year'), 10) || new Date().getFullYear(), P = C.stage.parsed, n = 0, added = 0;
    setDB(function (d) {
      if (!d.services) d.services = [];
      var byCode = {}; d.services.forEach(function (s) { if (s && s.code) byCode[String(s.code).toUpperCase()] = s; });
      Object.keys(P).forEach(function (code) {
        var r = P[code], s = byCode[code];
        if (!s) { s = { id: uid(), code: code, desc: r.desc, rate: '0.00', category: typeOf(code) }; d.services.push(s); byCode[code] = s; added++; }
        if (!s.desc && r.desc) s.desc = r.desc;
        if (!s.category || s.category === 'Manual') s.category = typeOf(code);
        s.fees = Object.assign({}, s.fees || {}); s.fees[src] = { fee: r.fee, year: year };
        n++;
      });
      d.settings = d.settings || {}; d.settings.feeSchedules = Object.assign({}, d.settings.feeSchedules || {});
      d.settings.feeSchedules[src] = { year: year, count: n, importedAt: Date.now(), file: C.stage.name };
    });
    closeModal('modal-fee-import');
    try { toast((src === 'medicare' ? 'Medicare' : 'Medicaid') + ' ' + year + ': ' + n.toLocaleString() + ' codes imported (' + added.toLocaleString() + ' new)', 'ok'); } catch (e) {}
    C.page = 0; renderSGCatalog();
  };
})();
