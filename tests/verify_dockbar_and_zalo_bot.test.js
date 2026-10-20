import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('Top menu bar is removed on desktop/tablet (md:hidden) and unified into DockBar', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'src/routes/+layout.svelte'), 'utf8');
  assert.match(
    layout,
    /<header class="md:hidden sticky top-0/,
    'Top header must be hidden on desktop/tablet (md:hidden) so DockBar is the sole navigation bar'
  );
  assert.match(layout, /<DockBar/, 'Layout must render unified <DockBar />');
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

test('Zalo Bot Token (2267052943606876676:...) is wired across unifiedStore, /admin, /schedule, and /api/session-audit', () => {
  const token = '2267052943606876676:BohTEeIARkSRcUEqfZLDnvxEjSwPVyNSujkIEWeAYRXoCCljFJwYXhhkDbGIUVwd';
  const store = fs.readFileSync(path.join(ROOT, 'src/lib/unifiedStore.js'), 'utf8');
  const adminPage = fs.readFileSync(path.join(ROOT, 'src/routes/admin/+page.svelte'), 'utf8');
  const schedulePage = fs.readFileSync(path.join(ROOT, 'src/routes/schedule/+page.svelte'), 'utf8');
  const apiAudit = fs.readFileSync(path.join(ROOT, 'src/routes/api/session-audit/+server.js'), 'utf8');

  assert.ok(store.includes(token), 'unifiedStore.js must include connected Zalo Bot token');
  assert.match(store, /action:\s*'dispatch_bot_message'/, 'dispatchBotReport must call server-side dispatch_bot_message');
  assert.ok(adminPage.includes(token), 'admin/+page.svelte must prefill connected Zalo Bot token');
  assert.match(adminPage, /admin-zalo-bot-verified-card/, 'admin/+page.svelte Tab 6 must display verified Zalo Bot card');
  assert.match(schedulePage, /schedule-zalo-bot-status-pill/, 'schedule/+page.svelte must display Zalo Bot connected status pill');
  assert.ok(apiAudit.includes(token), 'api/session-audit/+server.js must include default Zalo Bot token');
});
