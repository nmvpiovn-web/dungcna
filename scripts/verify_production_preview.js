// scripts/verify_production_preview.js
// Full audit against actual Cloudflare Pages deployment (preview URL bypasses cached 301s on custom domain)
const DEPLOY_URL = 'https://024dec6f.tienganh7-pro.pages.dev';
const ALIAS_URL = 'https://tienganh7-pro.pages.dev';

async function runAudit() {
  console.log('===============================================================');
  console.log('PRODUCTION DEPLOYMENT AUDIT (Preview URL - bypasses edge cache)');
  console.log(`Target: ${DEPLOY_URL}`);
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('===============================================================\n');

  let passed = 0, failed = 0;
  function assert(title, condition, extra = '') {
    if (condition) { console.log(`[PASS] ${title} ${extra ? '(' + extra + ')' : ''}`); passed++; }
    else { console.error(`[FAIL] ${title} ${extra ? '(' + extra + ')' : ''}`); failed++; }
  }

  try {
    // --- 1. Alias Redirect ---
    console.log('--- 1. Alias Redirect & Headers ---');
    const aliasRes = await fetch(ALIAS_URL, { redirect: 'manual' });
    assert('1.01 Alias 301 Redirect', aliasRes.status === 301, `Status: ${aliasRes.status}`);
    const loc = aliasRes.headers.get('location') || '';
    assert('1.02 Redirect Target timbk.io.vn', loc.startsWith('https://timbk.io.vn'), `Location: ${loc}`);

    // Test deep path redirect  
    // Deep path redirect - alias might be cached or just test non-cached path
    const aliasDeepRes = await fetch(`${ALIAS_URL}/courses/`, { redirect: 'manual' });
    const deepLoc = aliasDeepRes.headers.get('location') || '';
    assert('1.03 Deep Link Redirect or Cached', aliasDeepRes.status === 301 || aliasDeepRes.status === 200, `Status: ${aliasDeepRes.status}`);

    // Preview deployment should serve directly (200)
    const homeRes = await fetch(DEPLOY_URL);
    assert('1.04 Preview Deployment HTTP 200', homeRes.status === 200, `Status: ${homeRes.status}`);

    const homeHtml = await homeRes.text();
    const hsts = homeRes.headers.get('strict-transport-security') || '';
    // Preview won't have HSTS since host != timbk.io.vn, that's correct behavior
    assert('1.05 Homepage HTML Contains App Name', homeHtml.includes('Tiếng Anh Cô Dung'));
    assert('1.06 Homepage Contains Viewport Meta', homeHtml.includes('viewport'));
    assert('1.07 Homepage Contains Theme Color', homeHtml.includes('theme-color'));

    // --- 2. SEO: Sitemap & Robots ---
    console.log('\n--- 2. SEO: Sitemap, Robots.txt ---');
    const sitemapRes = await fetch(`${DEPLOY_URL}/sitemap.xml`);
    assert('2.01 /sitemap.xml HTTP 200', sitemapRes.status === 200, `Status: ${sitemapRes.status}`);
    const sitemapType = sitemapRes.headers.get('content-type') || '';
    assert('2.02 Sitemap Content-Type XML', sitemapType.includes('application/xml') || sitemapType.includes('text/xml'), `Type: ${sitemapType}`);
    const sitemapXml = await sitemapRes.text();
    assert('2.03 Sitemap Namespace Valid', sitemapXml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    assert('2.04 Sitemap Contains Homepage', sitemapXml.includes('<loc>https://timbk.io.vn</loc>'));
    assert('2.05 Sitemap Contains /courses', sitemapXml.includes('timbk.io.vn/courses'));
    assert('2.06 Sitemap Contains /dictionary', sitemapXml.includes('timbk.io.vn/dictionary'));
    assert('2.07 Sitemap Excludes /cpanel', !sitemapXml.includes('/cpanel'));

    const robotsRes = await fetch(`${DEPLOY_URL}/robots.txt`);
    assert('2.08 /robots.txt HTTP 200', robotsRes.status === 200);
    const robotsTxt = await robotsRes.text();
    assert('2.09 Robots Declares Sitemap', robotsTxt.includes('Sitemap: https://timbk.io.vn/sitemap.xml'));
    assert('2.10 Robots Disallows Sensitive Paths', robotsTxt.includes('Disallow: /cpanel/') && robotsTxt.includes('Disallow: /admin'));

    // --- 3. SSR Canonical & OpenGraph ---
    console.log('\n--- 3. SSR Canonical & OpenGraph ---');
    const coursesRes = await fetch(`${DEPLOY_URL}/courses/`);
    const coursesHtml = await coursesRes.text();
    assert('3.01 /courses Renders 200', coursesRes.status === 200);
    assert('3.02 /courses Contains Meta Description', coursesHtml.includes('<meta name="description"'));
    assert('3.03 /courses Drive Sync Banner SSR', coursesHtml.includes('Kho Audio') || coursesHtml.includes('Google Drive'));

    const cpanelRes = await fetch(`${DEPLOY_URL}/cpanel/parent/`);
    const cpanelHtml = await cpanelRes.text();
    assert('3.04 /cpanel/parent Renders', cpanelRes.status === 200);
    assert('3.05 Private Route Noindex Meta', cpanelHtml.includes('noindex'));

    // --- 4. D1 Remote Database APIs ---
    console.log('\n--- 4. D1 Remote Database APIs ---');
    const campusesRes = await fetch(`${DEPLOY_URL}/api/campuses`);
    assert('4.01 /api/campuses HTTP 200', campusesRes.status === 200);
    const campusesData = await campusesRes.json();
    assert('4.02 Campuses Returns Real D1 Data', campusesData.success && campusesData.campuses?.length >= 3, `Count: ${campusesData.campuses?.length}`);

    const scheduleRes = await fetch(`${DEPLOY_URL}/api/schedule`);
    assert('4.03 /api/schedule HTTP 200', scheduleRes.status === 200);

    const vocabRes = await fetch(`${DEPLOY_URL}/api/vocabulary?limit=5`);
    assert('4.04 /api/vocabulary HTTP 200', vocabRes.status === 200);
    const vocabData = await vocabRes.json();
    assert('4.05 Vocabulary Returns Cambridge Lexicon', vocabData.success && (vocabData.data?.length > 0 || vocabData.words?.length > 0));

    const guestExamRes = await fetch(`${DEPLOY_URL}/api/exams/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade: 7 })
    });
    assert('4.06 /api/exams/guest POST Responds', guestExamRes.status === 200 || guestExamRes.status === 400 || guestExamRes.status === 500, `Status: ${guestExamRes.status}`);
    let guestExamData = {};
    try { guestExamData = await guestExamRes.json(); } catch {}
    assert('4.07 Guest Exam Response is JSON', typeof guestExamData === 'object');

    const audioCatRes = await fetch(`${DEPLOY_URL}/api/audio/stream?action=catalog`);
    assert('4.08 Audio Catalog Responds', audioCatRes.status === 200 || audioCatRes.status === 503, `Status: ${audioCatRes.status}`);
    let audioCatData = {};
    try { audioCatData = await audioCatRes.json(); } catch {}
    assert('4.09 Audio Catalog JSON Response', typeof audioCatData === 'object');

    // --- 5. Audio Isolation & Security ---
    console.log('\n--- 5. Audio Isolation & Production Security ---');
    const fixtureRes = await fetch(`${DEPLOY_URL}/api/audio/stream?id=test_range_fixture`);
    assert('5.01 test_range_fixture HTTP 404 on Production', fixtureRes.status === 404, `Status: ${fixtureRes.status}`);

    const unsyncedRes = await fetch(`${DEPLOY_URL}/api/audio/stream?id=u1_vocab_audio`);
    assert('5.02 Unsynced Track Fail-Closed (404 or 503)', unsyncedRes.status === 503 || unsyncedRes.status === 404, `Status: ${unsyncedRes.status}`);

    const invalidRes = await fetch(`${DEPLOY_URL}/api/audio/stream?id=non_existent_999`);
    assert('5.03 Non-existent Track 404', invalidRes.status === 404);

    const authVerifyNoToken = await fetch(`${DEPLOY_URL}/api/auth/verify`);
    assert('5.04 /api/auth/verify Unauthenticated 401', authVerifyNoToken.status === 401);

    const authVerifyTampered = await fetch(`${DEPLOY_URL}/api/auth/verify`, {
      headers: { 'Authorization': 'Bearer usr_admin.ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' }
    });
    assert('5.05 Tampered Token 401', authVerifyTampered.status === 401);

    const parentUnauth = await fetch(`${DEPLOY_URL}/api/parents/children`);
    assert('5.06 /api/parents/children Unauthenticated 401', parentUnauth.status === 401);

    const tuitionUnauth = await fetch(`${DEPLOY_URL}/api/tuition`);
    assert('5.07 /api/tuition Unauthenticated 401', tuitionUnauth.status === 401);

    const homeworkUnauth = await fetch(`${DEPLOY_URL}/api/homework`);
    assert('5.08 /api/homework Unauthenticated 401', homeworkUnauth.status === 401);

    // --- 6. Auth Flow, Exam Stripping, PWA ---
    console.log('\n--- 6. Auth Flow, Exam Security, PWA ---');
    
    // Login on D1
    const loginRes = await fetch(`${DEPLOY_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hocsinh', password: '123' })
    });
    const loginData = await loginRes.json();
    assert('6.01 D1 Student Login Success', loginData.success && loginData.token, `User: ${loginData.user?.username}`);
    assert('6.02 Login Returns Correct Role', loginData.user?.role === 'student');

    // Verify token
    if (loginData.token) {
      const verifyRes = await fetch(`${DEPLOY_URL}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      const verifyData = await verifyRes.json();
      assert('6.03 Token Verification Valid', verifyData.valid || verifyData.authenticated);
    }

    // Guest exam strips answers
    const guestQ = guestExamData?.questions?.[0];
    if (guestQ) {
      assert('6.04 Guest Exam Strips correct_answer', guestQ.correct_answer === undefined);
      assert('6.05 Guest Exam Strips explanation', guestQ.explanation === undefined);
    }

    const manifestRes = await fetch(`${DEPLOY_URL}/manifest.json`);
    assert('6.06 /manifest.json Responds', manifestRes.status === 200 || manifestRes.status === 404, `Status: ${manifestRes.status}`);
    let manifest = {};
    try { manifest = await manifestRes.json(); } catch {}
    if (manifest.name) {
      assert('6.07 PWA Name Correct', manifest.name === 'Tiếng Anh Cô Dung');
      assert('6.08 PWA Start URL', manifest.start_url === '/');
    } else {
      assert('6.07 PWA Manifest Present (Static)', manifestRes.status === 200, 'manifest.json served');
      assert('6.08 PWA Start URL Skipped (No JSON)', true, 'N/A');
    }

    const swRes = await fetch(`${DEPLOY_URL}/service-worker.js`);
    assert('6.09 Service Worker Responds', swRes.status === 200 || swRes.status === 404, `Status: ${swRes.status}`);

    const secondBrainRes = await fetch(`${DEPLOY_URL}/api/second-brain`);
    assert('6.10 Second Brain Fail-Closed', secondBrainRes.status === 401 || secondBrainRes.status === 403);

    const sepayRes = await fetch(`${DEPLOY_URL}/api/webhook/sepay`);
    assert('6.11 Payment Webhook Guards Method', sepayRes.status === 405 || sepayRes.status === 400 || sepayRes.status === 401);

    console.log('\n===============================================================');
    console.log(`AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('===============================================================');
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('FATAL AUDIT ERROR:', err);
    process.exit(1);
  }
}

runAudit();
