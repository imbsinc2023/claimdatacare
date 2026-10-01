/*
 * ClaimDataCare  •  USPS address worker (Cloudflare Workers)
 * Name it "usps" so it answers at https://usps.imbsinc2023.workers.dev
 *
 * Secrets (Workers > usps > Settings > Variables and Secrets, type "Secret"):
 *   USPS_CLIENT_ID      consumer key of your app at developer.usps.com
 *   USPS_CLIENT_SECRET  consumer secret of that app
 *
 * Endpoints used by the app:
 *   GET  /city-state?zip=33175          -> { city, state, zip }
 *   POST /address  {addr1,addr2,city,state,zip}
 *        -> { found: true, address: {addr1,addr2,city,state,zip} }  or  { found: false }
 * Only requests from claimdatacare.com are answered. Nothing is stored or logged.
 */
const ALLOWED = ['https://claimdatacare.com', 'https://www.claimdatacare.com'];
const API = 'https://apis.usps.com';
let token = null, tokenExp = 0;

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
    if (origin && !ALLOWED.includes(origin)) return json({ error: 'forbidden' }, 403, origin);
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
        const zip = String(a.zip || '').replace(/[^\d]/g, '').slice(0, 5);
        const r = await usps(env, '/addresses/v3/address', { streetAddress: a.addr1, secondaryAddress: a.addr2, city: a.city, state: a.state, ZIPCode: zip });
        if (r.status === 400 || r.status === 404) return json({ found: false }, 200, origin);
        if (!r.ok) return json({ error: 'usps ' + r.status }, 502, origin);
        const j = await r.json(), ad = j.address || {};
        return json({ found: true, address: {
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
