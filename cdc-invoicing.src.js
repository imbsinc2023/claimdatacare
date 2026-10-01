/*
 * ClaimDataCare  •  Invoicing module
 * File: cdc-invoicing.js  •  v1.0
 *
 * Moved out of script1.js (2026-09-29): issuers, clients, invoices, partial payments,
 * invoice PDF / Excel export and invoice email. script1.js downloads this file the
 * first time someone opens Invoicing (or uses one of its buttons), so the app starts faster.
 * Data is saved to the cloud through the app's setDB() (Firestore); nothing is stored
 * in the browser. The code is the same as before, only moved.
 */

/* Website fonts for the invoice PDF: Sora (titles) and IBM Plex Sans (text), SIL Open Font
   License. If they cannot be loaded the PDF uses Helvetica as before. */
/* The fonts travel inside cdc-fonts.js (a normal script file next to app.html), so there is
   no separate fonts folder to upload. It is downloaded only when an invoice PDF is made. */
var _invFontData = null, _invFontLoading = null, _invFontTried = false;
function _invLoadFonts() {
  if (_invFontData) return Promise.resolve(_invFontData);
  if (window.__cdcInvFonts) { _invFontData = window.__cdcInvFonts; return Promise.resolve(_invFontData); }
  if (_invFontLoading) return _invFontLoading;
  if (_invFontTried) return Promise.resolve(null);
  // same loader (and same folder) as every other module, so if cdc-invoicing.js loads, this does too
  var load = (typeof _cdcLoadModule === 'function') ? function () { return _cdcLoadModule('cdc-fonts.js'); }
    : function () { return new Promise(function (ok, ko) { var sc = document.createElement('script'); sc.src = 'cdc-fonts.js?v=__CDC_BUILD__'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); }); };
  _invFontLoading = load().then(function () {
    _invFontLoading = null; _invFontData = window.__cdcInvFonts || null;
    if (!_invFontData) _invFontTried = true;
    return _invFontData;
  }, function () {
    _invFontTried = true; _invFontLoading = null;
    var where = location.origin + location.pathname.replace(/[^/]*$/, '') + 'cdc-fonts.js';
    console.warn('[CDC] invoice fonts: could not load ' + where);
    try { toast('Fonts file not found: ' + where + ' • PDF uses Helvetica', 'warn'); } catch (e) {}
    return null;
  });
  return _invFontLoading;
}
function _invUseFonts(doc) {
  if (!_invFontData) return false;
  try {
    doc.addFileToVFS('IBMPlexSans-Regular.ttf', _invFontData.plex); doc.addFont('IBMPlexSans-Regular.ttf', 'Plex', 'normal');
    doc.addFileToVFS('IBMPlexSans-SemiBold.ttf', _invFontData.plexB); doc.addFont('IBMPlexSans-SemiBold.ttf', 'Plex', 'bold');
    doc.addFileToVFS('Sora-Bold.ttf', _invFontData.sora); doc.addFont('Sora-Bold.ttf', 'Sora', 'bold');
    doc.addFileToVFS('IBMPlexSans-Italic.ttf', _invFontData.plexI); doc.addFont('IBMPlexSans-Italic.ttf', 'Plex', 'italic');
    doc.addFileToVFS('IBMPlexSans-SemiBoldItalic.ttf', _invFontData.plexBI); doc.addFont('IBMPlexSans-SemiBoldItalic.ttf', 'Plex', 'bolditalic');
    return true;
  } catch (e) { return false; }
}

/* Logos often come with wide empty margins, which made them look tiny in the PDF.
   A trimmed copy (empty/white border removed) is prepared in memory and used for the PDF. */
var _invLogoCache = {};
function _invTrimLogo(src) {
  return new Promise(function (resolve) {
    if (!src || _invLogoCache[src]) return resolve(_invLogoCache[src] || src);
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');
        c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(img, 0, 0);
        var img_ = x.getImageData(0, 0, w, h), d = img_.data, minX = w, minY = h, maxX = -1, maxY = -1;
        // Logos whose transparency was lost (saved with a solid black background): if all four
        // corners are the same dark colour, flood-fill that background from the edges to white
        (function () {
          var at = function (px, py) { var i = (py * w + px) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
          var cs = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)], c0 = cs[0];
          var near = function (a, b, t) { return Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t; };
          var dark = c0[3] > 200 && (c0[0] + c0[1] + c0[2]) / 3 < 45;
          if (!dark || !cs.every(function (c) { return c[3] > 200 && near(c, c0, 18); })) return;
          var seen = new Uint8Array(w * h), stack = [];
          for (var ex = 0; ex < w; ex++) { stack.push(ex, 0, ex, h - 1); }
          for (var ey = 0; ey < h; ey++) { stack.push(0, ey, w - 1, ey); }
          while (stack.length) {
            var py = stack.pop(), px = stack.pop(), k = py * w + px;
            if (px < 0 || py < 0 || px >= w || py >= h || seen[k]) continue;
            seen[k] = 1;
            var i = k * 4;
            if (!(d[i + 3] > 200 && Math.abs(d[i] - c0[0]) <= 40 && Math.abs(d[i + 1] - c0[1]) <= 40 && Math.abs(d[i + 2] - c0[2]) <= 40)) continue;
            d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 0;
            stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
          }
          x.putImageData(img_, 0, 0);
        })();
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var i = (yy * w + xx) * 4, a = d[i + 3];
          var empty = a < 16 || (d[i] > 246 && d[i + 1] > 246 && d[i + 2] > 246);
          if (!empty) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
        }
        if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
        var pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
        var o = document.createElement('canvas'); o.width = maxX - minX + 1; o.height = maxY - minY + 1;
        // flatten onto white: some transparent PNGs (palette / 16-bit) come out with a black
        // background in the PDF, while the invoice page is white anyway
        var ox = o.getContext('2d'); ox.fillStyle = '#FFFFFF'; ox.fillRect(0, 0, o.width, o.height);
        ox.drawImage(c, minX, minY, o.width, o.height, 0, 0, o.width, o.height);
        resolve(_invLogoCache[src] = o.toDataURL('image/png'));
      } catch (e) { resolve(_invLogoCache[src] = src); }
    };
    img.onerror = function () { resolve(_invLogoCache[src] = src); };
    img.src = src;
  });
}
function _invPrepLogos() { _invLoadFonts(); try { (getInvDB().invoicingIssuers || []).forEach(function (x) { if (x.logo) _invTrimLogo(x.logo); }); } catch (e) {} }

// "September-2026", "Sep 2026", "2026-09" or "09/2026" -> "September"
function _invMonthOnly(v) {
  var t = String(v || '').trim(); if (!t) return '';
  var NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var m = t.match(/^([A-Za-z]+)[\s\-\/,.]*\d{2,4}$/); if (m) t = m[1];
  else if ((m = t.match(/^(\d{4})[\-\/](\d{1,2})$/))) t = NAMES[+m[2] - 1] || t;
  else if ((m = t.match(/^(\d{1,2})[\-\/](\d{4})$/))) t = NAMES[+m[1] - 1] || t;
  var full = NAMES.find(function (x) { return x.toLowerCase().indexOf(t.toLowerCase().slice(0, 3)) === 0 && t.length >= 3; });
  return full || t;
}

function _buildInvoicePDF(invId, opts) {
opts = opts || {};
const db = getInvDB();
const inv = opts.inv || db.invoices.find(x => x.id === invId);
if (!inv) return null;
const iss = db.invoicingIssuers.find(x => x.id === inv.issuerId) || {};
const cli = resolveInvClient(inv.clientId, db) || {};

const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
const W = 210, M = 16, RX = W - M, CW = RX - M;
const WEB = _invUseFonts(doc);          // website fonts when available, Helvetica otherwise
const BODY = WEB ? 'Plex' : 'helvetica', HEADF = WEB ? 'Sora' : 'helvetica';

// Clean, basic layout. The only colour is the website's neon bar on the left edge of each page
// (orange, violet, blue, magenta) and Zelle's purple for the Zelle payment lines.
const INK = [11,21,38], INK2 = [58,71,92], MUTED = [88,101,121], LINE = [228,233,241];
const ZELLE = [109,30,212];
const ACCENT = [212,92,55];          // one fixed colour for highlighted figures (IMBS orange)
const HEAD = [246,248,251];          // table header background
const STOPS = [[255,106,61],[123,47,247],[0,163,209],[232,54,122]];

const money = n => '$' + fmtMoney(parseFloat(n) || 0);
const line = (x1, y1, x2, y2, c = LINE, w = 0.25) => { doc.setDrawColor(...c); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); };
const txt = (s, x, y, o = {}) => {
  doc.setFont(o.head ? HEADF : BODY, (o.bold || o.head) ? 'bold' : 'normal');
  doc.setFontSize(o.size || 9);
  doc.setTextColor(...(o.color || INK));
  doc.text(Array.isArray(s) ? s : String(s == null ? '' : s), x, y, { align: o.align || 'left', maxWidth: o.maxWidth });
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// neon colour bar down the left edge of every page
const topBar = () => {
  const n = 160, sh = 297 / n;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(t));
    doc.setFillColor(...mix(STOPS[k], STOPS[k + 1], t - k));
    doc.rect(0, i * sh, 1.6, sh + 0.15, 'F');
  }
};

// ---------- header: logo only (the company name is already under FROM) ----------
topBar();
let y = M;
// Logo: scaled to fit a 46 x 17 mm box, keeping its own proportions (a square logo ends up
// 24 x 24, a wide one up to 64 mm wide), vertically centred with the INVOICE title block.
let logoH = 0;
const HB = 17;
const logoSrc = iss.logo ? (_invLogoCache[iss.logo] || iss.logo) : '';
if (logoSrc) {
  try {
    const pr = doc.getImageProperties(logoSrc);
    const k = Math.min(46 / pr.width, HB / pr.height);
    const lw = pr.width * k, lh = pr.height * k;
    doc.addImage(logoSrc, pr.fileType || 'PNG', M, y + (HB - lh) / 2, lw, lh, undefined, 'FAST');
    logoH = HB;
  } catch (e) {}
}
txt('INVOICE', RX, y + 7.5, { head: true, size: 21, color: INK, align: 'right' });
txt('#' + (inv.number || ''), RX, y + 13, { size: 9, color: MUTED, align: 'right' });
txt('Status: ' + (inv.status || 'Draft'), RX, y + 17.5, { size: 8, color: MUTED, align: 'right' });
y += 24;

// ---------- dates ----------
line(M, y, RX, y);
const dets = [['Invoice date', inv.date || ''], ['Due date', inv.due || 'Upon receipt'], ['Period', fmtInvDate(inv.month) || inv.month || ''], ['Terms', iss.terms || 'Due on receipt']];
const dw = CW / dets.length;
dets.forEach(([l, v], i) => {
  txt(l.toUpperCase(), M + i * dw, y + 5.5, { size: 6.5, bold: true, color: MUTED });
  txt(v, M + i * dw, y + 11, { size: 9, color: INK });
});
y += 15; line(M, y, RX, y); y += 8;

// ---------- from / bill to ----------
const col2 = M + CW / 2 + 4;
// small line icons in the website's tomato, centred on an 8 pt text line (baseline yy)
const TOMATO = [255,106,61];
const pic = (k, x, yy) => {
  const c = yy - 1.1;
  doc.setDrawColor(...TOMATO); doc.setFillColor(...TOMATO); doc.setLineWidth(0.25);
  if (k === 'user') { doc.circle(x + 1.3, c - 0.55, 0.55, 'F'); doc.roundedRect(x + 0.4, c + 0.2, 1.8, 0.95, 0.45, 0.45, 'F'); }
  else if (k === 'pin') { doc.circle(x + 1.3, c - 0.35, 0.8, 'F'); doc.triangle(x + 0.6, c - 0.05, x + 2.0, c - 0.05, x + 1.3, c + 1.25, 'F'); doc.setFillColor(255,255,255); doc.circle(x + 1.3, c - 0.35, 0.3, 'F'); }
  else if (k === 'mail') { doc.rect(x + 0.1, c - 0.85, 2.4, 1.7); doc.line(x + 0.1, c - 0.85, x + 1.3, c + 0.1); doc.line(x + 2.5, c - 0.85, x + 1.3, c + 0.1); }
  else if (k === 'phone') { doc.roundedRect(x + 0.65, c - 1.15, 1.3, 2.3, 0.3, 0.3); doc.line(x + 1.1, c + 0.8, x + 1.5, c + 0.8); }
  else if (k === 'id') { doc.rect(x + 0.1, c - 0.8, 2.4, 1.6); doc.circle(x + 0.75, c - 0.1, 0.32, 'F'); doc.line(x + 1.3, c - 0.3, x + 2.15, c - 0.3); doc.line(x + 1.3, c + 0.3, x + 2.15, c + 0.3); }
};
const block = (e, x, sy, label, isFrom) => {
  let ly = sy;
  txt(label, x, ly, { size: 6.5, bold: true, color: MUTED }); ly += 5;
  // company name always on one line: the font shrinks until it fits the column
  const nmTxt = String(e.name || ''), maxW = CW / 2 - 8;
  let fs = 10.5; doc.setFont(HEADF, 'bold');
  while (fs > 6.5) { doc.setFontSize(fs); if (doc.getTextWidth(nmTxt) <= maxW) break; fs -= 0.25; }
  txt(nmTxt, x, ly, { size: fs, head: true, color: INK }); ly += 5;
  // each detail line gets a small tomato icon (contact, address, email, phone, EIN)
  const rowsInfo = [
    ['user', e.contact], ['pin', e.addr1], ['', [e.city, e.state, e.zip].filter(Boolean).join(', ')],
    ['mail', String(e.email || '').toLowerCase()], ['phone', e.phone ? fmtPhone(e.phone) : ''], ['id', e.taxid ? 'EIN ' + e.taxid : '']
  ].filter(r => r[1]);
  rowsInfo.forEach(r => { if (r[0]) pic(r[0], x, ly); txt(r[1], x + 4.4, ly, { size: 8, color: r[0] === 'id' ? MUTED : INK2 }); ly += 4; });
  return ly;
};
y = Math.max(block(iss, M, y, 'FROM', true), block(cli, col2, y, 'BILL TO', false)) + 8;

// ---------- service lines ----------
doc.setFillColor(...HEAD); doc.rect(M, y - 4.6, CW, 7.2, 'F');
txt('DESCRIPTION', M + 3, y, { size: 6.8, bold: true, color: INK2 });
txt('AMOUNT', RX - 3, y, { size: 6.8, bold: true, color: INK2, align: 'right' });
y += 2.6; line(M, y, RX, y, INK, 0.35); y += 5.5;
(inv.svcLines || []).filter(l => l.desc || (l.amount && parseFloat(l.amount) !== 0)).forEach(l => {
  const d = doc.splitTextToSize(String(l.desc || ''), CW - 45);
  txt(d, M + 3, y, { size: 8.5, color: INK });
  if (l.amount && parseFloat(l.amount) !== 0) txt(money(l.amount), RX - 3, y, { size: 8.5, color: INK, align: 'right' });
  y += 4 * d.length + 2; line(M, y - 1.5, RX, y - 1.5); y += 4;
});
const svcTotal = (inv.svcLines || []).reduce((a2, l) => a2 + (parseFloat(l.amount) || 0), 0);
const paid = parseFloat(inv.amtPaid || 0);

// ---------- totals (plain, right aligned) ----------
if (y + 55 > 272) { doc.addPage(); topBar(); y = M + 4; }
const tx = RX - 72;
y += 2;
txt('Subtotal', tx, y, { size: 8.5, color: INK2 }); txt(money(svcTotal), RX, y, { size: 8.5, color: INK, align: 'right' }); y += 5.5;
if (paid > 0) { txt('Paid', tx, y, { size: 8.5, color: INK2 }); txt('- ' + money(paid), RX, y, { size: 8.5, color: INK, align: 'right' }); y += 5.5; }
line(tx, y - 2, RX, y - 2, INK, 0.35); y += 3.5;
txt(paid > 0 ? 'Balance due' : 'Total due', tx, y, { size: 10, head: true, color: INK });
txt(money(Math.max(0, svcTotal - paid)), RX, y, { size: 12.5, bold: true, color: ACCENT, align: 'right' });
y += 14;

