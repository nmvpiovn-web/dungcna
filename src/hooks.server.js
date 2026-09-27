/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const requestHost = (
    event.request.headers.get('x-forwarded-host') ||
    event.request.headers.get('host') ||
    event.url.hostname ||
    ''
  ).toLowerCase().split(':')[0];

  // 1. If already on production custom domain timbk.io.vn, strictly NEVER redirect to prevent loops
  if (requestHost.includes('timbk.io.vn')) {
    const response = await resolve(event);
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    return response;
  }

  // 2. Permanent redirect production alias tienganh7-pro.pages.dev -> https://timbk.io.vn
  // Strictly target exact production alias, do NOT affect branch preview deployments
  if (requestHost === 'tienganh7-pro.pages.dev') {
    const target = `https://timbk.io.vn${event.url.pathname}${event.url.search}`;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': target,
        'Cache-Control': 'no-cache'
      }
    });
  }

  return await resolve(event);
}
