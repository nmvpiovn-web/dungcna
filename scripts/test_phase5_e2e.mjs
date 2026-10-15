import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PORT = 5175;
let BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('C:/Users/admin/.gemini/antigravity/scratch/phase5_e2e_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const realSwSource = fs.readFileSync(path.resolve('static/sw.js'), 'utf-8');
const sampleApkPayload = Buffer.from('verified-apk-binary-payload-phase5-round2');
const sampleApkSha256 = crypto.createHash('sha256').update(sampleApkPayload).digest('hex');

async function runTests() {
  let server;
  let browser;
  const testResults = [];
  const capturedScreenshots = [];

  const fakePayload = Buffer.from(JSON.stringify({
    id: 'usr_staff_e2e',
    username: 'admin',
    role: 'superadmin',
    exp: Date.now() + 86400000
  })).toString('base64url');
  const fakeSig = 'a'.repeat(64);
  const validToken = `${fakePayload}.${fakeSig}`;

  let swVersionServed = 1;

  try {
    console.log(`Starting Vite dev server in-process on port ${PORT} (strictPort: true)...`);
    server = await createServer({
      server: {
        port: PORT,
        strictPort: true
      }
    });

    server.middlewares.stack.unshift({
      route: '',
      handle(req, res, next) {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(`// SW-E2E-VERSION: ${swVersionServed}\n` + realSwSource);
          return;
        }
        next();
      }
    });

    await server.listen();
    const resolvedLocalUrl = server.resolvedUrls?.local?.[0] || `http://localhost:${server.httpServer.address().port}/`;
    BASE_URL = resolvedLocalUrl.replace(/\/$/, '');
    console.log(`Vite dev server is ready at resolved URL: ${BASE_URL}`);

    console.log('Launching browser (channel: msedge)...');
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    const viewports = [
      { name: 'mobile_320', width: 320, height: 600, isMobile: true },
      { name: 'mobile_360', width: 360, height: 640, isMobile: true },
      { name: 'tablet_800', width: 800, height: 1024, isMobile: true },
      { name: 'desktop', width: 1280, height: 800, isMobile: false }
    ];

    for (const vp of viewports) {
      console.log(`\n========================================`);
      console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`========================================`);

      swVersionServed = 1;
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        serviceWorkers: 'allow'
      });

      await context.addInitScript((tok) => {
        const staffObj = {
          id: 'usr_staff_e2e',
          username: 'admin',
          name: 'Ms. Dung Teacher',
          role: 'superadmin',
          status: 'active',
          approval_status: 'approved'
        };
        localStorage.setItem('tienganh_token', tok);
        localStorage.setItem('tienganh_user', JSON.stringify(staffObj));
        localStorage.setItem('tienganh_active_user', JSON.stringify(staffObj));
      }, validToken);

      const page = await context.newPage();
      page.on('pageerror', (err) => console.error(`[PAGE ERROR ${vp.name}]:`, err.message));

      await page.route('**/api/auth/verify*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            authenticated: true,
            user: {
              id: 'usr_staff_e2e',
              username: 'admin',
              name: 'Ms. Dung Teacher',
              role: 'superadmin',
              status: 'active',
              approval_status: 'approved'
            }
          })
        });
      });

      let mockBuildMetaStatus = 200;
      let mockBuildMeta = {
        source_commit: 'bfad941fffa2d7cd038d128c3b3171fe1015a2a6',
        build_timestamp: '2026-10-09T11:05:19.489Z',
        build_identity: 'build_bfad941_1791543919489',
        version: '2.2.0',
        environment: 'production'
      };

      await page.route('**/build_meta.json*', async (route) => {
        if (mockBuildMetaStatus === 200) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockBuildMeta)
          });
        } else {
          await route.fulfill({
            status: mockBuildMetaStatus,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Offline error' })
          });
        }
      });

      let mockApkResponse = {
        status: 200,
        body: {
          app_name: 'Tiếng Anh Cô Dung',
          filename: 'tienganhcodung-latest.apk',
          package_id: 'vn.edu.tienganhcodung.app',
          version_name: '2.2.0',
          version_code: 220,
          download_url: '/downloads/tienganhcodung-latest.apk',
          file_size_bytes: sampleApkPayload.byteLength,
          file_size_mb: 2.8,
          sha256: sampleApkSha256,
          changelog: ['⚡ Cập nhật OTA hệ thống qua mạng', '📚 Nâng cấp giao diện Mobile & Tablet']
        }
      };

      await page.route('**/api/apk/version*', async (route) => {
        if (mockApkResponse.status === 200) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApkResponse.body)
          });
        } else {
          await route.fulfill({
            status: mockApkResponse.status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Server error' })
          });
        }
      });

      let serveCorruptedApkBytes = false;
      await page.route('**/downloads/tienganhcodung-latest.apk*', async (route) => {
        const buf = serveCorruptedApkBytes ? Buffer.from('corrupted-tampered-apk-bytes') : sampleApkPayload;
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.android.package-archive',
          body: buf
        });
      });

      // ----------------------------------------------------------------------
      // TEST 1: Navigation shell, Mobile update button & Same-version check
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 1: Navigation shell & Mobile update button`);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Sync mockBuildMeta to match page's compile-time clientBuildIdentity for 'latest' check
      const compiledIdentity = await page.evaluate(() => {
        return window.__CLIENT_BUILD_META__ || null;
      });
      if (compiledIdentity) {
        mockBuildMeta = { ...mockBuildMeta, ...compiledIdentity };
      }

      const overflowInfo = await page.evaluate(() => {
        const docEl = document.documentElement;
        const scrollW = docEl.scrollWidth;
        const clientW = docEl.clientWidth;
        const innerW = window.innerWidth;
        const overflowing = [];
        if (scrollW > clientW) {
          for (const el of document.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.right > innerW + 1) {
              overflowing.push({ tag: el.tagName, id: el.id, class: el.className, right: rect.right, width: rect.width });
            }
          }
        }
        return { scrollW, clientW, innerW, overflowing };
      });
      if (overflowInfo.overflowing.length > 0) {
        throw new Error(`[${vp.name}] Page has horizontal overflow! scrollWidth (${overflowInfo.scrollW}) > clientWidth (${overflowInfo.clientW})`);
      }
      console.log(`  ✓ No horizontal overflow on viewport ${vp.name} (scrollWidth: ${overflowInfo.scrollW}, clientWidth: ${overflowInfo.clientW})`);

      const openMobileDrawer = async () => {
        const mobileMenuBtn = page.locator('#mobile-menu-btn');
        const drawer = page.locator('#mobile-drawer');
        await mobileMenuBtn.waitFor({ state: 'visible', timeout: 5000 });
        for (let attempt = 0; attempt < 5; attempt++) {
          if (await drawer.isVisible()) return drawer;
          await mobileMenuBtn.click();
          await page.waitForTimeout(400);
          if (await drawer.isVisible()) return drawer;
        }
        await drawer.waitFor({ state: 'visible', timeout: 5000 });
        return drawer;
      };

      if (vp.isMobile) {
        await openMobileDrawer();

        const updateBtn = page.locator('#mobile-update-btn');
        await updateBtn.waitFor({ state: 'visible', timeout: 5000 });

        const btnBox = await updateBtn.boundingBox();
        if (!btnBox || btnBox.height < 44 || btnBox.width < 44) {
          throw new Error(`[${vp.name}] Update button touch target too small: ${btnBox?.width}x${btnBox?.height}`);
        }
        console.log(`  ✓ Mobile update button touch target verified: ${btnBox.width}x${btnBox.height}px (>=44px)`);
        testResults.push(`[${vp.name}] Mobile drawer update button visible with >=44px touch target`);

        const shotDrawerPath = path.join(SCREENSHOT_DIR, `mobile_drawer_${vp.name}.png`);
        await page.screenshot({ path: shotDrawerPath });
        capturedScreenshots.push(shotDrawerPath);

        await updateBtn.click();
        await page.waitForTimeout(500);

        const toast = page.locator('[role="status"]');
        await toast.waitFor({ state: 'visible', timeout: 5000 });
        const toastText = await toast.innerText();
        console.log(`  ✓ Update toast status displayed: "${toastText.trim()}"`);
        testResults.push(`[${vp.name}] Update status toast triggered`);
      } else {
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await footerBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log(`  ✓ Footer update button visible on ${vp.name}`);
        testResults.push(`[${vp.name}] Footer update button visible`);
      }

      // ----------------------------------------------------------------------
      // TEST 2: Modal A11y (Initial focus, Tab trap, Escape close, Focus restore, Inert)
      // & Verified Browser APK Download (Corrupted vs Valid SHA-256)
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 2: Modal A11y, Focus Trap, Escape & Verified APK Download`);
      mockBuildMeta = {
        ...mockBuildMeta,
        version: '2.3.0',
        build_identity: 'build_new_server_999999',
        build_timestamp: '2026-10-14T15:00:00.000Z'
      };
      mockApkResponse = {
        status: 200,
        body: {
          app_name: 'Tiếng Anh Cô Dung',
          filename: 'tienganhcodung-latest.apk',
          package_id: 'vn.edu.tienganhcodung.app',
          version_name: '2.3.0',
          version_code: 230,
          download_url: '/downloads/tienganhcodung-latest.apk',
          file_size_bytes: sampleApkPayload.byteLength,
          file_size_mb: 2.8,
          sha256: sampleApkSha256,
          changelog: ['⚡ Cập nhật lớn v2.3.0', '🚀 Tối ưu hóa hiệu năng DOOGEE R10']
        }
      };

      if (vp.isMobile) {
        await openMobileDrawer();
        await page.locator('#mobile-update-btn').click();
      } else {
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await footerBtn.focus();
        await footerBtn.click();
      }

      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(200);

      // Verify background main has inert attribute and initial focus is inside modal
      const a11yState = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        const mainEl = document.querySelector('main');
        return {
          focusInsideDialog: dialog ? dialog.contains(document.activeElement) : false,
          activeId: document.activeElement?.id || '',
          mainInert: mainEl ? mainEl.hasAttribute('inert') : false
        };
      });
      if (!a11yState.focusInsideDialog || !a11yState.mainInert) {
        throw new Error(`[${vp.name}] Modal a11y failed: focusInsideDialog=${a11yState.focusInsideDialog}, mainInert=${a11yState.mainInert}`);
      }
      console.log(`  ✓ Modal initial focus (#${a11yState.activeId}) and background inert verified`);

      // Test Verified APK Download: 1) Corrupted bytes rejected, 2) Valid bytes verified
      const apkBtn = modal.locator('#apk-verified-download-btn');
      await apkBtn.waitFor({ state: 'visible', timeout: 3000 });

      serveCorruptedApkBytes = true;
      await apkBtn.click();
      await page.waitForTimeout(300);
      const errAlert = modal.locator('[role="alert"]');
      await errAlert.waitFor({ state: 'visible', timeout: 3000 });
      const errText = await errAlert.innerText();
      if (!errText.includes('SHA-256') && !errText.includes('Kích thước')) {
        throw new Error(`[${vp.name}] Expected SHA-256/size verification error, got: ${errText}`);
      }

      serveCorruptedApkBytes = false;
      await apkBtn.click();
      await page.waitForTimeout(300);
      const verifiedBanner = modal.locator('text=Đã xác minh khớp 100% mã SHA-256');
      await verifiedBanner.waitFor({ state: 'visible', timeout: 3000 });
      console.log(`  ✓ Verified browser APK download (corrupted blocked -> valid SHA-256 verified)`);
      testResults.push(`[${vp.name}] Modal a11y & SHA-256 verified APK download passed`);

      const shotModalPath = path.join(SCREENSHOT_DIR, `update_modal_available_${vp.name}.png`);
      await page.screenshot({ path: shotModalPath });
      capturedScreenshots.push(shotModalPath);

      // Test Escape closes modal and restores background inert=false
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 3000 });
      const mainInertAfterClose = await page.evaluate(() => document.querySelector('main')?.hasAttribute('inert'));
      if (mainInertAfterClose) {
        throw new Error(`[${vp.name}] Background main remained inert after Escape close!`);
      }
      console.log(`  ✓ Escape key closed modal and restored background interactivity`);

      // ----------------------------------------------------------------------
      // TEST 3: Real SW Lifecycle (install -> waiting -> dirty block -> SKIP_WAITING -> single reload)
      // & Real Production Dirty Guard on /schedule (run on mobile_360 & desktop)
      // ----------------------------------------------------------------------
      if (vp.name === 'mobile_360' || vp.name === 'desktop') {
        console.log(`[${vp.name}] Test 3: Real Service Worker waiting -> dirty guard -> SKIP_WAITING -> single reload`);

        // Ensure initial SW is registered and controlling the page
        await page.evaluate(async () => {
          if ('serviceWorker' in navigator) {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
          }
        });
        await page.reload({ waitUntil: 'networkidle' });

        const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
        if (!hasController) {
          throw new Error(`[${vp.name}] Expected active Service Worker controller after reload`);
        }

        // Navigate to /schedule and verify opening SessionEditModal sets real production window.isAppBusy() === true
        await page.goto(`${BASE_URL}/schedule`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        const addSessionBtn = page.locator('button:has-text("Thêm Buổi Học")').first();
        if (await addSessionBtn.isVisible()) {
          await addSessionBtn.click();
          await page.waitForTimeout(300);
          const busyWhenScheduleModalOpen = await page.evaluate(() => window.isAppBusy());
          if (!busyWhenScheduleModalOpen) {
            throw new Error(`[${vp.name}] Expected window.isAppBusy() === true when Schedule SessionEditModal is open!`);
          }
          console.log(`  ✓ Production /schedule SessionEditModal automatically registered busy state (isAppBusy = true)`);

          const closeScheduleModalBtn = page.locator('[role="dialog"] button[aria-label="Đóng"]').first();
          await closeScheduleModalBtn.click();
          await page.waitForTimeout(300);
          const busyAfterScheduleModalClosed = await page.evaluate(() => window.isAppBusy());
          if (busyAfterScheduleModalClosed) {
            throw new Error(`[${vp.name}] Expected window.isAppBusy() === false after closing Schedule SessionEditModal!`);
          }
          console.log(`  ✓ Closing /schedule SessionEditModal automatically cleared busy state (isAppBusy = false)`);
        }

        // Now bump swVersionServed so browser fetches updated /sw.js
        swVersionServed += 1;

        // Trigger update check -> SW v2 installs and MUST stay in reg.waiting (no auto-skipWaiting!)
        const swWaitingState = await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          await reg.update();
          const deadline = Date.now() + 8000;
          while (!reg.waiting && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 150));
          }
          return {
            hasWaiting: Boolean(reg.waiting),
            waitingState: reg.waiting?.state || null,
            installingState: reg.installing?.state || null
          };
        });

        if (!swWaitingState.hasWaiting) {
          throw new Error(`[${vp.name}] Expected updated Service Worker v2 to remain in reg.waiting (no auto-skipWaiting)!`);
        }
        console.log(`  ✓ Real Service Worker v2 entered waiting state (${swWaitingState.waitingState}) without auto-skipWaiting`);

        // Register dirty state to test dirty block on update modal
        await page.evaluate(() => window.registerBusyState('quiz-menu-dirty'));

        // Trigger checkForUpdate(true) to open modal in restart_needed state
        if (vp.isMobile) {
          await openMobileDrawer();
          await page.locator('#mobile-update-btn').click();
        } else {
          const footerBtn = page.locator('#footer-update-btn');
          await footerBtn.scrollIntoViewIfNeeded();
          await footerBtn.click();
        }

        await modal.waitFor({ state: 'visible', timeout: 5000 });
        const pwaApplyBtn = modal.locator('#pwa-apply-update-btn');
        await pwaApplyBtn.waitFor({ state: 'visible', timeout: 3000 });

        // Click apply while dirty -> must block and NOT reload or skipWaiting
        await pwaApplyBtn.click();
        await page.waitForTimeout(300);
        const busyAlert = modal.locator('[role="alert"]');
        await busyAlert.waitFor({ state: 'visible', timeout: 3000 });
        const stillWaitingWhileDirty = await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return Boolean(reg?.waiting);
        });
        if (!stillWaitingWhileDirty) {
          throw new Error(`[${vp.name}] Waiting worker should NOT have activated while dirty guard was active!`);
        }
        console.log(`  ✓ Dirty guard blocked SKIP_WAITING & reload while dirty`);

        const shotBusyPath = path.join(SCREENSHOT_DIR, `update_busy_blocked_${vp.name}.png`);
        await page.screenshot({ path: shotBusyPath });
        capturedScreenshots.push(shotBusyPath);

        // Clear dirty state and click apply -> waiting SW receives SKIP_WAITING -> controllerchange -> reloads once!
        await page.evaluate(() => {
          window.unregisterBusyState('quiz-menu-dirty');
        });

        let navigationCount = 0;
        const onFrameNav = (frame) => {
          if (frame === page.mainFrame()) navigationCount++;
        };
        page.on('framenavigated', onFrameNav);

        await pwaApplyBtn.click();
        const navDeadline = Date.now() + 5000;
        while (navigationCount === 0 && Date.now() < navDeadline) {
          await page.waitForTimeout(100);
        }
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);
        page.off('framenavigated', onFrameNav);

        if (navigationCount !== 1) {
          throw new Error(`[${vp.name}] Expected exactly 1 reload on explicit SW activation, got ${navigationCount}`);
        }
        console.log(`  ✓ Explicit apply triggered SKIP_WAITING -> controllerchange -> reloaded strictly 1 time!`);
        testResults.push(`[${vp.name}] Real SW lifecycle (waiting -> dirty block -> SKIP_WAITING -> 1x reload) verified`);
      }

      // ----------------------------------------------------------------------
      // TEST 4: Offline State & Retry Handling
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 4: Offline state & Retry handling`);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      mockApkResponse = { status: 500, body: null };
      mockBuildMetaStatus = 500;

      if (vp.isMobile) {
        await openMobileDrawer();
        await page.locator('#mobile-update-btn').click();
      } else {
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await footerBtn.click();
      }

      await page.waitForTimeout(500);
      const offlineToast = page.locator('[role="status"]');
      await offlineToast.waitFor({ state: 'visible', timeout: 5000 });
      const retryBtn = offlineToast.locator('button:has-text("Thử lại")');
      await retryBtn.waitFor({ state: 'visible', timeout: 3000 });
      console.log(`  ✓ Offline toast rendered with retry button`);
      testResults.push(`[${vp.name}] Offline state handles error with retry`);

      const shotOfflinePath = path.join(SCREENSHOT_DIR, `update_offline_retry_${vp.name}.png`);
      await page.screenshot({ path: shotOfflinePath });
      capturedScreenshots.push(shotOfflinePath);

      await context.close();
    }

    console.log(`\n========================================`);
    console.log(`ALL REAL PLAYWRIGHT BROWSER UI & SW LIFECYCLE TESTS PASSED!`);
    console.log(`Total checks: ${testResults.length}`);
    console.log(`========================================\n`);

    return { success: true, testCount: testResults.length, screenshots: capturedScreenshots };
  } finally {
    if (browser) await browser.close();
    if (server) {
      console.log('Shutting down Vite dev server...');
      await server.close();
    }
  }
}

runTests()
  .then(() => {
    console.log('Phase 5 Playwright browser UI contract completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Phase 5 Playwright browser UI contract failed:', err);
    process.exit(1);
  });