// ---------- invoice note (rich text, coloured by tone) ----------
const noteParas = _invNoteParas(inv.noteHtml, inv.notes);
if (noteParas.length) {
  const T = _INV_NOTE_TONES[inv.noteTone] || _INV_NOTE_TONES.none;
  const PAD = 5, BAR = 0, LH = 4.4, FS = 8.8, BAND = 7, maxW = CW - PAD * 2;
  const styleOf = r => (r.b && r.i) ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal';
  // lay out words into lines first, to size the box
  const lines = [];
  noteParas.forEach(p => {
    const indent = p.bullet ? 4 : 0;
    let line = { parts: [], w: indent, bullet: p.bullet, indent: indent };
    lines.push(line);
    p.runs.forEach(r => {
      r.t.split(/(\s+)/).forEach(w => {
        if (!w) return;
        doc.setFont(BODY, styleOf(r)); doc.setFontSize(FS);
        const ww = doc.getTextWidth(w);
        if (line.w + ww > maxW && line.parts.length && w.trim()) { line = { parts: [], w: indent, bullet: false, indent: indent }; lines.push(line); }
        if (!line.parts.length && !w.trim()) return;
        line.parts.push({ t: w, r: r, w: ww }); line.w += ww;
      });
    });
  });
  const boxH = BAND + 3.4 + lines.length * LH + 1.6;
  if (y + boxH + 4 > 268) { doc.addPage(); topBar(); y = M + 4; }
  txt('NOTE', M, y, { size: 6.8, bold: true, color: MUTED }); y += 3;
  // header band exactly the height of the title row (rounded top corners only)
  doc.setFillColor(...HEAD); doc.roundedRect(M, y, CW, BAND, 2, 2, 'F'); doc.rect(M, y + 2, CW, BAND - 2, 'F');
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, boxH, 2, 2);
  line(M, y + BAND, RX, y + BAND, LINE, 0.3);
  const title = String(inv.noteTitle || '').trim() || T.label;
  const hasDot = inv.noteTone && inv.noteTone !== 'none';
  doc.setFont(BODY, 'bold'); doc.setFontSize(8);
  const tw = doc.getTextWidth(title) + (hasDot ? 3.4 : 0), tx0 = M + CW / 2 - tw / 2;
  if (hasDot) { doc.setFillColor(...T.fg); doc.circle(tx0 + 0.9, y + BAND / 2, 0.9, 'F'); }
  txt(title, tx0 + (hasDot ? 3.4 : 0), y + 4.7, { size: 8, bold: true, color: INK });
  let ny = y + BAND + 3.4 + 2.6;
  lines.forEach(l => {
    let nx = M + BAR + PAD + l.indent;
    if (l.bullet) txt('\u2022', M + BAR + PAD + 0.6, ny, { size: FS, color: INK2 });
    l.parts.forEach(pt => {
      doc.setFont(BODY, styleOf(pt.r)); doc.setFontSize(FS); doc.setTextColor(...INK);
      doc.text(pt.t, nx, ny);
      if (pt.r.u && pt.t.trim()) { doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.line(nx, ny + 0.7, nx + pt.w, ny + 0.7); }
      nx += pt.w;
    });
    ny += LH;
  });
  y += boxH + 10;   // clear space before PAYMENT OPTIONS
}

// ---------- other text notes (exception note, billing entity notes): above payment options ----------
if (inv.excNoteText) { const t = doc.splitTextToSize(inv.excNoteText, CW); txt(t, M, y, { size: 8, color: INK2 }); y += t.length * 3.8 + 3; }
if (iss.notes) { const nl = doc.splitTextToSize(String(iss.notes), CW); txt(nl, M, y, { size: 7.8, color: MUTED }); y += nl.length * 3.6 + 4; }

// ---------- payment options ----------
// Two columns, each with a soft coloured title band: blue for the preferred (no fee) options,
// light tomato for the options that carry the 4.5% fee. Icons sit on the text's centre line.
const ROWH = 6.6;
const ic = (kind, x, yy) => {          // simple line icons, centred on the text baseline yy
  doc.setDrawColor(...INK2); doc.setLineWidth(0.3);
  const c = yy - 1.15, t = c - 1.6;   // visual centre of 8.5 pt text
  if (kind === 'check') {
    doc.roundedRect(x, t, 4.6, 3.2, 0.4, 0.4); doc.line(x + 0.8, t + 2.3, x + 2.6, t + 2.3); doc.line(x + 3.1, t + 0.9, x + 3.9, t + 0.9);
  } else if (kind === 'card') {
    doc.roundedRect(x, t, 4.6, 3.2, 0.5, 0.5); doc.setLineWidth(0.6); doc.line(x, t + 1.1, x + 4.6, t + 1.1); doc.setLineWidth(0.3);
  } else if (kind === 'bank') {
    doc.line(x, t + 1.0, x + 2.3, t - 0.1); doc.line(x + 2.3, t - 0.1, x + 4.6, t + 1.0); doc.line(x, t + 1.0, x + 4.6, t + 1.0);
    [0.6, 1.8, 3.0, 4.0].forEach(k => doc.line(x + k, t + 1.3, x + k, t + 2.8)); doc.line(x, t + 3.2, x + 4.6, t + 3.2);
  }
};
const zelleRow = (v, x, yy) => {
  const c = yy - 1.15;
  // same mark as in the app: purple rounded square, white ring, purple centre
  doc.setFillColor(...ZELLE); doc.roundedRect(x + 0.6, c - 1.7, 3.4, 3.4, 0.8, 0.8, 'F');
  doc.setFillColor(255,255,255); doc.roundedRect(x + 1.33, c - 0.97, 1.94, 1.94, 0.35, 0.35, 'F');
  doc.setFillColor(...ZELLE); doc.roundedRect(x + 1.82, c - 0.48, 0.96, 0.96, 0.18, 0.18, 'F');
  txt('Zelle', x + 7, yy, { size: 8.5, bold: true, color: ZELLE });
  txt(v, x + 19, yy, { size: 8.5, bold: true, color: ZELLE });
};
const zm = iss.zelleMode || 'phone';
const zRows = [];
if ((zm === 'phone' || zm === 'both') && iss.phone) zRows.push(fmtPhone(iss.phone));
if ((zm === 'email' || zm === 'both') && iss.email) zRows.push(String(iss.email).toLowerCase());
const leftN = zRows.length + 1, rightN = 2, rows = Math.max(leftN, rightN);
const bandH = 7, boxH = bandH + 4 + rows * ROWH + 2;
if (y + boxH + 18 > 272) { doc.addPage(); topBar(); y = M + 4; }
txt('PAYMENT OPTIONS', M, y, { size: 6.8, bold: true, color: MUTED }); y += 3;
const half = CW / 2;
// header band in the same grey as the DESCRIPTION header
doc.setFillColor(...HEAD); doc.roundedRect(M, y, CW, bandH, 2, 2, 'F'); doc.rect(M, y + 2, CW, bandH - 2, 'F');
doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, boxH, 2, 2);
line(M, y + bandH, RX, y + bandH, LINE, 0.3);
line(M + half, y, M + half, y + boxH, LINE, 0.3);
txt('Preferred  \u2022  no processing fees', M + half / 2, y + 4.7, { size: 8, bold: true, color: INK, align: 'center' });
txt('4.5% bank processing fee', M + half + half / 2, y + 4.7, { size: 8, bold: true, color: INK2, align: 'center' });
// each column's rows form one block, centred horizontally and vertically in its half
const wOf = (t, b) => { doc.setFont(BODY, b ? 'bold' : 'normal'); doc.setFontSize(8.5); return doc.getTextWidth(t); };
const leftW = Math.max(7 + wOf('Paper check'), ...zRows.map(v => 19 + wOf(v, true)));
const rightW = 7 + Math.max(wOf('Virtual card'), wOf('Direct deposit'));
const lx = M + half / 2 - leftW / 2, rx2 = M + half + half / 2 - rightW / 2;
const bodyTop = y + bandH, bodyH = boxH - bandH;
const firstLine = n => bodyTop + (bodyH - n * ROWH) / 2 + ROWH / 2 + 1.15;
let ly2 = firstLine(leftN);
zRows.forEach(v => { zelleRow(v, lx - 0.6, ly2); ly2 += ROWH; });
ic('check', lx, ly2); txt('Paper check', lx + 7, ly2, { size: 8.5, color: INK });
let ry = firstLine(rightN);
ic('card', rx2, ry); txt('Virtual card', rx2 + 7, ry, { size: 8.5, color: INK }); ry += ROWH;
ic('bank', rx2, ry); txt('Direct deposit', rx2 + 7, ry, { size: 8.5, color: INK });
y += boxH + 6;
txt('Thank you for your business.', M, Math.min(y + 8, 272), { size: 9, bold: true, color: INK });

// ---------- payment detail pages ----------
if (inv.lines && inv.lines.length) {
  doc.addPage(); topBar();
  let py = M;
  txt('Payment detail', M, py + 5, { size: 13, head: true, color: INK });
  txt([iss.name, cli.name, inv.month].filter(Boolean).join('  \u2022  '), M, py + 10.5, { size: 8, color: MUTED });
  txt('#' + (inv.number || ''), RX, py + 5, { size: 9, color: MUTED, align: 'right' });
  py += 19;
  const cols = [
    { key: 'date', label: 'DATE', w: 24 }, { key: 'desc', label: 'DESCRIPTION', w: 38 },
    { key: 'paymentId', label: 'CHECK / ID', w: 30 }, { key: 'insurance', label: 'INSURANCE', w: 34 },
    { key: 'month', label: 'MONTH', w: 24 }, { key: 'amount', label: 'AMOUNT', w: 0, right: true }
  ].filter(c => c.right || inv.lines.some(l => l[c.key]));
  let xc = M; cols.forEach(c => { c.x = c.right ? RX : xc; if (!c.right) xc += c.w; });
  const head = () => {
    doc.setFillColor(...HEAD); doc.rect(M, py - 4.6, CW, 7.2, 'F');
    cols.forEach(c => txt(c.label, c.right ? c.x - 3 : c.x + 3, py, { size: 6.8, bold: true, color: INK2, align: c.right ? 'right' : 'left' }));
    py += 2.6; line(M, py, RX, py, INK, 0.35); py += 5.5;
  };
  head();
  let total = 0;
  _invSortLines(inv.lines).forEach(l => {
    if (py > 270) { doc.addPage(); topBar(); py = M + 4; head(); }
    cols.forEach(c => {
      if (c.right) txt(money(parseFloat(l.amount) || 0), c.x - 3, py, { size: 8.3, color: INK, align: 'right' });
      else {
        let cell = String(l[c.key] || '');
        if (c.key === 'month') cell = _invMonthOnly(cell);   // month name only, no year
        txt(cell.toUpperCase().slice(0, Math.max(4, Math.floor(c.w / 2.0))), c.x + 3, py, { size: 8.3, color: INK2 });
      }
    });
    line(M, py + 2.3, RX, py + 2.3); total += parseFloat(l.amount) || 0; py += 7;
  });
  py += 2; line(M, py - 2, RX, py - 2, INK, 0.35); py += 4;
  txt('Total revenue', M + 3, py, { size: 9.5, bold: true, color: INK });
  txt(money(total), RX - 3, py, { size: 11, bold: true, color: INK, align: 'right' });
}

// payments-only export: drop the invoice page, keep the payment detail page(s)
if (opts.paymentsOnly && doc.getNumberOfPages() > 1) doc.deletePage(1);

// ---------- footer on every page ----------
const pages = doc.getNumberOfPages();
for (let p = 1; p <= pages; p++) {
  doc.setPage(p);
  line(M, 283, RX, 283);
  txt(inv.number ? 'Invoice #' + inv.number : '', M, 289.5, { size: 7, color: MUTED });
  txt('Powered by ClaimDataCare  \u2022  claimdatacare.com', W / 2, 289.5, { size: 7, color: MUTED, align: 'center' });
  txt('Page ' + p + ' / ' + pages, RX, 289.5, { size: 7, color: MUTED, align: 'right' });
}
return doc;
}

async function exportInvoicePDF(invId) {
await _invLoadFonts();
try { const i0 = getInvDB().invoices.find(x => x.id === invId), s0 = i0 && getInvDB().invoicingIssuers.find(x => x.id === i0.issuerId); if (s0 && s0.logo) await _invTrimLogo(s0.logo); } catch (e) {}
const doc = _buildInvoicePDF(invId);
if (!doc) { toast('Save the invoice first','warn'); return; }
const inv = getInvDB().invoices.find(x => x.id === invId);
doc.save('Invoice_' + (inv.number||'draft') + '.pdf');
toast('Invoice PDF exported');
}

function previewInvoicePDF(invId) {
  var _pid = invId === 'preview' ? _currentInvId : invId;
  var _pinv = _pid && (getInvDB().invoices || []).find(function (x) { return x.id === _pid; });
  var _piss = _pinv && (getInvDB().invoicingIssuers || []).find(function (x) { return x.id === _pinv.issuerId; });
  if (_piss && _piss.logo && !_invLogoCache[_piss.logo] && !previewInvoicePDF._logoWait) {
    previewInvoicePDF._logoWait = true;
    return _invTrimLogo(_piss.logo).then(function () { previewInvoicePDF._logoWait = false; return previewInvoicePDF(invId); });
  }
  if (!_invFontData && !_invFontTried) return _invLoadFonts().then(function () { _invFontTried = true; return previewInvoicePDF(invId); });
  // If called from modal, use the current modal state
  var targetId = invId === 'preview' ? _currentInvId : invId;
  if (!targetId) {
    // Auto-save then preview
    saveInvoice();
    targetId = _currentInvId;
  }
  const doc = _buildInvoicePDF(targetId);
  if (!doc) { toast('Save the invoice first, then preview','warn'); return; }
  const inv = getInvDB().invoices.find(x => x.id === targetId);
  try {
    const pdfData = doc.output('datauristring');
    _openPDFPreview(pdfData, {
      title: 'Invoice ' + (inv ? inv.number || '' : ''),
      downloadName: 'invoice_' + (inv ? inv.number||'draft' : 'draft') + '.pdf'
    });
  } catch(e) {
    toast('Preview failed: ' + e.message,'err');
    console.error('Preview error:', e);
  }
}

function deleteInvoice(id) {
const db = getInvDB();
const inv = db.invoices.find(x => x.id === id);
if(!inv)return;return cdcConfirm(`Delete invoice ${inv.number}?`).then((__ok)=>{if(!__ok)return;
setDB(db => { db.invoices = db.invoices.filter(x => x.id !== id); });
renderInvoicesList();
toast('Invoice deleted');

});}

function togglePasteArea() {
  _invEnsureModals();
  var ov = document.getElementById('modal-inv-paste'); if (!ov) return;
  if (ov.classList.contains('open')) { closeModal('modal-inv-paste'); return; }
  var ta = document.getElementById('inv-paste-input'), pv = document.getElementById('inv-paste-preview');
  if (ta) ta.value = ''; if (pv) pv.textContent = 'Nothing pasted yet.';
  openModal('modal-inv-paste');
  setTimeout(function () { _renderLucideIcons(); if (ta) ta.focus(); }, 30);
}

function previewPastedLines() {
const raw = document.getElementById('inv-paste-input').value.trim();
const prev = document.getElementById('inv-paste-preview');
if (!raw) { prev.textContent = 'Nothing pasted yet.'; return; }
const parsed = parsePastedLines(raw);
if (!parsed.length) {
prev.innerHTML = '<span style="color:var(--red)"><i data-lucide="alert-triangle" class="lci" style="color:var(--red)"></i> No valid lines detected. Make sure columns are tab-separated.</span>';
return;
}
prev.innerHTML = `<span style="color:#0E7A55">${parsed.length} line(s) ready to import</span>`;
}

function parsePastedLines(raw) {
// Accepts tab-separated (Excel copy) or comma-separated
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const result = [];

// Detect if first line is a header and build a column index map
let colMap = null;
const knownHeaders = {
  'payment date': 'date',
  'date': 'date',
  'product': 'desc',
  'product / description': 'desc',
  'description': 'desc',
  'payment id': 'paymentId',
  'payment id / check #': 'paymentId',
  'check #': 'paymentId',
  'amount': 'amount',
  'status': 'status',
  'insurance': 'insurance',
  'insurance / payer': 'insurance',
  'payer': 'insurance',
  'invoice number': 'invoiceNum',
  'invoice month': 'month',
  'month': 'month',
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'memo': 'notes'
};

for (const line of lines) {
  // Detect separator: tab (Excel) or comma
  const sep = line.includes('\t') ? '\t' : ',';
  const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, '').trim());
  const firstCol = (cols[0] || '').toLowerCase();

  // Detect header row and build column map
  if (!colMap && (firstCol.includes('date') || firstCol.includes('payment') || firstCol.includes('description'))) {
    colMap = {};
    cols.forEach((h, i) => {
      const key = h.toLowerCase().trim();
      if (knownHeaders[key]) colMap[knownHeaders[key]] = i;
    });
    continue;
  }

  // Skip non-data rows
  if (cols.length < 2) continue;

  let obj;
  if (colMap) {
    // Use header-based mapping
    const get = (field) => (colMap[field] !== undefined ? cols[colMap[field]] || '' : '');
    const rawAmt = get('amount').replace(/[$,\s]/g, '');
    const parsedAmt = parseFloat(rawAmt);
    obj = {
      date:       get('date'),
      desc:       get('desc'),
      paymentId:  get('paymentId'),
      insurance:  get('insurance'),
      invoiceNum: get('invoiceNum'),
      month:      get('month'),
      notes:      get('notes'),
      status:     get('status'),
      amount:     (!isNaN(parsedAmt) && parsedAmt > 0) ? parsedAmt.toFixed(2) : ''
    };
  } else {
    // Fallback positional: [0]Date [1]Product [2]PaymentID [3]Amount [4]Status [5]Insurance [6]InvoiceNum [7]Month
    const rawAmt = (cols[3] || '').replace(/[$,\s]/g, '');
    const parsedAmt = parseFloat(rawAmt);
    obj = {
      date:       cols[0] || '',
      desc:       cols[1] || '',
      paymentId:  cols[2] || '',
      amount:     (!isNaN(parsedAmt) && parsedAmt > 0) ? parsedAmt.toFixed(2) : '',
      status:     cols[4] || '',
      insurance:  cols[5] || '',
      invoiceNum: cols[6] || '',
      month:      cols[7] || '',
      notes:      cols.slice(8).filter(Boolean).join(' ')
    };
    // If amount still not found, scan remaining cols
    if (!obj.amount) {
      for (let i = cols.length - 1; i >= 1; i--) {
        const num = parseFloat(cols[i].replace(/[$,\s]/g, ''));
        if (!isNaN(num) && num > 0) { obj.amount = num.toFixed(2); break; }
      }
    }
  }

  if (obj.date) { const d = new Date(obj.date); if (!isNaN(d)) obj.date = d.toISOString().split('T')[0]; }
  if (obj.date || obj.amount) result.push(obj);
}
return result;
}

