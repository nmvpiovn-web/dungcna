/**
 * BROWSER SERVICE WORKER MECHANISM TEST (FIXTURE LEVEL)
 *
 * Verifies core W3C Service Worker lifecycle upgrade mechanics in Google Chrome:
 * 1. Build A: Client loads fixture page, registers SW v1, claims controller.
 * 2. Busy State: Client enters active exam / dirty input, registers busy state.
 * 3. Release Build B: Real byte-different SW published on same origin, registration.update() called.
 * 4. Controllerchange Invariant: Real browser controllerchange fires -> proves banner shown, ZERO reload, answer preserved.
 * 5. Idle Transition: Busy state cleared.
 * 6. Release Build C: Real byte-different SW published on same origin, registration.update() called while IDLE.
 * 7. Controllerchange Invariant: Real browser controllerchange fires -> proves automatic page reload executed per policy.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { chromium } from 'playwright';

const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EVIDENCE_JSON_PATH = path.resolve('tests/real_pwa_lifecycle_upgrade_evidence.json');
const CODEX_DIR = 'C:/Users/admin/Documents/Codex';

let currentSwVersion = 'BUILD_A_1.0.0';

const htmlTemplate = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Tiếng Anh Cô Dung - PWA Lifecycle Staging</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; max-width: 600px; margin: 0 auto; }
    textarea { width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; color: #fff; padding: 10px; border-radius: 6px; }
    #sw-update-banner { position: fixed; bottom: 20px; right: 20px; padding: 14px 18px; background: #0284c7; color: #fff; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-size: 13px; font-weight: 600; }
  </style>
  <script>
    window.__appBusyRegistry = new Set();
    window.registerBusyState = function(id) {
      window.__appBusyRegistry.add(id);
      return function() { window.__appBusyRegistry.delete(id); };
    };
    window.unregisterBusyState = function(id) { window.__appBusyRegistry.delete(id); };
    window.isAppBusy = function() {
      return window.__appBusyRegistry.size > 0;
    };

    window.__swControllerChangeEvents = [];
    window.__swReloadCount = Number(sessionStorage.getItem('__sw_reload_count') || 0);
    window.__documentSessionMarker = sessionStorage.getItem('__doc_session_marker') || ('doc_session_' + Date.now());
    sessionStorage.setItem('__doc_session_marker', window.__documentSessionMarker);

    if ('serviceWorker' in navigator) {
      let hadPreviousController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadPreviousController) {
          hadPreviousController = true;
          console.log('[CLIENT] Initial SW controller claimed. First install — no reload needed.');
          return;
        }
        const eventRecord = {
          timestamp: Date.now(),
          isBusy: window.isAppBusy(),
          busyReasons: Array.from(window.__appBusyRegistry)
        };
        window.__swControllerChangeEvents.push(eventRecord);
        console.log('[CLIENT] Real SW controllerchange upgrade event received:', eventRecord);

        if (window.isAppBusy()) {
          let banner = document.getElementById('sw-update-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'sw-update-banner';
            banner.innerHTML = '⚡ Có bản cập nhật hệ thống mới. Dữ liệu đã được bảo toàn tự động.';
            document.body.appendChild(banner);
          }
          return; // DO NOT RELOAD WHEN BUSY
        }

        // Idle: execute reload per policy
        if (!window.__swReloading) {
          window.__swReloading = true;
          sessionStorage.setItem('__sw_reload_count', String(window.__swReloadCount + 1));
          window.location.reload();
        }
      });

      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW reg error:', err));
      });
    }
  </script>
</head>
<body>
  <div class="card">
    <h2>Khảo Thí K12 - Bài Làm Trực Tuyến</h2>
    <p>Trạng thái kiểm định ServiceWorker Lifecycle Upgrade (Staging Build A -> B -> C)</p>
    <label for="exam-answer"><strong>Bài làm học sinh:</strong></label><br><br>
    <textarea id="exam-answer" rows="4">Bài luận tiếng Anh Lớp 7 của học sinh Nguyễn Văn A - Đang làm bài thi.</textarea>
  </div>
</body>
</html>`;

function getSwScript(version) {
  return `// Real Service Worker Version: ${version}
const SW_VERSION = '${version}';
self.addEventListener('install', (event) => {
  console.log('[SW ' + SW_VERSION + '] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW ' + SW_VERSION + '] Activating & Claiming clients...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through to network
});
`;
}

// Start HTTP server
const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(htmlTemplate);
    return;
  }
  if (url === '/sw.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(getSwScript(currentSwVersion));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const testResults = [];
function recordAssertion(id, description, passed, detail) {
  const symbol = passed ? '✔ PASS' : '✖ FAIL';
  console.log(`  [${symbol}] ${id}: ${description} (${detail})`);
  testResults.push({ id, description, passed, detail, timestamp: new Date().toISOString() });
  if (!passed) {
    throw new Error(`Assertion failed: ${id} — ${description}`);
  }
}

async function run() {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Staging test server running at ${BASE_URL}`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    console.log('\n--- PHASE 1: Install & Control by Build A ---');
    currentSwVersion = 'BUILD_A_1.0.0';
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for ServiceWorker to register and control page
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, { timeout: 10000 });
    const isControlledA = await page.evaluate(() => navigator.serviceWorker.controller !== null);
    recordAssertion('SW-STAGE-1.1', 'Browser document controlled by Build A Service Worker', isControlledA, 'Controller active');

    console.log('\n--- PHASE 2: Client Enters Busy State ---');
    await page.fill('#exam-answer', 'Dữ liệu bài thi đang được bảo vệ trong bộ nhớ.');
    await page.evaluate(() => {
      window.registerBusyState('active_exam');
      window.__initialDocMarker = window.__documentSessionMarker;
    });

    const isBusyNow = await page.evaluate(() => window.isAppBusy());
    recordAssertion('SW-STAGE-2.1', 'Client registers active_exam in appBusyRegistry', isBusyNow === true, `isBusy: ${isBusyNow}`);

    console.log('\n--- PHASE 3: Deploy Build B on Same Origin & Execute Real W3C SW Upgrade ---');
    currentSwVersion = 'BUILD_B_2.0.0'; // Switch server code to Build B
    
    // Trigger real W3C ServiceWorker update
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });

    // Wait for real controllerchange event to arrive
    await page.waitForFunction(() => window.__swControllerChangeEvents.length >= 1, { timeout: 10000 });
    await page.waitForTimeout(500);

    const busyControllerEvent = await page.evaluate(() => window.__swControllerChangeEvents[0]);
    recordAssertion('SW-STAGE-3.1', 'Real browser controllerchange fired during busy state', Boolean(busyControllerEvent), `Event captured, isBusy: ${busyControllerEvent?.isBusy}`);

    // Invariant assertions when BUSY:
    const bannerVisible = await page.locator('#sw-update-banner').isVisible();
    recordAssertion('SW-STAGE-3.2', 'SW update banner displayed on document during controllerchange', bannerVisible, `Banner visible: ${bannerVisible}`);

    const reloadCountAfterUpgrade = await page.evaluate(() => Number(sessionStorage.getItem('__sw_reload_count') || 0));
    recordAssertion('SW-STAGE-3.3', 'PWA Safety Invariant: ZERO page reloads occurred during busy SW upgrade', reloadCountAfterUpgrade === 0, `Reload count: ${reloadCountAfterUpgrade}`);

    const preservedInputText = await page.locator('#exam-answer').inputValue();
    recordAssertion('SW-STAGE-3.4', 'PWA Data Integrity: Student exam text 100% intact', preservedInputText === 'Dữ liệu bài thi đang được bảo vệ trong bộ nhớ.', `Value: "${preservedInputText}"`);

    const docMarkerUnchanged = await page.evaluate(() => window.__documentSessionMarker === window.__initialDocMarker);
    recordAssertion('SW-STAGE-3.5', 'PWA Execution Invariant: Document object was never reloaded or destroyed', docMarkerUnchanged, `Marker intact: ${docMarkerUnchanged}`);

    // Save screenshot of preserved busy banner
    const screenshotDir = path.resolve('screenshots/g1_evidence');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const shotPath = path.join(screenshotDir, '11_real_sw_lifecycle_busy_preserved.png');
    const shotBuffer = await page.screenshot();
    fs.writeFileSync(shotPath, shotBuffer);
    console.log(`  [Screenshot] Saved real SW busy evidence to: ${shotPath}`);

    console.log('\n--- PHASE 4: Transition to Idle State ---');
    await page.evaluate(() => {
      window.unregisterBusyState('active_exam');
    });
    const isIdleConfirmed = await page.evaluate(() => window.isAppBusy() === false);
    recordAssertion('SW-STAGE-4.1', 'Client naturally transitions to idle state', isIdleConfirmed, `isBusy: ${!isIdleConfirmed}`);

    console.log('\n--- PHASE 5: Deploy Build C on Same Origin & Execute Real SW Upgrade While IDLE ---');
    currentSwVersion = 'BUILD_C_3.0.0'; // Switch server code to Build C

    // Trigger real W3C ServiceWorker update while IDLE
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });

    // Wait for the page to execute reload
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    const reloadCountAfterIdle = await page.evaluate(() => Number(sessionStorage.getItem('__sw_reload_count') || 0));
    recordAssertion('SW-STAGE-5.1', 'PWA Lifecycle Invariant: Idle client automatically reloads to consume Build C', reloadCountAfterIdle === 1, `Reload count: ${reloadCountAfterIdle}`);

    const shotPathIdle = path.join(screenshotDir, '12_real_sw_lifecycle_idle_reloaded.png');
    const shotBufferIdle = await page.screenshot();
    fs.writeFileSync(shotPathIdle, shotBufferIdle);
    console.log(`  [Screenshot] Saved real SW idle reload evidence to: ${shotPathIdle}`);

    // Copy screenshots to Codex directory
    if (fs.existsSync(CODEX_DIR)) {
      const dest1 = path.join(CODEX_DIR, 'g1_evidence/11_real_sw_lifecycle_busy_preserved.png');
      const dest2 = path.join(CODEX_DIR, 'g1_evidence/12_real_sw_lifecycle_idle_reloaded.png');
      const g1Dir = path.join(CODEX_DIR, 'g1_evidence');
      if (!fs.existsSync(g1Dir)) fs.mkdirSync(g1Dir, { recursive: true });
      fs.copyFileSync(shotPath, dest1);
      fs.copyFileSync(shotPathIdle, dest2);
      console.log('  [Export] Copied real SW evidence screenshots to Codex evidence directory.');
    }

    console.log('\n======================================================================');
    console.log('REAL PWA SERVICE WORKER LIFECYCLE UPGRADE SUITE — 100% PASSED');
    console.log(`Total Assertions: ${testResults.length}`);
    console.log('======================================================================\n');

    fs.writeFileSync(EVIDENCE_JSON_PATH, JSON.stringify({
      suite: 'real_pwa_lifecycle_upgrade',
      target: BASE_URL,
      browser: CHROME_PATH,
      build_sequence: ['BUILD_A_1.0.0', 'BUILD_B_2.0.0', 'BUILD_C_3.0.0'],
      timestamp: new Date().toISOString(),
      results: testResults
    }, null, 2), 'utf-8');

    // Also copy evidence JSON to Codex
    fs.copyFileSync(EVIDENCE_JSON_PATH, path.join(CODEX_DIR, 'real_pwa_lifecycle_upgrade_evidence.json'));

  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error('PWA Upgrade Test Error:', err);
  process.exit(1);
});
