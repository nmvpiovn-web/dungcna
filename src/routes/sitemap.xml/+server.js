export const prerender = false;

export async function GET({ url }) {
  const origin = url.origin || 'https://tienganhcodung.edu.vn';
  const currentDate = new Date().toISOString().slice(0, 10);

  // Strictly list public routes only (Omit private/authenticated routes: /admin, /schedule, /evaluations, /second-brain)
  const publicPages = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/courses', changefreq: 'weekly', priority: '0.9' },
    { loc: '/exam', changefreq: 'daily', priority: '0.9' },
    { loc: '/pedagogy', changefreq: 'weekly', priority: '0.8' },
    { loc: '/vocabulary', changefreq: 'weekly', priority: '0.8' }
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.map(page => `  <url>
    <loc>${origin}${page.loc}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
