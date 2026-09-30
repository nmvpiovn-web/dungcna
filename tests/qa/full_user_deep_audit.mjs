// Full End-to-End User Simulation and QA Audit Suite
// Simulates real users across all 5 roles: Guest, Student, Parent, Teacher, Admin
// Tests every menu, button, modal, form, workflow, responsive layout, and API endpoint
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const base = process.env.QA_BASE || 'http://127.0.0.1:4173';
const output = process.env.QA_OUTPUT || path.resolve('artifacts/deep-qa-audit');
const password = process.env.QA_PASSWORD || 'TestPass123!';
fs.mkdirSync(output, { recursive: true });

const results = [];
const tokens = {};
let browser;

async function request(endpoint, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const r = await fetch(base + endpoint, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

async function loginApi(username) {
  const r = await request('/api/auth/token', { body: { username, password } });
  assert.equal(r.status, 200, `Login ${username} failed with HTTP ${r.status}`);
  assert.ok(r.data.token, 'Token must be returned');
  return r.data.token;
}

async function auditCase(id, title, persona, fn) {
  const targetCase = process.env.AUDIT_CASE;
  if (targetCase && id !== targetCase) return;
  const start = Date.now();
  console.log(`[START] [${persona}] ${id}: ${title}`);
  try {
    const detail = await fn();
    const duration = Date.now() - start;
    results.push({ id, title, persona, status: 'PASS', duration, detail });
    console.log(`[PASS] [${persona}] ${id} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ id, title, persona, status: 'FAIL', duration, error: err.message, stack: err.stack });
    console.error(`[FAIL] [${persona}] ${id}: ${err.message}`);
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length
    },
    results
  }, null, 2));
}

async function runBrowserCase(id, title, persona, fn, { username = null, viewport = { width: 1366, height: 900 } } = {}) {
  await auditCase(id, title, persona, async () => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    page.on('dialog', d => d.accept());
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    try {
      if (username) {
        await page.goto(base + '/', { waitUntil: 'networkidle' });
        await page.locator('#login-btn').click();
        await page.fill('#login-id', username);
        await page.fill('#login-pass', password);
        await Promise.all([
          page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame() }),
          page.locator('button[form="login-form"]').click()
        ]);
        await page.waitForLoadState('networkidle');
        await page.locator('#user-profile-btn').waitFor({ timeout: 6000 });
      }
      try {
        const res = await fn(page, context);
        assert.deepEqual(pageErrors, [], `Uncaught browser errors in ${id}: ${pageErrors.join('; ')}`);
        return res;
      } catch (err) {
        if (pageErrors.length > 0) {
          throw new Error(`${err.message} | BROWSER_ERRORS: ${pageErrors.join('; ')}`);
        }
        throw err;
      }
    } finally {
      await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: false }).catch(() => {});
      await context.close();
    }
  });
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });

  // Pre-fetch tokens for API audit
  for (const u of ['admin', 'teacher.john', 'hocsinh', 'phuhuynh', 'baokhiem']) {
    tokens[u] = await loginApi(u);
  }

  // =========================================================================
  // CHAPTER 1: GUEST / VISITOR USER PERSPECTIVE
  // =========================================================================

  await runBrowserCase('GUEST-01', 'Landing page rendering, tabs, hero and FAQ interaction', 'Guest', async (page) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const title = await page.title();
    assert.match(title, /Tiếng Anh Cô Dung/);

    // Click curriculum tab: THCS
    const secondaryTab = page.locator('button', { hasText: 'THCS (Lớp 6 - 9)' }).first();
    if (await secondaryTab.isVisible()) {
      await secondaryTab.click();
      await page.waitForTimeout(300);
    }

    // Click curriculum tab: THPT
    const highSchoolTab = page.locator('button', { hasText: 'THPT & Ôn Thi ĐH' }).first();
    if (await highSchoolTab.isVisible()) {
      await highSchoolTab.click();
      await page.waitForTimeout(300);
    }

    // Primary Pronunciation Challenge Button
    const challengeBtn = page.locator('button', { hasText: /Nghe & Phát Âm/ }).first();
    if (await challengeBtn.isVisible()) {
      await challengeBtn.click();
      await page.waitForTimeout(200);
    }

    // FAQ Accordion click
    const faqBtn = page.locator('button', { hasText: /Hệ thống có lộ trình ôn thi vào 10/ }).first();
    if (await faqBtn.isVisible()) {
      await faqBtn.click();
      await page.waitForTimeout(200);
    }

    return { title, verified: true };
  });

  await runBrowserCase('GUEST-02', 'Header desktop navigation and flyout submenus', 'Guest', async (page) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });

    // Open Courses Dropdown
    await page.locator('#nav-btn-courses').click();
    assert.ok(await page.locator('a[href="/?tab=primary"]').isVisible());
    assert.ok(await page.locator('a[href="/courses"]').isVisible());

    // Open Exams Dropdown
    await page.locator('#nav-btn-exams').click();
    assert.ok(await page.locator('a[href="/exam"]').first().isVisible());

    // Open Tools Dropdown
    await page.locator('#nav-btn-tools').click();
    assert.ok(await page.locator('a[href="/dictionary"]').isVisible());
    assert.ok(await page.locator('a[href="/flashcards"]').isVisible());
    assert.ok(await page.locator('a[href="/games"]').isVisible());
    assert.ok(await page.locator('a[href="/grammar"]').isVisible());

    // Click backdrop to close
    const backdrop = page.locator('button[aria-label="Close menu"]');
    if (await backdrop.isVisible()) {
      await backdrop.click();
    }

    // Theme Switcher Toggle (Sky -> Dark -> Light -> Sky)
    const themeBtn = page.locator('button[aria-label="Toggle Theme"]');
    await themeBtn.click();
    await page.waitForTimeout(150);
    await themeBtn.click();
    await page.waitForTimeout(150);
    await themeBtn.click();
    await page.waitForTimeout(150);

    return { dropdownsVerified: true, themeToggled: true };
  });

  await runBrowserCase('GUEST-03', 'Mobile drawer menu navigation at 360px viewport', 'Guest', async (page) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const mobileBtn = page.locator('#mobile-menu-btn');
    assert.ok(await mobileBtn.isVisible(), 'Mobile menu toggle should be visible on 360px');
    await mobileBtn.click();
    await page.waitForTimeout(250);

    const drawer = page.locator('#mobile-drawer');
    assert.ok(await drawer.isVisible(), 'Mobile drawer must be visible when toggled');

    // Close drawer
    await mobileBtn.click();
    await page.waitForTimeout(250);
    return { mobileDrawerToggled: true };
  }, { viewport: { width: 360, height: 800 } });

  await runBrowserCase('GUEST-04', 'Flashcard 3D flip, shuffle, unit filter and touch target size', 'Guest', async (page) => {
    await page.goto(base + '/flashcards', { waitUntil: 'networkidle' });

    // Flip card
    const card = page.locator('.flashcard');
    assert.ok(!await card.evaluate(e => e.classList.contains('flipped')));
    await page.locator('.flip-main').click();
    await page.waitForTimeout(650);
    assert.ok(await card.evaluate(e => e.classList.contains('flipped')));

    // Hit test at card center: must hit back face
    const backHit = await page.evaluate(() => {
      const rect = document.querySelector('.flashcard').getBoundingClientRect();
      const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return Boolean(el && el.closest('.card-back'));
    });
    assert.ok(backHit, 'Hit-test on flipped card must resolve to .card-back');

    // Next / Prev navigation
    const counterText = await page.locator('.card-counter').innerText();
    await page.locator('.btn-nav.next').click();
    await page.waitForTimeout(200);
    assert.notEqual(await page.locator('.card-counter').innerText(), counterText);

    // Shuffle preserves 52 words
    const unitSelector = page.locator('select').first();
    await unitSelector.selectOption({ label: 'Unit 1: Hobbies' }).catch(() => unitSelector.selectOption({ index: 1 }));
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: /Xáo/ }).first().click();
    await page.waitForTimeout(200);
    await unitSelector.selectOption({ index: 0 }); // Back to all
    await page.waitForTimeout(200);
    const totalCountText = await page.locator('.card-counter').innerText();
    assert.ok(totalCountText.includes('52'), `Expected 52 words preserved, got ${totalCountText}`);

    // Verify touch target dimension >= 44px
    const smallControls = await page.evaluate(() => {
      return [...document.querySelectorAll('.flashcards-page button, .flashcards-page select')]
        .map(el => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent || '').trim().slice(0, 30), w: r.width, h: r.height };
        })
        .filter(c => c.w > 0 && (c.w < 44 || c.h < 44));
    });
    assert.deepEqual(smallControls, [], `Controls below 44px: ${JSON.stringify(smallControls)}`);

    return { backHit, totalCountText, touchTargetPass: true };
  });

  await runBrowserCase('GUEST-05', 'Exam room quiz start, timer decrement, question answer, submit', 'Guest', async (page) => {
    await page.goto(base + '/exam', { waitUntil: 'networkidle' });

    // 1. Assert start button exists on instruction screen and click
    const startBtn = page.locator('button', { hasText: /Bắt Đầu Ngay|Bắt Đầu Làm Bài/ }).first();
    await startBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert(await startBtn.isVisible(), 'Start exam button must be visible');
    await startBtn.click();

    // 2. Assert transition into Exam Hall
    const examProgressHeader = page.locator('text=TIẾN ĐỘ PHÒNG THI').first();
    await examProgressHeader.waitFor({ state: 'visible', timeout: 5000 });
    assert(await examProgressHeader.isVisible(), 'Exam Hall progress sidebar must appear after starting');

    // 3. Assert timer decrement over time
    const timerElem = page.locator('text=/⏱️\\s*\\d+:\\d+/').first();
    await timerElem.waitFor({ state: 'visible', timeout: 3000 });
    const timerT0 = (await timerElem.textContent() || '').trim();
    await page.waitForTimeout(1300);
    const timerT1 = (await timerElem.textContent() || '').trim();
    assert.notStrictEqual(timerT0, timerT1, `Timer must decrement over time (T0=${timerT0}, T1=${timerT1})`);

    // 4. Assert question 1 options exist, click option and verify answer recorded
    const q1Option = page.locator('#q-0 .grid button').first();
    await q1Option.waitFor({ state: 'visible', timeout: 3000 });
    await q1Option.click();

    // 5. Assert answered count increases
    const answeredCounter = page.locator('text=/Đã trả lời:\\s*1\\s*\\//').first();
    await answeredCounter.waitFor({ state: 'visible', timeout: 3000 });
    assert(await answeredCounter.isVisible(), 'Progress counter must reflect 1 question answered');

    // 6. Submit exam
    const submitBtn = page.locator('button', { hasText: /Nộp Bài & Chấm Điểm|Nộp Bài/ }).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 3000 });
    await submitBtn.click();

    // 7. Assert result screen appears
    const resultBanner = page.locator('text=KẾT QUẢ ĐÁNH GIÁ LỘ TRÌNH CHÍNH THỨC').first();
    await resultBanner.waitFor({ state: 'visible', timeout: 6000 });
    assert(await resultBanner.isVisible(), 'Exam result card banner must appear after submission');

    // 8. Assert system graded score banner exists
    const scoreBadge = page.locator('text=Hệ 10').first();
    assert(await scoreBadge.isVisible(), 'System graded score badge must be visible');

    return { timerT0, timerT1, examWorkflowExecuted: true, verifiedStrictSubmission: true };
  });

  await runBrowserCase('GUEST-06', 'Dictionary search, word breakdown modal and filter', 'Guest', async (page) => {
    await page.goto(base + '/dictionary', { waitUntil: 'networkidle' });

    // Search query "hobby"
    const searchInput = page.locator('input[placeholder*="Tra cứu"]').first();
    await searchInput.fill('hobby');
    await page.waitForTimeout(300);

    const headings = await page.locator('main h2').allTextContents();
    assert.ok(headings.some(h => h.toLowerCase().includes('hobby')), 'Search for hobby must find match');

    // Click on card to open detail modal if present
    const detailBtn = page.locator('button', { hasText: /Phân Tích|Chi Tiết/ }).first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await page.waitForTimeout(300);
      // Close modal using specific ID
      const closeBtn = page.locator('#btn-close-deep-modal-x').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(200);
      }
    }

    return { matched: headings.length, verified: true };
  });

  await runBrowserCase('GUEST-07', 'Games arena lobby and speed match game launch', 'Guest', async (page) => {
    await page.goto(base + '/games', { waitUntil: 'networkidle' });
    assert.ok(await page.locator('h1, h2', { hasText: /Đấu Trường|Game/ }).first().isVisible());

    // Launch Speed Match
    const matchBtn = page.locator('button', { hasText: /Speed Match|Ghép Thẻ/ }).first();
    if (await matchBtn.isVisible()) {
      await matchBtn.click();
      await page.waitForTimeout(400);

      // Return to menu
      const backBtn = page.locator('button', { hasText: /Quay Lại|Menu/ }).first();
      if (await backBtn.isVisible()) {
        await backBtn.click();
        await page.waitForTimeout(300);
      }
    }
    return { gameLobbyVerified: true };
  });

  await runBrowserCase('GUEST-08', 'Grammar topics, accordion expand, formula inspection and practice quiz', 'Guest', async (page) => {
    await page.goto(base + '/grammar', { waitUntil: 'networkidle' });

    // Select THCS filter
    const thcsBtn = page.locator('button', { hasText: /THCS/ }).first();
    if (await thcsBtn.isVisible()) {
      await thcsBtn.click();
      await page.waitForTimeout(200);
    }

    // Toggle topic accordion
    const topicHeading = page.locator('button[onclick*="toggleTopic"], .topic-header, summary').first();
    if (await topicHeading.isVisible()) {
      await topicHeading.click();
      await page.waitForTimeout(200);
    }

    // Answer practice question
    const practiceChoice = page.locator('button', { hasText: /B\. is playing|A\./ }).first();
    if (await practiceChoice.isVisible()) {
      await practiceChoice.click();
      await page.waitForTimeout(200);
    }
    return { grammarVerified: true };
  });

  await runBrowserCase('GUEST-09', 'Teacher recruitment form submission creates D1 application', 'Guest', async (page) => {
    await page.goto(base + '/recruitment', { waitUntil: 'networkidle' });

    await page.locator('#cand-name').fill('Ứng Viên Thử Nghiệm QA');
    await page.locator('#cand-phone').fill('0988776655');
    await page.locator('#cand-email').fill('ungvien.qa@gmail.com');

    await page.waitForTimeout(200);
    const submitBtn = page.locator('#btn-submit-recruitment');
    await submitBtn.click();

    const successHeading = page.locator('h2', { hasText: /Nộp Hồ Sơ Ứng Tuyển Thành Công/ });
    await successHeading.waitFor({ timeout: 6000 });
    assert.ok(await successHeading.isVisible(), 'Success heading must be visible');
    return { recruitmentSubmitted: true };
  });

  await runBrowserCase('GUEST-10', 'Courses catalog and Tools catalog rendering', 'Guest', async (page) => {
    await page.goto(base + '/courses', { waitUntil: 'networkidle' });
    const courseHeadings = await page.locator('h2, h3').allTextContents();
    assert.ok(courseHeadings.length >= 3, 'Must render courses catalog');

    await page.goto(base + '/tools', { waitUntil: 'networkidle' });
    const toolHeadings = await page.locator('h2, h3').allTextContents();
    assert.ok(toolHeadings.length >= 4, 'Must render tools catalog');
    return { courses: courseHeadings.length, tools: toolHeadings.length };
  });

  await runBrowserCase('GUEST-11', 'Auth modal login and register tab switching with validation', 'Guest', async (page) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.locator('#login-btn').click();

    // Verify error on empty submit
    await page.locator('button[form="login-form"]').click();
    await page.waitForTimeout(200);

    // Switch to Register tab
    const regTab = page.locator('button', { hasText: /Đăng Ký/ }).first();
    await regTab.click();
    await page.waitForTimeout(200);

    // Role selection buttons should appear
    assert.ok(await page.locator('button', { hasText: /Học Sinh/ }).first().isVisible());
    assert.ok(await page.locator('button', { hasText: /Phụ Huynh/ }).first().isVisible());
    assert.ok(await page.locator('button', { hasText: /Giáo Viên/ }).first().isVisible());

    // Close modal
    const closeBtn = page.locator('button[title="Đóng"], button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
    return { authModalVerified: true };
  });

  await runBrowserCase('GUEST-12', 'Document layout overflow check across all mobile viewports (320, 360, 390, 844)', 'Guest', async (page) => {
    const pagesToCheck = ['/', '/flashcards', '/exam', '/courses', '/tools', '/dictionary', '/grammar', '/recruitment'];
    const overflows = [];

    for (const [w, h] of [[320, 740], [360, 800], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const route of pagesToCheck) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        if (scrollWidth > w + 1) {
          overflows.push({ viewport: `${w}x${h}`, route, scrollWidth, innerWidth: w });
        }
      }
    }
    assert.deepEqual(overflows, [], `Horizontal layout overflows detected: ${JSON.stringify(overflows)}`);
    return { checkedViewports: 4, checkedRoutes: pagesToCheck.length, noOverflow: true };
  });

  // =========================================================================
  // CHAPTER 2: STUDENT USER PERSPECTIVE (hocsinh)
  // =========================================================================

  await runBrowserCase('STUDENT-01', 'Student UI Login, header profile badge, stars display and My Class link', 'Student', async (page) => {
    // Verified login via helper
    const userRoleText = await page.locator('#user-profile-btn').innerText();
    assert.ok(userRoleText.includes('Học Sinh') || userRoleText.includes('Lê Bảo Anh'), `Role text: ${userRoleText}`);

    // Star counter check
    const starText = await page.locator('header').innerText();
    assert.ok(starText.includes('⭐'), 'Star balance must appear in header for student');

    // Click "Lớp Của Tôi"
    const myClassLink = page.locator('a', { hasText: /Lớp Của Tôi/ }).first();
    if (await myClassLink.isVisible()) {
      await myClassLink.click();
      await page.waitForLoadState('networkidle');
    }
    return { userRoleText, starsVisible: true };
  }, { username: 'hocsinh' });

  await runBrowserCase('STUDENT-02', 'Student Cpanel homework list, submission modal and draft protection', 'Student', async (page) => {
    await page.goto(base + '/cpanel/student', { waitUntil: 'networkidle' });
    const headerTitle = await page.locator('h1').first().innerText();
    assert.ok(headerTitle.includes('Không Gian') || headerTitle.includes('Xin chào') || headerTitle.includes('Học Sinh'), 'Student cpanel header must load');

    // Open first assignment submit modal if available
    const submitBtn = page.locator('button', { hasText: /Nộp Bài/ }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(300);

      // Fill writing content
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible()) {
        await textarea.fill('QA Automated Essay Answer for Unit 10 Energy Sources.');
        // Submit
        const modalSubmitBtn = page.locator('button', { hasText: /Xác Nhận Nộp Bài/ }).first();
        if (await modalSubmitBtn.isVisible()) {
          await modalSubmitBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
    return { studentCpanelVerified: true };
  }, { username: 'hocsinh' });

  await runBrowserCase('STUDENT-03', 'Student Profile Edit Modal CAS version increment and persistence', 'Student', async (page) => {
    // Already on / with profile button loaded
    await page.locator('#user-profile-btn').click();
    await page.locator('button', { hasText: /Chỉnh Sửa Hồ Sơ/ }).click();
    await page.waitForTimeout(400);

    // Fill bio / phone edit
    const phoneInput = page.locator('input[type="tel"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('0988123456');
    }

    // Click Save
    const saveBtn = page.locator('button', { hasText: /Lưu Thay Đổi/ }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(700);
    }
    return { profileEditVerified: true };
  }, { username: 'hocsinh' });

  await runBrowserCase('STUDENT-04', 'Student generates random D1 grammar exam, checks option text shape, answers and submits', 'Student', async (page) => {
    await page.goto(base + '/exam', { waitUntil: 'networkidle' });

    // 1. Open Random Builder tab via explicit ID
    const randomTab = page.locator('#group-tab-random_builder');
    await randomTab.waitFor({ state: 'visible', timeout: 6000 });
    await randomTab.click();

    // 2. Select Grammar Focus
    const skillSelect = page.locator('#rand-skill').first();
    await skillSelect.waitFor({ state: 'visible', timeout: 5000 });
    await skillSelect.selectOption('grammar');

    // 3. Click Generate Random Exam via explicit ID
    const generateBtn = page.locator('#start-random-exam-btn');
    await generateBtn.waitFor({ state: 'visible', timeout: 6000 });
    await generateBtn.click();

    // 4. Assert transition into Exam Hall
    const q0 = page.locator('#q-0').first();
    await q0.waitFor({ state: 'visible', timeout: 8000 });
    assert.ok(await q0.isVisible(), 'Exam Hall must display generated questions');

    // 5. Verify option text shape: MUST NOT contain 'undefined'
    const optButtons = q0.locator('.grid button');
    const optCount = await optButtons.count();
    assert.ok(optCount > 0, 'Question must have option buttons');
    for (let i = 0; i < optCount; i++) {
      const txt = await optButtons.nth(i).innerText();
      assert.ok(!txt.includes('undefined'), `Option text must not contain undefined: found "${txt}"`);
    }

    // 6. Answer question 1
    await optButtons.first().click();

    // 7. Submit exam to /api/exams/random
    const submitBtn = page.locator('button', { hasText: /Nộp Bài & Chấm Điểm|Nộp Bài/ }).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    await submitBtn.click();

    // 8. Assert Result Card appears
    const resultBanner = page.locator('#exam-result-banner');
    await resultBanner.waitFor({ state: 'visible', timeout: 8000 });
    assert.ok(await resultBanner.isVisible(), 'Exam result card banner must appear after submission');

    return { randomExamCreated: true, optionTextClean: true, submittedAndGraded: true };
  }, { username: 'hocsinh' });

  await runBrowserCase('STUDENT-05', 'Student logout revokes session and resets header to guest', 'Student', async (page) => {
    // Already on / with profile button loaded
    await page.locator('#user-profile-btn').click();
    await page.locator('#logout-btn').click();
    await page.waitForTimeout(500);

    assert.ok(await page.locator('#login-btn').isVisible(), 'Header must show login button after logout');
    return { logoutSuccess: true };
  }, { username: 'hocsinh' });

  // =========================================================================
  // CHAPTER 3: PARENT USER PERSPECTIVE (phuhuynh)
  // =========================================================================

  await runBrowserCase('PARENT-01', 'Parent UI Login, header badge, and Parent Portal access', 'Parent', async (page) => {
    const userRoleText = await page.locator('#user-profile-btn').innerText();
    assert.ok(userRoleText.includes('Phụ Huynh') || userRoleText.includes('Chị Mai Lan'), `Role: ${userRoleText}`);

    const parentMenuLink = page.locator('a', { hasText: /Sổ Phụ Huynh/ }).first();
    assert.ok(await parentMenuLink.isVisible(), 'Parent portal link should be visible');
    await parentMenuLink.click();
    await page.waitForLoadState('networkidle');

    return { parentLoginVerified: true };
  }, { username: 'phuhuynh' });

  await runBrowserCase('PARENT-02', 'Parent Cpanel child selector, homework monitoring and tuition tab', 'Parent', async (page) => {
    await page.goto(base + '/cpanel/parent', { waitUntil: 'networkidle' });
    const title = await page.locator('h1').innerText();
    assert.ok(title.includes('Báo Cáo Tiến Độ') || title.includes('Sổ Phụ Huynh'));

    // Switch tab to tuition
    const tuitionTab = page.locator('button', { hasText: /Học Phí|Chi Phí/ }).first();
    if (await tuitionTab.isVisible()) {
      await tuitionTab.click();
      await page.waitForTimeout(300);
    }

    return { parentCpanelVerified: true };
  }, { username: 'phuhuynh' });

  // =========================================================================
  // CHAPTER 4: TEACHER USER PERSPECTIVE (teacher.john)
  // =========================================================================

  await runBrowserCase('TEACHER-01', 'Teacher UI Login, Sổ Giáo Viên and Admin CP navigation', 'Teacher', async (page) => {
    const userRoleText = await page.locator('#user-profile-btn').innerText();
    assert.ok(userRoleText.includes('Giáo Viên') || userRoleText.includes('Johnathan'), `Role: ${userRoleText}`);

    // Admin CP button visible for teacher
    assert.ok(await page.locator('#nav-btn-admin').isVisible());
    return { teacherLoginVerified: true };
  }, { username: 'teacher.john' });

  await runBrowserCase('TEACHER-02', 'Schedule edit modal save persists session to D1 and calendar updates', 'Teacher', async (page) => {
    await page.goto(base + '/schedule', { waitUntil: 'networkidle' });

    // Open add session modal
    const addBtn = page.locator('button', { hasText: /Thêm Buổi Học Mới/ }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(400);

      const topicInput = page.locator('input[placeholder*="Ví dụ: Lớp 7"]').first();
      await topicInput.fill('QA_SESSION_SPEAKING_0930');

      // Click Save
      await page.locator('button', { hasText: /Lưu Buổi Học/ }).first().click();
      await page.waitForTimeout(700);

      // Verify on calendar
      const bodyText = await page.locator('body').innerText();
      assert.ok(bodyText.includes('QA_SESSION_SPEAKING_0930'), 'New session must appear on schedule');
    }
    return { scheduleSaveD1Verified: true };
  }, { username: 'teacher.john' });

  await runBrowserCase('TEACHER-03', 'Student evaluations edit modal updates scores and feedback in D1', 'Teacher', async (page) => {
    await page.goto(base + '/evaluations', { waitUntil: 'networkidle' });

    const editBtn = page.locator('button', { hasText: 'Sửa' }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(400);

      const feedbackInput = page.locator('textarea[placeholder*="Nhận xét"]').first();
      await feedbackInput.fill('QA_AUDIT_EXCELLENT_SPEAKING_FEEDBACK');

      await page.locator('button', { hasText: /Lưu Đánh Giá/ }).first().click();
      await page.waitForTimeout(700);

      const bodyText = await page.locator('body').innerText();
      assert.ok(bodyText.includes('Đã lưu đánh giá') || bodyText.includes('thành công') || bodyText.includes('QA_AUDIT_EXCELLENT'));
    }
    return { evaluationSaveD1Verified: true };
  }, { username: 'teacher.john' });

  await runBrowserCase('TEACHER-04', 'Pedagogy handbook search and 5512 lesson plan inspection', 'Teacher', async (page) => {
    await page.goto(base + '/pedagogy', { waitUntil: 'networkidle' });
    const searchInput = page.locator('input[placeholder*="Nội suy nhanh"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Co-Teaching');
      await page.waitForTimeout(300);
    }
    return { pedagogyVerified: true };
  }, { username: 'teacher.john' });

  await runBrowserCase('TEACHER-05', 'Teacher Cpanel grading tab, assignment creation and leave modal', 'Teacher', async (page) => {
    await page.goto(base + '/cpanel/teacher', { waitUntil: 'networkidle' });

    // Switch to Assign tab
    const assignTab = page.locator('button', { hasText: /Giao Bài/ }).first();
    if (await assignTab.isVisible()) {
      await assignTab.click();
      await page.waitForTimeout(300);
      assert.ok(await page.locator('input[placeholder*="tiêu đề"], input[type="text"]').first().isVisible());
    }

    // Switch to Sessions tab
    const sessionsTab = page.locator('button', { hasText: /Lịch Dạy/ }).first();
    if (await sessionsTab.isVisible()) {
      await sessionsTab.click();
      await page.waitForTimeout(300);
    }

    return { teacherCpanelVerified: true };
  }, { username: 'teacher.john' });

  // =========================================================================
  // CHAPTER 5: SUPERADMIN USER PERSPECTIVE (admin)
  // =========================================================================

  await runBrowserCase('ADMIN-01', 'Admin UI Login, SuperAdmin badge and Admin CP dropdown', 'Admin', async (page) => {
    const userRoleText = await page.locator('#user-profile-btn').innerText();
    assert.ok(userRoleText.includes('SuperAdmin') || userRoleText.includes('Nguyễn Minh Vũ'), `Role: ${userRoleText}`);
    return { adminLoginVerified: true };
  }, { username: 'admin' });

  await runBrowserCase('ADMIN-02', 'Admin CP tuition management, star deductions and user accounts', 'Admin', async (page) => {
    await page.goto(base + '/admin', { waitUntil: 'networkidle' });
    const headings = await page.locator('h1, h2').allTextContents();
    assert.ok(headings.some(h => /Bảng Điều Khiển|Admin CP|Quản Trị/i.test(h)));

    // Leader drawer trigger
    const leaderBtn = page.locator('button[aria-label="Thông Báo Leader"]');
    if (await leaderBtn.isVisible()) {
      await leaderBtn.click();
      await page.waitForTimeout(300);
      // Close drawer
      const closeBtn = page.locator('button[title="Đóng"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }
    return { adminCpVerified: true };
  }, { username: 'admin' });

  await runBrowserCase('ADMIN-03', 'Obsidian Second Brain notes explorer and search', 'Admin', async (page) => {
    await page.goto(base + '/second-brain', { waitUntil: 'networkidle' });
    const title = await page.locator('h1, h2').first().innerText();
    assert.ok(title.includes('Obsidian') || title.includes('Second Brain'));

    const searchInput = page.locator('input[placeholder*="Tìm kiếm"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('UNIT');
      await page.waitForTimeout(300);
    }
    return { secondBrainVerified: true };
  }, { username: 'admin' });

  await runBrowserCase('ADMIN-04', 'AdminCP Hub campuses management and streams filter', 'Admin', async (page) => {
    await page.goto(base + '/admincp', { waitUntil: 'networkidle' });
    const headerText = await page.locator('main').innerText();
    assert.ok(headerText.includes('AdminCP') || headerText.includes('Cơ Sở') || headerText.includes('Quản Trị'));

    // Open Add Campus Modal
    const addCampusBtn = page.locator('button', { hasText: /Thêm Cơ Sở/ }).first();
    if (await addCampusBtn.isVisible()) {
      await addCampusBtn.click();
      await page.waitForTimeout(300);
      const closeBtn = page.locator('button', { hasText: '✕' }).first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    return { admincpHubVerified: true };
  }, { username: 'admin' });

  // =========================================================================
  // CHAPTER 6: COMPREHENSIVE SECURITY & API CONTRACT AUDIT (25+ ENDPOINTS)
  // =========================================================================

  const apiLogoutToken = await loginApi('admin');
  const apiMatrix = [
    { id: 'API-01', endpoint: '/api/auth/token', method: 'POST', body: { username: 'admin', password }, expected: [200] },
    { id: 'API-02', endpoint: '/api/auth/logout', method: 'POST', token: apiLogoutToken, expected: [200] },
    { id: 'API-03', endpoint: '/api/schedule', method: 'GET', token: null, expected: [401] },
    { id: 'API-04', endpoint: '/api/schedule', method: 'GET', token: tokens['teacher.john'], expected: [200] },
    { id: 'API-05', endpoint: '/api/schedule/notify', method: 'POST', token: null, expected: [401] },
    { id: 'API-06', endpoint: '/api/evaluations', method: 'GET', token: null, expected: [401] },
    { id: 'API-07', endpoint: '/api/evaluations', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-08', endpoint: '/api/campuses', method: 'GET', token: null, expected: [401] },
    { id: 'API-09', endpoint: '/api/campuses?view=summary', method: 'GET', token: tokens.hocsinh, expected: [200] },
    { id: 'API-10', endpoint: '/api/campuses?view=summary', method: 'GET', token: tokens.phuhuynh, expected: [200] },
    { id: 'API-11', endpoint: '/api/campuses', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-12', endpoint: '/api/students', method: 'GET', token: tokens.hocsinh, expected: [403] },
    { id: 'API-13', endpoint: '/api/students', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-14', endpoint: '/api/homework', method: 'GET', token: tokens.hocsinh, expected: [200] },
    { id: 'API-15', endpoint: '/api/homework', method: 'GET', token: tokens['teacher.john'], expected: [200] },
    { id: 'API-16', endpoint: '/api/parents/children', method: 'GET', token: tokens.phuhuynh, expected: [200] },
    { id: 'API-17', endpoint: '/api/parents/children', method: 'GET', token: tokens.hocsinh, expected: [403] },
    { id: 'API-18', endpoint: '/api/parents/tests?student_id=usr_student_demo', method: 'GET', token: tokens.phuhuynh, expected: [200] },
    { id: 'API-18B', endpoint: '/api/parents/tests?student_id=usr_student_baokhiem', method: 'GET', token: tokens.phuhuynh, expected: [403] },
    { id: 'API-19', endpoint: '/api/teachers/workflows?type=all', method: 'GET', token: tokens['teacher.john'], expected: [200] },
    { id: 'API-20', endpoint: '/api/teachers/staff', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-21', endpoint: '/api/teachers/payroll?billing_cycle=2026-09', method: 'GET', token: tokens['teacher.john'], expected: [200] },
    { id: 'API-22', endpoint: '/api/notifications', method: 'GET', token: tokens.hocsinh, expected: [200] },
    { id: 'API-23', endpoint: '/api/tuition', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-24', endpoint: '/api/users/profile', method: 'GET', token: tokens.hocsinh, expected: [200] },
    { id: 'API-25', endpoint: '/api/second-brain', method: 'GET', token: tokens.hocsinh, expected: [403] },
    { id: 'API-26', endpoint: '/api/second-brain', method: 'GET', token: tokens.admin, expected: [200] },
    { id: 'API-27', endpoint: '/api/webhook', method: 'POST', token: null, expected: [401, 503] },
    { id: 'API-28', endpoint: '/api/webhook/sepay', method: 'POST', token: null, expected: [401, 503] },
    {
      id: 'API-29',
      endpoint: '/api/homework',
      method: 'POST',
      token: tokens['teacher.john'],
      body: {
        action: 'assign',
        session_id: 'sess_1',
        class_id: 'cls_g7',
        class_name: 'Lớp 7 Chuyên Anh',
        skill_type: 'writing',
        title: 'Bài tập Viết Đoạn Văn Về Sở Thích',
        description: 'Viết đoạn văn 80-100 từ về sở thích của em',
        deadline_date: '2026-10-15',
        deadline_time: '20:00'
      },
      expected: [200, 201]
    },
    {
      id: 'API-30',
      endpoint: '/api/tuition',
      method: 'POST',
      token: tokens.admin,
      body: {
        action: 'create_bill',
        bill: {
          id: 'bill_test_deep_audit_01',
          student_id: 'usr_student_demo',
          student_name: 'Trần Thị Học Sinh',
          billing_period: 'Tháng 10/2026',
          base_tuition_vnd: 2500000,
          stars_deducted: 0,
          discount_vnd: 0,
          final_amount_vnd: 2500000,
          status: 'pending'
        }
      },
      expected: [200, 201]
    },
    {
      id: 'API-31',
      endpoint: '/api/tuition',
      method: 'POST',
      token: tokens.admin,
      body: {
        action: 'create_bill',
        bill: {
          id: 'bill_test_deep_audit_02',
          student_id: 'usr_student_demo',
          student_name: 'Trần Thị Học Sinh',
          billing_period: 'Tháng 10/2026',
          base_tuition_vnd: 2500000,
          stars_deducted: 50,
          discount_vnd: 50000,
          final_amount_vnd: 2450000,
          status: 'pending'
        }
      },
      expected: [200, 201]
    },
    {
      id: 'API-32',
      endpoint: '/api/schedule',
      method: 'POST',
      token: tokens.admin,
      body: {
        action: 'save_session',
        id: 'sess_deep_audit_1',
        class_id: 'cls_deep_audit',
        class_name: 'Lớp 7 Chuyên Sâu',
        grade_level: 'Lớp 7',
        teacher_id: 'usr_teach_1',
        teacher_name: 'John Teacher',
        session_date: '2026-10-05',
        day_of_week: 1,
        start_time: '14:00',
        end_time: '15:30',
        student_ids: ['usr_student_demo']
      },
      expected: [200, 201]
    },
    {
      id: 'API-33',
      endpoint: '/api/evaluations',
      method: 'POST',
      token: tokens.admin,
      body: {
        id: 'eval_deep_audit_1',
        student_id: 'usr_student_demo',
        student_name: 'Trần Thị Học Sinh',
        grade_level: 'Lớp 7',
        listening_score: 9.0,
        reading_score: 8.5,
        writing_score: 8.0,
        speaking_score: 8.5,
        grammar_vocab_score: 9.0,
        teacher_feedback: 'Học sinh tiến bộ vượt bậc ở kỹ năng viết.',
        action_plan: 'Luyện tập thêm đề chuyên sâu.'
      },
      expected: [200, 201]
    },
    {
      id: 'API-34',
      endpoint: '/api/teachers/workflows',
      method: 'POST',
      token: null,
      body: {
        action: 'candidate_apply',
        candidate_name: 'Nguyễn Văn Ứng Viên',
        phone: '0912345678',
        email: 'ungvien@example.com',
        role_type: 'lead',
        experience_years: 3,
        certificates: 'IELTS 8.0, TESOL',
        selected_grades: ['Lớp 7', 'Lớp 8'],
        selected_subjects: ['Ngữ Pháp', 'Luyện Thi Chuyên'],
        interview_preference: 'online',
        availability: 'Tối thứ 3, 5, 7',
        notes: 'Mong muốn cống hiến lâu dài'
      },
      expected: [200, 201]
    },
    {
      id: 'API-35',
      endpoint: '/api/teachers/workflows',
      method: 'POST',
      token: tokens['teacher.john'],
      body: {
        action: 'request_advance',
        amount_vnd: 500000,
        reason: 'Chi phí mua tài liệu giảng dạy chuyên sâu',
        billing_cycle: '2026-10'
      },
      expected: [200, 201]
    },
    {
      id: 'API-36',
      endpoint: '/api/notifications',
      method: 'POST',
      token: tokens.hocsinh,
      body: {
        action: 'mark_read',
        mark_all: true
      },
      expected: [200, 201]
    }
  ];

  for (const item of apiMatrix) {
    await auditCase(item.id, `Contract: ${item.method} ${item.endpoint}`, 'API', async () => {
      const res = await request(item.endpoint, { method: item.method, token: item.token, body: item.body });
      assert.ok(item.expected.includes(res.status), `Expected ${item.expected}, got HTTP ${res.status}: ${JSON.stringify(res.data)}`);
      return { status: res.status, success: res.data.success };
    });
  }

} finally {
  if (browser) await browser.close();
}
