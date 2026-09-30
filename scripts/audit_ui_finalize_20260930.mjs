import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = 'artifacts/audit-ui-20260930', base = 'http://127.0.0.1:4173';
const results = {};
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.goto(base + '/flashcards', { waitUntil: 'networkidle' });
const geometry = () => page.evaluate(() => Object.fromEntries(['.flashcard', '.card-front', '.card-back'].map(s => {
  const e = document.querySelector(s), r = e.getBoundingClientRect(), c = getComputedStyle(e);
  return [s, { y: r.y, height: r.height, display: c.display, visibility: c.visibility, position: c.position, transform: c.transform, backfaceVisibility: c.backfaceVisibility, class: e.className }];
})));
results.flipBefore = await geometry();
await page.locator('.flip-main').click(); await page.waitForTimeout(700);
results.flipAfter = await geometry();
await page.screenshot({ path: `${dir}/flashcard-desktop-flipped.png`, fullPage: true });
await page.setViewportSize({ width: 360, height: 800 }); await page.goto(base + '/', { waitUntil: 'networkidle' });
results.mobileOverflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, candidates: [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, text: e.textContent?.trim().slice(0, 40), class: String(e.className).slice(0, 100), right: e.getBoundingClientRect().right, width: e.getBoundingClientRect().width, position: getComputedStyle(e).position })).filter(e => e.right > innerWidth && e.width > 0).slice(-12) }));
await browser.close();
const db = new DatabaseSync('C:/Users/admin/AppData/Local/Temp/tienganh7-audit-20260930/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite', { readOnly: true });
results.schema = {};
for (const name of ['users', 'homework_assignments', 'homework_submissions', 'student_evaluations', 'teacher_salary_advances', 'salary_transactions', 'exam_attempts']) results.schema[name] = db.prepare(`PRAGMA table_info(${name})`).all().map(r => r.name);
db.close();
results.authenticatedEndpoints = [];
for (const username of ['teacher.john', 'phuhuynh']) {
  const response = await fetch(base + '/api/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: '123' }) });
  const { token } = await response.json();
  for (const path of username === 'phuhuynh' ? ['/api/parents/children', '/api/homework', '/api/campuses'] : ['/api/homework', '/api/teachers/workflows?type=all', '/api/teachers/payroll?billing_cycle=2026-09', '/api/campuses']) {
    const r = await fetch(base + path, { headers: { authorization: `Bearer ${token}` } });
    const data = await r.json(); results.authenticatedEndpoints.push({ role: username === 'phuhuynh' ? 'parent' : 'teacher', path, status: r.status, error: data.error });
  }
}
results.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
results.workingTree = execFileSync('git', ['status', '--short'], { encoding: 'utf8' });
fs.writeFileSync(`${dir}/final-verification.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