// Upload a CSV or Excel file of payments (same columns as "paste from Excel")
function importPaymentFile(ev) {
  var input = ev && ev.target, f = input && input.files && input.files[0]; if (!f) return;
  var done = function (text) {
    var parsed = parsePastedLines(text || '');
    if (input) input.value = '';
    if (!parsed.length) { toast('No valid lines found in ' + f.name, 'warn'); return; }
    parsed.forEach(function (p) { _invLines.push(p); });
    renderInvLines();
    toast(parsed.length + ' line(s) imported from ' + f.name);
  };
  var rd = new FileReader();
  if (/\.(xlsx|xls)$/i.test(f.name)) {
    if (typeof XLSX === 'undefined') { toast('Excel import is not available', 'err'); return; }
    rd.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        var ws = wb.Sheets[wb.SheetNames[0]];
        done(XLSX.utils.sheet_to_csv(ws, { FS: '\t', dateNF: 'yyyy-mm-dd' }));
      } catch (err) { toast('Could not read ' + f.name, 'err'); }
    };
    rd.readAsArrayBuffer(f);
  } else {
    rd.onload = function (e) { done(String(e.target.result || '')); };
    rd.readAsText(f);
  }
}

function importPastedLines() {
const raw = document.getElementById('inv-paste-input').value.trim();
const parsed = parsePastedLines(raw);
if (!parsed.length) { toast('No valid lines found','warn'); return; }
parsed.forEach(p => _invLines.push(p));
renderInvLines();
togglePasteArea();
toast(parsed.length + ' line(s) imported');
}

function exportInvoiceExcel(invId) {
const db = getInvDB();
const inv = db.invoices.find(x => x.id === invId);
if (!inv) return;
const iss = db.invoicingIssuers.find(x => x.id === inv.issuerId) || {};
const cli = resolveInvClient(inv.clientId, db);

if (!window.XLSX) { toast('Excel library loading, try again in a moment','warn'); return; }

const wb = XLSX.utils.book_new();
const data = [
['INVOICE', '', '', '', '', '', '', '', ''],
[`Invoice #: ${inv.number}`, '', '', `Date: ${inv.date||''}`, '', '', `Status: ${inv.status}`, '', ''],
[`Month: ${inv.month||''}`, '', '', `Due: ${inv.due||''}`, '', '', `Billing Fee: ${inv.fee||0}%`, '', ''],
['', '', '', '', '', '', '', '', ''],
[`From: ${iss.name||''}`, '', '', `To: ${cli.name||''}`, '', '', '', '', ''],
[`${iss.addr1||''} ${iss.city||''} ${iss.state||''}`, '', '', `${cli.addr1||''} ${cli.city||''} ${cli.state||''}`, '', '', '', '', ''],
[`${iss.phone||''} ${iss.email||''}`, '', '', `${cli.phone||''} ${cli.email||''}`, '', '', '', '', ''],
['', '', '', '', '', '', '', '', ''],
['Payment Date', 'Product / Description', 'Payment ID / Check #', 'Insurance / Payer', 'Invoice Month', 'Amount'],
...inv.lines.map(l => [l.date, l.desc, l.paymentId, l.insurance, l.month, parseFloat(l.amount)||0]),
['', '', '', '', '', '', '', '', ''],
['', '', '', '', 'Subtotal', inv.subtotal||0, '', '', ''],
['', '', '', '', `Billing Fee (${inv.fee||0}%)`, inv.total||0, '', '', ''],
['', '', '', '', 'TOTAL DUE', inv.total||0, '', '', ''],
];

const ws = XLSX.utils.aoa_to_sheet(data);

// Column widths
ws['!cols'] = [14,26,18,18,14,12].map(w => ({wch:w}));

// Merge title row
ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:8} }];

XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
XLSX.writeFile(wb, `Invoice_${inv.number}.xlsx`);
toast('Excel exported');
}

let _invSvcLines = [];

function renderInvSvcLines() {
  const el = document.getElementById('inv-svc-lines');
  if (!el) return;
  el.innerHTML = _invSvcLines.map(function(s, i) {
    const isFirst = i === 0;
    const amtStyle = isFirst
      ? 'flex:1;padding:7px 10px;border:1.5px solid var(--brand);border-radius:var(--r);background:var(--brand-bg);color:var(--text);font-family:var(--mono);font-size:13px;font-weight:600'
      : 'flex:1;padding:7px 10px;border:1.5px solid var(--border2);border-radius:var(--r);background:var(--bg2);color:var(--text);font-family:var(--mono);font-size:13px';
    return '<div class="inv-svc-row" draggable="true" data-idx="'+i+'"'
      + ' style="display:flex;gap:8px;align-items:center;cursor:grab;padding:2px 0"'
      + ' ondragstart="invSvcDragStart(event,'+i+')"'
      + ' ondragover="invSvcDragOver(event)"'
      + ' ondrop="invSvcDrop(event,'+i+')"'
      + ' ondragend="invSvcDragEnd()">'
      + '<span style="color:var(--text3);font-size:16px;cursor:grab;padding:0 4px;user-select:none">⋮</span>'
      + '<input class="no-upper" style="flex:2;padding:7px 10px;border:1.5px solid var(--border2);border-radius:var(--r);background:var(--bg2);color:var(--text);font-family:var(--font);font-size:13px"'
      + ' value="'+s.desc+'" placeholder="e.g. Medical Billing Services" oninput="_invSvcLines['+i+'].desc=this.value">'
      + '<div style="position:relative;flex:1">'
      + '<input id="inv-svc-amt-'+i+'" style="'+amtStyle+';width:100%;box-sizing:border-box"'
      + ' type="number" value="'+(s.amount||'')+'" placeholder="0.00"'
      + ' oninput="_invSvcLines['+i+'].amount=this.value;if('+i+'===0)_invSvcLines[0]._manualOverride=true;recalcInvoice()">'
      + (isFirst ? '<span title="Auto-calculated • editable" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--brand);pointer-events:none;font-weight:700">AUTO</span>' : '')
      + '</div>'
      + '<button title="Remove" class="btn btn-xs btn-danger" onclick="_invSvcLines.splice('+i+',1);renderInvSvcLines()"><i data-lucide="x" class="lci"></i></button>'
      + '</div>';
  }).join('');
  const addBtn = document.getElementById('inv-svc-add');
  if (addBtn) addBtn.style.visibility = _invSvcLines.length >= 4 ? 'hidden' : '';   // keeps its place
  recalcInvoice();
  setTimeout(_renderLucideIcons, 10);
}

let _invDragIdx = -1;

function invSvcDragStart(e, i) {
_invDragIdx = i;
e.dataTransfer.effectAllowed = 'move';
setTimeout(() => { const rows = document.querySelectorAll('.inv-svc-row'); if(rows[i]) rows[i].style.opacity='0.4'; }, 0);
}

function invSvcDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

function invSvcDrop(e, toIdx) {
e.preventDefault();
if (_invDragIdx === toIdx || _invDragIdx < 0) return;
const moved = _invSvcLines.splice(_invDragIdx, 1)[0];
_invSvcLines.splice(toIdx, 0, moved);
_invDragIdx = -1;
renderInvSvcLines();
}

function invSvcDragEnd() {
_invDragIdx = -1;
document.querySelectorAll('.inv-svc-row').forEach(r => r.style.opacity = '');
}

function addInvSvcLine() {
if (_invSvcLines.length >= 4) return;
_invSvcLines.push({ desc: '', amount: '' });
renderInvSvcLines();
}

function addInvPayLine() {
  if (!_invLines) _invLines = [];
  _invLines.push({ date: new Date().toISOString().split('T')[0], desc: '', paymentId: '', amount: '', status: '', insurance: '', invoiceNum: '', month: '', notes: '' });
  renderInvLines();
}

function recalcInvoice() {
  const el = id => document.getElementById(id);

  // ── Inputs ──────────────────────────────────────────────────────
  const feePct   = parseFloat(el('inv-fee')?.value) || 0;
  const minRevenue = parseFloat(el('inv-min-base')?.value) || 0; // MINIMUM REVENUE threshold
  const excBase  = parseFloat(el('inv-exc-base')?.value) || 0;   // Exception/concession (optional)
  const excMths  = parseFloat(el('inv-exc-months')?.value) || 0;
  const excUsed  = parseFloat(el('inv-exc-used')?.value) || 0;

  // ── Revenue = auto-sum of all payment lines ────────────────────
  const autoRevenue = (_invLines||[]).reduce(function(s,l){ return s+(parseFloat(l.amount)||0); }, 0);
  const manualRevenue = parseFloat(el('inv-revenue')?.value) || 0;
  const revenue = autoRevenue > 0 ? autoRevenue : manualRevenue;

  // Update revenue field to show auto-calculated value
  const revEl = el('inv-revenue');
  if (revEl && autoRevenue > 0) {
    revEl.value = autoRevenue.toFixed(2);
    revEl.readOnly = true;
    revEl.style.background = 'var(--bg3)';
    revEl.title = 'Auto-calculated from Payment Details';
  }

  const svcTotal = (_invSvcLines||[]).reduce(function(s,l){ return s+(parseFloat(l.amount)||0); }, 0);

  // ── Exception / Concession (optional) ─────────────────────────
  const excRemaining = excMths - excUsed;
  const excActive = excBase > 0 && excMths > 0 && excRemaining > 0;

  // ── Core fee logic ─────────────────────────────────────────────
  // RULE: Compare actual revenue to minimum revenue threshold
  //   • If actual revenue < minimum revenue → apply fee% to minimum revenue
  //   • If actual revenue >= minimum revenue → apply fee% to actual revenue
  //   • Exception/concession overrides both (optional)
  //
  // Example: fee=6%, minRevenue=$20,000, actualRevenue=$3,500
  //   → $3,500 < $20,000 → fee = $20,000 × 6% = $1,200
  //
  // Example: fee=6%, minRevenue=$20,000, actualRevenue=$30,000
  //   → $30,000 >= $20,000 → fee = $30,000 × 6% = $1,800

  let feeBase, finalFee, feeLabel, calcMethod;

  if (excActive) {
    // Concession override • use exception base
    feeBase   = excBase;
    finalFee  = excBase * feePct / 100;
    calcMethod = 'exception';
    feeLabel  = feePct + '% of concession base $' + fmtMoney(excBase);
  } else if (minRevenue > 0 && revenue < minRevenue) {
    // Revenue below minimum → apply % to minimum revenue
    feeBase   = minRevenue;
    finalFee  = minRevenue * feePct / 100;
    calcMethod = 'minimum';
    feeLabel  = feePct + '% of minimum revenue $' + fmtMoney(minRevenue);
  } else {
    // Revenue at or above minimum → apply % to actual revenue
    feeBase   = revenue;
    finalFee  = revenue * feePct / 100;
    calcMethod = 'standard';
    feeLabel  = feePct + '% of revenue $' + fmtMoney(revenue);
  }

  // ── Update UI ─────────────────────────────────────────────────
  const set = function(id, val) { const e = el(id); if (e) e.textContent = val; };
  set('inv-disp-revenue', '$' + fmtMoney(revenue));
  set('inv-disp-feepct',  feePct + '%');
  set('inv-disp-calc',    '$' + fmtMoney(feeBase * feePct / 100));
  set('inv-disp-min',     minRevenue > 0 ? '$' + fmtMoney(minRevenue) : 'None');
  set('inv-disp-base',    '$' + fmtMoney(feeBase));

  // Exception note
  const excNoteEl = el('inv-exc-note');
  if (excNoteEl) {
    if (excActive) {
      excNoteEl.style.display = '';
      excNoteEl.style.color   = 'var(--amber)';
      excNoteEl.textContent   = 'Concession active: $' + fmtMoney(excBase) + ' base · month ' + (excUsed+1) + ' of ' + excMths;
    } else if (excBase > 0 && excRemaining <= 0) {
      excNoteEl.style.display = '';
      excNoteEl.style.color   = 'var(--text3)';
      excNoteEl.textContent   = 'Concession completed (' + excUsed + '/' + excMths + ' months)';
    } else {
      excNoteEl.style.display = 'none';
    }
  }

  // Totals
  if (el('inv-subtotal'))    el('inv-subtotal').textContent    = '$' + fmtMoney(svcTotal);
  if (el('inv-fee-pct-lbl')) el('inv-fee-pct-lbl').textContent = feeLabel;
  if (el('inv-fee-amt'))     el('inv-fee-amt').textContent     = '$' + fmtMoney(finalFee);
  if (el('inv-total'))       el('inv-total').textContent       = '$' + fmtMoney(finalFee);

  const feeEl = el('inv-fee-amt');
  if (feeEl) feeEl.style.color = calcMethod === 'standard' ? 'var(--text)' : 'var(--amber)';

  // ── Auto-fill first service line amount with calculated fee ────
  // Only auto-fill if user hasn't manually overridden it
  if (_invSvcLines && _invSvcLines.length > 0) {
    const firstLine = _invSvcLines[0];
    const currentVal = parseFloat(firstLine.amount) || 0;
    const feeDiff = Math.abs(currentVal - finalFee);
    // Auto-fill if: empty, or matches a previously auto-set value (within $0.01)
    // Don't override if user manually typed a very different value
    if (!firstLine._manualOverride || feeDiff < 0.02) {
      firstLine.amount = finalFee > 0 ? finalFee.toFixed(2) : '';
      firstLine._autoSet = true;
      // Update the input field directly without re-rendering
      const amtInput = document.getElementById('inv-svc-amt-0');
      if (amtInput && document.activeElement !== amtInput) {
        amtInput.value = firstLine.amount;
      }
    }
  }

  // Breakdown line • shows exact calculation
  const breakdownEl = el('inv-calc-breakdown');
  if (breakdownEl) {
    if (calcMethod === 'minimum') {
      breakdownEl.innerHTML = 'Actual revenue <span style="color:var(--amber);font-weight:700">$' + fmtMoney(revenue) + '</span> &lt; Minimum revenue $' + fmtMoney(minRevenue) + ' &rarr; <strong>$' + fmtMoney(minRevenue) + ' &times; ' + feePct + '% = $' + fmtMoney(finalFee) + '</strong>';
      breakdownEl.style.color = 'var(--amber)';
    } else if (calcMethod === 'exception') {
      breakdownEl.innerHTML = 'Concession: $' + fmtMoney(excBase) + ' &times; ' + feePct + '% = <strong>$' + fmtMoney(finalFee) + '</strong>';
      breakdownEl.style.color = 'var(--amber)';
    } else {
      breakdownEl.innerHTML = '$' + fmtMoney(revenue) + ' &times; ' + feePct + '% = <strong>$' + fmtMoney(finalFee) + '</strong>';
      breakdownEl.style.color = 'var(--text3)';
    }
  }
}

/* ---------------- Payment details: order and export ---------------- */
function _invDateCmp(a, b) {                 // newest first, rows without a date at the end
  var x = a && a.date || '', y = b && b.date || '';
  if (!x && !y) return 0; if (!x) return 1; if (!y) return -1;
  return x < y ? 1 : x > y ? -1 : 0;
}
function _invSortLines(lines) { return (lines || []).slice().sort(_invDateCmp); }
// the invoice as it is in the window right now (unsaved edits included)
function _invCurrentDraft() {
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var id = g('inv-id'), saved = id ? (getInvDB().invoices || []).find(function (x) { return x.id === id; }) : null;
  return Object.assign({}, saved || {}, { id: id || 'draft', issuerId: g('inv-issuer'), clientId: g('inv-client'), number: g('inv-number'), month: g('inv-month'), lines: _invSortLines(_invLines) });
}
function _invExportName(inv, ext) {
  var cli = String(_resolveInvClientName(inv.clientId, getInvDB()) || 'Client').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return 'Payments_' + cli + '_' + String(inv.month || inv.number || '').replace(/[^A-Za-z0-9]+/g, '_') + '.' + ext;
}
async function exportInvPaymentsPDF() {
  if (!(_invLines || []).length) { toast('No payments to export', 'warn'); return; }
  await _invLoadFonts();
  var inv = _invCurrentDraft();
  var doc = _buildInvoicePDF(inv.id, { inv: inv, paymentsOnly: true });
  if (doc) doc.save(_invExportName(inv, 'pdf'));
}
function exportInvPaymentsExcel() {
  if (!(_invLines || []).length) { toast('No payments to export', 'warn'); return; }
  if (typeof XLSX === 'undefined') { toast('Excel export is not available', 'err'); return; }
  var inv = _invCurrentDraft();
  var rows = [['Date', 'Description', 'Payment ID', 'Amount', 'Status', 'Insurance', 'Invoice month', 'Notes']];
  var total = 0;
  inv.lines.forEach(function (l) { var a = parseFloat(l.amount) || 0; total += a; rows.push([l.date || '', l.desc || '', l.paymentId || '', a, l.status || '', l.insurance || '', l.month || '', l.notes || '']); });
  rows.push([]); rows.push(['', '', 'Total revenue', Math.round(total * 100) / 100]);
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 30 }];
  ws['!autofilter'] = { ref: 'A1:H' + (inv.lines.length + 1) };
  for (var r = 2; r <= rows.length; r++) { var c = ws['D' + r]; if (c && typeof c.v === 'number') c.z = '"$"#,##0.00'; }
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Payments');
  XLSX.writeFile(wb, _invExportName(inv, 'xlsx'));
}

