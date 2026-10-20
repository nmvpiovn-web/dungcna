import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('TopBar has Global Search Box and Right Status Group, while DockBar has no duplicate Cô Dung tile', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'src/routes/+layout.svelte'), 'utf8');
  const dock = fs.readFileSync(path.join(ROOT, 'src/lib/components/ui/DockBar.svelte'), 'utf8');

  assert.match(layout, /data-testid="global-topbar"/, 'Layout must render sticky Global TopBar');
  assert.match(layout, /data-testid="global-search-input"/, 'TopBar must include Global Search Input');
  assert.match(layout, /data-testid="topbar-status-group"/, 'TopBar must include Right-Side Status Group');
  assert.doesNotMatch(layout, /data-testid="top-dock-nav"/, 'TopBar must not duplicate navigation links');

  assert.doesNotMatch(dock, /itemRefs\['brand'\]/, 'DockBar must not have redundant Cô Dung brand tile');
  assert.doesNotMatch(dock, /ThemeSwitcher/, 'DockBar must not contain right-side status group');
  assert.match(dock, /id:\s*'home'/, 'DockBar must start cleanly with Trang Chủ item');
});

test('DockBar.svelte has 3D sculpted borders (border-2) and smooth Zoom In-Out physics', () => {
  const dock = fs.readFileSync(path.join(ROOT, 'src/lib/components/ui/DockBar.svelte'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/app.css'), 'utf8');

  assert.match(dock, /dockbar-shell/, 'DockBar must use .dockbar-shell');
  assert.match(dock, /dockbar-tile-icon/, 'DockBar items must use 3D bordered .dockbar-tile-icon');
  assert.match(dock, /border-2/, 'DockBar tiles must have distinct border-2');
  assert.match(dock, /function getItemTransform\(id\)/, 'DockBar must compute proximity Zoom In-Out transform');
  assert.match(dock, /scale\(\{tf\.scale\}\)/, 'DockBar items must apply dynamic scale(tf.scale)');
  assert.match(css, /border:\s*2\.5px solid rgb\(var\(--brand-600-rgb\)/, 'app.css must define sculpted border on .dockbar-shell');
});

test('Zero navy backgrounds (bg-slate-900/950/800, bg-indigo-900/950, #0f172a, #1e293b) exist anywhere in src/', () => {
  const navyRegex = /(bg-(?:slate|indigo|blue|sky|cyan|cx|stone|zinc|gray)-(?:800|900|950)|from-(?:slate|indigo|blue|sky|cyan|cx|stone|zinc|gray)-(?:800|900|950)|to-(?:slate|indigo|blue|sky|cyan|cx|stone|zinc|gray)-(?:800|900|950)|background:\s*#(?:0f172a|1e293b))/i;

  function walk(dir) {
    const hits = [];
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) hits.push(...walk(p));
      else if (/\.(svelte|css|js)$/.test(f.name)) {
        const content = fs.readFileSync(p, 'utf8');
        if (navyRegex.test(content)) hits.push(path.relative(ROOT, p));
      }
    }
    return hits;
  }

  const hits = walk(path.join(ROOT, 'src'));
  assert.deepEqual(hits, [], `Expected zero navy backgrounds in src/, but found in: ${hits.join(', ')}`);
});

test('Zalo Bot Token (2267052943606876676:...) and timbk.io.vn webhook are wired with zero grokbot', () => {
  const token = '2267052943606876676:BohTEeIARkSRcUEqfZLDnvxEjSwPVyNSujkIEWeAYRXoCCljFJwYXhhkDbGIUVwd';
  const store = fs.readFileSync(path.join(ROOT, 'src/lib/unifiedStore.js'), 'utf8');
  const adminPage = fs.readFileSync(path.join(ROOT, 'src/routes/admin/+page.svelte'), 'utf8');
  const schedulePage = fs.readFileSync(path.join(ROOT, 'src/routes/schedule/+page.svelte'), 'utf8');
  const apiAudit = fs.readFileSync(path.join(ROOT, 'src/routes/api/session-audit/+server.js'), 'utf8');
  const webhooksJson = fs.readFileSync(path.join(ROOT, 'src/lib/data/webhooks.json'), 'utf8');

  assert.ok(store.includes(token), 'unifiedStore.js must include connected Zalo Bot token');
  assert.ok(adminPage.includes(token), 'admin/+page.svelte must prefill connected Zalo Bot token');
  assert.match(schedulePage, /schedule-zalo-bot-status-pill/, 'schedule/+page.svelte must display Zalo Bot connected status pill');
  assert.ok(apiAudit.includes(token), 'api/session-audit/+server.js must include default Zalo Bot token');
  assert.ok(!webhooksJson.includes('grokbot'), 'webhooks.json must not reference grokbot');
  assert.ok(!store.includes('grokbot'), 'unifiedStore.js must not reference grokbot');
  assert.ok(!adminPage.includes('grokbot'), 'admin/+page.svelte must not reference grokbot');
  assert.ok(webhooksJson.includes('https://timbk.io.vn/api/zalo-bot/webhook'), 'webhooks.json must point to timbk.io.vn');
});
