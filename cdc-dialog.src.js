/* ClaimDataCare • cdc-dialog.js v1.0
   In-app confirmation window, used instead of the browser's confirm() box.
   cdcConfirm(message, { title, confirmText, danger }) returns a Promise<boolean>. */
(function () {
  'use strict';
  var CSS = [
    '.cdcd-ov{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(11,21,38,.45)}',
    '.cdcd{width:100%;max-width:460px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 30px 60px -24px rgba(11,21,38,.55);display:flex;flex-direction:column}',
    '.cdcd-b{padding:18px 22px 6px;display:flex;gap:14px;align-items:flex-start}',
    '.cdcd-ic{flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:rgba(255,106,61,.1);color:#D45C37}',
    '.cdcd.danger .cdcd-ic{background:rgba(232,54,122,.1);color:#C8381E}',
    '.cdcd-ic svg{width:19px;height:19px}',
    '.cdcd-m{flex:1;min-width:0;font-size:13.5px;line-height:1.55;color:#0B1526;white-space:pre-line;word-break:break-word;padding-top:8px}',
    '.cdcd-f{display:flex;justify-content:flex-end;gap:8px;padding:16px 22px 18px}',
    '.cdcd-f svg{width:15px;height:15px}'
  ].join('\n');
  var ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="17" height="17"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  window.cdcConfirm = function (message, opts) {
    opts = opts || {};
    if (!document.getElementById('cdcd-style')) { var st = document.createElement('style'); st.id = 'cdcd-style'; st.textContent = CSS; document.head.appendChild(st); }
    var msg = String(message == null ? '' : message);
    var danger = opts.danger != null ? !!opts.danger : /\b(delete|remove|erase|discard|void|cancel claim|deactivate|eliminar|borrar)\b/i.test(msg);
    var title = opts.title || (danger ? 'Confirm delete' : 'Please confirm');
    var yes = opts.confirmText || (danger ? 'Delete' : 'Confirm');
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'cdcd-ov';
      ov.innerHTML = '<div class="cdcd' + (danger ? ' danger' : '') + '" role="alertdialog" aria-modal="true" aria-labelledby="cdcd-t">' +
        '<div class="modal-hdr cdc-wh"><span class="cdc-wh-t" id="cdcd-t">' + esc(title) + '</span>' +
        '<button type="button" class="cdc-wh-x" data-tip="Close" aria-label="Close" data-a="no">' + ICON_X + '</button></div>' +
        '<div class="cdcd-b"><span class="cdcd-ic">' + (danger ? ICON_DEL : ICON_WARN) + '</span><div class="cdcd-m">' + esc(msg) + '</div></div>' +
        '<div class="cdcd-f"><button type="button" class="' + (danger ? 'cdc-neutral' : 'cdc-no') + ' cdcd-no" data-a="no">' + ICON_X + esc(opts.cancelText || 'Cancel') + '</button>' +
        '<button type="button" class="' + (danger ? 'cdc-no' : 'cdc-ok') + ' cdcd-yes" data-a="yes">' + (danger ? ICON_DEL : ICON_OK) + esc(yes) + '</button></div></div>';
      var done = function (v) { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(v); };
      var onKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      ov.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-a]');
        if (b) done(b.getAttribute('data-a') === 'yes');
        else if (e.target === ov) done(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      setTimeout(function () { var y = ov.querySelector('.cdcd-yes'); if (y) y.focus(); }, 20);
    });
  };
})();
