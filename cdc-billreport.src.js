/*
 * ClaimDataCare  •  Biweekly Billing, Collections & Insurance Status Report
 * File: cdc-billreport.js  •  v1.0   (Admin  >  Billing Report)
 *
 * Everything is calculated from ClaimDataCare data: the claims (created here, sent through the
 * clearinghouse), their clearinghouse responses (accepted / rejected) and the ERA 835 payments
 * posted to each claim (claimEOB). Nothing is typed by hand.
 *   • Reporting is by date of service; payment, denial and recoupment dates are shown with them
 *   • Biweekly periods (1-15, 16-end of month) starting September 1, 2026
 *   • Outstanding balance and aging are calculated here (billed - paid - adjustments), because the
 *     clearinghouse keeps the original billed amount after posting
 *   • Client detail: every service with primary and secondary payment on the same line,
 *     extra lines for recoupments and corrected claims, short denial reasons in Notes
 *   • PDF in the provider's report format (logo and header from the billing provider) and Excel
 */
(function () {
  'use strict';
  var START = '2026-09-01';
  var PREPARED_BY = 'Integrated Medical Billing Services';
  var TEAM = 'IMBS Billing Team';

  /* ---------------- small helpers ---------------- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return window.cdcIcon ? cdcIcon(n, s || 15) : '<i data-lucide="' + n + '" class="lci" style="width:' + (s || 15) + 'px;height:' + (s || 15) + 'px"></i>'; }
  function icons() { try { setTimeout(_renderLucideIcons, 20); } catch (e) {} }
  function r2(n) { return Math.round((n || 0) * 100) / 100; }
  function money(n) { var v = r2(n); return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(a, b) { return b ? (Math.round(a / b * 1000) / 10) + '%' : '0%'; }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // any date format seen in the data -> YYYY-MM-DD
  function nd(v) {
    if (!v) return '';
    if (typeof v === 'number') return iso(new Date(v));
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    var d = new Date(s); return isNaN(d) ? '' : iso(d);
  }
  function us(d) { var s = nd(d); return s ? s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4) : ''; }
  function days(from, to) { if (!from) return 0; return Math.max(0, Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5)); }
  function addDays(d, n) { var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); }
  function up(s) { return String(s || '').trim().toUpperCase(); }

  /* ---------------- biweekly periods from September 1, 2026 ---------------- */
  function periods() {
    var out = [], today = iso(new Date()), y = 2026, m = 8;   // month index 8 = September
    for (var guard = 0; guard < 120; guard++) {
      var last = new Date(y, m + 1, 0).getDate();
      [[1, 15], [16, last]].forEach(function (p) {
        var from = iso(new Date(y, m, p[0])), to = iso(new Date(y, m, p[1]));
        if (from <= today) out.push({ key: from, from: from, to: to, label: new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' }) + ' ' + p[0] + ' - ' + p[1] + ', ' + y });
      });
      m++; if (m > 11) { m = 0; y++; }
      if (iso(new Date(y, m, 1)) > today) break;
    }
    return out.reverse();
  }
  function prevPeriod(p) {
    var all = periods().slice().reverse(), i = all.findIndex(function (x) { return x.key === p.key; });
    if (i > 0) return all[i - 1];
    var f = new Date(p.from + 'T12:00:00'); f.setDate(f.getDate() - 15);
    var d = f.getDate() <= 15 ? 1 : 16, y = f.getFullYear(), m = f.getMonth();
    var to = d === 1 ? 15 : new Date(y, m + 1, 0).getDate();
    return { key: iso(new Date(y, m, d)), from: iso(new Date(y, m, d)), to: iso(new Date(y, m, to)), label: 'previous period' };
  }

  /* ---------------- short denial reasons ---------------- */
  var SHORT = {
    '1': 'Deductible', '2': 'Coinsurance', '3': 'Copay', '4': 'Modifier issue', '5': 'POS inconsistent', '6': 'Age inconsistent',
    '9': 'Dx/age mismatch', '11': 'Dx inconsistent', '15': 'Auth number invalid', '16': 'Missing info', '18': 'Duplicate',
    '19': 'Work injury', '22': 'COB / other payer', '23': 'Prior payer adj.', '24': 'Capitation / managed care', '26': 'Before coverage',
    '27': 'Coverage ended', '29': 'Timely filing', '31': 'Not a member', '45': 'Contractual', '50': 'Not medically necessary',
    '51': 'Pre-existing', '58': 'Wrong place of service', '96': 'Non-covered', '97': 'Bundled', '107': 'Related claim denied',
    '109': 'Wrong payer', '119': 'Benefit maximum', '146': 'Dx invalid', '151': 'Frequency limit', '167': 'Dx not covered',
    '170': 'Provider type not covered', '181': 'Code invalid for DOS', '182': 'Modifier invalid', '185': 'Rendering not eligible',
    '197': 'No authorization', '198': 'Auth exceeded', '204': 'Not covered by plan', '226': 'Info requested not received',
    '227': 'Info incomplete', '234': 'Not billed separately', '242': 'Out of network', '252': 'Documentation needed', '253': 'Sequestration',
    'B7': 'Provider not certified', 'B9': 'Hospice', 'B11': 'Sent to other payer', 'B13': 'Previously paid', 'B15': 'Needs qualifying service', 'A1': 'Claim denied', 'N/A': ''
  };
  function shortReason(group, code) {
    var c = String(code || '').toUpperCase(), g = String(group || '').toUpperCase();
    var txt = SHORT[c] || (typeof _getCARCDesc === 'function' ? String(_getCARCDesc(c)).split(/\s+/).slice(0, 4).join(' ') : '');
    return (g ? g + '-' : '') + c + (txt ? ' ' + txt : '');
  }
  // what to do about a denial / rejection, by reason code
  function actionFor(code) {
    var c = String(code || '').toUpperCase();
    var A = {
      '16': 'Correct missing data and resubmit', '4': 'Fix modifier and resubmit', '11': 'Review diagnosis and resubmit', '146': 'Correct diagnosis and resubmit',
      '18': 'Verify payment on original claim; no resubmission', '22': 'Bill the primary payer first, then this payer', '27': 'Verify eligibility; bill the active payer',
      '26': 'Verify eligibility dates', '31': 'Verify member ID / eligibility', '29': 'Appeal with proof of timely filing', '50': 'Appeal with medical records',
      '96': 'Review coverage; write off or bill client per policy', '97': 'Review bundling / NCCI edits', '109': 'Resubmit to the correct payer',
      '119': 'Benefit maximum reached; review with provider', '151': 'Review frequency limits / authorization', '167': 'Review diagnosis coverage',
      '197': 'Obtain authorization and appeal', '198': 'Request authorization extension and appeal', '204': 'Not covered; review with provider',
      '226': 'Send requested records', '227': 'Send complete records', '252': 'Send documentation', '242': 'Review network status', 'B7': 'Review provider enrollment'
    };
    return A[c] || 'Review denial and correct or appeal';
  }
  var CONTRACTUAL = { '45': 1, '253': 1, '59': 1, '42': 1, '94': 1, '131': 1 };

  /* ---------------- the numbers ---------------- */
  function payerOfClaim(claim, pat) {
    var n = '';
    try { var r = _resolveClaimIns(claim, pat); n = r && r.ins1 && (r.ins1.name || r.ins1.payerName); } catch (e) {}
    return up(n || claim.primaryPayerName || claim.payerName || 'NO INSURANCE');
  }
  function secondaryName(claim, pat) {
    try { var r = _resolveClaimIns(claim, pat); return up(r && r.ins2 && (r.ins2.name || r.ins2.payerName)); } catch (e) { return ''; }
  }
  function claimDOS(c) {
    var ds = (c.lines || []).map(function (l) { return nd(l.dos); }).filter(Boolean).sort();
    return nd(c.dos) || ds[0] || '';
  }
  function eobRole(e, claim, pat) {   // 'pri' | 'sec' | 'rev'
    var sc = String(e.statusCode || '');
    if (sc === '22' || (parseFloat(e.paid) || 0) < 0) return 'rev';
    if (sc === '2' || sc === '20' || sc === '3' || sc === '21') return 'sec';
    if (sc === '1' || sc === '19') return 'pri';
    var s2 = secondaryName(claim, pat);
    if (s2 && up(e.payerName) && (up(e.payerName).indexOf(s2.slice(0, 8)) === 0 || s2.indexOf(up(e.payerName).slice(0, 8)) === 0)) return 'sec';
    return e.isSecondary ? 'sec' : 'pri';
  }
  // split one ERA entry across the claim's service lines
  function allocate(claim, e) {
    var lines = claim.lines || [], out = lines.map(function () { return { paid: 0, adj: 0, codes: [] }; });
    if (!lines.length) return out;
    var used = {};
    var lineIdx = function (cpt) {
      for (var i = 0; i < lines.length; i++) if (!used[i] && up(lines[i].cpt) === up(cpt)) { used[i] = 1; return i; }
      return -1;
    };
    if (Array.isArray(e.svcLines) && e.svcLines.length) {
      e.svcLines.forEach(function (sl) {
        var i = lineIdx(sl.cpt); if (i < 0) return;
        out[i].paid += parseFloat(sl.paid) || 0;
        (sl.adjustments || []).forEach(function (a) { out[i].adj += parseFloat(a.amount) || 0; out[i].codes.push([a.group, a.code]); });
      });
      return out;
    }
    // older posts: spread the paid amount over the lines, net of each line's own adjustments
    var est = lines.map(function (l) { return parseFloat(l.charge) || 0; });
    (e.adjLines || []).forEach(function (a) {
      var same = []; lines.forEach(function (l, i) { if (up(l.cpt) === up(a.cpt)) same.push(i); });
      if (!same.length) same = lines.map(function (_, i) { return i; });
      same.forEach(function (i) { var share = (parseFloat(a.amount) || 0) / same.length; est[i] -= share; out[i].adj += share; out[i].codes.push([a.group, a.code]); });
    });
    var sum = est.reduce(function (s, v) { return s + Math.max(0, v); }, 0), paid = parseFloat(e.paid) || 0;
    lines.forEach(function (l, i) { out[i].paid = sum ? paid * Math.max(0, est[i]) / sum : paid / lines.length; });
    return out;
  }

  function build(p) {
    var db = getDB(), pid = activeProviderId, asOf = iso(new Date());
    var prov = (db.providers || []).find(function (x) { return x.id === pid; }) || {};
    var pats = {}; (db.patients || []).forEach(function (x) { pats[x.id] = x; });
    var EOB = db.claimEOB || {};
    var all = (db.claims || []).filter(function (c) { return c.providerId === pid && !/void|deleted/i.test(c.status || ''); });

    function info(c) {
      var pat = pats[c.patId] || {}, billed = (c.lines || []).reduce(function (s, l) { return s + (parseFloat(l.charge) || 0); }, 0);
      var eobs = (EOB[c.id] || []).slice().sort(function (a, b) { return nd(a.checkDate) < nd(b.checkDate) ? -1 : 1; });
      var pri = 0, sec = 0, rev = 0, adj = 0, contr = 0, pr = 0, denied = false, denyCodes = [], priDate = '', secDate = '', lastDate = '';
      eobs.forEach(function (e) {
        var role = eobRole(e, c, pat), paid = parseFloat(e.paid) || 0, d = nd(e.checkDate) || nd(e.postedAt);
        if (role === 'rev') rev += paid; else if (role === 'sec') { sec += paid; secDate = d; } else { pri += paid; priDate = d; }
        lastDate = d;
        (e.adjLines || []).forEach(function (a) {
          var amt = parseFloat(a.amount) || 0;
          if (a.group === 'PR') pr += amt; else { adj += amt; if (CONTRACTUAL[String(a.code)]) contr += amt; else if (paid <= 0) denyCodes.push([a.group, a.code]); }
        });
        if (e.isDenial) denied = true;
      });
      var paidAll = pri + sec + rev;
      if (paidAll > 0) denied = false;
      var st = up(c.status);
      var status = denied || st === 'DENIED' ? 'Denied' : st === 'REJECTED' ? 'Rejected'
        : paidAll > 0 && (c.readyForSecondary || st === 'PARTIALLY_PAID') ? 'Partial' : paidAll > 0 ? 'Paid'
        : eobs.length ? 'Adjudicated' : /SUBMIT|ACCEPT|TRANSMIT|SENT/.test(st) ? 'Pending' : 'Not submitted';
      var outstanding = 0;
      if (status === 'Pending' || status === 'Rejected' || status === 'Not submitted' || status === 'Denied') outstanding = Math.max(0, billed - paidAll);
      else if (status === 'Partial') outstanding = Math.max(0, billed - paidAll - contr);
      return { c: c, pat: pat, payer: payerOfClaim(c, pat), sec2: secondaryName(c, pat), dos: claimDOS(c), billed: billed, eobs: eobs,
        pri: pri, sec: sec, rev: rev, paid: paidAll, adj: adj, contr: contr, pr: pr, status: status, denyCodes: denyCodes,
        priDate: priDate, secDate: secDate, lastDate: lastDate, outstanding: outstanding, corrected: !!c.correctedClaimFlag };
    }
    var infos = all.map(info).filter(function (x) { return x.dos && x.dos >= START; });
    var inP = infos.filter(function (x) { return x.dos >= p.from && x.dos <= p.to; });
    var toP = infos.filter(function (x) { return x.dos <= p.to; });   // cumulative A/R up to the end of the period

    // payer collection ratios (Sept 1 to date) for the expected-collections estimate
    var ratio = {}, tot = { b: 0, p: 0 };
    infos.filter(function (x) { return x.paid > 0; }).forEach(function (x) { var r = ratio[x.payer] = ratio[x.payer] || { b: 0, p: 0 }; r.b += x.billed; r.p += x.paid; tot.b += x.billed; tot.p += x.paid; });
    var rateOf = function (payer) { var r = ratio[payer]; return r && r.b ? r.p / r.b : (tot.b ? tot.p / tot.b : 0); };

    var sum = function (arr, f) { return arr.reduce(function (s, x) { return s + (f(x) || 0); }, 0); };
    var K = {
      charges: sum(inP, function (x) { return x.billed; }), claims: inP.length,
      payments: sum(inP, function (x) { return x.paid; }), adjustments: sum(inP, function (x) { return x.adj; }),
      outstanding: sum(toP, function (x) { return x.outstanding; }),
      pending: toP.filter(function (x) { return x.status === 'Pending' || x.status === 'Partial'; }).length,
      denied: inP.filter(function (x) { return x.status === 'Denied' || x.status === 'Rejected'; }).length,
      deniedAmt: sum(inP.filter(function (x) { return x.status === 'Denied' || x.status === 'Rejected'; }), function (x) { return x.billed - x.paid; }),
      corrected: inP.filter(function (x) { return x.corrected; }).length,
      expected: sum(toP.filter(function (x) { return x.status === 'Pending' || x.status === 'Partial'; }), function (x) { return x.outstanding * rateOf(x.payer); })
    };
    var adjudicated = inP.filter(function (x) { return x.eobs.length; });
    K.collectionRate = pct(sum(adjudicated, function (x) { return x.paid; }), sum(adjudicated, function (x) { return x.billed; }));

    // 2. claims submitted, by insurance and service
    var g2 = {};
    inP.forEach(function (x) {
      var cpts = {}; (x.c.lines || []).forEach(function (l) { if (l.cpt) cpts[up(l.cpt)] = (cpts[up(l.cpt)] || 0) + (parseFloat(l.charge) || 0); });
      Object.keys(cpts).forEach(function (cpt) {
        var k = x.payer + '|' + cpt, r = g2[k] = g2[k] || { payer: x.payer, cpt: cpt, claims: 0, billed: 0, st: {} };
        r.claims++; r.billed += cpts[cpt]; r.st[x.status] = (r.st[x.status] || 0) + 1;
      });
    });
    var sec2 = Object.values(g2).sort(function (a, b) { return a.payer < b.payer ? -1 : a.payer > b.payer ? 1 : b.billed - a.billed; })
      .map(function (r) { return [r.payer, r.cpt, r.claims, money(r.billed), Object.keys(r.st).map(function (s) { return r.st[s] + ' ' + s.toLowerCase(); }).join(' • ')]; });

    // 3. payments received (services in the period), by insurance and payment date
    var g3 = {};
    inP.forEach(function (x) {
      x.eobs.forEach(function (e) {
        var d = nd(e.checkDate) || nd(e.postedAt), payer = up(e.payerName) || x.payer, k = payer + '|' + d;
        var r = g3[k] = g3[k] || { payer: payer, date: d, claims: {}, billed: 0, paid: 0, adj: 0 };
        if (!r.claims[x.c.id]) { r.claims[x.c.id] = 1; r.billed += x.billed; }
        r.paid += parseFloat(e.paid) || 0;
        (e.adjLines || []).forEach(function (a) { if (a.group !== 'PR') r.adj += parseFloat(a.amount) || 0; });
      });
    });
    var sec3 = Object.values(g3).sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (r) { var n = Object.keys(r.claims).length; return r.paid < 0 ? [r.payer + ' (recoupment)', us(r.date), n, '', money(r.paid), '', ''] : [r.payer, us(r.date), n, money(r.billed), money(r.paid), money(r.adj), money(Math.max(0, r.billed - r.paid - r.adj))]; });

    // 4. outstanding by insurance + aging (all open claims with DOS up to the end of the period)
    var open = toP.filter(function (x) { return x.outstanding > 0.005; });
    var g4 = {};
    open.forEach(function (x) {
      var r = g4[x.payer] = g4[x.payer] || { payer: x.payer, n: 0, amt: 0, oldest: x.dos, st: {} };
      r.n++; r.amt += x.outstanding; if (x.dos < r.oldest) r.oldest = x.dos; r.st[x.status] = (r.st[x.status] || 0) + 1;
    });
    var sec4 = Object.values(g4).sort(function (a, b) { return b.amt - a.amt; }).map(function (r) {
      var age = days(r.oldest, asOf);
      return [r.payer, r.n, money(r.amt), age + ' days (oldest)', Object.keys(r.st).map(function (s) { return r.st[s] + ' ' + s.toLowerCase(); }).join(' • '), us(addDays(asOf, age > 45 ? 3 : 7))];
    });
    var aging = [0, 0, 0, 0];
    open.forEach(function (x) { var a = days(x.dos, asOf); aging[a <= 30 ? 0 : a <= 60 ? 1 : a <= 90 ? 2 : 3] += x.outstanding; });

    // 5. denied / rejected (services in the period)
    var sec5 = [], denTot = 0, correctedAmt = 0, unrecoverable = 0;
    inP.filter(function (x) { return x.status === 'Denied' || x.status === 'Rejected'; }).forEach(function (x) {
      var amt = x.billed - x.paid; denTot += amt;
      var code = x.denyCodes[0] ? x.denyCodes[0][1] : '';
      var reason = x.status === 'Rejected' ? 'Rejected: ' + String(x.c.rejectReason || 'clearinghouse rejection').slice(0, 60)
        : x.denyCodes.length ? x.denyCodes.slice(0, 2).map(function (d) { return shortReason(d[0], d[1]); }).join('; ') : String(x.c.denialReason || 'Denied');
      var fixed = infos.some(function (y) { return y !== x && y.corrected && y.c.patId === x.c.patId && y.dos === x.dos; });
      if (fixed) correctedAmt += amt;
      if (String(code) === '18' || String(code) === '29') unrecoverable += amt;
      sec5.push([x.payer, (x.c.pcn || '') + ' / ' + ((x.pat.last || '') + ', ' + (x.pat.first || '')).toUpperCase(),
        (x.c.lines || []).map(function (l) { return up(l.cpt); }).filter(Boolean).join(', '), money(amt), reason,
        x.status === 'Rejected' ? 'Correct and resubmit' : actionFor(code), fixed ? 'Corrected & resubmitted' : (x.status === 'Rejected' ? 'Rejected ' + us(x.c.updatedAt) : 'Denied ' + us(x.lastDate))]);
    });

    // 6. reconsiderations: corrected (replacement) claims
    var appealOpen = infos.filter(function (x) { return x.corrected && x.dos <= p.to && x.paid <= 0; }).reduce(function (s2, x) { return s2 + x.billed; }, 0);
    var sec6 = infos.filter(function (x) { return x.corrected && x.dos <= p.to; }).map(function (x) {
      return [x.payer, 'Corrected claim ' + (x.c.pcn || '') + (x.c.originalClaimNumber ? ' (orig. ' + x.c.originalClaimNumber + ')' : ''), money(x.billed),
        us(x.c.submittedAt || x.c.updatedAt), x.paid > 0 ? 'Paid ' + money(x.paid) : x.status, x.paid > 0 ? 'None' : 'Follow up by ' + us(addDays(asOf, 14))];
    });

    // 7. insurance events and anomalies (by event date inside the period, any DOS since Sept 1)
    var ev = [], inEv = function (d) { return d && d >= p.from && d <= p.to; };
    var denByPayer = {};
    infos.forEach(function (x) {
      x.eobs.forEach(function (e) {
        var d = nd(e.checkDate) || nd(e.postedAt); if (!inEv(d)) return;
        var paid = parseFloat(e.paid) || 0, payer = up(e.payerName) || x.payer;
        if (eobRole(e, x.c, x.pat) === 'rev') ev.push([us(d), payer, 'Recoupment / reversal on ' + (x.c.pcn || '') + ' (DOS ' + us(x.dos) + ')', money(Math.abs(paid)) + ' taken back', 'Review reason; resubmit or accept', us(addDays(asOf, 7))]);
        if (paid > x.billed + 0.01) ev.push([us(d), payer, 'Payment above billed amount on ' + (x.c.pcn || ''), money(paid - x.billed) + ' possible overpayment', 'Verify; refund may be requested', us(addDays(asOf, 7))]);
        if (e.isDenial || (paid === 0 && (e.adjLines || []).some(function (a) { return a.group !== 'PR' && !CONTRACTUAL[String(a.code)]; }))) {
          var fa = (e.adjLines || []).find(function (a) { return a.group !== 'PR' && !CONTRACTUAL[String(a.code)]; }) || (e.adjLines || []).find(function (a) { return a.group !== 'PR'; }) || {}, code = fa.code || '', grp = fa.group || 'CO';
          var k = payer + '|' + code, r = denByPayer[k] = denByPayer[k] || { payer: payer, code: code, grp: grp, n: 0, amt: 0, d: d };
          r.n++; r.amt += x.billed; if (d > r.d) r.d = d;
        }
      });
      if (x.pri === 0 && x.sec > 0 && inEv(x.secDate)) ev.push([us(x.secDate), x.sec2 || 'SECONDARY', 'Primary denied, secondary paid ' + (x.c.pcn || ''), money(x.sec) + ' collected from secondary', 'None', '']);
      if (x.c.status === 'rejected' && inEv(nd(x.c.updatedAt))) ev.push([us(x.c.updatedAt), x.payer, 'Clearinghouse rejection ' + (x.c.pcn || ''), money(x.billed) + ' not received by payer', 'Correct and resubmit', us(addDays(asOf, 3))]);
      if ((x.status === 'Pending') && days(x.dos, asOf) > 45 && x.dos <= p.to) ev.push([us(asOf), x.payer, 'No payment response after ' + days(x.dos, asOf) + ' days (' + (x.c.pcn || '') + ')', money(x.billed) + ' at risk', 'Call payer / check claim status', us(addDays(asOf, 3))]);
    });
    Object.values(denByPayer).forEach(function (r) {
      ev.push([us(r.d), r.payer, r.n + ' denial' + (r.n > 1 ? 's' : '') + ' ' + shortReason(r.grp, r.code), money(r.amt) + ' denied', actionFor(r.code), us(addDays(asOf, 7))]);
    });
    (db.eobUnmatched || []).filter(function (u) { return u.providerId === pid && inEv(nd(u.claimData && u.claimData.paidDate) || nd(u.createdAt)); }).forEach(function (u) {
      ev.push([us(nd(u.claimData && u.claimData.paidDate) || nd(u.createdAt)), up(u.payerName), 'Payment with no matching claim (PCN ' + (u.pcn || '') + ')', money(u.amt), 'Match to the correct claim', us(addDays(asOf, 5))]);
    });
    ev.sort(function (a, b) { return nd(a[0]) < nd(b[0]) ? 1 : -1; });

    // 8. high-priority accounts
    var pri8 = [];
    Object.values(denByPayer).filter(function (r) { return r.amt >= 500 || r.n >= 3; }).forEach(function (r) {
      pri8.push(['High', r.payer + ' • ' + shortReason(r.grp, r.code), money(r.amt), r.n + ' claims denied', actionFor(r.code), TEAM, us(addDays(asOf, 7))]);
    });
    ev.filter(function (e) { return /Recoupment/.test(e[2]); }).forEach(function (e) { pri8.push(['High', e[1] + ' • recoupment', e[3].replace(' taken back', '').replace('-$', '$'), e[2], 'Review and dispute if incorrect', TEAM, us(addDays(asOf, 7))]); });
    Object.values(g4).forEach(function (r) {
      var age = days(r.oldest, asOf); if (age > 60 && r.amt > 0) pri8.push([age > 90 ? 'High' : 'Medium', r.payer + ' • aged A/R', money(r.amt), r.n + ' open claims, oldest ' + age + ' days', 'Claim status follow-up / appeal', TEAM, us(addDays(asOf, age > 90 ? 5 : 10))]);
    });

    // 10. action plan for the next 15 days (from everything above)
    var plan = [], seenA = {};
    var addA = function (item, area, due) { var k = item + '|' + area; if (seenA[k]) return; seenA[k] = 1; plan.push([item, area, TEAM, us(due), 'Open']); };
    sec5.forEach(function (r) { addA(r[5], r[0], addDays(asOf, 7)); });
    pri8.forEach(function (r) { addA(r[4], r[1], nd(r[6]) || addDays(asOf, 10)); });
    if (K.pending) addA('Follow up on ' + K.pending + ' pending claims', 'All payers', addDays(asOf, 10));
    addA('Post new ERAs and update this report', 'All payers', addDays(asOf, 14));

    // 9. comparison with the previous period
    var pp = prevPeriod(p), prevIn = infos.filter(function (x) { return x.dos >= pp.from && x.dos <= pp.to; }), prevTo = infos.filter(function (x) { return x.dos <= pp.to; });
    var prevK = {
      charges: sum(prevIn, function (x) { return x.billed; }), payments: sum(prevIn, function (x) { return x.paid; }),
      outstanding: sum(prevTo, function (x) { return x.outstanding; }),
      denied: prevIn.filter(function (x) { return x.status === 'Denied' || x.status === 'Rejected'; }).length,
      pending: prevTo.filter(function (x) { return x.status === 'Pending' || x.status === 'Partial'; }).length, appeals: prevTo.filter(function (x) { return x.corrected; }).length
    };
    var chg = function (a, b, isMoney) { var d = a - b; return (d > 0 ? '+' : '') + (isMoney ? money(d) : d) + (b ? ' (' + (d > 0 ? '+' : '') + Math.round(d / b * 100) + '%)' : ''); };
    var sec9 = [
      ['Amount billed', money(prevK.charges), money(K.charges), chg(K.charges, prevK.charges, true)],
      ['Payments received', money(prevK.payments), money(K.payments), chg(K.payments, prevK.payments, true)],
      ['Outstanding A/R', money(prevK.outstanding), money(K.outstanding), chg(K.outstanding, prevK.outstanding, true)],
      ['Denied claims', prevK.denied, K.denied, chg(K.denied, prevK.denied)],
      ['Pending claims', prevK.pending, K.pending, chg(K.pending, prevK.pending)],
      ['Appeals / corrected pending', prevK.appeals, sec6.length, chg(sec6.length, prevK.appeals)]
    ];

    // 1 + 11. summary and management comments (written from the numbers)
    var topDen = Object.values(denByPayer).sort(function (a, b) { return b.amt - a.amt; })[0];
    var recoups = ev.filter(function (e) { return /Recoupment/.test(e[2]); });
    var summary = K.claims + ' claims with dates of service ' + us(p.from) + ' to ' + us(p.to) + ' were billed for ' + money(K.charges) + '. ' +
      'Payments of ' + money(K.payments) + ' have been received for these services (collection rate ' + K.collectionRate + ' on adjudicated claims). ' +
      (K.denied ? K.denied + ' claim' + (K.denied > 1 ? 's were' : ' was') + ' denied or rejected (' + money(K.deniedAmt) + '). ' : 'No denials or rejections for these services. ') +
      'Total outstanding A/R is ' + money(K.outstanding) + (recoups.length ? '; ' + recoups.length + ' recoupment' + (recoups.length > 1 ? 's were' : ' was') + ' received in the period.' : '.');
    var concerns = [];
    if (topDen) concerns.push('Most significant denial: ' + topDen.payer + ' ' + shortReason(topDen.grp, topDen.code) + ' (' + topDen.n + ' claims, ' + money(topDen.amt) + ').');
    if (aging[3] > 0) concerns.push(money(aging[3]) + ' is older than 90 days.');
    if (recoups.length) concerns.push(recoups.length + ' recoupment' + (recoups.length > 1 ? 's' : '') + ' reduced collections in this period.');
    if (!concerns.length) concerns.push('No major concerns in this period.');
    var mgmt = [];
    if (Object.values(denByPayer).some(function (r) { return /^(197|198|27|31|B7|170|185)$/.test(String(r.code)); })) mgmt.push('Authorization, eligibility or enrollment denials need provider action.');
    if (recoups.length) mgmt.push('Review recoupments with the payer.');
    if (aging[3] > 0) mgmt.push('Decide on claims older than 90 days (appeal or write off).');
    if (!mgmt.length) mgmt.push('None at this time.');

    // 12. client detail: every service, primary and secondary payment on one line
    var cl = {};
    inP.forEach(function (x) {
      var name = ((x.pat.last || '') + ', ' + (x.pat.first || '')).toUpperCase(), key = x.c.patId;
      var C = cl[key] = cl[key] || { name: name, acct: x.pat.acct || '', rows: [] };
      var priE = x.eobs.filter(function (e) { return eobRole(e, x.c, x.pat) === 'pri'; });
      var secE = x.eobs.filter(function (e) { return eobRole(e, x.c, x.pat) === 'sec'; });
      var revE = x.eobs.filter(function (e) { return eobRole(e, x.c, x.pat) === 'rev'; });
      var pa = (x.c.lines || []).map(function () { return { paid: 0, codes: [] }; }), sa = pa.map(function () { return { paid: 0, codes: [] }; });
      priE.forEach(function (e) { allocate(x.c, e).forEach(function (v, i) { pa[i].paid += v.paid; pa[i].codes = pa[i].codes.concat(v.codes); }); });
      secE.forEach(function (e) { allocate(x.c, e).forEach(function (v, i) { sa[i].paid += v.paid; sa[i].codes = sa[i].codes.concat(v.codes); }); });
      (x.c.lines || []).forEach(function (l, i) {
        if (!l.cpt) return;
        var notes = [];
        if (x.corrected) notes.push('Corrected claim');
        var dn = pa[i].codes.filter(function (c) { return c[0] !== 'PR' && !CONTRACTUAL[String(c[1])]; });
        if (priE.length && pa[i].paid <= 0 && dn.length) notes.push('Pri: ' + shortReason(dn[0][0], dn[0][1]));
        var sdn = sa[i].codes.filter(function (c) { return c[0] !== 'PR' && !CONTRACTUAL[String(c[1])]; });
        if (secE.length && sa[i].paid <= 0 && sdn.length) notes.push('Sec: ' + shortReason(sdn[0][0], sdn[0][1]));
        var prc = pa[i].codes.filter(function (c) { return c[0] === 'PR'; });
        if (prc.length && !secE.length) notes.push(shortReason(prc[0][0], prc[0][1]));
        if (x.status === 'Rejected') notes.push('Rejected: ' + String(x.c.rejectReason || '').slice(0, 40));
        if (!x.eobs.length && x.status !== 'Rejected') notes.push(x.status);
        C.rows.push({ dos: nd(l.dos) || x.dos, cpt: up(l.cpt) + (l.mod1 ? '-' + up(l.mod1) : ''), units: l.units || 1, billed: parseFloat(l.charge) || 0,
          pri: priE.length ? pa[i].paid : null, priDate: x.priDate, sec: secE.length ? sa[i].paid : null, secDate: x.secDate, notes: notes.join(' • '), pcn: x.c.pcn || '' });
      });
      // extra lines: recoupments (and any further payment on a corrected claim)
      revE.forEach(function (e) {
        C.rows.push({ dos: x.dos, cpt: 'Recoupment', units: '', billed: 0, pri: parseFloat(e.paid) || 0, priDate: nd(e.checkDate), sec: null, secDate: '', notes: 'Reversal by ' + up(e.payerName) + ' on ' + (x.c.pcn || ''), extra: true, pcn: x.c.pcn || '' });
      });
    });
    var clients = Object.values(cl).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    clients.forEach(function (C) { C.rows.sort(function (a, b) { return a.dos < b.dos ? -1 : a.dos > b.dos ? 1 : a.pcn < b.pcn ? -1 : a.pcn > b.pcn ? 1 : (a.extra ? 1 : 0) - (b.extra ? 1 : 0); }); });

    return { p: p, pp: pp, asOf: asOf, prov: prov, K: K, summary: summary, sec2: sec2, sec3: sec3, sec4: sec4, aging: aging, sec5: sec5,
      den: { total: denTot, corrected: correctedAmt, appeal: appealOpen, unrec: unrecoverable }, sec6: sec6, sec7: ev, sec8: pri8, sec9: sec9, plan: plan,
      concerns: concerns, mgmt: mgmt, expectedNext: K.expected, clients: clients };
  }

  /* ---------------- screen ---------------- */
  var CSS = [
    '#sec-billing-report{flex-direction:column}',
    '.brp{display:flex;flex-direction:column;gap:14px;padding:4px 0 24px}',
    '.brp-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #E4E9F1;padding-bottom:12px}',
    '.brp-t{display:flex;align-items:center;gap:10px;margin:0;font-size:20px;font-weight:700;color:#0B1526}',
    '.brp-t .ic{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;background:#7B2FF7}',
    '.brp-hd select{height:36px;padding:0 10px;border:1px solid #E4E9F1;border-radius:10px;font-family:inherit;font-size:13px;background:#fff;color:#0B1526}',
    '.brp-sp{flex:1}',
    '.brp-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}',
    '.brp-k{border:1px solid #E4E9F1;border-radius:12px;padding:12px 14px;background:#fff}',
    '.brp-k small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579}',
    '.brp-k b{display:block;font-size:19px;font-weight:700;color:#0B1526;margin-top:4px;font-variant-numeric:tabular-nums}',
    '.brp-k.w b{color:#C8286A}',
    '.brp-card{border:1px solid #E4E9F1;border-radius:14px;background:#fff;padding:14px 16px;min-width:0}',
    '.brp-card h3{margin:0 0 10px;font-size:13px;font-weight:700;color:#0B1526}',
    '.brp-card p{margin:0;font-size:12.5px;line-height:1.55;color:#3A475C}',
    '.brp-g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}',
    '.brp-tw{overflow-x:auto}',
    '.brp-tbl{width:100%;border-collapse:collapse;font-size:12px}',
    '.brp-tbl th{background:#F6F8FB;padding:7px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;white-space:nowrap}',
    '.brp-tbl td{padding:6px 8px;border-top:1px solid #F1F4F8;color:#0B1526;vertical-align:top}',
    '.brp-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.brp-tbl tr.cl td{background:#F8FAFC;font-weight:700}',
    '.brp-tbl tr.x td{color:#C8286A}',
    '.brp-empty{font-size:12.5px;color:#586579;padding:6px 0}',
    '@media (max-width:1100px){.brp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.brp-g2{grid-template-columns:minmax(0,1fr)}}'
  ].join('\n');
  var _cur = null;

  function tbl(head, rows, numCols) {
    if (!rows.length) return '<div class="brp-empty">Nothing to report for this period.</div>';
    numCols = numCols || [];
    return '<div class="brp-tw"><table class="brp-tbl"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' style="text-align:right"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function clientRows(R) {
    var out = [];
    R.clients.forEach(function (C) {
      out.push('<tr class="cl"><td colspan="9">' + esc(C.name) + (C.acct ? '  •  File #' + esc(C.acct) : '') + '</td></tr>');
      C.rows.forEach(function (r) {
        out.push('<tr' + (r.extra ? ' class="x"' : '') + '><td>' + us(r.dos) + '</td><td>' + esc(r.cpt) + '</td><td class="n">' + esc(r.units) + '</td><td class="n">' + (r.extra ? '' : money(r.billed)) + '</td>' +
          '<td class="n">' + (r.pri == null ? '' : money(r.pri)) + '</td><td>' + us(r.priDate) + '</td><td class="n">' + (r.sec == null ? '' : money(r.sec)) + '</td><td>' + us(r.secDate) + '</td><td>' + esc(r.notes) + '</td></tr>');
      });
    });
    return out.length ? '<div class="brp-tw"><table class="brp-tbl"><thead><tr><th>DOS</th><th>Service</th><th style="text-align:right">Units</th><th style="text-align:right">Billed</th><th style="text-align:right">Primary paid</th><th>Pri. date</th><th style="text-align:right">Secondary paid</th><th>Sec. date</th><th>Notes</th></tr></thead><tbody>' + out.join('') + '</tbody></table></div>'
      : '<div class="brp-empty">No services in this period.</div>';
  }

  window.renderBillingReport = function () {
    var sec = document.getElementById('sec-billing-report'); if (!sec) return;
    if (!document.getElementById('brp-style')) { var st = document.createElement('style'); st.id = 'brp-style'; st.textContent = CSS; document.head.appendChild(st); }
    var ps = periods(), sel = (document.getElementById('brp-period') || {}).value || (ps[1] || ps[0]).key;
    var p = ps.find(function (x) { return x.key === sel; }) || ps[0];
    var R = _cur = build(p), K = R.K;
    var k = function (l, v, w) { return '<div class="brp-k' + (w ? ' w' : '') + '"><small>' + l + '</small><b>' + v + '</b></div>'; };
    sec.innerHTML = '<div class="page-body"><div class="brp">' +
      '<div class="brp-hd"><h1 class="brp-t"><span class="ic">' + ico('file-bar-chart', 17) + '</span>Billing Report</h1>' +
        '<span style="font-size:12.5px;color:#586579">' + esc(R.prov.name || '') + '</span><span class="brp-sp"></span>' +
        '<select id="brp-period" onchange="renderBillingReport()" data-tip="Reporting period (by date of service)">' + ps.map(function (x) { return '<option value="' + x.key + '"' + (x.key === p.key ? ' selected' : '') + '>' + x.label + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="cdc-alt" onclick="_brSyncERA()">' + ico('refresh-cw', 15) + 'Get ERAs</button>' +
        '<button type="button" class="cdc-ok" onclick="_brExcel()">' + ico('file-spreadsheet', 15) + 'Excel</button>' +
        '<button type="button" class="cdc-ok" onclick="_brPDF()">' + ico('file-down', 15) + 'PDF</button></div>' +
      '<div class="brp-kpis">' + k('Billed', money(K.charges)) + k('Claims', K.claims) + k('Payments', money(K.payments)) + k('Collection rate', K.collectionRate) +
        k('Outstanding A/R', money(K.outstanding), K.outstanding > 0) + k('Denied / rejected', K.denied, K.denied > 0) + '</div>' +
      '<div class="brp-card"><h3>1. Executive summary</h3><p>' + esc(R.summary) + '</p></div>' +
      '<div class="brp-card"><h3>2. Claims submitted during the period</h3>' + tbl(['Insurance', 'Service / CPT', 'Claims', 'Amount billed', 'Status'], R.sec2, [2, 3]) + '</div>' +
      '<div class="brp-card"><h3>3. Payments received</h3>' + tbl(['Insurance', 'Date', 'Claims paid', 'Billed', 'Paid', 'Adjustment', 'Balance'], R.sec3, [2, 3, 4, 5, 6]) + '</div>' +
      '<div class="brp-g2"><div class="brp-card"><h3>4. Outstanding / pending claims</h3>' + tbl(['Insurance', '# Claims', 'Outstanding', 'Age', 'Status', 'Follow-up'], R.sec4, [1, 2]) + '</div>' +
        '<div class="brp-card"><h3>Aging summary</h3>' + tbl(['Aging', 'Amount'], [['0-30 days', money(R.aging[0])], ['31-60 days', money(R.aging[1])], ['61-90 days', money(R.aging[2])], ['90+ days', money(R.aging[3])], ['Total outstanding A/R', money(R.aging.reduce(function (a, b) { return a + b; }, 0))]], [1]) + '</div></div>' +
      '<div class="brp-card"><h3>5. Denied / rejected claims</h3>' + tbl(['Insurance', 'Claim / Client', 'CPT', 'Amount', 'Reason', 'Action', 'Status'], R.sec5, [3]) + '</div>' +
      '<div class="brp-card"><h3>7. Insurance events and anomalies</h3>' + tbl(['Date', 'Insurance', 'Event / issue', 'Impact', 'Action', 'Follow-up'], R.sec7) + '</div>' +
      '<div class="brp-card"><h3>Client detail</h3>' + clientRows(R) + '</div>' +
      '</div></div>';
    icons();
  };

  window._brSyncERA = function () {
    try { if (typeof fetchERAFromClearinghouse === 'function') return fetchERAFromClearinghouse(); } catch (e) {}
    try { toast('ERA import is not available', 'warn'); } catch (e) {}
  };

  /* ---------------- PDF in the provider's report format ---------------- */
  window._brPDF = async function () {
    var R = _cur || build(periods()[0]);
    var fonts = null;
    try { if (!window.__cdcInvFonts && typeof _cdcLoadModule === 'function') await _cdcLoadModule('cdc-fonts.js'); fonts = window.__cdcInvFonts || null; } catch (e) {}
    var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    var W = 215.9, H = 279.4, M = 14, RX = W - M, CW = RX - M, BODY = 'helvetica', HEAD = 'helvetica';
    if (fonts) {
      try {
        doc.addFileToVFS('p.ttf', fonts.plex); doc.addFont('p.ttf', 'Plex', 'normal');
        doc.addFileToVFS('pb.ttf', fonts.plexB); doc.addFont('pb.ttf', 'Plex', 'bold');
        doc.addFileToVFS('s.ttf', fonts.sora); doc.addFont('s.ttf', 'Sora', 'bold'); BODY = 'Plex'; HEAD = 'Sora';
      } catch (e) {}
    }
    var INK = [11, 21, 38], INK2 = [58, 71, 92], MUTED = [88, 101, 121], LINE = [214, 220, 230], HEADF = [238, 241, 246];
    var txt = function (s, x, y, o) { o = o || {}; doc.setFont(o.head ? HEAD : BODY, o.bold || o.head ? 'bold' : 'normal'); doc.setFontSize(o.size || 8.5); doc.setTextColor.apply(doc, o.color || INK); doc.text(s, x, y, { align: o.align || 'left', maxWidth: o.maxWidth }); };
    var y = M, prov = R.prov, name = prov.name || '';
    var footer = name + ' • Biweekly Billing & Insurance Report';

    // letterhead: logo left, provider name and contact centred
    if (prov.logo) { try { var pr = doc.getImageProperties(prov.logo), k = Math.min(30 / pr.width, 18 / pr.height); doc.addImage(prov.logo, pr.fileType || 'PNG', M, y, pr.width * k, pr.height * k, undefined, 'FAST'); } catch (e) {} }
    txt(name, W / 2, y + 6, { head: true, size: 14, align: 'center' });
    var addr = [prov.addr1, prov.addr2, [prov.city, prov.state].filter(Boolean).join(' '), prov.zip].filter(Boolean).join(', ');
    var contact = [prov.phone ? 'Phone: ' + (typeof fmtPhone === 'function' ? fmtPhone(prov.phone) : prov.phone) : '', prov.fax ? 'Fax: ' + prov.fax : ''].filter(Boolean).join(' | ');
    txt([addr, contact].filter(Boolean).join(', '), W / 2, y + 11, { size: 8.5, color: INK2, align: 'center' });
    if (prov.email) txt('Email: ' + String(prov.email).toLowerCase(), W / 2, y + 15.5, { size: 8.5, color: INK2, align: 'center' });
    y += 24;
    txt('BIWEEKLY BILLING, COLLECTIONS & INSURANCE STATUS REPORT', W / 2, y, { head: true, size: 11.5, align: 'center' }); y += 6;

    // generic table with wrapping, page breaks and repeated header
    var table = function (cols, rows, opt) {
      opt = opt || {}; var fs = opt.size || 7.6, pad = 1.6;
      var total = cols.reduce(function (s, c) { return s + c.w; }, 0), sc = CW / total;
      cols.forEach(function (c) { c.ww = c.w * sc; });
      var head = function () {
        doc.setFont(BODY, 'bold'); doc.setFontSize(fs);
        var hl = cols.map(function (c) { return doc.splitTextToSize(c.h, c.ww - pad * 2); }), hh = Math.max.apply(null, hl.map(function (l) { return l.length; })) * 3.3 + 2.6;
        doc.setFillColor.apply(doc, HEADF); doc.rect(M, y, CW, hh, 'F');
        var x = M; cols.forEach(function (c, i) { txt(hl[i], c.align === 'right' ? x + c.ww - pad : x + pad, y + 3.6, { size: fs, bold: true, align: c.align || 'left' }); x += c.ww; });
        doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.rect(M, y, CW, hh);
        y += hh;
      };
      if (y > H - 30) { doc.addPage(); y = M; }
      head();
      if (!rows.length) { doc.setDrawColor.apply(doc, LINE); doc.rect(M, y, CW, 6); txt(opt.empty || 'Nothing to report for this period.', M + pad, y + 4, { size: fs, color: MUTED }); y += 6; return; }
      rows.forEach(function (r) {
        var style = r.__style || {}, cells = r.__cells || r;
        doc.setFont(BODY, style.bold ? 'bold' : 'normal'); doc.setFontSize(fs);
        if (style.full) {
          var fl = doc.splitTextToSize(String(cells[0]), CW - pad * 2), fh = fl.length * 3.3 + 2.4;
          if (y + fh > H - 16) { doc.addPage(); y = M; head(); }
          doc.setFillColor(248, 250, 252); doc.rect(M, y, CW, fh, 'F'); doc.setDrawColor.apply(doc, LINE); doc.rect(M, y, CW, fh);
          txt(fl, M + pad, y + 3.5, { size: fs, bold: true }); y += fh; return;
        }
        var ls = cols.map(function (c, i) { return doc.splitTextToSize(String(cells[i] == null ? '' : cells[i]), c.ww - pad * 2); });
        var rh = Math.max.apply(null, ls.map(function (l) { return l.length; })) * 3.3 + 2.4;
        if (y + rh > H - 16) { doc.addPage(); y = M; head(); }
        var x = M;
        cols.forEach(function (c, i) {
          txt(ls[i], c.align === 'right' ? x + c.ww - pad : x + pad, y + 3.5, { size: fs, bold: style.bold, color: style.color || INK, align: c.align || 'left' });
          doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.rect(x, y, c.ww, rh); x += c.ww;
        });
        y += rh;
      });
    };
    var h2 = function (t) { if (y > H - 34) { doc.addPage(); y = M; } y += 5; txt(t, M, y, { head: true, size: 10 }); y += 3; };
    var para = function (t, o) { o = o || {}; doc.setFont(BODY, o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 8.6); var l = doc.splitTextToSize(String(t), CW); if (y + l.length * 3.9 > H - 16) { doc.addPage(); y = M; } txt(l, M, y + 3.6, { size: o.size || 8.6, bold: o.bold, color: o.color || INK2 }); y += l.length * 3.9 + 1.5; };

    table([{ h: 'Reporting Period:', w: 22 }, { h: us(R.p.from) + ' - ' + us(R.p.to), w: 28 }, { h: 'Date Prepared:', w: 22 }, { h: us(R.asOf), w: 28 }],
      [{ __cells: ['Prepared By:', PREPARED_BY, 'Reviewed By:', ''] }], { size: 8 });

    h2('1. EXECUTIVE SUMMARY'); para(R.summary);
    var K = R.K;
    table([{ h: 'Indicator', w: 60 }, { h: 'Current Period', w: 40, align: 'right' }], [
      ['Total Charges/Bills Submitted', money(K.charges)], ['Number of Claims Submitted', K.claims], ['Payments Received', money(K.payments)],
      ['Insurance Adjustments', money(K.adjustments)], ['Patient Payments', 'Not applicable'], ['Outstanding Balance', money(K.outstanding)],
      ['Claims Pending', K.pending], ['Claims Denied/Rejected', K.denied], ['Appeals/Reconsiderations Pending', R.sec6.length], ['Estimated Expected Collections', money(K.expected)]
    ], { size: 8 });

    h2('2. CLAIMS SUBMITTED DURING THE PERIOD');
    table([{ h: 'Insurance', w: 34 }, { h: 'Service / CPT', w: 16 }, { h: 'Claims', w: 10, align: 'right' }, { h: 'Amount Billed', w: 16, align: 'right' }, { h: 'Status / Comments', w: 34 }], R.sec2);

    h2('3. PAYMENTS RECEIVED');
    table([{ h: 'Insurance', w: 30 }, { h: 'Date', w: 14 }, { h: 'Claims Paid', w: 10, align: 'right' }, { h: 'Amount Billed', w: 15, align: 'right' }, { h: 'Amount Paid', w: 15, align: 'right' }, { h: 'Adjustment', w: 14, align: 'right' }, { h: 'Balance', w: 14, align: 'right' }], R.sec3);
    para('Collection Rate: ' + K.collectionRate, { bold: true, color: INK });

    h2('4. OUTSTANDING / PENDING CLAIMS');
    table([{ h: 'Insurance', w: 30 }, { h: '# Claims', w: 9, align: 'right' }, { h: 'Amount Outstanding', w: 16, align: 'right' }, { h: 'Age', w: 16 }, { h: 'Current Status', w: 24 }, { h: 'Follow-Up Date', w: 14 }], R.sec4);
    y += 2; txt('Aging Summary', M, y + 3, { bold: true, size: 8.6 }); y += 5;
    table([{ h: 'Aging', w: 60 }, { h: 'Amount', w: 40, align: 'right' }], [['0-30 Days', money(R.aging[0])], ['31-60 Days', money(R.aging[1])], ['61-90 Days', money(R.aging[2])], ['90+ Days', money(R.aging[3])],
      { __cells: ['TOTAL OUTSTANDING A/R', money(R.aging.reduce(function (a, b) { return a + b; }, 0))], __style: { bold: true } }], { size: 8 });

    h2('5. DENIED / REJECTED CLAIMS');
    table([{ h: 'Insurance', w: 20 }, { h: 'Claim / Client', w: 24 }, { h: 'CPT / Service', w: 11 }, { h: 'Amount', w: 11, align: 'right' }, { h: 'Denial Reason', w: 22 }, { h: 'Action Taken', w: 22 }, { h: 'Status', w: 16 }], R.sec5);
    para('Total Denied: ' + money(R.den.total) + '     Corrected & Resubmitted: ' + money(R.den.corrected) + '     Under Appeal/Reconsideration: ' + money(R.den.appeal) + '     Unrecoverable/Adjustment Recommended: ' + money(R.den.unrec));

    h2('6. APPEALS AND RECONSIDERATIONS');
    table([{ h: 'Insurance', w: 22 }, { h: 'Claim / Issue', w: 32 }, { h: 'Amount', w: 12, align: 'right' }, { h: 'Appeal Date', w: 13 }, { h: 'Current Status', w: 16 }, { h: 'Next Action / Deadline', w: 22 }], R.sec6, { empty: 'No appeals or corrected claims for this period.' });

    h2('7. INSURANCE EVENTS & UPDATES');
    table([{ h: 'Date', w: 12 }, { h: 'Insurance', w: 18 }, { h: 'Event / Issue', w: 30 }, { h: 'Impact on ' + (name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 5) || 'Provider'), w: 18 }, { h: 'Action Taken', w: 22 }, { h: 'Follow-Up', w: 12 }], R.sec7, { empty: 'No insurance events or anomalies in this period.' });

    h2('8. HIGH-PRIORITY ACCOUNTS / ISSUES');
    table([{ h: 'Priority', w: 10 }, { h: 'Insurance / Issue', w: 24 }, { h: 'Amount at Risk', w: 13, align: 'right' }, { h: 'Problem', w: 22 }, { h: 'Required Action', w: 22 }, { h: 'Responsible Person', w: 15 }, { h: 'Deadline', w: 12 }], R.sec8, { empty: 'No high-priority accounts in this period.' });

    h2('9. COMPARISON WITH PREVIOUS REPORTING PERIOD');
    table([{ h: 'Indicator', w: 34 }, { h: 'Previous Period', w: 22, align: 'right' }, { h: 'Current Period', w: 22, align: 'right' }, { h: 'Change', w: 22, align: 'right' }], R.sec9, { size: 8 });

    h2('10. ACTION PLAN FOR NEXT 15 DAYS');
    table([{ h: 'Action Item', w: 40 }, { h: 'Insurance / Area', w: 22 }, { h: 'Responsible Person', w: 16 }, { h: 'Due Date', w: 12 }, { h: 'Status', w: 10 }], R.plan);

    h2('11. MANAGEMENT COMMENTS');
    para('Major concerns:', { bold: true, color: INK }); R.concerns.forEach(function (c) { para('• ' + c); });
    para('Expected collections during next reporting period: ' + money(R.expectedNext), { bold: true, color: INK });
    para('Issues requiring CEO/Management intervention:', { bold: true, color: INK }); R.mgmt.forEach(function (c) { para('• ' + c); });

    // client detail
    doc.addPage(); y = M;
    txt('12. CLIENT DETAIL', M, y + 4, { head: true, size: 10 }); y += 6;
    para('Services with dates of service ' + us(R.p.from) + ' to ' + us(R.p.to) + '. Primary and secondary payments are shown on the same line; extra lines show recoupments.', { size: 7.8 });
    var rows = [];
    R.clients.forEach(function (C) {
      rows.push({ __cells: [C.name + (C.acct ? '   •   File #' + C.acct : '')], __style: { full: true } });
      C.rows.forEach(function (r) {
        rows.push({ __cells: [us(r.dos), r.cpt, r.units, r.extra ? '' : money(r.billed), r.pri == null ? '' : money(r.pri), us(r.priDate), r.sec == null ? '' : money(r.sec), us(r.secDate), r.notes], __style: r.extra ? { color: [200, 40, 106] } : {} });
      });
      var tb = C.rows.reduce(function (s, r) { return s + (r.extra ? 0 : r.billed); }, 0), tp = C.rows.reduce(function (s, r) { return s + (r.pri || 0); }, 0), ts = C.rows.reduce(function (s, r) { return s + (r.sec || 0); }, 0);
      rows.push({ __cells: ['', 'Total', '', money(tb), money(tp), '', money(ts), '', 'Paid ' + money(tp + ts)], __style: { bold: true } });
    });
    table([{ h: 'DOS', w: 12 }, { h: 'Service', w: 12 }, { h: 'Units', w: 6, align: 'right' }, { h: 'Billed', w: 11, align: 'right' }, { h: 'Primary Paid', w: 11, align: 'right' }, { h: 'Pri. Date', w: 11 }, { h: 'Secondary Paid', w: 11, align: 'right' }, { h: 'Sec. Date', w: 11 }, { h: 'Notes', w: 30 }], rows, { size: 7.2, empty: 'No services in this period.' });

    // signatures
    if (y > H - 40) { doc.addPage(); y = M; }
    y += 12;
    txt('Prepared By: ' + PREPARED_BY, M, y, { size: 8.6 }); txt('Date: ' + us(R.asOf), M + CW * 0.62, y, { size: 8.6 }); y += 9;
    txt('Reviewed By: ______________________________', M, y, { size: 8.6 }); txt('Date: __________________', M + CW * 0.62, y, { size: 8.6 });

    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); txt(footer, M, H - 7, { size: 7, color: MUTED }); txt('Page ' + i + ' / ' + n, RX, H - 7, { size: 7, color: MUTED, align: 'right' }); }
    doc.save('Billing_Report_' + (name || 'Provider').replace(/[^A-Za-z0-9]+/g, '_') + '_' + R.p.from + '_to_' + R.p.to + '.pdf');
  };

  /* ---------------- Excel ---------------- */
  window._brExcel = function () {
    var R = _cur; if (!R) return;
    if (typeof XLSX === 'undefined') { toast('Excel export is not available', 'err'); return; }
    var wb = XLSX.utils.book_new(), add = function (name, head, rows) { var ws = XLSX.utils.aoa_to_sheet([head].concat(rows)); ws['!cols'] = head.map(function () { return { wch: 20 }; }); XLSX.utils.book_append_sheet(wb, ws, name); };
    var K = R.K;
    add('Summary', ['Indicator', 'Current period'], [['Reporting period', us(R.p.from) + ' - ' + us(R.p.to)], ['Prepared by', PREPARED_BY], ['Total charges', r2(K.charges)], ['Claims submitted', K.claims], ['Payments received', r2(K.payments)], ['Insurance adjustments', r2(K.adjustments)], ['Outstanding balance', r2(K.outstanding)], ['Claims pending', K.pending], ['Claims denied/rejected', K.denied], ['Collection rate', K.collectionRate], ['Estimated expected collections', r2(K.expected)], [], ['Summary', R.summary]]);
    add('Claims submitted', ['Insurance', 'Service / CPT', 'Claims', 'Amount billed', 'Status'], R.sec2);
    add('Payments', ['Insurance', 'Date', 'Claims paid', 'Billed', 'Paid', 'Adjustment', 'Balance'], R.sec3);
    add('Outstanding', ['Insurance', '# Claims', 'Outstanding', 'Age', 'Status', 'Follow-up'], R.sec4.concat([[], ['0-30', money(R.aging[0])], ['31-60', money(R.aging[1])], ['61-90', money(R.aging[2])], ['90+', money(R.aging[3])]]));
    add('Denied', ['Insurance', 'Claim / Client', 'CPT', 'Amount', 'Reason', 'Action', 'Status'], R.sec5);
    add('Events', ['Date', 'Insurance', 'Event / issue', 'Impact', 'Action', 'Follow-up'], R.sec7);
    add('Action plan', ['Action', 'Insurance / area', 'Responsible', 'Due', 'Status'], R.plan);
    var rows = [];
    R.clients.forEach(function (C) { C.rows.forEach(function (r) { rows.push([C.name, C.acct, us(r.dos), r.cpt, r.units, r.extra ? '' : r2(r.billed), r.pri == null ? '' : r2(r.pri), us(r.priDate), r.sec == null ? '' : r2(r.sec), us(r.secDate), r.notes]); }); });
    add('Client detail', ['Client', 'File #', 'DOS', 'Service', 'Units', 'Billed', 'Primary paid', 'Pri. date', 'Secondary paid', 'Sec. date', 'Notes'], rows);
    XLSX.writeFile(wb, 'Billing_Report_' + String(R.prov.name || 'Provider').replace(/[^A-Za-z0-9]+/g, '_') + '_' + R.p.from + '_to_' + R.p.to + '.xlsx');
  };

  window._brBuild = build;   // used by tests
})();
