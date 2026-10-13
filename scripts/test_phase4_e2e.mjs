import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('C:/Users/admin/.gemini/antigravity/scratch/phase4_e2e_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    console.log(`Starting Vite dev server in-process on port ${PORT}...`);
    server = await createServer({
      server: { port: PORT }
    });
    await server.listen();
    console.log(`Vite dev server is ready at ${BASE_URL}`);
    console.log('Launching browser (channel: msedge)...');
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    const viewports = [
      { name: 'mobile_320', width: 320, height: 600 },
      { name: 'mobile_360', width: 360, height: 640 },
      { name: 'tablet_800', width: 800, height: 1024 },
      { name: 'desktop', width: 1280, height: 800 }
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

      // Common mock for auth/workflow APIs
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

      await page.route('**/api/teachers/workflows*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, leaves: [], advances: [] })
        });
      });

      // ----------------------------------------------------------------------
      // TEST (A1): /quiz-menu with missing migrations schema banner
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test A1: /quiz-menu missing-schema banner and Auto/review-first mode`);
      let quizReadinessA1 = {
        ready: false,
        schema_ready: false,
        catalog_empty: true,
        status: 'schema_unmigrated',
        is_staff: true,
        missing_migrations: ['0018_knowledge_fts_triggers_backfill.sql', '0022_quiz_bundle_sync_phase3.sql'],
        missing_tables: ['quiz_bundle_sync_locks'],
        remediation_code: 'npx wrangler d1 migrations apply tienganh-pro-db --remote',
        message: 'Cơ sở dữ liệu Quiz chưa hoàn tất migrations: Chưa chạy 2 migrations'
      };

      await page.route('**/api/quiz-menu/readiness*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, readiness: quizReadinessA1 })
        });
      });

      await page.route('**/api/quiz-menu?assigned=1', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, quizzes: [], readiness: quizReadinessA1 })
        });
      });

      await page.route('**/api/quiz-menu?mine=1', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, quizzes: [] })
        });
      });

      await page.route('**/api/quiz-menu', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, quizzes: [], readiness: quizReadinessA1 })
          });
        } else {
          await route.continue();
        }
      });

      await page.goto(`${BASE_URL}/quiz-menu`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Check missing-schema banner in Take tab
      const unreadyAlert = page.locator('[data-testid="quiz-readiness-unready"], .readiness-alert-card');
      await unreadyAlert.waitFor({ state: 'visible', timeout: 5000 });
      const bannerText = await unreadyAlert.innerText();
      console.log(`  ✓ Missing-schema banner visible: "${bannerText.slice(0, 60)}..."`);
      testResults.push(`[${vp.name}] (a) Missing-schema diagnostic banner displayed correctly`);

      const shotA1Path = path.join(SCREENSHOT_DIR, `quiz_menu_missing_schema_${vp.name}.png`);
      await page.screenshot({ path: shotA1Path });
      capturedScreenshots.push(shotA1Path);

      // Switch to "Tạo Quiz" tab
      const createTabBtn = page.locator('nav.tabs button:has-text("Tạo Quiz")');
      await createTabBtn.waitFor({ state: 'visible', timeout: 5000 });
      await createTabBtn.click();
      await page.waitForTimeout(400);

      // Verify Auto/review-first mode is open and manual inputs are absent initially
      const autoBtn = page.locator('.builder-mode-switcher .mode-btn.active');
      const autoBtnText = await autoBtn.innerText();
      if (!autoBtnText.includes('Tự động')) {
        throw new Error(`Expected Auto mode to be active by default, got: ${autoBtnText}`);
      }
      console.log(`  ✓ Auto mode active by default: "${autoBtnText.split('\n')[0]}"`);

      // Verify missing-schema banner is also visible inside Create workspace
      const createReadinessBanner = page.locator('[data-testid="staff-readiness-warning"], .readiness-banner');
      await createReadinessBanner.waitFor({ state: 'visible', timeout: 5000 });
      console.log(`  ✓ Create workspace shows missing migrations alert banner`);

      // Verify manual question editor/cards/textareas are absent initially in Auto mode
      const manualEditorCount = await page.locator('.manual-builder-shell, .question-editor-list, .editor-card, .type-picker, textarea[placeholder*="Nhập câu hỏi"]').count();
      if (manualEditorCount > 0) {
        throw new Error(`Manual question editor fields/cards were present initially! Count: ${manualEditorCount}`);
      }
      console.log(`  ✓ Manual question editor fields/cards absent initially in Auto/review mode`);
      testResults.push(`[${vp.name}] (a) Create tab opens in Auto/review-first; manual question editor fields absent`);

      const shotA1CreatePath = path.join(SCREENSHOT_DIR, `quiz_menu_create_auto_review_${vp.name}.png`);
      await page.screenshot({ path: shotA1CreatePath });
      capturedScreenshots.push(shotA1CreatePath);

      // ----------------------------------------------------------------------
      // TEST (A2): /quiz-menu with true empty catalog (schema_ready = true)
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test A2: /quiz-menu true empty catalog (no missing-schema banner)`);
      let quizReadinessA2 = {
        ready: true,
        schema_ready: true,
        catalog_empty: true,
        status: 'catalog_empty',
        is_staff: true,
        published_count: 0,
        catalog_seeded: true,
        message: 'Cơ sở dữ liệu Quiz đã sẵn sàng (đã áp dụng migrations), hiện chưa có bài quiz nào được xuất bản trong danh mục.'
      };

      await page.unroute('**/api/quiz-menu*');
      await page.route('**/api/quiz-menu/readiness*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, readiness: quizReadinessA2 })
        });
      });
      await page.route('**/api/quiz-menu?assigned=1', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, quizzes: [], readiness: quizReadinessA2 })
        });
      });
      await page.route('**/api/quiz-menu?mine=1', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, quizzes: [] })
        });
      });
      await page.route('**/api/quiz-menu', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, quizzes: [], readiness: quizReadinessA2 })
        });
      });

      await page.goto(`${BASE_URL}/quiz-menu`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Verify readiness banner is ABSENT
      const readinessBannerCount = await page.locator('.readiness-banner, [data-testid="quiz-readiness-unready"], .readiness-alert-card').count();
      if (readinessBannerCount !== 0) {
        throw new Error(`Readiness banner was present in true empty catalog mode! Count: ${readinessBannerCount}`);
      }
      console.log(`  ✓ Readiness banner count is zero in true empty catalog mode`);

      // Verify empty-state catalog card is shown with data-testid="quiz-catalog-empty"
      const emptyStateCard = page.locator('[data-testid="quiz-catalog-empty"]');
      await emptyStateCard.waitFor({ state: 'visible', timeout: 5000 });
      console.log(`  ✓ True empty catalog card ([data-testid="quiz-catalog-empty"]) displayed cleanly`);
      testResults.push(`[${vp.name}] (a) True empty catalog displays without unmigrated banner and shows [data-testid=quiz-catalog-empty]`);

      const shotA2Path = path.join(SCREENSHOT_DIR, `quiz_menu_true_empty_catalog_${vp.name}.png`);
      await page.screenshot({ path: shotA2Path });
      capturedScreenshots.push(shotA2Path);

      // ----------------------------------------------------------------------
      // TEST (B1): /schedule modal from top button, date autofill, successful POST
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test B1: /schedule top button modal, autofill date, success save`);
      let scheduleSessions = [
        {
          id: 'sess_e2e_1',
          class_id: 'cls_ket',
          class_name: 'Lớp 7 - KET Intensive E2E',
          session_date: '2026-10-15',
          day_of_week: 4,
          day_name: 'Thứ Năm',
          start_time: '18:00',
          end_time: '19:30',
          room_notes: 'Phòng VIP 201',
          teacher_id: 'usr_staff_e2e',
          teacher_name: 'Ms. Dung Teacher',
          status: 'scheduled',
          student_ids: []
        }
      ];

      let postCount = 0;
      await page.route('**/api/schedule*', async route => {
        const method = route.request().method();
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, total: scheduleSessions.length, sessions: scheduleSessions })
          });
        } else if (method === 'POST') {
          postCount++;
          const body = JSON.parse(route.request().postData() || '{}');
          const newSession = {
            id: body.id || 'sess_new_saved',
            class_name: body.class_name,
            session_date: body.session_date,
            start_time: body.start_time,
            end_time: body.end_time,
            room_notes: body.room_notes || 'Phòng VIP 201',
            status: 'scheduled'
          };
          scheduleSessions.push(newSession);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, session: newSession })
          });
        } else {
          await route.continue();
        }
      });

      await page.goto(`${BASE_URL}/schedule`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Click top button "Thêm Buổi Học Mới"
      const topAddBtn = page.locator('button:has-text("Thêm Buổi Học Mới")');
      await topAddBtn.waitFor({ state: 'visible', timeout: 5000 });
      await topAddBtn.click();
      await page.waitForTimeout(400);

      // Assert modal is open
      const saveBtn = page.locator('button[data-testid="session-modal-save-btn"]');
      await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
      console.log(`  ✓ Modal opened from top button`);

      // Verify date autofill
      const dateInput = page.locator('input[type="date"]');
      const autofillDate = await dateInput.inputValue();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(autofillDate)) {
        throw new Error(`Expected date input to be autofilled with YYYY-MM-DD, got: "${autofillDate}"`);
      }
      console.log(`  ✓ Date autofilled automatically: ${autofillDate}`);
      testResults.push(`[${vp.name}] (b) Top button modal opens with date autofill (${autofillDate})`);

      // Fill in class name
      const classNameInput = page.locator('input[placeholder*="Lớp 7"]');
      await classNameInput.fill('Lớp 7 - E2E Success Class');

      const shotB1OpenPath = path.join(SCREENSHOT_DIR, `schedule_modal_top_btn_${vp.name}.png`);
      await page.screenshot({ path: shotB1OpenPath });
      capturedScreenshots.push(shotB1OpenPath);

      // Save
      await saveBtn.click();
      await saveBtn.waitFor({ state: 'hidden', timeout: 5000 });
      if (postCount !== 1) {
        throw new Error(`Expected POST to be called exactly once, called: ${postCount}`);
      }
      console.log(`  ✓ Modal closed once, POST called exactly once (postCount = 1)`);
      testResults.push(`[${vp.name}] (b) Successful POST updates once and closes modal once`);

      const shotB1ClosedPath = path.join(SCREENSHOT_DIR, `schedule_modal_closed_success_${vp.name}.png`);
      await page.screenshot({ path: shotB1ClosedPath });
      capturedScreenshots.push(shotB1ClosedPath);

      // ----------------------------------------------------------------------
      // TEST (B2): /schedule modal from calendar cell, 400 error keeps modal open + role=alert
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test B2: /schedule calendar cell modal + 400 rejection keeps modal open`);
      let errorResponse = { status: 400, body: { success: false, error: 'Định dạng ngày học không hợp lệ trên lịch Gregorian' } };

      await page.unroute('**/api/schedule*');
      await page.route('**/api/schedule*', async route => {
        const method = route.request().method();
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, total: scheduleSessions.length, sessions: scheduleSessions })
          });
        } else if (method === 'POST') {
          await route.fulfill({
            status: errorResponse.status,
            contentType: 'application/json',
            body: JSON.stringify(errorResponse.body)
          });
        } else {
          await route.continue();
        }
      });

      // Click calendar cell "＋ Thêm" button
      const cellAddBtn = page.locator('button[title*="Thêm buổi học ca"]').first();
      await cellAddBtn.scrollIntoViewIfNeeded();
      await cellAddBtn.click({ force: true });
      await page.waitForTimeout(400);

      await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
      const cellAutofillDate = await dateInput.inputValue();
      console.log(`  ✓ Modal opened from calendar cell with date: ${cellAutofillDate}`);

      await classNameInput.fill('Lớp Test 400 Error');
      await saveBtn.click();
      await page.waitForTimeout(500);

      // Modal must STAY OPEN
      const isStillOpen400 = await saveBtn.isVisible();
      if (!isStillOpen400) {
        throw new Error(`Modal closed unexpectedly on 400 error!`);
      }

      // Assert role=alert is visible and has message
      const alertLocator = page.locator('[role="alert"]').first();
      await alertLocator.waitFor({ state: 'visible', timeout: 3000 });
      const alert400Text = await alertLocator.innerText();
      if (!alert400Text.includes('Định dạng ngày học không hợp lệ')) {
        throw new Error(`Expected role="alert" with 400 message, got: ${alert400Text}`);
      }
      console.log(`  ✓ 400 error keeps modal open and displays role="alert": "${alert400Text.trim()}"`);
      testResults.push(`[${vp.name}] (b) Mocked 400 keeps modal open and renders role="alert"`);

      await alertLocator.scrollIntoViewIfNeeded();
      const shotB2400Path = path.join(SCREENSHOT_DIR, `schedule_modal_400_alert_${vp.name}.png`);
      await page.screenshot({ path: shotB2400Path });
      capturedScreenshots.push(shotB2400Path);

      // ----------------------------------------------------------------------
      // TEST (B3): /schedule modal 409 conflict keeps modal open + role=alert
      // ----------------------------------------------------------------------
      console.log(`[${vp.name}] Test B3: /schedule modal 409 conflict keeps modal open + role=alert`);
      errorResponse = { status: 409, body: { success: false, error: 'Trùng lịch phòng học với ca "Lớp 7 - KET" (18:00–19:30)' } };

      await saveBtn.click();
      await page.waitForTimeout(500);

      // Modal must STAY OPEN
      const isStillOpen409 = await saveBtn.isVisible();
      if (!isStillOpen409) {
        throw new Error(`Modal closed unexpectedly on 409 error!`);
      }

      await alertLocator.waitFor({ state: 'visible', timeout: 3000 });
      const alert409Text = await alertLocator.innerText();
      if (!alert409Text.includes('Trùng lịch')) {
        throw new Error(`Expected role="alert" with 409 message, got: ${alert409Text}`);
      }
      console.log(`  ✓ 409 error keeps modal open and displays role="alert": "${alert409Text.trim()}"`);
      testResults.push(`[${vp.name}] (b) Mocked 409 keeps modal open and renders role="alert"`);

      await alertLocator.scrollIntoViewIfNeeded();
      const shotB3409Path = path.join(SCREENSHOT_DIR, `schedule_modal_409_alert_${vp.name}.png`);
      await page.screenshot({ path: shotB3409Path });
      capturedScreenshots.push(shotB3409Path);

      // Close modal cleanly
      const cancelBtn = page.locator('button:has-text("Hủy")');
      await cancelBtn.click();
      await saveBtn.waitFor({ state: 'hidden', timeout: 5000 });

      await context.close();
    }

    console.log(`\n========================================`);
    console.log(`ALL REAL PLAYWRIGHT E2E BROWSER TESTS PASSED!`);
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

runTests().then(res => {
  console.log('E2E execution completed successfully.');
  process.exit(0);
}).catch(err => {
  console.error('E2E execution failed:', err);
  process.exit(1);
});
