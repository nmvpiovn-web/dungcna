import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.QA_BASE || 'https://timbk.io.vn';
const password = process.env.QA_PASSWORD;
const accounts = [
  ['teacher', process.env.QA_TEACHER_USER],
  ['leader', process.env.QA_LEADER_USER]
];

if (!password || accounts.some(([, username]) => !username)) {
  throw new Error('QA_PASSWORD, QA_TEACHER_USER and QA_LEADER_USER are required');
}

const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const output = path.resolve('artifacts', 'production-smoke', runId);
fs.mkdirSync(output, { recursive: true });

const results = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});

async function run(id, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    results.push({ id, status: 'PASS', durationMs: Date.now() - startedAt, detail });
  } catch (error) {
    results.push({ id, status: 'FAIL', durationMs: Date.now() - startedAt, error: error.message });
  }
}

try {
  await run('public-modules', async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const modules = [];
    for (const route of ['/', '/flashcards', '/dictionary', '/exam']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      modules.push({ route, status: response?.status(), title: await page.title() });
      assert.ok(response?.ok(), `${route} returned HTTP ${response?.status()}`);
    }
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: path.join(output, 'public-exam.png'), fullPage: false });
    await context.close();
    return { modules };
  });

  await run('mobile-overflow', async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    const page = await context.newPage();
    const checks = [];
    for (const route of ['/flashcards', '/dictionary', '/exam']) {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      const size = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
      checks.push({ route, ...size });
      assert.ok(size.scrollWidth <= size.innerWidth + 1, `${route} overflows at 320px: ${size.scrollWidth}`);
    }
    await page.screenshot({ path: path.join(output, 'mobile-exam.png'), fullPage: false });
    await context.close();
    return { checks };
  });

  for (const [role, username] of accounts) {
    await run(`${role}-login-and-read`, async () => {
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('#login-btn').click();
      await page.locator('#login-id').fill(username);
      await page.locator('#login-pass').fill(password);
      await page.locator('button[form="login-form"]').click();
      await page.locator('#user-profile-btn').waitFor({ timeout: 10000 });
      const profileText = (await page.locator('#user-profile-btn').innerText()).replace(/\s+/g, ' ').trim();
      const routes = role === 'teacher' ? ['/schedule', '/evaluations', '/cpanel/teacher'] : ['/schedule', '/evaluations', '/admincp'];
      const pages = [];
      for (const route of routes) {
        const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
        pages.push({ route, status: response?.status(), heading: await page.locator('h1, h2').first().innerText().catch(() => '') });
        assert.ok(response?.ok(), `${route} returned HTTP ${response?.status()}`);
      }
      assert.deepEqual(pageErrors, []);
      await page.screenshot({ path: path.join(output, `${role}.png`), fullPage: false });
      await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('#user-profile-btn').click();
      await page.locator('#logout-btn').click();
      await page.locator('#login-btn').waitFor({ timeout: 10000 });
      await context.close();
      return { profileText, pages, loggedOut: true };
    });
  }
} finally {
  await browser.close();
}

const summary = {
  base,
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((item) => item.status === 'PASS').length,
  failed: results.filter((item) => item.status === 'FAIL').length,
  results
};
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ output, ...summary }, null, 2));
process.exitCode = summary.failed ? 1 : 0;
