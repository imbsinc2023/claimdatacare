/*
 * ClaimDataCare  •  Patient file PDF
 * File: cdc-patientpdf.js  •  v2.0  (loaded only when Export is pressed)
 * Black and greys, invoice-style:
 *   • Header in proportion: logo, billing provider details beside it, title block with File #
 *     and a Code 128 barcode of the file number
 *   • Patient: photo (or a frame with the initials) and all the patient details
 *   • Contacts (emergency, guardians, HIPAA release), coverage on one line per plan
 *   • Open balance as the closing highlight (no aging, no claim lists, no records)
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
  var PHONE = [[0.945, 0.688], [0.911, 0.687], [0.877, 0.684], [0.844, 0.68], [0.812, 0.674], [0.78, 0.666], [0.749, 0.657], [0.729, 0.654], [0.709, 0.658], [0.693, 0.67], [0.678, 0.688], [0.664, 0.707], [0.649, 0.725], [0.634, 0.743], [0.62, 0.761], [0.606, 0.779], [0.528, 0.737], [0.454, 0.684], [0.384, 0.623], [0.322, 0.554], [0.267, 0.479], [0.223, 0.4], [0.241, 0.384], [0.259, 0.369], [0.277, 0.354], [0.295, 0.338], [0.313, 0.323], [0.331, 0.308], [0.343, 0.291], [0.347, 0.271], [0.344, 0.251], [0.335, 0.22], [0.327, 0.188], [0.321, 0.156], [0.317, 0.123], [0.314, 0.089], [0.313, 0.055], [0.306, 0.027], [0.286, 0.008], [0.258, 0.0], [0.226, 0.0], [0.194, 0.0], [0.162, 0.0], [0.13, 0.0], [0.098, 0.0], [0.066, 0.0], [0.036, 0.005], [0.011, 0.022], [0.0, 0.055], [0.034, 0.304], [0.131, 0.529], [0.279, 0.721], [0.471, 0.869], [0.696, 0.966], [0.945, 1.0], [0.977, 0.99], [0.994, 0.965], [1.0, 0.934], [1.0, 0.903], [1.0, 0.871], [1.0, 0.838], [1.0, 0.807], [1.0, 0.775], [1.0, 0.743], [0.992, 0.715], [0.973, 0.696], [0.946, 0.688], [0.946, 0.688], [0.945, 0.688]];
  // Code 128 (set B) bar widths
  var C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232'.split(' ');
  function code128(text) {
    var vals = [104], sum = 104;
    String(text).split('').forEach(function (ch, i) { var v = ch.charCodeAt(0) - 32; if (v < 0 || v > 94) v = 0; vals.push(v); sum += v * (i + 1); });
    vals.push(sum % 103);
    return vals.map(function (v) { return C128[v]; }).join('') + '2331112';
  }

  // document set-up shared by every PDF of the patient file
  async function makeCtx(pat) {
    var db = getDB(), prov = (db.providers || []).find(function (p) { return p.id === pat.providerId; }) || {};
    try { if (!window.__cdcInvFonts && typeof _cdcLoadModule === 'function') await _cdcLoadModule('cdc-fonts.js'); } catch (e) {}
    var photo = await toData(pat.photo), logo = await toData(prov.logo);
    var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: 'mm', format: 'letter' });
    var W = 215.9, H = 279.4, M = 16, RX = W - M, CW = RX - M, BODY = 'helvetica', HEAD = 'helvetica';
    var F = window.__cdcInvFonts;
    if (F) { try { doc.addFileToVFS('p.ttf', F.plex); doc.addFont('p.ttf', 'Plex', 'normal'); doc.addFileToVFS('pb.ttf', F.plexB); doc.addFont('pb.ttf', 'Plex', 'bold'); doc.addFileToVFS('s.ttf', F.sora); doc.addFont('s.ttf', 'Sora', 'bold'); BODY = 'Plex'; HEAD = 'Sora'; } catch (e) {} }
    var INK = [11, 21, 38], INK2 = [58, 71, 92], MUTED = [112, 124, 142], LINE = [222, 227, 234], SOFT = [245, 247, 250];
    var txt = function (s, x, y, o) { o = o || {}; doc.setFont(o.head ? HEAD : BODY, o.bold || o.head ? 'bold' : 'normal'); doc.setFontSize(o.size || 9); doc.setTextColor.apply(doc, o.color || INK); doc.text(String(s == null ? '' : s), x, y, { align: o.align || 'left', maxWidth: o.max }); };
    var line = function (x1, y1, x2, y2, c, w) { doc.setDrawColor.apply(doc, c || LINE); doc.setLineWidth(w || 0.3); doc.line(x1, y1, x2, y2); };
    var fit = function (s, maxW, size, head) { doc.setFont(head ? HEAD : BODY, 'bold'); var fs = size; doc.setFontSize(fs); while (doc.getTextWidth(s) > maxW && fs > 7) { fs -= 0.4; doc.setFontSize(fs); } return fs; };
    // small grey icons centred on a text line (baseline yy)
    var pic = function (k, x, yy) {
      var c = yy - 1.1; doc.setDrawColor.apply(doc, MUTED); doc.setFillColor.apply(doc, MUTED); doc.setLineWidth(0.25);
      if (k === 'pin') { doc.circle(x + 1.3, c - 0.35, 0.8, 'F'); doc.triangle(x + 0.6, c - 0.05, x + 2, c - 0.05, x + 1.3, c + 1.25, 'F'); doc.setFillColor(255, 255, 255); doc.circle(x + 1.3, c - 0.35, 0.3, 'F'); }
      else if (k === 'mail') { doc.rect(x + 0.1, c - 0.85, 2.4, 1.7); doc.line(x + 0.1, c - 0.85, x + 1.3, c + 0.1); doc.line(x + 2.5, c - 0.85, x + 1.3, c + 0.1); }
      else if (k === 'phone') { var sz = 2.6, ox = x + 0.05, oy = c - sz / 2, seg = []; for (var i = 1; i < PHONE.length; i++) seg.push([(PHONE[i][0] - PHONE[i - 1][0]) * sz, (PHONE[i][1] - PHONE[i - 1][1]) * sz]); doc.lines(seg, ox + PHONE[0][0] * sz, oy + PHONE[0][1] * sz, [1, 1], 'F', true); }
      else if (k === 'id') { doc.rect(x + 0.1, c - 0.8, 2.4, 1.6); doc.circle(x + 0.75, c - 0.1, 0.32, 'F'); doc.line(x + 1.3, c - 0.3, x + 2.15, c - 0.3); doc.line(x + 1.3, c + 0.3, x + 2.15, c + 0.3); }
      else if (k === 'user') { doc.circle(x + 1.3, c - 0.55, 0.55, 'F'); doc.roundedRect(x + 0.4, c + 0.2, 1.8, 0.95, 0.45, 0.45, 'F'); }
      else if (k === 'cal') { doc.roundedRect(x + 0.1, c - 1.0, 2.4, 2.1, 0.3, 0.3); doc.line(x + 0.1, c - 0.35, x + 2.5, c - 0.35); doc.line(x + 0.7, c - 1.35, x + 0.7, c - 0.8); doc.line(x + 1.9, c - 1.35, x + 1.9, c - 0.8); }
      else if (k === 'dot') { doc.circle(x + 1.3, c, 0.75, 'F'); }
      else if (k === 'globe') { doc.circle(x + 1.3, c, 1.1); doc.line(x + 0.2, c, x + 2.4, c); doc.ellipse(x + 1.3, c, 0.45, 1.1); }
      else if (k === 'ring') { doc.circle(x + 0.9, c, 0.72); doc.circle(x + 1.7, c, 0.72); }
      else if (k === 'shield') { doc.lines([[1.1, -0.45], [1.1, 0.45], [0, 0.9], [-1.1, 1.1], [-1.1, -1.1], [0, -0.9]], x + 0.2, c - 0.6, [1, 1], 'S', true); }
      else if (k === 'hash') { doc.line(x + 0.9, c - 1.1, x + 0.7, c + 1.1); doc.line(x + 1.9, c - 1.1, x + 1.7, c + 1.1); doc.line(x + 0.2, c - 0.4, x + 2.4, c - 0.4); doc.line(x + 0.1, c + 0.4, x + 2.3, c + 0.4); }
    };
    return { db: db, prov: prov, photo: photo, logo: logo, doc: doc, W: W, H: H, M: M, RX: RX, CW: CW, BODY: BODY, HEAD: HEAD, INK: INK, INK2: INK2, MUTED: MUTED, LINE: LINE, SOFT: SOFT, txt: txt, line: line, fit: fit, pic: pic,
      T: typeof cdcPersonTerm === 'function' ? cdcPersonTerm() : 'Patient' };
  }
  function unpack(c) { return 'var db=c.db,prov=c.prov,photo=c.photo,logo=c.logo,doc=c.doc,W=c.W,H=c.H,M=c.M,RX=c.RX,CW=c.CW,BODY=c.BODY,HEAD=c.HEAD,INK=c.INK,INK2=c.INK2,MUTED=c.MUTED,LINE=c.LINE,SOFT=c.SOFT,txt=c.txt,line=c.line,fit=c.fit,pic=c.pic,T=c.T;'; }
  function header(c, title, idLabel, idValue, sub) {
    var db=c.db,prov=c.prov,logo=c.logo,doc=c.doc,M=c.M,RX=c.RX,INK=c.INK,INK2=c.INK2,MUTED=c.MUTED,txt=c.txt,line=c.line,fit=c.fit,pic=c.pic;
    var y = M;
    // ---------------- header: logo | provider details | title, File #, barcode (same height) ----------------
    var HH = 26, logoW = 0;
    if (logo) { try { var lp = doc.getImageProperties(logo), k = Math.min(30 / lp.width, HH / lp.height); logoW = lp.width * k; doc.addImage(logo, lp.fileType || 'PNG', M, y + (HH - lp.height * k) / 2, logoW, lp.height * k, undefined, 'FAST'); } catch (e) { logoW = 0; } }
    var px = M + (logoW ? logoW + 6 : 0), pw = 132 - px;
    var pfs = fit(String(prov.name || '').toUpperCase(), pw, 11.5, true);
    txt(String(prov.name || '').toUpperCase(), px, y + 5, { head: true, size: pfs });
    var py = y + 10;
    [['pin', [prov.addr1, prov.addr2].filter(Boolean).join(', ')], ['', [prov.city, prov.state, prov.zip].filter(Boolean).join(', ')],
     ['phone', prov.phone ? (typeof fmtPhone === 'function' ? fmtPhone(prov.phone) : prov.phone) : ''], ['id', [prov.npi ? 'NPI ' + prov.npi : '', prov.taxid ? 'EIN ' + prov.taxid : ''].filter(Boolean).join('  •  ')]]
      .filter(function (r) { return r[1]; }).forEach(function (r) { if (r[0]) pic(r[0], px, py); txt(r[1], px + 4.4, py, { size: 8, color: INK2 }); py += 4; });
    // title block, right aligned; the title uses the same size as the provider name
    txt(title, RX, y + 5, { head: true, size: pfs, align: 'right' });
    txt(idLabel + ' ' + idValue, RX, y + 10.5, { size: 8.5, color: INK2, bold: true, align: 'right' });
    var bars = code128(idValue || ''), mods = bars.split('').reduce(function (s2, d) { return s2 + (+d); }, 0), mw = Math.min(0.3, 52 / mods), bw = mods * mw, bx = RX - bw, bh = 10;
    doc.setFillColor.apply(doc, INK);
    bars.split('').forEach(function (d, i) { var wdt = +d * mw; if (i % 2 === 0) doc.rect(bx, y + 13, wdt, bh, 'F'); bx += wdt; });
    if (sub) txt(sub, RX, y + HH, { size: 6.8, color: MUTED, align: 'right' });
    y += HH + 4; line(M, y, RX, y, INK, 0.5); y += 7;

    return y;
  }
  // a labelled value with its icon (label small and grey, value below)
  function field(c, icon, label, value, x, y, w) {
    var doc = c.doc; c.pic(icon, x, y + 4.4);
    c.txt(label, x + 4.6, y + 1.2, { size: 6.2, bold: true, color: c.MUTED });
    var v = String(value == null || value === '' ? '•' : value); doc.setFont(c.BODY, 'normal'); var fs = 9; doc.setFontSize(fs);
    while (doc.getTextWidth(v) > w - 5 && fs > 6.6) { fs -= 0.3; doc.setFontSize(fs); }
    if (doc.getTextWidth(v) > w - 5) { while (v.length > 3 && doc.getTextWidth(v + '...') > w - 5) v = v.slice(0, -1); v += '...'; }
    c.txt(v, x + 4.6, y + 5.4, { size: fs });
  }
  function cardBox(c, x, y, w, h, title) {
    var doc = c.doc; doc.setDrawColor.apply(doc, c.LINE); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 2.5, 2.5);
    if (title) { doc.setFillColor.apply(doc, c.SOFT); doc.roundedRect(x, y, w, 7, 2.5, 2.5, 'F'); doc.rect(x, y + 2.5, w, 4.5, 'F'); c.line(x, y + 7, x + w, y + 7); c.txt(title, x + 4, y + 4.8, { size: 6.6, bold: true, color: c.INK2 }); }
  }
  function personCard(c, pat, y) {
    var db = c.db, photo = c.photo, doc = c.doc, M = c.M, RX = c.RX, CW = c.CW, INK2 = c.INK2, MUTED = c.MUTED, LINE = c.LINE, SOFT = c.SOFT, txt = c.txt, fit = c.fit, T = c.T;
    txt(T.toUpperCase(), M, y, { size: 7, bold: true, color: MUTED }); y += 3;
    var PH = 38, H0 = PH + 8;
    cardBox(c, M, y, CW, H0);
    var fx = M + 4, fy = y + 4;
    if (photo) { try { var ip = doc.getImageProperties(photo); doc.addImage(photo, ip.fileType || 'JPEG', fx, fy, PH, PH, undefined, 'FAST'); doc.setDrawColor.apply(doc, LINE); doc.rect(fx, fy, PH, PH); } catch (e) { photo = null; } }
    if (!photo) {
      doc.setFillColor.apply(doc, SOFT); doc.roundedRect(fx, fy, PH, PH, 3, 3, 'F'); doc.setDrawColor.apply(doc, LINE); doc.roundedRect(fx, fy, PH, PH, 3, 3);
      var ini = ((pat.first || ' ')[0] + (pat.last || ' ')[0]).trim().toUpperCase() || '?';
      txt(ini, fx + PH / 2, fy + PH / 2 + 4.8, { head: true, size: 26, color: INK2, align: 'center' });
    }
    var dx = fx + PH + 7, dw = RX - 4 - dx;
    var name = ((pat.last || '').toUpperCase() + ', ' + (pat.first || '').toUpperCase() + (pat.mid ? ' ' + pat.mid.toUpperCase() : '')) + (pat.suffix ? ' ' + pat.suffix : '');
    txt(name, dx, fy + 5, { head: true, size: fit(name, dw, 14, true) });
    var age = ''; try { age = _calcAge(pat.dob); } catch (e) {}
    var sx = pat.sex === 'F' ? 'Female' : pat.sex === 'M' ? 'Male' : pat.sex || '';
    var rend = (db.rendering || []).find(function (r) { return r.id === pat.renderingId; });
    var addr = [[pat.addr1, pat.addr2].filter(Boolean).join(' '), [pat.city, pat.state].filter(Boolean).join(', ') + ' ' + (pat.zip || '')].filter(function (x) { return x.trim(); }).join(', ');
    // three columns, three rows of labelled values with icons, then the address on its own line
    var cw = dw / 3, rows = [
      [['cal', 'DATE OF BIRTH', us(pat.dob) + (age !== '' && age != null ? '  (' + age + ' yrs)' : '')], ['user', 'SEX', sx], ['dot', 'STATUS', pat.inactive ? 'Inactive' : 'Active']],
      [['phone', 'PHONE', [pat.phone, pat.phone2].filter(Boolean).join(' • ')], ['mail', 'EMAIL', String(pat.email || '').toLowerCase()], ['globe', 'LANGUAGE', pat.language]],
      [['id', 'ETHNICITY / RACE', [pat.ethnicity, pat.race].filter(Boolean).join(' / ')], ['ring', 'MARITAL STATUS', pat.marital], ['user', 'ASSIGNED PROVIDER', rend ? ((rend.last || '') + ', ' + (rend.first || '')).toUpperCase() : '']]
    ];
    rows.forEach(function (r, ri) { r.forEach(function (f, ci) { field(c, f[0], f[1], f[2], dx + ci * cw, fy + 9 + ri * 8.6, cw); }); });
    field(c, 'pin', 'ADDRESS', addr, dx, fy + 9 + 3 * 8.6, dw);
    return y + H0 + 8;
  }
  function footer(c, pat) {
    var doc=c.doc,W=c.W,H=c.H,M=c.M,RX=c.RX,MUTED=c.MUTED,txt=c.txt,line=c.line;
    // ---------------- footer ----------------
    var n = doc.getNumberOfPages();
    for (var pg = 1; pg <= n; pg++) {
      doc.setPage(pg); line(M, H - 12, RX, H - 12);
      txt(((pat.last || '') + ', ' + (pat.first || '')).toUpperCase() + '  •  File # ' + (pat.acct || '') + '  •  Confidential', M, H - 7.5, { size: 7, color: MUTED });
      txt('Powered by ClaimDataCare  •  claimdatacare.com', W / 2, H - 7.5, { size: 7, color: MUTED, align: 'center' });
      txt('Page ' + pg + ' / ' + n, RX, H - 7.5, { size: 7, color: MUTED, align: 'right' });
    }
  }

  /* ---------------- eligibility verification PDF (same look as the patient file) ---------------- */
  function vidOf(e) { if (e.vid) return e.vid; var d = new Date(e.checkedAt || Date.now()); return 'EV' + d.toISOString().slice(0, 10).replace(/-/g, '') + '-' + Number(e.checkedAt || 0).toString(36).toUpperCase().slice(-6); }
  window.cdcEligVid = vidOf;
  window.cdcEligPDFDoc = async function (patId, idx, e) {
    var pat = (getDB().patients || []).find(function (p) { return p.id === patId; }); if (!pat || !e) return;
    var iv = (pat.insurances || [])[idx] || {}, r = e.result || {}, st = r.status || 'none';
    var STL = { active: 'Active', inactive: 'Inactive', error: 'Check failed', none: 'Not confirmed' };
    var c = await makeCtx(pat);
    var doc = c.doc, H = c.H, M = c.M, RX = c.RX, CW = c.CW, BODY = c.BODY, INK = c.INK, INK2 = c.INK2, MUTED = c.MUTED, LINE = c.LINE, SOFT = c.SOFT, txt = c.txt, line = c.line;
    var vid = vidOf(e), when = new Date(e.checkedAt).toLocaleString('en-US');
    var y = header(c, 'ELIGIBILITY VERIFICATION', 'Verification ID', vid, 'Checked ' + when + (e.by ? ' by ' + String(e.by).toUpperCase() : ''));
    y = personCard(c, pat, y);

    // result: dark block, the status in large type and the request facts beside it
    var BH = 30;
    doc.setFillColor.apply(doc, INK); doc.roundedRect(M, y, CW, BH, 3, 3, 'F');
    txt('COVERAGE ON ' + us(e.dos), M + 8, y + 9, { size: 7.6, bold: true, color: [175, 185, 200] });
    txt((STL[st] || 'Not confirmed').toUpperCase(), M + 8, y + 21.5, { head: true, size: 22, color: [255, 255, 255] });
    var facts = [['SERVICE TYPE', e.stc || '30'], ['TRACE #', r.trace || '•'], ['CHECKED', us(new Date(e.checkedAt).toISOString())]];
    var fx0 = M + CW * 0.46, fw = (RX - 8 - fx0) / 3;
    facts.forEach(function (f, i) {
      var x = fx0 + i * fw + 6;
      doc.setDrawColor(60, 72, 92); doc.setLineWidth(0.3); doc.line(x - 4, y + 7, x - 4, y + BH - 7);
      txt(f[0], x, y + 12, { size: 6.6, bold: true, color: [175, 185, 200] });
      txt(f[1], x, y + 19, { size: 10.5, bold: true, color: [255, 255, 255] });
    });
    y += BH + 8;

    // subscriber and plan: a grid of labelled values
    txt('SUBSCRIBER & PLAN', M, y, { size: 7, bold: true, color: MUTED }); y += 3;
    var cells = [['PAYER', e.payer || iv.name], ['PAYER ID', e.payerId || iv.payerId], ['MEMBER ID', e.member || iv.policy || iv.memberId], ['RELATION', iv.relation || 'Self'],
      ['SUBSCRIBER', e.subscriber || ((iv.lname || pat.last || '') + ', ' + (iv.fname || pat.first || ''))], ['PLAN', r.plan], ['GROUP', r.group || iv.group], ['PLAN DATES', [us(r.from), us(r.to)].filter(Boolean).join(' to ')]];
    var cw = CW / 4, ch = 13;
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, ch * 2, 2.5, 2.5);
    line(M, y + ch, RX, y + ch); [1, 2, 3].forEach(function (k) { line(M + k * cw, y, M + k * cw, y + ch * 2); });
    cells.forEach(function (cl, i) {
      var x = M + (i % 4) * cw + 4, yy = y + Math.floor(i / 4) * ch;
      txt(cl[0], x, yy + 4.8, { size: 6.4, bold: true, color: MUTED });
      var v = String(cl[1] || '•'); doc.setFont(BODY, 'bold'); var fs = 9.5; doc.setFontSize(fs); while (doc.getTextWidth(v) > cw - 8 && fs > 6.5) { fs -= 0.3; doc.setFontSize(fs); }
      txt(v, x, yy + 10, { size: fs, bold: true });
    });
    y += ch * 2 + 8;

    if (st === 'error') {
      doc.setFillColor.apply(doc, SOFT); doc.roundedRect(M, y, CW, 16, 2.5, 2.5, 'F');
      txt('THE PAYER COULD NOT BE REACHED', M + 6, y + 6.5, { size: 7, bold: true, color: MUTED });
      txt(r.message || 'No answer was received.', M + 6, y + 12, { size: 9, color: INK2, max: CW - 12 });
      y += 24;
    } else {
      // benefit highlights
      var hl = [['COPAY', r.copay], ['DEDUCTIBLE', r.deductible], ['COINSURANCE', r.coins]], hw = (CW - 8) / 3;
      hl.forEach(function (h, i) {
        var x = M + i * (hw + 4);
        doc.setFillColor.apply(doc, SOFT); doc.roundedRect(x, y, hw, 15, 2.5, 2.5, 'F');
        txt(h[0], x + 5, y + 5.5, { size: 6.6, bold: true, color: MUTED });
        txt(h[1] || '•', x + 5, y + 12, { head: true, size: 12 });
      });
      y += 22;
      // benefits table, one line per benefit
      var cols = [['SERVICE', 42], ['BENEFIT', 30], ['LEVEL', 20], ['AMOUNT', 17, 1], ['PERIOD', 18], ['NETWORK', 15], ['NOTES', CW - 142]];
      var head = function () {
        txt('BENEFITS', M, y, { size: 7, bold: true, color: MUTED }); y += 2.5;
        doc.setFillColor.apply(doc, SOFT); doc.rect(M, y, CW, 7, 'F');
        var x = M; cols.forEach(function (cc) { txt(cc[0], cc[2] ? x + cc[1] - 2.5 : x + 2.5, y + 4.7, { size: 6.6, bold: true, color: INK2, align: cc[2] ? 'right' : 'left' }); x += cc[1]; });
        y += 7; line(M, y, RX, y, INK, 0.4); y += 5;
      };
      head();
      var ben = r.benefits || [];
      if (!ben.length) { txt('The payer did not return benefit details.', M + 2.5, y, { size: 8.2, color: MUTED }); y += 4; line(M, y, RX, y); y += 6; }
      ben.forEach(function (b) {
        if (y > H - 30) { doc.addPage(); y = M; head(); }
        var vals = [b.svc, b.type, b.level, b.amount, b.period, b.net, b.note], x = M;
        vals.forEach(function (v, i) {
          var cc = cols[i], val = String(v || ''); doc.setFont(BODY, i === 0 ? 'bold' : 'normal'); var fs = 8; doc.setFontSize(fs);
          while (doc.getTextWidth(val) > cc[1] - 5 && fs > 6.2) { fs -= 0.3; doc.setFontSize(fs); }
          if (doc.getTextWidth(val) > cc[1] - 5) { while (val.length > 3 && doc.getTextWidth(val + '...') > cc[1] - 5) val = val.slice(0, -1); val += '...'; }
          txt(val, cc[2] ? x + cc[1] - 2.5 : x + 2.5, y, { size: fs, bold: i === 0, color: i === 6 ? MUTED : i === 0 ? INK : INK2, align: cc[2] ? 'right' : 'left' });
          x += cc[1];
        });
        y += 3; line(M, y, RX, y); y += 4.6;
      });
      y += 3;
    }
    if (y > H - 34) { doc.addPage(); y = M; }
    txt('This document reproduces the electronic eligibility response (ANSI X12 270/271) received in real time through ClaimMD on the date and time shown. Verification ID ' + vid + ' identifies this check in the patient file.', M, y + 2, { size: 7.4, color: MUTED, max: CW });
    footer(c, pat);
    doc.save('Eligibility_' + String(pat.last || 'Patient').replace(/[^A-Za-z0-9]+/g, '_') + '_' + vid + '.pdf');
  };

  window.cdcPatientPDFv2 = window._exportPatientPDF = async function (patId) {
    var db0 = getDB(), pat = (db0.patients || []).find(function (p) { return p.id === patId; });
    if (!pat) { try { toast('Not found', 'err'); } catch (e) {} return; }
    var c = await makeCtx(pat);
    var db=c.db,prov=c.prov,doc=c.doc,W=c.W,H=c.H,M=c.M,RX=c.RX,CW=c.CW,BODY=c.BODY,HEAD=c.HEAD,INK=c.INK,INK2=c.INK2,MUTED=c.MUTED,LINE=c.LINE,SOFT=c.SOFT,txt=c.txt,line=c.line,fit=c.fit,pic=c.pic,T=c.T;
    var y = header(c, T.toUpperCase() + ' FILE', 'File #', pat.acct || '', '');
    y = personCard(c, pat, y);
    // ---------------- contacts: one card each, two per row ----------------
    var contacts = (pat.contacts || []).slice();
    if (pat.ecName && !contacts.some(function (k2) { return String(k2.name || '').toUpperCase() === String(pat.ecName).toUpperCase(); })) contacts.unshift({ name: pat.ecName, relation: pat.ecRel, phone: pat.ecPhone, email: pat.ecEmail, roles: { emergency: true } });
    var half = (CW - 6) / 2, gridCards = function (title, list, draw, empty, ch) {
      txt(title, M, y, { size: 7, bold: true, color: MUTED }); y += 3;
      if (!list.length) { cardBox(c, M, y, CW, 10); txt(empty, M + 4, y + 6.3, { size: 8.4, color: MUTED }); y += 18; return; }
      list.forEach(function (it, i) {
        if (i % 2 === 0 && i > 0) y += ch + 5;
        if (i % 2 === 0 && y + ch > H - 26) { doc.addPage(); y = M; }
        draw(it, M + (i % 2) * (half + 6), y, half);
      });
      y += ch + 10;
    };
    gridCards('CONTACTS', contacts, function (k2, x, yy, w) {
      var R = k2.roles || {}, roles = [R.emergency ? 'Emergency' : '', R.guardian ? 'Legal guardian' : '', R.responsible ? 'Responsible party' : '', R.pickup ? 'May pick up' : ''].filter(Boolean).join(', ');
      cardBox(c, x, yy, w, 30, String(k2.name || '').toUpperCase());
      var fw = (w - 8) / 2;
      field(c, 'user', 'RELATIONSHIP', k2.relation, x + 4, yy + 10, fw); field(c, 'shield', 'ROLE', roles, x + 4 + fw, yy + 10, fw);
      field(c, 'phone', 'PHONE', k2.phone, x + 4, yy + 19, fw);
      field(c, 'id', 'MEDICAL RECORDS (HIPAA)', k2.hipaa ? 'Authorized • ' + (k2.hipaaScope || 'All records') : 'Not authorized', x + 4 + fw, yy + 19, fw);
    }, 'No contacts on file.', 30);

    // ---------------- coverage: one card per plan ----------------
    var ins = (pat.insurances || []).slice();
    gridCards('COVERAGE', ins, function (iv, x, yy, w) {
      var e = iv.elig || {}, st = e.status === 'active' ? 'Active' : e.status === 'inactive' ? 'Inactive' : e.status === 'error' ? 'Check failed' : 'Not verified';
      cardBox(c, x, yy, w, 30, String(iv.insType || 'Primary').toUpperCase() + '  •  ' + String(iv.name || iv.insuranceName || '').toUpperCase());
      var fw = (w - 8) / 3;
      field(c, 'hash', 'PAYER ID', iv.payerId, x + 4, yy + 10, fw); field(c, 'id', 'MEMBER ID', iv.policy || iv.memberId, x + 4 + fw, yy + 10, fw); field(c, 'hash', 'GROUP', iv.group, x + 4 + 2 * fw, yy + 10, fw);
      field(c, 'user', 'RELATION', iv.relation || 'Self', x + 4, yy + 19, fw); field(c, 'shield', 'ELIGIBILITY', st, x + 4 + fw, yy + 19, fw); field(c, 'cal', 'LAST CHECK', e.checkedAt ? us(new Date(e.checkedAt).toISOString()) : '', x + 4 + 2 * fw, yy + 19, fw);
    }, pat.selfPay ? 'Self pay (no insurance).' : 'No coverage on file.', 30);

    // ---------------- open balance: light card, the amount in large type ----------------
    var EOB = db.claimEOB || {}, billed = 0, paid = 0, open = 0, openN = 0, oldest = '';
    (db.claims || []).filter(function (cl) { return cl.patId === pat.id && !/void|deleted/i.test(cl.status || ''); }).forEach(function (cl) {
      var b2 = (cl.lines || []).reduce(function (s3, l) { return s3 + (parseFloat(l.charge) || 0); }, 0), p2 = (EOB[cl.id] || []).reduce(function (s3, e) { return s3 + (parseFloat(e.paid) || 0); }, 0);
      billed += b2; paid += p2;
      var o = Math.max(0, b2 - p2 - (EOB[cl.id] || []).reduce(function (s3, e) { return s3 + (e.adjLines || []).filter(function (a2) { return a2.group === 'CO'; }).reduce(function (s4, a2) { return s4 + (parseFloat(a2.amount) || 0); }, 0); }, 0));
      if (o > 0.005) { open += o; openN++; var d = String(cl.dos || ''); if (!oldest || d < oldest) oldest = d; }
    });
    if (y > H - 56) { doc.addPage(); y = M; }
    txt('BALANCE', M, y, { size: 7, bold: true, color: MUTED }); y += 3;
    var BH = 30;
    doc.setFillColor.apply(doc, SOFT); doc.roundedRect(M, y, CW, BH, 3, 3, 'F');
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, BH, 3, 3);
    doc.setFillColor(160, 170, 185); doc.roundedRect(M, y, 2.2, BH, 1, 1, 'F');
    txt('OPEN BALANCE', M + 9, y + 9, { size: 7.4, bold: true, color: MUTED });
    txt(money(open), M + 9, y + 22.5, { head: true, size: 24 });
    var facts = [['OPEN CLAIMS', String(openN)], ['OLDEST OPEN DOS', oldest ? us(oldest) : '•'], ['BILLED / PAID', money(billed) + ' / ' + money(paid)]];
    var fx0 = M + CW * 0.44, fw2 = (RX - 6 - fx0) / 3;
    facts.forEach(function (f2, i) {
      var x = fx0 + i * fw2 + 6;
      line(x - 4, y + 7, x - 4, y + BH - 7);
      txt(f2[0], x, y + 12, { size: 6.6, bold: true, color: MUTED });
      txt(f2[1], x, y + 19.5, { size: i === 2 ? 9 : 12, bold: true });
    });
    y += BH + 5;
    txt('Open balance = billed charges minus insurance payments and contractual adjustments, for claims not fully resolved.', M, y, { size: 7, color: MUTED });

    footer(c, pat);
    doc.save(T + '_File_' + String(pat.last || 'X').replace(/[^A-Za-z0-9]+/g, '_') + '_' + (pat.acct || '') + '.pdf');
  };
})();