/* ---------------- Invoice note: rich text (bold, italic, underline, bullets) + tone ---------------- */
var _INV_NOTE_TONES = {
  none: { label: 'Additional information', fg: [140,152,171] },
  good: { label: 'Additional information', fg: [14,122,85] },
  warn: { label: 'Please note', fg: [196,140,30] },
  bad:  { label: 'Important', fg: [200,56,30] }
};
// keeps only b/strong/i/em/u, line breaks, paragraphs and lists; drops every attribute
function _invSanitizeNote(html) {
  var ok = { B:1, STRONG:1, I:1, EM:1, U:1, BR:1, DIV:1, P:1, UL:1, OL:1, LI:1 };
  var src = document.createElement('div'); src.innerHTML = String(html || '');
  var walk = function (node) {
    var out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) out += n.nodeValue.replace(/[&<>]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;' }[c]; });
      else if (n.nodeType === 1) {
        var t = n.tagName; if (t === 'SCRIPT' || t === 'STYLE') return;
        var inner = walk(n);
        if (t === 'BR') out += '<br>';
        else if (ok[t]) out += '<' + t.toLowerCase() + '>' + inner + '</' + t.toLowerCase() + '>';
        else out += inner;
      }
    });
    return out;
  };
  return walk(src).replace(/^(<br>)+|(<br>)+$/g, '');
}
// html -> paragraphs of styled runs, for the PDF (works without a DOM)
function _invNoteParas(html, plain) {
  var paras = [], cur = null, st = { b: 0, i: 0, u: 0 };
  var newPara = function (bullet) { cur = { runs: [], bullet: !!bullet }; paras.push(cur); };
  var dec = function (t) { return t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); };
  if (!html) { String(plain || '').split(/\r?\n/).forEach(function (l) { newPara(false); if (l) cur.runs.push({ t: l, b: false, i: false, u: false }); }); }
  else {
    newPara(false);
    String(html).split(/(<[^>]+>)/).forEach(function (tok) {
      if (!tok) return;
      var m = tok.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
      if (m) {
        var close = !!m[1], tag = m[2].toLowerCase();
        if (tag === 'br') newPara(false);
        else if (tag === 'li') { if (!close) { if (!cur.runs.length) cur.bullet = true; else newPara(true); } }
        else if (tag === 'div' || tag === 'p' || tag === 'ul' || tag === 'ol') { if (cur.runs.length) newPara(false); }
        else if (tag === 'b' || tag === 'strong') st.b += close ? -1 : 1;
        else if (tag === 'i' || tag === 'em') st.i += close ? -1 : 1;
        else if (tag === 'u') st.u += close ? -1 : 1;
        return;
      }
      cur.runs.push({ t: dec(tok), b: st.b > 0, i: st.i > 0, u: st.u > 0 });
    });
  }
  // trim empty paragraphs at both ends and collapse repeated empty lines
  var out = [];
  paras.forEach(function (p) {
    var empty = !p.runs.some(function (r) { return r.t.trim(); });
    if (empty && (!out.length || out[out.length - 1]._empty)) return;
    p._empty = empty; out.push(p);
  });
  while (out.length && out[out.length - 1]._empty) out.pop();
  return out;
}
function _invNoteCmd(c) {
  var ed = document.getElementById('inv-note-editor'); if (!ed) return;
  ed.focus();
  try { document.execCommand(c === 'list' ? 'insertUnorderedList' : c, false, null); } catch (e) {}
  _invNoteSync();
}
function _invNoteSync() {
  var ed = document.getElementById('inv-note-editor'), h = document.getElementById('inv-notes');
  if (ed && h) h.value = (ed.innerText || ed.textContent || '').trim();
}
function _invNoteTone(t) {
  t = _INV_NOTE_TONES[t] ? t : 'none';
  var h = document.getElementById('inv-note-tone'); if (h) h.value = t;
  document.querySelectorAll('#modal-invoice .invm-tone').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tone') === t); });
  var ed = document.getElementById('inv-note-editor'); if (ed) ed.className = 'invm-ned t-' + t;
}

