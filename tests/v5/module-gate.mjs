// Failures here are release blockers, not expected-success reproductions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const base = process.env.V5_GATE_BASE, output = process.env.V5_GATE_OUTPUT;
assert.match(base || '', /^http:\/\/127\.0\.0\.1:\d+$/, 'Use the isolated local runner');
assert.ok(output && process.env.V5_GATE_PASSWORD, 'Run node scripts/run_v5_module_gate.mjs');
const results = [], tokens = {};
let browser;
async function request(endpoint, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const r = await fetch(base + endpoint, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let data; try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}
async function login(username) {
  const r = await request('/api/auth/token', { body: { username, password: process.env.V5_GATE_PASSWORD } });
  assert.equal(r.status, 200, `Fixture login ${username}: HTTP ${r.status}`);
  assert.ok(r.data.token, 'Login must return token');
  return r.data.token;
}
async function gate(id, title, fn) {
  try { await fn(); results.push({ id, title, status: 'PASS' }); }
  catch (e) { results.push({ id, title, status: 'FAIL', message: e.message }); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, summary: { total: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length } }, null, 2));
  console.log(`${results.at(-1).status} ${id} ${title}`);
}
async function ui(id, title, fn, username = null, viewport = { width: 1366, height: 900 }) {
  await gate(id, title, async () => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    page.on('dialog', d => d.accept());
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
    try {
      if (username) {
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.locator('#login-btn').click();
        await page.fill('#login-id', username); await page.fill('#login-pass', process.env.V5_GATE_PASSWORD);
        await Promise.all([page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame() }), page.locator('button[form="login-form"]').click()]);
        await page.waitForLoadState('networkidle'); await page.locator('#user-profile-btn').waitFor();
      }
      await fn(page, context);
      assert.deepEqual(pageErrors, [], 'Uncaught browser errors');
    } finally {
      await page.screenshot({ path: path.join(output, id + '.png'), fullPage: true }).catch(() => {});
      await context.close();
    }
  });
}
const go = (page, route) => page.goto(base + route, { waitUntil: 'networkidle' });
const marker = prefix => prefix + crypto.randomUUID().slice(0, 8);
const success = r => { assert.ok(r.status === 200 || r.status === 201, `HTTP ${r.status}: ${r.data.error || 'request failed'}`); assert.equal(r.data.success, true); };
try {
  for (const user of ['admin', 'teacher.john', 'hocsinh', 'phuhuynh']) tokens[user] = await login(user);
  // G3 uses the real migration chain and actual HTTP handlers, no schema fixtures.
  for (const [suffix, endpoint, user] of [['students', '/api/students', 'admin'], ['homework', '/api/homework', 'teacher.john'], ['workflows', '/api/teachers/workflows?type=all', 'teacher.john'], ['evaluations', '/api/evaluations', 'admin'], ['parent-links', '/api/parents/children', 'phuhuynh']]) {
    await gate('G3-' + suffix, 'Fresh migrations support ' + endpoint, async () => success(await request(endpoint, { token: tokens[user] })));
  }
  await gate('G1-schedule-auth', 'Anonymous schedule reads rejected', async () => assert.equal((await request('/api/schedule')).status, 401));
  await gate('G1-notify-auth', 'Anonymous schedule notify rejected', async () => assert.equal((await request('/api/schedule/notify', { body: { session_id: 'sess_1' } })).status, 401));
  await gate('G1-schedule-api', 'Schedule POST survives a new authenticated reader', async () => {
    const name = marker('gate-session-');
    const write = await request('/api/schedule', { token: tokens.admin, body: { action: 'save_session', class_id: 'gate-class', class_name: name, grade_level: 'Lớp 7', teacher_id: 'usr_teach_1', teacher_name: 'Gate Teacher', session_date: '2026-10-01', day_of_week: 4, start_time: '10:00', end_time: '11:00', student_ids: ['usr_student_demo'] } });
    success(write);
    const read = await request('/api/schedule', { token: await login('admin') }); success(read);
    assert.ok(read.data.sessions?.some(s => s.class_name === name), 'Schedule returned success but a new reader cannot find the saved session');
  });
  await gate('G1-evaluation-upsert', 'Evaluation update persists changed feedback, not only score', async () => {
    const id = marker('gate-eval-');
    const body = { id, student_id: 'usr_student_demo', student_name: 'Gate Student', grade_level: 'Lớp 7', listening_score: 8, reading_score: 7, writing_score: 6, speaking_score: 8, grammar_vocab_score: 7, teacher_feedback: 'before', action_plan: 'before plan' };
    success(await request('/api/evaluations', { token: tokens.admin, body }));
    success(await request('/api/evaluations', { token: tokens.admin, body: { ...body, teacher_feedback: 'after', action_plan: 'after plan' } }));
    const read = await request('/api/evaluations?student_id=usr_student_demo', { token: await login('admin') }); success(read);
    const row = read.data.evaluations?.find(e => e.id === id);
    assert.equal(row?.teacher_feedback, 'after'); assert.equal(row?.action_plan, 'after plan');
  });
  await gate('G6-campus-anonymous', 'Campus data stays protected for guests', async () => assert.equal((await request('/api/campuses')).status, 401));
  // Proposed minimal read contract: authenticated users can get campus labels, never streams/contact/manager fields.
  for (const user of ['hocsinh', 'phuhuynh']) await gate('G6-campus-summary-' + user, 'Scoped campus labels for ' + user, async () => {
    const read = await request('/api/campuses?view=summary', { token: tokens[user] }); success(read);
    assert.ok(Array.isArray(read.data.campuses));
    assert.ok(!read.data.streams?.length, 'Summary must not expose activity streams');
    for (const campus of read.data.campuses) assert.deepEqual(Object.keys(campus).filter(k => !['id', 'name', 'short_code'].includes(k)), [], 'Summary exposes non-label fields');
  });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await ui('G2-logout', 'UI logout revokes current token while another login remains valid', async page => {
    const tokenA = await page.evaluate(() => localStorage.getItem('tienganh_token'));
    const tokenB = await login('admin');
    await page.locator('#user-profile-btn').click(); await page.locator('#logout-btn').click();
    await page.locator('#login-btn').waitFor();
    const old = await request('/api/auth/verify', { token: tokenA });
    assert.equal(old.status, 401, 'Logged-out token still authorizes requests');
    assert.equal((await request('/api/auth/verify', { token: tokenB })).status, 200, 'Single-device logout revoked another session');
  }, 'admin');
  for (const kind of ['schedule', 'evaluations']) {
    const schedule = kind === 'schedule';
    const openForm = async page => {
      await go(page, '/' + kind);
      await page.getByRole('button', { name: schedule ? /Thêm Buổi Học Mới/ : /Tạo Đánh Giá Năng Lực Mới/ }).click();
      return schedule ? page.getByPlaceholder('Ví dụ: Lớp 7 - Global Success & KET A2') : page.getByPlaceholder('Nhận xét trực tiếp về phát âm, sự tương tác phản xạ và làm bài tập về nhà...');
    };
    const saveButton = page => page.getByRole('button', { name: schedule ? /Lưu Buổi Học/ : /Lưu Đánh Giá/ });
    await ui('G1-ui-' + kind, 'UI ' + kind + ' sends server write and is visible in a fresh context', async (page) => {
      const draft = marker('UI_GATE_'), input = await openForm(page); await input.fill(draft);
      const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/' + kind && ['POST', 'PATCH', 'PUT'].includes(r.request().method()), { timeout: 4000 }).catch(() => null);
      await saveButton(page).click();
      const response = await responsePromise; assert.ok(response, 'Save performed no API write');
      assert.ok(response.ok(), 'API write failed with HTTP ' + response.status());
      const read = await request('/api/' + kind, { token: await login('admin') }); success(read);
      assert.ok(JSON.stringify(schedule ? read.data.sessions : read.data.evaluations).includes(draft), 'Server read does not contain UI draft');
      const other = await browser.newContext();
      try {
        const p = await other.newPage(); await p.goto(base, { waitUntil: 'networkidle' });
        // Authenticate through the public UI contract so the fresh context has
        // the same persisted user + token state as a real returning browser.
        await p.locator('#login-btn').click();
        await p.fill('#login-id', 'admin');
        await p.fill('#login-pass', process.env.V5_GATE_PASSWORD);
        await Promise.all([
          p.waitForEvent('framenavigated', { predicate: f => f === p.mainFrame() }),
          p.locator('button[form="login-form"]').click()
        ]);
        await p.waitForLoadState('networkidle');
        const freshReadPromise = p.waitForResponse(r => new URL(r.url()).pathname === '/api/' + kind && r.request().method() === 'GET');
        await go(p, '/' + kind);
        const freshRead = await freshReadPromise;
        assert.ok(freshRead.ok(), 'Fresh browser API read failed with HTTP ' + freshRead.status());
        const freshPayload = await freshRead.json();
        assert.ok(JSON.stringify(schedule ? freshPayload.sessions : freshPayload.evaluations).includes(draft), 'Fresh browser API payload omits saved server state');
        await p.getByText(draft, { exact: false }).first().waitFor({ state: 'visible' });
      } finally { await other.close(); }
    }, 'admin');
    await ui('G1-ui-' + kind + '-503', 'Failed ' + kind + ' save keeps draft and editor open', async page => {
      const input = await openForm(page), draft = marker('UNSAVED_'); await input.fill(draft);
      let writes = 0;
      await page.route('**/api/' + kind, async route => {
        if (['POST', 'PATCH', 'PUT'].includes(route.request().method())) { writes++; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Gate injected D1 failure' }) }); }
        else await route.continue();
      });
      await saveButton(page).click(); await page.waitForTimeout(400);
      assert.ok(writes > 0, 'Save bypassed server even with a failed API contract');
      assert.ok(await input.isVisible(), 'Editor closed after failed save'); assert.equal(await input.inputValue(), draft);
      assert.ok(!(await page.locator('main').last().innerText()).includes('Đã lưu đánh giá'), 'False success shown on failed write');
    }, 'admin');
  }
  await ui('G4-flip', 'Flip changes the physically presented face, not just a class', async page => {
    await go(page, '/flashcards');
    // Mở popup học trước (UI mới: nút lật nằm trong popup)
    await page.locator('.btn-start-study').first().click();
    await page.waitForSelector('.fc-popup-overlay', { timeout: 5000 });
    // Popup có chuyển động trang trí liên tục; dispatch click trực tiếp để tránh
    // Playwright chờ một vị trí "stable" vốn không tồn tại.
    await page.locator('.flip-main').evaluate((button) => button.click()); await page.waitForTimeout(700);
    await page.locator('.flashcard').evaluate(e => e.scrollIntoView({ block: 'center' }));
    const presented = await page.evaluate(() => {
      const card = document.querySelector('.flashcard'), r = card.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { backAtCenter: !!hit?.closest('.card-back'), frontY: document.querySelector('.card-front').getBoundingClientRect().y, backY: document.querySelector('.card-back').getBoundingClientRect().y };
    });
    assert.ok(presented.backAtCenter, 'Back face not presented at card center: ' + JSON.stringify(presented));
  });
  await ui('G5-shuffle', 'Shuffle of a filtered unit preserves the complete word pool', async page => {
    await go(page, '/flashcards');
    // Mở popup để thấy card-counter (UI mới)
    await page.locator('.btn-start-study').first().click();
    await page.waitForSelector('.fc-popup-overlay', { timeout: 5000 });
    const before = await page.locator('.fc-counter').innerText();
    await page.locator('.fc-close').click();
    await page.selectOption('#unit-select', 'unit1'); await page.getByTitle('Xáo trộn ngẫu nhiên').click();
    await page.selectOption('#unit-select', 'all');
    await page.locator('.btn-start-study').first().click();
    await page.waitForSelector('.fc-popup-overlay', { timeout: 5000 });
    assert.equal(await page.locator('.fc-counter').innerText(), before, 'Filtered shuffle discarded words outside Unit 1');
  });
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [844, 390]]) {
    await ui('G6-layout-' + width, 'No document overflow at ' + width + 'px', async page => {
      const violations = [];
      for (const route of ['/', '/flashcards', '/exam']) {
        await go(page, route);
        const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        if (size.scroll > size.width + 1) violations.push({ route, ...size });
      }
      assert.deepEqual(violations, [], 'Horizontal overflow: ' + JSON.stringify(violations));
    }, null, { width, height });
  }
  await ui('G6-touch', 'Flashcard controls meet the handoff 44px target', async page => {
    await go(page, '/flashcards');
    const small = await page.locator('.flashcards-page button,.flashcards-page select').evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 28), width: r.width, height: r.height }; }).filter(r => r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5)));
    assert.deepEqual(small, [], 'Undersized touch targets: ' + JSON.stringify(small));
  }, null, { width: 360, height: 800 });
} catch (e) {
  await gate('HARNESS', 'Required fixture/browser setup', async () => { throw e; });
} finally {
  await browser?.close();
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
}
