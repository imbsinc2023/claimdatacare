/*
 * ClaimDataCare  •  Patient file PDF
 * File: cdc-patientpdf.js  •  v1.0  (loaded only when Export is pressed)
 * Replaces _exportPatientPDF and _doExportPatientPDF from script1.js.
 * Same layout language as the invoice PDF (logo, big title, info strip, FROM / TO style blocks,
 * grey header tables, footer), in black and greys only: no colour bars, no gradient lines.
 */
(function () {
  'use strict';
  function us(d) { var s = String(d || ''), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + '/' + m[3] + '/' + m[1] : s; }
  function money(n) { var v = Math.round((parseFloat(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function toData(url) {
    if (!url) return Promise.resolve(null);
    if (/^data:/.test(url)) return Promise.resolve(url);
    return fetch(url).then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(f.result); }; f.onerror = function () { ok(null); }; f.readAsDataURL(b); }); }).catch(function () { return null; });
  }

  window._exportPatientPDF = async function (patId) {
    var db = getDB(), pat = (db.patients || []).find(function (p) { return p.id === patId; });
    if (!pat) { try { toast('Not found', 'err'); } catch (e) {} return; }
    var prov = (db.providers || []).find(function (p) { return p.id === pat.providerId; }) || {};
    var T = typeof cdcPersonTerm === 'function' ? cdcPersonTerm() : 'Patient';
    try { if (!window.__cdcInvFonts && typeof _cdcLoadModule === 'function') await _cdcLoadModule('cdc-fonts.js'); } catch (e) {}
    var photo = await toData(pat.photo), logo = await toData(prov.logo);
    var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: 'mm', format: 'letter' });
    var W = 215.9, H = 279.4, M = 16, RX = W - M, CW = RX - M, BODY = 'helvetica', HEAD = 'helvetica';
    var F = window.__cdcInvFonts;
    if (F) { try { doc.addFileToVFS('p.ttf', F.plex); doc.addFont('p.ttf', 'Plex', 'normal'); doc.addFileToVFS('pb.ttf', F.plexB); doc.addFont('pb.ttf', 'Plex', 'bold'); doc.addFileToVFS('s.ttf', F.sora); doc.addFont('s.ttf', 'Sora', 'bold'); BODY = 'Plex'; HEAD = 'Sora'; } catch (e) {} }
    var INK = [11, 21, 38], INK2 = [58, 71, 92], MUTED = [110, 122, 140], LINE = [220, 225, 233], HEADF = [244, 246, 249];
    var txt = function (s, x, y, o) { o = o || {}; doc.setFont(o.head ? HEAD : BODY, o.bold || o.head ? 'bold' : 'normal'); doc.setFontSize(o.size || 9); doc.setTextColor.apply(doc, o.color || INK); doc.text(s, x, y, { align: o.align || 'left', maxWidth: o.maxWidth }); };
    var line = function (x1, y1, x2, y2, c, w) { doc.setDrawColor.apply(doc, c || LINE); doc.setLineWidth(w || 0.3); doc.line(x1, y1, x2, y2); };
    var y = M;

    // ---- header: logo left, title right (like the invoice)
    if (logo) { try { var lp = doc.getImageProperties(logo), k = Math.min(46 / lp.width, 17 / lp.height); doc.addImage(logo, lp.fileType || 'PNG', M, y, lp.width * k, lp.height * k, undefined, 'FAST'); } catch (e) {} }
    txt(T.toUpperCase() + ' FILE', RX, y + 7, { head: true, size: 22, align: 'right' });
    txt('File # ' + (pat.acct || ''), RX, y + 12.5, { size: 9, color: MUTED, align: 'right' });
    txt('Printed ' + us(new Date().toISOString()), RX, y + 16.5, { size: 8, color: MUTED, align: 'right' });
    y += 24; line(M, y, RX, y);

    // ---- info strip
    var age = ''; try { age = _calcAge(pat.dob); } catch (e) {}
    var cols = [['DATE OF BIRTH', us(pat.dob) || '•'], ['AGE', age !== '' ? age + ' years' : '•'], ['SEX', pat.sex === 'F' ? 'Female' : pat.sex === 'M' ? 'Male' : pat.sex || '•'], ['STATUS', pat.inactive ? 'Inactive' : 'Active']];
    cols.forEach(function (c, i) { var x = M + i * CW / 4; txt(c[0], x, y + 5, { size: 6.8, bold: true, color: MUTED }); txt(String(c[1]), x, y + 10.5, { size: 10 }); });
    y += 15; line(M, y, RX, y);

    // ---- two blocks: the person and the billing provider
    var pic = function (k, x, yy) {
      var c = yy - 1.1; doc.setDrawColor.apply(doc, MUTED); doc.setFillColor.apply(doc, MUTED); doc.setLineWidth(0.25);
      if (k === 'pin') { doc.circle(x + 1.3, c - 0.35, 0.8, 'F'); doc.triangle(x + 0.6, c - 0.05, x + 2, c - 0.05, x + 1.3, c + 1.25, 'F'); doc.setFillColor(255, 255, 255); doc.circle(x + 1.3, c - 0.35, 0.3, 'F'); }
      else if (k === 'mail') { doc.rect(x + 0.1, c - 0.85, 2.4, 1.7); doc.line(x + 0.1, c - 0.85, x + 1.3, c + 0.1); doc.line(x + 2.5, c - 0.85, x + 1.3, c + 0.1); }
      else if (k === 'phone') { doc.roundedRect(x + 0.65, c - 1.15, 1.3, 2.3, 0.3, 0.3); doc.line(x + 1.1, c + 0.8, x + 1.5, c + 0.8); }
      else if (k === 'id') { doc.rect(x + 0.1, c - 0.8, 2.4, 1.6); doc.circle(x + 0.75, c - 0.1, 0.32, 'F'); doc.line(x + 1.3, c - 0.3, x + 2.15, c - 0.3); doc.line(x + 1.3, c + 0.3, x + 2.15, c + 0.3); }
    };
    var block = function (label, name, rows, x, w, img) {
      var yy = y + 6;
      txt(label, x, yy, { size: 6.8, bold: true, color: MUTED }); yy += 5.5;
      var tx = x;
      if (img) { try { var ip = doc.getImageProperties(img); doc.addImage(img, ip.fileType || 'JPEG', x, yy - 3.5, 20, 20, undefined, 'FAST'); doc.setDrawColor.apply(doc, LINE); doc.rect(x, yy - 3.5, 20, 20); } catch (e) {} tx = x + 24; }
      doc.setFont(HEAD, 'bold'); var fs = 12; doc.setFontSize(fs); while (doc.getTextWidth(name) > w - (tx - x) && fs > 8) { fs -= 0.5; doc.setFontSize(fs); }
      txt(name, tx, yy, { head: true, size: fs }); yy += 5;
      rows.filter(function (r) { return r[1]; }).forEach(function (r) { if (r[0]) pic(r[0], tx, yy); txt(r[1], tx + (r[0] ? 4.4 : 4.4), yy, { size: 8.2, color: INK2 }); yy += 4; });
      return Math.max(yy, img ? y + 6 + 5.5 + 20 : 0);
    };
    var half = CW / 2;
    var y1 = block(T.toUpperCase(), ((pat.last || '').toUpperCase() + ', ' + (pat.first || '').toUpperCase() + (pat.mid ? ' ' + pat.mid.toUpperCase() : '')), [
      ['pin', [pat.addr1, pat.addr2].filter(Boolean).join(', ')], ['', [pat.city, pat.state, pat.zip].filter(Boolean).join(', ')],
      ['phone', [pat.phone, pat.phone2].filter(Boolean).join('  •  ')], ['mail', String(pat.email || '').toLowerCase()],
      ['id', pat.language ? 'Language: ' + pat.language : '']
    ], M, half - 6, photo);
    var y2 = block('BILLING PROVIDER', String(prov.name || '').toUpperCase(), [
      ['pin', [prov.addr1, prov.addr2].filter(Boolean).join(', ')], ['', [prov.city, prov.state, prov.zip].filter(Boolean).join(', ')],
      ['phone', prov.phone ? (typeof fmtPhone === 'function' ? fmtPhone(prov.phone) : prov.phone) : ''], ['id', [prov.npi ? 'NPI ' + prov.npi : '', prov.taxid ? 'EIN ' + prov.taxid : ''].filter(Boolean).join('  •  ')]
    ], M + half + 4, half - 4, null);
    y = Math.max(y1, y2) + 3;
    if (pat.ecName) { line(M, y, RX, y); y += 5; txt('EMERGENCY CONTACT', M, y, { size: 6.8, bold: true, color: MUTED }); txt([pat.ecName, pat.ecRel, pat.ecPhone, pat.ecEmail].filter(Boolean).join('   •   '), M + 32, y, { size: 8.6 }); y += 4; }

    // ---- tables
    var table = function (title, cols, rows, empty) {
      if (y > H - 50) { doc.addPage(); y = M; }
      y += 7; txt(title, M, y, { size: 6.8, bold: true, color: MUTED }); y += 2.5;
      var total = cols.reduce(function (s, c) { return s + c.w; }, 0), sc = CW / total, pad = 2.2, fs = 8;
      cols.forEach(function (c) { c.ww = c.w * sc; });
      var head = function () {
        doc.setFillColor.apply(doc, HEADF); doc.rect(M, y, CW, 7, 'F'); line(M, y + 7, RX, y + 7, INK, 0.3);
        var x = M; cols.forEach(function (c) { txt(c.h.toUpperCase(), c.r ? x + c.ww - pad : x + pad, y + 4.6, { size: 6.6, bold: true, color: INK2, align: c.r ? 'right' : 'left' }); x += c.ww; });
        y += 7;
      };
      head();
      if (!rows.length) { txt(empty || 'None on file.', M + pad, y + 5, { size: 8, color: MUTED }); y += 8; line(M, y, RX, y); return; }
      rows.forEach(function (r) {
        doc.setFont(BODY, 'normal'); doc.setFontSize(fs);
        var ls = cols.map(function (c, i) { return doc.splitTextToSize(String(r[i] == null ? '' : r[i]), c.ww - pad * 2); }), rh = Math.max.apply(null, ls.map(function (l) { return l.length; })) * 3.5 + 3;
        if (y + rh > H - 18) { doc.addPage(); y = M; head(); }
        var x = M; cols.forEach(function (c, i) { txt(ls[i], c.r ? x + c.ww - pad : x + pad, y + 4.2, { size: fs, align: c.r ? 'right' : 'left', bold: !!c.b }); x += c.ww; });
        y += rh; line(M, y, RX, y);
      });
    };
    var ins = (pat.insurances || []).filter(function (i) { return !i.inactive; });
    table('COVERAGE', [{ h: 'Type', w: 13, b: 1 }, { h: 'Payer', w: 28 }, { h: 'Payer ID', w: 11 }, { h: 'Member ID', w: 16 }, { h: 'Group', w: 12 }, { h: 'Relation', w: 10 }, { h: 'Effective', w: 18 }, { h: 'Eligibility', w: 15 }],
      ins.map(function (i) { var e = i.elig || {}; return [i.insType || i.type || 'Primary', i.name || '', i.payerId || '', i.policy || i.memberId || '', i.group || '', i.relation || 'Self', [us(i.effFrom), us(i.effTo)].filter(Boolean).join(' to '), e.checkedAt ? ({ active: 'Active', inactive: 'Inactive', error: 'Failed', none: 'Not confirmed' }[e.status] || '') + ' ' + us(new Date(e.checkedAt).toISOString()) : 'Not verified']; }),
      pat.selfPay ? 'Self pay: no insurance on file.' : 'No active insurance on file.');
    table('AUTHORIZATIONS', [{ h: 'Payer', w: 26 }, { h: 'Auth #', w: 16 }, { h: 'Services', w: 34 }, { h: 'From', w: 12 }, { h: 'To', w: 12 }],
      (pat.authorizations || []).map(function (a) { return [a.payerName || '', a.authNum || '', (a.services || []).map(function (s) { return s.cpt + (s.unitsApproved ? ' (' + s.unitsApproved + ' u)' : ''); }).join(', '), us(a.startDate), us(a.endDate)]; }));
    var appts = []; try { appts = (getAppts() || []).filter(function (a) { return (a.patients || []).some(function (x) { return x.patId === pat.id; }); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 12); } catch (e) {}
    table('APPOINTMENTS (LATEST)', [{ h: 'Date', w: 14 }, { h: 'Time', w: 10 }, { h: 'Provider', w: 26 }, { h: 'Service group', w: 26 }, { h: 'Status', w: 16 }],
      appts.map(function (a) { var r = (db.rendering || []).find(function (x) { return x.id === a.renderingId; }) || {}, gg = (db.serviceGroups || []).find(function (x) { return x.id === a.sgId; }) || {}, me = (a.patients || []).find(function (x) { return x.patId === pat.id; }) || {}; return [us(a.date), a.startTime || '', r.last ? r.last + ', ' + r.first : '', gg.name || '', me.status || a.status || '']; }));
    // claims with totals
    var EOB = db.claimEOB || {}, claims = (db.claims || []).filter(function (c) { return c.patId === pat.id; }).sort(function (a, b) { return String(a.dos) < String(b.dos) ? 1 : -1; });
    var billed = function (c) { return (c.lines || []).reduce(function (s, l) { return s + (parseFloat(l.charge) || 0); }, 0); }, paid = function (c) { return (EOB[c.id] || []).reduce(function (s, e) { return s + (parseFloat(e.paid) || 0); }, 0); };
    var tb = claims.reduce(function (s, c) { return s + billed(c); }, 0), tp = claims.reduce(function (s, c) { return s + paid(c); }, 0);
    if (y > H - 60) { doc.addPage(); y = M; }
    y += 7; txt('CLAIMS SUMMARY', M, y, { size: 6.8, bold: true, color: MUTED }); y += 3;
    [['Claims', String(claims.length)], ['Billed', money(tb)], ['Paid', money(tp)], ['Balance', money(Math.max(0, tb - tp))]].forEach(function (k, i) {
      var x = M + i * (CW / 4), w = CW / 4 - 3; doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, 14, 2, 2);
      txt(k[0].toUpperCase(), x + 4, y + 5, { size: 6.6, bold: true, color: MUTED }); txt(k[1], x + 4, y + 11, { head: true, size: 11.5 });
    });
    y += 15;
    table('CLAIMS (LATEST)', [{ h: 'DOS', w: 13 }, { h: 'PCN', w: 18 }, { h: 'Services', w: 30 }, { h: 'Billed', w: 13, r: 1 }, { h: 'Paid', w: 13, r: 1 }, { h: 'Status', w: 14 }],
      claims.slice(0, 15).map(function (c) { return [us(c.dos), c.pcn || '', (c.lines || []).map(function (l) { return l.cpt; }).filter(Boolean).join(', '), money(billed(c)), money(paid(c)), String(c.status || 'draft').replace(/_/g, ' ')]; }));
    var docs = (pat.documents || []).filter(function (d) { return !d.deleted && !d.trashed; }).slice(-12).reverse();
    table('RECORDS (LATEST)', [{ h: 'Document', w: 46 }, { h: 'Category', w: 26 }, { h: 'Date', w: 14 }, { h: 'Size', w: 10, r: 1 }],
      docs.map(function (d) { return [d.name || '', d.category || '', d.date || '', d.size ? Math.round(d.size / 1024) + ' KB' : '']; }));

    // ---- footer on every page (no colour, no gradient)
    var n = doc.getNumberOfPages(), who = (pat.last || '').toUpperCase() + ', ' + (pat.first || '').toUpperCase();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); line(M, H - 13, RX, H - 13);
      txt(who + '  •  File # ' + (pat.acct || '') + '  •  Confidential', M, H - 8.5, { size: 7, color: MUTED });
      txt('Powered by ClaimDataCare  •  claimdatacare.com', W / 2, H - 8.5, { size: 7, color: MUTED, align: 'center' });
      txt('Page ' + i + ' / ' + n, RX, H - 8.5, { size: 7, color: MUTED, align: 'right' });
    }
    doc.save(T + '_File_' + (pat.last || 'record').replace(/[^A-Za-z0-9]+/g, '_') + '_' + (pat.acct || '') + '.pdf');
  };
})();
