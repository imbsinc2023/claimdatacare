/*
 * ClaimDataCare  •  ClaimMD eligibility worker (Cloudflare Workers)
 * Name it "claimmd-elig" so it answers at https://claimmd-elig.imbsinc2023.workers.dev
 *
 * POST /eligdata  (form fields from the app, including the provider's AccountKey)
 *   -> forwards to ClaimMD's real-time eligibility service and returns its answer as JSON.
 * Only HTTPS requests from claimdatacare.com are answered, max 60 per minute per visitor.
 * Nothing is stored or logged.
 */
const ALLOWED = ['https://claimdatacare.com', 'https://www.claimdatacare.com'];
const CLAIMMD = 'https://svc.claim.md/services/eligdata/';

// ── Request limits + encrypted transport (2026-10-03) ─────────────────────────
// Per visitor (IP) per minute. Uses Cloudflare's Rate Limiting binding named "RL" when
// it is configured for this worker; otherwise a per-instance counter (best effort).
const PER_MIN = 60;
const MAX_BODY = 200000;   // bytes
const _hits = new Map();
async function limited(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  try { if (env && env.RL && typeof env.RL.limit === 'function') { const r = await env.RL.limit({ key: ip }); return !r.success; } } catch (e) {}
  const now = Date.now(), w = _hits.get(ip) || { n: 0, t: now };
  if (now - w.t > 60000) { w.n = 0; w.t = now; }
  w.n++; _hits.set(ip, w);
  if (_hits.size > 5000) _hits.clear();
  return w.n > PER_MIN;
}
// Refuses: non-HTTPS, calls that do not come from claimdatacare.com, oversized bodies, floods.
async function gate(req, env, origin, headers) {
  const u = new URL(req.url);
  const h = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers || {});
  if (u.protocol !== 'https:') return new Response(JSON.stringify({ error: 'https required' }), { status: 403, headers: h });
  if (!ALLOWED.includes(origin)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: h });
  if (+(req.headers.get('Content-Length') || 0) > MAX_BODY) return new Response(JSON.stringify({ error: 'too large' }), { status: 413, headers: h });
  if (await limited(req, env)) return new Response(JSON.stringify({ error: 'too many requests' }), { status: 429, headers: Object.assign({ 'Retry-After': '60' }, h) });
  return null;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const blocked = await gate(req, env, origin, cors(origin));
    if (blocked) return blocked;
    const url = new URL(req.url);
    if (url.pathname !== '/eligdata' || req.method !== 'POST') return new Response('not found', { status: 404, headers: cors(origin) });
    try {
      const body = await req.text();
      const r = await fetch(CLAIMMD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body
      });
      const text = await r.text();
      // ClaimMD answers JSON when asked; if it ever answers XML, pass it back wrapped
      let out = text;
      try { JSON.parse(text); } catch (e) { out = JSON.stringify({ raw: text, error: r.ok ? undefined : 'ClaimMD ' + r.status }); }
      return new Response(out, { status: 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(origin)) });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'ClaimMD not reachable' }), { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)) });
    }
  }
};