/* ---------------- Invoicing UI (header tabs, fused KPI cards, card tables) ---------------- */
var _INV_TABS = [['dashboard','Dashboard','layout-dashboard'],['invoices','Invoices','file-text'],['clients','Clients','building'],['issuers','Billing Entities','briefcase']];
var _INV_ACTION = { invoices:['openInvoiceModal()','New invoice'], clients:['openClientModal()','New client'], issuers:['openIssuerModal()','New billing entity'] };
var _invTab = 'dashboard';
var _INV_CSS = [
  '#sec-invoices .inv{display:flex;flex-direction:column;gap:16px}',
  '.inv-hd{display:flex;align-items:flex-end;gap:22px;border-bottom:1px solid #E4E9F1;min-height:46px}',
  '.inv-title{margin:0 0 8px;display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap}',
  '.inv-title .ic{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#FF6A3D,#7B2FF7)}',
  '.inv-title .ic .lci{width:17px;height:17px}',
  '.inv-tabs{display:flex;gap:4px;margin-bottom:-1px;overflow-x:auto;scrollbar-width:none}',
  '.inv-tabs::-webkit-scrollbar{display:none}',
  '.inv-tab{display:flex;align-items:center;gap:7px;height:38px;padding:0 16px;border:1px solid transparent;border-bottom:1px solid #E4E9F1;border-radius:10px 10px 0 0;background:#F4F6FA;font-family:inherit;font-size:12.5px;font-weight:600;color:#586579;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}',
  '.inv-tab .lci{width:14px;height:14px}',
  '.inv-tab:hover{background:#EEF1F6;color:#0B1526}',
  '.inv-tab.on{background:#fff;border-color:#E4E9F1;border-bottom-color:#fff;color:#D45C37;box-shadow:inset 0 2px 0 #FF6A3D;cursor:default}',
  '.inv-act{margin:0 0 7px auto;position:relative;width:34px;height:34px;flex:none;border:0;border-radius:11px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#FF6A3D,#D45C37);box-shadow:0 10px 20px -12px rgba(255,106,61,.9);display:flex;align-items:center;justify-content:center}',
  '.inv-act[hidden]{display:none}',
  '.inv-zelle{display:inline-flex;align-items:center;gap:6px;color:#6D1ED4;font-weight:600}',
  '.inv-flt{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  '.inv-flt select{height:34px;padding:0 10px;border:1px solid #E4E9F1;border-radius:10px;font-size:12.5px;background:#fff;color:#0B1526}',
  '.inv-flt label{display:flex;align-items:center;gap:6px;font-size:12px;color:#3A475C;cursor:pointer}',
  '.inv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}',
  '.inv-kpi{position:relative;overflow:hidden;border-radius:16px;padding:16px 18px;min-height:112px;color:#fff;background-size:400% 100%;display:flex;flex-direction:column;justify-content:space-between}',
  '.inv-kpi:after{content:"";position:absolute;right:-40px;top:-40px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.13)}',
  '.inv-kpi .t{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;opacity:.95}',
  '.inv-kpi .t .lci{width:20px;height:20px;opacity:.9}',
  '.inv-kpi .v{position:relative;z-index:1;font-size:clamp(22px,2.1vw,30px);font-weight:700;letter-spacing:-.02em;line-height:1.05;margin-top:8px}',
  '.inv-kpi .s{position:relative;z-index:1;font-size:11.5px;opacity:.88;margin-top:4px}',
  '.inv-g2{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px}',
  '.inv-card{background:#fff;border:1px solid #E4E9F1;border-radius:14px;padding:16px 18px;min-width:0}',
  '.inv-card-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
  '.inv-card-hd h3{margin:0;font-size:14px;font-weight:700}',
  '.inv-card-hd small{font-size:11px;color:#586579}',
  '.inv-link{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;font-size:12px;font-weight:600;color:#3A475C;cursor:pointer}',
  '.inv-link:hover{color:#D45C37;border-color:#FFD2C2}',
  '.inv-tw{overflow-x:auto;overflow-y:hidden}',
  '.inv-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
  '.inv-tbl th{padding:0 10px 8px;text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#586579;white-space:nowrap}',
  '.inv-tbl td{padding:9px 10px;border-top:1px solid #F1F4F8;white-space:nowrap;vertical-align:middle}',
  '.inv-tbl tbody tr:hover{background:#F8FAFC}',
  '.inv-tbl .num{text-align:right;font-variant-numeric:tabular-nums}',
  '.inv-tbl .mono{font-family:var(--mono,monospace);font-size:11.5px;color:#3A475C}',
  '.inv-tbl .strong{font-weight:700;color:#0B1526}',
  '.inv-pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}',
  '.inv-pill.Draft{background:#EEF1F6;color:#3A475C}.inv-pill.Sent{background:rgba(0,163,209,.12);color:#0A6A8C}.inv-pill.Partial{background:rgba(123,47,247,.12);color:#5B17D6}.inv-pill.Overdue{background:rgba(232,54,122,.12);color:#B8215E}.inv-pill.Paid{background:rgba(14,138,95,.12);color:#0E7A55}',
  '.inv-st{height:28px;padding:0 8px;border:1px solid #E4E9F1;border-radius:8px;font-size:11.5px;font-weight:600;background:#fff;color:#0B1526;cursor:pointer}',
  '.inv-acts{display:flex;gap:4px}',
  '.inv-ib{width:30px;height:30px;flex:none;box-sizing:border-box;border:1px solid #E4E9F1;border-radius:9px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .15s,border-color .15s,background-color .15s}',
  '.inv-ib .lci{width:14px;height:14px}',
  '.inv-ib.pay{color:#fff;border-color:transparent;background:#FF6A3D}',
  '.inv-ib.pay:hover{color:#fff;background:#D45C37;border-color:transparent}',
  '.inv-empty{padding:28px 10px;text-align:center;font-size:13px;color:#586579}',
  '.inv-bars svg{display:block;width:100%;height:auto}',
  '.inv-key{display:flex;gap:12px;font-size:11px;color:#586579}.inv-key span{display:flex;align-items:center;gap:6px}.inv-key i{width:14px;height:6px;border-radius:3px;background:#7B2FF7}.inv-key i.lt{opacity:.25}',
  '.invm-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;padding:16px 20px;overflow:hidden}',
  '.invm-main{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding-right:4px}',
  '.invm-side{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px}',
  '.invm-sec{border:1px solid #EEF1F6;border-radius:14px;padding:12px 14px;background:#fff}',
  '.invm-sec h4,.invm-card h4{margin:0 0 10px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#586579}',
  '.invm-sh{display:flex;align-items:center;gap:6px;margin-bottom:8px}',
  '.invm-sh h4{margin:0}',
  '.invm-sp{flex:1}',
  '.invm-grid{display:grid;gap:10px 12px}',
  '.invm-grid.g6{grid-template-columns:repeat(6,minmax(0,1fr))}',
  '.invm-f{min-width:0}.invm-f.s2{grid-column:span 2}',
  '.invm-f label{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.invm-f input,.invm-f select,.invm-card textarea,.invm-nop{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:1px solid #E4E9F1;border-radius:9px;font-family:inherit;font-size:12.5px;background:#fff;color:#0B1526}',
  '.invm-f input[readonly]{background:#F4F6FA;color:#586579}',
  '.invm-pair{display:flex;gap:6px}.invm-pair select{flex:1}.invm-pair input{width:78px;flex:none;text-align:center}',
  '.invm-note{height:18px;margin-top:6px;font-size:11.5px;color:#586579;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
  '.invm-card{border:1px solid #EEF1F6;border-radius:14px;padding:12px 14px;background:#F8FAFC}',
  '.invm-card textarea{height:auto;min-height:90px;padding:8px 10px;resize:vertical}',
  '.invm-kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12.5px;color:#3A475C}',
  '.invm-kv b{font-weight:700;color:#0B1526;font-variant-numeric:tabular-nums;white-space:nowrap}',
  '.invm-calc{min-height:32px;margin-top:6px;padding:6px 8px;border-radius:8px;background:#fff;border:1px solid #EEF1F6;font-size:11px;line-height:1.4;color:#586579}',
  '.invm-sep{height:1px;background:#E4E9F1;margin:8px 0}',
  '.invm-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;padding-top:8px;border-top:1px solid #E4E9F1;font-size:13px;font-weight:700;color:#0B1526}',
  '.invm-total b{font-size:20px;color:#D45C37;font-variant-numeric:tabular-nums}',
  '.invm-tw{overflow-x:auto}',
  '.invm-tbl{width:100%;border-collapse:collapse;font-size:11.5px}',
  '.invm-tbl th{padding:6px 4px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#586579;text-align:left;border-bottom:1px solid #E4E9F1;white-space:nowrap}',
  '.invm-hint{font-size:11px;color:#586579;margin:2px 0 6px}',
  '.invm-ib{position:relative;width:34px;height:34px;flex:none;box-sizing:border-box;border:1px solid #E4E9F1;border-radius:10px;background:#fff;color:#3A475C;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s,border-color .15s}',
  '.invm-ib .lci{width:16px;height:16px}',
  '.invm-ib.xl{color:#0E7A55}',
  '.invm-vsep{width:1px;height:22px;background:#E4E9F1;margin:0 4px}',
  '.invm-ib:hover{background:rgba(255,106,61,.09);color:#D45C37;border-color:rgba(255,106,61,.35)}',
  '.invm-ftr{flex:none!important;display:flex!important;align-items:center;gap:8px;height:62px;box-sizing:border-box;padding:0 18px!important;border-top:1px solid #E4E9F1;background:#F8FAFC}',
  '#inv-svc-lines .inv-svc-row{margin-bottom:6px}',
  '#inv-svc-lines .btn-danger{width:34px;height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:9px}',
  '.invm-tones{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px}',
  '.invm-tone{display:flex;align-items:center;justify-content:center;gap:5px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;font-family:inherit;font-size:11px;font-weight:600;color:#3A475C;cursor:pointer;transition:background-color .15s,border-color .15s,color .15s}',
  '.invm-tone i{width:8px;height:8px;border-radius:50%;background:#8C98AB}',
  '.invm-tone[data-tone=good] i{background:#0E8A5F}.invm-tone[data-tone=warn] i{background:#D69E2E}.invm-tone[data-tone=bad] i{background:#C8381E}',
  '.invm-tone.on{background:#0B1526;border-color:#0B1526;color:#fff}',
  '.invm-tb{display:flex;gap:4px;margin-bottom:6px}',
  '.invm-tbb{width:30px;height:28px;border:1px solid #E4E9F1;border-radius:8px;background:#fff;color:#3A475C;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s,border-color .15s}',
  '.invm-tbb .lci{width:14px;height:14px}',
  '.invm-tbb:hover{background:rgba(255,106,61,.09);color:#D45C37;border-color:rgba(255,106,61,.35)}',
  '.invm-ned{min-height:110px;max-height:220px;overflow-y:auto;padding:8px 10px 8px 12px;border:1px solid #E4E9F1;border-left:4px solid #8C98AB;border-radius:9px;background:#fff;font-size:12.5px;line-height:1.5;color:#0B1526;outline:none}',
  '.invm-ned:empty:before{content:attr(data-ph);color:#8C98AB}',
  '.invm-ned ul{margin:2px 0;padding-left:18px}',
  '.invm-ned.t-good{border-left-color:#0E8A5F;background:#F2FAF6}.invm-ned.t-warn{border-left-color:#D69E2E;background:#FFFBEF}.invm-ned.t-bad{border-left-color:#C8381E;background:#FEF4F2}',
  '.issm .invm-body{grid-template-columns:minmax(0,1fr) 300px}',
  '.issm-logo{height:150px;border:1px dashed #D5DCE7;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;overflow:hidden}',
  '.issm-logo img{max-width:100%;max-height:100%;object-fit:contain}',
  '.izl-lbl{display:flex!important;align-items:center;gap:6px;color:#6D1ED4!important}',
  '.izl{display:grid;grid-template-columns:repeat(3,1fr);height:34px;border:1px solid rgba(109,30,212,.25);border-radius:9px;overflow:hidden;background:rgba(109,30,212,.04)}',
  '.izl button{border:0;background:transparent;font-family:inherit;font-size:12px;font-weight:600;color:#6D1ED4;cursor:pointer;transition:background-color .15s,color .15s}',
  '.izl button+button{border-left:1px solid rgba(109,30,212,.18)}',
  '.izl button:hover{background:rgba(109,30,212,.08)}',
  '.izl button.on{background:#6D1ED4;color:#fff}',
  '.invp{width:92vw!important;max-width:760px!important;height:min(460px,86vh)!important;display:flex!important;flex-direction:column;border-radius:18px!important;padding:0!important;overflow:hidden}',
  '.invp-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:16px 20px}',
  '.invp-body textarea{flex:1;min-height:0;width:100%;box-sizing:border-box;padding:10px;border:1px solid #E4E9F1;border-radius:10px;font-family:var(--mono,monospace);font-size:12px;resize:none;background:#fff;color:#0B1526}',
  '.invp-st{height:18px;font-size:12px;font-weight:600;color:#586579;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '@media (max-width:1100px){.invm-body{grid-template-columns:minmax(0,1fr);overflow-y:auto}.invm-main,.invm-side{overflow:visible}.invm-grid.g6{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '@media (max-width:1100px){.inv-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.inv-g2{grid-template-columns:minmax(0,1fr)}}',
  '@media (max-width:620px){.inv-kpis{grid-template-columns:minmax(0,1fr)}}'
].join('\n');

function _invEsc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function _invIco(n) { return '<i data-lucide="' + n + '" class="lci"></i>'; }

function _invSkeleton() {
  var sec = document.getElementById('sec-invoices'); if (!sec) return;
  if (!document.getElementById('inv-style')) { var st = document.createElement('style'); st.id = 'inv-style'; st.textContent = _INV_CSS; document.head.appendChild(st); }
  if (sec.querySelector('.inv-hd')) return;   // new layout already in place (old markup gets replaced)
  sec.innerHTML = '<div class="page-body"><div class="inv">' +
    '<div class="inv-hd"><h1 class="inv-title"><span class="ic">' + _invIco('receipt') + '</span>Invoicing</h1>' +
      '<div class="inv-tabs" id="inv-tabs" role="tablist">' +
        _INV_TABS.map(function (t) { return '<button type="button" role="tab" class="inv-tab" id="inv-stab-' + t[0] + '" data-t="' + t[0] + '" onclick="setInvTab(\'' + t[0] + '\')">' + _invIco(t[2]) + t[1] + '</button>'; }).join('') +
      '</div>' +
      '<button type="button" class="inv-act" id="inv-btn-new" hidden aria-label="New">' + _invIco('plus') + '</button>' +
    '</div>' +
    '<div id="inv-panel-dashboard"></div>' +
    '<div id="inv-panel-invoices" style="display:none"><div class="inv-card">' +
      '<div class="inv-flt" style="margin-bottom:12px">' +
        '<select id="inv-filter-issuer" onchange="renderInvoicesList()"><option value="">All Billing Entities</option></select>' +
        '<select id="inv-filter-client" onchange="renderInvoicesList()"><option value="">All Clients</option></select>' +
        '<select id="inv-filter-status" onchange="renderInvoicesList()"><option value="">All Status</option><option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Partial">Partial</option><option value="Overdue">Overdue</option><option value="Paid">Paid</option></select>' +
        '<label><input type="checkbox" id="inv-show-paid" onchange="renderInvoicesList()" style="accent-color:#FF6A3D"> Show paid</label>' +
      '</div><div id="inv-list"></div></div></div>' +
    '<div id="inv-panel-clients" style="display:none"><div class="inv-card" id="inv-clients-list"></div></div>' +
    '<div id="inv-panel-issuers" style="display:none"><div class="inv-card" id="inv-issuers-list"></div></div>' +
  '</div></div>';
}

function _invMoveInd() {
  var tabs = document.getElementById('inv-tabs'); if (!tabs) return;
  tabs.querySelectorAll('.inv-tab').forEach(function (b) { var a = b.getAttribute('data-t') === _invTab; b.classList.toggle('on', a); b.setAttribute('aria-selected', a); });
}

function _invActions(inv, withPay) {
  var id = _invEsc(inv.id);
  return '<div class="inv-acts">' +
    (withPay !== false ? '<button class="inv-ib pay" data-tip="Record payment" aria-label="Record payment" onclick="openPartialPaymentModal(\'' + id + '\')">' + _invIco('dollar-sign') + '</button>' : '') +
    '<button class="inv-ib" data-tip="Preview" aria-label="Preview" onclick="previewInvoicePDF(\'' + id + '\')">' + _invIco('eye') + '</button>' +
    '<button class="inv-ib" data-tip="Download PDF" aria-label="Download PDF" onclick="exportInvoicePDF(\'' + id + '\')">' + _invIco('file-down') + '</button>' +
    '<button class="inv-ib mail" data-tip="Send by email" aria-label="Send by email" onclick="_invEmailById(\'' + id + '\')">' + _invIco('mail') + '</button>' +
    '<button class="inv-ib" data-tip="Edit" aria-label="Edit" onclick="openInvoiceModal(\'' + id + '\')">' + _invIco('pencil') + '</button>' +
    '<button class="inv-ib del" data-tip="Delete" aria-label="Delete" onclick="deleteInvoice(\'' + id + '\')">' + _invIco('trash-2') + '</button>' +
  '</div>';
}
function _invEmailById(id) { var inv = (getInvDB().invoices || []).find(function (x) { return x.id === id; }); if (inv) sendInvoiceEmail(inv); }

/* ---------------- Invoicing modals (moved here from script1.js; built the first time they are needed) ---------------- */
function _invEnsureModals() {
  if (!document.getElementById('inv-style')) { var st = document.createElement('style'); st.id = 'inv-style'; st.textContent = _INV_CSS; document.head.appendChild(st); }
  function mk(id, html) {
    if (document.getElementById(id)) return;
    var w = document.createElement('div'); w.className = 'overlay'; w.id = id; w.innerHTML = html; document.body.appendChild(w);
  }
  // Invoice window: wide, uses horizontal space first (sections side by side, summary on the right)
  mk('modal-invoice',
    '<div class="modal invm cdc-win">' +
    '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t"><i data-lucide="receipt" class="lci"></i><span id="inv-modal-title">Invoice</span></span>' +
    '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-invoice\')"><i data-lucide="x" class="lci"></i></button></div>' +
    '<div class="invm-body"><input type="hidden" id="inv-id">' +
      '<div class="invm-main">' +
        '<section class="invm-sec"><h4>Details</h4><div class="invm-grid g6">' +
          '<div class="invm-f s2"><label>Billing entity *</label><select id="inv-issuer" onchange="recalcInvoice()"><option value="">Select</option></select></div>' +
          '<div class="invm-f s2"><label>Client / provider *</label><select id="inv-client" onchange="onInvClientChange();recalcInvoice()"><option value="">Select</option></select></div>' +
          '<div class="invm-f"><label>Invoice #</label><input id="inv-number" class="mono" placeholder="Auto" readonly tabindex="-1"></div>' +
          '<div class="invm-f"><label>Status</label><select id="inv-status"><option>Draft</option><option>Sent</option><option>Partial</option><option>Overdue</option><option>Paid</option></select></div>' +
          '<div class="invm-f s2"><label>Billing period</label><div class="invm-pair">' +
            '<select id="inv-month-sel" onchange="var m=this.value,y=document.getElementById(\'inv-month-year\').value;document.getElementById(\'inv-month\').value=_buildInvPeriod(m,y);recalcInvoice()">' +
            '<option value="1">January</option><option value="2">February</option><option value="3">March</option><option value="4">April</option><option value="5">May</option><option value="6">June</option><option value="7">July</option><option value="8">August</option><option value="9">September</option><option value="10">October</option><option value="11">November</option><option value="12">December</option></select>' +
            '<input type="number" id="inv-month-year" min="2020" max="2035" onchange="var m=document.getElementById(\'inv-month-sel\').value,y=this.value;document.getElementById(\'inv-month\').value=_buildInvPeriod(m,y);recalcInvoice()">' +
            '<input type="hidden" id="inv-month"></div></div>' +
          '<div class="invm-f s2"><label>Invoice date</label><input type="date" id="inv-date" onchange="recalcInvoice()"></div>' +
          '<div class="invm-f s2"><label>Due date</label><input type="date" id="inv-due"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Billing structure</h4><div class="invm-grid g6">' +
          '<div class="invm-f"><label>Fee %</label><input type="number" id="inv-fee" step="0.01" placeholder="6" oninput="recalcInvoice()"></div>' +
          '<div class="invm-f"><label>Min revenue base $</label><input type="number" id="inv-min-base" step="0.01" placeholder="0.00" oninput="recalcInvoice()"></div>' +
          '<div class="invm-f"><label>Revenue collected $</label><input type="number" id="inv-revenue" step="0.01" placeholder="0.00" oninput="recalcInvoice()"></div>' +
          '<div class="invm-f"><label>Exception base $</label><input type="number" id="inv-exc-base" step="0.01" placeholder="0.00" oninput="recalcInvoice()"></div>' +
          '<div class="invm-f"><label>Exc. months total</label><input type="number" id="inv-exc-months" step="1" placeholder="0" oninput="recalcInvoice()"></div>' +
          '<div class="invm-f"><label>Exc. months used</label><input type="number" id="inv-exc-used" step="1" placeholder="0" min="0" oninput="recalcInvoice()"></div>' +
        '</div><div class="invm-note"><span id="inv-exc-note"></span></div></section>' +
        '<section class="invm-sec"><div class="invm-sh"><h4>Service lines</h4><span class="invm-sp"></span>' +
          '<button type="button" class="invm-ib" id="inv-svc-add" data-tip="Add service line" aria-label="Add service line" onclick="addInvSvcLine()"><i data-lucide="plus" class="lci"></i></button></div>' +
          '<div id="inv-svc-lines"></div></section>' +
        '<section class="invm-sec"><div class="invm-sh"><h4>Payment details</h4><span class="invm-sp"></span>' +
          '<button type="button" class="invm-ib" data-tip="Export table to PDF" aria-label="Export table to PDF" onclick="exportInvPaymentsPDF()"><i data-lucide="file-text" class="lci"></i></button>' +
          '<button type="button" class="invm-ib xl" data-tip="Export table to Excel" aria-label="Export table to Excel" onclick="exportInvPaymentsExcel()"><i data-lucide="file-spreadsheet" class="lci"></i></button>' +
          '<span class="invm-vsep"></span>' +
          '<button type="button" class="invm-ib" id="inv-paste-btn" data-tip="Paste from Excel" aria-label="Paste from Excel" onclick="togglePasteArea()"><i data-lucide="clipboard-paste" class="lci"></i></button>' +
          '<label class="invm-ib" data-tip="Upload CSV or Excel" aria-label="Upload CSV or Excel"><i data-lucide="upload" class="lci"></i><input type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importPaymentFile(event)"></label>' +
          '<button type="button" class="invm-ib" data-tip="Add payment row" aria-label="Add payment row" onclick="addInvPayLine()"><i data-lucide="plus" class="lci"></i></button></div>' +
          '<div class="invm-tw"><table class="invm-tbl"><thead><tr><th>Date</th><th>Product</th><th>Payment ID</th><th>Amount</th><th>Status</th><th>Insurance</th><th>Inv. month</th><th>Notes</th><th></th></tr></thead>' +
          '<tbody id="inv-lines-body"></tbody></table></div></section>' +
      '</div>' +
      '<aside class="invm-side">' +
        '<div class="invm-card"><h4>Summary</h4>' +
          '<div class="invm-kv"><span>Revenue</span><b id="inv-disp-revenue">$0.00</b></div>' +
          '<div class="invm-kv"><span>Fee</span><b id="inv-disp-feepct">0%</b></div>' +
          '<div class="invm-kv"><span>Minimum base</span><b id="inv-disp-min">None</b></div>' +
          '<div class="invm-kv"><span>Base used</span><b id="inv-disp-base">$0.00</b></div>' +
          '<div class="invm-kv"><span>Calculated fee</span><b id="inv-disp-calc">$0.00</b></div>' +
          '<div class="invm-calc" id="inv-calc-breakdown"></div>' +
          '<div class="invm-sep"></div>' +
          '<div class="invm-kv"><span>Service lines</span><b id="inv-subtotal">$0.00</b></div>' +
          '<div class="invm-kv"><span id="inv-fee-pct-lbl">Fee</span><b id="inv-fee-amt">$0.00</b></div>' +
          '<div class="invm-total"><span>Total due</span><b id="inv-total">$0.00</b></div>' +
        '</div>' +
        '<div class="invm-card"><h4>Invoice note</h4>' +
          '<div class="invm-tones"><input type="hidden" id="inv-note-tone" value="none">' +
            '<button type="button" class="invm-tone on" data-tone="none" onclick="_invNoteTone(\'none\')"><i></i>Neutral</button>' +
            '<button type="button" class="invm-tone" data-tone="good" onclick="_invNoteTone(\'good\')"><i></i>Positive</button>' +
            '<button type="button" class="invm-tone" data-tone="warn" onclick="_invNoteTone(\'warn\')"><i></i>Caution</button>' +
            '<button type="button" class="invm-tone" data-tone="bad" onclick="_invNoteTone(\'bad\')"><i></i>Important</button></div>' +
          '<div class="invm-f" style="margin-bottom:8px"><label>Title</label><input id="inv-note-title" class="no-upper" placeholder="e.g. Clarification"></div>' +
          '<div class="invm-tb">' +
            '<button type="button" class="invm-tbb" data-tip="Bold" aria-label="Bold" onmousedown="event.preventDefault();_invNoteCmd(\'bold\')"><i data-lucide="bold" class="lci"></i></button>' +
            '<button type="button" class="invm-tbb" data-tip="Italic" aria-label="Italic" onmousedown="event.preventDefault();_invNoteCmd(\'italic\')"><i data-lucide="italic" class="lci"></i></button>' +
            '<button type="button" class="invm-tbb" data-tip="Underline" aria-label="Underline" onmousedown="event.preventDefault();_invNoteCmd(\'underline\')"><i data-lucide="underline" class="lci"></i></button>' +
            '<button type="button" class="invm-tbb" data-tip="Bullet list" aria-label="Bullet list" onmousedown="event.preventDefault();_invNoteCmd(\'list\')"><i data-lucide="list" class="lci"></i></button>' +
            '<button type="button" class="invm-tbb" data-tip="Clear formatting" aria-label="Clear formatting" onmousedown="event.preventDefault();_invNoteCmd(\'removeFormat\')"><i data-lucide="remove-formatting" class="lci"></i></button>' +
          '</div>' +
          '<div id="inv-note-editor" class="invm-ned t-none" contenteditable="true" data-ph="Extra note shown on the invoice" oninput="_invNoteSync()"></div>' +
          '<input type="hidden" id="inv-notes"></div>' +
      '</aside>' +
    '</div>' +
    '<div class="modal-ftr invm-ftr"><span class="invm-sp"></span>' +
      '<button type="button" class="cdc-no" onclick="closeModal(\'modal-invoice\')"><i data-lucide="x" class="lci"></i>Cancel</button>' +
      '<button type="button" class="cdc-alt" onclick="previewInvoicePDF(\'preview\')"><i data-lucide="eye" class="lci"></i>Preview</button>' +
      '<button type="button" class="cdc-ok" onclick="saveInvoice()"><i data-lucide="save" class="lci"></i>Save</button>' +
    '</div></div>');

  // Paste-from-Excel window (opens over the invoice; nothing in the invoice moves)
  mk('modal-inv-paste',
    '<div class="modal invp">' +
    '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t"><i data-lucide="clipboard-paste" class="lci"></i>Paste payments from Excel</span>' +
    '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="togglePasteArea()"><i data-lucide="x" class="lci"></i></button></div>' +
    '<div class="invp-body">' +
      '<div class="invm-hint">Copy the rows in Excel (with or without the header row) and paste them here. Columns: payment date, product, payment ID, amount, status, insurance, invoice #, invoice month, notes.</div>' +
      '<textarea id="inv-paste-input" class="no-upper" placeholder="Paste here (Ctrl+V)" oninput="previewPastedLines()"></textarea>' +
      '<div class="invp-st" id="inv-paste-preview"></div>' +
    '</div>' +
    '<div class="modal-ftr invm-ftr"><span class="invm-sp"></span>' +
      '<button type="button" class="cdc-no" onclick="togglePasteArea()"><i data-lucide="x" class="lci"></i>Cancel</button>' +
      '<button type="button" class="cdc-ok" onclick="importPastedLines()"><i data-lucide="check" class="lci"></i>Import</button>' +
    '</div></div>');

  // Billing entity window: wide, sections side by side, logo and notes on the right
  mk('modal-issuer',
    '<div class="modal invm issm cdc-win">' +
    '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t"><i data-lucide="briefcase" class="lci"></i><span id="iss-title">Billing entity</span></span>' +
    '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-issuer\')"><i data-lucide="x" class="lci"></i></button></div>' +
    '<div class="invm-body"><input type="hidden" id="iss-id">' +
      '<div class="invm-main">' +
        '<section class="invm-sec"><h4>Entity</h4><div class="invm-grid g6">' +
          '<div class="invm-f" style="grid-column:span 4"><label>Entity name *</label><input id="iss-name"></div>' +
          '<div class="invm-f"><label>Tax ID (EIN)</label><input id="iss-taxid" maxlength="10"></div>' +
          '<div class="invm-f"><label>NPI</label><input id="iss-npi" maxlength="10"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Contact</h4><div class="invm-grid g6">' +
          '<div class="invm-f s2"><label>Phone</label><input id="iss-phone"></div>' +
          '<div class="invm-f s2"><label>Email</label><input id="iss-email" type="email"></div>' +
          '<div class="invm-f s2"><label>Website</label><input id="iss-web" class="no-upper" placeholder="integratedmbs.com"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Address</h4><div class="invm-grid g6">' +
          '<div class="invm-f" style="grid-column:span 3"><label>Street</label><input id="iss-addr1"></div>' +
          '<div class="invm-f"><label>City</label><input id="iss-city"></div>' +
          '<div class="invm-f"><label>State</label><input id="iss-state" maxlength="2"></div>' +
          '<div class="invm-f"><label>ZIP</label><input id="iss-zip" maxlength="10"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Billing and payment</h4><div class="invm-grid g6">' +
          '<div class="invm-f"><label>Fee %</label><input id="iss-fee" type="number" step="0.01"></div>' +
          '<div class="invm-f s2"><label>Payment terms</label><select id="iss-terms"><option>Net 30</option><option>Net 15</option><option>Due on receipt</option><option>Net 60</option></select></div>' +
          '<div class="invm-f" style="grid-column:span 3"><label class="izl-lbl"><span class="zelle-mark" aria-hidden="true"></span>Zelle shows</label>' +
            '<input type="hidden" id="iss-zelle-mode" value="phone"><div class="izl">' +
            '<button type="button" id="zelle-btn-phone" class="on" onclick="setZelleMode(\'phone\')">Phone</button>' +
            '<button type="button" id="zelle-btn-email" onclick="setZelleMode(\'email\')">Email</button>' +
            '<button type="button" id="zelle-btn-both" onclick="setZelleMode(\'both\')">Both</button></div></div>' +
        '</div></section>' +
      '</div>' +
      '<aside class="invm-side">' +
        '<div class="invm-card"><div class="invm-sh"><h4>Logo</h4><span class="invm-sp"></span>' +
          '<input type="file" id="iss-logo-file" accept="image/*" onchange="loadIssuerLogo(event)" style="display:none">' +
          '<button type="button" class="invm-ib" data-tip="Upload logo" aria-label="Upload logo" onclick="document.getElementById(\'iss-logo-file\').click()"><i data-lucide="upload" class="lci"></i></button>' +
          '<button type="button" class="invm-ib" data-tip="Remove logo" aria-label="Remove logo" onclick="clearIssuerLogo()"><i data-lucide="trash-2" class="lci"></i></button></div>' +
          '<div id="iss-logo-preview" class="issm-logo"><span style="font-size:11px;color:var(--text3)">No logo</span></div>' +
          '<div class="invm-hint" style="margin-top:6px">PNG with a transparent background works best.</div></div>' +
        '<div class="invm-card"><h4>Notes</h4><textarea id="iss-notes" rows="6" placeholder="Printed on every invoice of this entity"></textarea></div>' +
      '</aside>' +
    '</div>' +
    '<div class="modal-ftr invm-ftr"><span class="invm-sp"></span>' +
      '<button type="button" class="cdc-no" onclick="closeModal(\'modal-issuer\')"><i data-lucide="x" class="lci"></i>Cancel</button>' +
      '<button type="button" class="cdc-ok" onclick="saveIssuer()"><i data-lucide="save" class="lci"></i>Save</button>' +
    '</div></div>');

  // Client window: same layout and size as the other windows
  mk('modal-client',
    '<div class="modal invm cdc-win">' +
    '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t"><i data-lucide="building" class="lci"></i><span id="cli-title">Client</span></span>' +
    '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-client\')"><i data-lucide="x" class="lci"></i></button></div>' +
    '<div class="invm-body"><input type="hidden" id="cli-id">' +
      '<div class="invm-main">' +
        '<section class="invm-sec"><h4>Client</h4><div class="invm-grid g6">' +
          '<div class="invm-f" style="grid-column:span 4"><label>Client name *</label><input id="cli-name"></div>' +
          '<div class="invm-f"><label>Tax ID</label><input id="cli-taxid"></div>' +
          '<div class="invm-f"><label>NPI</label><input id="cli-npi"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Contact</h4><div class="invm-grid g6">' +
          '<div class="invm-f s2"><label>Contact person</label><input id="cli-contact"></div>' +
          '<div class="invm-f s2"><label>Phone</label><input id="cli-phone"></div>' +
          '<div class="invm-f s2"><label>Email</label><input id="cli-email" type="email"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Address</h4><div class="invm-grid g6">' +
          '<div class="invm-f" style="grid-column:span 3"><label>Street</label><input id="cli-addr1"></div>' +
          '<div class="invm-f"><label>City</label><input id="cli-city"></div>' +
          '<div class="invm-f"><label>State</label><input id="cli-state" maxlength="2"></div>' +
          '<div class="invm-f"><label>ZIP</label><input id="cli-zip" maxlength="10"></div>' +
        '</div></section>' +
        '<section class="invm-sec"><h4>Billing</h4><div class="invm-grid g6">' +
          '<div class="invm-f"><label>Fee %</label><input id="cli-fee" type="number" step="0.01"></div>' +
        '</div></section>' +
      '</div>' +
      '<aside class="invm-side">' +
        '<div class="invm-card"><h4>Notes</h4><textarea id="cli-notes" rows="8" placeholder="Internal notes about this client"></textarea></div>' +
      '</aside>' +
    '</div>' +
    '<div class="modal-ftr invm-ftr"><span class="invm-sp"></span>' +
      '<button type="button" class="cdc-no" onclick="closeModal(\'modal-client\')"><i data-lucide="x" class="lci"></i>Cancel</button>' +
      '<button type="button" class="cdc-ok" onclick="saveClient()"><i data-lucide="save" class="lci"></i>Save</button>' +
    '</div></div>');
}

// Invoices saved before 2026-10-01 could carry the minimum-base fee even when the revenue was
// above the minimum (wrong comparison). Recalculate those only: no exception base, revenue at or
// above the minimum, and a stored fee equal to minimum x fee%. Saved to the cloud once.
var _invFeeFixDone = false;
function _invFixMinBaseFees() {
  if (_invFeeFixDone || !Array.isArray(_localDB.invoices) || !_localDB.invoices.length) return;
  _invFeeFixDone = true;
  var round = function (n) { return Math.round(n * 100) / 100; };
  var bad = _localDB.invoices.filter(function (i) {
    var pct = parseFloat(i.fee) || 0, minB = parseFloat(i.minBase) || 0, rev = parseFloat(i.revenue) || 0, exc = parseFloat(i.excBase) || 0;
    if (!pct || !minB || exc > 0 || rev < minB) return false;
    var stored = round(parseFloat(i.billingFee) || 0), wrong = round(minB * pct / 100), right = round(rev * pct / 100);
    return stored === wrong && right !== wrong;
  });
  if (!bad.length) return;
  try {
    setDB(function (d) {
      (d.invoices || []).forEach(function (i) {
        if (!bad.some(function (b) { return b.id === i.id; })) return;
        i.billingFee = Math.round((parseFloat(i.revenue) || 0) * (parseFloat(i.fee) || 0)) / 100;
        i.updatedAt = Date.now();
      });
    });
  } catch (e) {}
}

function getInvDB() {
if (!_localDB.invoicingIssuers) _localDB.invoicingIssuers = [];
// The old IMBS website (imbsinc.us) is retired: billing entities point to integratedmbs.com
if (_localDB.invoicingIssuers.some(function (x) { return /imbsinc\.us/i.test((x.web || '') + ' ' + (x.email || '')); })) {
  try { setDB(function (d) { (d.invoicingIssuers || []).forEach(function (x) { if (/imbsinc\.us/i.test(x.web || '')) x.web = 'integratedmbs.com'; if (/imbsinc\.us/i.test(x.email || '')) x.email = 'contact@integratedmbs.com'; }); }); } catch (e) {}
}
if (!_localDB.invoicingClients) _localDB.invoicingClients = [];
_invFixMinBaseFees();
if (!_localDB.invoices) _localDB.invoices = [];
return getDB();
}

function setInvTab(tab) {
_invSkeleton();
_invPrepLogos();
_invTab = tab || 'dashboard';
_invMoveInd();
['dashboard','invoices','clients','issuers'].forEach(function (t) {
  var el = document.getElementById('inv-panel-' + t);
  if (el) el.style.display = t === _invTab ? '' : 'none';
});
var nb = document.getElementById('inv-btn-new'), a = _INV_ACTION[_invTab];
if (nb) { nb.hidden = !a; if (a) { nb.setAttribute('onclick', a[0]); nb.setAttribute('data-tip', a[1]); nb.setAttribute('aria-label', a[1]); } }
if (_invTab === 'dashboard') renderInvDashboard();
if (_invTab === 'invoices') { populateInvFilters(); renderInvoicesList(); }
if (_invTab === 'clients') renderClientsList();
if (_invTab === 'issuers') renderIssuersList();
setTimeout(_renderLucideIcons, 20);
}
function renderIssuersList() {
const db = getInvDB();
const el = document.getElementById('inv-issuers-list');
if (!el) return;
if (!db.invoicingIssuers.length) { el.innerHTML = '<div class="inv-empty">No billing entities yet. Add the company that sends invoices.</div>'; return; }
el.innerHTML = '<div class="inv-tw"><table class="inv-tbl"><thead><tr><th>Entity</th><th>Contact</th><th>Address</th><th>Zelle</th><th>Terms</th><th></th></tr></thead><tbody>' +
db.invoicingIssuers.map(function (iss) {
  const addr = [iss.addr1, iss.city, iss.state, iss.zip].filter(Boolean).join(', ') || '•';
  const zm = iss.zelleMode || 'phone';
  const zv = zm === 'email' ? (iss.email || '•') : zm === 'both' ? 'Phone + Email' : (iss.phone ? fmtPhone(iss.phone) : '•');
  return '<tr><td><div class="strong">' + _invEsc(iss.name) + '</div>' + (iss.taxid ? '<div class="mono" style="font-size:10.5px">EIN ' + _invEsc(iss.taxid) + '</div>' : '') + '</td>' +
    '<td>' + (iss.email ? '<div>' + _invEsc(String(iss.email).toLowerCase()) + '</div>' : '') + (iss.phone ? '<div style="font-size:11px;color:#586579">' + fmtPhone(iss.phone) + '</div>' : '') + '</td>' +
    '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;color:#586579" title="' + _invEsc(addr) + '">' + _invEsc(addr) + '</td>' +
    '<td><span class="inv-zelle"><span class="zelle-mark" aria-hidden="true"></span>' + _invEsc(zv) + '</span></td><td>' + _invEsc(iss.terms || 'Net 30') + '</td>' +
    '<td><div class="inv-acts"><button class="inv-ib" data-tip="Edit" aria-label="Edit" onclick="openIssuerModal(\'' + iss.id + '\')">' + _invIco('pencil') + '</button>' +
    '<button class="inv-ib del" data-tip="Delete" aria-label="Delete" onclick="deleteIssuer(\'' + iss.id + '\')">' + _invIco('trash-2') + '</button></div></td></tr>';
}).join('') + '</tbody></table></div>';
_renderLucideIcons();
}
function fmtInvDate(d) {
  if (!d) return '';
  if (d.includes('-')) {
    const parts = d.split('-');
    // Real YYYY-MM-DD → MM/DD/YYYY (require 3 numeric parts; the old check
    // .length===4 wrongly matched "June-2026" since "June".length is also 4)
    if (parts.length === 3 && /^\d{4}$/.test(parts[0])) {
      return parts[1]+'/'+parts[2]+'/'+parts[0];
    }
    // Invoice period "MonthName-YYYY" → "MonthName YYYY" (e.g. "June 2026")
    if (parts.length === 2 && /^[A-Za-z]+$/.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
      return parts[0] + ' ' + parts[1];
    }
  }
  return d;
}

function setZelleMode(mode) {
  var h = document.getElementById('iss-zelle-mode'); if (h) h.value = mode;
  ['phone','email','both'].forEach(function (m) { var b = document.getElementById('zelle-btn-' + m); if (b) b.classList.toggle('on', m === mode); });
}

function openIssuerModal(id) {
_invEnsureModals();
const db = getInvDB();
const iss = id ? db.invoicingIssuers.find(x => x.id === id) : null;
document.getElementById('iss-title').textContent = iss ? 'Edit billing entity' : 'New billing entity';
const set = (eid, val) => { const e = document.getElementById(eid); if(e) e.value = val||''; };
set('iss-id', iss?.id);
set('iss-name', iss?.name);
set('iss-taxid', iss?.taxid);
set('iss-npi', iss?.npi);
set('iss-phone', iss?.phone);
  // Set zelleMode toggle
  setTimeout(function(){ setZelleMode(iss?.zelleMode || 'phone'); }, 50);
set('iss-email', iss?.email);
set('iss-addr1', iss?.addr1);
set('iss-city', iss?.city);
set('iss-state', iss?.state);
set('iss-zip', iss?.zip);
set('iss-web', iss?.web);
set('iss-fee', iss?.fee);
set('iss-notes', iss?.notes);
const termsEl = document.getElementById('iss-terms');
if (termsEl) termsEl.value = iss?.terms || 'Net 30';
_issuerLogoB64 = iss?.logo || '';
const prev = document.getElementById('iss-logo-preview');
if (prev) prev.innerHTML = _issuerLogoB64
? `<img src="${_issuerLogoB64}" style="width:100%;height:100%;object-fit:contain">`
: '<span style="font-size:11px;color:var(--text3)">No logo</span>';
openModal('modal-issuer');
setTimeout(_renderLucideIcons, 30);
}

function loadIssuerLogo(event) {
const file = event.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = e => {
_issuerLogoB64 = e.target.result;
const prev = document.getElementById('iss-logo-preview');
if (prev) prev.innerHTML = `<img src="${_issuerLogoB64}" style="width:100%;height:100%;object-fit:contain">`;
};
reader.readAsDataURL(file);
}

function clearIssuerLogo() {
_issuerLogoB64 = '';
const prev = document.getElementById('iss-logo-preview');
if (prev) prev.innerHTML = '<span style="font-size:11px;color:var(--text3)">No logo</span>';
}

function saveIssuer() {
const g = id => document.getElementById(id)?.value?.trim() || '';
const name = g('iss-name');
if (!name) { toast('Entity name is required','err'); return; }
const existingId = g('iss-id');
const iss = {
id: existingId || uid(), name, logo: _issuerLogoB64,
taxid:g('iss-taxid'), npi:g('iss-npi'), phone:g('iss-phone'),
email:g('iss-email').toLowerCase(), addr1:g('iss-addr1'), city:g('iss-city'),
state:g('iss-state'), zip:g('iss-zip'), web:g('iss-web').toLowerCase(),
fee:g('iss-fee'), notes:g('iss-notes'),
terms: document.getElementById('iss-terms')?.value || 'Net 30'
};
setDB(db => {
if (!db.invoicingIssuers) db.invoicingIssuers = [];
const idx = db.invoicingIssuers.findIndex(x => x.id === existingId);
if (idx >= 0) db.invoicingIssuers[idx] = iss;
else db.invoicingIssuers.push(iss);
});
closeModal('modal-issuer');
renderIssuersList();
toast('Billing entity saved');
}

function deleteIssuer(id) {
const db = getInvDB();
const iss = db.invoicingIssuers.find(x => x.id === id);
if(!iss)return;return cdcConfirm(`Delete "${iss.name}"?`).then((__ok)=>{if(!__ok)return;
setDB(db => { db.invoicingIssuers = (db.invoicingIssuers||[]).filter(x => x.id !== id); });
renderIssuersList();
toast('Billing entity deleted');

});}

function renderClientsList() {
const db = getInvDB();
const el = document.getElementById('inv-clients-list');
if (!el) return;
if (!db.invoicingClients.length) { el.innerHTML = '<div class="inv-empty">No clients yet. Add the practices or clients who receive invoices.</div>'; return; }
el.innerHTML = '<div class="inv-tw"><table class="inv-tbl"><thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>City</th><th class="num">Fee</th><th></th></tr></thead><tbody>' +
db.invoicingClients.map(function (cli) {
  return '<tr><td class="strong">' + _invEsc(cli.name) + '</td><td>' + _invEsc(cli.contact) + '</td><td>' + _invEsc(cli.phone) + '</td><td>' + _invEsc(cli.email) + '</td><td>' + _invEsc(cli.city) + '</td>' +
    '<td class="num mono">' + (cli.fee ? _invEsc(cli.fee) + '%' : '') + '</td>' +
    '<td><div class="inv-acts"><button class="inv-ib" data-tip="Edit" aria-label="Edit" onclick="openClientModal(\'' + cli.id + '\')">' + _invIco('pencil') + '</button>' +
    '<button class="inv-ib del" data-tip="Remove" aria-label="Remove" onclick="deleteClient(\'' + cli.id + '\')">' + _invIco('trash-2') + '</button></div></td></tr>';
}).join('') + '</tbody></table></div>';
_renderLucideIcons();
}
function openClientModal(id) {
_invEnsureModals();
const db = getInvDB();
const cli = id ? db.invoicingClients.find(x => x.id === id) : null;
document.getElementById('cli-title').textContent = cli ? 'Edit client' : 'New client';
const set = (eid, val) => { const e = document.getElementById(eid); if(e) e.value = val||''; };
set('cli-id', cli?.id);
set('cli-name', cli?.name);
set('cli-contact', cli?.contact);
set('cli-taxid', cli?.taxid);
set('cli-npi', cli?.npi);
set('cli-phone', cli?.phone);
set('cli-email', cli?.email);
set('cli-addr1', cli?.addr1);
set('cli-city', cli?.city);
set('cli-state', cli?.state);
set('cli-zip', cli?.zip);
set('cli-fee', cli?.fee);
set('cli-notes', cli?.notes);
openModal('modal-client');
setTimeout(_renderLucideIcons, 30);
}

function saveClient() {
const g = id => document.getElementById(id)?.value?.trim() || '';
const name = g('cli-name');
if (!name) { toast('Client name is required','err'); return; }
const existingId = g('cli-id');
const cli = {
id: existingId || uid(), name,
contact:g('cli-contact'), taxid:g('cli-taxid'), npi:g('cli-npi'),
phone:g('cli-phone'), email:g('cli-email').toLowerCase(), addr1:g('cli-addr1'),
city:g('cli-city'), state:g('cli-state'), zip:g('cli-zip'),
fee:g('cli-fee'), notes:g('cli-notes')
};
setDB(db => {
if (!db.invoicingClients) db.invoicingClients = [];
const idx = db.invoicingClients.findIndex(x => x.id === existingId);
if (idx >= 0) db.invoicingClients[idx] = cli;
else db.invoicingClients.push(cli);
});
closeModal('modal-client');
renderClientsList();
toast('Client saved');
}

function deleteClient(id) {
const db = getInvDB();
const cli = db.invoicingClients.find(x => x.id === id);
if(!cli)return;return cdcConfirm(`Delete "${cli.name}"?`).then((__ok)=>{if(!__ok)return;
setDB(db => { db.invoicingClients = (db.invoicingClients||[]).filter(x => x.id !== id); });
renderClientsList();
toast('Client deleted');

});}

function resolveInvClient(val, db) {
if (!val) return {};
if (val.startsWith('prov:')) return db.providers.find(x => x.id === val.slice(5)) || {};
if (val.startsWith('cli:')) return db.invoicingClients.find(x => x.id === val.slice(4)) || {};
return db.invoicingClients.find(x => x.id === val) || {};
}

function populateInvFilters() {
const db = getInvDB();
const iss = document.getElementById('inv-filter-issuer');
const cli = document.getElementById('inv-filter-client');
if (iss) iss.innerHTML = '<option value="">All Billing Entities</option>' +
db.invoicingIssuers.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
if (cli) cli.innerHTML = '<option value="">All Clients</option>' +
db.invoicingClients.map(x => `<option value="${x.id}">${x.name}</option>`).join('') +
db.providers.map(x => `<option value="${x.id}">[Provider] ${x.name}</option>`).join('');
}

function renderInvDashboard() {
_invSkeleton();
const db = getInvDB();
const invs = db.invoices || [];
const el = document.getElementById('inv-panel-dashboard');
if (!el) return;
const issuerFilter = document.getElementById('inv-dash-issuer')?.value || '';
const myInvs = issuerFilter === '__all__' ? invs
  : issuerFilter ? invs.filter(i => i.issuerId === issuerFilter)
  : invs.filter(i => { const iss = (db.invoicingIssuers || []).find(x => x.id === i.issuerId); return !iss?.isPassThrough; });
const billedOf = i => parseFloat(i.billingFee || i.total || 0);
const totalBilled = myInvs.reduce((s, i) => s + billedOf(i), 0);
const totalPaid = myInvs.reduce((s, i) => s + parseFloat(i.amtPaid || 0), 0);
const outstanding = totalBilled - totalPaid;
const countPaid = myInvs.filter(i => i.status === 'Paid').length;
const countOpen = myInvs.filter(i => ['Draft','Sent','Partial','Overdue'].includes(i.status)).length;
const countOverdue = myInvs.filter(i => i.status === 'Overdue').length;
const issuers = db.invoicingIssuers || [];
const FUSE = 'linear-gradient(100deg,#FF8A3D 0%,#FF6A3D 7%,#7B2FF7 36%,#00A3D1 66%,#E8367A 93%,#FF4F9A 100%)';
const GLOW = ['rgba(255,106,61,.7)','rgba(123,47,247,.65)','rgba(0,163,209,.65)','rgba(232,54,122,.65)'];
const POS = ['0%','33.333%','66.667%','100%'];
const kpis = [
  ['Total billed', '$' + fmtMoney(totalBilled), myInvs.length + ' invoices', 'file-text'],
  ['Total collected', '$' + fmtMoney(totalPaid), countPaid + ' paid', 'check-circle'],
  ['Outstanding', '$' + fmtMoney(outstanding), countOpen + ' open', 'clock'],
  ['Overdue', String(countOverdue), countOverdue === 1 ? 'invoice' : 'invoices', 'alert-circle']
].map((k, i) => '<div class="inv-kpi" style="background-image:' + FUSE + ';background-position:' + POS[i] + ' 0;box-shadow:0 16px 30px -20px ' + GLOW[i] + '">' +
  '<div class="t">' + k[0] + _invIco(k[3]) + '</div><div><div class="v">' + k[1] + '</div><div class="s">' + k[2] + '</div></div></div>').join('');

// last 6 months by invoice period: billed (tint) vs collected (solid)
const months = [];
const now = new Date();
for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); months.push({ m: d.getMonth() + 1, y: d.getFullYear(), label: d.toLocaleDateString('en-US', { month: 'short' }), b: 0, p: 0 }); }
myInvs.forEach(i => { const pr = _parseInvPeriod(i.month); const mm = months.find(x => x.m === pr.month && x.y === pr.year); if (mm) { mm.b += billedOf(i); mm.p += parseFloat(i.amtPaid || 0); } });
const max = months.reduce((m, x) => Math.max(m, x.b, x.p), 0) || 1;
const W = 420, H = 180, PB = 24, PT = 12, bw = 18, step = W / months.length;
let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
months.forEach((x, i) => {
  const cx = step * i + step / 2, base = H - PB, hb = (H - PB - PT) * x.b / max, hp = (H - PB - PT) * x.p / max;
  svg += '<rect x="' + (cx - bw - 1) + '" y="' + (base - hb).toFixed(1) + '" width="' + bw + '" height="' + hb.toFixed(1) + '" rx="5" fill="#7B2FF7" fill-opacity=".22"><title>' + x.label + ' billed $' + fmtMoney(x.b) + '</title></rect>';
  svg += '<rect x="' + (cx + 1) + '" y="' + (base - hp).toFixed(1) + '" width="' + bw + '" height="' + hp.toFixed(1) + '" rx="5" fill="#7B2FF7"><title>' + x.label + ' collected $' + fmtMoney(x.p) + '</title></rect>';
  svg += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#586579">' + x.label + '</text>';
});
svg += '</svg>';

el.innerHTML =
  '<div class="inv-flt" style="margin-bottom:14px"><span style="font-size:11px;font-weight:700;color:#586579;text-transform:uppercase;letter-spacing:.08em">Dashboard for</span>' +
  '<select id="inv-dash-issuer" onchange="renderInvDashboard()"><option value="">My invoices (exclude pass-through)</option>' +
  issuers.map(x => '<option value="' + x.id + '"' + (x.id === issuerFilter ? ' selected' : '') + '>' + _invEsc(x.name) + '</option>').join('') +
  '<option value="__all__"' + (issuerFilter === '__all__' ? ' selected' : '') + '>All billing entities</option></select></div>' +
  '<div class="inv-kpis">' + kpis + '</div>' +
  '<div class="inv-g2" style="margin-top:14px">' +
    '<div class="inv-card"><div class="inv-card-hd"><h3>Open invoices</h3><button class="inv-link" onclick="setInvTab(\'invoices\')">View all ' + _invIco('arrow-right') + '</button></div>' +
      _renderInvDashTable(myInvs.filter(i => ['Sent','Partial','Overdue'].includes(i.status)).slice(0, 8), db) + '</div>' +
    '<div class="inv-card inv-bars"><div class="inv-card-hd"><h3>Last 6 months</h3><div class="inv-key"><span><i class="lt"></i>Billed</span><span><i></i>Collected</span></div></div>' + svg + '</div>' +
  '</div>';
setTimeout(_renderLucideIcons, 20);
}
function _renderInvDashTable(list, db) {
if (!list.length) return '<div class="inv-empty">No open invoices. Everything is collected.</div>';
return '<div class="inv-tw"><table class="inv-tbl"><thead><tr><th>Invoice #</th><th>Client</th><th>Month</th><th class="num">Billed</th><th class="num">Balance</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' +
list.map(function (inv) {
  const billed = parseFloat(inv.billingFee || inv.total || 0), bal = billed - parseFloat(inv.amtPaid || 0);
  return '<tr><td class="mono">' + _invEsc(inv.number) + '</td><td class="strong">' + _invEsc(_resolveInvClientName(inv.clientId, db)) + '</td><td>' + _invEsc(inv.month) + '</td>' +
    '<td class="num">$' + fmtMoney(billed) + '</td><td class="num strong">$' + fmtMoney(bal) + '</td>' +
    '<td><span class="inv-pill ' + _invEsc(inv.status) + '">' + _invEsc(inv.status) + '</span></td>' +
    '<td style="color:' + (inv.status === 'Overdue' ? '#B8215E' : '#586579') + '">' + _invEsc(inv.due) + '</td>' +
    '<td>' + _invActions(inv) + '</td></tr>';
}).join('') + '</tbody></table></div>';
}
function _resolveInvClientName(clientId, db) {
if (!clientId) return '';
if (clientId.startsWith('prov:')) {
const prov = (db.providers||[]).find(p=>p.id===clientId.slice(5));
return prov ? prov.name : clientId;
}
if (clientId.startsWith('cli:')) {
const cli = (db.invoicingClients||[]).find(c=>c.id===clientId.slice(4));
return cli ? cli.name : clientId;
}
const cli = (db.invoicingClients||[]).find(c=>c.id===clientId);
return cli ? cli.name : clientId;
}

function openPartialPaymentModal(invId) {
const db = getInvDB();
const inv = db.invoices.find(x=>x.id===invId);
if (!inv) return;
// Recalculate billing fee correctly
// Rule: if revenue >= minBase → fee = revenue * fee%
//       if revenue < minBase  → fee = minBase * fee%
const _fee   = parseFloat(inv.fee) || 0;
const _minB  = parseFloat(inv.minBase) || 0;
const _rev   = parseFloat(inv.revenue) || 0;
const _excB  = parseFloat(inv.excBase) || 0;
const _excM  = parseFloat(inv.excMonths) || 0;
const _excU  = parseFloat(inv.excUsed) || 0;
const _excOn = _excB > 0 && _excM > 0 && (_excM - _excU) > 0;
let billed;
if (_excOn) {
  billed = _excB * _fee / 100;
} else if (_fee > 0 && _rev > 0) {
  // Use actual revenue × fee% • if below minimum, minimum applies
  const calcFee = _rev * _fee / 100;
  const minFee  = _minB * _fee / 100;
  billed = (_minB > 0 && _rev < _minB) ? minFee : calcFee;
} else {
  billed = parseFloat(inv.billingFee || inv.total || 0);
}
const already = parseFloat(inv.amtPaid||0);
const balance = billed - already;

document.getElementById('ppm-inv-id')?.setAttribute('data-id',invId) ||
(() => {
// Create the modal if it doesn't exist
const d = document.createElement('div');
d.id = 'modal-partial-pay';
d.className = 'overlay';
d.innerHTML = '<div class="modal invm cdc-win">' +
  '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t"><i data-lucide="dollar-sign" class="lci"></i>Record payment <span id="ppm-sub" style="font-weight:500;color:#586579;font-size:12.5px;margin-left:6px"></span></span>' +
  '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" onclick="closeModal(\'modal-partial-pay\')"><i data-lucide="x" class="lci"></i></button></div>' +
  '<div class="invm-body"><input type="hidden" id="ppm-inv-id">' +
    '<div class="invm-main"><section class="invm-sec"><h4>Payment</h4><div class="invm-grid g6">' +
      '<div class="invm-f s2"><label>Payment amount *</label><input type="number" step="0.01" id="ppm-amount" placeholder="0.00" oninput="updatePPMBalance()"></div>' +
      '<div class="invm-f s2"><label>Payment date</label><input type="date" id="ppm-date"></div>' +
      '<div class="invm-f s2"><label>Method</label><select id="ppm-method"><option value="Check">Check</option><option value="Zelle">Zelle</option><option value="ACH">ACH / Wire</option><option value="Cash">Cash</option><option value="Credit Card">Credit card</option><option value="Other">Other</option></select></div>' +
      '<div class="invm-f s2"><label>Reference / check #</label><input id="ppm-ref" placeholder="Check number, Zelle transaction..."></div>' +
      '<div class="invm-f" style="grid-column:span 4"><label>Notes</label><input id="ppm-notes" placeholder="Optional"></div>' +
    '</div></section></div>' +
    '<aside class="invm-side"><div class="invm-card"><h4>Balance</h4>' +
      '<div class="invm-kv"><span>Invoice billed</span><b id="ppm-billed">$0.00</b></div>' +
      '<div class="invm-kv"><span>Already paid</span><b id="ppm-paid">$0.00</b></div>' +
      '<div class="invm-total"><span>Remaining after this</span><b id="ppm-balance">$0.00</b></div>' +
    '</div></aside>' +
  '</div>' +
  '<div class="modal-ftr invm-ftr"><span class="invm-sp"></span>' +
    '<button type="button" class="cdc-no" onclick="closeModal(\'modal-partial-pay\')"><i data-lucide="x" class="lci"></i>Cancel</button>' +
    '<button type="button" class="cdc-ok" onclick="savePartialPayment()"><i data-lucide="check-circle" class="lci"></i>Record payment</button>' +
  '</div></div>';
document.body.appendChild(d);
})();

sv('ppm-inv-id', invId);
document.getElementById('ppm-inv-id').setAttribute('data-id', invId);
document.getElementById('ppm-sub').textContent = `Invoice ${inv.number||''} · ${_resolveInvClientName(inv.clientId, db)}`;
document.getElementById('ppm-billed').textContent = '$'+fmtMoney(billed);
document.getElementById('ppm-paid').textContent = '$'+fmtMoney(already);
document.getElementById('ppm-amount').value = balance > 0 ? balance.toFixed(2) : '';
document.getElementById('ppm-date').value = new Date().toISOString().split('T')[0];
document.getElementById('ppm-ref').value = '';
document.getElementById('ppm-notes').value = '';
document.getElementById('ppm-balance').textContent = '$'+fmtMoney(balance);
document.getElementById('ppm-balance').style.color = balance > 0 ? 'var(--amber)' : 'var(--brand)';
openModal('modal-partial-pay');
setTimeout(_renderLucideIcons,20);
}

function updatePPMBalance() {
const invId = document.getElementById('ppm-inv-id')?.getAttribute('data-id') ||
document.getElementById('ppm-inv-id')?.value;
const db = getInvDB();
const inv = db.invoices.find(x=>x.id===invId);
if (!inv) return;
// Recalculate fee from stored data to handle old invoices with wrong billingFee
// Use saved billingFee • the correct pre-calculated fee
const billed = parseFloat(inv.billingFee||inv.total||0);
const already = parseFloat(inv.amtPaid||0);
const thisAmt = parseFloat(document.getElementById('ppm-amount')?.value||0);
const balance = billed - already - thisAmt;
const el = document.getElementById('ppm-balance');
if (el) {
el.textContent = '$'+Math.abs(balance).toFixed(2);
el.style.color = balance > 0.01 ? 'var(--amber)' : balance < -0.01 ? 'var(--red)' : 'var(--brand)';
}
}

function savePartialPayment() {
const invId = document.getElementById('ppm-inv-id')?.getAttribute('data-id') ||
document.getElementById('ppm-inv-id')?.value;
const amount = parseFloat(document.getElementById('ppm-amount')?.value||0);
const date = document.getElementById('ppm-date')?.value;
const method = document.getElementById('ppm-method')?.value||'';
const ref = document.getElementById('ppm-ref')?.value||'';
const notes = document.getElementById('ppm-notes')?.value||'';

if (!amount || amount <= 0) { toast('Enter a payment amount','warn'); return; }

setDB(db2 => {
const inv = db2.invoices.find(x=>x.id===invId);
if (!inv) return;
// Recalculate fee from stored data to handle old invoices with wrong billingFee
// Use saved billingFee • the correct pre-calculated fee
const billed = parseFloat(inv.billingFee||inv.total||0);
if (!inv.payments) inv.payments = [];
inv.payments.push({ id:uid(), amount, date, method, ref, notes, createdAt:Date.now() });
inv.amtPaid = inv.payments.reduce((s,p)=>s+parseFloat(p.amount||0),0);
const balance = billed - inv.amtPaid;
if (balance <= 0.01) inv.status = 'Paid';
else if (inv.amtPaid > 0) inv.status = 'Partial';
});

closeModal('modal-partial-pay');
renderInvDashboard();
renderInvoicesList();
toast(`Payment of $${amount.toFixed(2)} recorded`);
}

function setInvoiceStatus(invId, newStatus) {
setDB(db2 => {
const inv = db2.invoices.find(x=>x.id===invId);
if (inv) { inv.status=newStatus; inv.updatedAt=Date.now(); }
});
renderInvoicesList();
renderInvDashboard();
toast(`Invoice${newStatus}`);
}

function renderInvoicesList() {
const db = getInvDB();
const el = document.getElementById('inv-list');
if (!el) return;
const issF = document.getElementById('inv-filter-issuer')?.value || '';
const cliF = document.getElementById('inv-filter-client')?.value || '';
const stF = document.getElementById('inv-filter-status')?.value || '';
const showPaid = document.getElementById('inv-show-paid')?.checked || false;
let list = db.invoices || [];
if (issF) list = list.filter(x => x.issuerId === issF);
if (cliF) list = list.filter(x => x.clientId === cliF || x.clientId === 'prov:' + cliF || x.clientId === 'cli:' + cliF);
if (stF) list = list.filter(x => x.status === stF);
if (!showPaid && !stF) list = list.filter(x => x.status !== 'Paid');
if (!list.length) { el.innerHTML = '<div class="inv-empty">' + (showPaid || stF ? 'No invoices match these filters.' : 'No open invoices.') + '</div>'; return; }
const opts = ['Draft','Sent','Partial','Overdue','Paid'];
el.innerHTML = '<div class="inv-tw"><table class="inv-tbl"><thead><tr><th>Invoice #</th><th>Billing entity</th><th>Client</th><th>Month</th><th class="num">Revenue</th><th class="num">Fee</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' +
list.map(function (inv) {
  const iss = (db.invoicingIssuers || []).find(x => x.id === inv.issuerId);
  const billed = parseFloat(inv.billingFee || inv.total || 0), paid = parseFloat(inv.amtPaid || 0), bal = billed - paid;
  return '<tr style="' + (inv.status === 'Paid' ? 'opacity:.6' : '') + '"><td class="mono">' + _invEsc(inv.number) + '</td><td>' + _invEsc(iss ? iss.name : '') + '</td>' +
    '<td class="strong">' + _invEsc(_resolveInvClientName(inv.clientId, db)) + '</td><td>' + _invEsc(inv.month) + '</td>' +
    '<td class="num">$' + fmtMoney(inv.revenue || 0) + '</td><td class="num strong">$' + fmtMoney(billed) + '</td><td class="num">$' + fmtMoney(paid) + '</td>' +
    '<td class="num strong" style="color:' + (bal > 0.01 ? '#D45C37' : '#0E7A55') + '">$' + fmtMoney(bal) + '</td>' +
    '<td><select class="inv-st" onchange="setInvoiceStatus(\'' + inv.id + '\',this.value)">' + opts.map(s => '<option value="' + s + '"' + (s === inv.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
    '<td style="color:' + (inv.status === 'Overdue' ? '#B8215E' : '#586579') + '">' + _invEsc(inv.due) + '</td>' +
    '<td>' + _invActions(inv) + '</td></tr>';
}).join('') + '</tbody></table></div>';
_renderLucideIcons();
}
function buildNextInvNumber() {
const now = new Date();
const YY = String(now.getFullYear()).slice(-2);
const MM = String(now.getMonth()+1).padStart(2,'0');
const DD = String(now.getDate()).padStart(2,'0');
const HH = String(now.getHours()).padStart(2,'0');
const mm = String(now.getMinutes()).padStart(2,'0');
const SS = String(now.getSeconds()).padStart(2,'0');
const base = YY + MM + DD + HH + mm + SS;
// Guarantee uniqueness: if same second, append counter
const db = getInvDB();
const dupes = (db.invoices||[]).filter(x => x.number && x.number.startsWith(base));
return dupes.length === 0 ? base : base + '-' + String(dupes.length + 1).padStart(2,'0');
}

function getCurrentBillingMonth() {
const now = new Date();
// Format: "March-2026"
const months = ['January','February','March','April','May','June',
'July','August','September','October','November','December'];
return months[now.getMonth()] + '-' + now.getFullYear();
}

function onInvClientChange() {
const db = getInvDB();
const val = document.getElementById('inv-client')?.value || '';
let fee = '';
if (val.startsWith('cli:')) {
const cli = db.invoicingClients.find(x => x.id === val.slice(4));
if (cli?.fee) fee = cli.fee;
}
if (fee) { const el = document.getElementById('inv-fee'); if(el){el.value=fee;recalcInvoice();} }
}

const _INV_MONTH_NAMES = ['January','February','March','April','May','June',
'July','August','September','October','November','December'];

function _parseInvPeriod(period) {
// Parse "March-2026" ? {month:3, year:2026}
if (!period) {
const now = new Date();
return { month: now.getMonth() + 1, year: now.getFullYear() };
}
const parts = period.split('-');
if (parts.length >= 2) {
const mIdx = _INV_MONTH_NAMES.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
if (mIdx >= 0) return { month: mIdx + 1, year: parseInt(parts[1]) || new Date().getFullYear() };
}
return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
}

function _buildInvPeriod(month, year) {
return (_INV_MONTH_NAMES[parseInt(month)-1] || 'Month') + '-' + year;
}

function onInvMonthChange() {
const selEl = document.getElementById('inv-month-sel');
const yearEl = document.getElementById('inv-month-year');
const hidEl = document.getElementById('inv-month');
if (!selEl || !yearEl || !hidEl) return;
const month = parseInt(selEl.value) || 1;
const year = parseInt(yearEl.value) || new Date().getFullYear();
hidEl.value = _buildInvPeriod(month, year);
}

function _addBusinessDays(dateStr, days) {
const d = new Date(dateStr + 'T12:00:00');
let added = 0;
while (added < days) {
d.setDate(d.getDate() + 1);
const dow = d.getDay();
if (dow !== 0 && dow !== 6) added++; // skip Sat(6) and Sun(0)
}
return d.toISOString().split('T')[0];
}

function openInvoiceModal(id) {
_invEnsureModals();
const db = getInvDB();
const inv = id ? db.invoices.find(x => x.id === id) : null;
document.getElementById('inv-modal-title').textContent = inv ? 'Edit Invoice' : 'New Invoice';
const set = (eid, val) => { const e = document.getElementById(eid); if(e) e.value = val||''; };
set('inv-id', inv?.id);
set('inv-number', inv?.number || buildNextInvNumber());
set('inv-month', inv?.month || getCurrentBillingMonth());
set('inv-date', inv?.date || new Date().toISOString().split('T')[0]);
const _invDate = inv?.date || new Date().toISOString().split('T')[0];
set('inv-due', inv?.due || _addBusinessDays(_invDate, 5));
set('inv-fee', inv?.fee);
set('inv-min-base', inv?.minBase);
set('inv-exc-base', inv?.excBase);
set('inv-exc-months',inv?.excMonths);
set('inv-revenue', inv?.revenue);
set('inv-notes', inv?.notes);
(function () {
  var ed = document.getElementById('inv-note-editor'); if (!ed) return;
  if (inv && inv.noteHtml) ed.innerHTML = _invSanitizeNote(inv.noteHtml);
  else ed.textContent = (inv && inv.notes) || '';
  _invNoteTone((inv && inv.noteTone) || 'none');
  var nt = document.getElementById('inv-note-title'); if (nt) nt.value = (inv && inv.noteTitle) || '';
})();
const stEl = document.getElementById('inv-status');
if (stEl) stEl.value = inv?.status || 'Draft';
// Populate selects
document.getElementById('inv-issuer').innerHTML = '<option value="">• Select •</option>' +
db.invoicingIssuers.map(x => `<option value="${x.id}" ${x.id===inv?.issuerId?'selected':''}>${x.name}</option>`).join('');
const provOpts = db.providers.map(p => `<option value="prov:${p.id}" ${'prov:'+p.id===inv?.clientId?'selected':''}>[Provider] ${p.name}</option>`).join('');
const cliOpts = db.invoicingClients.map(c => `<option value="cli:${c.id}" ${'cli:'+c.id===inv?.clientId?'selected':''}>[Client] ${c.name}</option>`).join('');
document.getElementById('inv-client').innerHTML = '<option value="">• Select •</option>' +
(provOpts ? '<optgroup label="Billing Providers">'+provOpts+'</optgroup>' : '') +
(cliOpts ? '<optgroup label="External Clients">'+cliOpts+'</optgroup>' : '');
_currentInvId = inv?.id || '';

// Default 3 service lines if new invoice
_invSvcLines = inv?.svcLines
? JSON.parse(JSON.stringify(inv.svcLines))
: [
{ desc:'Medical Billing Services', amount:'' },
{ desc:'', amount:'' },
{ desc:'', amount:'' },
];
_invLines = inv?.lines ? JSON.parse(JSON.stringify(inv.lines)) : [];

// Populate month/year selectors
const _invMonthSel = document.getElementById('inv-month-sel');
const _invMonthYear = document.getElementById('inv-month-year');
const _invMonthHid = document.getElementById('inv-month');
const _parsedPeriod = _parseInvPeriod(inv?.month);
if (_invMonthSel) _invMonthSel.value = String(_parsedPeriod.month);
if (_invMonthYear) _invMonthYear.value = String(_parsedPeriod.year);
if (_invMonthHid) _invMonthHid.value = inv?.month || _buildInvPeriod(_parsedPeriod.month, _parsedPeriod.year);

// Exception months used
const excUsedEl = document.getElementById('inv-exc-used');
if (excUsedEl) excUsedEl.value = inv?.excUsed || '0';

 renderInvSvcLines();
renderInvLines();
recalcInvoice();
_invDirty = false;
setTimeout(function(){
  document.querySelectorAll('#modal-invoice input, #modal-invoice select, #modal-invoice textarea').forEach(function(el){
    el.addEventListener('change', function(){ _invDirty = true; });
    el.addEventListener('input', function(){ _invDirty = true; });
  });
}, 100);
openModal('modal-invoice');
setTimeout(_renderLucideIcons, 30);
}

function saveInvoice() {
const g = id => document.getElementById(id)?.value?.trim() || '';
const issuerId = g('inv-issuer');
const clientId = g('inv-client');
const number = g('inv-number');
if (!issuerId) { toast('Select a Billing Entity','err'); return; }
if (!clientId) { toast('Select a Client','err'); return; }
if (!number) { toast('Invoice number is required','err'); return; }
const feePct = parseFloat(g('inv-fee')) || 0;
const minRev = parseFloat(g('inv-min-base')) || 0;
const excBase = parseFloat(g('inv-exc-base')) || 0;
const excMths = parseFloat(g('inv-exc-months'))|| 0;
const excUsedPrev = parseFloat(g('inv-exc-used') || '0');
const revenue = parseFloat(g('inv-revenue')) || 0;
const existingId = g('inv-id');
const isNewInvoice = !existingId;

// Auto-increment excUsed when saving a NEW invoice with active exception
const excRemaining = excMths - excUsedPrev;
const excActive = excBase > 0 && excMths > 0 && excRemaining > 0;
const excUsedNew = (isNewInvoice && excActive) ? excUsedPrev + 1 : excUsedPrev;

// Calculate billing fee using full logic
const calcFromRev = revenue * feePct / 100;
let finalFee;
if (excActive) {
finalFee = excBase * feePct / 100;
} else if (minRev > 0 && revenue < minRev) {
  // Revenue below the minimum base: fee = minimum base × fee%
  // (it used to compare the FEE with the minimum base, so almost every invoice got the minimum)
  finalFee = minRev * feePct / 100;
} else {
  finalFee = calcFromRev;
}

const svcTotal = _invSvcLines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);

// Build exception note text for PDF
let excNoteText = '';
if (excBase > 0 && excMths > 0) {
const useIdx = isNewInvoice ? excUsedNew : excUsedPrev;
excNoteText = excActive
? 'NOTE: Minimum Fee - Exception base $' + fmtMoney(excBase) + ', ' + useIdx + ' of ' + excMths
: 'Exception completed (' + excUsedPrev + ' of ' + excMths + ' months used)';
}

const inv = {
id: existingId || uid(), issuerId, clientId, number,
month: g('inv-month'), date: g('inv-date'), due: g('inv-due'),
status: document.getElementById('inv-status')?.value || 'Draft',
fee: feePct, minBase: minRev, excBase, excMonths: excMths, excUsed: excUsedNew,
revenue, svcLines: JSON.parse(JSON.stringify(_invSvcLines)),
total: svcTotal, billingFee: finalFee,
excNoteText,
lines: JSON.parse(JSON.stringify(_invLines)),
notes: (g('inv-notes')||''), noteHtml: _invSanitizeNote((document.getElementById('inv-note-editor')||{}).innerHTML || ''), noteTone: (g('inv-note-tone')||'none'), noteTitle: (g('inv-note-title')||''), updatedAt: Date.now()
};
setDB(db => {
if (!db.invoices) db.invoices = [];
const idx = db.invoices.findIndex(x => x.id === existingId);
if (idx >= 0) db.invoices[idx] = inv;
else db.invoices.push(inv);
});
_currentInvId = inv.id;
closeModal('modal-invoice');
const invTab = document.getElementById('inv-tab-invoices');
if (invTab) invTab.click();
else renderInvoicesList();
populateInvFilters();
toast('Invoice saved');
}

function addInvLine() {
_invLines.push({ date:'', desc:'', paymentId:'', amount:'', status:'', insurance:'', invoiceNum:'', month:'', notes:'' });
renderInvLines();

  try { recalcInvoice(); } catch(e) {}
}

let _invSortKey = '';

let _invSortDir = 'asc';

function _invSortBy(key) {
  if (_invSortKey === key) _invSortDir = _invSortDir === 'asc' ? 'desc' : 'asc';
  else { _invSortKey = key; _invSortDir = 'asc'; }
  document.querySelectorAll('.inv-sort-ico').forEach(function(el) {
    el.textContent = el.getAttribute('data-sort') === key ? (_invSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  });
  renderInvLines();
}

function _invSetter(i,k,v){if(_invLines&&_invLines[i]){_invLines[i][k]=v.toUpperCase();}}

function renderInvLines() {
const tbody = document.getElementById('inv-lines-body');
if (!tbody) return;
const U = s => String(s||'').toUpperCase();
const INP = (val, ph, idx2, field) => { const v=U(val).replace(/"/g,'&quot;'); return '<input type="text" style="width:100%;font-size:11px;padding:3px 4px;border:1px solid var(--border2);border-radius:3px;background:var(--bg2);color:var(--text);box-sizing:border-box;text-transform:uppercase" value="'+v+'" placeholder="'+ph+'" oninput="_invSetter('+idx2+',\''+field+'\',this.value)">'; };
const AMT = (val, i) => '<input type="number" step="0.01" style="width:100%;font-size:11px;padding:3px 4px;border:1px solid var(--border2);border-radius:3px;background:var(--bg2);color:var(--text);text-align:right;box-sizing:border-box" value="'+(val||'')+'" placeholder="0.00" oninput="_invLines['+i+'].amount=this.value;try{recalcInvoice()}catch(e){}">';
if (!_invLines.length) {
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:14px;color:var(--text3);font-size:12px">No payments. Click + to add or paste from Excel.</td></tr>';
  try { recalcInvoice(); } catch (e) {}
  return;
}
// Newest date first (a new row lands where its date belongs); keep real index for _invSetter
const _sorted = _invLines.map((l,i)=>({l,i})).sort((a,b)=>_invDateCmp(a.l,b.l));
tbody.innerHTML = _sorted.map(({l, i}) => '<tr style="border-bottom:1px solid var(--border)">'
+'<td style="padding:2px 3px;white-space:nowrap"><input type="date" style="font-size:11px;padding:3px 4px;border:1px solid var(--border2);border-radius:3px;background:var(--bg2);color:var(--text);width:105px" value="'+(l.date||'')+'" oninput="_invLines['+i+'].date=this.value" onchange="_invLines['+i+'].date=this.value;renderInvLines()"></td>'
+'<td style="padding:2px 3px;min-width:80px">'+INP(l.desc,'MEDICAL BILLING',i,'desc')+'</td>'
+'<td style="padding:2px 3px;min-width:65px">'+INP(l.paymentId,'ID/CHECK#',i,'paymentId')+'</td>'
+'<td style="padding:2px 3px;min-width:60px">'+AMT(l.amount,i)+'</td>'
+'<td style="padding:2px 3px;min-width:50px">'+INP(l.status,'PAID',i,'status')+'</td>'
+'<td style="padding:2px 3px;min-width:65px">'+INP(l.insurance,'MEDICARE',i,'insurance')+'</td>'

+'<td style="padding:2px 3px;min-width:60px">'+INP(l.month,'MAY-2026',i,'month')+'</td>'
+'<td style="padding:2px 3px;min-width:65px">'+INP(l.notes,'NOTES',i,'notes')+'</td>'
+'<td style="padding:2px 3px;width:26px;text-align:center"><button title="Remove" class="btn btn-xs btn-danger" onclick="_invLines.splice('+i+',1);renderInvLines()"><i data-lucide="x" class="lci" style="width:11px;height:11px"></i></button></td>'
+'</tr>').join('');
setTimeout(_renderLucideIcons,10);
try { recalcInvoice(); } catch (e) {}   // totals update as soon as rows are imported, added or removed
}

let _invImportedHeaders = [];

let _invImportedRows = [];

function sendInvoiceEmail(inv) {
  try {
    const db = getInvDB();
    const iss = db.invoicingIssuers.find(x => x.id === inv.issuerId) || {};
    const cli = resolveInvClient(inv.clientId, db) || {};
    const sess = getSession() || {};
    const senderEmail = sess.email || iss.email || '';
    const fromName = iss.name || 'ClaimDataCare Billing';

    const toEmail = cli.email || cli.billingEmail || '';
    const amount = '$' + fmtMoney(parseFloat(inv.billingFee||inv.total||0));
    const subject = 'Invoice ' + (inv.number||'') + ' • ' + (inv.month||'') + ' • ' + amount;

    if (!toEmail) {
      toast('No email on file for this client. Add an email address first.','err');
      return;
    }

    var msg = 'Send Invoice ' + (inv.number||'') + ' to ' + (cli.name||'Client') + ' <' + toEmail + '>';
    if (senderEmail) msg += '\n\nCC: ' + senderEmail;
    msg += '\n\nThe PDF will be downloaded for you to attach.';
    return cdcConfirm(msg).then((__ok)=>{try{if(!__ok)return;

    const body = [
      'Dear ' + (cli.name||'Client') + ',',
      '',
      'Please find attached the invoice for ' + (inv.month||'the current billing period') + '.',
      '',
      'Invoice #: ' + (inv.number||''),
      'Period: ' + (inv.month||''),
      'Amount: ' + amount,
      'Due Date: ' + (inv.due||'Upon receipt'),
      '',
      'Payment Instructions:',
      iss.zelleMode ? 'Zelle: ' + (iss.zelleMode==='email' ? iss.email : fmtPhone(iss.phone)) : '',
      'Paper checks accepted at ' + (iss.addr1 || 'the address on file') + '.',
      '',
      'Please remit payment by the due date. For questions, contact ' + (iss.email||'our billing department') + '.',
      '',
      'Thank you for your partnership,',
      fromName
    ].filter(Boolean).join('\n');

    var mailtoUrl = 'mailto:' + toEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if (senderEmail) mailtoUrl += '&cc=' + encodeURIComponent(senderEmail);

    try {
      const doc = _buildInvoicePDF(inv.id);
      if (doc) doc.save('Invoice_' + (inv.number||'draft') + '.pdf');
    } catch(pdfErr) { console.warn('PDF generation failed:', pdfErr); }

    var mailWin = window.open(mailtoUrl, '_blank', 'noopener,noreferrer');
    if (!mailWin || mailWin.closed) window.location.href = mailtoUrl;

    setDB(function(db) {
      var idx = db.invoices.findIndex(function(x){ return x.id === inv.id; });
      if (idx >= 0 && db.invoices[idx].status === 'Draft') db.invoices[idx].status = 'Sent';
    });
    renderInvoicesList();

    toast('Invoice PDF downloaded • email ready to send to ' + toEmail + (senderEmail ? ' (CC: ' + senderEmail + ')' : ''), 'ok');
  
}catch(e) {
    toast('Failed to send invoice: ' + (e.message||'unknown error'), 'err');
    console.error('sendInvoiceEmail error:', e);
  }
});} catch(e) {
    toast('Failed to send invoice: ' + (e.message||'unknown error'), 'err');
    console.error('sendInvoiceEmail error:', e);
  }
}