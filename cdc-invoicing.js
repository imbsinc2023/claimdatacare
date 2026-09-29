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

function _buildInvoicePDF(invId) {
const db = getInvDB();
const inv = db.invoices.find(x => x.id === invId);
if (!inv) return null;
const iss = db.invoicingIssuers.find(x => x.id === inv.issuerId) || {};
const cli = resolveInvClient(inv.clientId, db);

const { jsPDF } = window.jspdf;
const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
const W = 210, M = 16, RX = W - M, CW = RX - M;

const ACCENT = [201, 100, 66];
const WHITE = [255,255,255];
const BLACK = [22, 22, 22];
const DARK = [50, 48, 44];
const MID = [130, 128, 124];
const LIGHT = [248, 247, 244];
const BORDER = [235, 234, 230];

const money = n => '$' + fmtMoney(parseFloat(n)||0);
const line = (x1,y1,x2,y2,c=BORDER,w=0.25) => {
doc.setDrawColor(...c); doc.setLineWidth(w); doc.line(x1,y1,x2,y2);
};
const fill = (x,y,w,h,c) => { doc.setFillColor(...c); doc.rect(x,y,w,h,'F'); };
const txt = (s,x,y,opts={}) => {
doc.setFont('helvetica', opts.bold?'bold':opts.italic?'italic':'normal');
doc.setFontSize(opts.size||9);
doc.setTextColor(...(opts.color||BLACK));
doc.text(String(s||''), x, y, { align: opts.align||'left', maxWidth: opts.maxWidth });
};

let y = M;
fill(0, 0, 3, 297, ACCENT);
let _logoH = 28;
if (iss.logo) {
try {
  const _ld = _fitLogo(iss.logo, 28);
  // Use PNG format explicitly — jsPDF handles transparency correctly with PNG
  doc.addImage(iss.logo, 'PNG', M+2, M, _ld.w, _ld.h, undefined, 'FAST');
  _logoH = _ld.h;
} catch(e) {}
}
txt('INVOICE', RX, M + 10, { bold:true, size:22, color:DARK, align:'right' });
txt(inv.number||'', RX, M + 17, { size:8, color:MID, align:'right' });
txt('Period: ' + (fmtInvDate(inv.month)||inv.month||''), RX, M + 22, { size:8, color:MID, align:'right' });
y = M + _logoH + 10;
line(M + 2, y, RX, y, BORDER, 0.4);
y += 6;

const COL2 = M + 2 + CW / 2 + 4;
const COL1 = M + 2;
const blockFrom = (entity, x, startY, label) => {
let ly = startY;
txt(label, x, ly, { size:6.5, bold:true, color:DARK }); ly += 5;
txt(entity.name||'', x, ly, { size:10, bold:true, color:DARK, maxWidth: CW/2 - 4 }); ly += 5;
doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...MID);
if (entity.contact) { doc.text(entity.contact, x, ly); ly += 3.5; }
if (entity.addr1) { doc.text(entity.addr1, x, ly); ly += 3.5; }
const cs = [entity.city, entity.state, entity.zip].filter(Boolean).join(', ');
if (cs) { doc.text(cs, x, ly); ly += 3.5; }
if (entity.email) { doc.text(entity.email, x, ly); ly += 3.5; }
if (entity.phone) { txt(label === 'FROM' ? 'Zelle: ' + entity.phone : entity.phone, x, ly, { size:8, color:MID }); ly += 3.5; }
if (entity.taxid) { txt('EIN: ' + entity.taxid, x, ly, { size:7.5, color:MID }); ly += 3.5; }
return ly;
};
const yA = blockFrom(iss, COL1, y, 'FROM');
const yB = blockFrom(cli, COL2, y, 'BILL TO');
line(COL2 - 4, y - 2, COL2 - 4, Math.max(yA, yB) + 2, BORDER, 0.2);
y = Math.max(yA, yB) + 8;
line(M+2, y, RX, y, BORDER, 0.3); y += 7;

const dets = [
['Invoice Date', inv.date||''], ['Due Date', inv.due||'Upon receipt'],
['Period', inv.month||''], ['Terms', iss.terms||'Due on receipt'],
];
const dw = CW / dets.length;
dets.forEach(([lbl, val], i) => {
const dx = M + 2 + i * dw + 3;
txt(lbl, dx, y + 1, { size:6.5, color:MID });
txt(val, dx, y + 6.5, { size:8, bold:true, color:DARK });
});
y += 14; line(M+2, y, RX, y, BORDER, 0.3); y += 7;

line(M+2, y-1, RX, y-1, BORDER, 0.5);
txt('DESCRIPTION', M+5, y+2, { size:7, bold:true, color:MID });
txt('AMOUNT', RX-2, y+2, { size:7, bold:true, color:MID, align:'right' });
line(M+2, y+4, RX, y+4, LIGHT, 0.5); y += 8;

