/*
 * ClaimDataCare  •  Heart-monitor line for the loading screen (Web Worker)
 * File: cdc-ecg-worker.js  •  v1.0
 *
 * Draws the moving ECG line on its own thread (OffscreenCanvas), so the animation
 * stays smooth even while the app is busy downloading and preparing your data.
 * Started and stopped by cdc-loader.js.
 */
'use strict';
var cv = null, ctx = null, W = 0, H = 0, DPR = 1, running = false, last = 0, head = 0;
var PERIOD = 300, SPEED = 0.62;                 // design px per ms (a sweep every ~2.4 s on a 1500 px screen)
var BEAT = [[0,150],[70,150],[82,141],[94,150],[118,150],[128,162],[142,40],[156,236],[168,128],[176,150],[206,150],[228,133],[250,150],[300,150]];
var raf = self.requestAnimationFrame ? self.requestAnimationFrame.bind(self) : function (f) { return setTimeout(function () { f(performance.now()); }, 16); };

function yAt(x) {                               // x in design units -> y (0..300)
  var p = ((x % PERIOD) + PERIOD) % PERIOD;
  for (var i = 1; i < BEAT.length; i++) {
    if (p <= BEAT[i][0]) {
      var a = BEAT[i - 1], b = BEAT[i], t = (p - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return 150;
}
function sx(x) { return x / 1500 * W; }          // design -> canvas x
function sy(y) { return (y / 300) * H; }

function gradient(alpha) {
  var g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,106,61,' + alpha + ')');
  g.addColorStop(0.35, 'rgba(232,54,122,' + alpha + ')');
  g.addColorStop(0.7, 'rgba(106,27,219,' + alpha + ')');
  g.addColorStop(1, 'rgba(0,163,209,' + alpha + ')');
  return g;
}

function traceSegment(x0, x1, step) {
  ctx.beginPath();
  ctx.moveTo(sx(x0), sy(yAt(x0)));
  for (var x = x0 + step; x < x1; x += step) ctx.lineTo(sx(x), sy(yAt(x)));
  ctx.lineTo(sx(x1), sy(yAt(x1)));
}

function frame(now) {
  if (!running) return;
  var dt = last ? Math.min(now - last, 64) : 16;
  last = now;
  head += dt * SPEED;
  var TAIL = 460;
  if (head > 1500 + TAIL) head = 0;

  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // faint full line
  traceSegment(0, 1500, 2);
  ctx.strokeStyle = gradient(0.16); ctx.lineWidth = 1.5 * DPR; ctx.stroke();

  // bright sweep with a fading tail, drawn in slices
  var start = Math.max(0, head - TAIL), end = Math.min(1500, head);
  if (end > start) {
    var slices = 14, len = (end - start) / slices;
    for (var i = 0; i < slices; i++) {
      var a0 = start + i * len, a1 = a0 + len + 1;
      var k = (i + 1) / slices;                  // 0 at the tail -> 1 at the head
      traceSegment(a0, Math.min(a1, end), 2);
      ctx.strokeStyle = gradient(0.18 * k); ctx.lineWidth = 12 * DPR; ctx.stroke();   // glow
      traceSegment(a0, Math.min(a1, end), 2);
      ctx.strokeStyle = gradient(k); ctx.lineWidth = 3 * DPR; ctx.stroke();           // core
    }
    if (head <= 1500) {                          // glowing tip
      var hx = sx(head), hy = sy(yAt(head));
      var rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 18 * DPR);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.3, 'rgba(232,54,122,0.55)'); rg.addColorStop(1, 'rgba(232,54,122,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(hx, hy, 18 * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }
  raf(frame);
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'init') {
    cv = m.canvas; ctx = cv.getContext('2d');
    DPR = m.dpr || 1; W = cv.width = Math.round(m.w * DPR); H = cv.height = Math.round(m.h * DPR);
    running = true; last = 0; raf(frame);
  } else if (m.type === 'resize' && cv) {
    DPR = m.dpr || DPR; W = cv.width = Math.round(m.w * DPR); H = cv.height = Math.round(m.h * DPR);
  } else if (m.type === 'stop') {
    running = false; self.close();
  }
};
