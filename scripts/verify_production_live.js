// scripts/verify_production_live.js
// 61-point Live Production Acceptance Audit against https://timbk.io.vn
// Strictly validates Real Cloudflare Pages edge deployment, D1, Security headers, SEO, and Audio isolation

const PROD_URL = 'https://timbk.io.vn';
const ALIAS_URL = 'https://tienganh7-pro.pages.dev';

async function runLiveAudit() {
  console.log('===============================================================');
  console.log('LIVE PRODUCTION 61-POINT ACCEPTANCE AUDIT');
  console.log(`Target Custom Domain: ${PROD_URL}`);
  console.log(`Target Cloudflare Alias: ${ALIAS_URL}`);
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`[PASS] ${title} ${extra ? '(' + extra + ')' : ''}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} ${extra ? '(' + extra + ')' : ''}`);
      failed++;
    }
  }

  try {
    // Group 1: Domain, HTTPS, Redirects & HSTS Headers (Criteria 1-10)
    console.log('--- 1. Domain, HTTPS, Redirects & Security Headers ---');
    const aliasRes = await fetch(ALIAS_URL, { redirect: 'manual' });
    assert('1.01 Alias 301 Redirect Status', aliasRes.status === 301, `Status: ${aliasRes.status}`);
    const locationHeader = aliasRes.headers.get('location') || '';
    assert('1.02 Alias Redirect Target timbk.io.vn', locationHeader.startsWith('https://timbk.io.vn'), `Location: ${locationHeader}`);

    const aliasDeepRes = await fetch(`${ALIAS_URL}/courses/?grade=7`, { redirect: 'manual' });
    const deepLocation = aliasDeepRes.headers.get('location') || '';
    assert('1.03 Deep Link Path & Query Preservation', deepLocation === 'https://timbk.io.vn/courses/?grade=7', `Location: ${deepLocation}`);

    const prodRes = await fetch(PROD_URL);
    assert('1.04 Custom Domain HTTP 200 OK', prodRes.status === 200, `Status: ${prodRes.status}`);
    assert('1.05 Strict HTTPS Enforcement', prodRes.url.startsWith('https://timbk.io.vn'), `URL: ${prodRes.url}`);
    
    const hsts = prodRes.headers.get('strict-transport-security') || '';
    assert('1.06 HSTS Header Present', hsts.includes('max-age=31536000'), `HSTS: ${hsts}`);
    
    const xcto = prodRes.headers.get('x-content-type-options') || '';
    assert('1.07 X-Content-Type-Options: nosniff', xcto === 'nosniff', `XCTO: ${xcto}`);

    const xfo = prodRes.headers.get('x-frame-options') || '';
    assert('1.08 X-Frame-Options: SAMEORIGIN', xfo === 'SAMEORIGIN', `XFO: ${xfo}`);

    const cfRay = prodRes.headers.get('cf-ray') || '';
    assert('1.09 Cloudflare Edge Ray ID Verification', cfRay.length > 0, `CF-Ray: ${cfRay}`);

    const serverHeader = prodRes.headers.get('server') || '';
    assert('1.10 Cloudflare Server Infrastructure', serverHeader.toLowerCase().includes('cloudflare'), `Server: ${serverHeader}`);

    // Group 2: SEO, Sitemap, Robots.txt & Metadata (Criteria 11-20)
    console.log('\n--- 2. SEO, Sitemap, Robots.txt & Meta Tags ---');
    const sitemapRes = await fetch(`${PROD_URL}/sitemap.xml`);
    assert('2.01 /sitemap.xml HTTP 200 OK', sitemapRes.status === 200, `Status: ${sitemapRes.status}`);
    const sitemapType = sitemapRes.headers.get('content-type') || '';
    assert('2.02 /sitemap.xml XML Content-Type', sitemapType.includes('application/xml') || sitemapType.includes('text/xml'), `Content-Type: ${sitemapType}`);
    const sitemapXml = await sitemapRes.text();
    assert('2.03 Sitemap Namespace Valid', sitemapXml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    assert('2.04 Sitemap Contains Canonical Homepage', sitemapXml.includes('<loc>https://timbk.io.vn/</loc>'));
    assert('2.05 Sitemap Contains Courses URL', sitemapXml.includes('<loc>https://timbk.io.vn/courses</loc>'));
    assert('2.06 Sitemap Contains Dictionary URL', sitemapXml.includes('<loc>https://timbk.io.vn/dictionary</loc>'));
    assert('2.07 Sitemap Excludes Private Routes', !sitemapXml.includes('/cpanel') && !sitemapXml.includes('/admin'));

    const robotsRes = await fetch(`${PROD_URL}/robots.txt`);
    assert('2.08 /robots.txt HTTP 200 OK', robotsRes.status === 200, `Status: ${robotsRes.status}`);
    const robotsTxt = await robotsRes.text();
    assert('2.09 Robots.txt Declares Sitemap', robotsTxt.includes('Sitemap: https://timbk.io.vn/sitemap.xml'));
    assert('2.10 Robots.txt Disallows Sensitive Paths', robotsTxt.includes('Disallow: /cpanel/') && robotsTxt.includes('Disallow: /admin/'));

    // Group 3: Canonical Link & SSR Meta Headers (Criteria 21-30)
    console.log('\n--- 3. Canonical Link & OpenGraph SSR Tags ---');
    const homeHtml = await prodRes.text();
    assert('3.01 Homepage Canonical Link Present', homeHtml.includes('<link rel="canonical" href="https://timbk.io.vn/" />'));
    assert('3.02 OpenGraph URL Homepage', homeHtml.includes('<meta property="og:url" content="https://timbk.io.vn/" />'));
    assert('3.03 OpenGraph Site Name Present', homeHtml.includes('Tiếng Anh Cô Dung'));

    const coursesRes = await fetch(`${PROD_URL}/courses`);
    const coursesHtml = await coursesRes.text();
    assert('3.04 /courses Canonical Link Path Synced', coursesHtml.includes('<link rel="canonical" href="https://timbk.io.vn/courses" />'));
    assert('3.05 /courses OpenGraph URL Synced', coursesHtml.includes('<meta property="og:url" content="https://timbk.io.vn/courses" />'));
    assert('3.06 /courses Meta Description Present', coursesHtml.includes('<meta name="description"'));
    assert('3.07 /courses PWA Theme Color Meta', coursesHtml.includes('name="theme-color"'));
    assert('3.08 /courses Transparent Drive Sync Banner SSR', coursesHtml.includes('Kho Audio Bài Nghe Google Drive'));

    const cpanelRes = await fetch(`${PROD_URL}/cpanel/parent`);
    const cpanelHtml = await cpanelRes.text();
    assert('3.09 Private Route Robots Noindex Header', cpanelHtml.includes('<meta name="robots" content="noindex, nofollow" />'));
    assert('3.10 Private Route Viewport Setup', cpanelHtml.includes('viewport'));

    // Group 4: Cloudflare D1 Remote Database & Public Endpoints (Criteria 31-40)
    console.log('\n--- 4. Cloudflare D1 Remote API Verification ---');
    const campusesRes = await fetch(`${PROD_URL}/api/campuses`);
    assert('4.01 /api/campuses HTTP 200 OK', campusesRes.status === 200);
    const campusesData = await campusesRes.json();
    assert('4.02 /api/campuses Returns Real D1 Campuses', campusesData.success && Array.isArray(campusesData.campuses) && campusesData.campuses.length >= 3, `Count: ${campusesData.campuses?.length}`);

    const scheduleRes = await fetch(`${PROD_URL}/api/schedule`);
    assert('4.03 /api/schedule HTTP 200 OK', scheduleRes.status === 200);
    const scheduleData = await scheduleRes.json();
    assert('4.04 /api/schedule Returns Real Schedule Data', scheduleData.success && Array.isArray(scheduleData.schedules));

    const vocabRes = await fetch(`${PROD_URL}/api/vocabulary?limit=10`);
    assert('4.05 /api/vocabulary HTTP 200 OK', vocabRes.status === 200);
    const vocabData = await vocabRes.json();
    assert('4.06 /api/vocabulary Returns Cambridge Lexicon', vocabData.success && vocabData.words?.length > 0);

    const guestExamRes = await fetch(`${PROD_URL}/api/exams/guest`);
    assert('4.07 /api/exams/guest HTTP 200 OK', guestExamRes.status === 200);
    const guestExamData = await guestExamRes.json();
    assert('4.08 /api/exams/guest Returns Real Exam Items', guestExamData.success && guestExamData.questions?.length > 0);

    const audioCatRes = await fetch(`${PROD_URL}/api/audio/stream?action=catalog`);
    assert('4.09 /api/audio/stream?action=catalog HTTP 200 OK', audioCatRes.status === 200);
    const audioCatData = await audioCatRes.json();
    assert('4.10 Audio Catalog Total > 0', audioCatData.success && audioCatData.total > 0, `Total: ${audioCatData.total}`);

    // Group 5: Strict Audio Isolation & Fixture Rejection (Criteria 41-50)
    console.log('\n--- 5. Audio Isolation & Production Security ---');
    const testFixtureRes = await fetch(`${PROD_URL}/api/audio/stream?id=test_range_fixture`);
    assert('5.01 test_range_fixture Strictly Returns HTTP 404 on Production', testFixtureRes.status === 404, `Status: ${testFixtureRes.status}`);

    const unsyncedTrackRes = await fetch(`${PROD_URL}/api/audio/stream?id=u1_vocab_audio`);
    assert('5.02 Unsynced Track Returns HTTP 503 Fail-Closed', unsyncedTrackRes.status === 503, `Status: ${unsyncedTrackRes.status}`);
    const unsyncedData = await unsyncedTrackRes.json();
    assert('5.03 Unsynced Track Reason: source_pending_download', unsyncedData.error === 'source_pending_download');

    const invalidTrackRes = await fetch(`${PROD_URL}/api/audio/stream?id=non_existent_track_999`);
    assert('5.04 Non-existent Track Returns 404', invalidTrackRes.status === 404);

    const rangeMaliciousRes = await fetch(`${PROD_URL}/api/audio/stream?id=test_range_fixture`, {
      headers: { 'Range': 'bytes=99999999-99999999' }
    });
    assert('5.05 Malicious Range Header on Fixture Yields 404 on Prod', rangeMaliciousRes.status === 404);

    const authVerifyNoToken = await fetch(`${PROD_URL}/api/auth/verify`);
    assert('5.06 Unauthenticated /api/auth/verify Returns 401', authVerifyNoToken.status === 401);

    const authVerifyTampered = await fetch(`${PROD_URL}/api/auth/verify`, {
      headers: { 'Authorization': 'Bearer usr_admin.ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }
    });
    assert('5.07 Tampered Token Verification Returns 401', authVerifyTampered.status === 401);

    const parentChildUnauth = await fetch(`${PROD_URL}/api/parents/children`);
    assert('5.08 /api/parents/children Unauthenticated Returns 401', parentChildUnauth.status === 401);

    const tuitionUnauth = await fetch(`${PROD_URL}/api/tuition`);
    assert('5.09 /api/tuition Unauthenticated Returns 401', tuitionUnauth.status === 401);

    const homeworkUnauth = await fetch(`${PROD_URL}/api/homework`);
    assert('5.10 /api/homework Unauthenticated Returns 401', homeworkUnauth.status === 401);

    // Group 6: Dynamic Exam Stripping, RBAC, PWA Manifest & App Health (Criteria 51-61)
    console.log('\n--- 6. Exam Stripping, PWA Manifest & System Integrity ---');
    const randomExamRes = await fetch(`${PROD_URL}/api/exams/random?grade=7&time_limit=15`);
    assert('6.01 /api/exams/random HTTP 200 OK', randomExamRes.status === 200);
    const randomExamData = await randomExamRes.json();
    assert('6.02 Dynamic Test Generator Supplies 15 Questions', randomExamData.success && randomExamData.questions?.length === 15, `Count: ${randomExamData.questions?.length}`);
    const firstQ = randomExamData.questions?.[0] || {};
    assert('6.03 Exam Generator Strips correct_answer for Students', firstQ.correct_answer === undefined, `Key present: ${firstQ.correct_answer !== undefined}`);
    assert('6.04 Exam Generator Strips explanation for Students', firstQ.explanation === undefined);

    const manifestRes = await fetch(`${PROD_URL}/manifest.json`);
    assert('6.05 /manifest.json PWA HTTP 200 OK', manifestRes.status === 200);
    const manifestData = await manifestRes.json();
    assert('6.06 PWA Manifest Contains App Name', manifestData.name === 'Tiếng Anh Cô Dung');
    assert('6.07 PWA Start URL Valid', manifestData.start_url === '/');

    const swRes = await fetch(`${PROD_URL}/service-worker.js`);
    assert('6.08 /service-worker.js HTTP 200 OK', swRes.status === 200);
    const swTxt = await swRes.text();
    assert('6.09 Service Worker Offline Cache Ready', swTxt.includes('install') && swTxt.includes('cache'));

    const secondBrainUnauth = await fetch(`${PROD_URL}/api/second-brain`);
    assert('6.10 Second Brain API Fail-Closed Unauthenticated', secondBrainUnauth.status === 401 || secondBrainUnauth.status === 403);

    const sepayWebhookGet = await fetch(`${PROD_URL}/api/webhook/sepay`);
    assert('6.11 Payment Webhook Guards Invalid Method', sepayWebhookGet.status === 405 || sepayWebhookGet.status === 400 || sepayWebhookGet.status === 401);

    console.log('\n===============================================================');
    console.log(`LIVE AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('FATAL AUDIT RUNTIME ERROR:', err);
    process.exit(1);
  }
}

runLiveAudit();
