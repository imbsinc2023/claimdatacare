/* Component tests • Cloudflare Workers (claimmd-elig, usps) run in Node with a mocked
   upstream. Checks the security gate: HTTPS, origin, body size, rate limit, routes. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('../support/harness');
const A = require('../support/assert');

const ORIGIN = 'https://claimdatacare.com';
async function load(file) {
  // workers are ES modules; copy to .mjs so Node can import them (fresh module per test)
  const tmp = path.join(os.tmpdir(), 'cdc-' + path.basename(file, '.js') + '-' + Date.now() + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  try { return (await import('file://' + tmp)).default; } finally { fs.unlinkSync(tmp); }
}
function req(url, o = {}) {
  const h = new Headers(o.headers || {});
  if (o.origin !== null) h.set('Origin', o.origin || ORIGIN);
  h.set('CF-Connecting-IP', o.ip || '203.0.113.7');
  return new Request(url, { method: o.method || 'POST', headers: h, body: o.body });
}
async function withUpstream(fn, answer) {
  const real = global.fetch, calls = [];
  global.fetch = async (u, init) => { calls.push({ url: String(u), init }); return new Response(JSON.stringify(answer || { ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try { await fn(calls); } finally { global.fetch = real; }
}
const ELIG = 'https://claimmd-elig.imbsinc2023.workers.dev/eligdata';

module.exports = {
  name: 'workers',
  tests: [
    { name: 'elig: valid request from the app is forwarded to ClaimMD', fn: () => withUpstream(async calls => {
      const w = await load('claimmd-elig-worker.js');
      const r = await w.fetch(req(ELIG, { body: 'AccountKey=k&ins_number=1' }), {});
      A.eq(r.status, 200);
      A.eq(calls.length, 1); A.has(calls[0].url, 'svc.claim.md');
      A.eq(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    }, { elig: 'active' }) },
    { name: 'elig: requests without the app origin are refused (403)', fn: () => withUpstream(async calls => {
      const w = await load('claimmd-elig-worker.js');
      A.eq((await w.fetch(req(ELIG, { origin: null, body: 'x' }), {})).status, 403, 'no origin (curl)');
      A.eq((await w.fetch(req(ELIG, { origin: 'https://evil.example', body: 'x' }), {})).status, 403, 'other site');
      A.eq(calls.length, 0, 'nothing forwarded');
    }) },
    { name: 'elig: non-HTTPS calls are refused', fn: () => withUpstream(async () => {
      const w = await load('claimmd-elig-worker.js');
      A.eq((await w.fetch(req('http://claimmd-elig.imbsinc2023.workers.dev/eligdata', { body: 'x' }), {})).status, 403);
    }) },
    { name: 'elig: oversized bodies are refused (413)', fn: () => withUpstream(async () => {
      const w = await load('claimmd-elig-worker.js');
      A.eq((await w.fetch(req(ELIG, { body: 'x', headers: { 'Content-Length': '500000' } }), {})).status, 413);
    }) },
    { name: 'elig: the 61st request in a minute from one visitor gets 429', fn: () => withUpstream(async () => {
      const w = await load('claimmd-elig-worker.js');
      let last = null;
      for (let i = 0; i < 61; i++) last = await w.fetch(req(ELIG, { body: 'x' }), {});
      A.eq(last.status, 429); A.eq(last.headers.get('Retry-After'), '60');
      A.eq((await w.fetch(req(ELIG, { body: 'x', ip: '198.51.100.9' }), {})).status, 200, 'other visitor not affected');
    }) },
    { name: 'elig: Cloudflare rate-limit binding is used when configured', fn: () => withUpstream(async () => {
      const w = await load('claimmd-elig-worker.js');
      const r = await w.fetch(req(ELIG, { body: 'x' }), { RL: { limit: async () => ({ success: false }) } });
      A.eq(r.status, 429);
    }) },
    { name: 'elig: unknown routes answer 404', fn: () => withUpstream(async () => {
      const w = await load('claimmd-elig-worker.js');
      A.eq((await w.fetch(req('https://claimmd-elig.imbsinc2023.workers.dev/other', { body: 'x' }), {})).status, 404);
    }) },
    { name: 'usps: invalid ZIP is rejected before any lookup', fn: () => withUpstream(async calls => {
      const w = await load('usps-worker.js');
      const r = await w.fetch(req('https://usps.imbsinc2023.workers.dev/city-state?zip=12a', { method: 'GET' }), {});
      A.eq(r.status, 400); A.eq(calls.length, 0);
    }) },
    { name: 'usps: without credentials it falls back to the Census geocoder', fn: () => withUpstream(async calls => {
      const w = await load('usps-worker.js');
      const r = await w.fetch(req('https://usps.imbsinc2023.workers.dev/address', { body: JSON.stringify({ addr1: '100 Main St', city: 'Miami', state: 'FL', zip: '33130' }), headers: { 'Content-Type': 'application/json' } }), {});
      A.eq(r.status, 200);
      A.has(calls[0].url, 'geocoding.geo.census.gov');
      A.eq((await r.json()).found, false);
    }, { result: { addressMatches: [] } }) },
    { name: 'usps: same security gate (origin + rate limit)', fn: () => withUpstream(async () => {
      const w = await load('usps-worker.js');
      A.eq((await w.fetch(req('https://usps.imbsinc2023.workers.dev/city-state?zip=33130', { method: 'GET', origin: null }), {})).status, 403);
    }) }
  ]
};
