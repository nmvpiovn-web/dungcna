export const prerender = false;

const BASE_URL = 'https://timbk.io.vn';

// Only public, indexable pages with HTTP 200 (no admin, cpanel, api, second-brain, private data)
const publicRoutes = [
  { path: '', changefreq: 'daily', priority: '1.0' },
  { path: '/courses', changefreq: 'weekly', priority: '0.9' },
  { path: '/grammar', changefreq: 'weekly', priority: '0.8' },
  { path: '/dictionary', changefreq: 'weekly', priority: '0.8' },
  { path: '/flashcards', changefreq: 'weekly', priority: '0.7' },
  { path: '/games', changefreq: 'weekly', priority: '0.7' },
  { path: '/quiz', changefreq: 'weekly', priority: '0.7' },
  { path: '/exam', changefreq: 'weekly', priority: '0.8' },
  { path: '/pedagogy', changefreq: 'monthly', priority: '0.6' },
  { path: '/recruitment', changefreq: 'monthly', priority: '0.6' }
];

export async function GET() {
  const urls = publicRoutes
    .map(
      r => `  <url>
    <loc>${BASE_URL}${r.path}</loc>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
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
