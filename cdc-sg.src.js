/*
 * ClaimDataCare  •  Service Groups
 * File: cdc-sg.js  •  v1.0
 *
 * Replaces in script1.js: renderServiceGroups, openSGModal, renderSGLines, addSGLine,
 * renderSGPatients, renderSGBatchPatients, the "Bill To" wrapper layer and the
 * Service Group editor window.
 *   • Editor: CPT lines as a compact table; price/unit and units update the total in
 *     place (the field keeps focus, so whole numbers can be typed normally)
 *   • Bill To per patient lives in the editor and is the payer used on every claim
 *     generated from the group (Primary, Secondary, Tertiary or Self Pay)
 *   • Generate claims: compact patient rows that show exactly who will be billed, quick
 *     select all / none, and per-patient details that open on demand
 */
(function () {
  'use strict';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return '<i data-lucide="' + n + '" class="lci" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px"></i>'; }
  function icons() { try { if (typeof _renderLucideIcons === 'function') setTimeout(_renderLucideIcons, 20); } catch (e) {} }
  function money(n) { try { return '$' + fmtMoney(n); } catch (e) { return '$' + Number(n || 0).toFixed(2); } }
  function avClass(p) { var x = String((p && p.sex) || '').toUpperCase(); return x === 'F' ? 'f' : x === 'M' ? 'm' : ''; }
  function lineTotal(l) { var u = parseInt(l.units, 10) || 1, p = parseFloat(l.pricePerUnit); if (!(p > 0)) p = (parseFloat(l.charge) || 0) / u; return (p || 0) * u; }
  function groupTotal(lines) { return (lines || []).reduce(function (a, l) { return a + lineTotal(l); }, 0); }

  /* ---------------- styles ---------------- */
  var CSS = [
    '.sgx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}',
    '.sgx-card{background:#fff;border:1px solid #E4E9F1;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;transition:box-shadow .15s,border-color .15s}',
    '.sgx-card:hover{border-color:#D5DCE7;box-shadow:0 10px 24px -18px rgba(11,21,38,.4)}',
    '.sgx-card.off{opacity:.65}',
    '.sgx-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
    '.sgx-name{font-size:15px;font-weight:700;letter-spacing:.01em;color:#0B1526;line-height:1.25}',
    '.sgx-sub{font-size:11.5px;color:#586579;margin-top:3px;line-height:1.35}',
    '.sgx-sub .warn{color:#B8461F;font-weight:600}',
    '.sgx-pill{flex:none;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}',
    '.sgx-pill.on{background:rgba(14,138,95,.1);color:#0E7A55}.sgx-pill.off{background:#EEF1F6;color:#586579}',
    '.sgx-stats{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #EEF1F6;border-radius:12px;overflow:hidden}',
    '.sgx-stats div{padding:9px 6px;text-align:center}',
    '.sgx-stats div+div{border-left:1px solid #EEF1F6}',
    '.sgx-stats b{display:block;font-size:17px;font-weight:700;color:#0B1526;font-variant-numeric:tabular-nums}',
    '.sgx-stats small{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#586579}',
    '.sgx-cpts{display:flex;flex-wrap:wrap;gap:5px}',
    '.sgx-cpt{font-family:var(--mono,monospace);font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;background:#F4F6FA;color:#3A475C}',
    '.sgx-acts{display:flex;align-items:center;gap:6px;margin-top:auto}',
    '.sgx-go{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border:0;border-radius:10px;background:#FF6A3D;color:#fff;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:background-color .15s}',
    '.sgx-go:hover{background:#D45C37}',
    '.sgx-ib{width:34px;height:34px;flex:none;box-sizing:border-box;border:1px solid #E4E9F1;border-radius:10px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s,border-color .15s}',
    '.sgx-ib:hover{background:rgba(255,106,61,.09);color:#D45C37;border-color:rgba(255,106,61,.35)}',
    '.sgx-sp{flex:1}',
    /* editor */
    '.sgx-mb{flex:1;min-height:0;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:18px}',
    '.sgx-mf{flex:none;display:flex;align-items:center;gap:10px;padding:12px 22px;border-top:1px solid #EEF1F6;background:#F8FAFC}',
    '.sgx-sum{font-size:12.5px;color:#3A475C;font-variant-numeric:tabular-nums}',
    '.sgx-sum b{color:#0B1526}',
    '.sgx-set{display:grid;grid-template-columns:2fr 1.4fr 1.4fr .9fr;gap:12px}',
    '.sgx-f label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;margin-bottom:5px}',
    '.sgx-f input,.sgx-f select{width:100%;box-sizing:border-box;height:36px;padding:0 10px;border:1px solid #E4E9F1;border-radius:10px;font-family:inherit;font-size:13px;background:#fff;color:#0B1526}',
    '.sgx-sec{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
    '.sgx-sec h4{margin:0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3A475C;display:flex;align-items:center;gap:7px}',
    '.sgx-sec .n{font-size:11px;font-weight:600;color:#586579}',
    '.sgx-tbl{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #EEF1F6;border-radius:12px;overflow:hidden;font-size:12.5px}',
    '.sgx-tbl th{background:#F8FAFC;padding:8px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#586579;border-bottom:1px solid #EEF1F6;white-space:nowrap}',
    '.sgx-tbl td{padding:6px 8px;border-bottom:1px solid #F1F4F8;vertical-align:middle}',
    '.sgx-tbl tr:last-child td{border-bottom:0}',
    '.sgx-tbl .num{text-align:right}',
    '.sgx-tbl input{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid #E4E9F1;border-radius:8px;font-family:var(--mono,monospace);font-size:12.5px;background:#fff;color:#0B1526}',
    '.sgx-tbl input:focus,.sgx-f input:focus,.sgx-f select:focus,.sgx-pr input:focus,.sgx-pr select:focus{outline:none;border-color:#FF6A3D;box-shadow:0 0 0 3px rgba(255,106,61,.14)}',
    '.sgx-tbl input.cpt{font-weight:700}',
    '.sgx-tbl input.mod{text-align:center;text-transform:uppercase}',
    '.sgx-tot{font-family:var(--mono,monospace);font-weight:700;color:#0B1526;white-space:nowrap}',
    '.sgx-tfoot td{background:#F8FAFC;font-weight:700;color:#0B1526}',
    '.sgx-x{width:30px;height:30px;border:0;border-radius:8px;background:none;color:#8C98AB;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s}',
    '.sgx-x:hover{background:rgba(232,54,122,.08);color:#E8367A}',
    '.sgx-add{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px dashed #D5DCE7;border-radius:9px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;transition:color .15s,border-color .15s,background-color .15s}',
    '.sgx-add:hover{color:#D45C37;border-color:rgba(255,106,61,.5);background:rgba(255,106,61,.05)}',
    '.sgx-empty{padding:16px;text-align:center;font-size:12.5px;color:#586579;border:1px dashed #E4E9F1;border-radius:12px}',
    /* patient rows (editor) */
    '.sgx-pr{display:grid;grid-template-columns:18px minmax(170px,1.4fr) minmax(170px,1.2fr) minmax(110px,1fr) minmax(80px,.7fr) minmax(120px,1fr) minmax(120px,1fr) 30px;gap:8px;align-items:center;padding:8px 10px;border:1px solid #EEF1F6;border-radius:12px;background:#fff;margin-bottom:6px}',
    '.sgx-pr input,.sgx-pr select{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid #E4E9F1;border-radius:8px;font-family:inherit;font-size:12px;background:#fff;color:#0B1526;min-width:0}',
    '.sgx-pr .dx{font-family:var(--mono,monospace);text-transform:uppercase}',
    '.sgx-drag{cursor:grab;color:#A9B3C2;display:flex;align-items:center}',
    '.sgx-who{display:flex;align-items:center;gap:8px;min-width:0}',
    /* patient initials (solid colours): magenta for women, blue for men, violet when not set */
    '.sgx-av{width:28px;height:28px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#fff;background:#7B2FF7}',
    '.sgx-av.f{background:#E8367A}',
    '.sgx-av.m{background:#00A3D1}',
    '.sgx-who .nm{font-size:12.5px;font-weight:700;color:#0B1526;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sgx-who .mt{font-size:10.5px;color:#586579;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sgx-bill{font-weight:600}',
    '.sgx-bill.k-primary{color:#B8461F;border-color:rgba(255,106,61,.45)!important;background:rgba(255,106,61,.06)!important}',
    '.sgx-bill.k-secondary{color:#5B17D6;border-color:rgba(123,47,247,.45)!important;background:rgba(123,47,247,.06)!important}',
    '.sgx-bill.k-tertiary{color:#0A6A8C;border-color:rgba(0,163,209,.45)!important;background:rgba(0,163,209,.06)!important}',
    '.sgx-bill.k-selfpay{color:#3A475C}',
    '.sgx-ph{display:grid;grid-template-columns:18px minmax(170px,1.4fr) minmax(170px,1.2fr) minmax(110px,1fr) minmax(80px,.7fr) minmax(120px,1fr) minmax(120px,1fr) 30px;gap:8px;padding:0 10px 6px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#586579}',
    /* generate claims: patient rows */
    '.sgb-tools{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
    '.sgb-tools .n{font-size:11.5px;color:#586579}',
    '.sgb-row{border-bottom:1px solid #F1F4F8;background:#fff}',
    '.sgb-row:last-child{border-bottom:0}',
    '.sgb-row.skip{background:#FAFBFD}',
    '.sgb-row.skip .sgb-main{opacity:.55}',
    '.sgb-main{display:grid;grid-template-columns:20px minmax(160px,1.3fr) minmax(160px,1.3fr) minmax(120px,1fr) 70px 90px 30px;gap:10px;align-items:center;padding:8px 12px}',
    '.sgb-main input[type=checkbox]{width:16px;height:16px;accent-color:#FF6A3D;cursor:pointer;margin:0}',
    '.sgb-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid}',
    '.sgb-chip.k-primary{color:#B8461F;background:rgba(255,106,61,.07);border-color:rgba(255,106,61,.3)}',
    '.sgb-chip.k-secondary{color:#5B17D6;background:rgba(123,47,247,.07);border-color:rgba(123,47,247,.3)}',
    '.sgb-chip.k-tertiary{color:#0A6A8C;background:rgba(0,163,209,.07);border-color:rgba(0,163,209,.3)}',
    '.sgb-chip.k-selfpay{color:#3A475C;background:#F4F6FA;border-color:#E4E9F1}',
    '.sgb-dx{font-family:var(--mono,monospace);font-size:11px;color:#3A475C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sgb-dx.miss{font-family:inherit;color:#B8461F;font-weight:600}',
    '.sgb-n{font-size:11.5px;color:#586579;text-align:center;font-variant-numeric:tabular-nums}',
    '.sgb-amt{font-size:12.5px;font-weight:700;color:#0B1526;text-align:right;font-variant-numeric:tabular-nums}',
    '.sgb-more{width:30px;height:30px;border:0;border-radius:8px;background:none;color:#586579;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s}',
    '.sgb-more:hover{background:rgba(255,106,61,.09);color:#D45C37}',
    '.sgb-det{padding:4px 12px 12px 42px;display:flex;flex-direction:column;gap:10px}',
    '.sgb-det .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.sgb-det label{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;margin-bottom:4px}',
    '.sgb-det select,.sgb-det input{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid #E4E9F1;border-radius:8px;font-family:inherit;font-size:12px;background:#fff}',
    /* Generate claims window */
    /* size comes from the standard window class in cdc-shell.css */
    '#modal-batch .mb-modal > .modal-body{flex:1 1 auto!important;min-height:0;overflow-y:auto!important;scrollbar-gutter:stable}',
    '.mb-tabs{flex:none;display:flex;gap:4px;padding:10px 20px 0;border-bottom:1px solid #E4E9F1;background:#fff}',
    '.mb-tab{display:flex;align-items:center;gap:7px;height:36px;padding:0 16px;margin-bottom:-1px;border:1px solid transparent;border-bottom:1px solid #E4E9F1;border-radius:10px 10px 0 0;background:#F4F6FA;font-family:inherit;font-size:12.5px;font-weight:600;color:#586579;cursor:pointer;transition:background-color .15s,color .15s}',
    '.mb-tab .lci{width:14px;height:14px}',
    '.mb-tab:hover{background:#EEF1F6;color:#0B1526}',
    '.mb-tab.on{background:#fff;border-color:#E4E9F1;border-bottom-color:#fff;color:#D45C37;box-shadow:inset 0 2px 0 #FF6A3D;cursor:default}',
    '.mb-ftr{flex:none!important;display:flex!important;align-items:center;gap:12px;height:72px;box-sizing:border-box;padding:0 18px!important;border-top:1px solid #E4E9F1;background:#F8FAFC}',
    '.mb-sum{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;overflow:hidden}',
    '.mb-sum .r1{display:flex;align-items:baseline;gap:16px;white-space:nowrap;overflow:hidden}',
    '.mb-sum .k{font-size:11.5px;color:#586579}',
    '.mb-sum .k b{font-size:17px;font-weight:700;color:#0B1526;margin-right:4px;font-variant-numeric:tabular-nums}',
    '.mb-sum .k.total b{color:#D45C37}',
    '.mb-sum .r2{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;font-size:11px;color:#586579}',
    '.mb-sum .r2 .pay{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#fff;border:1px solid #E4E9F1;color:#3A475C;font-weight:600}',
    '.mb-sum .r2 .pay b{color:#0B1526}',
    '.mb-sum .r2 .warn{color:#B8461F;font-weight:700}',
    '.mb-sum .empty{font-size:12.5px;color:#586579}',
    '.mb-group{position:relative;display:flex;align-items:center;gap:7px;height:36px;padding:0 12px;border:1px solid #E4E9F1;border-radius:10px;background:#fff;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;white-space:nowrap}',
    '.mb-group input{width:15px;height:15px;margin:0;accent-color:#FF6A3D}',
    /* service group panel */
    '.sgb{display:flex;flex-direction:column;gap:12px}',
    '.sgb-top{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}',
    '.sgb-dates{display:grid;grid-template-columns:160px 160px 1fr;gap:12px;align-items:end}',
    '.sgb-presets{display:flex;flex-wrap:wrap;gap:6px}',
    '.sgb-presets button{height:34px;padding:0 12px;border:1px solid #E4E9F1;border-radius:9px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;transition:color .15s,border-color .15s,background-color .15s}',
    '.sgb-presets button:hover{color:#D45C37;border-color:rgba(255,106,61,.4);background:rgba(255,106,61,.05)}',
    '.sgb-cpt{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:#F8FAFC;border:1px solid #EEF1F6}',
    '.sgb-cpt>span{font-size:10.5px;font-weight:700;letter-spacing:.07em;color:#586579}',
    '.sgb-cpt #mb-sg-lines{display:flex;flex-wrap:wrap;gap:5px}',
    '.sgb-cpt .badge{font-family:var(--mono,monospace);font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;background:#fff;color:#3A475C;border:1px solid #E4E9F1}',
    '.sgb-list{border:1px solid #EEF1F6;border-radius:12px;overflow:hidden}',
    '@media (max-width:900px){.sgb-top,.sgb-dates{grid-template-columns:1fr 1fr}.sgx-set{grid-template-columns:1fr 1fr}.sgx-pr,.sgx-ph{grid-template-columns:18px 1fr 1fr 30px}.sgx-ph{display:none}.sgb-main{grid-template-columns:20px 1fr 1fr 30px}.sgb-main .sgb-dx,.sgb-main .sgb-n,.sgb-main .sgb-amt{display:none}.sgb-det .grid{grid-template-columns:1fr 1fr}}'
  ].join('\n');
  function css() { if (document.getElementById('sgx-style')) return; var s = document.createElement('style'); s.id = 'sgx-style'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------------- insurances (Bill To) ---------------- */
  // Every insurance the patient can be billed to, from pat.insurances[] (legacy single fields as fallback)
  function insOptions(pat) {
    if (!pat) return [];
    var out = [];
    (pat.insurances || []).forEach(function (iv) {
      if (!iv || iv.inactive) return;
      var payerName = iv.name || iv.payerName || iv.payername || '', payerId = iv.payerId || iv.payerid || '';
      if (!payerName && !payerId) return;
      var t = (iv.insType || iv.type || '').toLowerCase();
      var kind = t.indexOf('secondary') >= 0 ? 'secondary' : t.indexOf('tertiary') >= 0 ? 'tertiary' : 'primary';
      var src = kind, n = 2;
      while (out.some(function (x) { return x.source === src; })) { src = kind + n; n++; }
      out.push({ source: src, kind: kind, iv: iv, payerId: payerId, payerName: payerName, memberId: iv.memberId || iv.insnum || '',
        key: (iv.payerId || iv.payerid || '') + '|' + (iv.name || iv.payerName || '') });
    });
    if (!out.length && (pat.payerid || pat.payername || pat.payerName)) {
      out.push({ source: 'primary', kind: 'primary', payerId: pat.payerid || '', payerName: pat.payername || pat.payerName || '', memberId: pat.insnum || '', key: (pat.payerid || '') + '|' + (pat.payername || pat.payerName || '') });
    }
    return out;
  }
  // What a group assignment will bill: the saved choice, or the patient's primary
  function billTo(pat, asgn) {
    var ov = asgn && asgn.payerOverride, opts = insOptions(pat);
    if (ov && (ov.source === 'selfpay' || ov.payerId === '__selfpay__')) return { kind: 'selfpay', label: 'Self Pay', selfPay: true };
    if (ov && ov.source) {
      var o = opts.find(function (x) { return x.source === ov.source; })
        || opts.find(function (x) { return x.payerId === ov.payerId && x.payerName === ov.payerName; });
      if (o) return { kind: o.kind, label: o.payerName, memberId: o.memberId, opt: o };
    }
    var pri = opts.find(function (x) { return x.kind === 'primary'; }) || opts[0];
    if (pri) return { kind: pri.kind, label: pri.payerName, memberId: pri.memberId, opt: pri, isDefault: true };
    return { kind: 'selfpay', label: 'Self Pay', selfPay: true, isDefault: true };
  }
  // Fields written on each generated claim so print, transmit and the editor bill the right payer
  window._sgPayerFields = function (pat, asgn) {
    var b = billTo(pat, asgn);
    if (b.selfPay) return { selfPay: true, primaryPayerKey: '', primaryPayerId: '', primaryPayerName: '', overridePayerSource: 'selfpay' };
    var o = b.opt;
    var f = { selfPay: false, primaryPayerKey: o.key, primaryPayerId: o.payerId, primaryPayerName: o.payerName };
    if (asgn && asgn.payerOverride) {
      f.overridePayerSource = o.source; f.overridePayerId = o.payerId; f.overridePayerName = o.payerName; f.overrideMemberId = o.memberId;
      if (o.kind !== 'primary') f.secondaryPayerKey = '';   // billing a secondary/tertiary as the payer: no other payer listed
    }
    return f;
  };

  /* ---------------- list ---------------- */
  window.renderServiceGroups = function () {
    css();
    var el = document.getElementById('sg-list'); if (!el) return;
    var db = getDB(), groups = (db.serviceGroups || []).filter(function (g) { return g.providerId === activeProviderId; });
    if (!groups.length) {
      el.innerHTML = '<div class="sgx-empty" style="padding:40px">' + ico('layers', 30) + '<div style="font-size:15px;font-weight:700;color:#0B1526;margin:8px 0 4px">No service groups yet</div>Service groups hold a set of CPT codes and patients so claims can be generated in one step.<div style="margin-top:14px"><button class="sgx-go" onclick="openSGModal()">' + ico('plus', 15) + 'New service group</button></div></div>';
      icons(); return;
    }
    el.innerHTML = '<div class="sgx-grid">' + groups.map(function (g) {
      var rend = (db.rendering || []).find(function (r) { return r.id === g.renderingProviderId; });
      var fac = (db.facilities || []).find(function (f) { return f.id === g.facilityId; });
      var on = g.status !== 'Inactive', id = esc(g.id);
      return '<div class="sgx-card' + (on ? '' : ' off') + '">' +
        '<div class="sgx-hd"><div style="min-width:0"><div class="sgx-name">' + esc(g.name) + '</div>' +
          '<div class="sgx-sub">' + (rend ? esc(rend.last + ', ' + rend.first) : '<span class="warn">No rendering provider</span>') + (fac ? ' • ' + esc(fac.name) : '') + '</div></div>' +
          '<span class="sgx-pill ' + (on ? 'on' : 'off') + '">' + esc(g.status || 'Active') + '</span></div>' +
        '<div class="sgx-stats"><div><b>' + (g.lines || []).length + '</b><small>CPT lines</small></div><div><b>' + (g.patients || []).length + '</b><small>Patients</small></div><div><b>' + money(groupTotal(g.lines)) + '</b><small>Per visit</small></div></div>' +
        '<div class="sgx-cpts">' + (g.lines || []).map(function (l) { return '<span class="sgx-cpt">' + esc(l.cpt) + (parseInt(l.units, 10) > 1 ? ' × ' + parseInt(l.units, 10) : '') + '</span>'; }).join('') + '</div>' +
        '<div class="sgx-acts"><button class="sgx-go" onclick="openBulkFromSG(\'' + id + '\')">' + ico('zap', 15) + 'Generate claims</button><span class="sgx-sp"></span>' +
          '<button class="sgx-ib" data-tip="Edit" aria-label="Edit" onclick="openSGModal(\'' + id + '\')">' + ico('pencil', 15) + '</button>' +
          '<button class="sgx-ib" data-tip="Duplicate" aria-label="Duplicate" onclick="copySG(\'' + id + '\')">' + ico('copy', 15) + '</button>' +
          '<button class="sgx-ib" data-tip="Delete" aria-label="Delete" onclick="deleteSG(\'' + id + '\')">' + ico('trash-2', 15) + '</button></div>' +
      '</div>';
    }).join('') + '</div>';
    icons();
  };

  /* ---------------- editor ---------------- */
  function ensureModal() {
    css();
    if (document.getElementById('modal-sg')) return;
    var w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-sg';
    w.innerHTML = '<div class="modal cdc-win">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('layers', 17) + '<span id="sg-title">Service group</span></span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-sg\')">' + ico('x', 17) + '</button></div>' +
      '<div class="sgx-mb">' +
        '<div class="sgx-set">' +
          '<div class="sgx-f"><label>Group name *</label><input id="sg-name" placeholder="e.g. MEDICAID PT MON TO THU"></div>' +
          '<div class="sgx-f"><label>Rendering provider</label><select id="sg-rend"></select></div>' +
          '<div class="sgx-f"><label>Facility</label><select id="sg-fac"></select></div>' +
          '<div class="sgx-f"><label>Status</label><select id="sg-status"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>' +
        '</div>' +
        '<div><div class="sgx-sec"><h4>' + ico('list', 14) + 'CPT lines</h4><span class="n" id="sg-lines-n"></span><span class="sgx-sp"></span>' +
          '<button class="sgx-add" onclick="openSGCatalog()">' + ico('book-open', 14) + 'From catalog</button>' +
          '<button class="sgx-add" onclick="addSGLine()">' + ico('plus', 14) + 'Add line</button></div>' +
          '<div id="sg-lines"></div></div>' +
        '<div><div class="sgx-sec"><h4>' + ico('users', 14) + 'Patients</h4><span class="n" id="sg-pats-n"></span><span class="sgx-sp"></span>' +
          '<button class="sgx-add" onclick="openSGPatientPicker()">' + ico('user-plus', 14) + 'Add patients</button></div>' +
          '<div id="sg-patients"></div></div>' +
      '</div>' +
      '<div class="sgx-mf"><span class="sgx-sum" id="sg-sum"></span><span class="sgx-sp"></span>' +
        '<button type="button" class="cdc-no" onclick="closeModal(\'modal-sg\')">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-ok" onclick="saveSG()">' + ico('save', 15) + 'Save group</button></div>' +
    '</div>';
    document.body.appendChild(w);
  }

  window.openSGModal = function (sgId) {
    ensureModal();
    var db = getDB(), sg = sgId ? (db.serviceGroups || []).find(function (g) { return g.id === sgId; }) : null;
    _sgForm = sg ? JSON.parse(JSON.stringify(sg)) : { id: '', providerId: activeProviderId, name: '', renderingProviderId: '', facilityId: '', status: 'Active', lines: [], patients: [] };
    if (!_sgForm.lines) _sgForm.lines = [];
    if (!_sgForm.patients) _sgForm.patients = [];
    var rends = (db.rendering || []).filter(function (r) { return r.providerId === activeProviderId; });
    var facs = (db.facilities || []).filter(function (f) { return f.providerId === activeProviderId; });
    document.getElementById('sg-rend').innerHTML = '<option value="">Select rendering provider</option>' + rends.map(function (r) { return '<option value="' + r.id + '"' + (r.id === _sgForm.renderingProviderId ? ' selected' : '') + '>' + esc(r.last + ', ' + r.first) + '</option>'; }).join('');
    document.getElementById('sg-fac').innerHTML = '<option value="">None</option>' + facs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === _sgForm.facilityId ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('');
    document.getElementById('sg-name').value = _sgForm.name || '';
    document.getElementById('sg-status').value = _sgForm.status || 'Active';
    document.getElementById('sg-title').textContent = sg ? 'Edit service group' : 'New service group';
    renderSGLines(); renderSGPatients();
    openModal('modal-sg');
    icons();
  };

  function summary() {
    var el = document.getElementById('sg-sum'); if (!el || !_sgForm) return;
    var n = _sgForm.lines.length, p = (_sgForm.patients || []).length;
    el.innerHTML = '<b>' + n + '</b> line' + (n === 1 ? '' : 's') + ' • <b>' + money(groupTotal(_sgForm.lines)) + '</b> per visit • <b>' + p + '</b> patient' + (p === 1 ? '' : 's');
    var a = document.getElementById('sg-lines-n'); if (a) a.textContent = n ? n + ' line' + (n === 1 ? '' : 's') : '';
    var b = document.getElementById('sg-pats-n'); if (b) b.textContent = p ? p + ' patient' + (p === 1 ? '' : 's') : '';
    var t = document.getElementById('sg-lines-total'); if (t) t.textContent = money(groupTotal(_sgForm.lines));
  }

  // Typing updates the data and the totals in place: the table is not redrawn, so the
  // cursor stays in the field (whole prices like 120 or 85.50 can be typed normally)
  window._sgLineInput = function (i, field, el) {
    var l = _sgForm && _sgForm.lines[i]; if (!l) return;
    var v = el.value;
    if (field === 'pricePerUnit') l.pricePerUnit = parseFloat(v) || 0;
    else if (field === 'units') l.units = v;
    else if (field === 'cpt') l.cpt = v.trim().toUpperCase();
    else l[field] = v.toUpperCase();
    if (field === 'pricePerUnit' || field === 'units') {
      l.charge = lineTotal(l).toFixed(2);
      var c = document.getElementById('sg-lt-' + i); if (c) c.textContent = money(lineTotal(l));
    }
    summary();
  };

  window.renderSGLines = function () {
    var el = document.getElementById('sg-lines'); if (!el || !_sgForm) return;
    if (!_sgForm.lines.length) { el.innerHTML = '<div class="sgx-empty">No CPT lines yet. Use Add line or From catalog.</div>'; summary(); return; }
    el.innerHTML = '<table class="sgx-tbl"><thead><tr><th style="width:110px">CPT *</th><th style="width:120px">Price / unit $</th><th style="width:80px">Units</th><th class="num" style="width:110px">Total</th><th>Mod 1</th><th>Mod 2</th><th>Mod 3</th><th>Mod 4</th><th style="width:36px"></th></tr></thead><tbody>' +
      _sgForm.lines.map(function (l, i) {
        var ppu = parseFloat(l.pricePerUnit); if (!(ppu > 0)) ppu = (parseFloat(l.charge) || 0) / (parseInt(l.units, 10) || 1);
        if (!(parseFloat(l.pricePerUnit) > 0) && ppu > 0) l.pricePerUnit = Math.round(ppu * 100) / 100;
        l.charge = lineTotal(l).toFixed(2);
        var mod = function (k) { return '<td><input class="mod" maxlength="2" value="' + esc(l[k] || '') + '" oninput="_sgLineInput(' + i + ',\'' + k + '\',this)"></td>'; };
        return '<tr><td><input class="cpt" value="' + esc(l.cpt || '') + '" placeholder="97110" oninput="_sgLineInput(' + i + ',\'cpt\',this)"></td>' +
          '<td><input type="number" step="0.01" min="0" inputmode="decimal" value="' + (ppu ? Math.round(ppu * 100) / 100 : '') + '" placeholder="0.00" oninput="_sgLineInput(' + i + ',\'pricePerUnit\',this)"></td>' +
          '<td><input type="number" min="1" step="1" inputmode="numeric" value="' + (parseInt(l.units, 10) || 1) + '" oninput="_sgLineInput(' + i + ',\'units\',this)"></td>' +
          '<td class="num"><span class="sgx-tot" id="sg-lt-' + i + '">' + money(lineTotal(l)) + '</span></td>' +
          mod('mod1') + mod('mod2') + mod('mod3') + mod('mod4') +
          '<td><button class="sgx-x" data-tip="Remove line" aria-label="Remove line" onclick="_sgForm.lines.splice(' + i + ',1);renderSGLines()">' + ico('x', 16) + '</button></td></tr>';
      }).join('') +
      '</tbody><tfoot class="sgx-tfoot"><tr><td colspan="3">Per visit</td><td class="num"><span class="sgx-tot" id="sg-lines-total"></span></td><td colspan="5"></td></tr></tfoot></table>';
    summary(); icons();
  };

  window.addSGLine = function () {
    if (!_sgForm) return;
    _sgForm.lines.push({ id: uid(), cpt: '', mod1: '', mod2: '', mod3: '', mod4: '', units: '1', pricePerUnit: 0, charge: '' });
    renderSGLines();
    var ins = document.querySelectorAll('#sg-lines input.cpt'); if (ins.length) ins[ins.length - 1].focus();
  };

  window._sgBillChange = function (i, val, el) {
    var a = _sgForm && _sgForm.patients[i]; if (!a) return;
    var pat = (getDB().patients || []).find(function (p) { return p.id === a.patientId; });
    if (!val) delete a.payerOverride;
    else if (val === 'selfpay') a.payerOverride = { source: 'selfpay', payerId: '__selfpay__', payerName: 'Self Pay' };
    else {
      var o = insOptions(pat).find(function (x) { return x.source === val; });
      if (o) a.payerOverride = { source: o.source, payerId: o.payerId, payerName: o.payerName, memberId: o.memberId };
    }
    var b = billTo(pat, a);
    if (el) el.className = 'sgx-bill k-' + b.kind;
  };

  window.renderSGPatients = function () {
    var el = document.getElementById('sg-patients'); if (!el || !_sgForm) return;
    var db = getDB();
    var refs = (db.referring || []).filter(function (r) { return r.providerId === activeProviderId; });
    var facs = (db.facilities || []).filter(function (f) { return f.providerId === activeProviderId; });
    if (!_sgForm.patients.length) { el.innerHTML = '<div class="sgx-empty">No patients yet. Use Add patients.</div>'; summary(); return; }
    var KL = { primary: 'Primary', secondary: 'Secondary', tertiary: 'Tertiary' };
    el.innerHTML = '<div class="sgx-ph"><span></span><span>Patient</span><span>Bill to</span><span>Diagnoses *</span><span>Auth #</span><span>Referring</span><span>Facility</span><span></span></div>' +
      _sgForm.patients.map(function (a, i) {
        var pat = (db.patients || []).find(function (p) { return p.id === a.patientId; }) || {};
        var ini = ((pat.first || '?')[0] + (pat.last || '?')[0]).toUpperCase();
        var opts = insOptions(pat), b = billTo(pat, a), cur = a.payerOverride ? a.payerOverride.source : '';
        var bill = '<select class="sgx-bill k-' + b.kind + '" data-tip="Insurance billed on these claims" onchange="_sgBillChange(' + i + ',this.value,this)">' +
          (opts.length ? '<option value=""' + (!cur ? ' selected' : '') + '>Default • ' + esc((opts.find(function (x) { return x.kind === 'primary'; }) || opts[0]).payerName) + '</option>' : '') +
          opts.map(function (o) { return '<option value="' + esc(o.source) + '"' + (o.source === cur ? ' selected' : '') + '>' + (KL[o.kind] || 'Other') + ' • ' + esc(o.payerName) + (o.memberId ? ' • ' + esc(o.memberId) : '') + '</option>'; }).join('') +
          '<option value="selfpay"' + (cur === 'selfpay' || (!opts.length && !cur) ? ' selected' : '') + '>Self Pay</option></select>';
        return '<div class="sgx-pr sg-pat-card" draggable="true" data-sg-idx="' + i + '">' +
          '<span class="sgx-drag sg-drag-handle" data-tip="Drag to reorder">' + ico('grip-vertical', 15) + '</span>' +
          '<div class="sgx-who"><span class="sgx-av ' + avClass(pat) + '">' + esc(ini) + '</span><div style="min-width:0"><div class="nm">' + esc((pat.last || '?').toUpperCase() + ', ' + (pat.first || '?')) + '</div><div class="mt">File #' + esc(pat.acct || '') + ' • ' + esc(pat.dob || '') + '</div></div></div>' +
          bill +
          '<input class="dx" value="' + esc(a.dx || '') + '" placeholder="F33.2, Z91.19" oninput="_sgForm.patients[' + i + '].dx=this.value.toUpperCase()">' +
          '<input value="' + esc(a.auth || '') + '" placeholder="Optional" oninput="_sgForm.patients[' + i + '].auth=this.value">' +
          '<select onchange="_sgForm.patients[' + i + '].referringId=this.value"><option value="">None</option>' + refs.map(function (r) { return '<option value="' + r.id + '"' + (r.id === a.referringId ? ' selected' : '') + '>' + esc(r.last + ', ' + r.first) + '</option>'; }).join('') + '</select>' +
          '<select onchange="_sgForm.patients[' + i + '].facilityId=this.value"><option value="">Group default</option>' + facs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === a.facilityId ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') + '</select>' +
          '<button class="sgx-x" data-tip="Remove patient" aria-label="Remove patient" onclick="_sgForm.patients.splice(' + i + ',1);renderSGPatients()">' + ico('x', 16) + '</button></div>';
      }).join('');
    try { if (typeof _sgInstallDragReorder === 'function') _sgInstallDragReorder(); } catch (e) {}
    summary(); icons();
  };


  /* ---------------- add patients to the group (standard window, paged) ---------------- */
  var PK = { sel: null, page: 0, size: 10 }, PK_ROW = 44;
  var PK_CSS = [
    '.sgp-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:14px 20px}',
    '.sgp-flt{flex:none;display:grid;grid-template-columns:minmax(0,2fr) 130px minmax(0,1.2fr) 170px;gap:10px}',
    '.sgp-bar{flex:none;height:40px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF1F6;font-size:12px;color:#586579}',
    '.sgp-bar b{color:#D45C37}',
    '.sgp-bar .lk{border:0;background:none;font-family:inherit;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background-color .15s,color .15s}',
    '.sgp-bar .lk:hover{background:rgba(255,106,61,.09);color:#D45C37}',
    '.sgp-list{flex:1;min-height:0;overflow:hidden;border:1px solid #EEF1F6;border-radius:14px;background:#fff}',
    '.sgp-tbl{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12.5px}',
    '.sgp-tbl th{height:36px;padding:0 10px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;background:#F8FAFC;border-bottom:1px solid #EEF1F6;white-space:nowrap}',
    '.sgp-tbl td{height:' + PK_ROW + 'px;box-sizing:border-box;padding:0 10px;border-bottom:1px solid #F1F4F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}',
    '.sgp-tbl tbody tr{cursor:pointer;transition:background-color .12s}',
    '.sgp-tbl tbody tr:hover{background:#F8FAFC}',
    '.sgp-tbl tbody tr.on{background:rgba(255,106,61,.07)}',
    '.sgp-tbl tbody tr.in{cursor:default;color:#8C98AB}',
    '.sgp-tbl input[type=checkbox]{width:16px;height:16px;margin:0;accent-color:#FF6A3D;pointer-events:none}',
    '.sgp-in{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(0,163,209,.1);color:#007FA3}',
    '.sgp-mono{font-family:var(--mono,monospace);font-size:11.5px;color:#3A475C}',
    '.sgp-pay{color:#3A475C;font-weight:600}',
    '.sgp-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#586579;font-size:13px}',
    '.sgp-pg{display:flex;align-items:center;gap:6px;margin-left:auto}',
    '.sgp-pg span{font-size:11.5px;color:#586579;font-variant-numeric:tabular-nums;min-width:110px;text-align:right}',
    '.sgp-pg button{width:28px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:12px;font-weight:600}',
    '.sgp-pg button.on{background:#FF6A3D;border-color:#FF6A3D;color:#fff;cursor:default}',
    '.sgp-pg button[disabled]{opacity:.35;cursor:default}',
    '.sgp-ftr .sum{font-size:12.5px;color:#3A475C}',
    '@media (max-width:900px){.sgp-flt{grid-template-columns:1fr 1fr}}'
  ].join('\n');
  function ensurePicker() {
    if (!document.getElementById('sgp-style')) { var st = document.createElement('style'); st.id = 'sgp-style'; st.textContent = PK_CSS; document.head.appendChild(st); }
    if (document.getElementById('modal-sg-patients')) return;
    var w = document.createElement('div'); w.className = 'overlay'; w.id = 'modal-sg-patients';
    w.innerHTML = '<div class="modal cdc-win">' +
      '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t">' + ico('user-plus', 17) + 'Add patients to group</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-sg-patients\')">' + ico('x', 17) + '</button></div>' +
      '<div class="sgp-body">' +
        '<div class="sgp-flt">' +
          '<div class="sgx-f"><label>Search</label><input id="sgpick-q" class="no-upper" placeholder="Name, File #, member ID, phone, payer" oninput="_sgpFilter()"></div>' +
          '<div class="sgx-f"><label>Sex</label><select id="sgpick-sex" onchange="_sgpFilter()"><option value="">All</option><option value="F">Female</option><option value="M">Male</option></select></div>' +
          '<div class="sgx-f"><label>Payer</label><select id="sgpick-payer" onchange="_sgpFilter()"><option value="">All payers</option></select></div>' +
          '<div class="sgx-f"><label>Show</label><select id="sgpick-inclusion" onchange="_sgpFilter()"><option value="new">Not in this group</option><option value="all">All patients</option></select></div>' +
        '</div>' +
        '<div class="sgp-bar"><span id="sgpick-count"></span><button type="button" class="lk" onclick="_sgpSelectPage(true)">Select page</button><button type="button" class="lk" onclick="_sgpSelectPage(false)">Clear</button><div class="sgp-pg" id="sgpick-pg"></div></div>' +
        '<div class="sgp-list" id="sgpick-list"></div>' +
      '</div>' +
      '<div class="modal-ftr invm-ftr sgp-ftr"><span class="sum" id="sgpick-selcount"></span><span class="invm-sp" style="flex:1"></span>' +
        '<button type="button" class="cdc-no" onclick="closeModal(\'modal-sg-patients\')">' + ico('x', 15) + 'Cancel</button>' +
        '<button type="button" class="cdc-ok" id="sgpick-add" onclick="addSelectedSGPatients()">' + ico('user-plus', 15) + 'Add selected</button></div>' +
    '</div>';
    document.body.appendChild(w);
  }
  function payerOf(p) { var o = insOptions(p), pri = o.find(function (x) { return x.kind === 'primary'; }) || o[0]; if (pri) return pri.payerName; try { return _sgResolvePayerName(p, getDB()); } catch (e) { return ''; } }
  function memberOf(p) { var o = insOptions(p), pri = o.find(function (x) { return x.kind === 'primary'; }) || o[0]; return (pri && pri.memberId) || p.insnum || ''; }

  window.openSGPatientPicker = function () {
    if (!_sgForm) return;
    ensurePicker();
    PK.sel = new Set(); PK.page = 0;
    var pats = (getDB().patients || []).filter(function (p) { return p.providerId === activeProviderId; });
    var payers = {}; pats.forEach(function (p) { var n = payerOf(p); if (n) payers[n] = 1; });
    var ps = document.getElementById('sgpick-payer');
    if (ps) ps.innerHTML = '<option value="">All payers</option>' + Object.keys(payers).sort().map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    ['sgpick-q', 'sgpick-sex'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
    var inc = document.getElementById('sgpick-inclusion'); if (inc) inc.value = 'new';
    openModal('modal-sg-patients');
    setTimeout(function () { renderSGPatientPicker(); var q = document.getElementById('sgpick-q'); if (q) q.focus(); icons(); }, 30);
  };
  window._sgpFilter = function () { PK.page = 0; renderSGPatientPicker(); };
  function pickList() {
    var db = getDB(), g = function (id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
    var q = g('sgpick-q').toLowerCase(), sex = g('sgpick-sex'), payer = g('sgpick-payer'), inc = g('sgpick-inclusion') || 'new';
    var inG = new Set((_sgForm.patients || []).map(function (a) { return a.patientId; }));
    var list = (db.patients || []).filter(function (p) { return p.providerId === activeProviderId; });
    if (inc === 'new') list = list.filter(function (p) { return !inG.has(p.id); });
    if (sex) list = list.filter(function (p) { return String(p.sex || '').toUpperCase() === sex; });
    if (payer) list = list.filter(function (p) { return payerOf(p) === payer; });
    if (q) list = list.filter(function (p) { return [p.first, p.last, p.mid, p.acct, p.dob, p.phone, p.insnum, payerOf(p), memberOf(p)].filter(Boolean).join(' ').toLowerCase().indexOf(q) >= 0; });
    list.sort(function (a, b) { return (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || ''); });
    return { list: list, inG: inG };
  }
  window.renderSGPatientPicker = function () {
    var el = document.getElementById('sgpick-list'); if (!el || !_sgForm) return;
    if (!PK.sel) PK.sel = new Set();
    var r = pickList(), list = r.list;
    PK.size = Math.max(5, Math.floor(((el.clientHeight || 480) - 38) / PK_ROW));
    var pages = Math.max(1, Math.ceil(list.length / PK.size)); if (PK.page >= pages) PK.page = pages - 1;
    var view = list.slice(PK.page * PK.size, (PK.page + 1) * PK.size);
    var cnt = document.getElementById('sgpick-count'); if (cnt) cnt.innerHTML = list.length + ' patient' + (list.length === 1 ? '' : 's') + ' • <b>' + PK.sel.size + ' selected</b>';
    var sc = document.getElementById('sgpick-selcount'); if (sc) sc.textContent = PK.sel.size ? PK.sel.size + ' patient' + (PK.sel.size === 1 ? '' : 's') + ' will be added' : 'Click rows to select patients';
    var add = document.getElementById('sgpick-add'); if (add) add.disabled = !PK.sel.size;
    var a = list.length ? PK.page * PK.size + 1 : 0, b = Math.min(list.length, (PK.page + 1) * PK.size);
    var pg = document.getElementById('sgpick-pg');
    if (pg) pg.innerHTML = '<span>' + a + '\u2013' + b + ' of ' + list.length + '</span>' +
      '<button type="button" aria-label="Previous page"' + (PK.page <= 0 ? ' disabled' : ' onclick="_sgpPage(' + (PK.page - 1) + ')"') + '>' + ico('chevron-left', 14) + '</button>' +
      '<button type="button" class="on">' + (PK.page + 1) + '</button>' +
      '<button type="button" aria-label="Next page"' + (PK.page >= pages - 1 ? ' disabled' : ' onclick="_sgpPage(' + (PK.page + 1) + ')"') + '>' + ico('chevron-right', 14) + '</button>';
    if (!list.length) { el.innerHTML = '<div class="sgp-empty">No patients match. Change the search or filters.</div>'; icons(); return; }
    el.innerHTML = '<table class="sgp-tbl"><colgroup><col style="width:44px"><col style="width:34%"><col style="width:14%"><col style="width:24%"><col style="width:14%"><col style="width:14%"></colgroup>' +
      '<thead><tr><th></th><th>Patient</th><th>DOB / Sex</th><th>Payer</th><th>Member ID</th><th>Phone</th></tr></thead><tbody>' +
      view.map(function (p) {
        var inG = r.inG.has(p.id), on = PK.sel.has(p.id), sx = String(p.sex || '').toUpperCase(), ini = ((p.first || '?')[0] + (p.last || '?')[0]).toUpperCase();
        return '<tr class="' + (inG ? 'in' : on ? 'on' : '') + '"' + (inG ? '' : ' onclick="_sgTogglePickerSel(\'' + esc(p.id) + '\')"') + '>' +
          '<td>' + (inG ? '<span class="sgp-in">In group</span>' : '<input type="checkbox"' + (on ? ' checked' : '') + ' tabindex="-1">') + '</td>' +
          '<td><div class="sgx-who"><span class="sgx-av ' + avClass(p) + '">' + esc(ini) + '</span><div style="min-width:0"><div class="nm">' + esc((p.last || '').toUpperCase() + ', ' + (p.first || '').toUpperCase()) + '</div><div class="mt">File #' + esc(p.acct || '') + '</div></div></div></td>' +
          '<td class="sgp-mono">' + esc(p.dob || '') + (sx ? ' • ' + sx : '') + '</td>' +
          '<td class="sgp-pay" title="' + esc(payerOf(p)) + '">' + esc(payerOf(p) || '•') + '</td>' +
          '<td class="sgp-mono">' + esc(memberOf(p) || '•') + '</td><td class="sgp-mono">' + esc(p.phone || '•') + '</td></tr>';
      }).join('') + '</tbody></table>';
    icons();
  };
  window._sgpPage = function (n) { PK.page = n; renderSGPatientPicker(); };
  window._sgTogglePickerSel = function (id) { if (!PK.sel) PK.sel = new Set(); if (PK.sel.has(id)) PK.sel.delete(id); else PK.sel.add(id); renderSGPatientPicker(); };
  window._sgpSelectPage = function (on) {
    if (!PK.sel) PK.sel = new Set();
    if (!on) { PK.sel.clear(); renderSGPatientPicker(); return; }
    var r = pickList(); r.list.slice(PK.page * PK.size, (PK.page + 1) * PK.size).forEach(function (p) { if (!r.inG.has(p.id)) PK.sel.add(p.id); });
    renderSGPatientPicker();
  };
  window.addSelectedSGPatients = function () {
    if (!_sgForm || !PK.sel || !PK.sel.size) return;
    if (!_sgForm.patients) _sgForm.patients = [];
    var n = 0;
    PK.sel.forEach(function (pid) { if (!_sgForm.patients.some(function (x) { return x.patientId === pid; })) { _sgForm.patients.push({ patientId: pid, dx: '', auth: '', referringId: '', facilityId: '' }); n++; } });
    PK.sel = new Set();
    closeModal('modal-sg-patients');
    renderSGPatients();
    try { toast(n + ' patient' + (n === 1 ? '' : 's') + ' added', 'ok'); } catch (e) {}
  };

  /* ---------------- generate claims: date presets ---------------- */
  // Mon to Thu and Friday match how the groups are scheduled (e.g. MON TO THU, FRIDAY)
  window._sgbPreset = function (k) {
    var t = new Date(), dow = t.getDay(), mon = new Date(t); mon.setDate(t.getDate() - dow + (dow === 0 ? -6 : 1));
    var add = function (d, n) { var x = new Date(d); x.setDate(d.getDate() + n); return x; };
    if (k === 'today') _setDateRange(t, t);
    else if (k === 'monthu') _setDateRange(mon, add(mon, 3));
    else if (k === 'fri') { var f = add(mon, 4); _setDateRange(f, f); }
  };

  /* ---------------- generate claims: patient rows ---------------- */
  var _open = {};
  window._sgbToggle = function (pid, on) {
    var st = _sgBatchState[pid]; if (!st) return;
    st.included = (on === undefined) ? !st.included : !!on;
    if (window._sgBatchCur) renderSGBatchPatients(window._sgBatchCur);
    try { updateBatchPreview(); } catch (e) {}
  };
  window._sgbAll = function (on) {
    var sg = window._sgBatchCur; if (!sg) return;
    (sg.patients || []).forEach(function (a) { if (_sgBatchState[a.patientId]) _sgBatchState[a.patientId].included = on; });
    renderSGBatchPatients(sg);
    try { updateBatchPreview(); } catch (e) {}
  };
  window._sgbMore = function (pid) { _open[pid] = !_open[pid]; if (window._sgBatchCur) renderSGBatchPatients(window._sgBatchCur); };

  /* ---------------- generate claims: summary in the fixed footer ---------------- */
  window._mbSummary = function () {
    var el = document.getElementById('mb-summary'); if (!el) return;
    var go = document.querySelector('#modal-batch .mb-go');
    var sgPanel = document.getElementById('mb-panel-sg'), sgMode = !!(sgPanel && sgPanel.style.display !== 'none');
    var grouped = !!(document.getElementById('mb-group-dates') || {}).checked;
    var claims = 0, pats = 0, days = 0, lines = 0, total = 0, pay = {}, noDx = 0;
    if (sgMode) {
      var sg = window._sgBatchCur, sel = (document.getElementById('mb-sg-sel') || {}).value;
      if (!sg || !sel || sg.id !== sel) { el.innerHTML = '<span class="empty">Choose a service group and the dates to bill.</span>'; if (go) go.disabled = true; return; }
      var db = getDB(), perVisit = groupTotal(sg.lines), nl = (sg.lines || []).length, dset = {};
      (sg.patients || []).forEach(function (a) {
        var st = _sgBatchState[a.patientId]; if (!st || !st.included) return;
        var pat = (db.patients || []).find(function (p) { return p.id === a.patientId; }); if (!pat) return;
        var on = (st.dates || []).filter(function (d) { return d.on !== false; }); if (!on.length) return;
        on.forEach(function (d) { dset[d.iso || d.date] = 1; });
        var c = grouped ? 1 : on.length;
        pats++; claims += c; lines += nl * on.length; total += perVisit * on.length;
        if (!String(a.dx || '').trim()) noDx++;
        var b = billTo(pat, a); pay[b.label] = (pay[b.label] || 0) + c;
      });
      days = Object.keys(dset).length;
    } else {
      try {
        var nP = _batchPatSel.size, nS = batchSelSvcs.length, nD = (batchDates || []).filter(function (d) { return d.selected !== false; }).length;
        if (nP && nS && nD) {
          pats = nP; days = nD; claims = nP * nD; lines = nP * nD * nS;
          total = batchSelSvcs.reduce(function (s2, v) { return s2 + (parseFloat(v.rate || 0) * parseInt(v.units || 1, 10)); }, 0) * nP * nD;
        }
      } catch (e) {}
    }
    if (!claims) { el.innerHTML = '<span class="empty">' + (sgMode ? 'No patient has dates selected.' : 'Choose patients, services and dates to bill.') + '</span>'; if (go) go.disabled = true; return; }
    var k = function (n, t, cls) { return '<span class="k' + (cls ? ' ' + cls : '') + '"><b>' + n + '</b>' + t + '</span>'; };
    var payers = Object.keys(pay).sort(function (x, y) { return pay[y] - pay[x]; });
    el.innerHTML = '<div class="r1">' + k(claims, claims === 1 ? 'claim' : 'claims') + k(pats, pats === 1 ? 'patient' : 'patients') + k(days, days === 1 ? 'date' : 'dates') + k(lines, 'service lines') + k(money(total), 'total', 'total') + '</div>' +
      '<div class="r2">' + (payers.length ? 'Bill to ' + payers.map(function (p) { return '<span class="pay">' + esc(p) + ' <b>' + pay[p] + '</b></span>'; }).join('') : '') +
      (noDx ? '<span class="warn">• ' + noDx + ' without diagnosis</span>' : '') + '</div>';
    if (go) go.disabled = false;
  };

  window.renderSGBatchPatients = function (sg) {
    css();
    if (window._lastSGId !== sg.id) { window._lastSGId = sg.id; _sgBatchState = {}; _open = {}; }
    window._sgBatchCur = sg;
    var db = getDB(), el = document.getElementById('mb-sg-pat-rows'); if (!el) return;
    var rends = (db.rendering || []).filter(function (r) { return r.providerId === activeProviderId; });
    var refs = (db.referring || []).filter(function (r) { return r.providerId === activeProviderId; });
    var facs = (db.facilities || []).filter(function (f) { return f.providerId === activeProviderId; });
    if (!sg.patients || !sg.patients.length) { el.innerHTML = '<div class="sgx-empty" style="border:0">No patients in this group. Edit the service group to add them.</div>'; return; }
    var perVisit = groupTotal(sg.lines), grouped = !!(document.getElementById('mb-group-dates') || {}).checked;
    var inc = 0;
    var rows = sg.patients.map(function (a) {
      var pat = (db.patients || []).find(function (p) { return p.id === a.patientId; });
      if (!pat) return '';
      var pid = a.patientId;
      if (!_sgBatchState[pid]) _sgBatchState[pid] = { included: true, dates: getSGBatchDates().map(function (d) { return Object.assign({}, d, { on: true }); }), rendId: '', refId: '', facId: '' };
      var st = _sgBatchState[pid]; if (st.included) inc++;
      var dx = (a.dx || '').split(',').map(function (d) { return d.trim(); }).filter(Boolean);
      var days = (st.dates || []).filter(function (d) { return d.on !== false; }).length;
      var b = billTo(pat, a), ini = ((pat.first || '?')[0] + (pat.last || '?')[0]).toUpperCase();
      var sel = function (list, cur, first, fmt) { return '<option value="">' + first + '</option>' + list.map(function (x) { return '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + esc(fmt(x)) + '</option>'; }).join(''); };
      var det = _open[pid] ? '<div class="sgb-det">' +
          '<div><label>Dates for this patient</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><div class="date-chips" id="sg-dates-' + esc(pid) + '" style="display:flex;flex-wrap:wrap;gap:4px">' +
            (st.dates || []).map(function (d, di) { return '<span class="dchip ' + (d.on ? 'on' : '') + '" onclick="_toggleSGDate(\'' + esc(pid) + '\',' + di + ',this);_mbSummary()">' + esc(d.label) + '</span>'; }).join('') + '</div>' +
            '<button class="btn btn-xs" onclick="toggleAllSGPatDates(\'' + esc(pid) + '\',true);_mbSummary()">All</button><button class="btn btn-xs" onclick="toggleAllSGPatDates(\'' + esc(pid) + '\',false);_mbSummary()">None</button></div></div>' +
          '<div class="grid">' +
            '<div><label>Rendering</label><select onchange="_sgBatchState[\'' + esc(pid) + '\'].rendId=this.value">' + sel(rends, st.rendId, 'Group default', function (r) { return r.last + ', ' + r.first; }) + '</select></div>' +
            '<div><label>Referring</label><select onchange="_sgBatchState[\'' + esc(pid) + '\'].refId=this.value">' + sel(refs, st.refId || a.referringId, 'None', function (r) { return r.last + ', ' + r.first; }) + '</select></div>' +
            '<div><label>Facility</label><select onchange="_sgBatchState[\'' + esc(pid) + '\'].facId=this.value">' + sel(facs, st.facId || a.facilityId, 'Group default', function (f) { return f.name; }) + '</select></div>' +
            '<div><label>Prior auth #</label><input value="' + esc(st.auth != null ? st.auth : (a.auth || '')) + '" placeholder="Optional" oninput="_sgBatchState[\'' + esc(pid) + '\'].auth=this.value"></div>' +
          '</div></div>' : '';
      return '<div class="sgb-row' + (st.included ? '' : ' skip') + '"><div class="sgb-main">' +
        '<input type="checkbox"' + (st.included ? ' checked' : '') + ' aria-label="Include patient" onchange="_sgbToggle(\'' + esc(pid) + '\',this.checked)">' +
        '<div class="sgx-who"><span class="sgx-av ' + avClass(pat) + '">' + esc(ini) + '</span><div style="min-width:0"><div class="nm">' + esc((pat.last || '').toUpperCase() + ', ' + (pat.first || '')) + '</div><div class="mt">File #' + esc(pat.acct || '') + '</div></div></div>' +
        '<span class="sgb-chip k-' + b.kind + '" data-tip="Billed to (set in Edit service group)">' + ico('credit-card', 12) + esc(b.label) + (b.memberId ? ' • ' + esc(b.memberId) : '') + '</span>' +
        (dx.length ? '<span class="sgb-dx" title="' + esc(dx.join(', ')) + '">' + esc(dx.join(', ')) + '</span>' : '<span class="sgb-dx miss">No diagnosis</span>') +
        '<span class="sgb-n">' + days + ' day' + (days === 1 ? '' : 's') + '</span>' +
        '<span class="sgb-amt">' + money(perVisit * days) + '</span>' +
        '<button class="sgb-more" data-tip="' + (_open[pid] ? 'Hide details' : 'Dates, rendering, facility, auth') + '" onclick="_sgbMore(\'' + esc(pid) + '\')">' + ico(_open[pid] ? 'chevron-up' : 'chevron-down', 16) + '</button>' +
        '</div>' + det + '</div>';
    }).join('');
    el.innerHTML = '<div class="sgb-tools" style="padding:8px 12px 0"><span class="n">' + inc + ' of ' + sg.patients.length + ' patients included' + (grouped ? ' • 1 claim per patient' : ' • 1 claim per patient per day') + '</span><span class="sgx-sp"></span>' +
      '<button class="btn btn-xs" onclick="_sgbAll(true)">Select all</button><button class="btn btn-xs" onclick="_sgbAll(false)">None</button></div>' + rows;
    _mbSummary();
    icons();
  };
  css();
})();
