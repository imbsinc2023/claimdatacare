/*
 * ClaimDataCare  •  USPS address worker (Cloudflare Workers)
 * Name it "usps" so it answers at https://usps.imbsinc2023.workers.dev
 *
 * Without the USPS secrets the worker still validates addresses with the free U.S. Census geocoder.
 * Secrets (Workers > usps > Settings > Variables and Secrets, type "Secret"):
 *   USPS_CLIENT_ID      consumer key of your app at developer.usps.com
 *   USPS_CLIENT_SECRET  consumer secret of that app
 *
 * Endpoints used by the app:
 *   GET  /city-state?zip=33175          -> { city, state, zip }
 *   POST /address  {addr1,addr2,city,state,zip}
 *        -> { found: true, address: {addr1,addr2,city,state,zip} }  or  { found: false }
 * Only HTTPS requests from claimdatacare.com are answered, max 60 per minute per visitor.
 * Nothing is stored or logged.
 */
const ALLOWED = ['https://claimdatacare.com', 'https://www.claimdatacare.com'];
const API = 'https://apis.usps.com';
let token = null, tokenExp = 0;

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

// free fallback when the USPS credentials are not set: U.S. Census Bureau geocoder
async function census(a) {
  const u = 'https://geocoding.geo.census.gov/geocoder/locations/address?benchmark=Public_AR_Current&format=json' +
    '&street=' + encodeURIComponent(a.addr1 || '') + '&city=' + encodeURIComponent(a.city || '') + '&state=' + encodeURIComponent(a.state || '') + '&zip=' + encodeURIComponent(String(a.zip || '').slice(0, 5));
  const r = await fetch(u); if (!r.ok) return { error: 'census ' + r.status };
  const j = await r.json(), m = j && j.result && (j.result.addressMatches || [])[0];
  if (!m) return { found: false, source: 'U.S. Census' };
  const p = String(m.matchedAddress || '').split(',').map(x => x.trim());
  return { found: true, source: 'U.S. Census', address: { addr1: p[0] || '', addr2: a.addr2 || '', city: p[1] || '', state: p[2] || '', zip: p[3] || '' } };
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(origin)) });
}
async function getToken(env) {
  if (token && Date.now() < tokenExp - 60000) return token;
  const r = await fetch(API + '/oauth2/v3/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.USPS_CLIENT_ID, client_secret: env.USPS_CLIENT_SECRET })
  });
  if (!r.ok) throw new Error('USPS token ' + r.status);
  const j = await r.json();
  token = j.access_token; tokenExp = Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000;
  return token;
}
async function usps(env, path, params) {
  const t = await getToken(env);
  const qs = Object.entries(params).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return fetch(API + path + '?' + qs, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const blocked = await gate(req, env, origin, cors(origin));
    if (blocked) return blocked;
    const url = new URL(req.url);
    try {
      if (url.pathname === '/city-state') {
        const zip = (url.searchParams.get('zip') || '').slice(0, 5);
        if (!/^\d{5}$/.test(zip)) return json({ error: 'zip' }, 400, origin);
        const r = await usps(env, '/addresses/v3/city-state', { ZIPCode: zip });
        if (!r.ok) return json({ error: 'not found' }, 404, origin);
        const j = await r.json();
        return json({ city: j.city, state: j.state, zip: j.ZIPCode || zip }, 200, origin);
      }
      if (url.pathname === '/address' && req.method === 'POST') {
        const a = await req.json();
        if (!env.USPS_CLIENT_ID || !env.USPS_CLIENT_SECRET) return json(await census(a), 200, origin);
        const zip = String(a.zip || '').replace(/[^\d]/g, '').slice(0, 5);
        const r = await usps(env, '/addresses/v3/address', { streetAddress: a.addr1, secondaryAddress: a.addr2, city: a.city, state: a.state, ZIPCode: zip });
        if (r.status === 400 || r.status === 404) return json({ found: false, source: 'USPS' }, 200, origin);
        if (!r.ok) return json(await census(a), 200, origin);
        const j = await r.json(), ad = j.address || {};
        return json({ found: true, source: 'USPS', address: {
          addr1: ad.streetAddress || '', addr2: ad.secondaryAddress || '', city: ad.city || '', state: ad.state || '',
          zip: (ad.ZIPCode || '') + (ad.ZIPPlus4 ? '-' + ad.ZIPPlus4 : '')
        } }, 200, origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'unavailable' }, 503, origin);
    }
  }
};