const svcLines = inv.svcLines || [];
svcLines.forEach(function(s, i) {
  if (!s.desc && (!s.amount || parseFloat(s.amount) === 0)) return;
  if (i % 2 === 1) fill(M+2, y-3, CW, 7, LIGHT);
  txt((s.desc||'').toUpperCase(), M+5, y+1, { size:8.5, color:DARK });
  if (s.amount && parseFloat(s.amount) !== 0) txt(money(s.amount), RX-2, y+1, { size:8.5, color:DARK, align:'right' });
  y += 7;
});
y += 2; line(M+2, y, RX, y, BORDER, 0.3); y += 5;
const svcTotal = svcLines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0);
txt('Subtotal', M+5, y+3, { size:8.5, color:MID });
txt(money(svcTotal), RX-2, y+3, { size:8.5, color:DARK, align:'right' });
y += 9;

if (y + 70 > 265) {
  doc.addPage(); fill(0, 0, 3, 297, ACCENT);
  y = M + 4;
  txt('Invoice '+(inv.number||'')+' — continued', M+5, y+4, { size:9, bold:true, color:DARK });
  line(M+2, y+7, RX, y+7, BORDER, 0.3); y += 14;
}
line(M+2, y-1, RX, y-1, DARK, 0.4); y += 4;
txt('TOTAL', M+5, y+3, { size:10, bold:true, color:DARK });
txt(money(svcTotal), RX-2, y+3, { size:11, bold:true, color:DARK, align:'right' });
y += 12; line(M+2, y, RX, y, BORDER, 0.3); y += 6;

txt('Payment', M+5, y+1, { size:7, bold:true, color:MID }); y += 5;
txt('Preferred payment: Zelle or paper check — no processing fees.', M+5, y+1, { size:8, color:DARK }); y += 4;
txt('Virtual card & direct deposit: 4.5% bank processing fee applies.', M+5, y+1, { size:7.5, color:MID }); y += 5;
const zelleMode = iss.zelleMode || 'phone';
if ((zelleMode==='phone'||zelleMode==='both') && iss.phone) { txt('Zelle (Phone): ' + fmtPhone(iss.phone), M+5, y+2, { size:7.5, color:MID }); y += 4; }
if ((zelleMode==='email'||zelleMode==='both') && iss.email) { txt('Zelle (Email): ' + iss.email, M+5, y+2, { size:7.5, color:MID }); y += 4; }
y += 2;
if (inv.excNoteText) { line(M+2, y, RX, y, BORDER, 0.3); y += 4; txt(inv.excNoteText, M+5, y+2, { size:7.5, color:DARK }); y += 9; }
if (iss.notes || inv.notes) {
line(M+2, y, RX, y, BORDER, 0.2); y += 4;
const noteLines = doc.splitTextToSize([iss.notes, inv.notes].filter(Boolean).join(' \u00b7 '), CW - 6);
txt(noteLines, M+5, y+2, { size:7.5, color:MID }); y += noteLines.length * 3.5 + 4;
}
if (inv.lines && inv.lines.length) {
doc.addPage(); fill(0, 0, 3, 297, ACCENT);
let py = M;
txt('Payment Detail', M+5, py+4, { size:11, bold:true, color:DARK });
txt(`${iss.name||''} · ${cli.name||''} · ${inv.month||''}`, M+5, py+9, { size:7, color:MID });
txt(inv.number||'', RX, py+4, { size:8, color:MID, align:'right' });
line(M+2, py+12, RX, py+12, BORDER, 0.3); py += 17;
const allCols = [
{ key:'date', label:'Date', w:24 }, { key:'desc', label:'Description', w:38 },
{ key:'paymentId', label:'Check / ID', w:30 }, { key:'insurance', label:'Insurance', w:34 },
{ key:'month', label:'Month', w:24 }, { key:'amount', label:'Amount', w:0, right:true },
].filter(c => c.right || (inv.lines||[]).some(l => l[c.key]));
let xc = M + 4;
allCols.forEach(c => { c.x = c.right ? RX - 2 : xc; if (!c.right) xc += c.w; });
line(M+2, py-1, RX, py-1, BORDER, 0.5);
allCols.forEach(c => { txt(c.label, c.right ? c.x : c.x, py+1.5, { size:6.5, bold:true, color:MID, align: c.right?'right':'left' }); });
line(M+2, py+4, RX, py+4, LIGHT, 0.5); py += 8;
let pageRev = 0;
doc.setFont('helvetica','normal'); doc.setFontSize(9);
inv.lines.forEach((l, i) => {
if (py > 268) {
  doc.addPage(); fill(0, 0, 3, 297, ACCENT); py = M;
  line(M+2, py-1, RX, py-1, BORDER, 0.5);
  allCols.forEach(c => { txt(c.label, c.right?c.x:c.x, py+1.5, { size:6.5, bold:true, color:MID, align:c.right?'right':'left' }); });
  line(M+2, py+4, RX, py+4, LIGHT, 0.5); py += 8;
}
if (i % 2 === 1) fill(M+2, py-2, CW, 7.5, LIGHT);
allCols.forEach(c => {
if (c.right) { txt(money(parseFloat(l.amount)||0), c.x, py+2.5, { size:8.5, color:DARK, align:'right' }); }
else {
  let val = String(l[c.key]||l.invoiceNum||'').toUpperCase().slice(0, Math.max(4, Math.floor(c.w / 2.0)));
  txt(val, c.x, py+2.5, { size:8.5, color:DARK });
}
});
line(M+2, py+5, RX, py+5, BORDER, 0.2);
pageRev += parseFloat(l.amount)||0; py += 8;
});
py += 3; line(M+2, py, RX, py, DARK, 0.4); py += 4;
txt('Total Revenue', M+5, py+2, { size:9, bold:true, color:DARK });
txt(money(pageRev), RX-2, py+2, { size:10, bold:true, color:DARK, align:'right' });
}

