import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});
const results = [];

async function auditViewport(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/flashcards`, { waitUntil: 'networkidle' });
  await page.locator('.flip-main').click();
  await page.waitForTimeout(700);
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.card-container').getBoundingClientRect();
    const controls = document.querySelector('.deck-controls').getBoundingClientRect();
    const footer = document.querySelector('footer').getBoundingClientRect();
    const back = document.querySelector('.card-back');
    return {
      theme: document.documentElement.className,
      cardBottom: card.bottom,
      controlsTop: controls.top,
      controlsBottom: controls.bottom,
      footerTop: footer.top,
      backVisible: getComputedStyle(back).visibility,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  assert.equal(layout.backVisible, 'visible');
  assert.ok(layout.controlsTop >= layout.cardBottom - 1, `controls overlap card at ${width}px`);
  assert.ok(layout.footerTop >= layout.controlsBottom - 1, `footer overlaps controls at ${width}px`);
  assert.ok(layout.overflowX <= 1, `horizontal overflow ${layout.overflowX}px at ${width}px`);

  await page.evaluate(() => localStorage.setItem('tienganh_theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  const forcedLight = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('tienganh_theme'),
    colorScheme: getComputedStyle(document.documentElement).colorScheme
  }));
  assert.equal(forcedLight.dark, false);
  assert.equal(forcedLight.stored, 'sky');
  assert.equal(forcedLight.colorScheme, 'light');
  assert.deepEqual(errors, []);
  results.push({ route: '/flashcards', viewport: `${width}x${height}`, layout, forcedLight });
  await page.close();
}

await auditViewport(390, 844);
await auditViewport(1440, 900);

const evalPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await evalPage.goto(`${base}/evaluations`, { waitUntil: 'networkidle' });
const evaluateButton = evalPage.getByRole('button', { name: 'Đánh Giá', exact: true }).first();
if (await evaluateButton.count()) {
  await evaluateButton.click();
  const modal = evalPage.locator('[role="dialog"]');
  await modal.waitFor();
  const modalAudit = await modal.evaluate(element => {
  const rect = element.getBoundingClientRect();
  const close = element.querySelector('[aria-label="Đóng bảng đánh giá"]');
  const input = element.querySelector('textarea');
  return {
    top: rect.top,
    bottom: rect.bottom,
    viewportHeight: innerHeight,
    closeVisible: Boolean(close && close.getBoundingClientRect().width > 0),
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    inputBackground: getComputedStyle(input).backgroundColor,
    inputColor: getComputedStyle(input).color
  };
  });
  assert.ok(modalAudit.top >= 0 && modalAudit.bottom <= modalAudit.viewportHeight);
  assert.equal(modalAudit.closeVisible, true);
  assert.equal(modalAudit.background, 'rgb(255, 255, 255)');
  await evalPage.getByRole('button', { name: 'Đóng bảng đánh giá' }).click();
  assert.equal(await modal.count(), 0);
  results.push({ route: '/evaluations', viewport: '390x844', modalAudit });
} else {
  results.push({ route: '/evaluations', skipped: 'local preview has no authenticated staff fixture; covered by source contract' });
}

await browser.close();
console.log(JSON.stringify({ success: true, results }, null, 2));
