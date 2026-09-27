/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const hostname = event.url.hostname.toLowerCase();

  // Architecture: Worker `tienganh7` (route timbk.io.vn/*) proxies to tienganh7-pro.pages.dev
  // Worker sets Host: tienganh7-pro.pages.dev and X-Forwarded-Host: timbk.io.vn
  // So event.url.hostname = "tienganh7-pro.pages.dev" even for timbk.io.vn traffic.
  // Detect proxied requests: X-Forwarded-Host is set by trusted Worker, not by external clients
  // hitting tienganh7-pro.pages.dev directly (browsers don't send X-Forwarded-Host).
  const forwardedHost = (event.request.headers.get('x-forwarded-host') || '').toLowerCase().split(':')[0];

  // 1. Request proxied from timbk.io.vn via Worker → serve normally + security headers.
  //    hostname will be tienganh7-pro.pages.dev but forwardedHost = timbk.io.vn
  if (forwardedHost === 'timbk.io.vn' || hostname === 'timbk.io.vn') {
    const response = await resolve(event);
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    // Prevent caching redirect responses at edge
    response.headers.set('Cache-Control', 'no-cache');
    return response;
  }

  // 2. Direct access to production alias tienganh7-pro.pages.dev (no X-Forwarded-Host).
  //    Redirect to custom domain. This ONLY fires for direct browser access, not Worker proxy.
  if (hostname === 'tienganh7-pro.pages.dev' && !forwardedHost) {
    const target = `https://timbk.io.vn${event.url.pathname}${event.url.search}`;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': target,
        'Cache-Control': 'no-cache, no-store'
      }
    });
  }

  // 3. All other hosts (preview deployments, localhost, etc): serve normally.
  return await resolve(event);
}
