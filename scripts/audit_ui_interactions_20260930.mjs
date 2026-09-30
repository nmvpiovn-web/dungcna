import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = 'artifacts/audit-ui-20260930';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('dialog', d => d.dismiss());
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
const go = route => page.goto('http://127.0.0.1:4173' + route, { waitUntil: 'networkidle' });
async function step(id, fn) {
  const start = errors.length;
  try { const detail = await fn(); results.push({ id, outcome: 'completed', detail, errors: errors.slice(start) }); }
  catch (e) { results.push({ id, outcome: 'failed', error: e.message, errors: errors.slice(start) }); }
  await page.screenshot({ path: `${dir}/${id}.png` }).catch(() => {});
  fs.writeFileSync(`${dir}/interactions.json`, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
await step('01-dictionary-search', async () => {
  await go('/dictionary');
  const search = page.locator('main input').first();
  await search.fill('hobby');
  await page.waitForTimeout(250);
  const words = await page.locator('main h2').allTextContents();
  assert.ok(words.some(w => w === 'hobby'));
  await search.fill('zzzz_no_match_123');
  assert.equal(await page.locator('main h2').count(), 0);
  return { matched: words, noMatchCount: 0 };
});
await step('02-grammar-answer', async () => {
  await go('/grammar');
  await page.getByRole('button', { name: 'B. is playing', exact: true }).click();
  return { feedback: (await page.locator('main').innerText()).slice(0, 2200) };
});
await step('03-flashcard-basic', async () => {
  await go('/flashcards');
  const counter = () => page.locator('.card-counter').innerText();
  const before = await counter();
  await page.locator('.flip-main').click();
  assert.ok(await page.locator('.flashcard').evaluate(e => e.classList.contains('flipped')));
  await page.locator('.btn-nav.next').click();
  assert.notEqual(await counter(), before);
  await page.locator('.btn-nav.prev').click();
  assert.equal(await counter(), before);
  for (let i = 0; i < 6; i++) await page.locator('.flip-main').click();
  return { before, after: await counter(), rapidFlips: 6 };
});
await step('04-flashcard-mobile', async () => {
  const measurements = [];
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    if (!await page.locator('.flashcard').evaluate(e => e.classList.contains('flipped'))) await page.locator('.flip-main').click();
    await page.waitForTimeout(650);
    measurements.push(await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth, faces: [...document.querySelectorAll('.card-face')].map(e => ({ class: e.className, height: e.clientHeight, scrollHeight: e.scrollHeight, width: e.clientWidth, scrollWidth: e.scrollWidth })), smallControls: [...document.querySelectorAll('.flashcards-page button,.flashcards-page select')].map(e => ({ text: (e.textContent || '').trim().slice(0, 35), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })).filter(e => e.w > 0 && (e.w < 44 || e.h < 44)) })));
    await page.screenshot({ path: `${dir}/flashcard-back-${width}x${height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  return measurements;
});
await step('05-flashcard-shuffle-unit', async () => {
  await go('/flashcards');
  const totalBefore = await page.locator('.card-counter').innerText();
  const values = ['unit1', 'unit2'];
  await page.selectOption('#unit-select', values[0]);
  const filtered = await page.locator('.card-counter').innerText();
  await page.getByTitle('Xáo trộn ngẫu nhiên').click();
  await page.selectOption('#unit-select', 'all');
  const totalAfter = await page.locator('.card-counter').innerText();
  await page.selectOption('#unit-select', values[1]);
  return { totalBefore, filtered, totalAfter, otherUnitEmpty: await page.locator('.empty-state').count() > 0, defect: totalBefore !== totalAfter };
});
await step('06-flashcard-mark-reload', async () => {
  await go('/flashcards');
  await page.locator('.btn-action.mastered').click();
  await page.selectOption('#filter-status', 'mastered');
  const beforeReload = await page.locator('.card-counter').textContent().catch(() => null);
  await page.reload({ waitUntil: 'networkidle' });
  await page.selectOption('#filter-status', 'mastered');
  return { beforeReload, afterReload: await page.locator('.card-counter').textContent().catch(() => null), storageCount: await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tienganh7_user_progress') || '{}')).length) };
});
await step('07-flashcard-autoplay-cleanup', async () => {
  await go('/flashcards');
  await page.getByTitle('Tự động lật và chuyển thẻ').click();
  await page.waitForTimeout(4100);
  assert.ok(await page.locator('.flashcard').evaluate(e => e.classList.contains('flipped')));
  await page.getByTitle('Tự động lật và chuyển thẻ').click();
  const state = await page.locator('.card-counter').innerText();
  await page.waitForTimeout(4100);
  assert.equal(await page.locator('.card-counter').innerText(), state);
  return { autoFlip: true, pauseStable: true, unmountCleanup: 'not instrumented' };
});
await step('08-quiz-complete', async () => {
  await go('/quiz');
  await page.getByRole('button', { name: '5 câu', exact: true }).click();
  await page.getByRole('button', { name: /Bắt đầu dò từ ngay/ }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('.typing-input').fill('audit_wrong_answer');
    await page.locator('.btn-submit-ans').click();
    await page.locator('.btn-next-q').click();
  }
  return { result: (await page.locator('main').innerText()).slice(-1600) };
});
await step('09-auth-ui-login', async () => {
  await go('/');
  await page.locator('#login-btn').click();
  await page.fill('#login-id', 'admin');
  await page.fill('#login-pass', '123');
  await page.locator('button[form="login-form"]').click();
  await page.locator('#user-profile-btn').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.locator('#user-profile-btn').isVisible());
  return { role: 'seed superadmin in isolated local D1', survivesReload: true };
});
for (const route of ['/cpanel/student', '/cpanel/parent', '/cpanel/teacher', '/cpanel/leader', '/cpanel/notifications', '/schedule', '/evaluations', '/admin', '/admincp']) {
  await step('10-authenticated' + route.replaceAll('/', '-'), async () => {
    assert.ok(await page.locator('#user-profile-btn').isVisible(), 'authenticated route audit requires successful UI login');
    const responses = [];
    const listener = r => { if (r.url().includes('/api/')) responses.push({ path: new URL(r.url()).pathname, status: r.status() }); };
    page.on('response', listener);
    await go(route);
    const detail = { headings: await page.locator('main h1,main h2').allTextContents(), buttons: (await page.locator('main button').allTextContents()).map(s => s.trim()).filter(Boolean).slice(0, 35), responses };
    page.off('response', listener);
    return detail;
  });
}
await browser.close();
