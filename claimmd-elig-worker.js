/*
 * ClaimDataCare  •  ClaimMD eligibility worker (Cloudflare Workers)
 * Name it "claimmd-elig" so it answers at https://claimmd-elig.imbsinc2023.workers.dev
 *
 * POST /eligdata  (form fields from the app, including the provider's AccountKey)
 *   -> forwards to ClaimMD's real-time eligibility service and returns its answer as JSON.
 * Only requests from claimdatacare.com are answered. Nothing is stored or logged.
 */
const ALLOWED = ['https://claimdatacare.com', 'https://www.claimdatacare.com'];
const CLAIMMD = 'https://svc.claim.md/services/eligdata/';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (origin && !ALLOWED.includes(origin)) return new Response('forbidden', { status: 403 });
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
