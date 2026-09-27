const urls = [
  'https://timbk.io.vn/',
  'https://timbk.io.vn/courses/',
  'https://timbk.io.vn/api/campuses',
  'https://timbk.io.vn/sitemap.xml',
  'https://timbk.io.vn/robots.txt',
  'https://timbk.io.vn/dictionary/',
  'https://timbk.io.vn/api/auth/verify',
];

const results = await Promise.all(urls.map(async u => {
  const r = await fetch(u, { redirect: 'manual' });
  return {
    url: u.replace('https://timbk.io.vn', ''),
    status: r.status,
    cache: r.headers.get('cf-cache-status') || '-',
    age: r.headers.get('age') || '-',
    loc: r.headers.get('location') || '-'
  };
}));

results.forEach(x => {
  console.log(`${x.status} cache=${x.cache} age=${x.age} ${x.url} ${x.status === 301 ? 'loc=' + x.loc : ''}`);
});
