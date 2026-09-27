/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const host = event.url.hostname;

  // 1. Permanent redirect production alias tienganh7-pro.pages.dev -> https://timbk.io.vn (preserve path/query)
  // Strictly target production alias tienganh7-pro.pages.dev, do NOT wildcard match preview deployments
  if (host === 'tienganh7-pro.pages.dev') {
    const target = `https://timbk.io.vn${event.url.pathname}${event.url.search}`;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': target,
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  }

  const response = await resolve(event);

  // 2. Security headers & HSTS for production custom domain
  if (host === 'timbk.io.vn') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }

  return response;
}
