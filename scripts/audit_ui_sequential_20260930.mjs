import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = 'http://127.0.0.1:4173';
const dir = 'artifacts/audit-ui-20260930';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const routes = ['/', '/courses', '/dictionary', '/grammar', '/flashcards', '/quiz', '/games', '/exam', '/tools', '/pedagogy', '/second-brain', '/recruitment', '/cpanel/student', '/cpanel/parent', '/cpanel/teacher', '/cpanel/leader', '/cpanel/notifications', '/schedule', '/evaluations', '/admin', '/admincp'];
const results = [];
for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [], failedRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failedRequests.push({ path: r.url().slice(base.length), status: r.status() }); });
  page.on('dialog', d => d.dismiss());
  const result = { route, errors, failedRequests };
  try {
    const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
    result.status = response.status();
    result.title = await page.title();
    result.headings = await page.locator('h1,h2').allTextContents();
    result.buttons = (await page.locator('main button').allTextContents()).map(x => x.trim()).filter(Boolean).slice(0, 30);
    result.text = (await page.locator('main').innerText().catch(() => page.locator('body').innerText())).slice(0, 1800);
    result.desktopOverflow = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    result.mobileOverflow = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2) && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(e => ({ tag: e.tagName, class: String(e.className).slice(0, 90) })) }));
    result.screenshot = `${dir}/${route.replaceAll('/', '_') || 'home'}-360.png`;
    await page.screenshot({ path: result.screenshot, fullPage: false });
  } catch (e) { result.failure = e.message; }
  results.push(result);
  fs.writeFileSync(`${dir}/route-smoke.json`, JSON.stringify({ generatedAt: new Date().toISOString(), base, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'guest route rendering only; not full functional acceptance', results }, null, 2));
  console.log(JSON.stringify({ route, status: result.status, errors, failedRequests, desktop: result.desktopOverflow, mobile: result.mobileOverflow, failure: result.failure }));
  await context.close();
}
await browser.close();