// Uniform footer painted across all pages once the total page count is known.
// LEFT: "Payment Detail"  |  CENTER: "Powered by ClaimDataCare" (terracotta+bold)  |  RIGHT: "Page X / Y"
const _totalPages = doc.getNumberOfPages();
for (let _p = 1; _p <= _totalPages; _p++) {
  doc.setPage(_p);
  line(M+2, 280, RX, 280, BORDER, 0.3);
  line(M+2, 281.5, RX, 281.5, LIGHT, 0.3);
  txt('Payment Detail', M+2, 292, { size:7, color:MID });
  txt('Powered by ClaimDataCare  \u2014  www.claimdatacare.com', W/2, 292, { size:7, bold:true, color:ACCENT, align:'center' });
  txt('Page ' + _p + ' / ' + _totalPages, RX, 292, { size:7, color:MID, align:'right' });
}
return doc;
}

async function exportInvoicePDF(invId) {
const doc = _buildInvoicePDF(invId);
if (!doc) { toast('Save the invoice first','warn'); return; }
const inv = getInvDB().invoices.find(x => x.id === invId);
doc.save('Invoice_' + (inv.number||'draft') + '.pdf');
toast('Invoice PDF exported');
}

function previewInvoicePDF(invId) {
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
if (!inv || !confirm(`Delete invoice ${inv.number}?`)) return;
setDB(db => { db.invoices = db.invoices.filter(x => x.id !== id); });
renderInvoicesList();
toast('Invoice deleted');
}

function togglePasteArea() {
const area = document.getElementById('inv-paste-area');
const btn = document.getElementById('inv-paste-btn');
if (!area) return;
const visible = area.style.display !== 'none';
area.style.display = visible ? 'none' : '';
if (!visible) {
document.getElementById('inv-paste-input').value = '';
document.getElementById('inv-paste-preview').textContent = '';
setTimeout(() => document.getElementById('inv-paste-input').focus(), 50);
}
}

function previewPastedLines() {
const raw = document.getElementById('inv-paste-input').value.trim();
const prev = document.getElementById('inv-paste-preview');
if (!raw) { prev.textContent = ''; return; }
const parsed = parsePastedLines(raw);
if (!parsed.length) {
prev.innerHTML = '<span style="color:var(--red)"><i data-lucide="alert-triangle" class="lci" style="color:var(--red)"></i> No valid lines detected. Make sure columns are tab-separated.</span>';
return;
}
prev.innerHTML = `<span style="color:var(--green)">? ${parsed.length} line(s) ready to import</span>`;
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
  'month': 'month'
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
      month:      cols[7] || ''
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

function importPastedLines() {
const raw = document.getElementById('inv-paste-input').value.trim();
const parsed = parsePastedLines(raw);
if (!parsed.length) { toast('No valid lines found','warn'); return; }
parsed.forEach(p => _invLines.push(p));
renderInvLines();
togglePasteArea();
toast('? ' + parsed.length + ' line(s) imported');
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
toast('Excel exported ?');
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
      + '<input style="flex:2;padding:7px 10px;border:1.5px solid var(--border2);border-radius:var(--r);background:var(--bg2);color:var(--text);font-family:var(--font);font-size:13px"'
      + ' value="'+s.desc+'" placeholder="e.g. Medical Billing Services" oninput="_invSvcLines['+i+'].desc=this.value">'
      + '<div style="position:relative;flex:1">'
      + '<input id="inv-svc-amt-'+i+'" style="'+amtStyle+';width:100%;box-sizing:border-box"'
      + ' type="number" value="'+(s.amount||'')+'" placeholder="0.00"'
      + ' oninput="_invSvcLines['+i+'].amount=this.value;if('+i+'===0)_invSvcLines[0]._manualOverride=true;recalcInvoice()">'
      + (isFirst ? '<span title="Auto-calculated — editable" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--brand);pointer-events:none;font-weight:700">AUTO</span>' : '')
      + '</div>'
      + '<button title="Remove" class="btn btn-xs btn-danger" onclick="_invSvcLines.splice('+i+',1);renderInvSvcLines()"><i data-lucide="x" class="lci"></i></button>'
      + '</div>';
  }).join('');
  const addBtn = document.getElementById('inv-svc-add');
  if (addBtn) addBtn.style.display = _invSvcLines.length >= 4 ? 'none' : '';
  recalcInvoice();
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
    // Concession override — use exception base
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

  // Breakdown line — shows exact calculation
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

