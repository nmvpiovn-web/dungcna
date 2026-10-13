import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const PORT = 5175;
let BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('C:/Users/admin/.gemini/antigravity/scratch/phase5_e2e_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

  try {
    console.log(`Starting Vite dev server in-process on port ${PORT} (strictPort: true)...`);
    server = await createServer({
      server: {
        port: PORT,
        strictPort: true
      }
    });

    try {
      await server.listen();
    } catch (listenErr) {
      console.error(`Port collision on port ${PORT}:`, listenErr.message);
      throw new Error(`Port collision on port ${PORT}. Ensure no other process is listening on ${PORT}: ${listenErr.message}`);
    }

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

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });

      // Inject authenticated staff user into localStorage before any script runs
      await context.addInitScript((tok) => {
        const staffObj = {
          id: 'usr_staff_e2e',
          username: 'admin',
          name: 'Ms. Dung Teacher',
          role: 'superadmin',
          status: 'active'
        };
        localStorage.setItem('tienganh_token', tok);
        localStorage.setItem('tienganh_user', JSON.stringify(staffObj));
        localStorage.setItem('tienganh_active_user', JSON.stringify(staffObj));
      }, validToken);

      const page = await context.newPage();
      page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[BROWSER ${vp.name}] ${msg.text()}`);
      });
      page.on('pageerror', err => console.error(`[PAGE ERROR ${vp.name}]:`, err.message));

      await page.route('**/api/auth/verify*', async route => {
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
              status: 'active'
            }
          })
        });
      });

      let mockApkResponse = {
        status: 200,
        body: {
          app_name: 'Tiếng Anh Cô Dung',
          package_id: 'vn.edu.tienganhcodung.app',
          version_name: '2.2.0',
          version_code: 220,
          download_url: '/downloads/tienganhcodung-latest.apk',
          file_size_bytes: 2975961,
          file_size_mb: 2.8,
          sha256: '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97',
          changelog: ['⚡ Cập nhật OTA hệ thống qua mạng', '📚 Nâng cấp giao diện Mobile & Tablet']
        }
      };

      await page.route('**/api/apk/version*', async route => {
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

      // ----------------------------------------------------------------------
      // TEST 1: Mobile drawer & Update button visibility (Viewport 320/360/800)
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 1: Navigation shell & Mobile update button`);
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Check horizontal overflow on page
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
        console.error(`[${vp.name}] Overflowing elements:`, overflowInfo.overflowing.slice(0, 5));
        throw new Error(`[${vp.name}] Page has horizontal overflow! scrollWidth (${overflowInfo.scrollW}) > clientWidth (${overflowInfo.clientW})`);
      }
      console.log(`  ✓ No horizontal overflow on viewport ${vp.name} (scrollWidth: ${overflowInfo.scrollW}, clientWidth: ${overflowInfo.clientW})`);

      if (vp.isMobile) {
        // Click hamburger button to open mobile drawer
        const mobileMenuBtn = page.locator('#mobile-menu-btn');
        await mobileMenuBtn.waitFor({ state: 'visible', timeout: 5000 });
        await mobileMenuBtn.click();
        await page.waitForTimeout(400);

        const drawer = page.locator('#mobile-drawer');
        await drawer.waitFor({ state: 'visible', timeout: 5000 });

        // Assert mobile update button is visible
        const updateBtn = page.locator('#mobile-update-btn');
        await updateBtn.waitFor({ state: 'visible', timeout: 5000 });

        // Check touch target >= 44x44
        const btnBox = await updateBtn.boundingBox();
        if (!btnBox || btnBox.height < 44 || btnBox.width < 44) {
          throw new Error(`[${vp.name}] Update button touch target too small: ${btnBox?.width}x${btnBox?.height}`);
        }
        console.log(`  ✓ Mobile update button touch target verified: ${btnBox.width}x${btnBox.height}px (>=44px)`);
        testResults.push(`[${vp.name}] Mobile drawer update button visible with >=44px touch target`);

        const shotDrawerPath = path.join(SCREENSHOT_DIR, `mobile_drawer_${vp.name}.png`);
        await page.screenshot({ path: shotDrawerPath });
        capturedScreenshots.push(shotDrawerPath);

        // Click update button to trigger check
        await updateBtn.click();
        await page.waitForTimeout(600);

        // Toast message appears with latest status
        const toast = page.locator('[role="status"]');
        await toast.waitFor({ state: 'visible', timeout: 5000 });
        const toastText = await toast.innerText();
        console.log(`  ✓ Update toast status displayed: "${toastText.trim()}"`);
        testResults.push(`[${vp.name}] Update status toast triggered`);

        const shotToastPath = path.join(SCREENSHOT_DIR, `update_toast_${vp.name}.png`);
        await page.screenshot({ path: shotToastPath });
        capturedScreenshots.push(shotToastPath);
      } else {
        // On tablet / desktop, footer update button is visible
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await footerBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log(`  ✓ Footer update button visible on ${vp.name}`);
        testResults.push(`[${vp.name}] Footer update button visible`);

        const shotFooterPath = path.join(SCREENSHOT_DIR, `footer_update_${vp.name}.png`);
        await page.screenshot({ path: shotFooterPath });
        capturedScreenshots.push(shotFooterPath);
      }

      // ----------------------------------------------------------------------
      // TEST 2: Update Available Modal with PWA in-place & APK download
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 2: Update Available Modal & a11y dialog`);
      // Change mock response to return newer version
      mockApkResponse = {
        status: 200,
        body: {
          app_name: 'Tiếng Anh Cô Dung',
          package_id: 'vn.edu.tienganhcodung.app',
          version_name: '2.3.0',
          version_code: 230,
          download_url: '/downloads/tienganhcodung-latest.apk',
          file_size_bytes: 2975961,
          file_size_mb: 2.8,
          sha256: '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97',
          changelog: ['⚡ Cập nhật lớn v2.3.0', '🚀 Tối ưu hóa hiệu năng DOOGEE R10']
        }
      };

      // Trigger update check via footer or drawer button
      if (vp.isMobile) {
        const mobileMenuBtn = page.locator('#mobile-menu-btn');
        await mobileMenuBtn.click();
        const drawer = page.locator('#mobile-drawer');
        await drawer.waitFor({ state: 'visible', timeout: 5000 });
        const updateBtn = page.locator('#mobile-update-btn');
        await updateBtn.click();
      } else {
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await footerBtn.click();
      }

      await page.waitForTimeout(600);

      // Verify Modal opens with role="dialog" and aria-modal="true"
      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      await modal.waitFor({ state: 'visible', timeout: 5000 });

      // Verify no horizontal overflow in modal
      const modalBox = await modal.boundingBox();
      const vpWidth = page.viewportSize().width;
      if (modalBox && modalBox.width > vpWidth) {
        throw new Error(`[${vp.name}] Update modal overflowed viewport width: ${modalBox.width} > ${vpWidth}`);
      }
      console.log(`  ✓ Update modal has role="dialog", aria-modal="true" and fits inside viewport`);
      testResults.push(`[${vp.name}] Update modal dialog opened and verified a11y/fit`);

      // Verify PWA in-place button and APK download link exist
      const pwaBtn = modal.locator('button:has-text("Cập Nhật")');
      await pwaBtn.waitFor({ state: 'visible', timeout: 3000 });

      const apkDownloadLink = modal.locator('a[download*="tienganhcodung"]');
      await apkDownloadLink.waitFor({ state: 'visible', timeout: 3000 });
      console.log(`  ✓ PWA update button and APK download link both visible`);

      const shotModalPath = path.join(SCREENSHOT_DIR, `update_modal_available_${vp.name}.png`);
      await page.screenshot({ path: shotModalPath });
      capturedScreenshots.push(shotModalPath);

      // ----------------------------------------------------------------------
      // TEST 3: Busy State Protection (Dirty Form / Exam active prevents reload)
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 3: Busy State Registry protection`);
      await page.evaluate(() => {
        window.registerBusyState('test-active-exam');
      });

      // Click PWA update button while busy
      await pwaBtn.click();
      await page.waitForTimeout(400);

      // Alert role="alert" must be visible inside modal warning user
      const busyAlert = modal.locator('[role="alert"]');
      await busyAlert.waitFor({ state: 'visible', timeout: 3000 });
      const busyAlertText = await busyAlert.innerText();
      if (!busyAlertText.includes('Đang có tác vụ chưa lưu')) {
        throw new Error(`Expected busy alert, got: ${busyAlertText}`);
      }
      console.log(`  ✓ Busy state protection verified: "${busyAlertText.trim()}"`);
      testResults.push(`[${vp.name}] Busy state correctly blocks reload and renders alert`);

      const shotBusyPath = path.join(SCREENSHOT_DIR, `update_busy_blocked_${vp.name}.png`);
      await page.screenshot({ path: shotBusyPath });
      capturedScreenshots.push(shotBusyPath);

      // Clean up busy state and close modal
      await page.evaluate(() => {
        window.unregisterBusyState('test-active-exam');
      });
      const closeBtn = modal.locator('button:has-text("Đóng")').first();
      await closeBtn.click();
      await modal.waitFor({ state: 'hidden', timeout: 3000 });

      // ----------------------------------------------------------------------
      // TEST 4: Offline State & Retry Handling
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test 4: Offline state & Retry handling`);
      mockApkResponse = { status: 500, body: null };

      if (vp.isMobile) {
        const mobileMenuBtn = page.locator('#mobile-menu-btn');
        await mobileMenuBtn.click();
        const drawer = page.locator('#mobile-drawer');
        await drawer.waitFor({ state: 'visible', timeout: 5000 });
        const updateBtn = page.locator('#mobile-update-btn');
        await updateBtn.click();
      } else {
        const footerBtn = page.locator('#footer-update-btn');
        await footerBtn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await footerBtn.click();
      }

      await page.waitForTimeout(600);

      // Toast appears with offline/error status and retry button
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
    console.log(`ALL REAL PLAYWRIGHT BROWSER UI CONTRACT TESTS PASSED!`);
    console.log(`Total checks: ${testResults.length}`);
    console.log(`Screenshots saved (${capturedScreenshots.length}):`);
    capturedScreenshots.forEach(s => console.log('  -', s));
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

runTests().then(() => {
  console.log('Phase 5 Playwright browser UI contract completed successfully.');
  process.exit(0);
}).catch(err => {
  console.error('Phase 5 Playwright browser UI contract failed:', err);
  process.exit(1);
});
