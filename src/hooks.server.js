/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  // Use event.url.hostname — set by Cloudflare infrastructure, not client-controllable.
  // Do NOT trust x-forwarded-host as it can be spoofed by clients.
  const hostname = event.url.hostname.toLowerCase();

  // 1. Production custom domain: serve normally, add security headers, NEVER redirect.
  if (hostname === 'timbk.io.vn') {
    const response = await resolve(event);
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    return response;
  }

  // 2. Permanent redirect production alias -> custom domain.
  // Exact match only: do NOT affect branch preview deployments (e.g. abc123.tienganh7-pro.pages.dev).
  if (hostname === 'tienganh7-pro.pages.dev') {
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
