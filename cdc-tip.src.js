/* ClaimDataCare • tooltips • cdc-tip.js v1.0
   One floating bubble for every element with data-tip. It is fixed to the screen (outside
   tables and scroll areas), centred on the element under the mouse, and only fades in/out:
   it never changes the size or position of anything on the page. */
(function () {
  'use strict';
  var tip = null, cur = null;
  function make() {
    tip = document.createElement('div');
    tip.id = 'cdc-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.cssText = 'position:fixed;left:0;top:0;z-index:100000;pointer-events:none;opacity:0;transition:opacity .12s;' +
      'padding:5px 9px;border-radius:7px;background:#0B1526;color:#fff;font-size:11px;font-weight:600;line-height:1.2;font-family:inherit;white-space:nowrap;' +
      'box-shadow:0 6px 16px -6px rgba(11,21,38,.45)';
    document.body.appendChild(tip);
  }
  function show(el) {
    var text = el.getAttribute('data-tip'); if (!text) return;
    if (!tip) make();
    cur = el; tip.textContent = text;
    var r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = r.left + r.width / 2 - tw / 2;
    x = Math.max(6, Math.min(x, window.innerWidth - tw - 6));
    var y = r.top - th - 7;                       // above the element
    if (y < 6) y = r.bottom + 7;                  // not enough room: below
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    tip.style.opacity = '1';
  }
  function hide() { cur = null; if (tip) tip.style.opacity = '0'; }
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-tip], .btn-icon[title]') : null;
    // icon buttons that still use title: move it to data-tip so only this bubble shows (no native duplicate)
    if (el && !el.hasAttribute('data-tip') && el.getAttribute('title')) { el.setAttribute('data-tip', el.getAttribute('title')); el.setAttribute('aria-label', el.getAttribute('aria-label') || el.getAttribute('title')); el.removeAttribute('title'); }
    if (el === cur) return;
    if (el) show(el); else hide();
  }, true);
  document.addEventListener('focusin', function (e) { var el = e.target && e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); }, true);
  ['mousedown', 'scroll', 'focusout', 'blur'].forEach(function (t) { window.addEventListener(t, hide, true); });
})();
