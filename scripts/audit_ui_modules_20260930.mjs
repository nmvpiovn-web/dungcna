import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4173', dir = 'artifacts/audit-ui-20260930';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
let page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('dialog', d => d.accept());
const results = [];
async function step(id, fn) {
  if (process.env.AUDIT_STEPS && !process.env.AUDIT_STEPS.split(',').some(prefix => id.startsWith(prefix))) return;
  try { results.push({ id, outcome: 'completed', detail: await fn() }); }
  catch (e) { results.push({ id, outcome: 'failed', error: e.message }); }
  await page.screenshot({ path: `${dir}/${id}.png` }).catch(() => {});
  fs.writeFileSync(`${dir}/${process.env.AUDIT_STEPS ? 'modules-recheck' : 'modules'}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), migrations: ['0001', '0002', '0003'], results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
const go = path => page.goto(base + path, { waitUntil: 'networkidle' });
async function login(username) {
  await go('/'); await page.locator('#login-btn').click();
  await page.fill('#login-id', username); await page.fill('#login-pass', '123');
  await Promise.all([page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame() }), page.locator('button[form="login-form"]').click()]);
  await page.waitForLoadState('networkidle'); await page.locator('#user-profile-btn').waitFor();
}
await step('11-admin-login', async () => { await login('admin'); return { verified: true }; });
await step('12-api-schema-after-all-migrations', async () => {
  return await page.evaluate(async () => {
    const results = [];
    for (const path of ['/api/homework', '/api/teachers/workflows?type=all', '/api/teachers/payroll?billing_cycle=2026-09', '/api/evaluations', '/api/students', '/api/campuses', '/api/notifications']) {
      const r = await fetch(path, { headers: { authorization: 'Bearer ' + localStorage.getItem('tienganh_token') } });
      const data = await r.json(); results.push({ path, status: r.status, error: data.error, total: data.total });
    }
    return results;
  });
});
await step('13-schedule-ui-save-vs-server', async () => {
  await go('/schedule');
  await page.getByRole('button', { name: /Thêm Buổi Học Mới/ }).click();
  await page.getByPlaceholder('Ví dụ: Lớp 7 - Global Success & KET A2').fill('AUDIT_LOCAL_SESSION_0930');
  const posts = [];
  const listener = r => { if (r.method() === 'POST' && r.url().includes('/api/')) posts.push(new URL(r.url()).pathname); };
  page.on('request', listener);
  await page.getByRole('button', { name: /Lưu Buổi Học/ }).click();
  await page.waitForTimeout(400);
  page.off('request', listener);
  const uiVisible = (await page.locator('main').innerText()).includes('AUDIT_LOCAL_SESSION_0930');
  const server = await page.evaluate(async () => { const r = await fetch('/api/schedule'); const b = await r.json(); return { status: r.status, contains: b.sessions?.some(s => s.class_name === 'AUDIT_LOCAL_SESSION_0930') }; });
  return { uiVisible, apiPosts: posts, server };
});
await step('14-evaluation-ui-save-vs-server', async () => {
  await go('/evaluations');
  await page.getByRole('button', { name: 'Sửa', exact: true }).first().click();
  await page.getByPlaceholder('Nhận xét trực tiếp về phát âm, sự tương tác phản xạ và làm bài tập về nhà...').fill('AUDIT_LOCAL_FEEDBACK_0930');
  const posts = [];
  const listener = r => { if (r.method() === 'POST' && r.url().includes('/api/')) posts.push(new URL(r.url()).pathname); };
  page.on('request', listener);
  await page.getByRole('button', { name: /Lưu Đánh Giá/ }).click();
  await page.waitForTimeout(400); page.off('request', listener);
  return { apiPosts: posts, localSaved: await page.evaluate(() => (localStorage.getItem('tienganh_student_evals_v2') || '').includes('AUDIT_LOCAL_FEEDBACK_0930')), successMessage: (await page.locator('main').innerText()).includes('Đã lưu đánh giá') };
});
await step('15-logout-replay', async () => {
  const token = await page.evaluate(() => localStorage.getItem('tienganh_token'));
  await page.locator('#user-profile-btn').click(); await page.locator('#logout-btn').click();
  await page.locator('#login-btn').waitFor();
  const response = await context.request.get(base + '/api/auth/verify', { headers: { authorization: `Bearer ${token}` } });
  return { uiLoggedOut: await page.locator('#login-btn').isVisible(), oldTokenStatus: response.status(), oldTokenAuthenticated: (await response.json()).authenticated };
});
await step('16-student-cpanel-role', async () => {
  await login('hocsinh'); await go('/cpanel/student');
  const direct = await page.evaluate(async () => { const r = await fetch('/api/campuses', { headers: { authorization: 'Bearer ' + localStorage.getItem('tienganh_token') } }); return { status: r.status, body: await r.json() }; });
  const ownHeading = await page.locator('main h1').allTextContents();
  await go('/cpanel/teacher');
  return { ownHeading, campuses: direct, teacherPageHeading: await page.locator('main h1').allTextContents(), teacherButtons: (await page.locator('main button').allTextContents()).slice(0, 10) };
});
await step('17-parent-cpanel', async () => {
  await page.locator('#user-profile-btn').click(); await page.locator('#logout-btn').click(); await login('phuhuynh');
  await go('/cpanel/parent');
  const before = (await page.locator('main').last().innerText()).slice(0, 1600);
  await page.getByRole('button', { name: /Sổ Học Phí/ }).click();
  return { before, tuition: (await page.locator('main').last().innerText()).slice(-1600) };
});
await context.close();
context = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await context.newPage(); page.setDefaultTimeout(10000); page.on('dialog', d => d.accept());
await step('18-guest-exam-start', async () => {
  await go('/exam');
  await page.getByRole('button', { name: /Thi Thử Cho Khách Tự Do/ }).click();
  await page.fill('#cand-name-input', 'Audit Local Guest');
  await page.selectOption('#cand-grade-select', 'lop_7');
  await page.selectOption('#cand-curr-select', 'global_success');
  await page.getByRole('button', { name: /Bắt Đầu Làm Bài Ngay/ }).click();
  await page.waitForTimeout(1600);
  const first = await page.locator('#guest-modal-backdrop').innerText();
  await page.waitForTimeout(2100);
  const second = await page.locator('#guest-modal-backdrop').innerText();
  assert.ok(!await page.locator('#cand-name-input').isVisible(), 'guest start must leave setup form');
  return { first: first.slice(0, 1000), second: second.slice(0, 1000), changesOverTime: first !== second };
});
await step('19-recruitment-draft', async () => {
  await go('/recruitment'); await page.fill('#cand-name', 'Audit Local Applicant');
  return { value: await page.inputValue('#cand-name'), busy: await page.evaluate(() => window.__appBusyRegistry ? [...window.__appBusyRegistry] : null), invalidInputs: await page.locator('input:invalid').count() };
});
await step('20-registration-ui', async () => {
  await go('/'); await page.locator('#login-btn').click();
  await page.getByRole('button', { name: /Đăng Ký Mới/ }).click();
  await page.getByRole('button', { name: /Tôi Là Học Sinh/ }).click();
  await page.fill('#reg-username', 'auditui' + Date.now()); await page.fill('#reg-password', 'AuditLocal123!');
  await page.fill('#reg-fullname', 'Audit Local Student'); await page.fill('#reg-phone', '038' + String(Date.now()).slice(-7));
  await page.getByRole('button', { name: /Bước Tiếp Theo: Chọn Lớp Học/ }).click();
  await page.getByRole('button', { name: /Lớp 2/ }).first().click();
  await Promise.all([page.waitForEvent('framenavigated', { predicate: f => f === page.mainFrame() }), page.getByRole('button', { name: /Hoàn Tất & Vào Học/ }).click()]);
  await page.waitForLoadState('networkidle');
  await page.locator('#user-profile-btn').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  return { reloadLoggedIn: await page.locator('#user-profile-btn').isVisible() };
});
await browser.close();
