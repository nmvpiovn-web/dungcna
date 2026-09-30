import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = process.env.BASE_URL || 'https://timbk.io.vn';
const outputDir = process.env.OUTPUT_DIR || 'artifacts/master-plan-7/baseline';
const routes = ['/', '/flashcards', '/dictionary', '/grammar', '/exam', '/games', '/evaluations', '/courses'];
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 }
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
});
const results = [];

for (const viewport of viewports) {
  for (const route of routes) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    const slug = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-');
    const screenshot = `${outputDir}/${slug}-${viewport.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const interactive = [...document.querySelectorAll('a,button,input,select,textarea')].filter(visible);
      const tinyTargets = interactive.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      });
      const fixed = [...document.querySelectorAll('header,[class*="fixed"],[class*="sticky"]')]
        .filter(visible)
        .map(element => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, text: element.textContent.trim().slice(0, 80), top: rect.top, bottom: rect.bottom };
        });
      return {
        title: document.title,
        width: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        headings: document.querySelectorAll('h1,h2,h3').length,
        cards: document.querySelectorAll('article,[class*="card"],.rounded-xl,.rounded-2xl').length,
        links: document.querySelectorAll('a').length,
        buttons: document.querySelectorAll('button').length,
        interactive: interactive.length,
        tinyTargets: tinyTargets.length,
        fixed
      };
    });
    if (viewport.name === 'mobile') {
      const menu = page.locator('#mobile-menu-btn');
      metrics.mobileMenuButton = await menu.count();
      if (await menu.count()) {
        await menu.click();
        metrics.mobileDrawerVisible = await page.locator('#mobile-drawer').isVisible();
        metrics.mobileDrawerLinks = await page.locator('#mobile-drawer a').count();
      }
    }
    results.push({ route, viewport: viewport.name, screenshot, errors, ...metrics });
    await page.close();
  }
}

await browser.close();
await fs.writeFile(`${outputDir}/metrics.json`, JSON.stringify({ base, generatedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify({ base, outputDir, cases: results.length, failures: results.filter(r => r.errors.length || r.overflowX > 1).length }, null, 2));
