export const prerender = false;

const BASE_URL = 'https://timbk.io.vn';

// Only public, indexable pages with HTTP 200 (no admin, cpanel, api, second-brain, private data)
// lastmod: use deploy date; update when content changes significantly
const LASTMOD = '2026-10-07';
const publicRoutes = [
  { path: '/', lastmod: LASTMOD },
  { path: '/courses/', lastmod: LASTMOD },
  { path: '/grammar/', lastmod: LASTMOD },
  { path: '/dictionary/', lastmod: LASTMOD },
  { path: '/flashcards/', lastmod: LASTMOD },
  { path: '/games/', lastmod: LASTMOD },
  { path: '/quiz/', lastmod: LASTMOD },
  { path: '/exam/', lastmod: LASTMOD },
  { path: '/pedagogy/', lastmod: LASTMOD },
  { path: '/recruitment/', lastmod: LASTMOD },
  { path: '/bang-gia/', lastmod: LASTMOD },
  { path: '/hall-of-fame/', lastmod: LASTMOD },
  { path: '/truong-hoc/', lastmod: LASTMOD },
  { path: '/tools/', lastmod: LASTMOD }
];

export async function GET() {
  const urls = publicRoutes
    .map(
      r => `  <url>
    <loc>${BASE_URL}${r.path}</loc>
    <lastmod>${r.lastmod}</lastmod>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Robots-Tag': 'noindex' // Sitemap itself should not be indexed as a search result
    }
  });
}