function getInvDB() {
if (!_localDB.invoicingIssuers) _localDB.invoicingIssuers = [];
if (!_localDB.invoicingClients) _localDB.invoicingClients = [];
if (!_localDB.invoices) _localDB.invoices = [];
return getDB();
}

function setInvTab(tab, btn) {
document.querySelectorAll('#inv-tabs .stab').forEach(b=>b.classList.remove('active'));
if (btn) btn.classList.add('active');
else { const b=document.getElementById('inv-stab-'+tab); if(b) b.classList.add('active'); }

['dashboard','invoices','clients','issuers'].forEach(t=>{
const el=document.getElementById('inv-panel-'+t);
if(el) el.style.display = t===tab ? '' : 'none';
});

const newBtn = document.getElementById('inv-btn-new');
if (newBtn) newBtn.style.display = tab==='invoices' ? '' : 'none';

if (tab==='dashboard') renderInvDashboard();
if (tab==='invoices') { populateInvFilters(); renderInvoicesList(); }
if (tab==='clients') renderClientsList();
if (tab==='issuers') renderIssuersList();
}

function renderIssuersList() {
const db = getInvDB();
const el = document.getElementById('inv-issuers-list');
if (!el) return;
if (!db.invoicingIssuers.length) {
el.innerHTML = '<div class="empty"><div class="empty-ico"><i data-lucide="building-2" class="lci"></i></div><h3>No billing entities yet</h3><p>Add the company that sends invoices.</p></div>';
_renderLucideIcons();
return;
}
el.innerHTML = '<div class="tbl-wrap"><table><thead><tr>' +
'<th>Entity</th><th>Contact</th><th>Address</th><th>Zelle</th><th>Terms</th><th></th>' +
'</tr></thead><tbody>' +
db.invoicingIssuers.map(iss => {
const addr = [iss.addr1,iss.city,iss.state,iss.zip].filter(Boolean).join(', ') || '—';
const zelleMode = iss.zelleMode || 'phone';
const zelleVal = zelleMode === 'email' ? (iss.email||'—') : zelleMode === 'both' ? 'Phone + Email' : (iss.phone ? fmtPhone(iss.phone) : '—');
    return '<tr>' +
    '<td><div style="font-weight:700;font-size:13px">'+(iss.name||'')+'</div>'+
    (iss.taxid ? '<div class="mono" style="font-size:10px;color:var(--text3);margin-top:2px">EIN: '+iss.taxid+'</div>' : '')+'</td>' +
'<td style="font-size:12px">' +
(iss.email ? '<div>'+iss.email+'</div>' : '') +
(iss.phone ? '<div style="font-size:11px;color:var(--text3)">'+fmtPhone(iss.phone)+'</div>' : '') +
(iss.web ? '<div style="font-size:11px;color:var(--brand)">'+iss.web+'</div>' : '') +
'</td>' +
'<td style="font-size:12px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+addr+'">'+addr+'</td>' +
'<td style="font-size:12px">'+zelleVal+'</td>' +
'<td style="font-size:12px">'+(iss.terms||'Net 30')+'</td>' +
'<td><div class="btn-group" style="white-space:nowrap">' +
'<button class="btn btn-xs" onclick="openIssuerModal(\''+iss.id+'\')" title="Edit"><i data-lucide="pencil" class="lci" style="width:11px;height:11px"></i></button>' +
'<button class="btn btn-xs btn-danger" onclick="deleteIssuer(\''+iss.id+'\')" title="Delete"><i data-lucide="trash-2" class="lci" style="width:11px;height:11px"></i></button>' +
'</div></td></tr>';
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
  document.getElementById('iss-zelle-mode').value = mode;
  ['phone','email','both'].forEach(function(m) {
    const btn = document.getElementById('zelle-btn-'+m);
    if (!btn) return;
    if (m === mode) {
      btn.style.background = '#6f3eff';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'var(--bg3)';
      btn.style.color = 'var(--text2)';
    }
  });
}

function openIssuerModal(id) {
const db = getInvDB();
const iss = id ? db.invoicingIssuers.find(x => x.id === id) : null;
document.getElementById('iss-title').textContent = iss ? 'Edit Billing Entity' : 'New Billing Entity';
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
email:g('iss-email'), addr1:g('iss-addr1'), city:g('iss-city'),
state:g('iss-state'), zip:g('iss-zip'), web:g('iss-web'),
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
toast('Billing entity saved ?');
}

function deleteIssuer(id) {
const db = getInvDB();
const iss = db.invoicingIssuers.find(x => x.id === id);
if (!iss || !confirm(`Delete "${iss.name}"?`)) return;
setDB(db => { db.invoicingIssuers = (db.invoicingIssuers||[]).filter(x => x.id !== id); });
renderIssuersList();
toast('Billing entity deleted');
}

function renderClientsList() {
const db = getInvDB();
const el = document.getElementById('inv-clients-list');
if (!el) return;
if (!db.invoicingClients.length) {
el.innerHTML = '<div class="empty"><div class="empty-ico"><i data-lucide="building" class="lci"></i></div><h3>No clients yet</h3><p>Add practices or clients who receive invoices.</p></div>';
return;
}
el.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>City</th><th>Fee %</th><th></th></tr></thead><tbody>' +
db.invoicingClients.map(cli => `<tr>
<td style="font-weight:600">${cli.name}</td>
<td style="font-size:12px">${cli.contact||''}</td>
<td style="font-size:12px">${cli.phone||''}</td>
<td style="font-size:12px">${cli.email||''}</td>
<td style="font-size:12px">${cli.city||''}</td>
<td class="mono">${cli.fee?cli.fee+'%':''}</td>
<td><div class="btn-group">
<button class="btn btn-xs" onclick="openClientModal('${cli.id}')">Edit</button>
<button title="Remove" class="btn btn-xs btn-danger" onclick="deleteClient('${cli.id}')"><i data-lucide="x" class="lci"></i></button>
</div></td>
</tr>`).join('') + '</tbody></table></div>';
}

function openClientModal(id) {
const db = getInvDB();
const cli = id ? db.invoicingClients.find(x => x.id === id) : null;
document.getElementById('cli-title').textContent = cli ? 'Edit Client' : 'New Client';
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
}

function saveClient() {
const g = id => document.getElementById(id)?.value?.trim() || '';
const name = g('cli-name');
if (!name) { toast('Client name is required','err'); return; }
const existingId = g('cli-id');
const cli = {
id: existingId || uid(), name,
contact:g('cli-contact'), taxid:g('cli-taxid'), npi:g('cli-npi'),
phone:g('cli-phone'), email:g('cli-email'), addr1:g('cli-addr1'),
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
toast('Client saved ?');
}

function deleteClient(id) {
const db = getInvDB();
const cli = db.invoicingClients.find(x => x.id === id);
if (!cli || !confirm(`Delete "${cli.name}"?`)) return;
setDB(db => { db.invoicingClients = (db.invoicingClients||[]).filter(x => x.id !== id); });
renderClientsList();
toast('Client deleted');
}

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
const db = getInvDB();
const invs = db.invoices || [];
const el = document.getElementById('inv-panel-dashboard');
if (!el) return;

const issuerFilter = document.getElementById('inv-dash-issuer')?.value || '';

// Filter: exclude invoices from other billing entities if filter set
const myInvs = issuerFilter
? invs.filter(i => i.issuerId === issuerFilter)
: invs.filter(i => {
// Default: show invoices where this provider IS the billing entity (not pass-through)
const iss = (db.invoicingIssuers||[]).find(x=>x.id===i.issuerId);
return !iss?.isPassThrough;
});

const allIssuerInvs = invs; // for pass-through view

// Compute totals
const totalBilled = myInvs.reduce((s,i)=>s+parseFloat(i.billingFee||i.total||0),0);
const totalPaid = myInvs.reduce((s,i)=>s+parseFloat(i.amtPaid||0),0);
const totalPartial = myInvs.filter(i=>i.status==='Partial').reduce((s,i)=>s+parseFloat(i.amtPaid||0),0);
const outstanding = totalBilled - totalPaid;
const countPaid = myInvs.filter(i=>i.status==='Paid').length;
const countOpen = myInvs.filter(i=>['Draft','Sent','Partial','Overdue'].includes(i.status)).length;
const countOverdue = myInvs.filter(i=>i.status==='Overdue').length;

const issuers = db.invoicingIssuers||[];

el.innerHTML = `
<!-- Issuer filter -->
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
<span style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Dashboard for:</span>
<select id="inv-dash-issuer" onchange="renderInvDashboard()"
style="padding:7px 12px;border:1px solid var(--border2);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--text);font-weight:600">
<option value="">My Invoices (exclude pass-through)</option>
${issuers.map(s=>`<option value="${s.id}" ${s.id===issuerFilter?'selected':''}>${s.name}</option>`).join('')}
<option value="__all__" ${issuerFilter==='__all__'?'selected':''}>All Billing Entities</option>
</select>
</div>

<!-- Stat cards -->
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
${[
{label:'Total Billed', val:'$'+fmtMoney(totalBilled), color:'var(--text)', icon:'file-text', sub:`${myInvs.length} invoices`},
{label:'Total Collected', val:'$'+fmtMoney(totalPaid), color:'var(--brand)', icon:'check-circle', sub:`${countPaid} paid`},
{label:'Outstanding', val:'$'+fmtMoney(outstanding), color:outstanding>0?'var(--amber)':'var(--brand)', icon:'clock', sub:`${countOpen} open`},
{label:'Overdue', val:countOverdue, color:countOverdue>0?'var(--red)':'var(--text2)', icon:'alert-circle', sub:'invoices'},
].map(c=>`
<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
<i data-lucide="${c.icon}" class="lci" style="width:16px;height:16px;color:${c.color}"></i>
<span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">${c.label}</span>
</div>
<div style="font-size:22px;font-weight:700;color:${c.color};letter-spacing:-.03em">${c.val}</div>
<div style="font-size:11px;color:var(--text3);margin-top:2px">${c.sub}</div>
</div>`).join('')}
</div>

<!-- Recent invoices table -->
<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
<span>Recent Open Invoices</span>
<button class="btn btn-sm" onclick="setInvTab('invoices',document.getElementById('inv-stab-invoices'))">
View All <i data-lucide="arrow-right" class="lci" style="width:12px;height:12px"></i>
</button>
</div>
${_renderInvDashTable(myInvs.filter(i=>['Sent','Partial','Overdue'].includes(i.status)).slice(0,8), db)}
`;
setTimeout(_renderLucideIcons, 20);
}

function _renderInvDashTable(list, db) {
if (!list.length) return `<div style="padding:20px;text-align:center;font-size:13px;color:var(--text3)">No open invoices</div>`;
const statusColors = { Draft:'b-gray', Sent:'b-blue', Paid:'b-green', Partial:'b-amber', Overdue:'b-red' };
return `<div class="tbl-wrap"><table>
<thead><tr><th>Invoice #</th><th>Client</th><th>Month</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead><tbody>` +
list.map(inv => {
const cli = _resolveInvClientName(inv.clientId, db);
// Recalculate fee from stored data to handle old invoices with wrong billingFee
// Use saved billingFee (the already-calculated correct fee)
// billingFee = the final fee after applying minimum revenue rule
const billed = parseFloat(inv.billingFee||inv.total||0);
const paid = parseFloat(inv.amtPaid||0);
const bal = billed - paid;
return `<tr>
<td class="mono" style="font-size:11px">${inv.number||''}</td>
<td style="font-weight:600;font-size:12px">${cli}</td>
<td style="font-size:12px">${inv.month||''}</td>
<td class="mono">$${fmtMoney(billed)}</td>
<td class="mono" style="color:var(--brand)">$${fmtMoney(paid)}</td>
<td class="mono" style="font-weight:700;color:${bal>0?'var(--amber)':'var(--brand)'}">$${fmtMoney(bal)}</td>
<td><span class="badge ${statusColors[inv.status]||'b-gray'}">${inv.status}</span></td>
<td style="font-size:11px;color:${inv.status==='Overdue'?'var(--red)':'var(--text3)'}">${inv.due||''}</td>
<td>
<div class="btn-group" style="gap:4px">
<button class="btn btn-xs btn-primary" onclick="openPartialPaymentModal('${inv.id}')" title="Record Payment">
<i data-lucide="dollar-sign" class="lci" style="width:11px;height:11px"></i> Pay
</button>
<button class="btn btn-xs" onclick="exportInvoicePDF('${inv.id}')">PDF</button><button class="btn btn-xs btn-ghost" onclick="sendInvoiceEmail(inv)" title="Email" style="color:var(--brand)"><i data-lucide="mail" class="lci" style="width:11px;height:11px"></i></button>
</div>
</td>
</tr>`;
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
  // Use actual revenue × fee% — if below minimum, minimum applies
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
d.innerHTML = `<div class="modal modal-sm">
<div class="modal-hdr">
<div><div class="modal-t">Record Payment</div><div class="modal-sub" id="ppm-sub"></div></div>
<button class="btn btn-ghost btn-sm" onclick="closeModal('modal-partial-pay')">×</button>
</div>
<div class="modal-body">
<input type="hidden" id="ppm-inv-id">
<div class="fg g1">
<div class="fg g2">
<div class="field">
<label>Invoice Billed</label>
<div id="ppm-billed" style="padding:8px 11px;background:var(--bg3);border-radius:var(--r);font-size:14px;font-weight:700;color:var(--text)"></div>
</div>
<div class="field">
<label>Already Paid</label>
<div id="ppm-paid" style="padding:8px 11px;background:var(--bg3);border-radius:var(--r);font-size:14px;font-weight:700;color:var(--brand)"></div>
</div>
</div>
<div class="field">
<label>Payment Amount *</label>
<input type="number" step="0.01" id="ppm-amount" placeholder="0.00" oninput="updatePPMBalance()">
</div>
<div class="fg g2">
<div class="field">
<label>Payment Date</label>
<input type="date" id="ppm-date">
</div>
<div class="field">
<label>Payment Method</label>
<select id="ppm-method">
<option value="Check">Check</option>
<option value="Zelle">Zelle</option>
<option value="ACH">ACH / Wire</option>
<option value="Cash">Cash</option>
<option value="Credit Card">Credit Card</option>
<option value="Other">Other</option>
</select>
</div>
</div>
<div class="field">
<label>Reference / Check #</label>
<input id="ppm-ref" placeholder="Check number, Zelle transaction, etc.">
</div>
<div class="field">
<label>Notes</label>
<input id="ppm-notes" placeholder="Optional">
</div>
<div id="ppm-balance-row" style="padding:10px 14px;background:var(--bg3);border-radius:var(--r);font-size:13px;display:flex;justify-content:space-between;align-items:center">
<span style="color:var(--text2)">Remaining balance after payment:</span>
<strong id="ppm-balance" style="font-size:16px;color:var(--brand)">$0.00</strong>
</div>
</div>
</div>
<div class="modal-ftr">
<button class="btn" onclick="closeModal('modal-partial-pay')">Cancel</button>
<button class="btn btn-primary" onclick="savePartialPayment()">
<i data-lucide="check-circle" class="lci"></i> Record Payment
</button>
</div>
</div>`;
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
// Use saved billingFee — the correct pre-calculated fee
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
// Use saved billingFee — the correct pre-calculated fee
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
toast(`Payment of $${amount.toFixed(2)} recorded ?`);
}

function setInvoiceStatus(invId, newStatus) {
setDB(db2 => {
const inv = db2.invoices.find(x=>x.id===invId);
if (inv) { inv.status=newStatus; inv.updatedAt=Date.now(); }
});
renderInvoicesList();
renderInvDashboard();
toast(`Invoice ? ${newStatus}`);
}

function renderInvoicesList() {
const db = getInvDB();
const el = document.getElementById('inv-list');
if (!el) return;
const issF = document.getElementById('inv-filter-issuer')?.value||'';
const cliF = document.getElementById('inv-filter-client')?.value||'';
const stF = document.getElementById('inv-filter-status')?.value||'';
const showPaid = document.getElementById('inv-show-paid')?.checked||false;

let list = db.invoices||[];
if (issF) list = list.filter(x=>x.issuerId===issF);
if (cliF) list = list.filter(x=>x.clientId===cliF||x.clientId==='prov:'+cliF||x.clientId==='cli:'+cliF);
if (stF) list = list.filter(x=>x.status===stF);
// Hide paid unless explicitly shown
if (!showPaid && !stF) list = list.filter(x=>x.status!=='Paid');

if (!list.length) {
el.innerHTML = `<div class="empty">
<div class="empty-ico"><i data-lucide="receipt" class="lci" style="width:40px;height:40px;color:var(--text3)"></i></div>
<h3>${showPaid||stF?'No invoices match filters':'No open invoices'}</h3>
<button class="btn btn-primary btn-sm" onclick="openInvoiceModal()">+ New Invoice</button>
</div>`;
_renderLucideIcons(); return;
}

const statusColors = { Draft:'b-gray', Sent:'b-blue', Paid:'b-green', Partial:'b-amber', Overdue:'b-red' };
const statusOptions = ['Draft','Sent','Partial','Overdue','Paid'];

el.innerHTML = `<div class="tbl-wrap"><table>
<thead><tr>
<th>Invoice #</th><th>Billing Entity</th><th>Client</th><th>Month</th>
<th>Revenue</th><th>Fee</th><th>Paid</th><th>Balance</th>
<th>Status</th><th>Due</th><th>Actions</th>
</tr></thead><tbody>` +
list.map(inv => {
const iss = (db.invoicingIssuers||[]).find(x=>x.id===inv.issuerId);
const cli = _resolveInvClientName(inv.clientId, db);
// Recalculate fee from stored data to handle old invoices with wrong billingFee
// Use saved billingFee — the correct pre-calculated fee
const billed = parseFloat(inv.billingFee||inv.total||0);
const paid = parseFloat(inv.amtPaid||0);
const bal = billed - paid;
const balCol = bal > 0.01 ? 'var(--amber)' : 'var(--brand)';
return `<tr style="${inv.status==='Paid'?'opacity:.6':''}">
<td class="mono" style="font-size:11px">${inv.number||''}</td>
<td style="font-size:12px">${iss?iss.name:''}</td>
<td style="font-weight:600;font-size:12px">${cli}</td>
<td style="font-size:12px">${inv.month||''}</td>
<td class="mono" style="font-size:12px">$${fmtMoney(inv.revenue||0)}</td>
<td class="mono" style="font-weight:700">$${fmtMoney(billed)}</td>
<td class="mono" style="color:var(--brand)">$${fmtMoney(paid)}</td>
<td class="mono" style="font-weight:700;color:${balCol}">$${fmtMoney(bal)}</td>
<td>
<select onchange="setInvoiceStatus('${inv.id}',this.value)"
style="padding:3px 6px;border:1px solid var(--border2);border-radius:6px;font-size:11px;font-weight:600;
background:var(--bg2);color:var(--text);cursor:pointer">
${statusOptions.map(s=>`<option value="${s}" ${s===inv.status?'selected':''}>${s}</option>`).join('')}
</select>
</td>
<td style="font-size:11px;color:${inv.status==='Overdue'?'var(--red)':'var(--text3)'}">${inv.due||''}</td>
<td><div class="btn-group" style="gap:3px">
<button class="btn-icon sm" onclick="openPartialPaymentModal('${inv.id}')" title="Record Payment" style="color:var(--brand)">
<i data-lucide="dollar-sign" class="lci" style="width:13px;height:13px"></i>
</button>
<button class="btn-icon sm" onclick="previewInvoicePDF('${inv.id}')" title="Preview" style="color:var(--text2)">
<i data-lucide="eye" class="lci" style="width:13px;height:13px"></i>
</button>
<button class="btn-icon sm" onclick="exportInvoicePDF('${inv.id}')" title="Download PDF">
<i data-lucide="file-text" class="lci" style="width:13px;height:13px"></i>
</button>
<button class="btn-icon sm" onclick="sendInvoiceEmail(inv)" title="Send by Email" style="color:var(--brand)">
<i data-lucide="mail" class="lci" style="width:13px;height:13px"></i>
</button>
<button class="btn-icon sm" onclick="openInvoiceModal('${inv.id}')" title="Edit">
<i data-lucide="pencil" class="lci" style="width:13px;height:13px"></i>
</button>
<button class="btn-icon sm danger" onclick="deleteInvoice('${inv.id}')" title="Delete">
<i data-lucide="trash-2" class="lci" style="width:13px;height:13px"></i>
</button>
</div></td>
</tr>`;
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
const stEl = document.getElementById('inv-status');
if (stEl) stEl.value = inv?.status || 'Draft';
// Populate selects
document.getElementById('inv-issuer').innerHTML = '<option value="">— Select —</option>' +
db.invoicingIssuers.map(x => `<option value="${x.id}" ${x.id===inv?.issuerId?'selected':''}>${x.name}</option>`).join('');
const provOpts = db.providers.map(p => `<option value="prov:${p.id}" ${'prov:'+p.id===inv?.clientId?'selected':''}>[Provider] ${p.name}</option>`).join('');
const cliOpts = db.invoicingClients.map(c => `<option value="cli:${c.id}" ${'cli:'+c.id===inv?.clientId?'selected':''}>[Client] ${c.name}</option>`).join('');
document.getElementById('inv-client').innerHTML = '<option value="">— Select —</option>' +
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
} else if (minRev > 0 && calcFromRev < minRev) {
  // Revenue below minimum → fee = minimum revenue × fee%
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
notes: (g('inv-notes')||'').toUpperCase(), updatedAt: Date.now()
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
toast('Invoice saved ?');
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
  return;
}
// Sort by date ascending, keep real index for _invSetter
const _sorted = _invLines.map((l,i)=>({l,i})).sort((a,b)=>{
  if (!a.l.date && !b.l.date) return 0;
  if (!a.l.date) return 1; if (!b.l.date) return -1;
  return a.l.date < b.l.date ? -1 : a.l.date > b.l.date ? 1 : 0;
});
tbody.innerHTML = _sorted.map(({l, i}) => '<tr style="border-bottom:1px solid var(--border)">'
+'<td style="padding:2px 3px;white-space:nowrap"><input type="date" style="font-size:11px;padding:3px 4px;border:1px solid var(--border2);border-radius:3px;background:var(--bg2);color:var(--text);width:105px" value="'+(l.date||'')+'" oninput="_invLines['+i+'].date=this.value"></td>'
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
    const subject = 'Invoice ' + (inv.number||'') + ' — ' + (inv.month||'') + ' — ' + amount;

    if (!toEmail) {
      toast('No email on file for this client. Add an email address first.','err');
      return;
    }

    var msg = 'Send Invoice ' + (inv.number||'') + ' to ' + (cli.name||'Client') + ' <' + toEmail + '>';
    if (senderEmail) msg += '\n\nCC: ' + senderEmail;
    msg += '\n\nThe PDF will be downloaded for you to attach.';
    if (!confirm(msg)) return;

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

    toast('Invoice PDF downloaded — email ready to send to ' + toEmail + (senderEmail ? ' (CC: ' + senderEmail + ')' : ''), 'ok');
  } catch(e) {
    toast('Failed to send invoice: ' + (e.message||'unknown error'), 'err');
    console.error('sendInvoiceEmail error:', e);
  }
}