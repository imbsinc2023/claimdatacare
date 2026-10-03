/* ClaimDataCare • request limits for the other workers (2026-10-03)
 * Paste this block at the top of claimmd-proxy, claimmd-era and email-service
 * (after their ALLOWED list of origins; add one if missing:
 *   const ALLOWED = ['https://claimdatacare.com', 'https://www.claimdatacare.com'];)
 * then make the first lines of fetch(req, env) be:
 *   const origin = req.headers.get('Origin') || '';
 *   if (req.method === 'OPTIONS') return new Response(null, { headers: <your CORS headers> });
 *   const blocked = await gate(req, env, origin, <your CORS headers>);
 *   if (blocked) return blocked;
 * Suggested PER_MIN: claimmd-proxy 240, claimmd-era 60, email-service 10.
 * Also remove any GET handler that accepts data in the URL (email-service).
 */

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
